// 回归实际Android构建目标与压缩后的首次调用，避免仅源码单测漏过转译作用域错误。
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {transform} from 'esbuild'
test('Chrome80目标压缩后可在首次启动读取系统主题，缺少接口也安全回退',async()=>{
  const source=readFileSync(new URL('../src/lib/themePalette.js',import.meta.url),'utf8')
  const {code}=await transform(source,{target:'chrome80',minify:true,format:'cjs'})
  for(const dark of [true,false,null]){
    const module={exports:{}},host=dark==null?{}:{matchMedia(){assert.equal(this,host);return {matches:dark}}}
    runInNewContext(code,{module,exports:module.exports,window:host})
    assert.equal(module.exports.effectiveMode({mode:'system'}),dark?'dark':'light')
    assert.equal(module.exports.effectiveMode({mode:'light'}),'light')
    assert.equal(module.exports.effectiveMode({mode:'dark'}),'dark')
  }
})
