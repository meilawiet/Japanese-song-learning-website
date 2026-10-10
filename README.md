# UTA · Windows 日语歌学习程序

UTA 是可直接运行的 Windows 桌面学习程序，支持 Windows 10 / 11 x64。通过歌曲歌词练习日语读音、词汇和句意，提供本地注音、日中词典、逐句练习与学习数据备份。

本分支为 **`Windows-exe`**，当前版本 **1.1.6**。

## 下载与运行

在 [Windows 1.1.6 Release](https://github.com/meilawiet/Japanese-song-learning-website/releases/tag/windows-v1.1.6) 下载 **`UTA-1.1.6-Windows-x64.zip`**，解压整个压缩包后双击 `UTA-Windows-x64\UTA.exe`。

- 发布包包含 Electron 运行环境、Python 注音服务、Sudachi 词典和 Tomoshi 日中词典，不需要另外安装 Node.js 或 Python。
- 必须保留完整的 `UTA-Windows-x64` 文件夹；单独复制 `UTA.exe` 无法运行。程序请放在当前用户可写的目录。
- 发布包约 394 MB，内置词典和运行环境占主要空间；SHA-256 校验文件与 ZIP 一同提供。
- 本地已构建的项目可运行 `release\UTA-Windows-x64\UTA.exe`，或双击根目录的 `启动 UTA Windows.cmd`。
- 首次启动会加载词典。再次双击会返回已有窗口；关闭程序后内置服务自动退出。

## 学习功能

- **Windows 桌面工作区**：原生窗口按钮与菜单、固定导航栏、歌曲列表与详情、独立滚动的歌词和校对窗格，以及底部播放器。
- **歌曲管理**：导入音频与 LRC，识别常见 UTF-8 / GBK 歌词编码；编辑歌名、歌手、歌词和时间轴，更换音频或封面，支持搜索、收藏与排序。
- **批量导入**：一次选择多个音频和歌词，同名文件自动配对；可手动选择对应歌词、编辑信息并勾选要导入的歌曲。保存失败时撤销整批写入，可直接重试。
- **本地注音与词义**：Sudachi 自动分词和假名注音，Tomoshi 提供日中词义；自动读音可逐词校正。支持原文、平假名、罗马音和遮住读音练习。
- **独立注音字号**：在“设置 → 注音显示”分别调整歌词上方假名和下方整句注音字号，范围均为 8–24 px；实时预览、自动保存、分别恢复默认，假名和罗马音均适用。
- **逐句学习与复习**：从歌曲标题栏的“逐句练习”进入，听原声、尝试读音与句意、揭晓答案，记录掌握进度并整理复习清单。
- **连续歌词片段播放**：先点击首句，再按住 Ctrl 点击末句，中间句一起选中；支持播放、暂停、继续、重播及 0.75× / 0.5× / 0.25× 慢放。直接从首句时间戳播放到末句之后的下一处时间戳，选到歌曲结尾则播放到音频结束。选段不提前 0.5 秒，单句播放保留原有提前量。
- **AI 辅助学习**：配置兼容 Chat Completions 的服务，按需使用选词讲解、整句解析和读音复核；提供“测试连接”和“保存设置”。
- **数据备份**：导出与恢复学习备份，保存歌曲、音频、人工修正、掌握进度和两个注音字号。

本地注音、词义、音频播放和已有学习记录可离线使用。AI、在线封面和歌词搜索需要联网，AI 请求可能产生所配置服务的费用。公共发布包只包含原创示例，不附带私人歌曲或学习记录。

## AI 配置

打开“设置 → AI 服务”，填写服务地址、模型与 API Key，点击“测试连接”，成功后点击“保存设置”。两个按钮固定在窗口底部，填写区域独立滚动。

勾选“在这台电脑上记住 API Key”时，密钥使用 Windows 系统加密保存；未勾选时仅在当前会话使用。API Key 不进入学习备份，换 Windows 用户或电脑后需重新填写。

也可在 EXE 旁的 `uta-data\config.env` 中配置内置服务的默认环境变量，重启生效。详细说明见 [Windows 使用说明](docs/WINDOWS.md)。

## 数据保存与更新

歌曲、学习记录、缓存、日志和临时文件都保存在 `UTA.exe` 旁的 **`uta-data`** 文件夹。通过“文件 → 打开数据文件夹”可查看，通过“设置 → 数据管理”可导出或恢复 `.uta-backup`。恢复前会显示预览并请求确认。

更新前退出 UTA，保留 `uta-data`，将新版完整程序文件替换到原目录。移动程序时关闭窗口，并连同 `uta-data` 一起复制。发布 ZIP 不包含你的数据文件夹。

启动失败时查看 `uta-data\logs\desktop.log`；运行文件缺失时重新解压完整发布包。程序使用自动分配的本机端口，不要求用户另外启动注音服务。

## Windows EXE 开发与构建

克隆本分支到本地目录，例如 `E:\project\UTA-exe`：

```powershell
git clone --branch Windows-exe https://github.com/meilawiet/Japanese-song-learning-website.git E:\project\UTA-exe
cd E:\project\UTA-exe
```

双击 `安装 Windows 开发环境.cmd` 安装项目所需依赖，再双击 `构建 Windows 程序.cmd`。脚本将依赖、缓存、临时文件与构建产物保存在项目目录中，也可使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 setup
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 test
```

构建输出为 `release\UTA-Windows-x64\`、版本 ZIP 及 SHA-256 校验文件。开发预览可运行 `npm.cmd run desktop:dev`。

主要源码：

| 路径 | 用途 |
| --- | --- |
| `desktop/main.cjs` | 原生窗口、菜单、存储、协议和服务进程 |
| `src/` | 桌面学习界面与歌曲、歌词功能 |
| `server/desktop_api.py` | 当前程序会话专用的本机 API |
| `desktop/backend.spec` | 冻结 Python 服务与 Sudachi 词典 |
| `scripts/package-windows.mjs` | 组装完整便携目录 |
| `scripts/archive-windows.py` | 生成不含用户数据的 ZIP 与校验文件 |

`server/data/tomoshi-dict-open.db` 由安装脚本下载，不放入 Git；首次构建须先完成安装。`server/requirements-desktop.txt` 与 `package-lock.json` 固定依赖。桌面页面使用固定的 `uta://app` 来源，保留 Chromium 沙箱和隔离上下文，关闭 Node 集成；内置 API 仅接受当前程序会话密钥。

[Build UTA Windows](https://github.com/meilawiet/Japanese-song-learning-website/actions/workflows/windows.yml) 工作流可手动构建、验证并下载 Windows ZIP。成品验证说明见 [Windows 成品验证记录](docs/WINDOWS_VERIFICATION.md)。

## 授权

程序源码采用 MIT 协议。第三方词典和组件的来源及授权见 [第三方数据说明](THIRD_PARTY_DATA_NOTICES.md) 与成品内的 `licenses` 文件夹。Tomoshi 数据保留上游 CC BY-SA 与各层授权信息。Windows 成品尚未购买代码签名证书。
