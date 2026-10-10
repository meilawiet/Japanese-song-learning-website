# Repository workflow

- Android development and APK releases are maintained on `android-dev`. Commit and push Android work only to that branch; do not merge into or push `main` without the user's explicit request. The web collaborator maintains a separate branch.
- Before every GitHub sync or push, review `README.md` against the current user-facing features and setup steps. Update it in the same commit when anything is missing or outdated.
- Never commit API keys, browser-local data, copyrighted song files, or generated local song data.

# Android release presentation

- 后续 GitHub Release 保留简洁的更新内容，不添加“升级说明”章节。
- 发布附件只上传正式 APK，不上传独立的 `.sha256` 文件。本地校验及应用更新使用的 GitHub APK asset digest、发行签名校验继续保留。
