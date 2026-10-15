import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const { writeManifest, hashFile } = require('../desktop/updateCore.cjs')
const root = process.cwd()
const packageVersion = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version
const python = path.join(root, 'server', '.venv', 'Scripts', 'python.exe')
const available = process.platform === 'win32' && await fs.stat(python).then(() => true).catch(() => false)

test('full ZIP excludes user data and extracts only the selected Windows version', { skip: !available }, async () => {
  const temporaryRoot = path.join(root, 'work', 'tmp')
  await fs.mkdir(temporaryRoot, { recursive: true })
  const temp = await fs.mkdtemp(path.join(temporaryRoot, 'uta-archive-test-'))
  try {
    const source = path.join(temp, 'source'), version = packageVersion, current = path.join(source, 'versions', version)
    await fs.mkdir(current, { recursive: true })
    await fs.writeFile(path.join(source, 'current.json'), JSON.stringify({ version }))
    await fs.writeFile(path.join(current, 'test.txt'), 'new version')
    await writeManifest(current, version, '44.5.1')
    await fs.mkdir(path.join(source, 'uta-data'), { recursive: true })
    await fs.writeFile(path.join(source, 'uta-data', 'private.txt'), 'secret')
    await fs.mkdir(path.join(source, 'versions', '1.1.28'), { recursive: true })
    await fs.writeFile(path.join(source, 'versions', '1.1.28', 'old.txt'), 'old')
    const archive = path.join(temp, 'full.zip')
    await run(python, ['-B', 'scripts/archive-windows.py'], { cwd: root,
      env: { ...process.env, UTA_PACKAGE_SOURCE: source, UTA_ARCHIVE_TARGET: archive } })
    const names = JSON.parse((await run(python, ['-c', 'import zipfile,json,sys; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', archive])).stdout)
    assert.ok(names.some(name => name.endsWith(`/versions/${version}/test.txt`)))
    assert.ok(names.every(name => !name.includes('uta-data') && !name.includes('1.1.28')))
    const extracted = path.join(temp, 'extracted')
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(root, 'desktop', 'extractVersion.ps1'), '-Archive', archive, '-Destination', extracted, '-Version', version])
    assert.equal(await hashFile(path.join(extracted, 'test.txt')), await hashFile(path.join(current, 'test.txt')))
    assert.equal(await fs.readFile(path.join(extracted, 'manifest.json'), 'utf8'), await fs.readFile(path.join(current, 'manifest.json'), 'utf8'))
  } finally { await fs.rm(temp, { recursive: true, force: true }) }
})
