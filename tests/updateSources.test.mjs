import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import sources from '../desktop/updateSources.cjs'
import update from '../desktop/updateCore.cjs'

const version = '1.2.5', full = `UTA-${version}-Windows-x64.zip`, patch = `UTA-1.2.4-to-${version}-Windows-x64.utapatch`
const temporary = path.join(process.cwd(), 'work', 'tmp')
await fs.mkdir(temporary, { recursive: true })
const url = (provider, name, releaseVersion = version) => {
  const source = sources.PROVIDERS.find(item => item.id === provider)
  return `https://${source.host}/${source.repository}/releases/download/windows-v${releaseVersion}/${name}`
}
function release(provider, { releaseVersion = version, split = false, withPatch = true } = {}) {
  const fullName = `UTA-${releaseVersion}-Windows-x64.zip`
  const names = [...(split ? [fullName + '.001', fullName + '.002'] : [fullName]), fullName + '.sha256', ...(withPatch ? [patch, patch + '.sha256'] : [])]
  return { tag_name: 'windows-v' + releaseVersion, assets: names.map(name => ({ name, size: 50, browser_download_url: url(provider, name, releaseVersion) })) }
}
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
async function fixture() {
  const folder = await fs.mkdtemp(path.join(temporary, 'update-sources-'))
  const filename = path.join(folder, full), content = Buffer.from('verified original update payload')
  const digest = update.sha256(content), calls = []
  const candidates = ['gitee', 'github'].map(provider => ({ name: full, provider, url: url(provider, full), size: content.length, checksumUrl: url(provider, full + '.sha256') }))
  const standard = request => {
    calls.push(request)
    return request.endsWith('.sha256') ? new Response(`${digest}  ${full}\n`) : new Response(content, { headers: { 'Content-Length': String(content.length) } })
  }
  return { folder, filename, content, digest, calls, candidates, standard, cleanup: () => fs.rm(folder, { recursive: true, force: true }) }
}
test('same-version mirrors prefer Gitee for both full and matching incremental downloads', async () => {
  const result = await sources.checkSources('1.2.4', { fetchImpl: async request => json([release(request.includes('gitee.com') ? 'gitee' : 'github', { split: request.includes('gitee.com') })]) })
  assert.equal(result.release.version, version)
  assert.deepEqual(result.release.fullCandidates.map(item => item.provider), ['gitee', 'github'])
  assert.deepEqual(result.release.patchCandidates.map(item => item.provider), ['gitee', 'github'])
  assert.equal(result.release.full.parts.length, 2)
})
test('a delayed mirror cannot hide a newer GitHub version or offer a mismatched incremental package', async () => {
  const result = await sources.checkSources('1.2.0', { fetchImpl: async request => json([release(request.includes('gitee.com') ? 'gitee' : 'github', { releaseVersion: request.includes('gitee.com') ? '1.2.4' : version })]) })
  assert.equal(result.release.version, version); assert.equal(result.release.full.provider, 'github'); assert.equal(result.release.patch, null)
})
test('either provider can discover releases alone and both failing produces an actionable error', async () => {
  for (const surviving of ['gitee', 'github']) {
    const result = await sources.checkSources('1.2.0', { fetchImpl: async request => request.includes(surviving + '.com') ? json([release(surviving)]) : new Response('', { status: 503 }) })
    assert.equal(result.release.full.provider, surviving); assert.equal(result.notices.length, 1)
  }
  await assert.rejects(sources.checkSources('1.2.0', { fetchImpl: async () => new Response('', { status: 503 }) }), /Gitee 和 GitHub/)
})
test('Gitee attachment sizes are enriched from the public API and malformed split sequences are rejected', async () => {
  const item = { ...release('gitee', { split: true }), id: 123 }
  const result = await sources.checkSources('1.2.0', { fetchImpl: async request => request.includes('attach_files') ? json(item.assets.map(asset => ({ ...asset, size: 75 }))) : request.includes('gitee.com') ? json([item]) : json([]) })
  assert.equal(result.release.full.size, 150)
  item.assets = item.assets.filter(asset => !asset.name.endsWith('.001'))
  assert.equal(sources.pickRelease([item], '1.2.0', 'gitee'), null)
  assert.equal(sources.pickRelease([{ tag_name: 'android-v9.0.0', assets: [] }], '1.2.0', 'gitee'), null)
  assert.equal(sources.validReleaseUrl('https://gitee.com/other/repo/releases/download/v1/test.zip'), false)
})
test('a successful Gitee payload and checksum never contact GitHub', async () => {
  const f = await fixture()
  try {
    const chosen = await sources.downloadFromSources(f.candidates, f.filename, () => {}, { fetchImpl: async request => f.standard(request) })
    assert.equal(chosen.provider, 'gitee'); assert.deepEqual(await fs.readFile(f.filename), f.content)
    assert.equal(f.calls.length, 2); assert.ok(f.calls.every(request => request.includes('gitee.com')))
  } finally { await f.cleanup() }
})
test('Gitee HTTP or integrity failures switch to the entire matching GitHub download and checksum', async () => {
  for (const reason of ['http', 'integrity', 'checksum']) {
    const f = await fixture()
    try {
      const progress = []
      const chosen = await sources.downloadFromSources(f.candidates, f.filename, state => progress.push(state), { fetchImpl: async request => {
        if (request.includes('gitee.com')) {
          f.calls.push(request)
          if (reason === 'http') return new Response('', { status: 503 })
          if (request.endsWith('.sha256')) return new Response(reason === 'checksum' ? 'invalid checksum' : `${f.digest}  ${full}\n`)
          return new Response(Buffer.alloc(f.content.length, 77))
        }
        return f.standard(request)
      } })
      assert.equal(chosen.provider, 'github'); assert.deepEqual(await fs.readFile(f.filename), f.content)
      assert.ok(progress.some(state => state.provider === 'GitHub' && state.switching))
    } finally { await f.cleanup() }
  }
})
test('Gitee split archives are merged in order and verified against the complete ZIP checksum', async () => {
  const f = await fixture()
  try {
    const chunks = [f.content.subarray(0, 10), f.content.subarray(10)]
    const split = { ...f.candidates[0], url: undefined, parts: chunks.map((chunk, index) => ({ url: url('gitee', full + '.00' + (index + 1)), size: chunk.length })) }
    await sources.downloadFromSources([split], f.filename, () => {}, { fetchImpl: async request => request.endsWith('.sha256') ? f.standard(request) : new Response(chunks[request.endsWith('.001') ? 0 : 1]) })
    assert.deepEqual(await fs.readFile(f.filename), f.content)
  } finally { await f.cleanup() }
})
test('official CDN redirects work while cross-host and HTTP redirects are blocked before contact', async () => {
  const f = await fixture()
  try {
    const redirects = { gitee: 'https://foruda.gitee.com/attach_file/123/package?token=public-test', github: 'https://release-assets.githubusercontent.com/package' }
    assert.equal(sources.validRedirect('https://gitee.com/mzh18392597195/uta-windows/attach_files/3406556/download/UTA.zip.sha256', 'gitee'), true)
    assert.equal(sources.validRedirect('https://gitee.com/other/repo/attach_files/3406556/download/UTA.zip.sha256', 'gitee'), false)
    for (const candidate of f.candidates) {
      const filename = path.join(f.folder, candidate.provider)
      await sources.downloadFile(candidate, filename, () => {}, { fetchImpl: async request => request === candidate.url ? new Response(null, { status: 302, headers: { Location: redirects[candidate.provider] } }) : new Response(f.content) })
      assert.deepEqual(await fs.readFile(filename), f.content)
    }
    for (const destination of ['https://attacker.example/package', 'http://foruda.gitee.com/attach_file/package', 'https://foruda.gitee.com.attacker.example/attach_file/package']) {
      let calls = 0
      const filename = path.join(f.folder, 'blocked-' + calls + Math.random())
      await assert.rejects(sources.downloadFile(f.candidates[0], filename, () => {}, { fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { Location: destination } }) } }), /不是官方地址/)
      assert.equal(calls, 1)
    }
  } finally { await f.cleanup() }
})
test('Gitee header timeout switches to GitHub instead of waiting for a whole download timeout', async () => {
  const f = await fixture()
  try {
    const chosen = await sources.downloadFromSources(f.candidates, f.filename, () => {}, { headerTimeoutMs: 20, fetchImpl: async (request, options) => {
      if (!request.includes('gitee.com')) return f.standard(request)
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }))
    } })
    assert.equal(chosen.provider, 'github')
  } finally { await f.cleanup() }
})
test('a stalled Gitee response body switches to GitHub and discards the partial download', async () => {
  const f = await fixture()
  try {
    const chosen = await sources.downloadFromSources(f.candidates, f.filename, () => {}, { idleTimeoutMs: 20, fetchImpl: async (request, options) => {
      if (!request.includes('gitee.com') || request.endsWith('.sha256')) return f.standard(request)
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array([1]))
        options.signal.addEventListener('abort', () => controller.error(new Error('idle timeout')), { once: true })
      } }))
    } })
    assert.equal(chosen.provider, 'github'); assert.deepEqual(await fs.readFile(f.filename), f.content)
  } finally { await f.cleanup() }
})
test('failed extraction is cleaned before a mirror retry, and total failure removes only owned downloads', async () => {
  const f = await fixture()
  try {
    let cleaned = 0
    await sources.downloadFromSources(f.candidates, f.filename, () => {}, { fetchImpl: async request => f.standard(request),
      prepare: async asset => { if (asset.provider === 'gitee') throw new Error('invalid archive') }, cleanup: async () => { cleaned++ } })
    assert.equal(cleaned, 1)
    await fs.writeFile(path.join(f.folder, 'preserve.txt'), 'user data')
    await assert.rejects(sources.downloadFromSources(f.candidates, f.filename, () => {}, { fetchImpl: async () => new Response('', { status: 503 }) }), /Gitee.*GitHub/)
    assert.equal(await fs.readFile(path.join(f.folder, 'preserve.txt'), 'utf8'), 'user data')
    await assert.rejects(fs.access(f.filename), { code: 'ENOENT' })
    await assert.rejects(fs.access(f.filename + '.sha256'), { code: 'ENOENT' })
  } finally { await f.cleanup() }
})
