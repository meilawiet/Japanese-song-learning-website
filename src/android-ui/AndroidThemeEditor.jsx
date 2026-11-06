import {createPortal} from 'react-dom'
import ThemePreview from './ThemePreview.jsx'
// 图片手势与防误触滑条：旧布局保留baseline，正式源不变。
import SafeRange from './SafeRange.jsx'
import BackgroundGestureDialog from './BackgroundGestureDialog.jsx'
import {useEffect,useRef,useState} from 'react'
import {THEMES,readAppearance} from '/src/lib/appearance.js'
import {LIGHT_COLORS,DARK_COLORS,normalizeThemeOptions,resolvePalette} from '/src/lib/themePalette.js'
import {loadThemeBackground,importThemeBackground,removeThemeBackground} from '/src/lib/themeBackground.js'
import {withBackgroundColors} from '/src/lib/backgroundColors.js'

// 布局参考Fushi的移动端紧凑吸顶预览/分组色槽，界面与实现均为UTA自身组件。
function ColorRole({label,value,onChange}){
  const [draft,setDraft]=useState(value),[invalid,setInvalid]=useState(false)
  useEffect(()=>{setDraft(value);setInvalid(false)},[value])
  function commit(){if(/^#[0-9a-f]{6}$/i.test(draft)){onChange(draft);setInvalid(false)}else{setInvalid(true);setDraft(value)}}
  return <label className="theme-role-tile"><span>{label}</span><div><input type="color" aria-label={`${label}取色`} value={value} onChange={event=>onChange(event.target.value)}/><input type="text" aria-label={`${label}HEX`} value={draft} maxLength={7} spellCheck={false} autoCapitalize="none" onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit()}}}/></div>{invalid&&<small role="alert">请填写#加六位颜色值。</small>}</label>
}
export default function AndroidThemeEditor({appearance,onChange}){
  const [image,setImage]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[,refresh]=useState(0),fileInput=useRef(null),[adjusting,setAdjusting]=useState(false),[previewHost,setPreviewHost]=useState(null),[previewPatch,setPreviewPatch]=useState({})
  const options=normalizeThemeOptions({...appearance,mode:appearance.mode||'light'}),preset=THEMES.find(t=>t.id===appearance.theme)||THEMES[0],palette=resolvePalette(appearance,preset),mode=palette.mode,colors=options.customColors[mode],background=options.background
  useEffect(()=>{let active=true;loadThemeBackground().then(value=>{if(active)setImage(value)}).catch(()=>{if(active)setError('背景图片读取失败，可重新选择图片。')});const changed=()=>refresh(n=>n+1);window.addEventListener('uta:appearance-changed',changed);return()=>{active=false;window.removeEventListener('uta:appearance-changed',changed)}},[])
  useEffect(()=>{setPreviewHost(document.getElementById('demo-theme-preview-slot'))},[])
  const change=patch=>onChange({...appearance,...patch})
  // 重新开启背景也按当前图片取色；位置/遮罩滑块只改自身，不反复覆盖用户的微调颜色。
  const changeBackground=patch=>patch.enabled&&image?.seed?onChange(withBackgroundColors({...appearance,background:{...background,...patch}},image.seed)):change({background:{...background,...patch}})
  function color(key,value){change({customEnabled:true,customColors:{...options.customColors,[mode]:{...colors,[key]:value}}})}
  // 原导入只启用图片：onChange({...readAppearance(),background:{...background,enabled:true}})。新图自动生成浅深两套颜色。
  async function importImage(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;setBusy(true);setError('');try{const next=await importThemeBackground(file);setImage(next);onChange(withBackgroundColors({...readAppearance(),background:{...background,enabled:true,x:50,y:50,zoom:1}},next.seed))}catch(e){setError(e.message||'图片导入失败。')}finally{setBusy(false)}}
  async function removeImage(){setBusy(true);setError('');try{await removeThemeBackground();setImage(null);changeBackground({enabled:false})}catch{setError('背景移除失败，请重试。')}finally{setBusy(false)}}
  // 旧固定bb遮罩与静态预览保留baseline；现在所有图片参数使用同一预览。
  const livePreview=<ThemePreview palette={palette} image={image} background={{...background,...previewPatch}}/>
  return <div className="android-theme-editor">
    {previewHost?createPortal(livePreview,previewHost):livePreview}
    <section className="theme-editor-section"><h3>显示模式</h3><div className="theme-mode-options" role="group" aria-label="显示模式">{[['light','浅色'],['dark','深色'],['system','跟随系统']].map(([id,label])=><button key={id} type="button" aria-pressed={(appearance.mode||'light')===id} onClick={()=>change({mode:id})}>{label}</button>)}</div><p className="theme-section-note">明暗与配色独立，跟随系统会即时响应手机的深浅模式。</p></section>
    <section className="theme-editor-section"><div className="theme-section-title"><h3>主题配色</h3><button type="button" className="theme-text-action" onClick={()=>change({customEnabled:false})}>恢复预设</button></div><div className="theme-preset-grid">{THEMES.map(theme=><button key={theme.id} type="button" aria-pressed={!appearance.customEnabled&&appearance.theme===theme.id} onClick={()=>change({theme:theme.id,customEnabled:false})}><span className="theme-swatches" aria-hidden="true">{theme.colors.map(color=><i key={color} style={{background:color}}/>)}</span>{theme.name}</button>)}</div><button type="button" className="theme-custom-toggle" aria-pressed={Boolean(appearance.customEnabled)} onClick={()=>change({customEnabled:!appearance.customEnabled})}>自定义配色</button>
    {appearance.customEnabled&&<><p className="theme-section-note">正在编辑{mode==='dark'?'深色':'浅色'}配色；两套分别保存。底色明度与文字自动适配，保证阅读清晰。</p><div className="theme-role-grid"><ColorRole label="强调色" value={colors.accent} onChange={value=>color('accent',value)}/><ColorRole label="页面底色" value={colors.page} onChange={value=>color('page',value)}/><ColorRole label="卡片底色" value={colors.surface} onChange={value=>color('surface',value)}/><div className="theme-auto-text"><span>文字与边框</span><strong style={{color:palette.text,background:palette.surface}}>Aa 日语</strong><small>自动适配</small></div></div><button className="theme-text-action" type="button" onClick={()=>change({customColors:{...options.customColors,[mode]:mode==='dark'?DARK_COLORS:LIGHT_COLORS}})}>重置当前{mode==='dark'?'深色':'浅色'}配色</button></>}
    </section>
    {/* 原背景说明含“最大15 MB”；用户取消大小限制，仍说明自动缩小及本机保存。 */}
    <section className="theme-editor-section"><div className="theme-section-title"><h3>背景图片</h3>{image?.url&&<button className="theme-text-action" type="button" disabled={busy} onClick={removeImage}>移除背景</button>}</div><div className="theme-image-tools"><button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}>{busy?'处理中…':image?.url?'更换图片':'选择本地图片'}</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择背景图片" hidden onChange={importImage}/>{image?.name&&<small>{image.name}</small>}</div><p className="theme-section-note">支持 JPG、PNG、WebP，不限制图片大小。导入后自动缩小并提取主题配色，仅保存在当前手机。</p>
    {image?.url&&<><label className="theme-background-switch"><span>使用图片背景</span><input type="checkbox" checked={background.enabled} onChange={event=>changeBackground({enabled:event.target.checked})}/></label>{background.enabled&&<div className="theme-background-sliders gesture-background-options">
      <button type="button" className="gesture-position-button" onClick={()=>setAdjusting(true)}>调整位置与缩放<span>单指拖动 · 双指缩放</span></button>
      {[['veil','背景遮罩',70,95,'%'],['blur','模糊程度',0,12,'px'],['cardOpacity','卡片底色不透明度',0,100,'%']].map(([key,label,min,max,unit])=><SafeRange key={key} id={'background-'+key} label={label} min={min} max={max} unit={unit} value={background[key]} onPreview={next=>setPreviewPatch(previous=>{const patch={...previous};if(next==null)delete patch[key];else patch[key]=next;return patch})} onChange={next=>changeBackground({[key]:next})}/>)}
      <p className="theme-section-note">横向拖动调整数值，上下滑动只翻页。</p>
      <p className="theme-section-note">0% 透明，100% 实心，文字不变淡。作用于当前歌词、歌曲、复习及解析卡片；背景遮罩较高时，差别会减弱。</p>
    </div>}</>}
    </section>{adjusting&&image?.url&&<BackgroundGestureDialog image={image} background={background} onChange={changeBackground} onClose={()=>setAdjusting(false)}/>}{error&&<p className="theme-editor-error" role="alert">{error}</p>}
  </div>
}
