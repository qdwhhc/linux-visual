import { computed, ref } from 'vue'

export function useAccountsManager(options) {
  const {
    createDefaultForm,
    normalizeForm,
    form,
    loginVisible,
    message,
    connecting,
    connected,
    sessionId,
    connect,
    disconnect
  } = options

  const accountKeyword = ref('')
  const accountProtocolFilter = ref('all')
  const savedConnections = ref([])

  const managedConnections = computed(() => {
    const keyword = accountKeyword.value.trim().toLowerCase()
    return savedConnections.value.filter(item => {
      const protocol = item.protocol || 'ssh'
      if (accountProtocolFilter.value !== 'all' && protocol !== accountProtocolFilter.value) return false
      if (!keyword) return true
      return [item.name, item.host, item.username]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(keyword))
    })
  })

  function openNewConnection() {
    form.value = createDefaultForm()
    loginVisible.value = true
  }

  function applyConnectionToLogin(item) {
    form.value = normalizeForm(item)
    loginVisible.value = true
    message.value = '已带入登录表单，可修改后再连接'
  }

  function editConnection(item) {
    applyConnectionToLogin(item)
  }

  async function removeConnection(item) {
    if (!item?.id || !window.confirm(`确认删除账号 ${item.name}？`)) return
    try {
      await window.whSSH.deleteConnection(item.id)
      if (form.value.id === item.id) form.value = createDefaultForm(form.value.protocol)
      await loadConnections()
      message.value = '账号已删除'
    } catch (error) {
      message.value = `删除账号失败：${error.message}`
    }
  }

  async function connectSavedConnection(item) {
    if (connected.value && sessionId.value) {
      const currentTarget = `${form.value.host || '当前连接'}:${form.value.port || ''}`
      const nextTarget = `${item.host}:${item.port}`
      if (!window.confirm(`当前已连接 ${currentTarget}，是否断开并切换到 ${nextTarget}？`)) return
      await disconnect(false)
    }
    form.value = normalizeForm(item)
    await connect()
  }

  function isManagedConnectionActive(item) {
    if (!connected.value || !sessionId.value || !item) return false
    if (form.value.id && item.id) return form.value.id === item.id
    return String(form.value.protocol || 'ssh') === String(item.protocol || 'ssh')
      && String(form.value.host || '').trim() === String(item.host || '').trim()
      && String(form.value.port || '') === String(item.port || '')
      && String(form.value.username || '').trim() === String(item.username || '').trim()
  }

  async function toggleSavedConnection(item) {
    if (isManagedConnectionActive(item)) {
      await disconnect(false)
      message.value = '连接已断开'
      return
    }
    await connectSavedConnection(item)
  }

  async function loadConnections(options = {}) {
    const { notify = false } = options
    try {
      savedConnections.value = await window.whSSH.listConnections()
      if (savedConnections.value.length && !form.value.host) {
        form.value = normalizeForm(savedConnections.value[0])
      }
      if (notify) message.value = '连接账号列表已刷新'
    } catch (error) {
      message.value = `连接列表读取失败：${error.message}`
    }
  }

  async function cacheCurrentConnection() {
    try {
      const saved = await window.whSSH.saveConnection({ ...form.value })
      form.value = normalizeForm({ ...form.value, ...saved })
      await loadConnections()
    } catch (error) {
      message.value = `连接缓存失败：${error.message}`
    }
  }

  async function saveConnection() {
    try {
      const saved = await window.whSSH.saveConnection({ ...form.value })
      form.value = normalizeForm({ ...form.value, ...saved })
      await loadConnections()
      message.value = '连接已加密保存'
    } catch (error) {
      message.value = `保存连接失败：${error.message}`
    }
  }

  async function deleteSavedConnection() {
    if (!form.value.id || !window.confirm('确认删除当前保存的连接？')) return
    try {
      await window.whSSH.deleteConnection(form.value.id)
      form.value = createDefaultForm(form.value.protocol)
      await loadConnections()
      message.value = '连接已删除'
    } catch (error) {
      message.value = `删除连接失败：${error.message}`
    }
  }

  return {
    accountKeyword,
    accountProtocolFilter,
    savedConnections,
    managedConnections,
    openNewConnection,
    applyConnectionToLogin,
    editConnection,
    removeConnection,
    isManagedConnectionActive,
    toggleSavedConnection,
    loadConnections,
    cacheCurrentConnection,
    saveConnection,
    deleteSavedConnection
  }
}
