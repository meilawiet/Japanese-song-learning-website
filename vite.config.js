import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Keep user-provided full-song audio in /song instead of duplicating it under
  // /public. Vite serves these files at the site root in development and copies
  // them into dist for a production build.
  publicDir: 'song',
})
