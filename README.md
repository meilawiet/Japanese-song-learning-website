# UTA · Windows 日语歌学习程序

UTA 是 Windows 10 / 11 x64 桌面程序，用歌曲歌词练习日语读音、词汇和句意。本分支仅发布 Windows EXE；当前版本为 **1.1.28**。

## 下载与更新

从 [Windows 1.1.28 Release](https://github.com/meilawiet/Japanese-song-learning-website/releases/tag/windows-v1.1.28) 下载 `UTA-1.1.28-Windows-x64.zip` 和可选的 SHA-256 校验文件。解压完整的 `UTA-Windows-x64` 文件夹，再运行其中的 `UTA.exe`。程序已包含 Electron、Python 注音服务和词典，无需另装运行环境；仅复制 `UTA.exe` 无法运行。

学习资料位于 `UTA.exe` 同级的 **`uta-data`** 文件夹。升级时先退出 UTA，备份 `uta-data`，再用新版程序文件替换旧版文件，保留原有 `uta-data`。发布 ZIP 不含用户资料，也不提供程序内自动安装更新。移动到另一台电脑时，连同 `uta-data` 一起复制；Windows 加密的 API Key 需要在新电脑重新填写。建议把程序放在当前用户可写的目录。

## 主要功能

- **歌曲与歌词**：单首或批量导入音频和 LRC；本地文件优先配对，缺少歌词时可选联网搜索 LRCLIB / UtaTen 候选并先预览。歌词导入可检查原文、译文、罗马音轨道，修正时间戳、手动调换轨道或插句；歌词自带的假名注音优先于自动生成。
- **注音与阅读**：本地 Sudachi 分词、假名注音、Tomoshi 日中词义；可逐词修正读音、隐藏单词注音和自定义分词。支持平假名、罗马音、假名＋罗马音显示，独立调整歌词、上方假名、下方注音或词下罗马音，以及翻译字号。
- **学习与跟唱**：桌面播放器可从任意歌词句开始连续播放。跟唱模式使用全宽歌词界面，可选择自定义图片、纯色或默认背景，并控制译文、读音与歌词跟随。Ctrl 选择连续歌词后可按准确时间戳播放、慢放，或设置 3 次、5 次、无限循环及 1–3 秒跟读间隔；也可听一次、自己读、再听一次。单句播放仍保留原有提前量。
- **编辑与 AI**：右键歌词可编辑原文、译文、读音和时间；编辑歌曲支持撤销与重做，未保存退出会提示。AI 可按需解析歌词、复核读音和词典分词，建议可采纳、跳过或恢复。批量导入时由用户明确选择是否生成 AI 解析。
- **桌面操作**：任务面板显示导入、注音和 AI 解析的进度、失败原因、重试与取消；分栏宽度可调整并记住。提供播放及选句快捷键，四套主题色、歌曲库、收藏与复习清单。
- **本地数据**：可导出和恢复 `.uta-backup`；恢复前预览并自动保存学习快照。API Key 可选择仅在当前会话使用，或用 Windows 系统加密记住，且不进入普通学习备份。

本地歌曲播放、注音、词义和已有学习记录可离线使用。联网歌词、封面与 AI 服务依赖网络和对应服务；AI 请求可能产生服务费用。发布包不附带私人歌曲、学习记录或 API Key。

## 常用操作

从左侧进入“发音学习”“跟唱练习”“歌曲库”“复习”或“任务面板”。学习页点击一句定位，按住 Ctrl 再点击另一句选择连续范围；右键歌词打开编辑菜单。歌曲库可导入歌曲，设置中可调整注音、主题和 AI 服务。AI 服务填写地址、模型及 API Key 后，先“测试连接”，再“保存设置”。

详细操作、快捷键及故障处理见 [Windows 使用说明](docs/WINDOWS.md)。启动失败时查看 `uta-data/logs/desktop.log`。程序尚未购买代码签名证书，Windows 可能显示未知发布者。

## 从源码构建

```powershell
git clone --branch Windows-exe https://github.com/meilawiet/Japanese-song-learning-website.git E:\project\UTA-exe
cd E:\project\UTA-exe
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 setup
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 build
```

也可双击 `安装 Windows 开发环境.cmd`、`构建 Windows 程序.cmd`。构建结果在 `release/UTA-Windows-x64/`，ZIP 与 SHA-256 文件在 `release/`。源码入口位于 `desktop/`、`src/` 和 `server/`；构建脚本在 `scripts/`。本地依赖、缓存、临时文件和构建产物均留在项目目录，下载的 Tomoshi 词典数据库不提交到 Git。

源码采用 MIT 协议。第三方组件与词典的授权见 [第三方数据说明](THIRD_PARTY_DATA_NOTICES.md) 和成品内的 `licenses` 文件夹。
