import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const temporary = path.join(root, 'work', 'tmp')
mkdirSync(temporary, { recursive: true })
const env = { ...process.env, TEMP: temporary, TMP: temporary, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1',
  npm_config_cache: path.join(root, '.npm-cache'), PIP_CACHE_DIR: path.join(root, '.pip-cache'),
  ELECTRON_CACHE: path.join(root, '.cache', 'electron') }
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${executable} failed (${code})`)))
  })
}
await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.desktop.config.js'])
await run(path.join(root, 'server', '.venv', 'Scripts', 'python.exe'), ['-B', '-m', 'PyInstaller', '--noconfirm',
  '--distpath', 'work/backend', '--workpath', 'work/build', 'desktop/backend.spec'])
