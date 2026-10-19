# Repository workflow

- Android development and APK releases are maintained on `android-dev`. Commit and push Android work only to that branch; do not merge into or push `main` without the user's explicit request. The web collaborator maintains a separate branch.
- Before every GitHub sync or push, review `README.md` against the current user-facing features and setup steps. Update it in the same commit when anything is missing or outdated.
- Never commit API keys, browser-local data, copyrighted song files, or generated local song data.

# 任务接续与累计发布（2026-10-15 用户约定）

- 接手 Android 任务时先阅读 `TASK_HANDOFF.md`（本机完整交接）和 `RELEASE_BACKLOG.json`（待发布清单），再核对 Git、版本及设备实际状态。旧 `ANDROID_APP_HANDOFF.md` 仅作历史参考，早期阶段计划不能覆盖最新约定。
- 每完成并验证一项独立、面向用户的功能或修复，就更新累计清单和交接文档；同一问题的多文件修改、多首歌词验证只计一项。文档、构建、清理缓存、重复测试不计入产品改动。
- 用户选择累计 **10 项**后提醒考虑发版。运行 `node scripts/release-status.mjs` 查看数量；达到阈值仅提醒并记录提醒结果，不自动发版、不自动上传代码，延期不清零。
- 用户补充（2026-10-19）：达到 10 项待发布内容时，提醒中必须同时逐项展示当前全部待发布内容的名称和简要说明，不能只报告数量；以累计清单中 verified 的条目为准，排除 released 和 cancelled。
- 公开发布 APK、GitHub 远程写入和代码推送必须得到用户针对当次操作的明确同意；历史发版授权不延续到下一批。授权真机测试、构建或覆盖安装不等于授权发布和上传。
- 仅在已获授权的发布和代码推送均成功、版本/提交/附件核验完成后，将对应条目标记 `released` 并记录证据。失败或仅本地安装仍保留待发布项；新版本号由当次发布决定。
- `TASK_HANDOFF.md` 应能单独发给新对话使用，必须包含当前进度、累计数量、验证范围、未完成事项和约定。它是本机交接文件，不提交 GitHub；可提交的累计清单不得包含用户歌词、设备私有数据或凭据。

# Android release presentation

- 用户固定发布分工（2026-10-17）：GitHub `meilawiet/Japanese-song-learning-website` 同时发布 Android 源码和正式 APK，源码只推送 `android-dev`；Gitee `git277992790/UTA` 只发布正式 APK，不上传 Android 源码。除非用户特别要求，后续不再重新询问发布目标分工；每一批是否发布/上传仍依照当次授权。
- 后续获准发版时，同一正式 APK 必须同时发布到 GitHub `meilawiet/Japanese-song-learning-website` 和 Gitee `git277992790/UTA` 的 Release。应用优先检查、下载 Gitee，失败才回退 GitHub；两个来源必须对应同版本、同 APK SHA256，原生签名校验继续保留。
- 使用 `scripts/publish-android.mjs` 先生成发布计划，用户明确授权当次发布和上传后才执行 `--publish`。Gitee 附件必须匿名完整下载验摘要；两平台均成功核验后，才将本批待发布项结转。Gitee 为资源与发行仓库，不向其推送安卓源码或覆盖字体文件。
- 后续 GitHub Release 保留简洁的更新内容，不添加“升级说明”章节。
- 发布附件只上传正式 APK，不上传独立的 `.sha256` 文件。本地校验及应用更新使用的 GitHub APK asset digest、发行签名校验继续保留。
