import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildPatch, writeManifest, unpackPatch, hashFile, readPatch } = require('../desktop/updateCore.cjs')
const { pickRelease } = require('../desktop/updateRuntime.cjs')
const temporaryRoot = path.join(process.cwd(), 'work', 'tmp')
await fs.mkdir(temporaryRoot, { recursive: true })

test('Windows incremental patch preserves unchanged files and reconstructs changed data', async () => {
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'uta-update-test-'))
  try {
    const base = path.join(root, 'base'), target = path.join(root, 'target'), stage = path.join(root, 'stage')
    await fs.mkdir(path.join(base, 'app'), { recursive: true })
    await fs.mkdir(path.join(target, 'app'), { recursive: true })
    const original = Buffer.alloc(256 * 1024, 67)
    const modified = Buffer.from(original)
    modified.fill(70, 64 * 1024, 65 * 1024)
    await fs.writeFile(path.join(base, 'app', 'UTA.exe'), original)
    await fs.writeFile(path.join(base, 'dictionary.db'), 'unchanged dictionary')
    await fs.writeFile(path.join(target, 'app', 'UTA.exe'), modified)
    await fs.writeFile(path.join(target, 'dictionary.db'), 'unchanged dictionary')
    await fs.writeFile(path.join(target, 'new.txt'), 'new release')
    await writeManifest(base, '1.1.29')
    await writeManifest(target, '1.1.30')
    const patch = path.join(root, 'update.utapatch')
    const result = await buildPatch(base, target, patch)
    assert.equal(result.changedFiles, 2)
    const header = (await readPatch(patch)).header
    assert.equal(header.operations.find(item => item.path === 'app/UTA.exe').kind, 'chunks')
    await unpackPatch(base, patch, stage)
    assert.equal(await hashFile(path.join(stage, 'app', 'UTA.exe')), await hashFile(path.join(target, 'app', 'UTA.exe')))
    assert.equal(await fs.readFile(path.join(stage, 'dictionary.db'), 'utf8'), 'unchanged dictionary')
    assert.equal(await fs.readFile(path.join(stage, 'new.txt'), 'utf8'), 'new release')
    assert.equal((await fs.readdir(root)).includes('uta-data'), false)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('modified old file is rejected before it can become a new version', async () => {
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'uta-update-test-'))
  try {
    const base = path.join(root, 'base'), target = path.join(root, 'target')
    await fs.mkdir(base); await fs.mkdir(target)
    await fs.writeFile(path.join(base, 'unchanged.txt'), 'safe')
    await fs.writeFile(path.join(target, 'unchanged.txt'), 'safe')
    await writeManifest(base, '1.1.29'); await writeManifest(target, '1.1.30')
    const patch = path.join(root, 'update.utapatch')
    await buildPatch(base, target, patch)
    await fs.writeFile(path.join(base, 'unchanged.txt'), 'changed locally')
    await assert.rejects(unpackPatch(base, patch, path.join(root, 'stage')), /本机文件已改变/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('Windows release selection ignores Android releases and requires matching delta', () => {
  const asset = (name, version) => ({ name, size: 25, browser_download_url:
    `https://github.com/meilawiet/Japanese-song-learning-website/releases/download/windows-v${version}/${name}` })
  const version = '1.1.30'
  const full = `UTA-${version}-Windows-x64.zip`, patch = `UTA-1.1.29-to-${version}-Windows-x64.utapatch`
  const releases = [
    { tag_name: 'android-v9.0.0', assets: [asset('UTA.apk', '9.0.0')] },
    { tag_name: `windows-v${version}`, assets: [asset(full, version), asset(patch, version), asset(patch + '.sha256', version)] }
  ]
  assert.equal(pickRelease(releases, '1.1.29').patch.size, 25)
  assert.equal(pickRelease(releases, '1.1.28').patch, null)
  assert.equal(pickRelease(releases, '1.1.30'), null)
})
