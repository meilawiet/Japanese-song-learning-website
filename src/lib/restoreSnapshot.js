const CHUNK_BYTES = 4 * 1024 * 1024

// Await durable publication before the caller begins replacing any data.
// Chunked IPC keeps large music libraries out of a single giant message.
export async function saveRestoreSnapshot(blob, bridge, onProgress = () => {}) {
  if (!bridge?.beginRestoreSnapshot) throw new Error('自动快照服务不可用，请重新打开最新版 UTA。')
  const { id } = await bridge.beginRestoreSnapshot()
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      await bridge.appendRestoreSnapshot(id, await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer())
      onProgress(Math.round(Math.min(offset + CHUNK_BYTES, blob.size) / blob.size * 100))
    }
    return await bridge.finishRestoreSnapshot(id)
  } catch (error) {
    await bridge.abortRestoreSnapshot(id).catch(() => {})
    throw error
  }
}
