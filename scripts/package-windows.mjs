import fs from 'node:fs/promises'
import path from 'node:path'
import { rcedit } from 'rcedit'

const root = process.cwd()
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const runtime = path.join(root, 'node_modules', 'electron', 'dist')
const version = (await fs.readFile(path.join(runtime, 'version'), 'utf8')).trim()
if (version !== manifest.devDependencies.electron) throw new Error('Electron runtime does not match package-lock.json')
const destination = path.join(root, 'release', 'UTA-Windows-x64')
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
await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({ name: manifest.name, productName: 'UTA',
  version: manifest.version, main: 'desktop/main.cjs', description: manifest.description }, null, 2))
await fs.cp(path.join(root, 'desktop'), path.join(appDir, 'desktop'), { recursive: true,
  filter: (source) => !source.endsWith('.spec') })
await fs.cp(path.join(root, 'dist-desktop'), path.join(appDir, 'dist-desktop'), { recursive: true })
await fs.cp(path.join(root, 'work', 'backend', 'uta-backend'), path.join(destination, 'resources', 'backend'), { recursive: true })
const dictionaryDir = path.join(destination, 'resources', 'dictionary')
await fs.mkdir(dictionaryDir, { recursive: true })
await fs.copyFile(path.join(root, 'server', 'data', 'tomoshi-dict-open.db'), path.join(dictionaryDir, 'tomoshi-dict-open.db'))
for (const [source, target] of [['docs/WINDOWS.md', '使用说明.md'], ['LICENSE', 'UTA-LICENSE.txt'], ['THIRD_PARTY_DATA_NOTICES.md', '第三方数据说明.md']]) {
  await fs.copyFile(path.join(root, source), path.join(destination, target))
}
await fs.cp(path.join(root, 'desktop', 'licenses'), path.join(destination, 'licenses'), { recursive: true })
console.log('Windows application: ' + path.join(destination, 'UTA.exe'))
