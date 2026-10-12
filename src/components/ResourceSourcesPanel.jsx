import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { readResourceSources, saveResourceSources, sourceAdapter, validateResourceSource } from '../lib/resourceSources'

// 用户配置来源后立即保存；普通网站只提供浏览器入口，不宣称任意网址都能自动爬取。
export default function ResourceSourcesPanel() {
  const [sources, setSources] = useState(readResourceSources)
  const [draft, setDraft] = useState({name:'',url:''})
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  function persist(list) { setSources(saveResourceSources(list)); setError(''); setMessage('来源已保存。') }
  function save(event) {
    event.preventDefault()
    try {
      const source = validateResourceSource(draft)
      persist(draft.id ? sources.map(item => item.id === draft.id ? source : item) : [...sources, source])
      setDraft({name:'',url:''})
    } catch (reason) {setError(reason.message);setMessage('')}
  }
  function remove(id) {
    try { persist(sources.filter(item=>item.id!==id)); if(draft.id===id)setDraft({name:'',url:''}) } catch(reason){setError(reason.message)}
  }
  return <section className="resource-sources-panel"><h3>歌曲与歌词来源</h3><p className="settings-description">添加、修改或删除联网查找的来源。配置只保存在当前设备。</p>
    <div className="resource-source-list">{sources.map(source=><article key={source.id}><div><strong>{source.name}</strong><small>{source.url}</small><small>{sourceAdapter(source) ? '支持应用内歌词搜索' : '浏览器打开网站'}</small></div><button type="button" aria-label={`编辑来源 ${source.name}`} onClick={()=>{setDraft({...source});setError('');setMessage('')}}><Pencil size={18}/></button><button type="button" aria-label={`删除来源 ${source.name}`} onClick={()=>remove(source.id)}><Trash2 size={18}/></button></article>)}</div>
    {!sources.length && <p>尚未配置来源，请在下方添加。</p>}
    <form className="resource-source-form" onSubmit={save}><h4>{draft.id?'编辑来源':'添加来源'}</h4><label>来源名称<input name="resource-name" value={draft.name} maxLength={60} onChange={event=>setDraft({...draft,name:event.target.value})} placeholder="可留空，自动从网址识别"/></label><label>来源网址<input name="resource-url" type="text" inputMode="url" value={draft.url} maxLength={2000} onChange={event=>setDraft({...draft,url:event.target.value})} placeholder="https://example.com/"/></label><small>网址中的 {'{query}'} 会替换成搜索关键词。已适配平台会启用应用内搜索；其他网址仅在浏览器打开，不会自动解析任意网站。</small><div><button type="submit"><Plus size={16}/>{draft.id?'保存修改':'添加来源'}</button>{draft.id&&<button type="button" onClick={()=>setDraft({name:'',url:''})}>取消编辑</button>}</div></form>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>
}
