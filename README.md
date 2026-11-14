# UTA · Windows 日语歌学习程序

UTA 是 Windows 10 / 11 x64 桌面程序，用歌曲歌词练习日语读音、词汇和句意。本分支只维护 Windows EXE，当前版本为 **1.4.0**。

## 下载与启动

从 [GitHub Windows 1.4.0 Release](https://github.com/meilawiet/Japanese-song-learning-website/releases/tag/windows-v1.4.0) 下载 **`UTA-1.4.0-Windows-x64.zip`**，完整解压 `UTA-Windows-x64` 文件夹，再双击其中的 `UTA.exe`。也可从 [Gitee 成品镜像](https://gitee.com/mzh18392597195/uta-windows/releases/tag/windows-v1.4.0) 下载；超过附件上限的文件提供分片和合并校验工具，合并后与 GitHub 原文件完全一致。

程序包含 Electron、Python 注音服务、Sudachi 和 Tomoshi 词典，无需另装 Node.js、Python 或其他运行环境。请保留完整程序文件夹，仅复制 EXE 无法运行。建议解压到当前用户可写的目录。

## 从旧版升级，保留学习数据

本次提供完整 ZIP，以及正式 1.3.0 直升 1.4.0 的 `UTA-1.3.0-to-1.4.0-Windows-x64.utapatch`。两个下载均附 SHA-256 校验文件。

正式 1.3.0 可在「设置 → 关于 → 检查更新」安装，或将增量包拖入 UTA 主窗口。更旧的版本和基线不匹配的本地测试版，可用完整包直接升级。在线更新器可回退下载完整包。

手动升级时先退出 UTA，备份旧版的 `uta-data`。将 1.4.0 完整 ZIP 解压到新目录，把备份的 `uta-data` 复制到新版 `UTA.exe` 同级，再运行并核对歌曲和学习记录。跨电脑或 Windows 用户复制时，系统加密的 API Key 需要重新填写。

## 1.4.0 更新重点

- 发音学习新增音量入口，跟唱译文统一使用歌词字体。长歌名可展开，窄窗下读音校对栏可切换为抽屉。
- 保存后恢复歌曲库筛选和滚动位置。歌词重排后仍定位原句，删句后定位相邻句，返回保持暂停。
- 整首编辑可按问题定位歌词配对、打开单句分词与读音、在同一草稿中更换封面。
- 任务面板可发起和管理整首 AI 复核。AI、歌词源和 WebDAV 配置增加未保存修改提示。
- 数据管理统一提供本地备份和跨端互通，设置新增 Windows 使用帮助。

完整更新公告见 [Windows 1.4.0 更新公告](docs/releases/windows-v1.4.0.md)。

## 主要功能

- **导入与编辑**：单首或批量导入音频和 LRC，本地歌词优先配对，缺少时可联网搜索。选用后预览原文、译文、罗马音和时间戳，再确认导入；支持改轨道、插句、编辑歌词与自定义分词。歌词自带的假名优先于自动注音。已导入歌曲也可搜索替换歌词、重新归类和手动配对三条轨道，批量导入可逐首选择封面。
- **发音学习**：本地分词、假名注音和日中词义查询；可修正读音、隐藏某个词的注音，分别调节歌词、假名、罗马音和翻译字号；单句循环及开始/结束时间可单独调整。
- **跟唱与选段练习**：任一句开始连续播放，可自定义背景、切换注音与译文、跟随当前歌词。Ctrl 选择连续句子后可慢放，设定 3 次、5 次或无限循环、1–3 秒跟读间隔，以及“听一次 → 自己读 → 再听一次”。选段使用准确时间戳，单句保留原有播放提前量。
- **AI 辅助**：按需解析歌词、复核读音及词典分词；建议可采纳、跳过或恢复。配置服务后可测试连接、保存设置。批量 AI 解析由用户明确勾选。
- **Windows 操作**：歌词右键菜单、播放及选句快捷键，可调整并记住宽度、主动收放的分栏，启动恢复上次学习歌曲，未保存修改退出提示；任务面板显示导入、注音和 AI 解析的进度、失败原因、重试与取消。
- **数据管理**：收藏、掌握与复习记录；导出和恢复 `.uta-backup`，恢复前预览并自动保存学习快照。API Key 可仅用于当前会话，或使用 Windows 加密记住，不进入普通学习备份。WebDAV 云快照默认不包含 Key；主动勾选上传 Key 时需再次确认。

本地播放、注音、词义和已有记录可离线使用。在线歌词、封面和 AI 的可用性取决于网络及对应服务，AI 调用可能收费。某个平台或歌曲版本未提供的翻译／注音不会被伪造。跨端互通需要双方协议兼容；此版本提供手动快照上传和替换恢复，不提供自动双向合并。

## 常用操作与后续更新

发音学习页单击选句、双击播放，Ctrl 点击首末句选择连续范围，右键歌词打开编辑菜单。跟唱模式点击任意一句即可从该句连续播放。设置分为常规设置、主题设置、数据管理、AI 服务、歌词源、帮助和关于。主题中管理字体与注音，数据管理中可切换本地备份和跨端互通，关于中检查更新。

检查更新由用户主动发起，在“设置 → 关于 → 检查更新”在线下载适配本机的直达增量包；没有适配包时使用完整包，无需逐个安装中间版本。也可下载对应 `.utapatch` 后拖入程序，Gitee 分片需先合并。只有确认“退出 UTA、安装并重新打开”才会切换版本；存在未保存编辑时会先提示。更新不替换 `uta-data`，并保留旧程序版本用于恢复。完整 ZIP 仍可用于首次安装或手动升级。

详细操作与快捷键见 [Windows 使用说明](docs/WINDOWS.md)。启动失败时查看 `uta-data/logs/desktop.log`。程序尚未购买代码签名证书，Windows 可能提示未知发布者。

## 从源码构建

```powershell
git clone --branch Windows-exe https://github.com/meilawiet/Japanese-song-learning-website.git E:\project\UTA-exe
cd E:\project\UTA-exe
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 setup
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 build
```

也可运行 `安装 Windows 开发环境.cmd`、`构建 Windows 程序.cmd`。便携程序位于 `release/UTA-Windows-x64/`，完整 ZIP 与校验文件位于 `release/`。`npm run windows:release` 默认相对最近一个公开 Windows 完整包生成增量；多个起始版本分别使用经过校验的实际程序基线执行 `node scripts/create-windows-patch.mjs <旧版便携目录> <新版便携目录> <输出目录>`。Gitee 仅分发成品，不同步源码。

源码入口是 `desktop/`、`src/` 和 `server/`，构建脚本在 `scripts/`。依赖、缓存、临时文件和产物保存在项目目录；用户歌曲、学习资料、凭据及下载的词典数据库不提交 Git。

源码采用 MIT 协议。第三方授权见 [第三方数据说明](THIRD_PARTY_DATA_NOTICES.md)、成品 `licenses` 文件夹，以及版本目录中 `app/dist-desktop/licenses/qq-lyrics.txt` 的 QQ 歌词解码依赖许可。
