import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'

const REMOTE_SHORTCUT_STORAGE_PREFIX = 'whssh:remote-shortcuts'

export function useFilesRemoteShortcutsManager(options) {
  const {
    connected,
    sessionId,
    sessionProtocol,
    message,
    reportError,
    setActiveFilePane,
    showNativeContextMenu,
    isRemoteShortcutActive
  } = options

  const remoteShortcuts = ref([])
  const remoteShortcutProfile = ref({ protocol: 'ssh', host: '', port: 22, username: '' })
  const remoteShortcutDragPath = ref('')
  const remoteShortcutDropHint = ref({ path: '', position: 'before' })

  function normalizeRemoteShortcutPath(value) {
    return String(value || '/')
      .trim()
      .replace(/\/+/g, '/')
      .replace(/\/+$/g, '') || '/'
  }

  function createRemoteShortcutItem(path, label = '', icon = 'folder') {
    const normalizedPath = normalizeRemoteShortcutPath(path)
    const parts = normalizedPath.split('/').filter(Boolean)
    return {
      path: normalizedPath,
      label: String(label || parts[parts.length - 1] || (normalizedPath === '/' ? '根目录' : normalizedPath)).trim() || '未命名目录',
      icon: normalizedPath === '/' ? 'computer' : (icon || 'folder')
    }
  }

  function createDefaultRemoteShortcuts(protocol = sessionProtocol.value) {
    return [
      createRemoteShortcutItem('/', '根目录', 'computer')
    ]
  }

  function createRemoteShortcutProfile(source = {}) {
    return {
      protocol: source.protocol === 'sftp' ? 'sftp' : 'ssh',
      host: String(source.host || '').trim().toLowerCase(),
      port: Number(source.port || 22),
      username: String(source.username || '').trim().toLowerCase()
    }
  }

  function getRemoteShortcutPresetItems(type) {
    if (type === 'nginx') {
      return [
        createRemoteShortcutItem('/etc/nginx', 'Nginx 配置'),
        createRemoteShortcutItem('/etc/nginx/conf.d', 'Nginx conf.d'),
        createRemoteShortcutItem('/etc/nginx/sites-enabled', 'Nginx sites-enabled'),
        createRemoteShortcutItem('/var/log/nginx', 'Nginx 日志'),
        createRemoteShortcutItem('/www/server/nginx', '宝塔 Nginx')
      ]
    }
    if (type === 'docker') {
      return [
        createRemoteShortcutItem('/var/lib/docker', 'Docker 数据'),
        createRemoteShortcutItem('/var/lib/docker/volumes', 'Docker Volumes'),
        createRemoteShortcutItem('/etc/docker', 'Docker 配置'),
        createRemoteShortcutItem('/www/server/docker', '宝塔 Docker')
      ]
    }
    return []
  }

  function normalizeRemoteShortcutItems(items, protocol = sessionProtocol.value) {
    if (!Array.isArray(items)) return createDefaultRemoteShortcuts(protocol)
    const seen = new Set()
    const normalized = items
      .map(item => {
        const path = String(item?.path || '').trim()
        if (!path) return null
        return createRemoteShortcutItem(path, item?.label, item?.icon)
      })
      .filter(item => {
        if (!item?.path || seen.has(item.path)) return false
        seen.add(item.path)
        return true
      })
    const hasRoot = normalized.some(item => item.path === '/')
    return hasRoot ? normalized : [createRemoteShortcutItem('/', '根目录', 'computer'), ...normalized]
  }

  function getRemoteShortcutStorageKey(protocol = sessionProtocol.value) {
    const profile = remoteShortcutProfile.value || {}
    const host = String(profile.host || '').trim().toLowerCase()
    const username = String(profile.username || '').trim().toLowerCase()
    const port = Number(profile.port || 22)
    if (!host || !username) return ''
    return `${REMOTE_SHORTCUT_STORAGE_PREFIX}:${protocol}:${host}:${port}:${username}`
  }

  function readLocalRemoteShortcuts(storageKey, protocol) {
    try {
      const raw = window.localStorage.getItem(storageKey)
      return raw ? normalizeRemoteShortcutItems(JSON.parse(raw), protocol) : null
    } catch (error) {
      return null
    }
  }

  function writeLocalRemoteShortcuts(storageKey, items) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items))
    } catch (error) {
    }
  }

  function persistRemoteShortcutsToAppStorage(storageKey, items) {
    if (!window.whSSH?.setAppStorageItem) return
    window.whSSH.setAppStorageItem({ key: storageKey, value: { version: 1, items } }).catch(() => {
      message.value = '服务器快捷访问保存失败'
    })
  }

  async function loadRemoteShortcuts() {
    const protocol = sessionProtocol.value
    const defaults = createDefaultRemoteShortcuts(protocol)
    const storageKey = getRemoteShortcutStorageKey(protocol)
    if (!connected.value || !storageKey) {
      remoteShortcuts.value = []
      return
    }
    let nextItems = null
    let loadedFromAppStorage = false
    if (window.whSSH?.getAppStorageItem) {
      try {
        const stored = await window.whSSH.getAppStorageItem(storageKey)
        const storedItems = Array.isArray(stored) ? stored : stored?.items
        if (storedItems) {
          nextItems = normalizeRemoteShortcutItems(storedItems, protocol)
          loadedFromAppStorage = true
        }
      } catch (error) {
      }
    }
    if (!nextItems) nextItems = readLocalRemoteShortcuts(storageKey, protocol) || defaults
    if (storageKey !== getRemoteShortcutStorageKey(protocol)) return
    remoteShortcuts.value = nextItems
    writeLocalRemoteShortcuts(storageKey, nextItems)
    if (!loadedFromAppStorage) persistRemoteShortcutsToAppStorage(storageKey, nextItems)
  }

  function persistRemoteShortcuts() {
    const storageKey = getRemoteShortcutStorageKey()
    if (!storageKey) return
    writeLocalRemoteShortcuts(storageKey, remoteShortcuts.value)
    persistRemoteShortcutsToAppStorage(storageKey, remoteShortcuts.value)
  }

  function getRemoteShortcutButtonClass(item) {
    return {
      active: isRemoteShortcutActive(item.path),
      dragging: remoteShortcutDragPath.value === item.path,
      'drop-before': remoteShortcutDropHint.value.path === item.path && remoteShortcutDropHint.value.position === 'before',
      'drop-after': remoteShortcutDropHint.value.path === item.path && remoteShortcutDropHint.value.position === 'after'
    }
  }

  function clearRemoteShortcutDragState() {
    remoteShortcutDragPath.value = ''
    remoteShortcutDropHint.value = { path: '', position: 'before' }
  }

  async function showRemoteShortcutContextMenu(item, event) {
    event.preventDefault()
    event.stopPropagation()
    setActiveFilePane('remote')
    await showNativeContextMenu('remote-shortcut', item, event)
  }

  function onRemoteShortcutDragStart(item, event) {
    remoteShortcutDragPath.value = item.path
    remoteShortcutDropHint.value = { path: item.path, position: 'before' }
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.path)
  }

  function onRemoteShortcutDragOver(item, event) {
    if (!remoteShortcutDragPath.value) return
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before'
    remoteShortcutDropHint.value = { path: item.path, position }
    event.dataTransfer.dropEffect = 'move'
  }

  function onRemoteShortcutDrop(item, event) {
    if (!remoteShortcutDragPath.value) return
    event.stopPropagation()
    const sourcePath = remoteShortcutDragPath.value
    const targetPath = item.path
    const position = remoteShortcutDropHint.value.path === item.path ? remoteShortcutDropHint.value.position : 'before'
    if (!sourcePath || !targetPath || sourcePath === targetPath) {
      clearRemoteShortcutDragState()
      return
    }

    const list = [...remoteShortcuts.value]
    const sourceIndex = list.findIndex(entry => entry.path === sourcePath)
    const targetIndex = list.findIndex(entry => entry.path === targetPath)
    if (sourceIndex < 0 || targetIndex < 0) {
      clearRemoteShortcutDragState()
      return
    }

    const [moved] = list.splice(sourceIndex, 1)
    const baseIndex = list.findIndex(entry => entry.path === targetPath)
    const nextIndex = baseIndex < 0 ? list.length : baseIndex + (position === 'after' ? 1 : 0)
    list.splice(nextIndex, 0, moved)
    remoteShortcuts.value = list
    persistRemoteShortcuts()
    clearRemoteShortcutDragState()
    message.value = '快捷访问顺序已更新'
  }

  function onRemoteShortcutDragEnd(event) {
    event?.stopPropagation?.()
    clearRemoteShortcutDragState()
  }

  async function addRemoteShortcut(targetPath, label = '', options = {}) {
    const { promptName = true } = options
    const normalizedPath = normalizeRemoteShortcutPath(targetPath)
    if (!normalizedPath || normalizedPath === '..') return
    if (remoteShortcuts.value.some(item => item.path === normalizedPath)) {
      message.value = '该目录已在快捷访问中'
      return
    }
    let nextLabel = String(label || '').trim()
    if (promptName) {
      try {
        const result = await ElMessageBox.prompt('请输入快捷访问名称', '加入快捷访问', {
          inputValue: nextLabel || normalizedPath.split('/').filter(Boolean).pop() || '根目录',
          confirmButtonText: '保存',
          cancelButtonText: '取消',
          inputPattern: /\S+/,
          inputErrorMessage: '请输入名称'
        })
        nextLabel = result.value.trim()
        if (!nextLabel) return
      } catch (error) {
        if (error !== 'cancel') await reportError(error)
        return
      }
    }
    remoteShortcuts.value = [...remoteShortcuts.value, createRemoteShortcutItem(normalizedPath, nextLabel)]
    persistRemoteShortcuts()
    message.value = '已加入服务器快捷访问'
  }

  async function renameRemoteShortcut(item) {
    try {
      const result = await ElMessageBox.prompt('请输入快捷访问名称', '重命名快捷访问', {
        inputValue: item.label,
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请输入名称'
      })
      const nextLabel = result.value.trim()
      if (!nextLabel || nextLabel === item.label) return
      remoteShortcuts.value = remoteShortcuts.value.map(entry => (entry.path === item.path ? { ...entry, label: nextLabel } : entry))
      persistRemoteShortcuts()
      message.value = '快捷访问已重命名'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function removeRemoteShortcut(item) {
    try {
      await ElMessageBox.confirm(`确认移除快捷访问 ${item.label}？`, '移除快捷访问', {
        type: 'warning',
        confirmButtonText: '移除',
        cancelButtonText: '取消'
      })
      remoteShortcuts.value = remoteShortcuts.value.filter(entry => entry.path !== item.path)
      persistRemoteShortcuts()
      message.value = '快捷访问已移除'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  function resetRemoteShortcutState() {
    remoteShortcutProfile.value = createRemoteShortcutProfile()
    remoteShortcuts.value = []
    clearRemoteShortcutDragState()
  }

  return {
    remoteShortcuts,
    remoteShortcutProfile,
    normalizeRemoteShortcutPath,
    createRemoteShortcutProfile,
    loadRemoteShortcuts,
    getRemoteShortcutButtonClass,
    showRemoteShortcutContextMenu,
    onRemoteShortcutDragStart,
    onRemoteShortcutDragOver,
    onRemoteShortcutDrop,
    onRemoteShortcutDragEnd,
    addRemoteShortcut,
    renameRemoteShortcut,
    removeRemoteShortcut,
    resetRemoteShortcutState
  }
}
