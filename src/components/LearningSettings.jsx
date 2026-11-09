import {useState} from 'react'
import {Browser} from '@capacitor/browser'
import {BookOpen,ChevronRight} from 'lucide-react'
import {JAPANESE_LEVELS} from '../lib/japaneseLevel.js'
import {readLocalProfile,saveLocalProfile} from '../lib/localProfile.js'
import {anki,readAnkiDeck,retryAnkiDeckRead,saveAnkiDeck} from '../lib/ankiSettings.js'

export default function LearningSettings({japaneseLevel,teachingMode,onTeachingModeChange,onOpenAnki}){
  const [error,setError]=useState('')
  const deck=readAnkiDeck()
  async function changeLevel(level){
    setError('')
    try{await saveLocalProfile({...readLocalProfile(),japaneseLevel:level,japaneseLevelPrompted:true})}
    catch{setError('无法保存日语水平，请检查本机存储。')}
  }
  return <section className="settings-content">
    <label className="settings-field">日语水平<select value={japaneseLevel} onChange={event=>changeLevel(event.target.value)}>
      {JAPANESE_LEVELS.map(level=><option key={level.id} value={level.id}>{level.label}</option>)}
    </select></label>
    <label className="settings-field">AI 讲解模式<select value={teachingMode} onChange={event=>onTeachingModeChange(event.target.value)}>
      <option value="concise">简略模式</option><option value="detailed">详细模式</option>
    </select></label>
    <p className="settings-hint">简略模式每句的单词和语法各最多 2 项。日语水平用于后续生成的讲解。</p>
    {error&&<p className="settings-message error" role="alert">{error}</p>}
    <nav className="settings-directory data-directory" aria-label="复习配置">
      <button type="button" onClick={onOpenAnki}><BookOpen size={22}/><span>复习配置 · Anki{deck?.name&&<small>{deck.name}</small>}</span><ChevronRight size={20}/></button>
    </nav>
  </section>
}

export function AnkiSettingsPanel(){
  const [decks,setDecks]=useState(null),[saved,setSaved]=useState(readAnkiDeck)
  const [busy,setBusy]=useState(''),[error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [newDeckName,setNewDeckName]=useState(null)
  const current=decks?.find(deck=>deck.id===saved?.id)

  // 只有用户主动连接才触发系统授权，选择牌组后供歌词页制卡共用。
  async function connect(){
    setBusy('connect');setError('');setSuccess('')
    try{
      const result=await retryAnkiDeckRead(()=>anki.connect())
      setDecks(result.decks)
      // 每次测试或刷新都以这一次的连接结果为准。
      setSuccess('连接成功')
    }catch(failure){setError(failure.message||'无法连接 AnkiDroid。')}
    finally{setBusy('')}
  }
  function choose(id){
    const deck=decks.find(item=>item.id===id)??null
    try{saveAnkiDeck(deck);setSaved(deck);setError('')}
    catch{setError('无法保存牌组，请检查本机存储。')}
  }
  async function createDeck(event){
    event.preventDefault()
    const name=newDeckName?.trim()
    if(busy||!name)return
    setBusy('create');setError('');setSuccess('')
    try{
      const deck=await retryAnkiDeckRead(()=>anki.createDeck({name}))
      setDecks(previous=>[...previous,deck])
      setNewDeckName(null)
      // 牌组已在 AnkiDroid 写入，单独处理 UTA 默认牌组保存失败。
      try{
        saveAnkiDeck(deck)
        setSaved(deck)
        setSuccess('牌组已创建，并设为默认牌组。')
      }catch{setError('牌组已创建，但无法保存为默认牌组。请在列表中重新选择。')}
    }catch(failure){setError(failure.message||'无法创建 Anki 牌组。')}
    finally{setBusy('')}
  }
  return <section className="settings-content">
    <h3>用 Anki 复习歌词单词</h3>
    <p className="settings-description">Anki 是按复习间隔安排记忆卡片的工具。手机上使用 AnkiDroid，UTA 可以把单词、歌词、片段音频和讲解添加到你的牌组。</p>
    {/* 官网入口只保留文字链接。 */}
    <p className="settings-description"><a className="anki-website-link" href="https://apps.ankiweb.net/" onClick={event=>{
      event.preventDefault()
      Browser.open({url:event.currentTarget.href}).catch(()=>setError('无法打开 Anki 官网。'))
    }}>Anki 官网</a></p>
    <ol className="anki-setup-steps">
      <li>安装并打开 AnkiDroid。</li>
      <li>回到这里点「测试连接」，允许 UTA 添加和更新卡片。</li>
      <li>选择默认牌组或在这里创建一个，再到歌词页使用「加入 Anki」。</li>
    </ol>
    <div className="settings-form-actions anki-connect-action">
      <span aria-hidden="true"/>
      {/* <button type="button" onClick={()=>Browser.open({url:'https://ankidroid.org/'}).catch(()=>setError('无法打开 AnkiDroid 官网。'))}>打开 AnkiDroid 官网</button> */}
      <button type="button" className="settings-primary" disabled={Boolean(busy)} onClick={connect}>{busy==='connect'?'连接中…':decks?'刷新牌组':'测试连接'}</button>
    </div>
    {success&&<p className="settings-message success" role="status">{success}</p>}
    {decks?<><label className="settings-field">默认 Anki 牌组<select disabled={Boolean(busy)} value={current?.id??''} onChange={event=>choose(event.target.value)}>
      <option value="">未设置</option>{decks.map(deck=><option key={deck.id} value={deck.id}>{deck.name}</option>)}
    </select></label>
      {/* 连接后才显示创建入口，在同一页保存和选择。 */}
      {newDeckName===null?<div className="settings-form-actions anki-connect-action">
        <span aria-hidden="true"/><button type="button" disabled={Boolean(busy)} onClick={()=>setNewDeckName('')}>创建牌组</button>
      </div>:<form onSubmit={createDeck}>
        <label className="settings-field">牌组名称<input value={newDeckName} disabled={Boolean(busy)} onChange={event=>setNewDeckName(event.target.value)} placeholder="例如 日语歌词"/></label>
        <div className="settings-form-actions">
          <span aria-hidden="true"/>
          <button type="button" disabled={Boolean(busy)} onClick={()=>{setNewDeckName(null);setError('')}}>取消</button>
          <button type="submit" className="settings-primary" disabled={Boolean(busy)||!newDeckName.trim()}>{busy==='create'?'创建中…':'确认创建'}</button>
        </div>
      </form>}
    </>:<p className="settings-hint">{saved?.name?`当前牌组 ${saved.name}`:'连接后可以选择或创建默认牌组。'}</p>}
    {decks&&saved&&!current&&<p className="settings-hint">之前选择的牌组已不在列表中，请重新选择。</p>}
    {error&&<p className="settings-message error" role="alert">{error}</p>}
  </section>
}
