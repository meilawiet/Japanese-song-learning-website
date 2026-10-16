import { readFileSync } from 'node:fs';

// 中文说明：只读取本地清单并报告数量；本脚本不修改文件、不联网、不触发发布或推送。
const backlog = JSON.parse(readFileSync(new URL('../RELEASE_BACKLOG.json', import.meta.url), 'utf8'));
const allowedStatuses = new Set(['planned', 'in_progress', 'verified', 'released']);
if (!Number.isInteger(backlog.reminderThreshold) || backlog.reminderThreshold < 1 || !Array.isArray(backlog.items)) {
  throw new Error('累计清单格式错误：需要正整数提醒阈值及条目数组。');
}
const ids = new Set();
for (const item of backlog.items) {
  // 中文说明：唯一编号防止重复计数，缺少验证记录的条目不能算作已验证。
  if (!item.id || ids.has(item.id) || !item.title || !allowedStatuses.has(item.status)) {
    throw new Error('累计清单存在重复编号、空标题或不支持的状态。');
  }
  ids.add(item.id);
  if (['verified', 'released'].includes(item.status) && !item.verification?.length) {
    throw new Error(`${item.id} 缺少验证记录。`);
  }
  if (item.status === 'released' && !(item.release?.version && item.release?.commit && item.release?.url)) {
    throw new Error(`${item.id} 缺少已发布版本、提交及链接。`);
  }
}

// 中文说明：仅统计验证完成但未公开发布的独立改动，发布历史保留在同一清单中。
const pending = backlog.items.filter((item) => item.status === 'verified');
console.log(`当前待发布：${pending.length}/${backlog.reminderThreshold} 项`);
for (const item of pending) console.log(`- ${item.id}：${item.title}`);
if (pending.length < backlog.reminderThreshold) {
  console.log(`再累计 ${backlog.reminderThreshold - pending.length} 项后提醒考虑发版。`);
} else {
  const remindedIds = new Set(backlog.reminder?.lastRemindedItemIds ?? []);
  const reminderAlreadyRecorded = pending.every((item) => remindedIds.has(item.id));
  console.log(reminderAlreadyRecorded
    ? '已记录本批提醒，请按用户决定继续；未发布条目保持累计。'
    : '已达到提醒数量：请向用户询问是否发版，并记录提醒及回复。');
}
console.log('公开发包及上传代码均需用户明确同意；本地构建或覆盖安装不代表发布授权。');
