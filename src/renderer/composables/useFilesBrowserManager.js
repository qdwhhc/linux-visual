import { ElMessage } from 'element-plus'
import { computed, nextTick, reactive } from 'vue'

const fileNameCollator = new Intl.Collator(['zh-Hans-CN', 'zh-CN', 'en'], {
  numeric: true,
  sensitivity: 'base'
})

function sortFileRows(rows = []) {
  return (Array.isArray(rows) ? [...rows] : []).sort((left, right) => {
    const directoryDelta = Number(right?.type === 'd') - Number(left?.type === 'd')
    if (directoryDelta) return directoryDelta

    const nameDelta = fileNameCollator.compare(String(left?.name || ''), String(right?.name || ''))
    if (nameDelta) return nameDelta


    return fileNameCollator.compare(String(left?.path || ''), String(right?.path || ''))
  })
}

function isLocalDriveRootPath(value) {
  return /^[A-Za-z]:\\?$/.test(String(value || ''))
}

export function useFilesBrowserManager(options) {
  const {
    files,
    localFiles,
    localPath,
    localPathInput,
    localSearchKeyword,
    localSearchActive,
    localRoots,
    showHiddenLocal,
    selectedLocal,
    selectedLocals,
    selectedRemote,
    selectedRemotes,
    lastLocalIndex,
    lastRemoteIndex,
    remotePath,
    remotePathInput,
    remoteSearchKeyword,
    remoteSearchActive,
    remoteShortcuts,
    leftPaneRatio,
    connected,
    sessionId,
    createParentRow,
    getLocalParent,
    getRemoteParentPath,
    normalizeLocalComparePath,
    reportError,
    logRemotePerf
  } = options
  let localSearchRequestId = 0
  let remoteSearchRequestId = 0
  let localGlobalSearchRequestId = 0
  let remoteGlobalSearchRequestId = 0
  let localGlobalSearchTimer = null
  let remoteGlobalSearchTimer = null
  const fileSearchState = reactive({
    localLoading: false,
    remoteLoading: false,
    localKeyword: '',
    remoteKeyword: '',
    localRootPath: '',
    remoteRootPath: ''
  })
  const localGlobalSearch = reactive({
    open: false,
    keyword: '',
    items: [],
    rootPath: '',
    loading: false,
    searched: false,
    limited: false
  })
  const remoteGlobalSearch = reactive({
    open: false,
    keyword: '',
    items: [],
    rootPath: '/',
    loading: false,
    searched: false,
    limited: false
  })

  const filePanelStyle = computed(() => ({
    gridTemplateColumns: `minmax(300px, ${leftPaneRatio.value}fr) 7px minmax(300px, ${100 - leftPaneRatio.value}fr)`
  }))

  const localPinnedRoots = computed(() => localRoots.value.filter(item => !isLocalDriveRootPath(item.path)))
  const localDriveRoots = computed(() => localRoots.value.filter(item => isLocalDriveRootPath(item.path)))
  const localBreadcrumbs = computed(() => buildLocalBreadcrumbs(localPath.value))
  const remotePinnedRoots = computed(() => remoteShortcuts.value)
  const remoteBreadcrumbs = computed(() => buildRemoteBreadcrumbs(remotePath.value))
  const localTableFiles = computed(() => {
    const keyword = String(localSearchKeyword.value || '').trim().toLowerCase()
    const filteredFiles = keyword
      ? localFiles.value.filter(item => String(item?.name || '').toLowerCase().includes(keyword))
      : localFiles.value
    const sortedFiles = sortFileRows(filteredFiles)
    return (localPath.value === '__pc__' || localSearchActive.value) ? sortedFiles : [createParentRow('local'), ...sortedFiles]
  })
  const remoteTableFiles = computed(() => {
    const keyword = String(remoteSearchKeyword.value || '').trim().toLowerCase()
    const filteredFiles = keyword
      ? files.value.filter(item => String(item?.name || '').toLowerCase().includes(keyword))
      : files.value
    const sortedFiles = sortFileRows(filteredFiles)
    return (remotePath.value === '/' || remoteSearchActive.value) ? sortedFiles : [createParentRow('remote'), ...sortedFiles]
  })

  async function loadFiles(targetPath = remotePath.value || '/') {
    if (!connected.value) return
    remoteSearchRequestId += 1
    const pathValue = targetPath || '/'
    const requestStart = Date.now()
    try {
      remoteSearchKeyword.value = ''
      remoteSearchActive.value = false
      remotePath.value = pathValue
      remotePathInput.value = remotePath.value
      const invokeStart = Date.now()
      const nextFiles = normalizeRemoteFileRows(await window.whSSH.listFiles({ sessionId: sessionId.value, path: remotePath.value || '/' }), remotePath.value || '/')
      const invokeMs = Date.now() - invokeStart
      const renderStart = Date.now()
      files.value = nextFiles
      selectedRemote.value = null
      selectedRemotes.value = []
      lastRemoteIndex.value = -1
      await nextTick()
      logRemotePerf('loadFiles', {
        path: pathValue,
        count: nextFiles.length,
        invokeMs,
        renderFlushMs: Date.now() - renderStart,
        totalMs: Date.now() - requestStart
      })
    } catch (error) {
      await reportError(error)
    }
  }

  async function loadLocalFiles(targetPath, showHidden = showHiddenLocal.value) {
    localSearchRequestId += 1
    if (targetPath === '__pc__') {
      await loadLocalRoots()
      return
    }
    try {
      localSearchKeyword.value = ''
      localSearchActive.value = false
      const result = await window.whSSH.listLocalFiles({ path: targetPath || localPath.value, showHidden })
      localPath.value = result.path
      localPathInput.value = result.path
      localFiles.value = result.items
      selectedLocal.value = null
      selectedLocals.value = []
      lastLocalIndex.value = -1
    } catch (error) {
      await reportError(error)
    }
  }

  async function loadLocalRoots() {
    try {
      localSearchRequestId += 1
      localSearchKeyword.value = ''
      localSearchActive.value = false
      localRoots.value = await window.whSSH.listLocalRoots()
      localPath.value = '__pc__'
      localPathInput.value = ''
      localFiles.value = localRoots.value.map(root => {
        const isDriveRoot = isLocalDriveRootPath(root.path)
        return {
          name: root.label,
          type: 'd',
          size: 0,
          modifyTime: 0,
          path: root.path,
          icon: '',
          localRootKind: isDriveRoot ? 'drive' : 'folder',
          driveLetter: isDriveRoot ? String(root.path || '').slice(0, 1).toUpperCase() : ''
        }
      })
      selectedLocal.value = null
      selectedLocals.value = []
      lastLocalIndex.value = -1
    } catch (error) {
      await reportError(error)
    }
  }

  async function navigateLocalPath() {
    const target = localPathInput.value.trim()
    if (!target || target === '__pc__' || target === '此电脑') {
      await loadLocalRoots()
      return
    }
    await loadLocalFiles(target)
  }

  async function navigateRemotePath() {
    if (!connected.value) return
    let target = remotePathInput.value.trim() || '/'
    if (!target.startsWith('/')) target = `/${target}`
    await loadFiles(target)
  }

  function resetLocalPathInput() {
    localPathInput.value = localPath.value === '__pc__' ? '' : localPath.value
  }

  function resetRemotePathInput() {
    remotePathInput.value = remotePath.value || '/'
  }

  function handleLocalSearchInput() {
    localSearchActive.value = false
  }

  function handleRemoteSearchInput() {
    remoteSearchActive.value = false
  }

  async function clearLocalSearch() {
    localSearchKeyword.value = ''
    localSearchRequestId += 1
    fileSearchState.localLoading = false
    if (!localSearchActive.value) return
    await loadLocalFiles(localPath.value)
  }

  async function clearRemoteSearch() {
    remoteSearchKeyword.value = ''
    remoteSearchRequestId += 1
    fileSearchState.remoteLoading = false
    if (!remoteSearchActive.value) return
    await loadFiles(remotePath.value)
  }

  function getSearchKeywordFromEvent(event, fallback) {
    if (typeof event === 'string') return event.trim()
    const tagName = String(event?.target?.tagName || '').toLowerCase()
    if ((tagName === 'input' || tagName === 'textarea') && 'value' in event.target) {
      return String(event.target.value || '').trim()
    }
    return String(fallback ?? '').trim()
  }

  function notifySearchLimit(result = {}) {
    if (!result?.limited) return
    ElMessage({
      message: `搜索结果较多，已先显示前 ${Array.isArray(result.items) ? result.items.length : 0} 条。请缩小目录或输入更精确的关键词。`,
      type: 'warning',
      duration: 2600,
      grouping: true
    })
  }

  function setFileSearchLoading(scope, rootPath = '', keyword = '', loading = true) {
    if (scope === 'remote') {
      fileSearchState.remoteLoading = loading
      fileSearchState.remoteRootPath = rootPath
      fileSearchState.remoteKeyword = keyword
      return
    }
    fileSearchState.localLoading = loading
    fileSearchState.localRootPath = rootPath
    fileSearchState.localKeyword = keyword
  }

  function cancelLocalSearch() {
    localSearchRequestId += 1
    fileSearchState.localLoading = false
  }

  function cancelRemoteSearch() {
    remoteSearchRequestId += 1
    fileSearchState.remoteLoading = false
  }

  function setGlobalSearchLoading(scope, loading) {
    if (scope === 'remote') {
      remoteGlobalSearch.loading = loading
      return
    }
    localGlobalSearch.loading = loading
  }

  function setGlobalSearchOpen(scope, open) {
    const state = scope === 'remote' ? remoteGlobalSearch : localGlobalSearch
    state.open = !!open
  }

  function getGlobalSearchRoot(scope) {
    if (scope === 'remote') {
      let rootPath = remotePath.value || '/'
      if (!rootPath.startsWith('/')) rootPath = `/${rootPath}`
      return rootPath
    }
    return localPath.value && localPath.value !== '__pc__' ? localPath.value : ''
  }

  function scheduleGlobalSearch(scope, event = null) {
    const state = scope === 'remote' ? remoteGlobalSearch : localGlobalSearch
    state.keyword = getSearchKeywordFromEvent(event, state.keyword)
    state.searched = false
    if (scope === 'remote') {
      remoteGlobalSearchRequestId += 1
      remoteGlobalSearch.loading = false
      return
    }
    localGlobalSearchRequestId += 1
    localGlobalSearch.loading = false
  }

  async function runGlobalSearch(scope, event = null) {
    const state = scope === 'remote' ? remoteGlobalSearch : localGlobalSearch
    const requestId = scope === 'remote' ? ++remoteGlobalSearchRequestId : ++localGlobalSearchRequestId
    const keyword = getSearchKeywordFromEvent(event, state.keyword)
    state.keyword = keyword
    const rootPath = getGlobalSearchRoot(scope)
    if (!keyword) {
      state.items = []
      state.searched = false
      state.limited = false
      state.rootPath = rootPath || state.rootPath
      setGlobalSearchLoading(scope, false)
      return
    }
    if (!rootPath) {
      state.items = []
      state.searched = true
      state.rootPath = ''
      await reportError(new Error('请先进入一个具体目录，再执行全局搜索'))
      return
    }
    try {
      setGlobalSearchLoading(scope, true)
      const result = scope === 'remote'
        ? await window.whSSH.searchFiles({ sessionId: sessionId.value, path: rootPath, keyword })
        : await window.whSSH.searchLocalFiles({ path: rootPath, keyword, showHidden: showHiddenLocal.value })
      if (requestId !== (scope === 'remote' ? remoteGlobalSearchRequestId : localGlobalSearchRequestId)) return
      state.items = scope === 'remote' ? normalizeRemoteFileRows(result.items, rootPath) : result.items
      state.rootPath = result.rootPath || rootPath
      state.limited = !!result.limited
      state.searched = true
      setGlobalSearchLoading(scope, false)
      notifySearchLimit(result)
    } catch (error) {
      if (requestId === (scope === 'remote' ? remoteGlobalSearchRequestId : localGlobalSearchRequestId)) {
        setGlobalSearchLoading(scope, false)
      }
      await reportError(error)
    }
  }

  async function clearGlobalSearch(scope) {
    const state = scope === 'remote' ? remoteGlobalSearch : localGlobalSearch
    state.keyword = ''
    state.items = []
    state.searched = false
    state.limited = false
    if (scope === 'remote') {
      remoteGlobalSearchRequestId += 1
      clearTimeout(remoteGlobalSearchTimer)
    } else {
      localGlobalSearchRequestId += 1
      clearTimeout(localGlobalSearchTimer)
    }
    setGlobalSearchLoading(scope, false)
  }

  async function openLocalGlobalSearchResult(row) {
    const target = row?.type === 'd' ? row.path : getLocalParent(row?.path)
    if (target) await loadLocalFiles(target)
  }

  async function openRemoteGlobalSearchResult(row) {
    const target = row?.type === 'd' ? row.path : getRemoteParentPath(row?.path)
    if (target) await loadFiles(target)
  }

  async function runLocalSearch(event = null) {
    const requestId = ++localSearchRequestId
    const keyword = getSearchKeywordFromEvent(event, localSearchKeyword.value)
    localSearchKeyword.value = keyword
    const rootPath = localPathInput.value.trim() || localPath.value
    if (!keyword) {
      await loadLocalFiles(localPath.value)
      return
    }
    if (!rootPath || rootPath === '__pc__' || rootPath === '此电脑') {
      await reportError(new Error('请先在本地文件栏进入一个具体目录'))
      return
    }
    try {
      setFileSearchLoading('local', rootPath, keyword, true)
      const result = await window.whSSH.searchLocalFiles({
        path: rootPath,
        keyword,
        showHidden: showHiddenLocal.value
      })
      if (requestId !== localSearchRequestId) return
      setFileSearchLoading('local', rootPath, keyword, false)
      notifySearchLimit(result)
      localPath.value = result.rootPath
      localPathInput.value = result.rootPath
      localSearchActive.value = true
      localFiles.value = result.items
      selectedLocal.value = null
      selectedLocals.value = []
      lastLocalIndex.value = -1
    } catch (error) {
      if (requestId === localSearchRequestId) fileSearchState.localLoading = false
      await reportError(error)
    }
  }

  async function runRemoteSearch(event = null) {
    if (!connected.value) return
    const requestId = ++remoteSearchRequestId
    const keyword = getSearchKeywordFromEvent(event, remoteSearchKeyword.value)
    remoteSearchKeyword.value = keyword
    let rootPath = remotePathInput.value.trim() || remotePath.value || '/'
    if (!rootPath.startsWith('/')) rootPath = `/${rootPath}`
    if (!keyword) {
      await loadFiles(remotePath.value)
      return
    }
    try {
      setFileSearchLoading('remote', rootPath, keyword, true)
      const result = await window.whSSH.searchFiles({
        sessionId: sessionId.value,
        path: rootPath,
        keyword
      })
      if (requestId !== remoteSearchRequestId) return
      setFileSearchLoading('remote', rootPath, keyword, false)
      notifySearchLimit(result)
      remotePath.value = result.rootPath
      remotePathInput.value = result.rootPath
      remoteSearchActive.value = true
      files.value = normalizeRemoteFileRows(result.items, result.rootPath || rootPath)
      selectedRemote.value = null
      selectedRemotes.value = []
      lastRemoteIndex.value = -1
    } catch (error) {
      if (requestId === remoteSearchRequestId) fileSearchState.remoteLoading = false
      await reportError(error)
    }
  }

  function getLocalRootDisplayLabel(value) {
    if (!value || value === '__pc__') return '此电脑'
    const matched = localRoots.value.find(item => normalizeLocalComparePath(item.path) === normalizeLocalComparePath(value))
    return matched?.label || value
  }

  function buildLocalBreadcrumbs(value) {
    if (!value || value === '__pc__') return [{ label: '此电脑', path: '__pc__' }]

    const text = String(value || '').replace(/[\\/]+$/, '')
    const driveMatch = text.match(/^([A-Za-z]:)(?:[\\/](.*))?$/)
    if (driveMatch) {
      const driveRoot = `${driveMatch[1]}\\`
      const crumbs = [
        { label: '此电脑', path: '__pc__' },
        { label: getLocalRootDisplayLabel(driveRoot), path: driveRoot }
      ]
      const parts = String(driveMatch[2] || '').split(/[\\/]+/).filter(Boolean)
      let current = driveRoot
      for (const part of parts) {
        current = current.endsWith('\\') ? `${current}${part}` : `${current}\\${part}`
        crumbs.push({ label: part, path: current })
      }
      return crumbs
    }

    const parts = text.split(/[\\/]+/).filter(Boolean)
    const crumbs = [{ label: '此电脑', path: '__pc__' }]
    let current = text.startsWith('/') ? '/' : ''
    for (const part of parts) {
      current = current ? `${current}/${part}`.replace(/\/+/g, '/') : part
      crumbs.push({ label: part, path: current })
    }
    return crumbs
  }

  function isLocalShortcutActive(targetPath) {
    if (targetPath === '__pc__') return localPath.value === '__pc__'
    const current = normalizeLocalComparePath(localPath.value)
    const target = normalizeLocalComparePath(targetPath)
    return current === target || current.startsWith(`${target}\\`) || current.startsWith(`${target}/`)
  }

  function isLocalBreadcrumbActive(targetPath) {
    if (targetPath === '__pc__') return localPath.value === '__pc__'
    return normalizeLocalComparePath(localPath.value) === normalizeLocalComparePath(targetPath)
  }

  async function openLocalShortcut(targetPath) {
    if (!targetPath || targetPath === '__pc__') {
      await loadLocalRoots()
      return
    }
    await loadLocalFiles(targetPath)
  }

  function getLocalItemDirectory(row) {
    if (!row?.path || row.isParent) return ''
    const parent = getLocalParent(row.path)
    return parent === '__pc__' ? '此电脑' : getLocalRootDisplayLabel(parent)
  }

  function buildRemoteBreadcrumbs(value) {
    const normalized = String(value || '/').replace(/\/+/g, '/').replace(/\/+$/g, '') || '/'
    if (normalized === '/') return [{ label: '根目录', path: '/' }]

    const parts = normalized.split('/').filter(Boolean)
    const crumbs = [{ label: '根目录', path: '/' }]
    let current = ''
    for (const part of parts) {
      current = `${current}/${part}` || '/'
      crumbs.push({ label: part, path: current })
    }
    return crumbs
  }

  function isRemoteShortcutActive(targetPath) {
    const current = String(remotePath.value || '/').replace(/\/+/g, '/').replace(/\/+$/g, '') || '/'
    const target = String(targetPath || '/').replace(/\/+/g, '/').replace(/\/+$/g, '') || '/'
    return current === target || (target !== '/' && current.startsWith(`${target}/`))
  }

  function isRemoteBreadcrumbActive(targetPath) {
    const current = String(remotePath.value || '/').replace(/\/+/g, '/').replace(/\/+$/g, '') || '/'
    const target = String(targetPath || '/').replace(/\/+/g, '/').replace(/\/+$/g, '') || '/'
    return current === target
  }

  async function openRemoteShortcut(targetPath) {
    if (!connected.value) return
    await loadFiles(targetPath || '/')
  }

  function getRemoteItemDirectory(row) {
    if (!row?.path || row.isParent) return ''
    return getRemoteParentPath(row.path)
  }

  function normalizeRemoteFileRows(rows = [], basePath = '/') {
    const base = String(basePath || '/').replace(/\/+/g, '/').replace(/\/+$/g, '') || '/'
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
      const name = String(row?.name || '').trim()
      const path = String(row?.path || '').trim()
      const normalizedPath = path ? (path.startsWith('/') ? path : `${base === '/' ? '' : base}/${path}`).replace(/\/+/g, '/') : ''
      const nextPath = (!normalizedPath || normalizedPath === base) && name
        ? `${base === '/' ? '' : base}/${name}`.replace(/\/+/g, '/')
        : normalizedPath
      return { ...row, path: nextPath, __rowKey: `${nextPath || name || 'remote'}:${index}` }
    })
  }

  return {
    filePanelStyle,
    localPinnedRoots,
    localDriveRoots,
    localBreadcrumbs,
    remotePinnedRoots,
    remoteBreadcrumbs,
    localTableFiles,
    remoteTableFiles,
    fileSearchState,
    localGlobalSearch,
    remoteGlobalSearch,
    loadFiles,
    loadLocalFiles,
    loadLocalRoots,
    navigateLocalPath,
    navigateRemotePath,
    resetLocalPathInput,
    resetRemotePathInput,
    handleLocalSearchInput,
    handleRemoteSearchInput,
    clearLocalSearch,
    clearRemoteSearch,
    cancelLocalSearch,
    cancelRemoteSearch,
    runLocalSearch,
    runRemoteSearch,
    scheduleGlobalSearch,
    runGlobalSearch,
    clearGlobalSearch,
    setGlobalSearchOpen,
    openLocalGlobalSearchResult,
    openRemoteGlobalSearchResult,
    getLocalItemDirectory,
    isLocalShortcutActive,
    isLocalBreadcrumbActive,
    openLocalShortcut,
    getRemoteItemDirectory,
    isRemoteShortcutActive,
    isRemoteBreadcrumbActive,
    openRemoteShortcut
  }
}
