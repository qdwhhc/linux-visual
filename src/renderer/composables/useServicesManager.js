import { ElMessageBox } from 'element-plus'
import { ref } from 'vue'

export function useServicesManager(options) {
  const {
    connected,
    sessionId,
    ensureSshFeature,
    message
  } = options

  const services = ref([])
  const serviceLoading = ref(false)

  function resetServicesState() {
    services.value = []
    serviceLoading.value = false
  }

  function serviceStatusLabel(status) {
    const value = String(status || '').toLowerCase()
    if (value === 'active') return '运行中'
    if (value === 'inactive') return '已停止'
    if (value === 'failed') return '异常'
    if (value === 'unknown') return '未知'
    return status || '未知'
  }

  function serviceStatusHint(status) {
    const value = String(status || '').toLowerCase()
    if (value === 'active') return '当前服务正在运行，可以重启或停止。'
    if (value === 'inactive') return '当前服务未运行，可以尝试启动。'
    if (value === 'failed') return '服务启动失败或异常退出，建议查看日志。'
    return '服务器未返回明确状态，请刷新或检查服务是否安装。'
  }

  function serviceStatusClass(status) {
    const value = String(status || '').toLowerCase()
    if (value === 'active') return 'active'
    if (value === 'inactive') return 'inactive'
    if (value === 'failed') return 'failed'
    return 'neutral'
  }

  async function loadServices(options = {}) {
    if (!connected.value) return
    if (!ensureSshFeature('服务管理')) return
    const { notify = false } = options
    serviceLoading.value = true
    try {
      services.value = await window.whSSH.getServices(sessionId.value)
      if (notify) message.value = '服务列表已刷新'
    } catch (error) {
      message.value = `服务状态读取失败：${error.message}`
    } finally {
      serviceLoading.value = false
    }
  }

  async function runServiceAction(service, action) {
    if (!ensureSshFeature('服务管理')) return
    try {
      await ElMessageBox.confirm(`确认对服务 ${service.name} 执行${action}？`, '确认服务操作', {
        type: 'warning',
        confirmButtonText: '确认执行',
        cancelButtonText: '取消'
      })
      const result = await window.whSSH.serviceAction({ sessionId: sessionId.value, service: service.key, action })
      message.value = result.stderr || result.stdout || `${service.name} ${action} 已执行`
      await loadServices()
    } catch (error) {
      if (error !== 'cancel') message.value = `服务操作失败：${error.message}`
    }
  }

  function handleServiceMenuCommand(row, command) {
    runServiceAction(row, command)
  }

  return {
    services,
    serviceLoading,
    resetServicesState,
    serviceStatusLabel,
    serviceStatusHint,
    serviceStatusClass,
    loadServices,
    runServiceAction,
    handleServiceMenuCommand
  }
}
