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
