<template>
  <section class="pm2-detail-shell">
    <template v-if="process">
      <div class="pm2-detail-tabs">
        <el-tabs v-model="activeTabProxy" type="card" class="database-subtabbar pm2-detail-tabbar">
          <el-tab-pane label="概览" name="overview" />
          <el-tab-pane label="配置" name="config" />
          <el-tab-pane label="日志" name="logs" />
          <el-tab-pane label="终端" name="terminal" />
        </el-tabs>

        <div v-show="activeTabProxy === 'overview'" class="pm2-detail-tabpane pm2-detail-tabpane--fill">
          <div class="pm2-detail-grid pm2-detail-grid--summary">
            <article v-for="item in summaryItems" :key="item.key" :class="['pm2-detail-card', 'pm2-detail-card--stat', item.tone]">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </article>
          </div>
          <div class="pm2-detail-grid pm2-detail-grid--info pm2-detail-grid--fill">
            <article class="pm2-detail-card">
              <strong>运行配置</strong>
              <div class="pm2-detail-card-body">
                <table class="pm2-detail-table">
                  <tbody>
                    <tr v-for="item in runtimeConfigItems" :key="item.key" class="pm2-detail-table-row">
                      <th>{{ item.label }}</th>
                      <td>{{ item.value }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
            <article class="pm2-detail-card pm2-detail-card--tabbed">
              <el-tabs v-model="activeOverviewInfoTab" class="pm2-inline-tabbar">
                <el-tab-pane label="运行策略" name="policy">
                  <div class="pm2-detail-card-body">
                    <table class="pm2-detail-table">
                      <tbody>
                        <tr v-for="item in runtimePolicyItems" :key="item.key" class="pm2-detail-table-row">
                          <th>{{ item.label }}</th>
                          <td>{{ item.value }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </el-tab-pane>
                <el-tab-pane label="运行现场" name="state">
                  <div class="pm2-detail-card-body">
                    <table class="pm2-detail-table">
                      <tbody>
                        <tr v-for="item in runtimeStateItems" :key="item.key" class="pm2-detail-table-row">
                          <th>{{ item.label }}</th>
                          <td>{{ item.value }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </article>
          </div>
        </div>

        <div v-show="activeTabProxy === 'config'" class="pm2-detail-tabpane pm2-detail-tabpane--fill">
          <div class="pm2-detail-grid pm2-detail-grid--config pm2-detail-grid--fill">
            <article class="pm2-detail-card">
              <strong>环境变量摘要</strong>
              <div class="pm2-detail-card-body pm2-detail-card-body--stack">
                <table class="pm2-detail-table pm2-detail-table--compact">
                  <tbody>
                    <tr v-for="item in envMetaItems" :key="item.key" class="pm2-detail-table-row">
                      <th>{{ item.label }}</th>
                      <td>{{ item.value }}</td>
                    </tr>
                  </tbody>
                </table>
                <table class="pm2-detail-table">
                  <tbody>
                    <tr v-for="item in envSummaryItems" :key="item.key" class="pm2-detail-table-row">
                      <th>{{ item.key }}</th>
                      <td>{{ item.value }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
            <article class="pm2-detail-card pm2-detail-card--tabbed">
              <el-tabs v-model="activeConfigInfoTab" class="pm2-inline-tabbar">
                <el-tab-pane label="部署提示" name="deploy">
                  <div class="pm2-detail-card-body">
                    <table class="pm2-detail-table">
                      <tbody>
                        <tr v-for="item in deployItems" :key="item.key" class="pm2-detail-table-row">
                          <th>{{ item.label }}</th>
                          <td>{{ item.value }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </el-tab-pane>
                <el-tab-pane label="日志与文件" name="files">
                  <div class="pm2-detail-card-body">
                    <table class="pm2-detail-table">
                      <tbody>
                        <tr v-for="item in logItems" :key="item.key" class="pm2-detail-table-row">
                          <th>{{ item.label }}</th>
                          <td>{{ item.value }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </article>
          </div>
        </div>

        <div v-show="activeTabProxy === 'logs'" class="pm2-detail-tabpane pm2-detail-tabpane--fill">
          <div class="pm2-detail-grid pm2-detail-grid--bottom pm2-detail-grid--logs pm2-detail-grid--fill">
            <article class="pm2-detail-card pm2-detail-card--fill">
              <strong>最近日志</strong>
              <pre class="pm2-log-box">{{ process.logs.join('\n') }}</pre>
            </article>
          </div>
        </div>

        <div v-show="activeTabProxy === 'terminal'" class="pm2-detail-tabpane">
          <article class="pm2-terminal-shell-card">
            <div class="pm2-terminal-shell-head">
              <strong>PM2 命令终端</strong>
              <div class="pm2-terminal-shell-actions">
                <span>{{ process.cwd }}</span>
                <el-button plain size="small" :disabled="!terminalReady" @click="enterTerminalCwd">进入目录</el-button>
                <el-button plain size="small" :disabled="!terminalReady" @click="clearTerminalScreen">清空</el-button>
              </div>
            </div>

            <div class="terminal-box-wrap pm2-terminal-box-wrap" tabindex="0" @mousedown="focusTerminal" @keydown="handleTerminalKeydown">
              <div ref="terminalRef" class="terminal-box"></div>
            </div>
          </article>
        </div>
      </div>
    </template>

    <div v-if="!process" class="pm2-detail-empty">
      <strong>请选择左侧一个 PM2 应用</strong>
      <p>右侧会显示进程详情、运行配置、日志预览和常用操作。</p>
    </div>
  </section>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'

  const props = defineProps({
    process: {
      type: Object,
      default: null
    },
    sessionId: {
      type: String,
      default: ''
    },
    activeTab: {
      type: String,
      default: 'overview'
    }
  })

  const emit = defineEmits(['update:activeTab'])

  const terminalRef = ref(null)
  const terminalChannelId = ref('')
  const terminalReady = ref(false)
  const activeOverviewInfoTab = ref('policy')
  const activeConfigInfoTab = ref('deploy')

  let terminal = null
  let terminalResizeObserver = null
  let stopTerminalData = null
  let stopTerminalClosed = null
  let stopTerminalPaste = null

  const activeTabProxy = computed({
    get: () => props.activeTab || 'overview',
    set: value => emit('update:activeTab', value)
  })

  const summaryItems = computed(() => {
    if (!props.process) return []
    const status = String(props.process.status || '').trim().toLowerCase()
    const statusTone = status === 'online' ? 'active' : (status === 'errored' ? 'danger' : 'warning')
    const restartCount = Number(props.process.restarts || 0)
    return [
      { key: 'status', label: '状态', value: props.process.status, tone: statusTone },
      { key: 'instances', label: '实例', value: props.process.instances, tone: 'info' },
      { key: 'cpu', label: 'CPU', value: props.process.cpu, tone: 'cpu' },
      { key: 'memory', label: '内存', value: props.process.memory, tone: 'memory' },
      { key: 'uptime', label: '运行时长', value: props.process.uptime, tone: 'active' },
      { key: 'restarts', label: '重启次数', value: props.process.restarts, tone: restartCount > 0 ? 'danger' : 'info' }
    ]
  })

  function displayValue(value, fallback = '-') {
    const text = String(value ?? '').trim()
    return text || fallback
  }

  const runtimeConfigItems = computed(() => {
    if (!props.process) return []
    return [
      { key: 'cwd', label: '工作目录', value: displayValue(props.process.cwd) },
      { key: 'script', label: '启动脚本', value: displayValue(props.process.execPath || props.process.script) },
      { key: 'interpreter', label: '解释器', value: displayValue(props.process.interpreter) },
      { key: 'nodeArgs', label: 'Node 参数', value: displayValue(props.process.nodeArgs) },
      { key: 'scriptArgs', label: '脚本参数', value: displayValue(props.process.scriptArgs) },
      { key: 'ports', label: '监听端口', value: displayValue(props.process.ports) }
    ]
  })

  const runtimePolicyItems = computed(() => {
    if (!props.process) return []
    return [
      { key: 'autorestart', label: '自动重启', value: props.process.autorestart ? '开启' : '关闭' },
      { key: 'watch', label: '监控 watch', value: props.process.watch ? '开启' : '关闭' },
      { key: 'watchIgnore', label: '忽略监控', value: displayValue(props.process.watchIgnore) },
      { key: 'maxMemoryRestart', label: '内存重启', value: displayValue(props.process.maxMemoryRestart) },
      { key: 'restartDelay', label: '重启延迟', value: displayValue(props.process.restartDelay) },
      { key: 'cronRestart', label: '定时重启', value: displayValue(props.process.cronRestart) }
    ]
  })

  const runtimeStateItems = computed(() => {
    if (!props.process) return []
    return [
      { key: 'pid', label: '进程 PID', value: displayValue(props.process.pid) },
      { key: 'namespace', label: '命名空间', value: displayValue(props.process.namespace) },
      { key: 'user', label: '运行用户', value: displayValue(props.process.user) },
      { key: 'version', label: '应用版本', value: displayValue(props.process.version) },
      { key: 'createdAt', label: '创建时间', value: displayValue(props.process.createdAt) },
      { key: 'startedAt', label: '启动时间', value: displayValue(props.process.startedAt) }
    ]
  })

  const envMetaItems = computed(() => {
    if (!props.process) return []
    return [
      { key: 'envName', label: '环境名', value: displayValue(props.process.envName) },
      { key: 'envCount', label: '变量数', value: displayValue(props.process.envCount, '0') },
      { key: 'instanceVar', label: '实例变量', value: displayValue(props.process.instanceVar) }
    ]
  })

  const envSummaryItems = computed(() => {
    const list = Array.isArray(props.process?.envSummary) ? props.process.envSummary : []
    return list.length ? list : [{ key: '未读取到', value: '当前进程没有可展示的环境变量摘要' }]
  })

  const deployItems = computed(() => {
    if (!props.process) return []
    return [
      { key: 'execMode', label: '运行模式', value: displayValue(props.process.execMode) },
      { key: 'instances', label: '实例数量', value: displayValue(props.process.instances) },
      { key: 'restarts', label: '重启次数', value: displayValue(props.process.restarts) },
      { key: 'unstableRestarts', label: '异常重启', value: displayValue(props.process.unstableRestarts) },
      { key: 'minUptime', label: '最短存活', value: displayValue(props.process.minUptime) },
      { key: 'maxRestarts', label: '最大重试', value: displayValue(props.process.maxRestarts) },
      { key: 'listenTimeout', label: '监听超时', value: displayValue(props.process.listenTimeout) },
      { key: 'killTimeout', label: '结束超时', value: displayValue(props.process.killTimeout) },
      { key: 'expBackoffRestartDelay', label: '退避重启', value: displayValue(props.process.expBackoffRestartDelay) }
    ]
  })

  const logItems = computed(() => {
    if (!props.process) return []
    return [
      { key: 'outLogPath', label: '标准日志', value: displayValue(props.process.pmOutLogPath || props.process.outLogPath) },
      { key: 'errorLogPath', label: '错误日志', value: displayValue(props.process.pmErrorLogPath || props.process.errorLogPath) },
      { key: 'pidFile', label: 'PID 文件', value: displayValue(props.process.pidFile) },
      { key: 'logDateFormat', label: '日志时间', value: displayValue(props.process.logDateFormat) },
      { key: 'mergeLogs', label: '合并日志', value: displayValue(props.process.mergeLogs) },
      { key: 'watchPaths', label: '监控路径', value: displayValue(props.process.watchPaths) }
    ]
  })



  function escapeShellSingleQuotedValue(value) {
    return `'${String(value || '').replace(/'/g, `'\\''`)}'`
  }

  function buildCdCommand(targetPath) {
    return `cd -- ${escapeShellSingleQuotedValue(targetPath)}`
  }

  function getTerminalCellSize() {
    const internal = terminal?._core?._renderService?.dimensions?.css
    if (internal?.cell?.width && internal?.cell?.height) {
      return {
        width: internal.cell.width,
        height: internal.cell.height
      }
    }
    const measure = terminalRef.value?.querySelector?.('.xterm-char-measure-element')
    const rect = measure?.getBoundingClientRect?.()
    return {
      width: rect?.width || 8.4,
      height: rect?.height || 17
    }
  }

  function getTerminalViewportSize() {
    const hostRect = terminalRef.value?.getBoundingClientRect?.()
    if (!hostRect?.width || !hostRect?.height) {
      return { cols: 120, rows: 34 }
    }
    const cell = getTerminalCellSize()
    return {
      cols: Math.max(20, Math.floor((hostRect.width - 12) / cell.width)),
      rows: Math.max(8, Math.floor((hostRect.height - 12) / cell.height))
    }
  }

  function resizeTerminalToContainer() {
    if (!terminal || !terminalRef.value || activeTabProxy.value !== 'terminal') return
    const { cols, rows } = getTerminalViewportSize()
    if (terminal.cols !== cols || terminal.rows !== rows) {
      terminal.resize(cols, rows)
    }
    if (terminalChannelId.value && window?.whSSH?.resizeTerminal) {
      window.whSSH.resizeTerminal(terminalChannelId.value, cols, rows)
    }
  }

  function scheduleTerminalResize() {
    window.requestAnimationFrame(() => {
      resizeTerminalToContainer()
    })
  }

  function stabilizeTerminalLayout() {
    scheduleTerminalResize()
    window.setTimeout(() => {
      resizeTerminalToContainer()
      if (terminal?.refresh) terminal.refresh(0, Math.max(0, terminal.rows - 1))
    }, 60)
    window.setTimeout(() => {
      resizeTerminalToContainer()
      if (terminal?.refresh) terminal.refresh(0, Math.max(0, terminal.rows - 1))
    }, 180)
  }

  function setupTerminalResizeObserver() {
    if (!terminalRef.value || terminalResizeObserver || typeof window.ResizeObserver !== 'function') return
    terminalResizeObserver = new window.ResizeObserver(() => {
      scheduleTerminalResize()
    })
    terminalResizeObserver.observe(terminalRef.value)
  }

  function focusTerminal() {
    nextTick(() => {
      terminal?.focus()
      const helperTextarea = terminal?.textarea || terminalRef.value?.querySelector?.('.xterm-helper-textarea, .xterm-helpers textarea')
      if (helperTextarea) {
        try {
          helperTextarea.disabled = false
          helperTextarea.readOnly = false
          helperTextarea.value = ''
        } catch {}
      }
      if (helperTextarea?.focus) helperTextarea.focus({ preventScroll: true })
    })
  }

  function isTerminalCopyShortcut(event) {
    return !!event && !event.altKey && (event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'c'
  }

  function isTerminalPasteShortcut(event) {
    return !!event && !event.altKey && (event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'v'
  }

  function getTerminalDirectControlData(event) {
    if (!event || event.altKey || !(event.ctrlKey || event.metaKey)) return ''
    const key = String(event.key || '').toLowerCase()
    if (key === 'z') return '\x1a'
    if (key === 'y') return '\x19'
    return ''
  }

  async function readClipboardText() {
    if (window?.whSSH?.readClipboardText) return String(await window.whSSH.readClipboardText() || '')
    if (navigator?.clipboard?.readText) return String(await navigator.clipboard.readText() || '')
    return ''
  }

  async function writeClipboardText(text) {
    const value = String(text || '')
    if (window?.whSSH?.writeClipboardText) return window.whSSH.writeClipboardText(value)
    if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(value)
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'readonly')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    return true
  }

  function handleTerminalClipboardShortcut(event) {
    if (!event || (!isTerminalCopyShortcut(event) && !isTerminalPasteShortcut(event))) return false
    event.preventDefault()
    event.stopPropagation()

    if (isTerminalCopyShortcut(event)) {
      const selection = terminal?.getSelection?.() || ''
      if (selection) {
        writeClipboardText(selection).catch(error => {
          ElMessage({ message: `复制终端内容失败：${error.message || error}`, type: 'error', duration: 2200, grouping: true })
        })
      } else if (terminalChannelId.value && window?.whSSH?.sendInput) {
        window.whSSH.sendInput(terminalChannelId.value, '\x03')
      }
      focusTerminal()
      return true
    }

    readClipboardText()
      .then(text => {
        if (text && terminalChannelId.value && window?.whSSH?.sendInput) window.whSSH.sendInput(terminalChannelId.value, text)
      })
      .catch(error => {
        ElMessage({ message: `粘贴到终端失败：${error.message || error}`, type: 'error', duration: 2200, grouping: true })
      })
      .finally(() => focusTerminal())
    return true
  }

  function handleTerminalDirectControlShortcut(event) {
    const data = getTerminalDirectControlData(event)
    if (!data) return false
    event.preventDefault()
    event.stopPropagation()
    if (terminalChannelId.value && window?.whSSH?.sendInput) window.whSSH.sendInput(terminalChannelId.value, data)
    focusTerminal()
    return true
  }

  function mapTerminalKeydown(event) {
    const key = String(event?.key || '')
    if (!key) return ''
    if (event.altKey && !event.ctrlKey) return ''
    if ((event.ctrlKey || event.metaKey) && key.length === 1) {
      if (key.toLowerCase() === 'c' || key.toLowerCase() === 'v') return ''
      const upper = key.toUpperCase()
      const code = upper.charCodeAt(0)
      if (code >= 65 && code <= 90) return String.fromCharCode(code - 64)
    }
    if (key === 'Enter') return '\r'
    if (key === 'Backspace') return '\x7f'
    if (key === 'Tab') return '\t'
    if (key === 'Escape') return '\x1b'
    if (key === 'ArrowUp') return '\x1b[A'
    if (key === 'ArrowDown') return '\x1b[B'
    if (key === 'ArrowRight') return '\x1b[C'
    if (key === 'ArrowLeft') return '\x1b[D'
    if (key === 'Delete') return '\x1b[3~'
    if (key === 'Home') return '\x1b[H'
    if (key === 'End') return '\x1b[F'
    if (key === 'PageUp') return '\x1b[5~'
    if (key === 'PageDown') return '\x1b[6~'
    if (!event.ctrlKey && !event.metaKey && !event.altKey && key.length === 1) return key
    return ''
  }

  function handleTerminalKeydown(event) {
    if (handleTerminalClipboardShortcut(event)) return
    if (handleTerminalDirectControlShortcut(event)) return
    const helperTextarea = terminal?.textarea || terminalRef.value?.querySelector?.('.xterm-helper-textarea, .xterm-helpers textarea')
    if (helperTextarea && event.target === helperTextarea) return
    if (!terminalChannelId.value || !window?.whSSH?.sendInput) return
    const data = mapTerminalKeydown(event)
    if (!data) return
    event.preventDefault()
    event.stopPropagation()
    window.whSSH.sendInput(terminalChannelId.value, data)
    focusTerminal()
  }

  async function closeTerminalChannel() {
    const channelId = String(terminalChannelId.value || '').trim()
    terminalChannelId.value = ''
    terminalReady.value = false
    if (!channelId || !window?.whSSH?.closeTerminalChannel) return
    try {
      await window.whSSH.closeTerminalChannel(channelId)
    } catch {}
  }

  async function openTerminalChannel() {
    if (!props.sessionId || !props.process || !window?.whSSH?.openTerminalChannel) return ''
    const { cols, rows } = getTerminalViewportSize()
    const result = await window.whSSH.openTerminalChannel({
      sessionId: props.sessionId,
      cols,
      rows
    })
    terminalChannelId.value = String(result?.id || '')
    terminalReady.value = !!terminalChannelId.value
    return terminalChannelId.value
  }

  function writeToTerminalInput(text, execute = false) {
    const source = String(text || '')
    if (!source || !terminalChannelId.value || !window?.whSSH?.sendInput) return
    window.whSSH.sendInput(terminalChannelId.value, execute ? `${source}\n` : source)
    focusTerminal()
  }

  async function recreateTerminalChannel() {
    if (activeTabProxy.value !== 'terminal' || !terminal) return
    await closeTerminalChannel()
    terminal.clear()
    const channelId = await openTerminalChannel()
    if (!channelId) return
    stabilizeTerminalLayout()
    focusTerminal()
  }

  async function initTerminal() {
    if (!props.sessionId) return
    await nextTick()
    if (!terminalRef.value || typeof window === 'undefined' || !window.Terminal || !window.whSSH) return
    if (terminal) {
      setupTerminalResizeObserver()
      scheduleTerminalResize()
      focusTerminal()
      return
    }
    terminal = new window.Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 1,
      fontFamily: 'Consolas, Menlo, monospace',
      fontSize: 14,
      theme: {
        background: '#0d1117',
        foreground: '#d6deeb',
        cursor: '#ffffff',
        cursorAccent: '#111111'
      }
    })
    terminal.open(terminalRef.value)
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown') return true
      return !handleTerminalClipboardShortcut(event) && !handleTerminalDirectControlShortcut(event)
    })
    terminal.onKey(({ key, domEvent }) => {
      if (!terminalChannelId.value || !window?.whSSH?.sendInput || !key) return
      if (handleTerminalClipboardShortcut(domEvent)) return
      if (handleTerminalDirectControlShortcut(domEvent)) return
      console.info('[terminal][renderer][pm2-shell] onKey', {
        channelId: terminalChannelId.value,
        key,
        code: domEvent?.code || '',
        ctrl: !!domEvent?.ctrlKey,
        alt: !!domEvent?.altKey,
        meta: !!domEvent?.metaKey
      })
      window.whSSH.sendInput(terminalChannelId.value, key)
    })
    const helperTextarea = terminal.textarea || terminalRef.value?.querySelector?.('.xterm-helper-textarea, .xterm-helpers textarea')
    if (helperTextarea?.addEventListener) {
      const handleTerminalPaste = event => {
        const text = String(event?.clipboardData?.getData?.('text') || '')
        if (!terminalChannelId.value || !text || !window?.whSSH?.sendInput) return
        console.info('[terminal][renderer][pm2-shell] paste', { channelId: terminalChannelId.value, length: text.length })
        window.whSSH.sendInput(terminalChannelId.value, text)
      }
      helperTextarea.addEventListener('paste', handleTerminalPaste)
      stopTerminalPaste = () => {
        helperTextarea.removeEventListener('paste', handleTerminalPaste)
        stopTerminalPaste = null
      }
    }
    stopTerminalData = window.whSSH.onTerminalData(payload => {
      if (payload.id === terminalChannelId.value && terminal) {
        terminal.write(payload.data)
      }
    })
    stopTerminalClosed = window.whSSH.onTerminalClosed(payload => {
      if (payload.id === terminalChannelId.value && terminal) {
        terminalChannelId.value = ''
        terminalReady.value = false
        terminal.write('\r\n[terminal closed]\r\n')
      }
    })
    setupTerminalResizeObserver()
    stabilizeTerminalLayout()
    focusTerminal()
  }

  async function disposeTerminal() {
    await closeTerminalChannel()
    if (terminalResizeObserver) {
      terminalResizeObserver.disconnect()
      terminalResizeObserver = null
    }
    if (stopTerminalData) {
      stopTerminalData()
      stopTerminalData = null
    }
    if (stopTerminalClosed) {
      stopTerminalClosed()
      stopTerminalClosed = null
    }
    if (stopTerminalPaste) {
      stopTerminalPaste()
      stopTerminalPaste = null
    }
    if (terminal) {
      terminal.dispose()
      terminal = null
    }
  }

  function clearTerminalScreen() {
    terminal?.clear()
    focusTerminal()
  }

  async function enterTerminalCwd() {
    if (!props.process?.cwd) return
    await initTerminal()
    if (!terminalChannelId.value) {
      await recreateTerminalChannel()
    }
    writeToTerminalInput(buildCdCommand(props.process.cwd), true)
  }

  watch(() => props.process?.id, () => {
    nextTick(async () => {
      await disposeTerminal()
      if (activeTabProxy.value === 'terminal') {
        await initTerminal()
        await recreateTerminalChannel()
      }
    })
  }, { immediate: true })

  watch(() => activeTabProxy.value, async tab => {
    if (tab === 'terminal') {
      await initTerminal()
      if (!terminalChannelId.value) {
        await recreateTerminalChannel()
      }
      stabilizeTerminalLayout()
      focusTerminal()
      return
    }
  })

  watch(() => props.sessionId, async () => {
    await disposeTerminal()
    if (activeTabProxy.value === 'terminal') {
      await initTerminal()
      await recreateTerminalChannel()
    }
  })

  onBeforeUnmount(() => {
    void disposeTerminal()
  })
</script>

<style scoped>
  .pm2-detail-shell {
    min-height   : 0;
    display      : flex;
    flex-direction: column;
    gap          : 6px;
    overflow     : hidden;
    padding-right: 2px;
  }

  .pm2-detail-head {
    display              : grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap                  : 12px;
    align-items          : center;
  }

  .pm2-detail-card strong,
  .pm2-detail-empty strong {
    margin   : 0;
    color    : #111827;
    font-size: 15px;
  }

  .pm2-detail-head p,
  .pm2-detail-empty p {
    margin   : 2px 0 0;
    color    : #6b7280;
    font-size: 12px;
  }

  .pm2-detail-meta {
    min-width     : 0;
    margin        : 0;
    overflow      : hidden;
    text-overflow : ellipsis;
    white-space   : nowrap;
  }

  .pm2-detail-actions {
    display    : inline-flex;
    flex-wrap  : wrap;
    gap        : 8px;
    flex       : 0 0 auto;
    grid-column: 2 / 3;
    grid-row   : 1 / 2;
  }

  .pm2-detail-tabs {
    min-height    : 0;
    display       : flex;
    flex-direction: column;
    gap           : 6px;
    overflow      : hidden;
  }

  .pm2-detail-head + .pm2-detail-tabs {
    margin-top: -2px;
  }

  .pm2-detail-tabbar {
    --el-tabs-header-height: 32px;
    flex: 0 0 auto;
  }

  .pm2-detail-tabpane {
    min-height    : 0;
    display       : flex;
    flex-direction: column;
    gap           : 12px;
    overflow      : hidden;
  }

  .pm2-detail-tabpane--fill {
    flex: 1 1 auto;
  }

  .pm2-detail-tabbar :deep(.el-tabs__header) {
    margin: 0;
  }

  .pm2-detail-tabbar :deep(.el-tabs__nav-wrap) {
    min-height: 0;
  }

  .pm2-detail-tabbar :deep(.el-tabs__item) {
    padding  : 0 14px;
    font-size: 13px;
  }

  .pm2-detail-grid {
    display              : grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap                  : 12px;
    min-height           : 0;
  }

  .pm2-detail-grid--summary {
    flex: 0 0 auto;
  }

  .pm2-detail-grid--bottom {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pm2-detail-grid--info,
  .pm2-detail-grid--config {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pm2-detail-grid--logs {
    grid-template-columns: 1fr;
  }

  .pm2-detail-grid--fill {
    flex      : 1 1 auto;
    min-height: 0;
    overflow  : hidden;
    align-items: stretch;
  }

  .pm2-detail-card {
    min-height: 0;
    height    : 100%;
    display   : flex;
    flex-direction: column;
    gap       : 12px;
    padding   : 14px 16px;
    border    : 1px solid rgba(15, 23, 42, 0.08);
    background: #ffffff;
    overflow  : hidden;
  }

  .pm2-detail-card--fill {
    height: 100%;
  }

  .pm2-detail-card--fill:has(.pm2-log-box) {
    padding-right: 20px;
    padding-bottom: 18px;
  }

  .pm2-detail-card--tabbed {
    gap    : 0;
    padding: 0;
  }

  .pm2-inline-tabbar {
    --el-tabs-header-height: 32px;
    min-height    : 0;
    height        : 100%;
    display       : flex;
    flex-direction: column;
    overflow      : hidden;
  }

  .pm2-inline-tabbar :deep(.el-tabs__header) {
    flex        : 0 0 auto;
    margin      : 0;
    padding     : 10px 12px 0;
    background  : #ffffff;
  }

  .pm2-inline-tabbar :deep(.el-tabs__content) {
    min-height: 0;
    flex      : 1 1 auto;
    overflow  : hidden;
    padding   : 12px 16px 14px;
  }

  .pm2-inline-tabbar :deep(.el-tab-pane) {
    min-height: 0;
    height    : 100%;
    display   : flex;
  }

  .pm2-detail-card-body {
    min-height : 0;
    flex       : 1 1 auto;
    overflow-y : auto;
    overflow-x : hidden;
    padding-right: 0;
  }

  .pm2-detail-card-body--stack {
    min-height    : 0;
    display       : flex;
    flex-direction: column;
    gap           : 10px;
  }

  .pm2-terminal-shell-head span {
    color    : #6b7280;
    font-size: 12px;
  }

  .pm2-terminal-shell-card {
    min-height    : 0;
    height        : clamp(360px, 52vh, 480px);
    display       : flex;
    flex-direction: column;
    gap           : 0;
    border        : 1px solid #e5e7eb;
    background    : #ffffff;
    overflow      : hidden;
    position      : relative;
    z-index       : 1;
    flex          : 1 1 auto;
    margin-top    : 8px;
  }

  .pm2-terminal-shell-head {
    display        : flex;
    align-items    : center;
    justify-content: space-between;
    gap            : 12px;
    padding        : 12px 16px;
    border-bottom  : 1px solid #e5e7eb;
    background     : #f9fafb;
  }

  .pm2-terminal-shell-actions {
    min-width  : 0;
    display    : inline-flex;
    align-items: center;
    gap        : 10px;
  }

  .pm2-terminal-box-wrap {
    min-height: 0;
    height    : 100%;
    max-height: 100%;
    position  : relative;
    z-index   : 0;
  }

  .pm2-terminal-placeholder {
    width         : 100%;
    min-height    : 100%;
    display       : grid;
    align-content : center;
    justify-items : center;
    gap           : 8px;
    color         : #c9d1d9;
    text-align    : center;
  }

  .pm2-terminal-placeholder strong {
    color    : #f3f4f6;
    font-size: 15px;
  }

  .pm2-terminal-placeholder span {
    color    : #8b949e;
    font-size: 12px;
  }

  .pm2-detail-card--stat {
    gap       : 7px;
    min-height: 66px;
    padding   : 12px 14px;
    border    : 1px solid rgba(15, 23, 42, 0.07);
    background: #ffffff;
    position  : relative;
    overflow  : hidden;
  }

  .pm2-detail-card--stat.info {
    border-color: #bfdbfe;
    background  : linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
  }

  .pm2-detail-card--stat.active {
    border-color: #bbf7d0;
    background  : linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
  }

  .pm2-detail-card--stat.warning,
  .pm2-detail-card--stat.cpu {
    border-color: #fde68a;
    background  : linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
  }

  .pm2-detail-card--stat.danger {
    border-color: #fecaca;
    background  : linear-gradient(135deg, #fef2f2 0%, #ffffff 100%);
  }

  .pm2-detail-card--stat.memory {
    border-color: #a5f3fc;
    background  : linear-gradient(135deg, #ecfeff 0%, #ffffff 100%);
  }

  .pm2-detail-card--stat span {
    color      : #64748b;
    font-size  : 11px;
    font-weight: 600;
  }

  .pm2-detail-card--stat strong {
    color      : #0f172a;
    font-size  : 13px;
    font-weight: 400;
    line-height: 1.2;
  }

  .pm2-log-box {
    margin     : 0;
    padding    : 2px 8px 2px 0;
    border     : 0;
    background : transparent;
    color      : #111827;
    font-family: Consolas, 'Courier New', monospace;
    font-size  : 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break : break-word;
    min-width  : 0;
    box-sizing : border-box;
  }

  .pm2-detail-table {
    width          : 100%;
    border-collapse: collapse;
    table-layout   : fixed;
    border         : 1px solid rgba(15, 23, 42, 0.08);
    background     : #ffffff;
    flex           : 0 0 auto;
  }

  .pm2-detail-table--compact {
    margin-bottom: 10px;
  }

  .pm2-detail-table-row th,
  .pm2-detail-table-row td {
    padding      : 8px 10px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    vertical-align: middle;
    font-size    : 12px;
    line-height  : 1.6;
    word-break   : break-word;
  }

  .pm2-detail-table-row:last-child th,
  .pm2-detail-table-row:last-child td {
    border-bottom: 0;
  }

  .pm2-detail-table-row th {
    width        : 112px;
    color        : #64748b;
    font-weight  : 400;
    text-align   : left;
    overflow     : hidden;
    text-overflow: ellipsis;
    white-space  : nowrap;
    word-break   : normal;
    border-right : 1px solid rgba(15, 23, 42, 0.08);
    background   : #f9fafb;
  }

  .pm2-detail-table-row td {
    color       : #111827;
    font-family : Consolas, 'Courier New', monospace;
    white-space : pre-wrap;
    overflow-wrap: anywhere;
    background  : #ffffff;
  }

  .pm2-log-box {
    min-height : 0;
    height     : 100%;
    flex       : 1 1 auto;
    overflow-y : auto;
    overflow-x : auto;
    white-space: pre;
    word-break : normal;
  }

  .pm2-detail-empty {
    display     : grid;
    place-items : center;
    min-height  : 240px;
    padding     : 24px;
    border      : 1px dashed rgba(148, 163, 184, 0.5);
    background  : #f8fafc;
    text-align  : center;
  }

  @media (max-width: 1280px) {
    .pm2-detail-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .pm2-detail-grid--info,
    .pm2-detail-grid--config {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pm2-detail-grid--logs {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 880px) {
    .pm2-detail-grid,
    .pm2-detail-grid--info,
    .pm2-detail-grid--bottom,
    .pm2-detail-grid--config {
      grid-template-columns: 1fr;
    }

    .pm2-terminal-shell-head,
    .pm2-terminal-shell-actions {
      display       : flex;
      flex-direction: column;
      align-items   : stretch;
    }
  }
</style>
