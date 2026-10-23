import { ref } from 'vue'
import { ElMessage } from 'element-plus'

export function useFilesSelectionManager(options) {
  const {
    localPath,
    remotePath,
    lastLocalIndex: externalLastLocalIndex,
    lastRemoteIndex: externalLastRemoteIndex,
    localTableRef,
    remoteTableRef,
    localTableFiles,
    remoteTableFiles,
    localDropTargetPath,
    remoteDropTargetPath,
    selectedLocal,
    selectedLocals,
    selectedRemote,
    selectedRemotes,
    mediaPreview,
    imagePreview,
    copyLocalSelection,
    pasteLocalSelection,
    copyRemoteEntry,
    pasteRemoteEntry,
    deleteLocalItem,
    deleteSelectedLocals,
    deleteFile,
    deleteSelectedRemotes,
    goLocalParent,
    handleMediaPreviewShortcut,
    showNativeContextMenu
  } = options

  const activeFilePane = ref('local')
  const lastLocalIndex = externalLastLocalIndex || ref(-1)
  const lastRemoteIndex = externalLastRemoteIndex || ref(-1)
  const localSelectionSoft = ref(false)
  const remoteSelectionSoft = ref(false)

  function syncLocalSelection(rows) {
    selectedLocals.value = rows
    localSelectionSoft.value = false
  }

  function syncRemoteSelection(rows) {
    selectedRemotes.value = rows
    remoteSelectionSoft.value = false
  }

  function isSelectedByPath(list, row) {
    const rowKey = getFileSelectionKey(row)
    return list.some(item => getFileSelectionKey(item) === rowKey)
  }

  function getFileSelectionKey(row) {
    if (!row) return ''
    const path = String(row.path || '').trim()
    if (path) return path
    return [row.scope || '', row.type || '', row.name || '', row.size || 0, row.modifyTime || 0].join(':')
  }

  function setActiveFilePane(pane) {
    activeFilePane.value = pane
  }

  function mergeSelection(current, range) {
    const selectedRows = new Set(current)
    return [...current, ...range.filter(item => !selectedRows.has(item))]
  }

  function handleLocalPaneMouseDown(event) {
    setActiveFilePane('local')
    const target = event?.target
    if (target?.closest?.('.el-table__body tr') || target?.closest?.('.el-table__header') || target?.closest?.('.local-shortcut-button') || target?.closest?.('.local-breadcrumb-button') || target?.closest?.('button, input, textarea, .el-button')) {
      return
    }
    if (selectedLocals.value.length) {
      localSelectionSoft.value = true
      localTableRef.value?.setCurrentRow?.(null)
    }
  }

  function handleRemotePaneMouseDown(event) {
    setActiveFilePane('remote')
    const target = event?.target
    if (target?.closest?.('.el-table__body tr') || target?.closest?.('.el-table__header') || target?.closest?.('.local-shortcut-button') || target?.closest?.('.local-breadcrumb-button') || target?.closest?.('button, input, textarea, .el-button')) {
      return
    }
    if (selectedRemotes.value.length) {
      remoteSelectionSoft.value = true
      remoteTableRef.value?.setCurrentRow?.(null)
    }
  }

  function getLocalActionItems(row = selectedLocal.value) {
    if (!row || row.isParent) return []
    if (selectedLocals.value.length > 1 && isSelectedByPath(selectedLocals.value, row)) {
      return selectedLocals.value.filter(item => !item.isParent)
    }
    return [row]
  }

  function getRemoteActionItems(row = selectedRemote.value) {
    if (!row || row.isParent) return []
    if (selectedRemotes.value.length > 1 && isSelectedByPath(selectedRemotes.value, row)) {
      return selectedRemotes.value.filter(item => !item.isParent)
    }
    return [row]
  }

  function handleLocalRowClick(row, column, event) {
    setActiveFilePane('local')
    if (row.isParent) return
    const rows = localTableFiles.value.filter(item => !item.isParent)
    const rowKey = getFileSelectionKey(row)
    const rowIndex = rows.findIndex(item => getFileSelectionKey(item) === rowKey)
    if (event.shiftKey && lastLocalIndex.value >= 0) {
      const start = Math.min(lastLocalIndex.value, rowIndex)
      const end = Math.max(lastLocalIndex.value, rowIndex)
      const range = rows.slice(start, end + 1)
      syncLocalSelection(event.ctrlKey || event.metaKey
        ? mergeSelection(selectedLocals.value, range)
        : range)
    } else if (event.ctrlKey || event.metaKey) {
      const next = isSelectedByPath(selectedLocals.value, row)
        ? selectedLocals.value.filter(item => getFileSelectionKey(item) !== rowKey)
        : [...selectedLocals.value, row]
      syncLocalSelection(next)
      lastLocalIndex.value = rowIndex
    } else {
      syncLocalSelection([row])
      lastLocalIndex.value = rowIndex
    }
    selectedLocal.value = row
  }

  function handleRemoteRowClick(row, column, event) {
    setActiveFilePane('remote')
    if (row.isParent) return
    const rows = remoteTableFiles.value.filter(item => !item.isParent)
    const rowIndex = rows.findIndex(item => item === row)
    if (event.shiftKey && lastRemoteIndex.value >= 0) {
      const start = Math.min(lastRemoteIndex.value, rowIndex)
      const end = Math.max(lastRemoteIndex.value, rowIndex)
      const range = rows.slice(start, end + 1)
      syncRemoteSelection(event.ctrlKey || event.metaKey
        ? mergeSelection(selectedRemotes.value, range)
        : range)
    } else if (event.ctrlKey || event.metaKey) {
      const next = isSelectedByPath(selectedRemotes.value, row)
        ? selectedRemotes.value.filter(item => getFileSelectionKey(item) !== getFileSelectionKey(row))
        : [...selectedRemotes.value, row]
      syncRemoteSelection(next)
      lastRemoteIndex.value = rowIndex
    } else {
      syncRemoteSelection([row])
      lastRemoteIndex.value = rowIndex
    }
    selectedRemote.value = row
  }

  async function showLocalContextMenu(row, column, event) {
    event.preventDefault()
    event.stopPropagation()
    setActiveFilePane('local')
    if (row.isParent) {
      goLocalParent()
      return
    }
    const rows = localTableFiles.value.filter(item => !item.isParent)
    const rowKey = getFileSelectionKey(row)
    const rowIndex = rows.findIndex(item => getFileSelectionKey(item) === rowKey)
    if (!selectedLocals.value.some(item => getFileSelectionKey(item) === rowKey)) {
      syncLocalSelection([row])
      lastLocalIndex.value = rowIndex
    }
    selectedLocal.value = row
    try {
      await window.whSSH.showLocalContextMenu({ path: row.path })
    } catch (error) {
      ElMessage.error(`打开本地文件菜单失败：${error?.message || error}`)
    }
  }

  async function showLocalDriveContextMenu(row, event) {
    event.preventDefault()
    event.stopPropagation()
    setActiveFilePane('local')
    selectedLocal.value = null
    selectedLocals.value = []
    await showNativeContextMenu('local-drive', row, event)
  }

  async function showLocalPanelContextMenu(event) {
    event.preventDefault()
    event.stopPropagation()
    setActiveFilePane('local')
    selectedLocal.value = null
    await showNativeContextMenu('local-panel', null, event)
  }

  async function showRemoteContextMenu(row, column, event) {
    event.preventDefault()
    event.stopPropagation()
    setActiveFilePane('remote')
    if (row.isParent) return
    const rows = remoteTableFiles.value.filter(item => !item.isParent)
    const rowIndex = rows.findIndex(item => item === row)
    if (!isSelectedByPath(selectedRemotes.value, row)) {
      syncRemoteSelection([row])
      lastRemoteIndex.value = rowIndex
    }
    selectedRemote.value = row
    await showNativeContextMenu('remote', row, event)
  }

  async function showRemotePanelContextMenu(event) {
    event.preventDefault()
    event.stopPropagation()
    setActiveFilePane('remote')
    selectedRemote.value = null
    await showNativeContextMenu('remote-panel', null, event)
  }

  function localRowClassName({ row }) {
    const classes = []
    const rowKey = getFileSelectionKey(row)
    if (selectedLocals.value.some(item => getFileSelectionKey(item) === rowKey)) {
      classes.push('selected-row')
      if (localSelectionSoft.value) classes.push('selected-row-soft')
    }
    if (localDropTargetPath.value && row.path === localDropTargetPath.value) classes.push('drop-target-row')
    return classes.join(' ')
  }

  function remoteRowClassName({ row }) {
    const classes = []
    if (isSelectedByPath(selectedRemotes.value, row)) {
      classes.push('selected-row')
      if (remoteSelectionSoft.value) classes.push('selected-row-soft')
    }
    if (remoteDropTargetPath.value && row.path === remoteDropTargetPath.value) classes.push('drop-target-row')
    return classes.join(' ')
  }

  function handleFilesPaneShortcut(event) {
    if (mediaPreview.value.open) {
      if (handleMediaPreviewShortcut(event)) return true
      return true
    }

    if (imagePreview.value.open) return true

    const ctrlOrMeta = event.ctrlKey || event.metaKey
    const key = String(event.key || '').toLowerCase()

    if (activeFilePane.value === 'local') {
      if ((ctrlOrMeta && key === 'd') || event.key === 'Delete') {
        const items = getLocalActionItems(selectedLocal.value)
        if (!items.length) return true
        event.preventDefault()
        if (items.length > 1) deleteSelectedLocals()
        else deleteLocalItem(items[0])
        return true
      }
      if (!ctrlOrMeta) return true
      if (key === 'a') {
        const items = localTableFiles.value.filter(item => !item.isParent)
        if (!items.length) return true
        event.preventDefault()
        syncLocalSelection(items)
        selectedLocal.value = items[items.length - 1]
        lastLocalIndex.value = items.length - 1
      } else if (key === 'c') {
        const items = getLocalActionItems(selectedLocal.value)
        if (!items.length) return true
        event.preventDefault()
        void copyLocalSelection('copy')
      } else if (key === 'x') {
        const items = getLocalActionItems(selectedLocal.value)
        if (!items.length) return true
        event.preventDefault()
        void copyLocalSelection('cut')
      } else if (key === 'v') {
        if (localPath.value === '__pc__') return true
        event.preventDefault()
        void pasteLocalSelection()
      }
      return true
    }

    if (activeFilePane.value === 'remote') {
      if ((ctrlOrMeta && key === 'd') || event.key === 'Delete') {
        const items = getRemoteActionItems(selectedRemote.value)
        if (!items.length) return true
        event.preventDefault()
        if (items.length > 1) deleteSelectedRemotes()
        else deleteFile(items[0])
        return true
      }
      if (!ctrlOrMeta) return true
      if (key === 'a') {
        const items = remoteTableFiles.value.filter(item => !item.isParent)
        if (!items.length) return true
        event.preventDefault()
        syncRemoteSelection(items)
        selectedRemote.value = items[items.length - 1]
        lastRemoteIndex.value = items.length - 1
      } else if (key === 'c') {
        const items = getRemoteActionItems(selectedRemote.value)
        if (!items.length) return true
        event.preventDefault()
        void copyRemoteEntry(selectedRemote.value, 'copy')
      } else if (key === 'x') {
        const items = getRemoteActionItems(selectedRemote.value)
        if (!items.length) return true
        event.preventDefault()
        void copyRemoteEntry(selectedRemote.value, 'cut')
      } else if (key === 'v') {
        event.preventDefault()
        void pasteRemoteEntry(remotePath.value || '/')
      }
      return true
    }

    return false
  }

  return {
    activeFilePane,
    lastLocalIndex,
    lastRemoteIndex,
    localSelectionSoft,
    remoteSelectionSoft,
    syncLocalSelection,
    syncRemoteSelection,
    isSelectedByPath,
    setActiveFilePane,
    getLocalActionItems,
    getRemoteActionItems,
    handleLocalPaneMouseDown,
    handleRemotePaneMouseDown,
    handleLocalRowClick,
    handleRemoteRowClick,
    showLocalContextMenu,
    showLocalDriveContextMenu,
    showLocalPanelContextMenu,
    showRemoteContextMenu,
    showRemotePanelContextMenu,
    localRowClassName,
    remoteRowClassName,
    handleFilesPaneShortcut
  }
}
