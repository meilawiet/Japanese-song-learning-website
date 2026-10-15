# UTA · Windows 日语歌学习程序

UTA 是 Windows 10 / 11 x64 桌面程序，用歌曲歌词练习日语读音、词汇和句意。本分支只维护 Windows EXE，当前版本为 **1.2.0**。

## 下载与启动

从 [Windows 1.2.0 Release](https://github.com/meilawiet/Japanese-song-learning-website/releases/tag/windows-v1.2.0) 下载 **`UTA-1.2.0-Windows-x64.zip`**，完整解压 `UTA-Windows-x64` 文件夹，再双击其中的 `UTA.exe`。可选下载 `.zip.sha256` 校验文件，用于核对 ZIP 完整性。

程序包含 Electron、Python 注音服务、Sudachi 和 Tomoshi 词典，无需另装 Node.js、Python 或其他运行环境。请保留完整程序文件夹，仅复制 EXE 无法运行。建议解压到当前用户可写的目录。

## 从旧版升级，保留学习数据

**本次只发布完整 ZIP 和 SHA-256 校验文件，不提供增量包。** 1.1.28 及以前发布的版本没有增量更新器，首次升级需手动完成：

1. 退出旧版 UTA，备份旧 `UTA.exe` 旁的 **`uta-data`** 文件夹。
2. 将 1.2.0 完整 ZIP 解压到新目录。
3. 把旧的 `uta-data` 文件夹复制到新版 `UTA.exe` 同级，再运行新版并核对歌曲和学习记录。

发布 ZIP 不含用户数据。`uta-data` 保存歌曲、音频、学习记录、注音校正、歌词源设置和加密凭据；跨电脑或 Windows 用户复制时，API Key 需要重新填写。

## 1.2.0 更新重点

- **应用更新**：设置中增加在线检查更新；后续有匹配增量包时优先使用增量包，否则在可用时改用完整包。校验后由用户确认退出、安装并重新打开。
- **离线增量包**：在“设置 → 检查更新 → 本地增量包”选择 `.utapatch`，或直接拖入主窗口。无需解压，支持版本与文件完整性校验；同目录有对应 `.sha256` 时一并校验。此功能用于安装后续发布的适配增量包。
- **歌词源管理**：启用、停用和编辑来源，快捷添加 QQ、网易云、酷狗、酷我；识别平台网址后使用专用接口，也保留 LRCLIB 兼容自定义接口。单个来源受限时，其余结果仍可选用，并合并重复请求、缓存成功结果、遵守限流等待时间。
- **统一分词注音**：发音学习的假名＋罗马音、仅假名、仅罗马音以跟唱排版为基准，按词对齐，假名在上、罗马音在下；统一罗马音字体和词间距，改善跟唱长句换行。
- **简化学习操作**：统一显示模式下拉框，双击歌词播放单句；精简重复选项、学习页底部播放器和逐句播放图标。练习 Demo 不再出现在 Windows 歌曲库或快速打开列表。
- **界面与导入修复**：歌曲、歌词及分词编辑弹窗跟随主题色；英文／罗马音归类不再要求逐行确认，平台原文、译文和罗马音按时间轴保留。

完整更新公告见 [Windows 1.2.0 更新公告](docs/releases/windows-v1.2.0.md)。

## 主要功能

- **导入与编辑**：单首或批量导入音频和 LRC，本地歌词优先配对，缺少时可联网搜索。选用后预览原文、译文、罗马音和时间戳，再确认导入；支持改轨道、插句、编辑歌词与自定义分词。歌词自带的假名优先于自动注音。
- **发音学习**：本地分词、假名注音和日中词义查询；可修正读音、隐藏某个词的注音，分别调节歌词、假名、罗马音和翻译字号。
- **跟唱与选段练习**：任一句开始连续播放，可自定义背景、切换注音与译文、跟随当前歌词。Ctrl 选择连续句子后可慢放，设定 3 次、5 次或无限循环、1–3 秒跟读间隔，以及“听一次 → 自己读 → 再听一次”。选段使用准确时间戳，单句保留原有播放提前量。
- **AI 辅助**：按需解析歌词、复核读音及词典分词；建议可采纳、跳过或恢复。配置服务后可测试连接、保存设置。批量 AI 解析由用户明确勾选。
- **Windows 操作**：歌词右键菜单、播放及选句快捷键，可调整并记住宽度的分栏，未保存修改退出提示；任务面板显示导入、注音和 AI 解析的进度、失败原因、重试与取消。
- **数据管理**：收藏、掌握与复习记录；导出和恢复 `.uta-backup`，恢复前预览并自动保存学习快照。API Key 可仅用于当前会话，或使用 Windows 加密记住，不进入普通学习备份。

本地播放、注音、词义和已有记录可离线使用。在线歌词、封面和 AI 的可用性取决于网络及对应服务，AI 调用可能收费。某个平台或歌曲版本未提供的翻译／注音不会被伪造。

## 常用操作与后续更新

发音学习页单击选句、双击播放，Ctrl 点击首末句选择连续范围，右键歌词打开编辑菜单。跟唱模式点击任意一句即可从该句连续播放。设置中可管理注音、主题、歌词源、AI 服务、学习备份及应用更新。

后续更新可在“设置 → 检查更新”在线下载，或手动下载适用于当前版本的 `.utapatch` 后拖入程序。只有点击“退出 UTA、安装并重新打开”才会切换版本；存在未保存的编辑时会先提示。更新不替换 `uta-data`，并保留旧程序版本用于恢复。完整 ZIP 仍可用于首次安装或手动升级。

详细操作与快捷键见 [Windows 使用说明](docs/WINDOWS.md)。启动失败时查看 `uta-data/logs/desktop.log`。程序尚未购买代码签名证书，Windows 可能提示未知发布者。

## 从源码构建

```powershell
git clone --branch Windows-exe https://github.com/meilawiet/Japanese-song-learning-website.git E:\project\UTA-exe
cd E:\project\UTA-exe
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 setup
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 build
```

也可运行 `安装 Windows 开发环境.cmd`、`构建 Windows 程序.cmd`。便携程序位于 `release/UTA-Windows-x64/`，完整 ZIP 与校验文件位于 `release/`。`npm run windows:release` 在存在兼容上次版本时额外生成增量包；1.2.0 是首次公开带更新器的版本，本次只上传完整 ZIP 和校验文件。

源码入口是 `desktop/`、`src/` 和 `server/`，构建脚本在 `scripts/`。依赖、缓存、临时文件和产物保存在项目目录；用户歌曲、学习资料、凭据及下载的词典数据库不提交 Git。

源码采用 MIT 协议。第三方授权见 [第三方数据说明](THIRD_PARTY_DATA_NOTICES.md)、成品 `licenses` 文件夹，以及版本目录中 `app/dist-desktop/licenses/qq-lyrics.txt` 的 QQ 歌词解码依赖许可。
