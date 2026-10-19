// 必须在应用模块之前执行。构建目标只转换语法，不会自动补齐旧 WebView 缺少的标准方法。
import 'core-js/actual/object/has-own.js'
import 'core-js/actual/array/at.js'
import 'core-js/actual/string/at.js'
import 'core-js/actual/string/replace-all.js'

// 旧内核没有 randomUUID，但已有安全随机数；保持聊天、来源及备份标识正常，不使用弱随机数替代。
export function installRandomUUID(cryptoObject=globalThis.crypto){
  if(!cryptoObject||typeof cryptoObject.randomUUID==='function'||typeof cryptoObject.getRandomValues!=='function')return
  Object.defineProperty(cryptoObject,'randomUUID',{configurable:true,writable:true,value:function(){
    const bytes=cryptoObject.getRandomValues(new Uint8Array(16))
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128
    const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('')
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  }})
}
installRandomUUID()
