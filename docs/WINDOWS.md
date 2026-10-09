# UTA Windows 版

适用于 Windows 10 / 11 64 位。便携目录已包含 Electron、Python 注音服务、Sudachi 词典及 Tomoshi 日中词典，不需要另外安装 Node.js、Python、Java 或 Android 环境。

## 开始使用

双击 `release\UTA-Windows-x64\UTA.exe`。分享给其他电脑时复制整个 `UTA-Windows-x64` 文件夹，或将发布 ZIP 解压后运行 `UTA.exe`。程序必须放在当前用户可写的目录。

首启会加载本地词典。只会打开一个主窗口；再次双击会回到已有窗口。关闭最后一个窗口或选择“UTA → 退出”会关闭内置注音服务。

歌曲库可导入本地 MP3 与 LRC、编辑歌曲和歌词、替换封面。可自动生成逐词读音、平假名或罗马音显示，手动校正读音、查看中文词义、逐句练习、记录掌握进度和复习，以及使用选词解释、整句解析、AI 对话和读音复核。

本地注音、词义、歌曲播放和已有学习记录可以离线使用。AI、在线封面与歌词搜索需要联网。此版本保留电脑端界面；Android 专用的手机发现、WebDAV 原生插件和 APK 更新流程不随 Windows 程序运行。

## 数据与 AI

所有程序数据、浏览器缓存、临时文件和日志都放在 `UTA.exe` 旁边的 `uta-data` 文件夹。菜单“UTA → 打开数据文件夹”可打开它。程序没有自动迁移原网页浏览器的资料；先在网页“设置 → 数据管理”导出 `.uta-backup`，再在 EXE 的相同入口导入。

备份保存时会弹出文件选择框，默认位置为 `uta-data\backups`。恢复会先展示预览，确认后替换当前学习数据。移动程序前关闭窗口，并连同 `uta-data` 一起复制。

在“设置 → AI 服务”中取消“使用服务端默认配置”，选择供应商、填写地址、模型和 API Key，测试成功后保存。勾选“记住密钥”时使用 Windows 系统加密存储；不勾选时只保存于当前会话。API Key 不进入学习备份。系统加密的密钥跨 Windows 用户或电脑后需重新填写。

也可在 `uta-data\config.env` 中填写服务端环境配置，例如 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL`。重启程序生效。该文件需要自行保管，不随软件发布。

## 项目开发

项目根目录是 `E:\project\UTA-exe`，Git 分支为 `Windows-exe`。

首次安装开发依赖：运行 `安装 Windows 开发环境.cmd`。构建：运行 `构建 Windows 程序.cmd`。二者将依赖与缓存保存在项目内。也可执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 setup
npm.cmd run windows:package
npm.cmd run desktop:dev
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 test
```

`desktop/` 是窗口、进程与协议实现；`src/` 是共享学习界面；`server/desktop_api.py` 是受本次会话密钥保护的本地服务；`desktop/backend.spec` 冻结 Python 与词典；`scripts/package-windows.mjs` 生成便携目录。打包会排除私人歌曲、歌词、API Key 和学习记录。

本地已有的 `server\data\tomoshi-dict-open.db` 用于打包词义功能。全新克隆请先按照项目安装脚本下载词典；缺失时打包会报错。开发用 Python 环境不是用户运行 EXE 的必要条件。

## 故障处理与更新

启动失败时查看 `uta-data\logs\desktop.log`。缺少文件时重新解压完整发布包。程序通过每次启动自动分配的本机端口提供注音，不占用原网页的 8000 / 5173 端口。

菜单“帮助 → 查看 Windows 版更新”打开项目 Release 页面，由用户自行下载 Windows 发布包。更新前退出程序，保留 `uta-data`；不要用 Android APK 更新 Windows 版。

发布程序尚未购买代码签名证书，Windows 可能显示未知发布者。是否允许运行由用户自行决定。第三方软件和词典的来源及授权见程序内 `licenses` 文件夹与“第三方数据说明.md”。
