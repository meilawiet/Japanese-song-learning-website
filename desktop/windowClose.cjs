const fs = require('node:fs');
const path = require('node:path');

const CLOSE_BEHAVIORS = ['ask', 'tray', 'quit'];
class CloseBehaviorStore {
  constructor(dataDir) { this.file = path.join(dataDir, 'window-close.json'); }
  load() {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { behavior: CLOSE_BEHAVIORS.includes(value?.behavior) ? value.behavior : 'ask' };
    } catch { return { behavior: 'ask' }; }
  }
  save(value) {
    if (!value || !CLOSE_BEHAVIORS.includes(value.behavior)) throw new Error('关闭方式无效。');
    const settings = { behavior: value.behavior };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(settings), 'utf8');
    fs.renameSync(this.file + '.tmp', this.file);
    return settings;
  }
}

class WindowCloseController {
  constructor({ app, dialog, Tray, Menu, nativeImage, getWindow, unsavedDrafts, dataDir, iconPath, onSettings, log = () => {} }) {
    Object.assign(this, { app, dialog, Tray, Menu, nativeImage, getWindow, unsavedDrafts, iconPath, onSettings, log });
    this.store = new CloseBehaviorStore(dataDir);
    this.tray = null;
    this.quitting = false;
    this.prompting = false;
  }
  showWindow() {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    window.setSkipTaskbar(false);
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  }
  saveBehavior(value) {
    const saved = this.store.save(value);
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents?.send('uta:close-behavior:changed', saved);
    return saved;
  }
  ensureTray() {
    if (this.tray && !this.tray.isDestroyed()) return;
    const icon = this.nativeImage.createFromPath(this.iconPath).resize({ width: 16, height: 16 });
    if (icon.isEmpty()) throw new Error('无法加载系统托盘图标。');
    const tray = new this.Tray(icon);
    tray.setToolTip('UTA · 日语歌学习');
    tray.on('click', () => this.showWindow());
    tray.on('double-click', () => this.showWindow());
    tray.setContextMenu(this.Menu.buildFromTemplate([
      { label: '打开 UTA', click: () => this.showWindow() },
      { label: '设置', click: () => { this.showWindow(); this.onSettings(); } },
      { type: 'separator' },
      { label: '退出 UTA', click: () => this.app.quit() },
    ]));
    this.tray = tray;
  }
  confirmQuit() {
    if (!this.unsavedDrafts.size) return true;
    this.showWindow();
    return this.dialog.showMessageBoxSync(this.getWindow(), { type: 'warning', title: '还有未保存的修改',
      message: '还有未保存的歌词或歌曲修改。', detail: '现在退出会丢失尚未保存的输入。',
      buttons: ['继续编辑', '放弃修改并退出'], defaultId: 0, cancelId: 0, noLink: true }) === 1;
  }
  beforeQuit(event) {
    // Explicit Quit and updater restarts always exit; the saved close-button
    // preference must never keep the updater or a tray Quit running invisibly.
    if (this.quitting) return;
    if (!this.confirmQuit()) { event.preventDefault(); return; }
    this.quitting = true;
    this.unsavedDrafts.clear();
  }
  async handleClose(event) {
    if (this.quitting) return;
    event.preventDefault();
    if (this.prompting) return;
    this.prompting = true;
    try {
      let behavior = this.store.load().behavior, remember = false;
      if (behavior === 'ask') {
        const result = await this.dialog.showMessageBox(this.getWindow(), {
          type: 'question', title: '关闭 UTA', message: '请选择关闭方式',
          detail: '最小化到系统托盘后，音乐和当前编辑会继续保留。可点击托盘图标重新打开 UTA。',
          buttons: ['最小化到系统托盘', '直接退出', '取消'], defaultId: 0, cancelId: 2, noLink: true,
          checkboxLabel: '记住我的选择，下次不再询问', checkboxChecked: false,
        });
        if (this.quitting || this.getWindow()?.isDestroyed() || ![0, 1].includes(result.response)) return;
        behavior = result.response === 0 ? 'tray' : 'quit';
        remember = result.checkboxChecked;
      }
      if (behavior === 'tray') {
        this.ensureTray();
        if (remember) this.saveBehavior({ behavior });
        this.getWindow().setSkipTaskbar(true);
        this.getWindow().hide();
      } else {
        if (!this.confirmQuit()) return;
        if (remember) this.saveBehavior({ behavior });
        this.unsavedDrafts.clear();
        this.quitting = true;
        this.app.quit();
      }
    } catch (error) {
      this.log(`Close request failed: ${error.message}`);
      this.showWindow();
      this.dialog.showErrorBox('无法完成关闭操作', error.message);
    } finally { this.prompting = false; }
  }
  destroy() {
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
  }
}
module.exports = { CLOSE_BEHAVIORS, CloseBehaviorStore, WindowCloseController };
