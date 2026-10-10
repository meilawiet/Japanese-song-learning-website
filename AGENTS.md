# Repository workflow

- Before every GitHub sync or push, review `README.md` against the current user-facing features and setup steps. Update it in the same commit when anything is missing or outdated.
- Never commit API keys, browser-local data, copyrighted song files, or generated local song data.

- Sync to GitHub only when the user explicitly requests it. Ordinary updates stay local.
- When a sync is requested, compare with the last successful GitHub sync and include the accumulated local changes after that point.
