export function mergeDesktopTask(tasks, id, patch, historyLimit = 20) {
  const found = tasks.some(task => task.id === id)
  const next = found ? tasks.map(task => task.id === id ? { ...task, ...patch } : task)
    : [{ id, state: 'queued', done: 0, total: 0, ...patch }, ...tasks]
  let completed = 0
  return next.filter(task => task.state !== 'done' || completed++ < historyLimit)
}
export function groupDesktopTasks(tasks) {
  return {
    attention: tasks.filter(task => ['failed', 'cancelled'].includes(task.state)),
    active: tasks.filter(task => ['queued', 'running', 'cancelling'].includes(task.state)),
    completed: tasks.filter(task => task.state === 'done'),
  }
}
export function canCancelDesktopTask(task) {
  return ['queued', 'running'].includes(task.state) && task.cancellable !== false
}
export function desktopTaskSongId(task) {
  return task.songId || (/^(ai|annotation):/.test(task.id) ? task.id.slice(task.id.indexOf(':') + 1) : null)
}
