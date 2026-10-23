import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'

function createManualLogFile(pathValue) {
  const normalized = String(pathValue || '').trim()
  if (!normalized) return null
  const parts = normalized.split('/')
  const name = parts[parts.length - 1] || normalized
  const directory = parts.slice(0, -1).join('/') || '/'
  return {
    name,
    path: normalized,
    directory,
    size: 0,
    modified: ''
  }
}

export function useLogsManager(options) {
  const {
    connected,
    sessionId,
    message,
    ensureSshFeature
  } = options

  const logLines = ref(200)
  const logFiles = ref([])
  const logFilesLoading = ref(false)
  const logKeyword = ref('')
  const customLogPath = ref('')
  const selectedLogFile = ref(null)
  const logViewer = ref({ open: false, name: '', path: '', content: '' })
  const tailing = ref(false)
  const tailId = ref('')
  const tailPath = ref('')
  const applicationLogs = ref([])
  const applicationLogKeyword = ref('')
  const applicationLogLoading = ref(false)
  const applicationLogInfo = ref({ file: '', size: 0, corruptEntries: 0 })
  const serverLogContents = ref({})
  const serverLogLoadingPaths = ref([])
  let latestApplicationLogRequest = 0
  let latestServerLogRequest = 0

  const filteredLogFiles = computed(() => {
    const keyword = logKeyword.value.trim().toLowerCase()
    if (!keyword) return logFiles.value
    return logFiles.value.filter(item => [item.name, item.path, item.directory]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(keyword)))
  })

  const filteredApplicationLogs = computed(() => {
    const keyword = applicationLogKeyword.value.trim().toLowerCase()
    if (!keyword) return applicationLogs.value
    return applicationLogs.value.filter(item => [item.time, item.level, item.source, item.message, item.stack, item.details]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(keyword)))
  })

  async function loadApplicationLogs(options = {}) {
    if (typeof window.whSSH?.readApplicationLogs !== 'function') return
    const { notify = false } = options
    const requestId = ++latestApplicationLogRequest
    applicationLogLoading.value = true
    try {
      const result = await window.whSSH.readApplicationLogs()
      if (requestId !== latestApplicationLogRequest) return
      applicationLogs.value = Array.isArray(result?.entries) ? result.entries : []
      applicationLogInfo.value = {
        file: String(result?.file || ''),
        size: Number(result?.size || 0),
        corruptEntries: Number(result?.corruptEntries || 0)
      }
      if (notify) message.value = '应用日志已刷新'
    } catch (error) {
      if (requestId !== latestApplicationLogRequest) return
      message.value = `应用日志读取失败：${error.message || error}`
      window.reportApplicationError?.('application-log-viewer', error)
    } finally {
      if (requestId === latestApplicationLogRequest) applicationLogLoading.value = false
    }
  }

  async function clearApplicationLogs() {
    if (typeof window.whSSH?.clearApplicationLogs !== 'function') return
    try {
      await ElMessageBox.confirm('清空后无法恢复，确定删除全部应用日志吗？', '清空应用日志', {
        type: 'warning',
        confirmButtonText: '清空',
        cancelButtonText: '取消'
      })
      await window.whSSH.clearApplicationLogs()
      latestApplicationLogRequest += 1
      applicationLogLoading.value = false
      applicationLogs.value = []
      applicationLogInfo.value = { ...applicationLogInfo.value, size: 0, corruptEntries: 0 }
      message.value = '应用日志已清空'
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      message.value = `应用日志清空失败：${error.message || error}`
      window.reportApplicationError?.('application-log-viewer', error)
    }
  }

  async function deleteApplicationLogEntry(row = {}) {
    const id = String(row?.id || '').trim()
    if (!id || typeof window.whSSH?.deleteApplicationLogEntry !== 'function') return
    try {
      await ElMessageBox.confirm('确定删除这条应用日志记录吗？', '删除应用日志', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      const result = await window.whSSH.deleteApplicationLogEntry({ id })
      if (!result?.ok) {
        message.value = '应用日志记录不存在或已被删除'
        await loadApplicationLogs()
        return
      }
      applicationLogs.value = applicationLogs.value.filter(item => String(item.id || '') !== id)
      await loadApplicationLogs()
      message.value = '应用日志记录已删除'
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      message.value = `应用日志删除失败：${error.message || error}`
      window.reportApplicationError?.('application-log-viewer', error)
    }
  }

  async function loadLogFiles(options = {}) {
    if (!connected.value) return
    if (!ensureSshFeature('日志中心')) return
    const { notify = false } = options
    const requestId = ++latestServerLogRequest
    logFilesLoading.value = true
    try {
      const result = await window.whSSH.listLogFiles(sessionId.value)
      if (requestId !== latestServerLogRequest) return
      logFiles.value = result
      if (!logFiles.value.length) {
        message.value = '没有扫描到常见日志文件，可在上方输入绝对路径直接查看。'
      } else if (notify) {
        message.value = '日志文件列表已刷新'
      }
    } catch (error) {
      if (requestId !== latestServerLogRequest) return
      message.value = `日志列表读取失败：${error.message}`
    } finally {
      if (requestId === latestServerLogRequest) logFilesLoading.value = false
    }
  }

  function selectLogFile(row) {
    if (row?.path) selectedLogFile.value = row
  }

  async function openLogFile(row = selectedLogFile.value) {
    const target = row?.path ? row : (customLogPath.value.trim() ? createManualLogFile(customLogPath.value) : null)
    if (!target?.path) {
      message.value = '请先选择日志文件，或输入绝对路径。'
      return
    }
    if (tailing.value && tailPath.value && tailPath.value !== target.path) {
      await stopTail(false)
    }
    selectedLogFile.value = target
    customLogPath.value = target.path
    await readLog(target)
  }

  function handleLogMenuCommand(row, command) {
    if (command === 'view') return openLogFile(row)
    if (command === 'tail') return toggleTail(row)
    if (command === 'delete') return deleteServerLog(row)
  }

  async function deleteServerLog(row = selectedLogFile.value) {
    const target = row?.path ? row : null
    if (!target || !ensureSshFeature('日志中心')) return
    try {
      await ElMessageBox.confirm(`确定删除服务器日志文件“${target.name || target.path}”吗？`, '删除日志文件', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      if (tailing.value && tailPath.value === target.path) await stopTail(false)
      await window.whSSH.deleteFile({ sessionId: sessionId.value, path: target.path, type: 'f' })
      if (logViewer.value.path === target.path) logViewer.value = { open: false, name: '', path: '', content: '' }
      const nextContents = { ...serverLogContents.value }
      delete nextContents[target.path]
      serverLogContents.value = nextContents
      if (selectedLogFile.value?.path === target.path) selectedLogFile.value = null
      if (customLogPath.value.trim() === target.path) customLogPath.value = ''
      await loadLogFiles()
      message.value = `已删除日志文件 ${target.name || target.path}`
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      message.value = `日志文件删除失败：${error.message || error}`
    }
  }

  async function openCustomLogPath() {
    if (!customLogPath.value.trim()) return
    await openLogFile(createManualLogFile(customLogPath.value))
  }

  async function readLog(target = selectedLogFile.value, options = {}) {
    if (!ensureSshFeature('日志中心')) return
    if (!target?.path) {
      message.value = '请先选择日志文件，或输入绝对路径。'
      return
    }
    try {
      const result = await window.whSSH.readLog({ sessionId: sessionId.value, path: target.path, lines: logLines.value })
      selectedLogFile.value = target
      customLogPath.value = target.path
      logViewer.value = {
        open: true,
        name: target.name || '日志文件',
        path: target.path,
        content: result.stdout || result.stderr || '该日志当前没有可显示内容。'
      }
      if (options.notify) message.value = '日志内容已刷新'
    } catch (error) {
      message.value = `日志读取失败：${error.message}`
    }
  }

  async function readServerLogInline(target = selectedLogFile.value, options = {}) {
    if (!ensureSshFeature('日志中心')) return
    if (!target?.path) return
    const targetPath = String(target.path)
    if (serverLogLoadingPaths.value.includes(targetPath)) return
    serverLogLoadingPaths.value = [...serverLogLoadingPaths.value, targetPath]
    try {
      const result = await window.whSSH.readLog({ sessionId: sessionId.value, path: targetPath, lines: logLines.value })
      serverLogContents.value = {
        ...serverLogContents.value,
        [targetPath]: result.stdout || result.stderr || '该日志当前没有可显示内容。'
      }
      if (options.notify) message.value = `已加载 ${target.name || targetPath} 最近 ${logLines.value} 行内容`
    } catch (error) {
      serverLogContents.value = {
        ...serverLogContents.value,
        [targetPath]: `日志读取失败：${error.message || error}`
      }
      message.value = `日志读取失败：${error.message || error}`
    } finally {
      serverLogLoadingPaths.value = serverLogLoadingPaths.value.filter(item => item !== targetPath)
    }
  }

  async function toggleTail(target = selectedLogFile.value) {
    if (!ensureSshFeature('日志中心')) return
    const nextTarget = target?.path ? target : (customLogPath.value.trim() ? createManualLogFile(customLogPath.value) : null)
    if (!nextTarget?.path) {
      message.value = '请先选择日志文件，或输入绝对路径。'
      return
    }
    if (tailing.value && tailPath.value === nextTarget.path) {
      await stopTail()
      return
    }
    if (tailing.value) await stopTail(false)
    try {
      if (!logViewer.value.open || logViewer.value.path !== nextTarget.path) {
        await readLog(nextTarget)
      }
      const result = await window.whSSH.startTail({ sessionId: sessionId.value, path: nextTarget.path, lines: logLines.value })
      tailId.value = result.id
      tailing.value = true
      tailPath.value = nextTarget.path
      selectedLogFile.value = nextTarget
      customLogPath.value = nextTarget.path
      logViewer.value = { ...logViewer.value, open: true, name: nextTarget.name || '日志文件', path: nextTarget.path }
      message.value = '已开始实时跟随日志'
    } catch (error) {
      message.value = `实时日志启动失败：${error.message}`
    }
  }

  async function stopTail(showMessage = true) {
    if (!tailId.value) return
    await window.whSSH.stopTail(tailId.value)
    tailing.value = false
    tailId.value = ''
    tailPath.value = ''
    if (showMessage) message.value = '已停止实时跟随日志'
  }

  function handleLogViewerClosed() {
    if (tailing.value) stopTail(false)
  }

  return {
    logLines,
    logFiles,
    logFilesLoading,
    logKeyword,
    customLogPath,
    selectedLogFile,
    logViewer,
    tailing,
    tailId,
    tailPath,
    applicationLogs,
    applicationLogKeyword,
    applicationLogLoading,
    applicationLogInfo,
    serverLogContents,
    serverLogLoadingPaths,
    filteredLogFiles,
    filteredApplicationLogs,
    loadApplicationLogs,
    clearApplicationLogs,
    deleteApplicationLogEntry,
    loadLogFiles,
    selectLogFile,
    openLogFile,
    handleLogMenuCommand,
    deleteServerLog,
    openCustomLogPath,
    readLog,
    readServerLogInline,
    toggleTail,
    stopTail,
    handleLogViewerClosed
  }
}
