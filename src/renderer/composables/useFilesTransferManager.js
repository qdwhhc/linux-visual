import { ref } from 'vue'

export function useFilesTransferManager(options) {
  const {
    connected,
    sessionId,
    localPath,
    remotePath,
    selectedLocals,
    selectedRemotes,
    message,
    reportError,
    loadFiles,
    loadLocalFiles,
    ensureRemoteWritable,
    transferState: externalTransferState
  } = options

  const transferState = externalTransferState || ref({ active: false, title: '', current: 0, total: 0 })
  const localDropActive = ref(false)
  const remoteDropActive = ref(false)
  const localDropTargetPath = ref('')
  const remoteDropTargetPath = ref('')

  let dragPayload = null

  function isSelectedByPath(list, row) {
    return list.some(item => item.path === row.path)
  }

  function onDragOver(event) {
    event.dataTransfer.dropEffect = 'copy'
  }

  function onMoveDragOver(event) {
    event.dataTransfer.dropEffect = 'move'
  }

  function isLeavingDropArea(event) {
    const target = event?.currentTarget
    if (!target?.getBoundingClientRect) return true
    const rect = target.getBoundingClientRect()
    const x = event.clientX
    const y = event.clientY
    return x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom
  }

  async function getExternalDraggedPaths(event) {
    const fileList = Array.from(event?.dataTransfer?.files || [])
    if (!fileList.length) return []
    const bridgePaths = typeof window.whSSH?.getDroppedFilePaths === 'function'
      ? await window.whSSH.getDroppedFilePaths(fileList)
      : fileList.map(item => String(item?.path || '').trim())
    return [...new Set((bridgePaths || []).filter(Boolean))]
  }

  function hasExternalDraggedFiles(event) {
    return Array.from(event?.dataTransfer?.types || []).includes('Files')
  }

  async function importExternalFilesToLocal(paths, targetDir, skipRefresh = false) {
    if (!paths.length) return 0
    if (!targetDir || targetDir === '__pc__') {
      await reportError(new Error('请先在左侧本地文件栏进入一个具体目录，再拖入本地文件。'))
      return 0
    }
    const result = await window.whSSH.importLocalPaths({ paths, targetDir })
    if (!skipRefresh) await loadLocalFiles(targetDir)
    return result?.count || 0
  }

  async function uploadLocalToRemote(path, targetDir, skipWriteCheck = false, skipRefresh = false) {
    if (!connected.value) {
      message.value = '请先连接服务器'
      return
    }
    const destination = normalizeRemoteTargetDir(targetDir)
    try {
      if (!skipWriteCheck && !await ensureRemoteWritable(destination, '上传')) return
      await window.whSSH.uploadLocalFile({ sessionId: sessionId.value, localPath: path, remoteDir: destination })
      message.value = '已上传到服务器'
      if (!skipRefresh) await loadFiles()
    } catch (error) {
      await reportError(error)
    }
  }

  async function uploadExternalFilesToRemote(paths, targetDir, skipRefresh = false) {
    if (!paths.length) return 0
    const destination = normalizeRemoteTargetDir(targetDir)
    for (const filePath of paths) {
      await uploadLocalToRemote(filePath, destination, true, true)
    }
    if (!skipRefresh) await loadFiles(destination)
    return paths.length
  }

  async function downloadRemoteToLocal(path, targetDir, type, skipRefresh = false) {
    if (!connected.value) {
      message.value = '请先连接服务器'
      return
    }
    if (!targetDir || targetDir === '__pc__') {
      await reportError(new Error('请先在左侧本地文件栏进入一个具体目录，再下载服务器文件。'))
      return null
    }
    try {
      const result = await window.whSSH.downloadRemoteFile({ sessionId: sessionId.value, remotePath: path, localDir: targetDir, type })
      message.value = '已下载到本地目录'
      if (!skipRefresh) await loadLocalFiles(targetDir)
      return result
    } catch (error) {
      await reportError(error)
      return null
    }
  }

  function startTransfer(title, total) {
    transferState.value = { active: true, title, current: 0, total }
  }

  function updateTransfer(current) {
    transferState.value = { ...transferState.value, current }
  }

  function finishTransfer() {
    transferState.value = { active: false, title: '', current: 0, total: 0 }
  }

  function onDragEnd() {
    dragPayload = null
    localDropActive.value = false
    remoteDropActive.value = false
    localDropTargetPath.value = ''
    remoteDropTargetPath.value = ''
  }

  function getPathLeafLabel(targetPath, fallback = '当前目录') {
    const text = String(targetPath || '').replace(/[\\/]+$/, '')
    if (!text || text === '__pc__') return fallback
    const segments = text.split(/[\\/]+/).filter(Boolean)
    return segments[segments.length - 1] || text || fallback
  }

  function normalizeRemoteTargetDir(targetDir) {
    const text = String(targetDir || remotePath.value || '/').trim().replace(/\\+/g, '/')
    if (!text) return '/'
    return (text.startsWith('/') ? text : `/${text}`).replace(/\/+/g, '/') || '/'
  }

  function getPathBaseName(value) {
    const text = String(value || '').replace(/[\\/]+$/, '')
    const parts = text.split(/[\\/]+/).filter(Boolean)
    return parts[parts.length - 1] || ''
  }

  function joinLocalPath(dir, name) {
    const base = String(dir || '').replace(/[\\/]+$/, '')
    const separator = base.includes('\\') || /^[A-Za-z]:/.test(base) ? '\\' : '/'
    return `${base}${separator}${name}`
  }

  function joinRemotePath(dir, name) {
    const base = normalizeRemoteTargetDir(dir).replace(/\/+$/, '') || '/'
    return `${base === '/' ? '' : base}/${name}`.replace(/\/+/g, '/') || '/'
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function isSameOrChildPath(pathValue, parentValue, remote = false) {
    const source = String(pathValue || '').replace(/[\\/]+$/, '')
    const target = String(parentValue || '').replace(/[\\/]+$/, '')
    if (!source || !target) return false
    const separatorPattern = remote ? '/' : '[\\\\/]'
    const flags = remote ? '' : 'i'
    return new RegExp(`^${escapeRegExp(source)}(${separatorPattern}|$)`, flags).test(target)
  }

  async function moveLocalItemsToDirectory(items, destination) {
    const movableItems = (items || []).filter(item => item?.path && !item.isParent && item.path !== destination && !isSameOrChildPath(item.path, destination))
    if (!movableItems.length) {
      onDragEnd()
      return
    }
    startTransfer(`正在移动到 ${getPathLeafLabel(destination, '本地目录')}`, movableItems.length)
    try {
      for (const [index, item] of movableItems.entries()) {
        updateTransfer(index + 1)
        const name = item.name || getPathBaseName(item.path)
        await window.whSSH.renameLocalPath({ oldPath: item.path, newPath: joinLocalPath(destination, name) })
      }
      await loadLocalFiles(localPath.value)
      message.value = movableItems.length > 1 ? `已移动 ${movableItems.length} 个项目` : '已移动到目标文件夹'
    } catch (error) {
      await reportError(error)
    } finally {
      finishTransfer()
      onDragEnd()
    }
  }

  async function moveRemoteItemsToDirectory(items, destination) {
    const normalizedDestination = normalizeRemoteTargetDir(destination)
    const movableItems = (items || []).filter(item => item?.path && !item.isParent && item.path !== normalizedDestination && !isSameOrChildPath(item.path, normalizedDestination, true))
    if (!movableItems.length) {
      onDragEnd()
      return
    }
    if (!await ensureRemoteWritable(normalizedDestination, '移动')) {
      onDragEnd()
      return
    }
    startTransfer(`正在移动到 ${getPathLeafLabel(normalizedDestination, '服务器目录')}`, movableItems.length)
    try {
      for (const [index, item] of movableItems.entries()) {
        updateTransfer(index + 1)
        const name = item.name || getPathBaseName(item.path)
        await window.whSSH.renameFile({ sessionId: sessionId.value, oldPath: item.path, newPath: joinRemotePath(normalizedDestination, name) })
      }
      await loadFiles(remotePath.value)
      message.value = movableItems.length > 1 ? `已移动 ${movableItems.length} 个项目` : '已移动到目标文件夹'
    } catch (error) {
      await reportError(error)
    } finally {
      finishTransfer()
      onDragEnd()
    }
  }

  function onLocalDragStart(row, event) {
    if (row.isParent) return
    const items = selectedLocals.value.length > 1 && isSelectedByPath(selectedLocals.value, row)
      ? selectedLocals.value.filter(item => !item.isParent)
      : [row]
    dragPayload = { source: 'local', items, isDirectory: items.some(item => item.type === 'd') }
    event.dataTransfer.setData('application/x-local-files', JSON.stringify(items.map(item => ({ path: item.path, type: item.type }))))
    event.dataTransfer.effectAllowed = 'copyMove'
  }

  function onRemoteDragStart(row, event) {
    if (row.isParent) return
    const items = selectedRemotes.value.length > 1 && isSelectedByPath(selectedRemotes.value, row)
      ? selectedRemotes.value.filter(item => !item.isParent)
      : [row]
    dragPayload = { source: 'remote', items, isDirectory: items.some(item => item.type === 'd') }
    event.dataTransfer.setData('application/x-remote-files', JSON.stringify(items.map(item => ({ path: item.path, type: item.type }))))
    event.dataTransfer.effectAllowed = 'copy'
  }

  function onLocalPanelDragEnter(event) {
    if (dragPayload?.source === 'remote' || hasExternalDraggedFiles(event)) {
      localDropTargetPath.value = ''
      localDropActive.value = true
    }
  }

  function onLocalPanelDragLeave(event) {
    if (!isLeavingDropArea(event)) return
    localDropActive.value = false
    localDropTargetPath.value = ''
  }

  function onLocalPanelDragOver(event) {
    onDragOver(event)
  }

  function onLocalRowDragEnter(row, event) {
    if (dragPayload?.source === 'local' && row.type === 'd' && !row.isParent) {
      localDropTargetPath.value = row.path
      return
    }
    if ((dragPayload?.source === 'remote' || hasExternalDraggedFiles(event)) && row.type === 'd' && !row.isParent) {
      localDropTargetPath.value = row.path
      localDropActive.value = true
    }
  }

  function onLocalRowDragLeave(row) {
    if (localDropTargetPath.value === row.path) localDropTargetPath.value = ''
  }

  function onLocalRowDragOver(row, event) {
    dragPayload?.source === 'local' ? onMoveDragOver(event) : onDragOver(event)
    if (dragPayload?.source === 'local' && row.type === 'd' && !row.isParent) {
      localDropTargetPath.value = row.path
      return
    }
    if ((dragPayload?.source === 'remote' || hasExternalDraggedFiles(event)) && row.type === 'd' && !row.isParent) {
      localDropTargetPath.value = row.path
      localDropActive.value = true
    }
  }

  async function onLocalPanelDrop(event) {
    const destination = localPath.value
    const externalPaths = await getExternalDraggedPaths(event)
    if (externalPaths.length) {
      startTransfer(`正在复制到 ${getPathLeafLabel(destination, '本地目录')}`, externalPaths.length)
      try {
        for (const [index, filePath] of externalPaths.entries()) {
          updateTransfer(index + 1)
          await importExternalFilesToLocal([filePath], destination, true)
        }
        await loadLocalFiles(destination)
        message.value = externalPaths.length > 1 ? `已复制 ${externalPaths.length} 个项目到本地目录` : '文件已复制到本地目录'
      } finally {
        finishTransfer()
        onDragEnd()
      }
      return
    }
    if (dragPayload?.source !== 'remote') {
      onDragEnd()
      return
    }
    const items = dragPayload.items || [{ path: dragPayload.path, type: dragPayload.isDirectory ? 'd' : '-' }]
    if (!destination || destination === '__pc__') {
      await reportError(new Error('请先在左侧本地文件栏进入一个具体目录，再拖拽下载服务器文件。'))
      onDragEnd()
      return
    }
    startTransfer(`正在下载到 ${getPathLeafLabel(destination, '本地目录')}`, items.length)
    try {
      for (const [index, item] of items.entries()) {
        updateTransfer(index + 1)
        await downloadRemoteToLocal(item.path, destination, item.type, true)
      }
      await loadLocalFiles(destination)
      message.value = `已下载 ${items.length} 个项目到本地目录`
    } finally {
      finishTransfer()
      onDragEnd()
    }
  }

  function onRemotePanelDragEnter(event) {
    if (dragPayload?.source === 'local' || hasExternalDraggedFiles(event)) {
      remoteDropTargetPath.value = ''
      remoteDropActive.value = true
    }
  }

  function onRemotePanelDragLeave(event) {
    if (!isLeavingDropArea(event)) return
    remoteDropActive.value = false
    remoteDropTargetPath.value = ''
  }

  function onRemotePanelDragOver(event) {
    onDragOver(event)
  }

  function onRemoteRowDragEnter(row, event) {
    if (dragPayload?.source === 'remote' && row.type === 'd' && !row.isParent) {
      remoteDropTargetPath.value = row.path
      return
    }
    if ((dragPayload?.source === 'local' || hasExternalDraggedFiles(event)) && row.type === 'd' && !row.isParent) {
      remoteDropTargetPath.value = row.path
      remoteDropActive.value = true
    }
  }

  function onRemoteRowDragLeave(row) {
    if (remoteDropTargetPath.value === row.path) remoteDropTargetPath.value = ''
  }

  function onRemoteRowDragOver(row, event) {
    dragPayload?.source === 'remote' ? onMoveDragOver(event) : onDragOver(event)
    if (dragPayload?.source === 'remote' && row.type === 'd' && !row.isParent) {
      remoteDropTargetPath.value = row.path
      return
    }
    if ((dragPayload?.source === 'local' || hasExternalDraggedFiles(event)) && row.type === 'd' && !row.isParent) {
      remoteDropTargetPath.value = row.path
      remoteDropActive.value = true
    }
  }

  async function onRemotePanelDrop(event) {
    const destination = remotePath.value
    const externalPaths = await getExternalDraggedPaths(event)
    if (externalPaths.length) {
      startTransfer(`正在上传到 ${getPathLeafLabel(destination, '服务器目录')}`, externalPaths.length)
      try {
        for (const [index, filePath] of externalPaths.entries()) {
          updateTransfer(index + 1)
          await uploadExternalFilesToRemote([filePath], destination, true)
        }
        await loadFiles(destination)
        message.value = externalPaths.length > 1 ? `已上传 ${externalPaths.length} 个项目到服务器目录` : '文件已上传到服务器目录'
      } finally {
        finishTransfer()
        onDragEnd()
      }
      return
    }
    if (dragPayload?.source !== 'local') {
      onDragEnd()
      return
    }
    const items = dragPayload.items || [{ path: dragPayload.path, type: dragPayload.isDirectory ? 'd' : '-' }]
    startTransfer('正在上传到服务器目录', items.length)
    try {
      for (const [index, item] of items.entries()) {
        updateTransfer(index + 1)
        await uploadLocalToRemote(item.path, destination, true, true)
      }
      await loadFiles(destination)
      message.value = `已上传 ${items.length} 个项目到服务器目录`
    } finally {
      finishTransfer()
      onDragEnd()
    }
  }

  async function onLocalRowDrop(row, event) {
    if (dragPayload?.source === 'local' && row.type === 'd' && !row.isParent) {
      const items = dragPayload.items || [{ path: dragPayload.path, type: dragPayload.isDirectory ? 'd' : '-' }]
      await moveLocalItemsToDirectory(items, row.path)
      return
    }
    if (localDropActive.value && dragPayload?.source !== 'local') return await onLocalPanelDrop(event)
    const externalPaths = await getExternalDraggedPaths(event)
    if (externalPaths.length) {
      const destination = row.type === 'd' && !row.isParent ? row.path : localPath.value
      startTransfer(`正在复制到 ${getPathLeafLabel(destination, row.name || '本地目录')}`, externalPaths.length)
      try {
        for (const [index, filePath] of externalPaths.entries()) {
          updateTransfer(index + 1)
          await importExternalFilesToLocal([filePath], destination, true)
        }
        await loadLocalFiles(destination)
        message.value = externalPaths.length > 1 ? `已复制 ${externalPaths.length} 个项目到本地目录` : '文件已复制到本地目录'
      } finally {
        finishTransfer()
        onDragEnd()
      }
      return
    }
    if (dragPayload?.source !== 'remote') return
    const destination = row.type === 'd' && !row.isParent ? row.path : localPath.value
    const items = dragPayload.items || [{ path: dragPayload.path, type: dragPayload.isDirectory ? 'd' : '-' }]
    if (!destination || destination === '__pc__') {
      await reportError(new Error('请先在左侧本地文件栏进入一个具体目录，再拖拽下载服务器文件。'))
      onDragEnd()
      return
    }
    startTransfer(row.type === 'd' && !row.isParent ? `正在下载到 ${row.name}` : '正在下载到本地目录', items.length)
    try {
      for (const [index, item] of items.entries()) {
        updateTransfer(index + 1)
        await downloadRemoteToLocal(item.path, destination, item.type, true)
      }
      await loadLocalFiles(destination)
      message.value = `已下载 ${items.length} 个项目到本地目录`
    } finally {
      finishTransfer()
      onDragEnd()
    }
  }

  async function onRemoteRowDrop(row, event) {
    if (dragPayload?.source === 'remote' && row.type === 'd' && !row.isParent) {
      const items = dragPayload.items || [{ path: dragPayload.path, type: dragPayload.isDirectory ? 'd' : '-' }]
      await moveRemoteItemsToDirectory(items, row.path)
      return
    }
    if (remoteDropActive.value && dragPayload?.source !== 'remote') return await onRemotePanelDrop(event)
    const externalPaths = await getExternalDraggedPaths(event)
    if (externalPaths.length) {
      const destination = row.type === 'd' && !row.isParent ? row.path : remotePath.value
      startTransfer(`正在上传到 ${getPathLeafLabel(destination, row.name || '服务器目录')}`, externalPaths.length)
      try {
        for (const [index, filePath] of externalPaths.entries()) {
          updateTransfer(index + 1)
          await uploadExternalFilesToRemote([filePath], destination, true)
        }
        await loadFiles(destination)
        message.value = externalPaths.length > 1 ? `已上传 ${externalPaths.length} 个项目到服务器目录` : '文件已上传到服务器目录'
      } finally {
        finishTransfer()
        onDragEnd()
      }
      return
    }
    if (dragPayload?.source !== 'local') return
    const destination = row.type === 'd' && !row.isParent ? row.path : remotePath.value
    const items = dragPayload.items || [{ path: dragPayload.path, type: dragPayload.isDirectory ? 'd' : '-' }]
    startTransfer(row.type === 'd' && !row.isParent ? `正在上传到 ${row.name}` : '正在上传到服务器目录', items.length)
    try {
      for (const [index, item] of items.entries()) {
        updateTransfer(index + 1)
        await uploadLocalToRemote(item.path, destination, true, true)
      }
      await loadFiles()
      message.value = `已上传 ${items.length} 个项目到服务器目录`
    } finally {
      finishTransfer()
      onDragEnd()
    }
  }

  return {
    transferState,
    localDropActive,
    remoteDropActive,
    localDropTargetPath,
    remoteDropTargetPath,
    onDragEnd,
    onLocalDragStart,
    onRemoteDragStart,
    onLocalPanelDragEnter,
    onLocalPanelDragLeave,
    onLocalPanelDragOver,
    onLocalRowDragEnter,
    onLocalRowDragLeave,
    onLocalRowDragOver,
    onLocalPanelDrop,
    onRemotePanelDragEnter,
    onRemotePanelDragLeave,
    onRemotePanelDragOver,
    onRemoteRowDragEnter,
    onRemoteRowDragLeave,
    onRemoteRowDragOver,
    onRemotePanelDrop,
    onLocalRowDrop,
    onRemoteRowDrop
  }
}
