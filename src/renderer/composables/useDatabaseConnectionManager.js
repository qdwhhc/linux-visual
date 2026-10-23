import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'

export function useDatabaseConnectionManager(options) {
  const {
    createDatabaseForm,
    createDatabasePreviewState,
    createDatabaseResultState,
    connected,
    isSSHSession,
    sessionId,
    message,
    reportError,
    ensureBridgeMethod,
    refreshDatabaseBrowser,
    resetDatabaseBrowser,
    databaseActiveDatabase,
    databasePreview,
    databaseResult
  } = options

  const databaseLoginVisible = ref(false)
  const databaseForm = ref(createDatabaseForm())
  const databaseSavedConnections = ref([])
  const databaseLoginMode = ref('connect')
  const databaseConnectionId = ref('')
  const databaseConnected = ref(false)
  const databaseConnecting = ref(false)

  const databaseConnectionLabel = computed(() => {
    const { host, port, username, type, useSshTunnel } = databaseForm.value
    return `${String(type || 'mysql').toUpperCase()}${useSshTunnel ? ' · SSH 隧道' : ''} · ${username || '-'}@${host || '-'}:${port || 3306}`
  })

  const currentDatabaseEngine = computed(() => String(databaseForm.value.type || 'mysql').trim().toLowerCase() === 'mariadb' ? 'mariadb' : 'mysql')

  function openDatabaseLogin(resetForm = false, mode = 'connect') {
    if (resetForm) {
      databaseForm.value = createDatabaseForm()
    }
    databaseLoginMode.value = mode
    if (connected.value && isSSHSession.value) {
      databaseForm.value.useSshTunnel = true
      if (!databaseForm.value.host) databaseForm.value.host = '127.0.0.1'
      if (!databaseForm.value.port) databaseForm.value.port = databaseForm.value.type === 'sqlserver' ? 1433 : 3306
    }
    databaseLoginVisible.value = true
  }

  async function loadDatabaseConnections() {
    try {
      ensureBridgeMethod('listDatabaseConnections')
      databaseSavedConnections.value = await window.whSSH.listDatabaseConnections()
    } catch (error) {
      databaseSavedConnections.value = []
    }
  }

  function useSavedDatabaseConnection(item) {
    databaseForm.value = {
      ...createDatabaseForm(),
      ...item,
      type: item?.type || 'mysql',
      port: Number(item?.port || (item?.type === 'sqlserver' ? 1433 : 3306)),
      useSshTunnel: item?.useSshTunnel === true
    }
  }

  function handleDatabaseTypeChange(nextType = 'mysql') {
    const type = String(nextType || 'mysql').trim().toLowerCase()
    const currentPort = Number(databaseForm.value.port || 0)
    if (type === 'sqlserver') {
      if (!currentPort || currentPort === 3306) databaseForm.value.port = 1433
      return
    }
    if (!currentPort || currentPort === 1433) databaseForm.value.port = 3306
  }

  async function connectSavedDatabaseConnectionDirect(item) {
    if (item?.useSshTunnel && (!connected.value || !isSSHSession.value || !sessionId.value)) {
      message.value = '请先连接 SSH 服务器，再使用当前 SSH 会话连接数据库'
      return
    }
    useSavedDatabaseConnection(item)
    databaseLoginMode.value = 'connect'
    await connectDatabase()
  }

  function editSavedDatabaseConnection(item) {
    useSavedDatabaseConnection(item)
    openDatabaseLogin(false, 'edit')
  }

  function startCreateDatabaseConnection() {
    openDatabaseLogin(true, 'create')
  }

  async function submitDatabaseLoginDialog() {
    if (databaseLoginMode.value === 'connect') {
      await connectDatabase()
      return
    }
    databaseConnecting.value = true
    try {
      const saved = await cacheCurrentDatabaseConnection()
      if (!saved) return
      databaseLoginVisible.value = false
      message.value = '数据库连接已保存'
    } finally {
      databaseConnecting.value = false
    }
  }

  async function removeSavedDatabaseConnection(item) {
    if (!item?.id) return
    try {
      await ElMessageBox.confirm(`确认删除数据库连接 ${item.name || item.host}？`, '确认删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
      ensureBridgeMethod('deleteDatabaseConnection')
      await window.whSSH.deleteDatabaseConnection(item.id)
      if (databaseForm.value.id === item.id) databaseForm.value = createDatabaseForm()
      await loadDatabaseConnections()
      message.value = '数据库连接已删除'
    } catch (error) {
      if (error === 'cancel' || error?.message === 'cancel') return
      await reportError(error)
    }
  }

  async function cacheCurrentDatabaseConnection() {
    try {
      ensureBridgeMethod('saveDatabaseConnection')
      const saved = await window.whSSH.saveDatabaseConnection({ ...databaseForm.value })
      databaseForm.value = {
        ...databaseForm.value,
        ...saved,
        password: saved.password || databaseForm.value.password
      }
      await loadDatabaseConnections()
      return saved
    } catch (error) {
      message.value = `数据库连接记录失败：${error.message}`
      return null
    }
  }

  async function connectDatabase() {
    if (!databaseForm.value.host || !databaseForm.value.username) {
      message.value = '请填写数据库主机地址和用户名'
      return
    }
    if (databaseForm.value.type === 'sqlserver') {
      message.value = '当前版本暂不支持 SQL Server 连接'
      return
    }
    if (databaseForm.value.useSshTunnel && (!connected.value || !isSSHSession.value || !sessionId.value)) {
      message.value = '请先连接 SSH 服务器，再使用当前 SSH 会话连接数据库'
      return
    }
    databaseConnecting.value = true
    try {
      ensureBridgeMethod('connectDatabase')
      if (databaseConnected.value && databaseConnectionId.value) {
        await disconnectDatabase(false)
      }
      const result = await window.whSSH.connectDatabase({
        ...databaseForm.value,
        sessionId: databaseForm.value.useSshTunnel ? sessionId.value : ''
      })
      databaseConnectionId.value = result.id
      databaseConnected.value = true
      databaseActiveDatabase.value = result.activeDatabase || databaseForm.value.database || ''
      databaseForm.value.database = databaseActiveDatabase.value
      databasePreview.value = createDatabasePreviewState()
      databaseResult.value = createDatabaseResultState({
        message: result.version
          ? `已${result.useSshTunnel ? '通过 SSH 隧道' : '直接'}连接到 ${result.host}:${result.port}，MySQL 版本 ${result.version}`
          : `已${result.useSshTunnel ? '通过 SSH 隧道' : '直接'}连接到 ${result.host}:${result.port}`
      })
      await cacheCurrentDatabaseConnection()
      await refreshDatabaseBrowser()
      databaseLoginVisible.value = false
      message.value = '数据库连接成功'
    } catch (error) {
      databaseConnected.value = false
      databaseConnectionId.value = ''
      await reportError(error)
    } finally {
      databaseConnecting.value = false
    }
  }

  async function disconnectDatabase(showMessage = true) {
    if (!databaseConnectionId.value) {
      databaseConnected.value = false
      resetDatabaseBrowser()
      return
    }
    try {
      ensureBridgeMethod('disconnectDatabase')
      await window.whSSH.disconnectDatabase(databaseConnectionId.value)
    } catch (error) {
      if (showMessage) await reportError(error)
    } finally {
      databaseConnectionId.value = ''
      databaseConnected.value = false
      resetDatabaseBrowser()
      if (showMessage) message.value = '数据库已断开'
    }
  }

  return {
    databaseLoginVisible,
    databaseForm,
    databaseSavedConnections,
    databaseLoginMode,
    databaseConnectionId,
    databaseConnected,
    databaseConnecting,
    databaseConnectionLabel,
    currentDatabaseEngine,
    openDatabaseLogin,
    loadDatabaseConnections,
    useSavedDatabaseConnection,
    handleDatabaseTypeChange,
    connectSavedDatabaseConnectionDirect,
    editSavedDatabaseConnection,
    startCreateDatabaseConnection,
    submitDatabaseLoginDialog,
    removeSavedDatabaseConnection,
    cacheCurrentDatabaseConnection,
    connectDatabase,
    disconnectDatabase
  }
}
