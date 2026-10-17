import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMMUNITY_INVITE_KEY, INVITE_FIRST_DELAY, INVITE_INTERVAL, readInvitePreference, claimInviteDisplay, setInviteOptOut } from '../src/lib/communityInvite.js'

// 使用隔离存储和虚拟日期验证真实频率，不更改设备时间或用户数据。
const start = Date.UTC(2026, 9, 16)
function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('新用户在满三天前不提醒，边界时才能显示', () => {
  const storage = memoryStorage()
  assert.deepEqual(readInvitePreference(storage, start), { firstSeenAt: start, lastShownAt: 0, optedOut: false })
  assert.equal(claimInviteDisplay(storage, start + INVITE_FIRST_DELAY - 1), null)
  assert.equal(claimInviteDisplay(storage, start + INVITE_FIRST_DELAY).lastShownAt, start + INVITE_FIRST_DELAY)
})

test('显示即记录，重启后不足三十天不重复，恰好三十天可再次显示', () => {
  const storage = memoryStorage(), shown = start + INVITE_FIRST_DELAY
  readInvitePreference(storage, start)
  assert.ok(claimInviteDisplay(storage, shown))
  assert.equal(claimInviteDisplay(storage, shown), null)
  assert.equal(claimInviteDisplay(storage, shown + INVITE_INTERVAL - 1), null)
  assert.equal(claimInviteDisplay(storage, shown + INVITE_INTERVAL).lastShownAt, shown + INVITE_INTERVAL)
})

test('不再提醒在重启和长期等待后仍生效，取消勾选不清空展示时间', () => {
  const storage = memoryStorage(), shown = start + INVITE_FIRST_DELAY
  readInvitePreference(storage, start); claimInviteDisplay(storage, shown)
  assert.equal(setInviteOptOut(storage, true, shown), true)
  assert.equal(claimInviteDisplay(storage, shown + 2 * INVITE_INTERVAL), null)
  assert.equal(setInviteOptOut(storage, false, shown + 2 * INVITE_INTERVAL), true)
  assert.equal(readInvitePreference(storage, shown + 2 * INVITE_INTERVAL).lastShownAt, shown)
})

test('损坏偏好重新给予三天宽限，时间字段损坏也不丢失明确的不再提醒', () => {
  const storage = memoryStorage()
  for (const raw of ['bad-json', '{}', 'null', JSON.stringify({ firstSeenAt: '1', lastShownAt: -1 })]) {
    storage.setItem(COMMUNITY_INVITE_KEY, raw)
    assert.equal(claimInviteDisplay(storage, start), null)
    assert.equal(readInvitePreference(storage, start).firstSeenAt, start)
  }
  storage.setItem(COMMUNITY_INVITE_KEY, JSON.stringify({ optedOut: true }))
  assert.equal(claimInviteDisplay(storage, start + 100 * INVITE_INTERVAL), null)
  assert.equal(readInvitePreference(storage, start + 100 * INVITE_INTERVAL).optedOut, true)
})

test('系统时钟回拨保守等待，不让未来时间或异常写入触发连续弹窗', () => {
  const storage = memoryStorage()
  storage.setItem(COMMUNITY_INVITE_KEY, JSON.stringify({ firstSeenAt: start, lastShownAt: start + INVITE_FIRST_DELAY, optedOut: false }))
  assert.equal(claimInviteDisplay(storage, start - 1000), null)
  assert.equal(readInvitePreference(storage, start - 1000).lastShownAt, start - 1000)
  const badRead = { getItem() { throw new Error('unavailable') } }
  const badWrite = { getItem: () => null, setItem() { throw new Error('quota') } }
  assert.equal(claimInviteDisplay(badRead, start), null)
  assert.equal(claimInviteDisplay(badWrite, start), null)
  assert.equal(setInviteOptOut(badWrite, true, start), false)
  const dueReadOnly = { getItem: () => JSON.stringify({ firstSeenAt: start, lastShownAt: 0, optedOut: false }), setItem() { throw new Error('quota') } }
  assert.equal(claimInviteDisplay(dueReadOnly, start + INVITE_FIRST_DELAY), null)
})
