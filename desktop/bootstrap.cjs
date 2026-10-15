// This small, stable entry point chooses a verified version directory.
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { versionName } = require('./updateCore.cjs');

if (!app.isPackaged) {
  require('./main.cjs');
} else {
  const home = path.dirname(process.execPath);
  if (process.argv.includes('--uta-apply-update')) {
    app.whenReady().then(() => require('./updateHelper.cjs').applyPendingUpdate(home))
      .catch(error => { dialog.showErrorBox('UTA 更新失败', error.message); app.quit(); });
  } else {
    try {
      const current = JSON.parse(fs.readFileSync(path.join(home, 'current.json'), 'utf8'));
      const version = versionName(current.version);
      const versionRoot = path.join(home, 'versions', version);
      if (!fs.statSync(versionRoot).isDirectory() || !fs.existsSync(path.join(versionRoot, 'manifest.json')))
        throw new Error('找不到当前版本文件。');
      process.env.UTA_VERSION_ROOT = versionRoot;
      require(path.join(versionRoot, 'app', 'desktop', 'main.cjs'));
    } catch (error) {
      app.whenReady().then(() => { dialog.showErrorBox('UTA 无法启动', `${error.message}\n请重新解压完整发布包，并保留 uta-data。`); app.quit(); });
    }
  }
}
