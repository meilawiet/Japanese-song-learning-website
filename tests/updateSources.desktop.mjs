import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import update from '../desktop/updateCore.cjs'
import sources from '../desktop/updateSources.cjs'

const root = process.cwd(), work = path.join(root, 'work'), run = promisify(execFile)
const source = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'release', 'UTA-Windows-x64')
const testDir = path.join(work, 'gitee-update-validation'), fixtures = path.join(work, 'gitee-update-fixtures-20261017'), evidence = path.join(work, 'verification')
for (const folder of [testDir, fixtures]) {
  assert.equal(path.dirname(folder), work)
  await fs.rm(folder, { recursive: true, force: true })
  await fs.mkdir(folder, { recursive: true })
}
await fs.cp(source, testDir, { recursive: true, filter: filename => path.basename(filename) !== 'uta-data' })
const temporary = path.join(testDir, 'uta-data', 'tmp')
await fs.mkdir(temporary, { recursive: true }); await fs.mkdir(evidence, { recursive: true })
const env = { ...process.env, TEMP: temporary, TMP: temporary }
delete env.ELECTRON_RUN_AS_NODE
const current = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version
const later = offset => { const parts = current.split('.').map(Number); parts[2] += offset; return parts.join('.') }
const restartVersion = later(1), runtime = '44.5.1', base = path.join(testDir, 'versions', current)
const url = (provider, version, name) => {
  const item = sources.PROVIDERS.find(item => item.id === provider)
  return `https://${item.host}/${item.repository}/releases/download/windows-v${version}/${name}`
}
async function tinyFixture(version) {
  const target = path.join(fixtures, version)
  await fs.mkdir(path.join(target, 'app'), { recursive: true })
  await fs.writeFile(path.join(target, 'app', 'package.json'), JSON.stringify({ version }))
  await fs.writeFile(path.join(target, 'proof.txt'), 'Original fixture for ' + version)
  await update.writeManifest(target, version, runtime)
  const archive = path.join(fixtures, version + '.zip')
  const script = "import sys,zipfile;from pathlib import Path;root=Path(sys.argv[1]);z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED);[(z.write(p,'UTA-Windows-x64/versions/'+sys.argv[3]+'/'+p.relative_to(root).as_posix())) for p in root.rglob('*') if p.is_file()];z.close()"
  await run(path.join(root, 'server', '.venv', 'Scripts', 'python.exe'), ['-B', '-c', script, target, archive, version], { windowsHide: true, env })
  const patch = path.join(fixtures, version + '.utapatch')
  await update.buildPatch(base, target, patch)
  return { full: await fs.readFile(archive), patch: await fs.readFile(patch) }
}
async function realPatch() {
  const target = path.join(fixtures, 'restart-target')
  for (const file of (await update.readManifest(base)).files) {
    const destination = path.join(target, file.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    if (file.path === 'app/package.json') await fs.writeFile(destination, JSON.stringify({ ...JSON.parse(await fs.readFile(path.join(base, file.path))), version: restartVersion }, null, 2))
    else await fs.link(path.join(base, file.path), destination)
  }
  await update.writeManifest(target, restartVersion, runtime)
  const patch = path.join(fixtures, 'restart.utapatch')
  await update.buildPatch(base, target, patch)
  return { patch: await fs.readFile(patch), full: Buffer.from('unused full package') }
}
function routes(version, content, options = {}) {
  const result = [], full = `UTA-${version}-Windows-x64.zip`, patch = `UTA-${current}-to-${version}-Windows-x64.utapatch`
  const response = (request, body, status = 200, type = 'application/octet-stream') => result.push({ url: request, body: Buffer.from(body).toString('base64'), status, type })
  for (const provider of sources.PROVIDERS) {
    if (provider.id === 'gitee' && options.metadataFailure) { response(provider.api, '', 503); continue }
    const assets = []
    const add = (name, body, status = 200) => {
      assets.push({ name, size: body.length, browser_download_url: url(provider.id, version, name) })
      response(url(provider.id, version, name), body, status)
    }
    if (provider.id === 'gitee' && options.split) {
      const midpoint = Math.floor(content.full.length / 2)
      add(full + '.001', content.full.subarray(0, midpoint))
      add(full + '.002', content.full.subarray(midpoint), options.partFailure ? 503 : 200)
    } else add(full, content.full)
    add(full + '.sha256', Buffer.from(`${update.sha256(content.full)}  ${full}\n`))
    if (options.incremental) {
      const payload = Buffer.from(content.patch)
      if (provider.id === 'gitee' && options.corrupt) payload[payload.length - 1] ^= 0xff
      add(patch, payload)
      add(patch + '.sha256', Buffer.from(`${update.sha256(content.patch)}  ${patch}\n`))
    }
    const release = { tag_name: 'windows-v' + version, assets, body: '原创更新验证，不调用付费 AI。' }
    if (provider.id === 'gitee' && options.delayed) release.tag_name = `windows-v${current}`
    response(provider.api, JSON.stringify([release]), 200, 'application/json')
  }
  return result
}
let app, page
const errors = [], checks = []
async function launch() {
  app = await electron.launch({ executablePath: path.join(testDir, 'UTA.exe'), env, timeout: 90000 })
  page = await app.firstWindow({ timeout: 90000 }); page.on('pageerror', error => errors.push(error.message))
  await page.locator('.desktop-shell').waitFor()
}
async function configure(mockRoutes) {
  await app.evaluate((_electron, routes) => {
    globalThis.__updateRoutes = routes; globalThis.__updateRequests = []
    if (!globalThis.__originalUpdateFetch) {
      globalThis.__originalUpdateFetch = globalThis.fetch
      globalThis.fetch = async (input, options) => {
        const url = String(input)
        if (url.startsWith('https://gitee.com/') || url.startsWith('https://api.github.com/') || url.startsWith('https://github.com/')) {
          globalThis.__updateRequests.push(url)
          const route = globalThis.__updateRoutes.find(route => route.url === url)
          return route ? new Response(Buffer.from(route.body, 'base64'), { status: route.status, headers: { 'Content-Type': route.type } }) : new Response('', { status: 404 })
        }
        return globalThis.__originalUpdateFetch(input, options)
      }
    }
  }, mockRoutes)
}
async function prepare(version, expectedProvider, expectedMode) {
  const settings = page.locator('.desktop-update-settings')
  await settings.getByRole('button', { name: '检查更新', exact: true }).click()
  await settings.getByRole('heading', { name: `发现新版 ${version}`, exact: true }).waitFor()
  const release = await page.evaluate(() => window.utaDesktop.getUpdateStatus())
  assert.equal(release.busy, false)
  assert.match(await settings.locator('.desktop-update-result').innerText(), expectedMode === 'incremental' ? /优先使用增量包/ : /下载完整包自动更新/)
  await settings.getByRole('button', { name: '下载并校验', exact: true }).click()
  await settings.getByRole('button', { name: '退出 UTA、安装并重新打开', exact: true }).waitFor({ timeout: 60000 })
  const state = await page.evaluate(() => window.utaDesktop.getUpdateStatus())
  assert.equal(state.prepared.version, version); assert.equal(state.prepared.provider, expectedProvider)
  await update.verifyVersion(path.join(testDir, 'versions', version), version, runtime)
  assert.equal(JSON.parse(await fs.readFile(path.join(testDir, 'current.json'))).version, current)
  return app.evaluate(() => globalThis.__updateRequests)
}
async function stopTestApp() {
  const command = "$expected=[IO.Path]::GetFullPath($env:UTA_UPDATE_TEST_EXE);$boundary=[IO.Path]::GetFullPath($env:UTA_UPDATE_TEST_WORK)+'\\';if(-not $expected.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Not a test app'};Get-Process -Name UTA -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $expected} | Stop-Process -Force"
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, env: { ...process.env, UTA_UPDATE_TEST_EXE: path.join(testDir, 'UTA.exe'), UTA_UPDATE_TEST_WORK: work } }).catch(error => { if (error.code !== 1) throw error })
}
try {
  await launch()
  const marker = path.join(testDir, 'uta-data', 'preserve-learning.json')
  await fs.writeFile(marker, '{"original":"learning data"}')
  await page.evaluate(async () => {
    localStorage.setItem('gitee-update-progress-marker', 'original learning progress')
    await window.utaDesktop.saveCredential('fake-update-test-key')
    await window.utaDesktop.saveCloseBehavior({ behavior: 'tray' })
  })
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('dialog', { name: '设置', exact: true }).locator('.settings-tabs').getByRole('button', { name: '关于', exact: true }).click()
  const scenarios = [
    { version: later(2), incremental: true, provider: 'Gitee', check: 'gitee-incremental-priority' },
    { version: later(3), incremental: true, corrupt: true, provider: 'GitHub', check: 'corrupt-gitee-patch-falls-back-to-github' },
    { version: later(4), split: true, provider: 'Gitee', check: 'gitee-full-splits-merge-and-verify-in-app' },
    { version: later(5), metadataFailure: true, provider: 'GitHub', check: 'gitee-api-failure-falls-back-to-github' },
    { version: later(6), delayed: true, provider: 'GitHub', check: 'delayed-gitee-cannot-hide-latest-github' },
    { version: later(7), split: true, partFailure: true, provider: 'GitHub', check: 'gitee-part-failure-falls-back-to-github-full-zip' },
  ]
  for (const scenario of scenarios) {
    await configure(routes(scenario.version, await tinyFixture(scenario.version), scenario))
    const requests = await prepare(scenario.version, scenario.provider, scenario.incremental ? 'incremental' : 'full')
    if (scenario.provider === 'Gitee') assert.equal(requests.some(request => request.startsWith('https://github.com/')), false)
    if (scenario.split && !scenario.partFailure) assert.ok(requests.findIndex(request => request.endsWith('.001')) < requests.findIndex(request => request.endsWith('.002')))
    if (scenario.partFailure || scenario.corrupt) assert.ok(requests.some(request => request.startsWith('https://github.com/')))
    assert.equal(await fs.readFile(marker, 'utf8'), '{"original":"learning data"}')
    checks.push(scenario.check)
  }
  await configure(routes(restartVersion, await realPatch(), { incremental: true, corrupt: true }))
  await prepare(restartVersion, 'GitHub', 'incremental')
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(path.join(evidence, 'gitee-update-ready.png'), Buffer.from(png, 'base64'))
  await page.getByRole('button', { name: '退出 UTA、安装并重新打开', exact: true }).click().catch(error => { if (!/closed|destroyed/i.test(error.message)) throw error })
  app = null
  const deadline = Date.now() + 60000
  let healthy = false
  while (Date.now() < deadline) {
    const currentVersion = JSON.parse(await fs.readFile(path.join(testDir, 'current.json'))).version
    const pending = await fs.access(path.join(testDir, 'uta-data', 'updates', 'pending.json')).then(() => true).catch(() => false)
    if (currentVersion === restartVersion && !pending) { healthy = true; break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.equal(healthy, true, 'Online update must restart and confirm healthy even with the tray default')
  await stopTestApp(); await launch()
  assert.equal(await page.evaluate(() => localStorage.getItem('gitee-update-progress-marker')), 'original learning progress')
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'fake-update-test-key')
  assert.equal((await page.evaluate(() => window.utaDesktop.loadCloseBehavior())).behavior, 'tray')
  assert.equal(await fs.readFile(marker, 'utf8'), '{"original":"learning data"}')
  checks.push('online-fallback-install-and-health-confirmed-restart', 'learning-marker-profile-credential-and-tray-preference-preserved')
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(evidence, 'gitee-update-desktop.json'), JSON.stringify({ passed: true, checks }, null, 2))
  console.log(JSON.stringify({ passed: true, checks }))
} finally { if (app) await app.close().catch(() => {}); await stopTestApp() }
