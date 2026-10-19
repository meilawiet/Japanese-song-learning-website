# Repository workflow

- Before every GitHub sync or push, review `README.md` against the current user-facing features and setup steps. Update it in the same commit when anything is missing or outdated.
- Never commit API keys, browser-local data, copyrighted song files, or generated local song data.

- Sync to GitHub only when the user explicitly requests it. Ordinary updates stay local.
- When a sync is requested, compare with the last successful GitHub sync and include the accumulated local changes after that point.
- For future explicitly requested GitHub releases, also upload the same release archives and checksum files to https://gitee.com/mzh18392597195/uta-windows . Gitee is for release downloads only: never sync or push source code there. When its 100 MB attachment limit prevents uploading a full ZIP, split that exact ZIP into parts below the limit and provide a Windows merge-and-SHA256-check tool; do not substitute a different build. Ordinary local changes still do not trigger publishing.
