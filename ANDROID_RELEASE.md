# Android 双平台发布

Android 代码只维护在 `android-dev`。每次发布与代码上传仍需用户当次授权；累计达到 10 项只提醒。

用户固定约定：GitHub 同时发布 Android 代码和 APK，Gitee 只发布 APK。除非用户特别要求，后续发布均沿用这个分工，不再重复确认目标；Gitee 字体资源保持原样，不推送 Android 源码。

正式 APK 同时上传到：

- GitHub：`meilawiet/Japanese-song-learning-website`
- Gitee：`git277992790/UTA`，与字体资源共用仓库，通过 Release 附件保存 APK。

应用优先检查 Gitee 正式发行版，下载失败时自动回退同版本的 GitHub APK。Gitee 不可用、没有完整 APK 信息或尚无发行版时，检查 GitHub。下载后验证完整 SHA256、包名、发行签名及版本。

## 生成发布计划

先完成测试、正式构建与签名，并核对 README。下面的命令仅检查本地 APK、显示大小和摘要，不上传文件：

```powershell
node scripts/publish-android.mjs --version 1.4.1 --apk .tools/releases/UTA-Android-1.4.1.apk --notes .tools/release-notes.md
```

环境需要 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT`、Java 与 Android build-tools。脚本会核对真实 APK 的包名、版本和发行证书。

## 已获授权时发布

1. 复核 README，把本批代码提交并推送到 `android-dev`；核对工作区干净与远端提交一致。
2. 只在本机环境提供 `GITEE_ACCESS_TOKEN`；GitHub 使用 `GITHUB_TOKEN` 或已有系统 Git 凭据助手。令牌不写入代码、脚本参数或安装包。
3. 读取并核对 Gitee UTA 的 `master` 提交，将该 SHA 作为 `--gitee-commit`。它是资源仓库提交，不是 Android 源码提交。
4. 执行同一命令并增加 `--gitee-commit 实际40位SHA --publish`。脚本不会推送代码或强制移动已有标签；已有同版本内容不一致时停止。

脚本先创建 GitHub 草稿和 Gitee 预发布，向两端上传同一份 APK。GitHub 附件 digest 以及 Gitee 匿名下载完整文件均与本地核对后，才转为正式发行；最后再读两端公开元数据核验。失败时保留暂存状态，不结转累计清单；排查后可继续相同参数的发布。

Gitee 的附件 API 不提供 SHA256，所以脚本在发行说明末尾加入 `uta-apk` HTML 注释，绑定标签、附件名、大小、摘要。用户界面会移除这段元数据，只显示更新内容。不要手动删掉此注释，也不要上传独立 `.sha256` 附件。

两端发布、源码推送、标签与附件核验全部完成后，才更新 `RELEASE_BACKLOG.json` 和本机 `TASK_HANDOFF.md`。已安装只支持 GitHub 更新的旧版需先升级到包含双源功能的版本，此后才能优先使用 Gitee。
