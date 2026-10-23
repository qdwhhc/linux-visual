import { ElMessage, ElMessageBox } from 'element-plus'

export function useFilesActionManager(options) {
  const {
    sessionId,
    localPath,
    remotePath,
    selectedLocal,
    selectedLocals,
    selectedRemote,
    selectedRemotes,
    message,
    reportError,
    loadFiles,
    loadLocalFiles,
    ensureSshFeature,
    ensureRemoteWritable,
    formatRights,
    getLocalActionItems,
    getRemoteActionItems,
    getRemoteParentPath,
    joinLocalPath,
    joinRemotePath
  } = options

  async function createLocalFile(targetDir = localPath.value) {
    if (!targetDir || targetDir === '__pc__') {
      return reportError(new Error('请选择一个本地目录后再新建文件'))
    }
    try {
      const result = await ElMessageBox.prompt('请输入新文件名称', '新建文件', {
        inputValue: 'new-file.txt',
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请输入文件名'
      })
      const fileName = result.value.trim()
      if (!fileName) return
      const targetPath = joinLocalPath(targetDir, fileName)
      await window.whSSH.createLocalFile({ path: targetPath })
      await loadLocalFiles(targetDir)
      message.value = '已新建本地文件'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function createLocalFolder(targetDir = localPath.value) {
    if (targetDir === '__pc__') {
      return reportError(new Error('请选择一个本地目录后再新建文件夹'))
    }
    try {
      const result = await ElMessageBox.prompt('请输入新目录名称', '新建文件夹', {
        inputValue: '新建文件夹',
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请输入目录名称'
      })
      const folderName = result.value.trim()
      if (!folderName) return
      const targetPath = joinLocalPath(targetDir, folderName)
      await window.whSSH.createLocalDirectory({ path: targetPath })
      await loadLocalFiles(targetDir)
      message.value = '已新建本地文件夹'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function deleteLocalItem(file) {
    const refreshPath = localPath.value
    try {
      await ElMessageBox.confirm(`确认删除 ${file.path}？${file.type === 'd' ? ' 目录会递归删除。' : ''}`, '确认删除', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      await window.whSSH.deleteLocalPath({ path: file.path })
      await loadLocalFiles(refreshPath)
      message.value = file.type === 'd' ? '本地文件夹已删除' : '本地文件已删除'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function deleteSelectedLocals() {
    const items = selectedLocals.value.filter(item => !item.isParent)
    if (!items.length) return
    const refreshPath = localPath.value
    try {
      await ElMessageBox.confirm(`确认删除选中的 ${items.length} 个项目？此操作不可撤销。`, '确认删除', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      for (const item of items) {
        await window.whSSH.deleteLocalPath({ path: item.path })
      }
      await loadLocalFiles(refreshPath)
      message.value = `已删除 ${items.length} 个本地项目`
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function renameLocalItem(file) {
    try {
      const result = await ElMessageBox.prompt('请输入新名称', '重命名', {
        inputValue: file.name,
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请输入名称'
      })
      const newName = result.value.trim()
      if (!newName || newName === file.name) return
      const parent = file.path.replace(/[\\/][^\\/]+$/, '')
      const newPath = joinLocalPath(parent, newName)
      await window.whSSH.renameLocalPath({ oldPath: file.path, newPath })
      await loadLocalFiles(parent)
      message.value = '本地项目已重命名'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function uploadSelectedLocal() {
    const items = getLocalActionItems(selectedLocal.value)
    if (!items.length) return
    try {
      if (!await ensureRemoteWritable(remotePath.value || '/', '上传')) return
      for (const item of items) {
        await window.whSSH.uploadLocalFile({ sessionId: sessionId.value, localPath: item.path, remoteDir: remotePath.value || '/' })
      }
      await loadFiles()
      message.value = items.length > 1
        ? `已上传 ${items.length} 个本地项目到服务器`
        : (items[0].type === 'd' ? '目录已上传到服务器' : '文件已上传到服务器')
    } catch (error) {
      await reportError(error)
    }
  }

  async function uploadSelectedLocals() {
    const items = selectedLocals.value.filter(item => !item.isParent)
    if (!items.length) return
    try {
      if (!await ensureRemoteWritable(remotePath.value || '/', '上传')) return
      for (const item of items) {
        await window.whSSH.uploadLocalFile({ sessionId: sessionId.value, localPath: item.path, remoteDir: remotePath.value || '/' })
      }
      await loadFiles()
      message.value = `已批量上传 ${items.length} 个项目到服务器`
    } catch (error) {
      await reportError(error)
    }
  }

  async function resolveDownloadDirectory(target = 'choose') {
    const currentPath = String(localPath.value || '').trim()
    if (target === 'left') {
      if (currentPath && currentPath !== '__pc__') return currentPath
      await reportError(new Error('请先在左侧本地文件栏打开一个具体目录。'))
      return ''
    }
    const result = await window.whSSH.chooseLocalDir()
    if (result?.canceled || !result?.path) return ''
    localPath.value = result.path
    return result.path
  }

  async function downloadSelectedRemote(target = 'choose') {
    const items = getRemoteActionItems(selectedRemote.value)
    if (!items.length) return
    try {
      const destination = await resolveDownloadDirectory(target)
      if (!destination) return
      ElMessage.info(`正在下载 ${items.length} 个项目到 ${destination}`)
      for (const item of items) {
        await window.whSSH.downloadRemoteFile({ sessionId: sessionId.value, remotePath: item.path, localDir: destination, type: item.type })
      }
      await loadLocalFiles(destination)
      message.value = items.length > 1 ? `已下载 ${items.length} 个项目到本地目录` : '文件已下载到本地目录'
    } catch (error) {
      await reportError(error)
    }
  }

  async function downloadSingleRemote(file, target = 'choose') {
    if (!file || file.isParent) return
    try {
      const destination = await resolveDownloadDirectory(target)
      if (!destination) return
      ElMessage.info(`正在下载 ${file.name || '服务器文件'} 到 ${destination}`)
      await window.whSSH.downloadRemoteFile({ sessionId: sessionId.value, remotePath: file.path, localDir: destination, type: file.type })
      await loadLocalFiles(destination)
      message.value = file.type === 'd' ? '目录已下载到本地目录' : '文件已下载到本地目录'
    } catch (error) {
      await reportError(error)
    }
  }

  async function downloadSelectedRemotes() {
    const items = selectedRemotes.value.filter(item => !item.isParent)
    if (!items.length) return
    try {
      const destination = await resolveDownloadDirectory()
      if (!destination) return
      ElMessage.info(`正在下载 ${items.length} 个项目到 ${destination}`)
      for (const item of items) {
        await window.whSSH.downloadRemoteFile({ sessionId: sessionId.value, remotePath: item.path, localDir: destination, type: item.type })
      }
      await loadLocalFiles(destination)
      message.value = `已批量下载 ${items.length} 个项目到本地目录`
    } catch (error) {
      await reportError(error)
    }
  }

  async function deleteSelectedRemotes() {
    const items = selectedRemotes.value.filter(item => !item.isParent)
    if (!items.length) return
    const refreshPath = remotePath.value || '/'
    try {
      const parentPaths = [...new Set(items.map(item => getRemoteParentPath(item.path)))]
      for (const parentPath of parentPaths) {
        if (!await ensureRemoteWritable(parentPath, '删除')) return
      }
      await ElMessageBox.confirm(`确认删除选中的 ${items.length} 个项目？此操作不可撤销。`, '确认删除', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      const results = []
      for (const item of items) {
        results.push(await window.whSSH.deleteFile({ sessionId: sessionId.value, path: item.path, type: item.type }))
      }
      await loadFiles(refreshPath)
      const deletedCount = results.filter(item => item?.deleted).length
      const missingCount = results.filter(item => item?.alreadyMissing).length
      message.value = missingCount
        ? `已删除 ${deletedCount} 个项目；${missingCount} 个项目已不存在，目录已刷新`
        : `已删除 ${deletedCount} 个项目`
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function makeDir(targetDir = remotePath.value || '/') {
    try {
      if (!await ensureRemoteWritable(targetDir, '新建文件夹')) return
      const result = await ElMessageBox.prompt('请输入新目录名称', '新建文件夹', {
        inputValue: '新建文件夹',
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请输入目录名称'
      })
      const name = result.value.trim()
      if (!name) return
      const targetPath = joinRemotePath(targetDir, name)
      await window.whSSH.makeDir({ sessionId: sessionId.value, path: targetPath })
      await loadFiles()
      message.value = '服务器文件夹已新建'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function createRemoteFile(targetDir = remotePath.value || '/') {
    try {
      if (!await ensureRemoteWritable(targetDir, '新建文件')) return
      const result = await ElMessageBox.prompt('请输入新文件名称', '新建文件', {
        inputValue: 'new-file.txt',
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请输入文件名'
      })
      const name = result.value.trim()
      if (!name) return
      const targetPath = joinRemotePath(targetDir, name)
      await window.whSSH.writeTextFile({ sessionId: sessionId.value, path: targetPath, content: '' })
      await loadFiles()
      message.value = '服务器文件已新建'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function uploadSelectedLocalTo(targetDir = remotePath.value || '/') {
    const items = getLocalActionItems(selectedLocal.value)
    if (!items.length) return
    try {
      if (!await ensureRemoteWritable(targetDir, '上传')) return
      for (const item of items) {
        await window.whSSH.uploadLocalFile({ sessionId: sessionId.value, localPath: item.path, remoteDir: targetDir })
      }
      await loadFiles()
      message.value = items.length > 1
        ? `已上传 ${items.length} 个本地项目到目标目录`
        : (items[0].type === 'd' ? '目录已上传到目标目录' : '文件已上传到目标目录')
    } catch (error) {
      await reportError(error)
    }
  }

  async function deleteFile(file) {
    const refreshPath = remotePath.value || '/'
    try {
      const parent = getRemoteParentPath(file.path)
      if (!await ensureRemoteWritable(parent, '删除')) return
      await ElMessageBox.confirm(`确认删除 ${file.path}？${file.type === 'd' ? ' 目录会递归删除。' : ''}`, '确认删除', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      const result = await window.whSSH.deleteFile({ sessionId: sessionId.value, path: file.path, type: file.type })
      await loadFiles(refreshPath)
      message.value = result?.alreadyMissing ? '目标已不存在，目录已刷新' : '已删除'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function renameFile(file) {
    try {
      const parent = getRemoteParentPath(file.path)
      if (!await ensureRemoteWritable(parent, '重命名')) return
      const result = await ElMessageBox.prompt('请输入新名称', '重命名', {
        inputValue: file.name,
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请输入名称'
      })
      const name = result.value.trim()
      if (!name || name === file.name) return
      const newPath = joinRemotePath(parent, name)
      await window.whSSH.renameFile({ sessionId: sessionId.value, oldPath: file.path, newPath })
      await loadFiles()
      message.value = '服务器项目已重命名'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  function escapeShellSingleQuotedValue(value) {
    return `'${String(value || '').replace(/'/g, `'"'"'`)}'`
  }

  function getRemoteArchiveExtractName(filePath = '') {
    const name = String(filePath || '').split('/').filter(Boolean).pop() || ''
    return name
      .replace(/\.tar\.(gz|bz2|xz)$/i, '')
      .replace(/\.(tgz|tbz2|txz)$/i, '')
      .replace(/\.(zip|rar|7z|tar|gz|bz2|xz)$/i, '')
      || 'archive'
  }

  function buildRemoteArchiveExtractCommand(archivePath, targetDir) {
    const lowerName = String(archivePath || '').toLowerCase()
    const archiveArg = escapeShellSingleQuotedValue(archivePath)
    const targetArg = escapeShellSingleQuotedValue(targetDir)
    const mkdir = `mkdir -p ${targetArg}`
    if (/\.zip$/i.test(lowerName)) {
      return `${mkdir} && (unzip -oq ${archiveArg} -d ${targetArg} || 7z x -y -o${targetArg} ${archiveArg})`
    }
    if (/\.(tar\.gz|tgz)$/i.test(lowerName)) return `${mkdir} && tar -xzf ${archiveArg} -C ${targetArg}`
    if (/\.(tar\.bz2|tbz2)$/i.test(lowerName)) return `${mkdir} && tar -xjf ${archiveArg} -C ${targetArg}`
    if (/\.(tar\.xz|txz)$/i.test(lowerName)) return `${mkdir} && tar -xJf ${archiveArg} -C ${targetArg}`
    if (/\.tar$/i.test(lowerName)) return `${mkdir} && tar -xf ${archiveArg} -C ${targetArg}`
    if (/\.gz$/i.test(lowerName)) return `${mkdir} && gzip -cd ${archiveArg} > ${escapeShellSingleQuotedValue(joinRemotePath(targetDir, getRemoteArchiveExtractName(archivePath)))}`
    if (/\.bz2$/i.test(lowerName)) return `${mkdir} && bzip2 -cd ${archiveArg} > ${escapeShellSingleQuotedValue(joinRemotePath(targetDir, getRemoteArchiveExtractName(archivePath)))}`
    if (/\.xz$/i.test(lowerName)) return `${mkdir} && xz -cd ${archiveArg} > ${escapeShellSingleQuotedValue(joinRemotePath(targetDir, getRemoteArchiveExtractName(archivePath)))}`
    if (/\.rar$/i.test(lowerName)) return `${mkdir} && (unrar x -o+ ${archiveArg} ${targetArg}/ || 7z x -y -o${targetArg} ${archiveArg})`
    if (/\.7z$/i.test(lowerName)) return `${mkdir} && 7z x -y -o${targetArg} ${archiveArg}`
    throw new Error('当前压缩包格式暂不支持自动解压')
  }

  async function extractRemoteArchive(file) {
    if (!file?.path || file.isParent || file.type === 'd') return
    if (!ensureSshFeature('解压压缩包')) return
    const parent = getRemoteParentPath(file.path)
    const targetDir = joinRemotePath(parent, getRemoteArchiveExtractName(file.path))
    try {
      if (!await ensureRemoteWritable(parent, '解压压缩包')) return
      message.value = `正在解压到 ${targetDir}...`
      const result = await window.whSSH.runRemoteCommand({
        sessionId: sessionId.value,
        command: buildRemoteArchiveExtractCommand(file.path, targetDir),
        cwd: parent
      })
      if (result.code) throw new Error((result.stderr || result.stdout || '解压失败').trim())
      await loadFiles(parent)
      message.value = `已解压到 ${targetDir}`
    } catch (error) {
      await reportError(error)
    }
  }

  async function compressRemote(file) {
    if (!file?.path || file.isParent) return
    if (!ensureSshFeature('压缩')) return
    const parent = getRemoteParentPath(file.path)
    const baseName = String(file.path).split('/').filter(Boolean).pop() || 'archive'
    const archiveName = `${baseName}.zip`
    async function isZipInstalled() {
      const check = await window.whSSH.runRemoteCommand({
        sessionId: sessionId.value,
        command: 'command -v zip >/dev/null 2>&1 && printf ok || printf missing',
        cwd: '/'
      })
      return !check.code && /ok/.test(String(check.stdout || ''))
    }
    function buildInstallZipCommand() {
      return "if command -v apt-get >/dev/null 2>&1; then DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y zip; elif command -v dnf >/dev/null 2>&1; then dnf install -y zip; elif command -v yum >/dev/null 2>&1; then yum install -y zip; else echo unknown; fi"
    }
    try {
      if (!await ensureRemoteWritable(parent, '压缩')) return
      if (!await isZipInstalled()) {
        let proceed = false
        try {
          await ElMessageBox.confirm(
            '服务器未安装 zip 命令，无法生成 zip 压缩包。是否自动在服务器安装 zip？\n\n需要当前 SSH 账号具备 root 或管理员权限。',
            '未安装 zip',
            {
              confirmButtonText: '自动安装并压缩',
              cancelButtonText: '取消',
              type: 'warning',
              distinguishCancelAndClose: true
            }
          )
          proceed = true
        } catch (error) {
          proceed = false
        }
        if (!proceed) return
        message.value = '正在服务器安装 zip...'
        const installResult = await window.whSSH.runRemoteCommand({
          sessionId: sessionId.value,
          command: buildInstallZipCommand(),
          cwd: parent
        })
        if (installResult.code) {
          message.value = ''
          throw new Error(`zip 安装失败：${(installResult.stderr || installResult.stdout || '').trim()}`)
        }
        if (!await isZipInstalled()) {
          message.value = ''
          throw new Error('zip 安装完成后未能生效，请确认当前账号具备安装权限后重试。')
        }
        message.value = 'zip 安装成功'
      }
      message.value = `正在压缩 ${baseName} 为 ${archiveName}...`
      const command = [
        `cd ${escapeShellSingleQuotedValue(parent)}`,
        `zip -rq ${escapeShellSingleQuotedValue(archiveName)} ${escapeShellSingleQuotedValue(baseName)}`
      ].join(' && ')
      const result = await window.whSSH.runRemoteCommand({
        sessionId: sessionId.value,
        command,
        cwd: parent
      })
      if (result.code) throw new Error((result.stderr || result.stdout || '压缩失败').trim())
      await loadFiles(parent)
      message.value = `已压缩为 ${archiveName}`
    } catch (error) {
      await reportError(error)
    }
  }

  async function chmodFile(file) {
    if (!ensureSshFeature('chmod')) return
    const mode = window.prompt('请输入权限模式，例如 755 或 0644', formatRights(file.rights) || '644')
    if (!mode) return
    try {
      const result = await window.whSSH.chmodFile({ sessionId: sessionId.value, path: file.path, mode })
      message.value = result.stderr || result.stdout || '权限已修改'
      await loadFiles()
    } catch (error) {
      message.value = `chmod 失败：${error.message}`
    }
  }

  async function chownFile(file) {
    if (!ensureSshFeature('chown')) return
    const owner = window.prompt('请输入所有者，例如 root 或 www-data:www-data')
    if (!owner) return
    try {
      const result = await window.whSSH.chownFile({ sessionId: sessionId.value, path: file.path, owner })
      message.value = result.stderr || result.stdout || '所有者已修改'
      await loadFiles()
    } catch (error) {
      message.value = `chown 失败：${error.message}`
    }
  }

  return {
    createLocalFile,
    createLocalFolder,
    deleteLocalItem,
    deleteSelectedLocals,
    renameLocalItem,
    uploadSelectedLocal,
    uploadSelectedLocals,
    downloadSelectedRemote,
    downloadSingleRemote,
    downloadSelectedRemotes,
    deleteSelectedRemotes,
    makeDir,
    createRemoteFile,
    uploadSelectedLocalTo,
    extractRemoteArchive,
    compressRemote,
    deleteFile,
    renameFile,
    chmodFile,
    chownFile
  }
}
