import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { defaultPort } = require('./scripts/dev.config.cjs')

function rendererManualChunks(id) {
  const normalizedId = id.replace(/\\/g, '/')
  if (!normalizedId.includes('/node_modules/')) return undefined
  if (normalizedId.includes('/monaco-editor/')) return 'vendor-monaco'
  if (normalizedId.includes('/element-plus/') || normalizedId.includes('/@element-plus/')) return 'vendor-element-plus'
  if (normalizedId.includes('/@xterm/')) return 'vendor-xterm'
  if (normalizedId.includes('/vue/') || normalizedId.includes('/@vue/')) return 'vendor-vue'
  return 'vendor'
}

function suppressKnownRollupWarnings(warning, defaultHandler) {
  const warningText = String(warning?.message || '')
  const warningId = String(warning?.id || '')
  if (warning?.code === 'INVALID_ANNOTATION' && (warningId.includes('@vueuse/core') || warningText.includes('@vueuse/core'))) return
  defaultHandler(warning)
}

export default defineConfig({
  base: './',
  plugins: [vue({
    template: {
      compilerOptions: {
        isCustomElement: tag => tag === 'webview'
      }
    }
  })],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.APP_DEV_PORT || defaultPort),
    strictPort: true
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 8192,
    rollupOptions: {
      output: {
        manualChunks: rendererManualChunks
      },
      onwarn: suppressKnownRollupWarnings
    }
  }
})
