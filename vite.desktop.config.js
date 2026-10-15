import { defineConfig, mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import webConfig from './vite.config.js'
import { qqLyricLicenses } from './scripts/qqLyricLicenses.mjs'

// A distributable contains original demos; personal songs enter through Import.
export default mergeConfig(webConfig, defineConfig({
  plugins: [qqLyricLicenses()],
  publicDir: false,
  resolve: { alias: [{ find: './data/songs.generated', replacement: fileURLToPath(new URL('./src/data/androidSongs.js', import.meta.url)) }] },
  define: { 'import.meta.env.VITE_ANNOTATION_API_URL': JSON.stringify('uta://app') },
  build: { outDir: 'dist-desktop', emptyOutDir: true },
}))
