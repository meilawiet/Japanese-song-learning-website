import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildPatch, readManifest, listFiles, hashFile } = require('../desktop/updateCore.cjs')
const root = process.cwd()
const baseline = path.resolve(process.argv[2] || path.join(root, 'work', 'update-base', 'UTA-Windows-x64'))
const target = path.resolve(process.argv[3] || path.join(root, 'release', 'UTA-Windows-x64'))
const output = path.resolve(process.argv[4] || path.join(root, 'release'))
const current = JSON.parse(await fs.readFile(path.join(target, 'current.json'), 'utf8')).version
if (baseline === target) throw new Error('Baseline and target must be separate folders')
const oldPointer = path.join(baseline, 'current.json')
try { await fs.access(oldPointer) }
catch { console.log('Previous release predates the versioned updater; first upgrade requires a full ZIP.'); process.exit(0) }
const previous = JSON.parse(await fs.readFile(oldPointer, 'utf8')).version
const baseVersion = path.join(baseline, 'versions', previous)
const targetVersion = path.join(target, 'versions', current)
for (const folder of [baseVersion, targetVersion]) {
  const manifest = await readManifest(folder)
  const files = await listFiles(folder)
  if (files.length !== manifest.files.length || files.some((file, index) =>
    file.path !== manifest.files[index].path || file.sha256 !== manifest.files[index].sha256 || file.size !== manifest.files[index].size)) {
    throw new Error(`Release baseline does not match manifest: ${folder}`)
  }
}
await fs.mkdir(output, { recursive: true })
const filename = `UTA-${previous}-to-${current}-Windows-x64.utapatch`
const patch = path.join(output, filename)
const result = await buildPatch(baseVersion, targetVersion, patch)
const checksum = await hashFile(patch)
await fs.writeFile(patch + '.sha256', `${checksum}  ${filename}\n`)
console.log(`Incremental package: ${filename} (${(result.bytes / 1048576).toFixed(1)} MiB, ${result.changedFiles} changed files)`)
