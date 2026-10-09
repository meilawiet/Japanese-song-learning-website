// 同步周期使用秒：默认一天，0 停止定时检查；拒绝小数、负数和无效字符。
export const DEFAULT_SYNC_SECONDS=86400
export function parseSyncSeconds(value) {
  const text=String(value).trim(),seconds=Number(text)
  if(!/^\d+$/.test(text)||!Number.isSafeInteger(seconds)||seconds<0||seconds>Math.floor(Number.MAX_SAFE_INTEGER/1000))throw new Error('同步间隔只能填写 0 或正整数，单位为秒。')
  return seconds
}
export function syncSeconds(config) {return parseSyncSeconds(config.syncSeconds??DEFAULT_SYNC_SECONDS)}
export function syncDue(config,lastCheck,now=Date.now()) {const seconds=syncSeconds(config);return Boolean(config.auto&&seconds>0&&lastCheck>0&&now-lastCheck>=seconds*1000)}
