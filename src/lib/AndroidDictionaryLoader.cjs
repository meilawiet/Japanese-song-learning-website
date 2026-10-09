/*
 * Based on BrowserDictionaryLoader from @faanau/kuromoji.
 * Copyright 2014 Takuya Asano; Copyright 2010-2014 Atilika Inc. and contributors.
 * Licensed under the Apache License, Version 2.0.
 */
'use strict'

const DictionaryLoader = require('../../node_modules/@faanau/kuromoji/src/loader/DictionaryLoader')

function AndroidDictionaryLoader(path) {
  DictionaryLoader.apply(this, [path])
}
AndroidDictionaryLoader.prototype = Object.create(DictionaryLoader.prototype)

// 词典逻辑仍请求 .dat.gz；映射到 APK 内保持压缩的 .dat.bin 文件。
AndroidDictionaryLoader.prototype.loadArrayBuffer = function (url, callback) {
  fetch(url.replace(/\.dat\.gz$/u, '.dat.bin'))
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`)
      if (typeof DecompressionStream === 'undefined') throw new Error('手机浏览器不支持离线词典解压。')
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    })
    .then((buffer) => callback(null, buffer), (error) => callback(error, null))
}

module.exports = AndroidDictionaryLoader
