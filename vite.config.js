import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
// 网页构建同样携带 QQ 歌词解码依赖的许可文本。
import {qqLyricLicenses} from './scripts/qqLyricLicenses.mjs'
import {startupCompatibility} from './scripts/startupCompatibility.mjs'

// 网页构建也会解析手机专用的动态模块；将 Node 入口替换成浏览器可打包的入口。
const offlineTokenizer = fileURLToPath(new URL('./node_modules/@faanau/kuromoji/src/kuromoji.js', import.meta.url))
const browserDictionaryLoader = fileURLToPath(new URL('./src/lib/AndroidDictionaryLoader.cjs', import.meta.url))

export default defineConfig({
  // 原插件：plugins: [react()],
  // 原插件：plugins: [react(),qqLyricLicenses()]；网页入口同样注入守卫并携带新增补丁许可。
  plugins: [react(),qqLyricLicenses(),startupCompatibility()],
  resolve: { alias: [
    { find: '@faanau/kuromoji', replacement: offlineTokenizer },
    { find: './loader/NodeDictionaryLoader', replacement: browserDictionaryLoader },
  ] },
  // Keep user-provided full-song audio in /song instead of duplicating it under
  // /public. Vite serves these files at the site root in development and copies
  // them into dist for a production build.
  publicDir: 'song',
})
