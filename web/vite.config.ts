import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readBuildInfo } from './build-info'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const build = readBuildInfo()

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(build.sha),
    __BUILD_FULL_SHA__: JSON.stringify(build.fullSha),
    __BUILD_DIRTY__: JSON.stringify(build.dirty),
  },
  resolve: {
    alias: {
      '@engine': path.resolve(dirname, '../src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    port: 5173,
  },
})
