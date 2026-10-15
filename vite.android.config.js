import { fileURLToPath } from 'node:url'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// QQ 解码依赖的许可随正式 APK 保存，避免压缩时丢失版权声明。
import {qqLyricLicenses} from './scripts/qqLyricLicenses.mjs'

// Android 安装包仅包含仓库里的原创示例，不复制电脑本地的歌曲文件。
const emptySongsFile = fileURLToPath(new URL('./src/data/androidSongs.js', import.meta.url))
// 手机离线注音只打包压缩词典，避免把电脑上的 Python 词典或私人歌曲放入 APK。
const offlineDictDir = fileURLToPath(new URL('./node_modules/@faanau/kuromoji/dict/', import.meta.url))
const offlineTokenizer = fileURLToPath(new URL('./node_modules/@faanau/kuromoji/src/kuromoji.js', import.meta.url))
// Android 打包器会把 .gz 自动解压并去掉后缀；使用 .bin 保留词典的 gzip 内容。
const browserDictionaryLoader = fileURLToPath(new URL('./src/lib/AndroidDictionaryLoader.cjs', import.meta.url))

export default defineConfig({
  // 原插件列表仅包含 React 和词典复制；增加歌词格式依赖许可复制。
  // plugins: [react(), {
  plugins: [react(), qqLyricLicenses(), {
    name: 'copy-offline-japanese-dictionary',
    writeBundle(options) {
      const target = join(options.dir, 'uta-dict')
      mkdirSync(target, { recursive: true })
      for (const name of readdirSync(offlineDictDir).filter((file) => file.endsWith('.dat.gz'))) {
        copyFileSync(join(offlineDictDir, name), join(target, name.replace(/\.gz$/u, '.bin')))
      }
    },
  }],
  // 替换本机生成的歌曲清单，防止私人歌词被写入手机安装包。
  resolve: {
    alias: [
      { find: './data/songs.generated', replacement: emptySongsFile },
      // 浏览器端使用词典下载器，不读取 Node 文件系统。
      { find: '@faanau/kuromoji', replacement: offlineTokenizer },
      { find: './loader/NodeDictionaryLoader', replacement: browserDictionaryLoader },
    ],
  },
  // 网页配置会把 song 文件夹复制进 dist；手机测试包跳过该文件夹。
  publicDir: false,
})
