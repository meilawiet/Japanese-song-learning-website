import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newerAppVersion,selectAppRelease,UPDATE_REPOSITORY} from '../src/lib/appUpdate.js'
const release={tag_name:'v1.10.0',body:'更新说明',assets:[{name:'UTA.apk',browser_download_url:`https://github.com/${UPDATE_REPOSITORY}/releases/download/v1.10.0/UTA.apk`}]}
// 下载完整性校验必须来自合法 GitHub 附件摘要，不能接受截断或伪造格式。
test('更新保留完整 SHA256 摘要，缺失或无效摘要不传入安装下载器',()=>{
  const hash='a'.repeat(64)
  assert.equal(selectAppRelease({...release,assets:[{...release.assets[0],digest:`sha256:${hash}`}]},'1.0').sha256,hash)
  for(const digest of [undefined,'sha256:abc',`md5:${hash}`,`sha256:${hash}extra`])assert.equal(selectAppRelease({...release,assets:[{...release.assets[0],digest}]},'1.0').sha256,'')
})
// 检查数字版本顺序与官方下载来源，防止旧包或非官方链接被当成更新。
test('按版本数字比较，兼容当前测试版本与正式版本',()=>{
  assert.equal(newerAppVersion('v1.10.0','1.9-test-dev'),true)
  assert.equal(newerAppVersion('1.8','1.9'),false)
  assert.equal(newerAppVersion('v1.9.0','1.9'),false)
  assert.equal(newerAppVersion('1.9','1.9-test'),true)
  assert.equal(newerAppVersion('bad','1.9'),false)
})
test('只提示有正式APK的官方Release，拒绝外站、调试包和预发布',()=>{
  assert.equal(selectAppRelease(release,'1.9').newer,true)
  assert.equal(selectAppRelease(release,'1.11').newer,false)
  assert.equal(selectAppRelease({...release,prerelease:true},'1.9').available,false)
  assert.equal(selectAppRelease({...release,assets:[{name:'UTA.apk',browser_download_url:'https://example.com/UTA.apk'}]},'1.9').available,false)
  assert.equal(selectAppRelease({...release,assets:[{...release.assets[0],name:'app-debug.apk'}]},'1.9').available,false)
})

// 发布说明的符号只按 Markdown 行首规则处理，正文中的井号或连字符仍保留。
import {parseUpdateNotes} from '../src/lib/appUpdate.js'
test('更新说明标题去井号，连续项目渲染为同一圆点列表',()=>{
  assert.deepEqual(parseUpdateNotes('## UTA 1.0.3\n\n### 更新内容\n- 第一条\n- 第二条\n---'),[{type:'heading',text:'UTA 1.0.3'},{type:'heading',text:'更新内容'},{type:'list',items:['第一条','第二条']}])
})
test('普通文本符号与远程 HTML 保留为文本，不转成 HTML',()=>{
  assert.deepEqual(parseUpdateNotes('C# 与 A-B\n<script>示例</script>'),[{type:'text',text:'C# 与 A-B'},{type:'text',text:'<script>示例</script>'}])
})
