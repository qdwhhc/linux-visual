import { ElMessageBox } from 'element-plus'

export function useFilesContextMenuManager(options) {
  const {
    localPath,
    remotePath,
    selectedLocals,
    selectedRemote,
    remoteClipboard,
    loadFiles,
    loadLocalFiles,
    loadLocalRoots,
    message,
    reportError,
    getRemoteActionItems,
    getRemotePasteTarget,
    openLocalFile,
    openFile,
    openEditor,
    openImagePreview,
    openRemoteMediaPreview,
    isImageFile,
    isPreviewableRemoteMediaFile,
    createLocalFile,
    createLocalFolder,
    createRemoteFile,
    pasteLocalSelection,
    deleteLocalItem,
    renameLocalItem,
    makeDir,
    pasteRemoteEntry,
    openRemoteShortcut,
    renameRemoteShortcut,
    removeRemoteShortcut,
    addRemoteShortcut,
    uploadSelectedLocalTo,
    copyRemoteEntry,
    downloadSelectedRemote,
    downloadSingleRemote,
    extractRemoteArchive,
    compressRemote,
    renameFile,
    deleteFile,
    deleteSelectedRemotes
  } = options

  async function withRemoteOpenCursor(action) {
    document?.documentElement?.classList.add('remote-open-busy')
    try {
      return await action()
    } finally {
      document?.documentElement?.classList.remove('remote-open-busy')
    }
  }

  function formatContextByteSize(value) {
    const size = Number(value || 0)
    if (!Number.isFinite(size) || size <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    let target = size
    let unitIndex = 0
    while (target >= 1024 && unitIndex < units.length - 1) {
      target /= 1024
      unitIndex += 1
    }
    const digits = target >= 100 || unitIndex === 0 ? 0 : target >= 10 ? 1 : 2
    return `${target.toFixed(digits).replace(/\.0+$/, '')} ${units[unitIndex]}`
  }

  function formatContextDateTime(value) {
    const numeric = Number(value || 0)
    if (!Number.isFinite(numeric) || numeric <= 0) return '未知'
    const date = new Date(numeric > 1e12 ? numeric : numeric * 1000)
    if (Number.isNaN(date.getTime())) return '未知'
    return date.toLocaleString('zh-CN', { hour12: false })
  }

  function getRemotePathTypeLabel(row) {
    return row?.type === 'd' ? '文件夹' : '文件'
  }

  function formatRemoteRights(value) {
    if (typeof value === 'string') return value.trim()
    if (!value || typeof value !== 'object') return String(value || '').trim()
    const formatPart = part => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return String(part || '')
      return `${part.read ? 'r' : '-'}${part.write ? 'w' : '-'}${part.execute ? 'x' : '-'}`
    }
    if ('user' in value || 'group' in value || 'other' in value || 'world' in value) {
      return [value.user, value.group, value.other ?? value.world].map(formatPart).join('')
    }
    if ('read' in value || 'write' in value || 'execute' in value) return formatPart(value)
    try {
      return JSON.stringify(value)
    } catch (error) {
      return '未知'
    }
  }

  function getRemoteAccessLabel(row) {
    const rights = formatRemoteRights(row?.rights)
    if (!rights) return '未知'
    const normalized = rights.startsWith('d') || rights.startsWith('-') ? rights.slice(1) : rights
    const readable = normalized.includes('r') ? '包含读权限' : '未显示读权限'
    const writable = normalized.includes('w') ? '包含写权限' : '未显示写权限'
    return `${readable} / ${writable}`
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]))
  }

  function buildPropertiesTable(items) {
    return `<div class="file-properties-table">${items.map(item => `
      <div class="file-properties-row">
        <div class="file-properties-label">${escapeHtml(item.label)}</div>
        <div class="file-properties-value">${escapeHtml(item.value)}</div>
      </div>`).join('')}
    </div>`
  }

  async function showRemoteProperties(row) {
    const content = buildPropertiesTable([
      { label: '名称', value: row?.name || '' },
      { label: '路径', value: row?.path || '' },
      { label: '类型', value: getRemotePathTypeLabel(row) },
      { label: '大小', value: row?.type === 'd' ? '文件夹大小未递归计算' : formatContextByteSize(row?.size) },
       { label: '权限', value: formatRemoteRights(row?.rights) || '未知' },
      { label: '读写状态', value: getRemoteAccessLabel(row) },
      { label: '修改时间', value: formatContextDateTime(row?.modifyTime) }
    ])
    await ElMessageBox.alert(content, '属性', {
      confirmButtonText: '确定',
      dangerouslyUseHTMLString: true,
      customClass: 'file-properties-message-box'
    })
  }

  function getFileContextActions(menuType, row = null) {
    if (menuType === 'local-panel') {
      const canWriteLocalDir = !!localPath.value && localPath.value !== '__pc__'
      return [
        { key: 'new-local-file', label: '新建文件', enabled: canWriteLocalDir },
        { key: 'new-local-folder', label: '新建文件夹', enabled: canWriteLocalDir },
        { key: 'paste-local', label: '粘贴', enabled: canWriteLocalDir },
        { key: 'refresh-local', label: '刷新本地列表' }
      ]
    }
    if (menuType === 'local') {
      if (!row || row.isParent) return []
      return [
        { key: 'open-local', label: row.type === 'd' ? '打开目录' : '打开' },
        { key: 'rename-local', label: '重命名' },
        { key: 'delete-local', label: '删除' }
      ]
    }
    if (menuType === 'local-drive') {
      if (!row?.path) return []
      return [
        { key: 'open-local-drive', label: '打开' },
        { key: 'open-local-drive-explorer', label: '在资源管理器中打开' },
        { type: 'separator' },
        { key: 'refresh-local-roots', label: '刷新磁盘列表' },
        { key: 'copy-local-drive-path', label: '复制路径' },
        { type: 'separator' },
        { key: 'show-local-drive-properties', label: '属性' }
      ]
    }
    if (menuType === 'remote-panel') {
      return [
        { key: 'new-remote-file', label: '新建文件', enabled: true },
        { key: 'new-remote-folder', label: '新建文件夹', enabled: true },
        { key: 'paste-remote', label: '粘贴', enabled: true },
        { type: 'separator' },
        { key: 'refresh-remote', label: '刷新列表' }
      ]
    }
    if (menuType === 'remote-shortcut') {
      if (!row?.path) return []
      const isRootShortcut = row.path === '/'
      return [
        { key: 'open-remote-shortcut', label: '打开目录' },
        { key: 'rename-remote-shortcut', label: '重命名快捷访问', enabled: !isRootShortcut },
        { key: 'remove-remote-shortcut', label: '移除快捷访问', enabled: !isRootShortcut }
      ]
    }
    if (menuType !== 'remote') return null
    if (!row || row.isParent) return null
    const remoteCount = getRemoteActionItems(row).length
    const localCount = selectedLocals.value.filter(item => !item.isParent).length
    const isDirectory = row.type === 'd'
    const isArchive = !isDirectory && /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|tbz2|txz|tar\.gz|tar\.bz2|tar\.xz)$/i.test(row.name || row.path || '')
    return [
      { key: isDirectory ? 'open-remote' : 'default-open-remote', label: isDirectory ? '打开' : '默认打开' },
      { key: 'text-open-remote', label: '按文本打开', enabled: !isDirectory },
      { type: 'separator' },
      { key: 'download-remote-left', label: '下载至左侧目录', enabled: !!localPath.value && localPath.value !== '__pc__' },
      { key: 'download-remote', label: '下载至本地' },
      { key: 'add-remote-shortcut', label: '加入快捷访问', enabled: isDirectory },
      { type: 'separator' },
      { key: 'copy-remote', label: remoteCount > 1 ? `复制 ${remoteCount} 项` : '复制' },
      { key: 'cut-remote', label: remoteCount > 1 ? `剪切 ${remoteCount} 项` : '剪切' },
      { key: 'paste-remote', label: '粘贴', enabled: isDirectory },
      { key: 'new-remote-file', label: '在此处新建文件', enabled: isDirectory },
      { key: 'new-remote-folder', label: '在此处新建文件夹', enabled: isDirectory },
      { type: 'separator' },
      { key: 'compress-remote', label: '压缩为 zip' },
      { key: 'extract-remote-archive', label: '解压至同名文件夹', enabled: isArchive },
      { key: 'upload-selected-locals', label: localCount > 1 ? `上传本地选中 ${localCount} 项到此文件夹` : '上传本地选中项到此文件夹', enabled: isDirectory && !!localCount },
      { type: 'separator' },
      { key: 'rename-remote', label: '重命名' },
      { key: 'delete-remote', label: remoteCount > 1 ? `删除 ${remoteCount} 项` : '删除' },
      { type: 'separator' },
      { key: 'show-remote-properties', label: '属性' }
    ]
  }

  async function runFileContextAction(action, menuType, row) {
    if (menuType === 'local-panel') {
      if (action === 'new-local-file') return void await createLocalFile()
      if (action === 'new-local-folder') return void await createLocalFolder()
      if (action === 'paste-local') return void await pasteLocalSelection()
      if (action === 'refresh-local') {
        await loadLocalFiles(localPath.value)
        message.value = '本地文件列表已刷新'
        return
      }
      return true
    }
    if (menuType === 'local') {
      if (!row) return true
      if (action === 'open-local') return void (row.type === 'd' ? await openLocalFile(row) : null)
      if (action === 'rename-local') return void await renameLocalItem(row)
      if (action === 'delete-local') return void await deleteLocalItem(row)
      return true
    }
    if (menuType === 'local-drive') {
      if (!row?.path) return true
      if (action === 'open-local-drive') return void await openLocalFile({ ...row, type: 'd' })
      if (action === 'open-local-drive-explorer') return void await window.whSSH.openLocalInExplorer({ path: row.path })
      if (action === 'refresh-local-roots') {
        await loadLocalRoots()
        message.value = '本地磁盘列表已刷新'
        return
      }
      if (action === 'copy-local-drive-path') {
        try {
          await window.whSSH.writeClipboardText(row.path)
          if (message) message.value = `已复制路径：${row.path}`
        } catch (error) {
          if (typeof reportError === 'function') await reportError(error)
        }
        return true
      }
      if (action === 'show-local-drive-properties') {
        const hasBridge = typeof window.whSSH?.showLocalProperties === 'function'
        console.info('[local-drive-properties][renderer] request', { path: row.path, hasBridge })
        if (!hasBridge) {
          if (message) message.value = '属性功能需要完整重启应用后生效'
          return true
        }
        try {
          const result = await window.whSSH.showLocalProperties({ path: row.path })
          console.info('[local-drive-properties][renderer] result', { path: row.path, result })
          if (!result && message) message.value = '属性窗口打开失败，请查看主进程日志'
        } catch (error) {
          console.error('[local-drive-properties][renderer] failed', error)
          if (typeof reportError === 'function') await reportError(error)
        }
        return true
      }
      return true
    }
    if (menuType === 'remote-panel') {
      if (action === 'new-remote-file') return void await createRemoteFile()
      if (action === 'new-remote-folder') return void await makeDir()
      if (action === 'paste-remote') return void await pasteRemoteEntry(remotePath.value)
      if (action === 'refresh-remote') {
        await loadFiles()
        message.value = '服务器文件列表已刷新'
        return
      }
      return true
    }
    if (menuType === 'remote-shortcut') {
      if (!row) return true
      if (action === 'open-remote-shortcut') return void await openRemoteShortcut(row.path)
      if (action === 'rename-remote-shortcut') return void await renameRemoteShortcut(row)
      if (action === 'remove-remote-shortcut') return void await removeRemoteShortcut(row)
      return true
    }
    if (menuType !== 'remote') return false
    if (!row) return false
    if (action === 'open-remote') return void await withRemoteOpenCursor(() => row.type === 'd' ? openFile(row) : downloadSingleRemote(row))
    if (action === 'default-open-remote') {
      if (row.type === 'd') return void await withRemoteOpenCursor(() => openFile(row))
      if (isImageFile(row.name)) return void await withRemoteOpenCursor(() => openImagePreview(row, 'remote'))
      if (isPreviewableRemoteMediaFile(row.name)) return void await withRemoteOpenCursor(() => openRemoteMediaPreview(row))
      return void await withRemoteOpenCursor(() => openEditor(row))
    }
    if (action === 'text-open-remote') return void await withRemoteOpenCursor(() => openEditor(row))
    if (action === 'extract-remote-archive') return void await extractRemoteArchive(row)
    if (action === 'add-remote-shortcut') return void await addRemoteShortcut(row.path, row.name)
    if (action === 'upload-selected-locals') return void await uploadSelectedLocalTo(getRemotePasteTarget(row))
    if (action === 'copy-remote') return void copyRemoteEntry(row, 'copy')
    if (action === 'cut-remote') return void copyRemoteEntry(row, 'cut')
    if (action === 'paste-remote') return void await pasteRemoteEntry(getRemotePasteTarget(row))
    if (action === 'new-remote-file') return void await createRemoteFile(getRemotePasteTarget(row))
    if (action === 'new-remote-folder') return void await makeDir(getRemotePasteTarget(row))
    if (action === 'download-remote') {
      selectedRemote.value = row
      return void await downloadSelectedRemote()
    }
    if (action === 'download-remote-left') {
      selectedRemote.value = row
      return void await downloadSelectedRemote('left')
    }
    if (action === 'rename-remote') return void await renameFile(row)
    if (action === 'delete-remote') return void await (getRemoteActionItems(row).length > 1 ? deleteSelectedRemotes() : deleteFile(row))
    if (action === 'compress-remote') return void await compressRemote(row)
    if (action === 'show-remote-properties') return void await showRemoteProperties(row)
    return false
  }

  return {
    getFileContextActions,
    runFileContextAction
  }
}
