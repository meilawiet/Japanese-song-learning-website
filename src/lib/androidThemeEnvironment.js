import {registerPlugin} from '@capacitor/core'
import {App} from '@capacitor/app'
import {applyAppearance,readAppearance,THEMES} from './appearance.js'
import {resolvePalette,setSystemDark} from './themePalette.js'
const native=registerPlugin('UtaAppearance')
// 安卓系统配置变化直接通知前端，不轮询、不重启Activity；回到前台再补读一次。
export function startAndroidThemeEnvironment(){
  let alive=true,systemListener,appListener
  const syncChrome=()=>{const value=readAppearance(),palette=resolvePalette(value,THEMES.find(t=>t.id===value.theme));native.setChrome({color:palette.page,dark:palette.dark}).catch(()=>{})}
  const changed=value=>{if(!alive)return;setSystemDark(value.dark);applyAppearance(readAppearance())}
  native.getSystemTheme().then(changed).catch(()=>{})
  native.addListener('systemThemeChange',changed).then(handle=>{if(alive)systemListener=handle;else handle.remove()}).catch(()=>{})
  App.addListener('appStateChange',state=>{if(state.isActive)native.getSystemTheme().then(changed).catch(()=>{})}).then(handle=>{if(alive)appListener=handle;else handle.remove()}).catch(()=>{})
  const media=window.matchMedia?.('(prefers-color-scheme: dark)'),fromMedia=event=>changed({dark:event.matches})
  media?.addEventListener?.('change',fromMedia)
  window.addEventListener('uta:appearance-changed',syncChrome)
  return()=>{alive=false;systemListener?.remove();appListener?.remove();media?.removeEventListener?.('change',fromMedia);window.removeEventListener('uta:appearance-changed',syncChrome)}
}
