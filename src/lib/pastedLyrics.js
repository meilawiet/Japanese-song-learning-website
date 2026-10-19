// 粘贴内容包装为 UTF-8 文件，复用既有歌词解析、预览和保存，不另建数据格式。
export function pastedLyricsFile(value) {
  const text = String(value ?? '')
  if (!text.trim()) throw new Error('请先粘贴歌词。')
  if (text.length > 500_000) throw new Error('粘贴内容过长，请分批整理或使用歌词文件导入。')
  return new File([text], '粘贴歌词.txt', { type: 'text/plain;charset=utf-8' })
}
