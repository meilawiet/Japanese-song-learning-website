export const newEditHistory = present => ({ present, past: [], future: [] })
export function editHistoryReducer(history, action) {
  if (action.type === 'undo') {
    if (!history.past.length) return history
    return { present: history.past.at(-1), past: history.past.slice(0, -1), future: [history.present, ...history.future] }
  }
  if (action.type === 'redo') {
    if (!history.future.length) return history
    return { present: history.future[0], past: [...history.past, history.present], future: history.future.slice(1) }
  }
  if (action.type === 'edit') return { present: { ...history.present, ...action.patch }, past: [...history.past, history.present].slice(-100), future: [] }
  return history
}
