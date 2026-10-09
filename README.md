# UTA · Windows 日语歌学习程序

`Windows-exe` 分支将 UTA 的电脑学习界面与本地注音、日中词典服务打包为可双击运行的 Windows 应用。支持 Windows 10 / 11 x64。

## 运行成品

打开 `release\UTA-Windows-x64\UTA.exe`，或双击项目根目录的 `启动 UTA Windows.cmd`。

不需要在用户电脑安装 Node.js 或 Python。分发时复制整个 `UTA-Windows-x64` 文件夹，或解压发布 ZIP 后运行 EXE。不要单独复制 `UTA.exe`。

学习记录、歌曲、浏览器缓存、日志和临时文件存放在 EXE 旁的 `uta-data` 文件夹。退出后内置服务会关闭，再次双击会回到已有主窗口。移动程序时连同数据文件夹一起复制。

## 学习功能

- 导入 MP3 与 LRC；识别常见 UTF-8 / GBK 编码，编辑歌名、歌手、歌词与时间轴，更换音频和封面。
- 内置 Sudachi 自动分词与假名注音；提供原文、平假名、罗马音及隐藏读音练习，自动读音可逐词校正。
- 内置 Tomoshi 日中词典，查看词义、词性和词形。
- 逐句播放与练习、掌握进度、歌曲检索和复习清单。
- 配置兼容 Chat Completions 的 AI 服务；选词讲解、整句解析、读音复核、带歌词上下文的多轮对话和本地对话历史。
- 封面候选搜索、本地封面与歌词搜索；联网功能使用时需有网络。
- 学习数据导出与恢复。读音、词义、播放器与已有记录可离线使用。

原网页的浏览器数据需先导出 `.uta-backup`，再在 Windows 应用“设置 → 数据管理”导入。私人歌曲、API Key 与学习数据不随仓库或应用发布。公共成品只提供原创示例。

Windows 版使用电脑布局。独立 Android 工程与 APK 打包配置已从本分支移除；手机原生 WebDAV、手机发现与 APK 更新不在 Windows 程序中启用。共享界面中仍被引用的模块保留，以便正确构建电脑界面。

## AI 配置

在“设置 → AI 服务”填写服务地址、模型与 API Key，可先测试连接再保存。勾选“记住密钥”时，Windows 使用系统加密存储；密钥不写入明文浏览器持久存储，也不进入学习备份。换 Windows 用户或电脑需要重新填写密钥。

也可在 `uta-data\config.env` 中配置本地服务的默认环境变量，重启生效。详细说明见 [Windows 使用说明](docs/WINDOWS.md)。

## 开发与构建

本地项目：`E:\project\UTA-exe`。源码、开发依赖、下载缓存和发布产物都在项目目录内。运行 `安装 Windows 开发环境.cmd` 准备环境，再运行 `构建 Windows 程序.cmd`，生成便携目录和发布 ZIP。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 setup
npm.cmd run windows:package
npm.cmd run desktop:dev
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 test
```

`server/data/tomoshi-dict-open.db` 需要通过安装脚本下载后才能打包日中词义；该词典不放入 Git。`server/requirements-desktop.txt` 和 `package-lock.json` 固定本次构建依赖。

主要文件：`desktop/main.cjs` 管理原生窗口、存储、协议和服务进程；`server/desktop_api.py` 提供只允许当前程序会话访问的本机 API；`desktop/backend.spec` 将 Python 与 Sudachi 词典冻结；`src/` 保留学习界面；`scripts/package-windows.mjs` 生成完整便携目录。

本地 API 每次自动分配回环端口，通过固定的 `uta://app` 页面来源访问，不占用旧网页的 8000 / 5173 端口，重启和搬移目录不会改变学习库的来源。页面保持 Chromium 沙箱、隔离上下文与关闭 Node 集成。

网页版开发仍可运行 `npm.cmd run dev`，也可 `npm.cmd run build`；使用项目本地 FastAPI 和 Vite，后台不启用 `--reload`。本地文件夹歌词可用 `npm.cmd run lyrics:sync` 同步，但不包含在通用 Windows 发布包中。

## 分发和故障处理

错误日志：`uta-data/logs/desktop.log`。缺失运行文件时重新解压完整目录。Windows 成品尚未做商业代码签名。帮助菜单提供使用说明、数据目录、版本信息和 Windows Release 页面。

程序遵循 MIT 协议。第三方词典来源与授权见 [第三方数据说明](THIRD_PARTY_DATA_NOTICES.md) 和成品内的 `licenses` 文件夹。Tomoshi 数据未经修改，保留上游 CC BY-SA 与各层授权信息。

验证结果见 [Windows 成品验证记录](docs/WINDOWS_VERIFICATION.md)。GitHub Actions 中的 Build UTA Windows 可手动构建并下载 Windows ZIP，未配置自动发布。
