import { ElMessageBox } from 'element-plus'
import { ref } from 'vue'

export function useDockerManager(options) {
  const {
    connected,
    sessionId,
    ensureSshFeature,
    message,
    reportError
  } = options

  const dockerContainers = ref([])
  const dockerProcesses = ref({})
  const dockerProcessViewer = ref({ open: false, name: '', items: [] })
  const dockerProcessLoading = ref({})
  const dockerLoading = ref(false)
  const dockerLogViewer = ref({ open: false, name: '', content: '' })
  const dockerUseSudo = ref(false)
  const dockerLogLines = ref(200)
  const dockerStatusMessage = ref('')

  function resetDockerState() {
    dockerContainers.value = []
    dockerProcesses.value = {}
    dockerProcessViewer.value = { open: false, name: '', items: [] }
    dockerProcessLoading.value = {}
    dockerLoading.value = false
    dockerLogViewer.value = { open: false, name: '', content: '' }
    dockerStatusMessage.value = ''
  }

  function dockerStatusClass(status) {
    const value = String(status || '').toLowerCase()
    if (value.includes('up')) return 'active'
    if (value.includes('exited') || value.includes('dead')) return 'inactive'
    if (value.includes('restarting') || value.includes('paused')) return 'warning'
    return 'neutral'
  }

  function isDockerRunning(status) {
    return String(status || '').toLowerCase().includes('up')
  }

  async function loadDockerContainers(options = {}) {
    if (!connected.value) return
    if (!ensureSshFeature('Docker 管理')) return
    const { notify = false } = options
    dockerLoading.value = true
    dockerStatusMessage.value = ''
    try {
      dockerContainers.value = await window.whSSH.listDockerContainers({ sessionId: sessionId.value, useSudo: dockerUseSudo.value })
      dockerProcesses.value = {}
      dockerStatusMessage.value = dockerContainers.value.length
        ? (dockerUseSudo.value ? '已使用 sudo 成功读取 Docker 容器。' : 'Docker 容器读取成功。')
        : 'Docker 可以访问，但当前没有容器。'
      if (notify) message.value = 'Docker 容器列表已刷新'
    } catch (error) {
      dockerStatusMessage.value = error.message || String(error)
      await reportError(error)
    } finally {
      dockerLoading.value = false
    }
  }

  async function loadDockerProcesses(item) {
    if (!ensureSshFeature('Docker 管理')) return
    if (!isDockerRunning(item.status)) {
      message.value = '容器未运行，无法读取内部进程'
      return
    }
    dockerProcessLoading.value = { ...dockerProcessLoading.value, [item.id]: true }
    try {
      const list = await window.whSSH.listDockerProcesses({ sessionId: sessionId.value, id: item.id, useSudo: dockerUseSudo.value })
      dockerProcesses.value = { ...dockerProcesses.value, [item.id]: list }
      dockerProcessViewer.value = { open: true, name: item.names, items: list }
      if (!list.length) message.value = `${item.names} 内没有读取到进程`
    } catch (error) {
      await reportError(error)
    } finally {
      dockerProcessLoading.value = { ...dockerProcessLoading.value, [item.id]: false }
    }
  }

  async function readDockerLogs(item) {
    if (!ensureSshFeature('Docker 管理')) return
    try {
      const result = await window.whSSH.readDockerLogs({ sessionId: sessionId.value, id: item.id, lines: dockerLogLines.value, useSudo: dockerUseSudo.value })
      dockerLogViewer.value = { open: true, name: item.names, content: result.content }
    } catch (error) {
      await reportError(error)
    }
  }

  async function runDockerAction(item, action) {
    if (!ensureSshFeature('Docker 管理')) return
    try {
      await ElMessageBox.confirm(`确认对容器 ${item.names} 执行${action === 'rm' ? '删除' : action}？`, '确认容器操作', {
        type: 'warning',
        confirmButtonText: action === 'rm' ? '删除容器' : '确认执行',
        cancelButtonText: '取消'
      })
      const result = await window.whSSH.dockerAction({ sessionId: sessionId.value, id: item.id, action, useSudo: dockerUseSudo.value })
      message.value = result.stderr || result.stdout || 'Docker 操作已执行'
      dockerProcesses.value = { ...dockerProcesses.value, [item.id]: [] }
      await loadDockerContainers()
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  function handleDockerMenuCommand(row, command) {
    if (command === 'logs') return readDockerLogs(row)
    if (command === 'processes') return loadDockerProcesses(row)
    return runDockerAction(row, command)
  }

  return {
    dockerContainers,
    dockerProcesses,
    dockerProcessViewer,
    dockerProcessLoading,
    dockerLoading,
    dockerLogViewer,
    dockerUseSudo,
    dockerLogLines,
    dockerStatusMessage,
    resetDockerState,
    dockerStatusClass,
    isDockerRunning,
    loadDockerContainers,
    loadDockerProcesses,
    readDockerLogs,
    runDockerAction,
    handleDockerMenuCommand
  }
}
