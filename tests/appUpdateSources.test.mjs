import assert from 'node:assert/strict'
import {test} from 'node:test'
import {GITEE_UPDATE_API,GITEE_UPDATE_REPOSITORY,UPDATE_API,UPDATE_REPOSITORY,isOfficialAppDownloadUrl,parseUpdateNotes,selectLatestAppRelease} from '../src/lib/appUpdate.js'
import {downloadAppRelease,fetchPreferredAppRelease} from '../src/lib/appUpdateTransport.js'
import {prepareAndroidRelease,publishAndroidRelease} from '../scripts/androidRelease.mjs'

const artifact=prepareAndroidRelease('1.5.0',Buffer.from('APK test bytes'),'### 更新内容\n- 测试')
const release=source=>({tag_name:artifact.tag,body:artifact.body,assets:[{name:artifact.name,digest:artifact.digest,size:artifact.bytes.length,browser_download_url:`https://${source}.com/${source==='gitee'?GITEE_UPDATE_REPOSITORY:UPDATE_REPOSITORY}/releases/download/${artifact.tag}/${artifact.name}`}]})
const selected=()=>selectLatestAppRelease([release('gitee')],'1.4.0','gitee')

// Gitee 优先可避免国内用户在正常情况下等待 GitHub；校验信息缺失必须回退而非跳过验证。
test('优先使用 Gitee，校验注释不出现在更新说明中',async()=>{
  const urls=[]
  const result=await fetchPreferredAppRelease('1.4.0',async url=>{urls.push(url);return {status:200,data:[release('gitee')]}})
  assert.deepEqual(urls,[GITEE_UPDATE_API])
  assert.equal(result.source,'gitee');assert.equal(result.newer,true)
  assert.equal(result.sha256,artifact.digest.slice(7))
  assert.equal(result.fallbackUrl,release('github').assets[0].browser_download_url)
  assert.equal(result.notes,'### 更新内容\n- 测试')
  assert.deepEqual(parseUpdateNotes(artifact.body),[{type:'heading',text:'更新内容'},{type:'list',items:['测试']}])
})

test('Gitee 尚无发行版、网络失败或摘要缺失时继续检查 GitHub',async()=>{
  for(const initial of [{status:200,data:[]},{status:200,data:[{...release('gitee'),body:'没有摘要'}]},{status:403},{status:200,data:'<html>login</html>'},new Error('timeout')]) {
    const urls=[]
    const result=await fetchPreferredAppRelease('1.4.0',async url=>{urls.push(url);if(url===GITEE_UPDATE_API){if(initial instanceof Error)throw initial;return initial}return {status:200,data:[{tag_name:'windows-v9.0.0'},release('github')]}})
    assert.deepEqual(urls,[GITEE_UPDATE_API,UPDATE_API]);assert.equal(result.source,'github')
  }
  await assert.rejects(fetchPreferredAppRelease('1.4.0',async()=>{throw new Error('offline')}),/offline/)
})

test('Gitee 摘要绑定版本与附件，拒绝其他仓库和非法地址',()=>{
  for(const body of [artifact.body.replace('v1.5.0','v1.6.0'),artifact.body.replace(artifact.name,'other.apk'),`${artifact.body}\n${artifact.body}`]) {
    assert.equal(selectLatestAppRelease([{...release('gitee'),body}],'1.4.0','gitee').available,false)
  }
  for(const url of ['http://gitee.com/git277992790/UTA/releases/download/v1.5.0/app.apk','https://gitee.com/other/UTA/releases/download/v1.5.0/app.apk','https://gitee.com:444/git277992790/UTA/releases/download/v1.5.0/app.apk','https://gitee.com/git277992790/UTA/releases/download/v1.5.0/app.apk?access_token=x','https://gitee.com/git277992790/UTA/raw/master/app.apk'])assert.equal(isOfficialAppDownloadUrl(url,'gitee'),false)
})

// 两次下载均用同一 SHA256，用户取消后绝不能自动换源继续下载。
test('Gitee 下载失败自动回退同摘要 GitHub，成功或取消后不再请求',async()=>{
  const calls=[]
  const result=await downloadAppRelease(selected(),async args=>{calls.push(args);if(calls.length===1)throw new Error('mirror unavailable');return {ready:true,version:'1.5.0'}})
  assert.equal(result.ready,true);assert.equal(calls.length,2)
  assert.ok(calls[0].url.startsWith('https://gitee.com/'));assert.ok(calls[1].url.startsWith('https://github.com/'))
  assert.ok(calls.every(call=>call.sha256===artifact.digest.slice(7)&&call.version==='1.5.0'))
  let attempts=0
  assert.equal((await downloadAppRelease(selected(),async()=>{attempts++;return {cancelled:true}})).cancelled,true)
  assert.equal(attempts,1)
  let cancelled=false;attempts=0
  assert.equal((await downloadAppRelease(selected(),async()=>{attempts++;cancelled=true;throw new Error('aborted')},()=>cancelled)).cancelled,true)
  assert.equal(attempts,1)
})

// 用隔离的 API 替身验证发布顺序，不创建任何线上发行版。
function publicationFixture({badMirror=false,badCredential=false}={}) {
  const states={},events=[]
  const request=async(input,options={})=>{
    const url=new URL(input),method=options.method||'GET',source=url.hostname.includes('github')?'github':'gitee',path=url.pathname
    if(method!=='GET')events.push({source,method,path})
    const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
    if(path.endsWith('/user'))return response({},badCredential&&source==='gitee'?401:200)
    if(path.endsWith('/git/ref/heads/android-dev'))return response({object:{sha:'code-sha'}})
    if(path.endsWith('/branches/master'))return response({commit:{sha:'resource-sha'}})
    if(path.includes('/git/ref/tags/'))return states.github?response({object:{sha:'code-sha'}}):response({},404)
    if(path.includes('/releases/download/')) { events.push({source,method:'VERIFY'});return new Response(badMirror?'login page':artifact.bytes) }
    if(path.includes('/releases/tags/'))return states[source]?response(states[source]):response({},404)
    if(path.endsWith('/releases')&&method==='POST') {
      states[source]={...JSON.parse(options.body),id:source==='github'?1:2,assets:[],upload_url:'https://uploads.github.com/repos/test/releases/1/assets{?name}'}
      return response(states[source])
    }
    if(method==='POST') {
      if(source==='github')assert.deepEqual(options.body,artifact.bytes)
      else assert.deepEqual(Buffer.from(await options.body.get('file').arrayBuffer()),artifact.bytes)
      states[source].assets=release(source).assets
      return response(states[source].assets[0])
    }
    // Gitee实际接口要求这三个字段必填，不能让模拟接口接受线上会HTTP400的精简请求。
    if(method==='PATCH'){
      const body=JSON.parse(options.body)
      if(source==='gitee')for(const field of ['name','tag_name','body'])assert.ok(body[field],`Gitee PATCH缺少${field}`)
      Object.assign(states[source],body)
    }
    return response(states[source])
  }
  return {request,events,states}
}
test('双平台上传同一 APK，匿名校验成功后才将两端转为正式发行',async()=>{
  const fixture=publicationFixture()
  const result=await publishAndroidRelease({artifact,commit:'code-sha',giteeCommit:'resource-sha',githubToken:'test-gh',giteeToken:'test-gt',request:fixture.request})
  assert.equal(result.digest,artifact.digest)
  assert.equal(fixture.states.github.draft,false);assert.equal(fixture.states.gitee.prerelease,false)
  const verify=fixture.events.findIndex(event=>event.method==='VERIFY')
  assert.ok(fixture.events.filter(event=>event.method==='PATCH').every(event=>fixture.events.indexOf(event)>verify))
})
test('镜像内容不一致不正式发布，任一凭据无效时不进行远端写入',async()=>{
  for(const scenario of [{badMirror:true},{badCredential:true}]) {
    const fixture=publicationFixture(scenario)
    await assert.rejects(publishAndroidRelease({artifact,commit:'code-sha',giteeCommit:'resource-sha',githubToken:'test-gh',giteeToken:'test-gt',request:fixture.request}))
    assert.equal(fixture.events.some(event=>event.method==='PATCH'),false)
    if(scenario.badCredential)assert.deepEqual(fixture.events,[])
  }
})
