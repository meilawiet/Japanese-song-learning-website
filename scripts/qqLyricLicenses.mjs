import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'

// 压缩器可能移除源码注释；把歌词解码依赖的许可另存为随网页及 APK 分发的文本。
export function qqLyricLicenses(){
  return {name:'copy-qq-lyric-licenses',writeBundle(options){
    const directory=join(options.dir,'licenses')
    mkdirSync(directory,{recursive:true})
    const notices=[
      'QQ lyric format decoding dependencies\nOriginal LyricDecoder: Copyright (c) 2019 SuJiKiNen (MIT; same permission terms below).',
      ...['qrc-decoder','pako'].map(name=>`${name}\n${readFileSync(fileURLToPath(new URL(`../node_modules/${name}/LICENSE`,import.meta.url)),'utf8')}`),
      // pako 的底层 zlib 端口另有 zlib 许可，按已锁定依赖的源码头部一并保留。
      'pako zlib port\n'+readFileSync(fileURLToPath(new URL('../node_modules/pako/lib/zlib/inflate.js',import.meta.url)),'utf8').split('const adler32')[0].replace(/^'use strict';\s*/,''),
    ]
    writeFileSync(join(directory,'qq-lyrics.txt'),notices.join('\n\n'),'utf8')
  }}
}
