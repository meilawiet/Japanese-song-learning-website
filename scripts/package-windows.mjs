import fs from 'node:fs/promises'
import path from 'node:path'
import { rcedit } from 'rcedit'

const root = process.cwd()
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const runtime = path.join(root, 'node_modules', 'electron', 'dist')
const version = (await fs.readFile(path.join(runtime, 'version'), 'utf8')).trim()
if (version !== manifest.devDependencies.electron) throw new Error('Electron runtime does not match package-lock.json')
const destination = process.env.UTA_PACKAGE_DESTINATION
  ? path.resolve(process.env.UTA_PACKAGE_DESTINATION)
  : path.join(root, 'release', 'UTA-Windows-x64')
if (![path.join(root, 'release'), path.join(root, 'work')].includes(path.dirname(destination))) {
  throw new Error('Package destination must be a direct child of release or work')
}
// Verify every build input before replacing any part of the installed app.
for (const input of ['dist-desktop/index.html', 'work/backend/uta-backend/uta-backend.exe', 'server/data/tomoshi-dict-open.db', 'desktop/main.cjs']) {
  await fs.access(path.join(root, input))
}
// Rebuilding keeps uta-data, which belongs to the user, even in the release folder.
await fs.mkdir(destination, { recursive: true })
await fs.cp(runtime, destination, { recursive: true })
await fs.rename(path.join(destination, 'electron.exe'), path.join(destination, 'UTA.exe'))
await rcedit(path.join(destination, 'UTA.exe'), { icon: path.join(root, 'desktop', 'icon.ico'),
  'file-version': manifest.version, 'product-version': manifest.version,
  'version-string': { ProductName: 'UTA', FileDescription: 'UTA 日语歌学习', CompanyName: 'meilawiet',
    OriginalFilename: 'UTA.exe', InternalName: 'UTA', LegalCopyright: 'Copyright 2026 meilawiet. MIT License.' } })
await fs.rm(path.join(destination, 'resources', 'default_app.asar'), { force: true })
const appDir = path.join(destination, 'resources', 'app')
await fs.mkdir(appDir, { recursive: true })
// Remove old hashed interface assets during rebuild; user data is outside resources/app.
for (const name of ['desktop', 'dist-desktop']) {
  const target = path.resolve(appDir, name)
  if (path.dirname(target) !== path.resolve(appDir)) throw new Error('Invalid application asset path')
  await fs.rm(target, { recursive: true, force: true })
}
await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({ name: manifest.name, productName: 'UTA',
  version: manifest.version, main: 'desktop/main.cjs', description: manifest.description }, null, 2))
await fs.cp(path.join(root, 'desktop'), path.join(appDir, 'desktop'), { recursive: true,
  filter: (source) => !source.endsWith('.spec') })
await fs.cp(path.join(root, 'dist-desktop'), path.join(appDir, 'dist-desktop'), { recursive: true })
await fs.cp(path.join(root, 'work', 'backend', 'uta-backend'), path.join(destination, 'resources', 'backend'), { recursive: true })
const dictionaryDir = path.join(destination, 'resources', 'dictionary')
await fs.mkdir(dictionaryDir, { recursive: true })
await fs.copyFile(path.join(root, 'server', 'data', 'tomoshi-dict-open.db'), path.join(dictionaryDir, 'tomoshi-dict-open.db'))
for (const [source, target] of [['docs/WINDOWS.md', '使用说明.md'], ['docs/WINDOWS_VERIFICATION.md', '验证记录.md'], ['LICENSE', 'UTA-LICENSE.txt'], ['THIRD_PARTY_DATA_NOTICES.md', '第三方数据说明.md']]) {
  await fs.copyFile(path.join(root, source), path.join(destination, target))
}
await fs.cp(path.join(root, 'desktop', 'licenses'), path.join(destination, 'licenses'), { recursive: true })
console.log('Windows application: ' + path.join(destination, 'UTA.exe'))
