import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {startupCompatibility,viewportUnitFallback} from '../scripts/startupCompatibility.mjs'

// 在独立进程删除旧内核缺失的方法，验证真实导入顺序与补丁语义，不影响其他测试进程。
test('启动前补齐标准方法，不把继承属性误判为自有属性，UUID使用安全随机数',()=>{
 const module=new URL('../src/lib/webviewCompatibility.js',import.meta.url).href
 const result=spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';
  delete Object.hasOwn;delete Array.prototype.at;delete String.prototype.at;delete String.prototype.replaceAll;
  const {installRandomUUID}=await import(${JSON.stringify(module)});
  assert.equal(Object.hasOwn(Object.create({a:1}),'a'),false);assert.equal(Object.hasOwn({a:1},'a'),true);
  assert.equal([1,2].at(-1),2);assert.equal([1,2].at(3),undefined);assert.equal('あいう'.at(-2),'い');
  assert.equal('aa'.replaceAll('a','$&!'),'a!a!');assert.throws(()=>'aa'.replaceAll(/a/,'b'),TypeError);
  const {webcrypto}=await import('node:crypto');const safe={getRandomValues:array=>webcrypto.getRandomValues(array)};
  installRandomUUID(safe);const id=safe.randomUUID();assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.notEqual(id,safe.randomUUID());
  const existing=()=> 'existing';const native={randomUUID:existing};installRandomUUID(native);assert.equal(native.randomUUID,existing);
  const unavailable={};installRandomUUID(unavailable);assert.equal(unavailable.randomUUID,undefined);
 `],{encoding:'utf8'})
 assert.equal(result.status,0,result.stderr)
})
function guard(){
 const ids=['root','uta-starting','uta-startup-failure','uta-startup-retry','uta-startup-copy','uta-startup-diagnostics','uta-startup-notice'],elements=Object.fromEntries(ids.map(id=>[id,{hidden:id.includes('failure')||id.includes('diagnostics'),value:'',focus(){},select(){},addEventListener(name,handler){this[name]=handler}}]))
 const handlers={},timers=new Map();let timerId=0,reloads=0
 const window={addEventListener(name,handler){handlers[name]=handler}},context={window,document:{readyState:'complete',getElementById:id=>elements[id],querySelector:()=>({content:'1.5.1'}),execCommand:()=>true},navigator:{userAgent:'TestWebView/89'},location:{reload(){reloads++}},setTimeout(handler){timers.set(++timerId,handler);return timerId},clearTimeout(id){timers.delete(id)}}
 runInNewContext(readFileSync(new URL('../src/startupGuard.js',import.meta.url),'utf8'),context)
 return {elements,handlers,timers,window,reloads:()=>reloads}
}
test('脚本失败/超时显示独立重试页，成功启动取消计时，迟到的成功可从超时恢复',()=>{
 const failed=guard();failed.handlers.error({target:failed.window,error:new TypeError('private secret')})
 assert.equal(failed.elements['uta-startup-failure'].hidden,false);assert.equal(failed.elements.root.hidden,true)
 failed.elements['uta-startup-copy'].click();assert.match(failed.elements['uta-startup-diagnostics'].value,/TestWebView\/89/);assert.doesNotMatch(failed.elements['uta-startup-diagnostics'].value,/private secret/)
 failed.elements['uta-startup-retry'].click();assert.equal(failed.reloads(),1)
 const passed=guard();passed.window.utaStartup.ready();assert.equal(passed.timers.size,0);passed.handlers.error({target:passed.window,error:new Error('late')});assert.equal(passed.elements['uta-startup-failure'].hidden,true)
 const slow=guard();[...slow.timers.values()][0]();assert.equal(slow.elements['uta-startup-failure'].hidden,false);slow.window.utaStartup.ready();assert.equal(slow.elements['uta-startup-failure'].hidden,true)
})
test('安卓启动页不请求在线字体，网页保留字体，视口单位先提供旧内核回退',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
 const android=startupCompatibility({android:true}).transformIndexHtml.handler(html),web=startupCompatibility().transformIndexHtml.handler(html)
 assert.doesNotMatch(android,/<link[^>]*https:\/\/fonts\./);assert.match(web,/<link[^>]*https:\/\/fonts\.googleapis/)
 assert.match(android,/window.utaStartup/);assert.doesNotMatch(android,/%UTA_APP_VERSION%/)
 let fallback;viewportUnitFallback.Declaration({value:'calc(100dvh - 24px)',cloneBefore:value=>{fallback=value.value}});assert.equal(fallback,'calc(100vh - 24px)')
 assert.ok(android.indexOf('window.utaStartup')<android.indexOf('/src/main.jsx'))
})
