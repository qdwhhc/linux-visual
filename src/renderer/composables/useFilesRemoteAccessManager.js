const REMOTE_DIRECTORY_ACCESS_STORAGE_PREFIX = 'whssh:remote-dir-access'
const REMOTE_DIRECTORY_ACCESS_CACHE_TTL = 15000
const REMOTE_DIRECTORY_ACCESS_PERSIST_LIMIT = 200
const REMOTE_DIRECTORY_ACCESS_PERSIST_DELAY = 800

export function useFilesRemoteAccessManager(options) {
  const {
    sessionId,
    sessionProtocol,
    remotePath,
    remoteShortcutProfile,
    reportError,
    normalizeRemoteShortcutPath
  } = options

  const remoteDirectoryAccessCache = new Map()
  let remoteDirectoryAccessPersistTimer = null

  function getRemoteDirectoryAccessStorageKey(protocol = sessionProtocol.value) {
    const profile = remoteShortcutProfile.value || {}
    const host = String(profile.host || '').trim().toLowerCase()
    const username = String(profile.username || '').trim().toLowerCase()
    const port = Number(profile.port || 22)
    if (!host || !username) return ''
    return `${REMOTE_DIRECTORY_ACCESS_STORAGE_PREFIX}:${protocol}:${host}:${port}:${username}`
  }

  function createRemoteDirectoryAccessCacheKey(targetPath = remotePath.value || '/') {
    return normalizeRemoteShortcutPath(targetPath)
  }

  function serializeRemoteDirectoryAccessCache() {
    return [...remoteDirectoryAccessCache.entries()]
      .map(([path, value]) => ({
        path,
        access: value.access,
        updatedAt: value.updatedAt || Date.now()
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, REMOTE_DIRECTORY_ACCESS_PERSIST_LIMIT)
  }

  function writeLocalRemoteDirectoryAccessCache(storageKey, items) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items))
    } catch (error) {
      // 忽略缓存持久化失败，避免影响目录浏览。
    }
  }

  function hydrateRemoteDirectoryAccessCache(items) {
    if (!Array.isArray(items)) return false
    for (const item of items) {
      const normalizedPath = normalizeRemoteShortcutPath(item?.path || '')
      if (!normalizedPath) continue
      remoteDirectoryAccessCache.set(normalizedPath, {
        access: {
          path: normalizedPath,
          writable: item?.access?.writable !== false,
          checked: item?.access?.checked !== false
        },
        expiresAt: Date.now() + REMOTE_DIRECTORY_ACCESS_CACHE_TTL,
        updatedAt: Number(item?.updatedAt || Date.now())
      })
    }
    return true
  }

  function readLocalRemoteDirectoryAccessCache(storageKey) {
    try {
      const raw = window.localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : []
    } catch (error) {
      return []
    }
  }

  function persistRemoteDirectoryAccessCache() {
    const storageKey = getRemoteDirectoryAccessStorageKey()
    if (!storageKey) return
    const items = serializeRemoteDirectoryAccessCache()
    writeLocalRemoteDirectoryAccessCache(storageKey, items)
    if (window.whSSH?.setAppStorageItem) {
      window.whSSH.setAppStorageItem({ key: storageKey, value: { version: 1, items } }).catch(() => {})
    }
  }

  function schedulePersistRemoteDirectoryAccessCache() {
    if (remoteDirectoryAccessPersistTimer) {
      window.clearTimeout(remoteDirectoryAccessPersistTimer)
    }
    remoteDirectoryAccessPersistTimer = window.setTimeout(() => {
      remoteDirectoryAccessPersistTimer = null
      persistRemoteDirectoryAccessCache()
    }, REMOTE_DIRECTORY_ACCESS_PERSIST_DELAY)
  }

  function flushPersistRemoteDirectoryAccessCache() {
    if (remoteDirectoryAccessPersistTimer) {
      window.clearTimeout(remoteDirectoryAccessPersistTimer)
      remoteDirectoryAccessPersistTimer = null
    }
    persistRemoteDirectoryAccessCache()
  }

  async function loadPersistedRemoteDirectoryAccessCache() {
    remoteDirectoryAccessCache.clear()
    const storageKey = getRemoteDirectoryAccessStorageKey()
    if (!storageKey) return
    let loadedFromAppStorage = false
    try {
      if (window.whSSH?.getAppStorageItem) {
        const stored = await window.whSSH.getAppStorageItem(storageKey)
        const storedItems = Array.isArray(stored) ? stored : stored?.items
        if (hydrateRemoteDirectoryAccessCache(storedItems)) loadedFromAppStorage = true
      }
    } catch (error) {
      remoteDirectoryAccessCache.clear()
    }
    if (!remoteDirectoryAccessCache.size) hydrateRemoteDirectoryAccessCache(readLocalRemoteDirectoryAccessCache(storageKey))
    if (remoteDirectoryAccessCache.size && !loadedFromAppStorage) persistRemoteDirectoryAccessCache()
  }

  function readRemoteDirectoryAccessCache(targetPath = remotePath.value || '/') {
    const key = createRemoteDirectoryAccessCacheKey(targetPath)
    if (!key) return null
    const cached = remoteDirectoryAccessCache.get(key)
    if (!cached) return null
    if (cached.expiresAt <= Date.now()) {
      remoteDirectoryAccessCache.delete(key)
      return null
    }
    return cached.access
  }

  function writeRemoteDirectoryAccessCache(access) {
    const key = createRemoteDirectoryAccessCacheKey(access?.path || remotePath.value || '/')
    if (!key || !access?.path) return
    remoteDirectoryAccessCache.set(key, {
      access: {
        path: normalizeRemoteShortcutPath(access.path),
        writable: access.writable !== false,
        checked: access.checked !== false
      },
      expiresAt: Date.now() + REMOTE_DIRECTORY_ACCESS_CACHE_TTL,
      updatedAt: Date.now()
    })
    schedulePersistRemoteDirectoryAccessCache()
  }

  function clearRemoteDirectoryAccessCache() {
    if (remoteDirectoryAccessPersistTimer) {
      window.clearTimeout(remoteDirectoryAccessPersistTimer)
      remoteDirectoryAccessPersistTimer = null
    }
    remoteDirectoryAccessCache.clear()
  }

  async function getRemoteWritable(targetPath) {
    const normalizedPath = normalizeRemoteShortcutPath(targetPath)
    const cached = readRemoteDirectoryAccessCache(normalizedPath)
    if (cached) return cached.writable !== false
    try {
      const access = await window.whSSH.getRemoteDirectoryAccess({ sessionId: sessionId.value, path: normalizedPath })
      writeRemoteDirectoryAccessCache(access)
      return access.writable !== false
    } catch (error) {
      return true
    }
  }

  async function ensureRemoteWritable(targetPath, actionLabel = '执行此操作') {
    const writable = await getRemoteWritable(targetPath)
    if (writable) return true
    const normalizedPath = normalizeRemoteShortcutPath(targetPath || '/')
    await reportError(new Error(`权限不足：无法在 ${normalizedPath} ${actionLabel}。请切换到有写权限的目录，或使用具备写权限的账号后重试。`))
    return false
  }

  return {
    getRemoteWritable,
    ensureRemoteWritable,
    loadPersistedRemoteDirectoryAccessCache,
    flushPersistRemoteDirectoryAccessCache,
    clearRemoteDirectoryAccessCache
  }
}
