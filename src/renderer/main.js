import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { Terminal } from '@xterm/xterm'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@xterm/xterm/css/xterm.css'
import App from './App.vue'
import './styles.css'

window.Terminal = Terminal

function reportApplicationError(source, error, details = {}) {
  const normalizedError = error instanceof Error ? error : new Error(error?.message || String(error || '未知错误'))
  console.error(`[${source}]`, normalizedError, details)
  const appendLog = window.whSSH?.appendApplicationLog
  if (typeof appendLog !== 'function') return
  Promise.resolve(appendLog({
    level: 'error',
    source,
    message: normalizedError.message,
    stack: normalizedError.stack || '',
    details
  })).then(result => {
    if (result?.ok === false) console.warn('[application-log] 写入失败', result.error || '未知错误')
  }).catch(appendError => {
    console.warn('[application-log] 写入失败', appendError)
  })
}

window.reportApplicationError = reportApplicationError

window.addEventListener('error', event => {
  reportApplicationError('runtime-error', event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  })
})

window.addEventListener('unhandledrejection', event => {
  reportApplicationError('unhandled-rejection', event.reason)
})

const app = createApp(App)

app.config.errorHandler = (error, instance, info) => {
  reportApplicationError('vue-error', error, { info, component: instance?.type?.name || instance?.type?.__name || '' })
}

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus).mount('#app')
