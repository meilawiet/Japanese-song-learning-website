import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'

// 将独立守卫放在所有业务脚本之前；安卓不依赖 Google 在线字体，字体仍来自现有本地字库。
export function startupCompatibility({android=false}={}){
  return {name:'uta-startup-compatibility',transformIndexHtml:{order:'pre',handler(html){
    const guard=readFileSync(new URL('../src/startupGuard.js',import.meta.url),'utf8')
    const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version
    let output=html.replace('<!-- UTA_STARTUP_GUARD -->',`<script>${guard}</script>`).replace('%UTA_APP_VERSION%',version)
    if(android)output=output.replace(/\s*<link\b[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi,'')
    return output
  }},writeBundle(options){
    // 标准库补丁的许可随 APK/网页分发，压缩时不会丢失。
    const target=join(options.dir,'licenses');mkdirSync(target,{recursive:true})
    writeFileSync(join(target,'core-js.txt'),readFileSync(fileURLToPath(new URL('../node_modules/core-js/LICENSE',import.meta.url)),'utf8'))
  }}
}
// 老内核不认识动态视口单位，先提供 vh/vw，再保留新内核的精确动态高度。
export const viewportUnitFallback={postcssPlugin:'uta-viewport-unit-fallback',Declaration(declaration){
  if(/\d(?:dvh|dvw)\b/.test(declaration.value))declaration.cloneBefore({value:declaration.value.replace(/d(vh|vw)\b/g,'$1')})
}}
