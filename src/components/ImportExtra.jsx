import {useState} from 'react'

// 展开时才挂载联网/封面组件，折叠时取消请求；父层持有文件和歌词草稿。
export default function ImportExtra({title,children}){
  const [open,setOpen]=useState(false)
  return <details className="import-extra" onToggle={event=>setOpen(event.currentTarget.open)}><summary>{title}</summary>{open&&children}</details>
}
