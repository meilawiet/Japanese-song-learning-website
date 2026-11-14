import { useLayoutEffect, useRef, useState } from 'react'

export default function DesktopSongTitle({ id, title }) {
  const heading = useRef(null)
  const trigger = useRef(null)
  const dialog = useRef(null)
  const [clipped, setClipped] = useState(false)

  useLayoutEffect(() => {
    const element = heading.current
    const measure = () => setClipped(element.scrollHeight > element.clientHeight + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    document.fonts.addEventListener('loadingdone', measure)
    measure()
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [title])

  return <>
    <h1 id={id} ref={heading} className="desktop-song-title">{title}</h1>
    <button ref={trigger} className="desktop-full-song-title" type="button" hidden={!clipped}
      onClick={() => dialog.current.showModal()}>查看完整歌名</button>
    <dialog ref={dialog} className="workspace-unsaved-dialog desktop-full-song-dialog"
      aria-labelledby={id + '-full'} onClose={() => trigger.current?.focus({ preventScroll: true })}>
      <header><h2 id={id + '-full'}>完整歌名</h2><button type="button" onClick={() => dialog.current.close()}>关闭</button></header>
      <p>{title}</p>
    </dialog>
  </>
}
