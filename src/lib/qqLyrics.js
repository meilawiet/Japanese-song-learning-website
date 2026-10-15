import {decryptQrc} from 'qrc-decoder'

/*!
 * QQ lyric decoding dependencies (MIT):
 * qrc-decoder 1.0.2 - Copyright (c) [2025] [apoint123]
 * Original LyricDecoder - Copyright (c) 2019 SuJiKiNen
 * pako - Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// QQ 的辅助轨可能是明文、UTF-8 Base64 或十六进制 QRC；仅解码歌词，不访问音频接口。
const stamp=time=>`[${String(Math.floor(time/60000)).padStart(2,'0')}:${((time%60000)/1000).toFixed(3).padStart(6,'0')}]`
const xmlText=value=>value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(entity,key)=>{
  if(key[0]==='#'){
    const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1))
    return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):entity
  }
  return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key.toLowerCase()]
})

export function decodeQQTrack(value){
  let text=String(value||'').trim()
  if(!text)return ''
  // 约束异常响应的处理范围，拒绝把错误页面或编码串当歌词导入。
  if(text.length>2_000_000)throw new Error('QQ 音乐歌词数据过大。')
  const hex=content=>/^(?:[0-9a-f]{2})+$/i.test(content)&&content.length%16===0
  if(hex(text))text=decryptQrc(text)
  else if(!text.includes('[')&&!text.startsWith('<')){
    text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text),char=>char.charCodeAt(0)))
    if(hex(text.trim()))text=decryptQrc(text.trim())
  }
  // 只提取固定歌词属性并解码实体，不执行 XML、脚本或外部实体。
  if(text.trim().startsWith('<')){
    const content=text.match(/\bLyricContent\s*=\s*(["'])([\s\S]*?)\1/i)
    if(!content)throw new Error('QQ 音乐逐字歌词格式异常。')
    text=xmlText(content[2])
  }
  // 将 QRC 的毫秒句首和逐字时间码转换成现有逐句时间轴，保留词间空格和来源文字。
  const rows=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(line=>{
    const row=line.match(/^\[(\d+),(\d+)\](.*)$/)
    return row?stamp(Number(row[1]))+row[3].replace(/\(\d+,\d+\)/g,''):line
  })
  if(!rows.some(line=>/^\[\d{1,3}:[0-5]\d(?:\.\d{1,3})?\]/.test(line)))throw new Error('QQ 音乐没有返回可用的时间轴歌词。')
  return rows.join('\n')
}

// 翻译里的 // 是平台空译文占位，不显示、不计入真实翻译数量。
export function cleanQQTranslation(text){
  return text.split(/\r?\n/).filter(line=>!/^\[\d{1,3}:[0-5]\d(?:\.\d{1,3})?\]\s*\/\/\s*$/.test(line)).join('\n')
}
