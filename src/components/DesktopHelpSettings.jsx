export default function DesktopHelpSettings() {
  return <section className="settings-content desktop-help-settings" aria-labelledby="desktop-help-title">
    <h3 id="desktop-help-title">Windows 使用帮助</h3>
    <section className="desktop-settings-section">
      <h4>导入歌曲</h4>
      <p>在「歌曲库 → 导入歌曲」选择单首或批量导入。选好音频和本地 LRC 后，可以在预览中调整原文、译文、罗马音和时间。手头没有歌词时，可在导入页联网搜索。已导入的歌曲也能通过「编辑歌曲信息」搜索并替换歌词。</p>
    </section>
    <section className="desktop-settings-section">
      <h4>发音学习与跟唱</h4>
      <p>单击歌词选句，双击播放或暂停。点带注音的词打开右侧校对栏，右键歌词可编辑原文、译文、读音和起止时间。</p>
      <p>「显示」切换假名和罗马音，「慢放」「循环」控制单句播放，小喇叭调节音量。先点首句，再按住 Ctrl 点击末句，可选择一段连续歌词。</p>
      <p>进入「跟唱练习」后，点击任一句即可从该句开始连续播放。「自定义背景」可更换图片，歌词跟随和译文可分别开关。</p>
    </section>
    <section className="desktop-settings-section">
      <h4>词句解析与 AI 复核</h4>
      <p>在「设置 → AI 服务」填写接口地址、模型和 API Key，测试连接后保存。学习时可生成整句解析，在任务面板发起整首复核并查看进度。读音或分词建议可按需采纳或跳过。</p>
    </section>
    <section className="desktop-settings-section">
      <h4>界面、备份与更新</h4>
      <p>「主题设置」可以换主题和歌词字体，也能分别调整歌词、注音和译文字号。「数据管理」包含本地备份和 WebDAV 跨端互通。恢复跨端快照会整体替换本机资料，请先查看恢复预览。</p>
      <p>在「关于」检查 Windows 更新。手动下载的 .utapatch 可以拖进 UTA 主窗口校验。</p>
    </section>
    <section className="desktop-settings-section">
      <h4>常用快捷键</h4>
      <dl>
        <dt>Ctrl+O / Ctrl+F</dt><dd>导入歌曲 / 搜索歌曲</dd>
        <dt>↑ / ↓</dt><dd>上一句 / 下一句</dd>
        <dt>Shift+↑ / ↓</dt><dd>扩展选段</dd>
        <dt>Enter / Space</dt><dd>播放单句 / 播放或暂停</dd>
        <dt>Ctrl+Space</dt><dd>播放所选歌词段落</dd>
        <dt>Ctrl+E / Esc</dt><dd>编辑当前句 / 清除选段或关闭弹窗</dd>
      </dl>
      <p>在发音学习页点击「键盘操作」，可查看学习区的快捷键。</p>
    </section>
  </section>
}
