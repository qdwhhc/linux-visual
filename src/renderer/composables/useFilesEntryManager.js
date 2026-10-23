export function useFilesEntryManager(options) {
  const {
    localPath,
    selectedLocal,
    remotePath,
    loadFiles,
    loadLocalFiles,
    getLocalParent,
    reportError,
    openImagePreview,
    openRemoteMediaPreview,
    openEditor,
    isImageFile,
    isPreviewableRemoteMediaFile
  } = options

  async function withRemoteOpenCursor(action) {
    document?.documentElement?.classList.add('remote-open-busy')
    try {
      return await action()
    } finally {
      document?.documentElement?.classList.remove('remote-open-busy')
    }
  }

  async function goParent() {
    const parts = remotePath.value.split('/').filter(Boolean)
    parts.pop()
    await loadFiles(parts.length ? `/${parts.join('/')}` : '/')
  }

  async function openFile(file) {
    if (file.isParent) {
      await goParent()
      return
    }
    if (!isRemoteDirectory(file)) return
    await loadFiles(getRemoteEntryPath(file))
  }

  function isRemoteDirectory(file) {
    const type = String(file?.type || '').toLowerCase()
    return type === 'd' || type === 'dir' || type === 'directory' || type === 'folder'
  }

  function getRemoteEntryPath(file) {
    const path = String(file?.path || '').trim()
    if (path && path !== '..') return path.startsWith('/') ? path.replace(/\/+/g, '/') : `/${path.replace(/^\/+/, '')}`
    const name = String(file?.name || '').trim()
    const base = String(remotePath.value || '/').replace(/\/+/g, '/').replace(/\/+$/g, '') || '/'
    if (!name || name === '...' || name === '..') return base
    return `${base === '/' ? '' : base}/${name}`.replace(/\/+/g, '/') || '/'
  }

  function goLocalParent() {
    if (!localPath.value) return
    const parent = getLocalParent(localPath.value)
    if (parent && parent !== localPath.value) loadLocalFiles(parent)
  }

  async function openRemoteFile(file) {
    if (file.isParent) {
      await withRemoteOpenCursor(() => goParent())
      return
    }
    if (isRemoteDirectory(file)) {
      await withRemoteOpenCursor(() => openFile(file))
      return
    }
    if (isImageFile(file.name)) {
      await withRemoteOpenCursor(() => openImagePreview(file, 'remote'))
      return
    }
    if (isPreviewableRemoteMediaFile(file.name)) {
      await withRemoteOpenCursor(() => openRemoteMediaPreview(file))
      return
    }
    await withRemoteOpenCursor(() => openEditor(file))
  }

  async function openLocalFile(file) {
    if (file.isParent) {
      goLocalParent()
      return
    }
    if (file.type === 'd') {
      await loadLocalFiles(file.path)
      return
    }
    if (isImageFile(file.name)) {
      await openImagePreview(file, 'local')
      return
    }
    try {
      await window.whSSH.openLocalPath({ path: file.path })
    } catch (error) {
      await reportError(error)
    }
  }

  async function openLocalInExplorer() {
    const target = selectedLocal.value && !selectedLocal.value.isParent
      ? selectedLocal.value.path
      : localPath.value
    const reveal = !!selectedLocal.value && !selectedLocal.value.isParent && selectedLocal.value.type !== 'd'
    try {
      await window.whSSH.openLocalInExplorer({ path: target || '__pc__', reveal })
    } catch (error) {
      await reportError(error)
    }
  }

  return {
    openFile,
    openRemoteFile,
    openLocalFile,
    openLocalInExplorer,
    goLocalParent,
    goParent
  }
}
