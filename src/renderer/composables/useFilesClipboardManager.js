import { computed, ref } from 'vue'

export function useFilesClipboardManager(options) {
  const {
    sessionId,
    localPath,
    remotePath,
    selectedLocal,
    selectedLocals,
    selectedRemotes,
    transferState,
    message,
    reportError,
    loadFiles,
    loadLocalFiles,
    ensureBridgeMethod,
    ensureRemoteWritable,
    getLocalActionItems,
    getRemoteActionItems
  } = options

  const remoteClipboard = ref(null)
  const remoteClipboardCount = computed(() => remoteClipboard.value?.items?.length || 0)

  function startTransfer(title, total) {
    transferState.value = { active: true, title, current: 0, total }
  }

  function updateTransfer(current) {
    transferState.value = { ...transferState.value, current }
  }

  function finishTransfer() {
    transferState.value = { active: false, title: '', current: 0, total: 0 }
  }

  function getRemotePasteTarget(row = null) {
    if (row && row.type === 'd' && !row.isParent) return row.path
    return remotePath.value || '/'
  }

  async function readSystemClipboardPaths() {
    try {
      ensureBridgeMethod('readClipboardFilePaths')
      return (await window.whSSH.readClipboardFilePaths()) || []
    } catch (error) {
      return []
    }
  }

  async function hasCurrentRemoteClipboard() {
    if (!remoteClipboard.value) return false
    const snapshot = remoteClipboard.value.localClipboardSnapshot
    if (!Array.isArray(snapshot)) return true
    const current = await readSystemClipboardPaths()
    if (!current.length) return true
    return current.length === snapshot.length && current.every((item, index) => item === snapshot[index])
  }

  async function copyRemoteEntry(row, operation) {
    const selectedItems = selectedRemotes.value.filter(item => !item.isParent)
    const items = selectedItems.length > 1 && selectedItems.some(item => item.path === row?.path)
      ? selectedItems
      : getRemoteActionItems(row)
    if (!items.length) return
    const localClipboardSnapshot = await readSystemClipboardPaths()
    remoteClipboard.value = {
      items: items.map(item => ({ path: item.path, name: item.name, type: item.type })),
      operation,
      source: 'remote',
      localClipboardSnapshot
    }
    const count = items.length
    const targetName = count > 1 ? `${count} 个项目` : items[0].name
    message.value = operation === 'cut' ? `已剪切 ${targetName}` : `已复制 ${targetName}`
  }

  async function pasteRemoteEntry(targetDir = getRemotePasteTarget()) {
    try {
      if (remoteClipboard.value && !await hasCurrentRemoteClipboard()) remoteClipboard.value = null
      if (!await ensureRemoteWritable(targetDir, '粘贴')) return
      if (!remoteClipboard.value) {
        ensureBridgeMethod('readClipboardFilePaths')
        const localPaths = await window.whSSH.readClipboardFilePaths()
        if (!localPaths?.length) {
          message.value = '剪贴板里没有可粘贴的文件'
          return
        }
        startTransfer(`正在上传本地剪贴板项目到 ${targetDir}`, localPaths.length)
        try {
          for (const [index, localPath] of localPaths.entries()) {
            await window.whSSH.uploadLocalFile({
              sessionId: sessionId.value,
              localPath,
              remoteDir: targetDir
            })
            updateTransfer(index + 1)
          }
          await loadFiles()
        } finally {
          finishTransfer()
        }
        message.value = localPaths.length > 1
          ? `已上传 ${localPaths.length} 个剪贴板项目到目标目录`
          : '已上传剪贴板项目到目标目录'
        return
      }
      const clipboardItems = (remoteClipboard.value.items || []).map(item => ({
        path: String(item?.path || ''),
        name: String(item?.name || ''),
        type: item?.type === 'd' ? 'd' : '-'
      })).filter(item => item.path)
      const operation = remoteClipboard.value.operation === 'cut' ? 'cut' : 'copy'
      if (!clipboardItems.length) {
        message.value = '剪贴板里没有可粘贴的服务器文件'
        return
      }
      startTransfer(`正在${operation === 'cut' ? '移动' : '复制'}服务器文件到 ${targetDir}`, clipboardItems.length || 1)
      let result
      try {
        result = await window.whSSH.pasteRemoteFile({
          sessionId: sessionId.value,
          items: clipboardItems,
          targetDir,
          operation
        })
        updateTransfer(clipboardItems.length || 1)
      } finally {
        finishTransfer()
      }
      if (remoteClipboard.value.operation === 'cut') remoteClipboard.value = null
      const count = result?.items?.length || clipboardItems.length || 1
      message.value = result?.moved
        ? `已移动 ${count} 项到目标目录`
        : `已粘贴 ${count} 项到目标目录`
      await loadFiles()
    } catch (error) {
      await reportError(error)
    }
  }

  async function copyLocalSelection(operation) {
    const selectedItems = selectedLocals.value.filter(item => !item.isParent)
    const items = selectedItems.length > 1 && selectedItems.some(item => item.path === selectedLocal.value?.path)
      ? selectedItems
      : getLocalActionItems(selectedLocal.value)
    if (!items.length) return
    try {
      ensureBridgeMethod('setLocalClipboard')
      await window.whSSH.setLocalClipboard({
        operation: operation === 'cut' ? 'cut' : 'copy',
        items: items.map(item => ({ path: String(item?.path || '') })).filter(item => item.path)
      })
      remoteClipboard.value = null
      message.value = operation === 'cut'
        ? `已剪切 ${items.length > 1 ? `${items.length} 个本地项目` : items[0].name}`
        : `已复制 ${items.length > 1 ? `${items.length} 个本地项目` : items[0].name}`
    } catch (error) {
      await reportError(error)
    }
  }

  async function pasteLocalSelection() {
    if (localPath.value === '__pc__') return
    try {
      if (remoteClipboard.value && !await hasCurrentRemoteClipboard()) remoteClipboard.value = null
      if (remoteClipboard.value) {
        const clipboardItems = (remoteClipboard.value.items || []).map(item => ({
          path: String(item?.path || ''),
          type: item?.type === 'd' ? 'd' : '-'
        })).filter(item => item.path)
        if (!clipboardItems.length) {
          message.value = '剪贴板里没有可粘贴的服务器文件'
          return
        }
        startTransfer(`正在下载服务器剪贴板项目到 ${localPath.value}`, clipboardItems.length)
        try {
          for (const [index, item] of clipboardItems.entries()) {
            await window.whSSH.downloadRemoteFile({
              sessionId: sessionId.value,
              remotePath: item.path,
              localDir: localPath.value,
              type: item.type
            })
            updateTransfer(index + 1)
          }
          await loadLocalFiles(localPath.value)
        } finally {
          finishTransfer()
        }
        message.value = clipboardItems.length > 1
          ? `已从服务器下载 ${clipboardItems.length} 个项目到本地`
          : '已从服务器下载剪贴板项目到本地'
        return
      }
      ensureBridgeMethod('pasteLocalClipboard')
      const result = await window.whSSH.pasteLocalClipboard({ targetDir: localPath.value })
      if (!result.count) return
      await loadLocalFiles(localPath.value)
      message.value = `已粘贴 ${result.count} 个本地项目`
    } catch (error) {
      await reportError(error)
    }
  }

  return {
    remoteClipboard,
    remoteClipboardCount,
    getRemotePasteTarget,
    copyRemoteEntry,
    pasteRemoteEntry,
    copyLocalSelection,
    pasteLocalSelection
  }
}
