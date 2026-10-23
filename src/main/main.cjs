const { app, BrowserWindow, ipcMain, dialog, safeStorage, Menu, shell, clipboard, protocol, nativeImage, screen } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const http = require('http')
const https = require('https')
const { exec, execFile, execFileSync, spawn } = require('child_process')
const { Readable } = require('stream')
const net = require('net')
const { Client } = require('ssh2')
const SftpClient = require('ssh2-sftp-client')
const { FileType } = require('basic-ftp')
const mysql = require('mysql2/promise')
const iconv = require('iconv-lite')
const initSqlJs = require('sql.js')
const { PRODUCT_CODE, createPurchaseUrl, verifyActivationCode } = require('./offline-license.cjs')

const isDev = Boolean(String(process.env.APP_DEV_URL || '').trim()) || !app.isPackaged
const sessions = new Map()
const databaseSessions = new Map()
const tailStreams = new Map()
const terminalChannels = new Map()
let localClipboard = null
const browserDevToolsWindows = new Map()
const MAX_PREVIEW_IMAGE_SIZE = 20 * 1024 * 1024
const TERMINAL_SHELL_SYNC_WINDOW_MS = 2500
const APPLICATION_LOG_MAX_BYTES = 5 * 1024 * 1024
const APPLICATION_LOG_MAX_ENTRIES = 1000
const APPLICATION_LOG_DEDUPE_WINDOW_MS = 30 * 1000
const APPLICATION_LOG_RATE_WINDOW_MS = 10 * 1000
const APPLICATION_LOG_RATE_LIMIT = 40
const applicationLogFingerprints = new Map()
const applicationLogWriteTimestamps = []

const SERVICE_COMMANDS = {
  nginx: 'nginx',
  mysql: 'mysql',
  mysqld: 'mysqld',
  redis: 'redis',
  docker: 'docker',
  pm2: 'pm2-root'
}
const MAX_PREVIEW_MEDIA_SIZE = 200 * 1024 * 1024
const OBJECT_STORAGE_MULTIPART_THRESHOLD = 32 * 1024 * 1024
const OBJECT_STORAGE_MULTIPART_PART_SIZE = 8 * 1024 * 1024
const OBJECT_STORAGE_PROGRESS_INTERVAL_MS = 100
const DATABASE_SQL_MAX_ROWS = 1000
const previewTempFiles = new Set()
const previewMediaRegistry = new Map()
const objectStorageDragTempTimers = new Map()
let legacyUserDataMigrated = false
let appDatabasePromise = null
const USER_DATA_CONFIG_FILES = [
  'connections.json',
  'db-connections.json',
  'nginx-ssl-certificates.json',
  'object-storage-connections.json'
]
const DEFAULT_USER_ID = 'local'
const DEFAULT_WORKSPACE_ID = 'default'
const APP_DEVICE_ID_STORAGE_KEY = 'linux-visual:app-device-id'
const APP_LAST_USER_STORAGE_KEY = 'linux-visual:last-app-user'
const OFFLINE_ACTIVATION_STORAGE_KEY = 'linux-visual:offline-activation'
const PROTECTED_APP_STORAGE_KEYS = new Set([APP_DEVICE_ID_STORAGE_KEY, OFFLINE_ACTIVATION_STORAGE_KEY])
const STRUCTURED_APP_DATA_MIGRATION_KEY = 'linux-visual:structured-app-data-migrated-v1'
const NGINX_SYSTEM_SETTINGS_STORAGE_KEY = 'linux-visual:nginx-system-settings'
const SOURCE_HISTORY_STORAGE_KEY = 'linux-visual:nginx-source-history'
const NGINX_SSL_CERTIFICATES_STORAGE_KEY = 'linux-visual:nginx-ssl-certificates'
let currentAppUserContext = {
  userId: DEFAULT_USER_ID,
  workspaceId: DEFAULT_WORKSPACE_ID,
  identifier: ''
}

const WINDOWS_SHOW_PROPERTIES_SCRIPT = [
  'Dim shell, fso, wsh, target, parent, leaf, folder, item, driveName, logFile, candidate',
  'Set shell = CreateObject("Shell.Application")',
  'Set fso = CreateObject("Scripting.FileSystemObject")',
  'Set wsh = CreateObject("WScript.Shell")',
  'logFile = wsh.ExpandEnvironmentStrings("%TEMP%") & "\\linux-visual-show-properties.log"',
  'Sub LogLine(text)',
  '  On Error Resume Next',
  '  Dim ts',
  '  Set ts = fso.OpenTextFile(logFile, 8, True, -1)',
  '  ts.WriteLine CStr(Now) & " " & text',
  '  ts.Close',
  'End Sub',
  'Function NormalizeVerbName(value)',
  '  NormalizeVerbName = LCase(Replace(Replace(Replace(CStr(value), "&", ""), "(", ""), ")", ""))',
  'End Function',
  'Function TryInvokeProperties(shellItem)',
  '  On Error Resume Next',
  '  TryInvokeProperties = False',
  '  If shellItem Is Nothing Then',
  '    LogLine "TryInvokeProperties: item is nothing"',
  '    Exit Function',
  '  End If',
  '  Dim verb, verbName, normalizedName',
  '  LogLine "TryInvokeProperties: item name=" & shellItem.Name & " path=" & shellItem.Path',
  '  For Each verb In shellItem.Verbs',
  '    verbName = verb.Name',
  '    normalizedName = NormalizeVerbName(verbName)',
  '    LogLine "verb=" & verbName',
  '    If InStr(normalizedName, "properties") > 0 Or InStr(normalizedName, "属性") > 0 Then',
  '      Err.Clear',
  '      verb.DoIt',
  '      LogLine "verb.DoIt err=" & Err.Number & " desc=" & Err.Description',
  '      If Err.Number = 0 Then',
  '        WScript.Sleep 1500',
  '        Err.Clear',
  '        wsh.AppActivate shellItem.Name',
  '        LogLine "AppActivate err=" & Err.Number & " desc=" & Err.Description',
  '        TryInvokeProperties = True',
  '        Exit Function',
  '      End If',
  '    End If',
  '  Next',
  '  Err.Clear',
  '  shellItem.InvokeVerb("properties")',
  '  LogLine "InvokeVerb properties err=" & Err.Number & " desc=" & Err.Description',
  '  If Err.Number = 0 Then',
  '    WScript.Sleep 1500',
  '    Err.Clear',
  '    wsh.AppActivate shellItem.Name',
  '    LogLine "InvokeVerb AppActivate err=" & Err.Number & " desc=" & Err.Description',
  '    TryInvokeProperties = True',
  '  End If',
  'End Function',
  'target = WScript.Arguments.Item(0)',
  'On Error Resume Next',
  'LogLine "start target=" & target',
  'If Len(target) >= 2 And Mid(target, 2, 1) = ":" And (Len(target) = 2 Or target = Left(target, 2) & "\\") Then',
  '  driveName = UCase(Left(target, 2))',
  '  Set folder = shell.NameSpace(17)',
  '  LogLine "drive mode driveName=" & driveName & " folderExists=" & CStr(Not folder Is Nothing)',
  '  If Not folder Is Nothing Then',
  '    For Each candidate In folder.Items',
  '      LogLine "drive candidate name=" & candidate.Name & " path=" & candidate.Path',
  '      If UCase(Left(candidate.Path, 2)) = driveName Then',
  '        Set item = candidate',
  '        Exit For',
  '      End If',
  '    Next',
  '    If item Is Nothing Then Set item = folder.ParseName(driveName)',
  '    If item Is Nothing Then Set item = folder.ParseName(driveName & "\\")',
  '    If TryInvokeProperties(item) Then WScript.Quit 0',
  '  End If',
  '  LogLine "drive mode failed"',
  '  WScript.Quit 1',
  'End If',
  'shell.ShellExecute target, "", "", "properties", 1',
  'LogLine "ShellExecute err=" & Err.Number & " desc=" & Err.Description',
  'If Err.Number = 0 Then WScript.Quit 0',
  'Err.Clear',
  'On Error GoTo 0',
  'parent = fso.GetParentFolderName(target)',
  'leaf = fso.GetFileName(target)',
  'Set folder = shell.NameSpace(parent)',
  'If folder Is Nothing Then WScript.Quit 1',
  'Set item = folder.ParseName(leaf)',
  'If item Is Nothing Then WScript.Quit 1',
  'If TryInvokeProperties(item) Then WScript.Quit 0',
  'WScript.Quit 1'
].join('\r\n')

function logRemotePerf(stage, payload = {}) {
  console.info(`[remote-perf][main] ${stage}`, payload)
}

function safeWebContentsSend(sender, channel, payload) {
  if (!sender || typeof sender.send !== 'function' || sender.isDestroyed?.()) return false
  try {
    sender.send(channel, payload)
    return true
  } catch (error) {
    if (/destroyed/i.test(String(error?.message || ''))) return false
    throw error
  }
}

function normalizeTextEncoding(value = 'utf8') {
  const normalized = String(value || 'utf8').trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (!normalized) return 'utf8'
  if (normalized === 'utf-8' || normalized === 'utf8') return 'utf8'
  if (normalized === 'utf-8-bom' || normalized === 'utf8-bom') return 'utf8-bom'
  if (normalized === 'utf-16le' || normalized === 'utf16le') return 'utf16le'
  if (normalized === 'gbk' || normalized === 'cp936') return 'gbk'
  if (normalized === 'gb2312') return 'gb2312'
  if (normalized === 'gb18030') return 'gb18030'
  if (normalized === 'big5') return 'big5'
  if (normalized === 'shift-jis' || normalized === 'shift_jis' || normalized === 'sjis' || normalized === 'cp932') return 'shift_jis'
  if (normalized === 'latin1' || normalized === 'latin-1' || normalized === 'ansi') return 'latin1'
  return iconv.encodingExists(normalized) ? normalized : 'utf8'
}

function stripTextBom(content) {
  return typeof content === 'string' && content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
}

function decodeRemoteText(buffer, encoding) {
  const targetEncoding = normalizeTextEncoding(encoding)
  if (!Buffer.isBuffer(buffer)) return ''
  if (targetEncoding === 'utf8-bom') {
    const hasBom = buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
    return stripTextBom(iconv.decode(hasBom ? buffer.slice(3) : buffer, 'utf8'))
  }
  return stripTextBom(iconv.decode(buffer, targetEncoding))
}

function encodeRemoteText(content, encoding) {
  const targetEncoding = normalizeTextEncoding(encoding)
  const text = String(content || '')
  if (targetEncoding === 'utf8-bom') {
    return Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), iconv.encode(text, 'utf8')])
  }
  return iconv.encode(text, targetEncoding)
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'whssh-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
])

if (process.platform === 'win32') {
  app.setAppUserModelId('com.linuxvisual.app')
}

function createWindow() {
  Menu.setApplicationMenu(null)
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1800, Math.max(1280, Math.floor(workArea.width * 0.78)))
  const height = Math.min(1100, Math.max(820, Math.floor(workArea.height * 0.8)))
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1080,
    minHeight: 680,
    frame: false,
    title: 'linux-visual',
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    backgroundColor: '#101419',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })
  bindWindowStateEvents(win)
  bindBrowserWebviewEvents(win)
  win.webContents.on('render-process-gone', (event, details) => {
    if (details?.reason === 'clean-exit' || details?.reason === 'killed') return
    appendApplicationLog({
      level: 'error',
      source: 'renderer-process',
      message: `应用渲染进程异常退出：${details?.reason || 'unknown'}`,
      details
    }, { priority: true })
  })
  win.webContents.on('unresponsive', () => {
    appendApplicationLog({ level: 'warning', source: 'renderer-process', message: '应用界面暂时无响应' }, { priority: true })
  })

  if (isDev) {
    win.loadURL(process.env.APP_DEV_URL || 'http://127.0.0.1:35040')
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }

  if (isDev && process.env.LINUX_VISUAL_OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' })
  }
}

function bindBrowserWebviewEvents(win) {
  win.webContents.on('did-attach-webview', (event, guestContents) => {
    guestContents.on('context-menu', (contextEvent, params) => {
      contextEvent.preventDefault()
      showBrowserWebviewContextMenu(win, guestContents, params)
    })
    guestContents.on('render-process-gone', (innerEvent, details) => {
      if (details?.reason === 'clean-exit' || details?.reason === 'killed') return
      appendApplicationLog({
        level: 'error',
        source: 'browser-webview',
        message: `浏览器页面进程异常退出：${details?.reason || 'unknown'}`,
        details: { ...details, url: guestContents.isDestroyed() ? '' : guestContents.getURL() }
      }, { priority: true })
    })
    guestContents.setWindowOpenHandler(details => {
      const targetUrl = String(details.url || '').trim()
      if (/^https?:\/\//i.test(targetUrl)) {
        safeWebContentsSend(win.webContents, 'browser:open-tab', { url: targetUrl })
      }
      return { action: 'deny' }
    })
  })
}

function inspectBrowserWebviewElement(win, guestContents, x, y) {
  if (!guestContents || guestContents.isDestroyed()) return
  const guestId = guestContents.id
  let devToolsWindow = browserDevToolsWindows.get(guestId)
  if (!devToolsWindow || devToolsWindow.isDestroyed()) {
    devToolsWindow = new BrowserWindow({
      width: 960,
      height: 720,
      minWidth: 640,
      minHeight: 480,
      title: '网页检查 - linux-visual',
      icon: path.join(__dirname, 'assets', 'app-icon.png'),
      autoHideMenuBar: true,
      backgroundColor: '#101419',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    browserDevToolsWindows.set(guestId, devToolsWindow)
    guestContents.setDevToolsWebContents(devToolsWindow.webContents)
    devToolsWindow.on('closed', () => {
      if (browserDevToolsWindows.get(guestId) === devToolsWindow) browserDevToolsWindows.delete(guestId)
      if (!guestContents.isDestroyed() && guestContents.isDevToolsOpened()) guestContents.closeDevTools()
    })
    guestContents.on('devtools-closed', () => {
      if (!devToolsWindow.isDestroyed()) devToolsWindow.close()
    })
    guestContents.once('destroyed', () => {
      if (!devToolsWindow.isDestroyed()) devToolsWindow.close()
    })
  }
  if (!guestContents.isDevToolsOpened()) guestContents.openDevTools({ mode: 'detach', activate: true })
  devToolsWindow.show()
  devToolsWindow.focus()
  guestContents.inspectElement(x, y)
}

function runBrowserGuestAction(guestContents, action, scope = 'context-menu') {
  if (!guestContents || guestContents.isDestroyed()) return
  try {
    const result = action()
    if (result?.catch) {
      result.catch(error => appendApplicationLog({
        level: 'error',
        source: 'browser-webview',
        message: error?.message || '浏览器右键操作失败',
        stack: error?.stack || '',
        details: { scope }
      }))
    }
  } catch (error) {
    appendApplicationLog({
      level: 'error',
      source: 'browser-webview',
      message: error?.message || '浏览器右键操作失败',
      stack: error?.stack || '',
      details: { scope }
    })
  }
}

async function saveBrowserWebviewPage(win, guestContents) {
  if (!guestContents || guestContents.isDestroyed()) return
  const fileName = String(guestContents.getTitle() || '网页')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .slice(0, 80) || '网页'
  const result = await dialog.showSaveDialog(win, {
    title: '保存网页',
    defaultPath: path.join(app.getPath('downloads'), `${fileName}.html`),
    filters: [{ name: '网页', extensions: ['html', 'htm'] }]
  })
  if (result.canceled || !result.filePath || guestContents.isDestroyed()) return
  await guestContents.savePage(result.filePath, 'HTMLComplete')
}

function downloadBrowserWebviewResource(guestContents, resourceUrl) {
  const targetSession = guestContents.session
  let cleanupTimer = null
  const cleanup = () => {
    if (cleanupTimer) clearTimeout(cleanupTimer)
    targetSession.removeListener('will-download', handleDownload)
  }
  const handleDownload = (event, item, sourceContents) => {
    if (sourceContents !== guestContents || item.getURL() !== resourceUrl) return
    cleanup()
    item.once('done', (doneEvent, state) => {
      if (state === 'completed' || state === 'cancelled') return
      appendApplicationLog({
        level: 'error',
        source: 'browser-webview',
        message: `图片保存失败：${state}`,
        details: { scope: 'save-image', url: resourceUrl }
      })
    })
  }
  targetSession.on('will-download', handleDownload)
  cleanupTimer = setTimeout(cleanup, 10000)
  guestContents.downloadURL(resourceUrl)
}

function showBrowserWebviewContextMenu(win, guestContents, params = {}) {
  if (!win || win.isDestroyed() || !guestContents || guestContents.isDestroyed()) return
  const template = []
  const editFlags = params.editFlags || {}
  const mediaFlags = params.mediaFlags || {}
  const linkUrl = String(params.linkURL || '').trim()
  const sourceUrl = String(params.srcURL || '').trim()
  const selectionText = String(params.selectionText || '').trim()
  const isWebUrl = value => /^https?:\/\//i.test(value)
  const addSeparator = () => {
    if (template.length && template[template.length - 1]?.type !== 'separator') template.push({ type: 'separator' })
  }
  const run = (scope, action) => () => runBrowserGuestAction(guestContents, action, scope)

  if (linkUrl) {
    if (isWebUrl(linkUrl)) {
      template.push({
        label: '在新标签页中打开链接',
        click: () => safeWebContentsSend(win.webContents, 'browser:open-tab', { url: linkUrl })
      })
    }
    template.push({ label: '复制链接地址', click: () => clipboard.writeText(linkUrl) })
  }

  if (params.mediaType === 'image' && sourceUrl) {
    if (template.length) addSeparator()
    if (isWebUrl(sourceUrl)) {
      template.push({
        label: '在新标签页中打开图片',
        click: () => safeWebContentsSend(win.webContents, 'browser:open-tab', { url: sourceUrl })
      })
    }
    if (mediaFlags.canSave !== false) template.push({ label: '保存图片', click: run('save-image', () => downloadBrowserWebviewResource(guestContents, sourceUrl)) })
    template.push({ label: '复制图片', click: run('copy-image', () => guestContents.copyImageAt(params.x, params.y)) })
    template.push({ label: '复制图片地址', click: () => clipboard.writeText(sourceUrl) })
  } else if (sourceUrl && params.mediaType && params.mediaType !== 'none') {
    if (template.length) addSeparator()
    template.push({ label: '复制媒体地址', click: () => clipboard.writeText(sourceUrl) })
  }

  if (params.isEditable) {
    if (template.length) addSeparator()
    const suggestions = Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions.slice(0, 5) : []
    suggestions.forEach(suggestion => {
      template.push({ label: suggestion, click: run('replace-misspelling', () => guestContents.replaceMisspelling(suggestion)) })
    })
    if (suggestions.length) addSeparator()
    template.push(
      { label: '撤销', enabled: !!editFlags.canUndo, click: run('undo', () => guestContents.undo()) },
      { label: '重做', enabled: !!editFlags.canRedo, click: run('redo', () => guestContents.redo()) },
      { type: 'separator' },
      { label: '剪切', enabled: !!editFlags.canCut, click: run('cut', () => guestContents.cut()) },
      { label: '复制', enabled: !!editFlags.canCopy, click: run('copy', () => guestContents.copy()) },
      { label: '粘贴', enabled: !!editFlags.canPaste, click: run('paste', () => guestContents.paste()) },
      { label: '删除', enabled: !!editFlags.canDelete, click: run('delete', () => guestContents.delete()) },
      { type: 'separator' },
      { label: '全选', enabled: editFlags.canSelectAll !== false, click: run('select-all', () => guestContents.selectAll()) }
    )
  } else if (selectionText) {
    if (template.length) addSeparator()
    template.push({ label: '复制', enabled: editFlags.canCopy !== false, click: run('copy', () => guestContents.copy()) })
    template.push({
      label: `使用百度搜索“${selectionText.replace(/\s+/g, ' ').slice(0, 24)}${selectionText.length > 24 ? '...' : ''}”`,
      click: () => safeWebContentsSend(win.webContents, 'browser:open-tab', { url: `https://www.baidu.com/s?wd=${encodeURIComponent(selectionText)}` })
    })
  }

  addSeparator()
  template.push(
    { label: '后退', enabled: guestContents.canGoBack(), click: run('go-back', () => guestContents.goBack()) },
    { label: '前进', enabled: guestContents.canGoForward(), click: run('go-forward', () => guestContents.goForward()) },
    { label: '重新加载', click: run('reload', () => guestContents.reload()) },
    { type: 'separator' },
    { label: '网页另存为', click: run('save-page', () => saveBrowserWebviewPage(win, guestContents)) },
    {
      label: '打印',
      click: run('print', () => guestContents.print({ printBackground: true }, (success, failureReason) => {
        if (success) return
        appendApplicationLog({
          level: 'error',
          source: 'browser-webview',
          message: failureReason || '网页打印失败',
          details: { scope: 'print' }
        })
      }))
    },
    { type: 'separator' },
    { label: '检查', click: run('inspect-element', () => inspectBrowserWebviewElement(win, guestContents, params.x, params.y)) }
  )

  while (template[template.length - 1]?.type === 'separator') template.pop()
  const menu = Menu.buildFromTemplate(template)
  const popupOptions = { window: win }
  if (params.menuSourceType) popupOptions.sourceType = params.menuSourceType
  menu.popup(popupOptions)
}

function getWindowStatePayload(win) {
  return {
    maximized: !!win?.isMaximized?.(),
    minimized: !!win?.isMinimized?.()
  }
}

function bindWindowStateEvents(win) {
  const emitState = () => {
    if (win.isDestroyed()) return
    win.webContents.send('window:state-changed', getWindowStatePayload(win))
  }
  win.on('maximize', emitState)
  win.on('unmaximize', emitState)
  win.on('minimize', emitState)
  win.on('restore', emitState)
  win.on('enter-full-screen', emitState)
  win.on('leave-full-screen', emitState)
  win.webContents.on('did-finish-load', emitState)
}

function normalizeProtocol(protocol) {
  const value = String(protocol || 'ssh').toLowerCase()
  if (value === 'sftp' || value === 'ftp') return 'sftp'
  return 'ssh'
}

function buildConnectionOptions(config) {
  const authType = config.authType === 'privateKey' ? 'privateKey' : 'password'
  const host = String(config.host || '').trim()
  const username = String(config.username || '').trim()
  const port = Number(config.port || 22)
  if (!host || !username) throw new Error('SSH 连接缺少服务器地址或用户名')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH 连接端口无效')
  if (authType === 'password' && !String(config.password || '')) {
    throw new Error('密码认证未提供密码，可能是密码为空或保存的凭据无法解密，请重新填写密码')
  }
  if (authType === 'privateKey' && !String(config.privateKey || '').trim()) {
    throw new Error('私钥认证未提供私钥内容')
  }
  return {
    host,
    port,
    username,
    password: authType === 'password' ? (config.password || undefined) : undefined,
    privateKey: authType === 'privateKey' ? (config.privateKey || undefined) : undefined,
    passphrase: authType === 'privateKey' ? (config.passphrase || undefined) : undefined,
    readyTimeout: 15000,
    keepaliveInterval: 10000
  }
}

function formatSshConnectError(error, config) {
  const message = String(error?.message || error || '')
  if (!/all configured authentication methods failed/i.test(message)) return error

  const host = String(config?.host || '').trim()
  const port = Number(config?.port || 22)
  const username = String(config?.username || '').trim()
  const authType = config?.authType === 'privateKey' ? '私钥' : '密码'
  const caseHint = username !== username.toLowerCase()
    ? ' Linux 用户名区分大小写，请确认是否应填写小写账号（例如 root）。'
    : ''
  return new Error(`SSH 身份认证失败：${username}@${host}:${port} 的${authType}认证被服务器拒绝。请检查用户名、密码/私钥及服务器是否允许该认证方式。${caseHint}`)
}

function sanitizeConnection(item) {
  return {
    ...item,
    protocol: normalizeProtocol(item.protocol),
    authType: item.authType === 'privateKey' ? 'privateKey' : 'password',
    password: decryptSecret(item.encryptedPassword),
    privateKey: decryptSecret(item.encryptedPrivateKey),
    passphrase: decryptSecret(item.encryptedPassphrase),
    encryptedPassword: undefined,
    encryptedPrivateKey: undefined,
    encryptedPublicKey: undefined,
    encryptedPassphrase: undefined
  }
}

function getUserDataPath() {
  migrateLegacyUserData()
  return app.getPath('userData')
}

function areSameFileContent(firstFile, secondFile) {
  try {
    if (!fs.existsSync(firstFile) || !fs.existsSync(secondFile)) return false
    return fs.readFileSync(firstFile).equals(fs.readFileSync(secondFile))
  } catch (error) {
    return false
  }
}

function migrateLegacyUserData() {
  if (legacyUserDataMigrated) return
  legacyUserDataMigrated = true
  const userDataPath = app.getPath('userData')
  const legacyDirs = [
    path.join(path.dirname(process.execPath), 'data'),
    ...['wh-ssh', 'Linux可视化', 'WH_SSH'].map(name => path.join(app.getPath('appData'), name))
  ]
    .filter(dir => dir !== userDataPath)
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    const migratedFromLegacyDirs = new Set()
    for (const fileName of USER_DATA_CONFIG_FILES) {
      const targetFile = path.join(userDataPath, fileName)
      const sourceFile = legacyDirs.map(dir => path.join(dir, fileName)).find(file => fs.existsSync(file))
      if (!sourceFile) continue
      if (!fs.existsSync(targetFile)) fs.copyFileSync(sourceFile, targetFile)
      if (areSameFileContent(sourceFile, targetFile)) migratedFromLegacyDirs.add(path.dirname(sourceFile))
    }
    const installationDataDatabase = path.join(path.dirname(process.execPath), 'data', 'app-data.sqlite')
    const targetDatabase = getAppDatabaseFile()
    if (fs.existsSync(installationDataDatabase) && !fs.existsSync(targetDatabase)) fs.copyFileSync(installationDataDatabase, targetDatabase)
    for (const legacyDir of migratedFromLegacyDirs) {
      const sourceLocalState = path.join(legacyDir, 'Local State')
      const targetLocalState = path.join(userDataPath, 'Local State')
      if (fs.existsSync(sourceLocalState) && !areSameFileContent(sourceLocalState, targetLocalState)) {
        fs.copyFileSync(sourceLocalState, targetLocalState)
      }
    }
  } catch (error) {
    console.warn('[user-data] migrate legacy data failed', error)
  }
}

function cleanupStaleTempFiles() {
  const tempPath = app.getPath('temp')
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  try {
    for (const entry of fs.readdirSync(tempPath, { withFileTypes: true })) {
      if (!entry.name.startsWith('linux-visual-')) continue
      const target = path.join(tempPath, entry.name)
      if (fs.statSync(target).mtimeMs >= cutoff) continue
      fs.rmSync(target, { recursive: true, force: true })
    }
  } catch (error) {
    console.warn('[temp] stale file cleanup failed', error)
  }
}

function getConnectionsFile() {
  return path.join(getUserDataPath(), 'connections.json')
}

function getDatabaseConnectionsFile() {
  return path.join(getUserDataPath(), 'db-connections.json')
}

function getNginxSslCertificatesFile() {
  return path.join(getUserDataPath(), 'nginx-ssl-certificates.json')
}

function getObjectStorageConnectionsFile() {
  return path.join(getUserDataPath(), 'object-storage-connections.json')
}

function getAppDatabaseFile() {
  return path.join(getUserDataPath(), 'app-data.sqlite')
}

function getAppDatabaseSchemaFile() {
  return path.join(__dirname, 'schema', 'app-schema.sql')
}

function getApplicationLogDirectory() {
  const configuredDirectory = String(process.env.LINUX_VISUAL_LOG_DIR || '').trim()
  if (configuredDirectory) return path.resolve(configuredDirectory)
  const applicationDirectory = isDev ? app.getAppPath() : path.dirname(process.execPath)
  return path.join(applicationDirectory, 'runtime-logs')
}

function getApplicationLogFile() {
  return path.join(getApplicationLogDirectory(), 'application.log')
}

function getPreviousApplicationLogFile() {
  return path.join(getApplicationLogDirectory(), 'application.previous.log')
}

function migrateLegacyApplicationLogs() {
  try {
    const targetDirectory = getApplicationLogDirectory()
    fs.mkdirSync(targetDirectory, { recursive: true })
    const legacyDirectories = [
      path.join(app.getPath('userData'), 'logs'),
      path.join(path.dirname(process.execPath), 'runtime-logs')
    ]
    for (const legacyDirectory of new Set(legacyDirectories.map(item => path.resolve(item)))) {
      if (legacyDirectory === path.resolve(targetDirectory) || !fs.existsSync(legacyDirectory)) continue
      for (const fileName of ['application.previous.log', 'application.log']) {
        const sourceFile = path.join(legacyDirectory, fileName)
        if (!fs.existsSync(sourceFile)) continue
        const targetFile = path.join(targetDirectory, fileName)
        if (fs.existsSync(targetFile)) {
          const sourceText = fs.readFileSync(sourceFile, 'utf8').trimEnd()
          const targetText = fs.readFileSync(targetFile, 'utf8').trimStart()
          fs.writeFileSync(targetFile, [sourceText, targetText].filter(Boolean).join('\n') + '\n', 'utf8')
        } else {
          fs.copyFileSync(sourceFile, targetFile)
        }
        fs.unlinkSync(sourceFile)
      }
      if (!fs.readdirSync(legacyDirectory).length) fs.rmdirSync(legacyDirectory)
    }
  } catch (error) {
    console.warn('[application-log] migrate legacy logs failed', error)
  }
}

function redactApplicationLogText(value, maxLength = 12000) {
  const text = String(value ?? '')
    .replace(/LV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[ACTIVATION_CODE]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[PRIVATE_KEY]')
    .replace(/(\bproxy_set_header\s+(?:proxy-)?authorization\s+)(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\r\n;]+)(;?)/gi, '$1[REDACTED]$2')
    .replace(/((?:proxy-)?authorization\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/((?:set-)?cookie\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/(["']?(?:password|passwd|passphrase|token|secret|private.?key|activation.?code|api.?key|access.?key|session.?id|credential|auth)["']?\s*[=:]\s*)(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s,;}\]]+)/gi, '$1[REDACTED]')
    .replace(/((?:--)?(?:password|passwd|passphrase|token|secret|api.?key|access.?key|session.?id|credential|auth)\s+)(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\S+)/gi, '$1[REDACTED]')
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[内容已截断]` : text
}

function sanitizeApplicationLogDetails(value, depth = 0, state = { count: 0, seen: new WeakSet() }) {
  if (value === undefined || value === null) return value
  if (typeof value === 'string') return redactApplicationLogText(value, 4000)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value !== 'object') return redactApplicationLogText(value, 1000)
  if (value instanceof Error) {
    return {
      name: redactApplicationLogText(value.name, 160),
      message: redactApplicationLogText(value.message, 4000),
      stack: redactApplicationLogText(value.stack, 12000)
    }
  }
  if (depth >= 5 || state.count >= 500) return '[内容已截断]'
  if (state.seen.has(value)) return '[Circular]'
  state.seen.add(value)
  if (Array.isArray(value)) {
    const output = []
    for (let index = 0; index < value.length && index < 50 && state.count < 500; index += 1) {
      state.count += 1
      output.push(sanitizeApplicationLogDetails(value[index], depth + 1, state))
    }
    if (value.length > output.length) output.push(`[其余 ${value.length - output.length} 项已截断]`)
    return output
  }
  const output = {}
  let included = 0
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue
    if (included >= 50 || state.count >= 500) {
      output.__truncated__ = true
      break
    }
    included += 1
    state.count += 1
    if (/(password|passwd|passphrase|token|secret|private.?key|activation.?code|api.?key|access.?key|session.?id|authorization|cookie|credential|auth)/i.test(key)) {
      output[key] = '[REDACTED]'
      continue
    }
    try {
      output[key] = sanitizeApplicationLogDetails(value[key], depth + 1, state)
    } catch (error) {
      output[key] = '[无法读取]'
    }
  }
  return output
}

function stringifyApplicationLogDetails(value) {
  if (value === undefined || value === null || value === '') return ''
  try {
    return redactApplicationLogText(JSON.stringify(sanitizeApplicationLogDetails(value)))
  } catch (error) {
    return redactApplicationLogText(value)
  }
}

function shouldAppendApplicationLog(entry, options = {}) {
  const now = Date.now()
  const fingerprint = crypto.createHash('sha256')
    .update(`${entry.level}\n${entry.source}\n${entry.message}\n${entry.stack}\n${entry.details}`)
    .digest('hex')
  const previousTime = applicationLogFingerprints.get(fingerprint) || 0
  if (now - previousTime < APPLICATION_LOG_DEDUPE_WINDOW_MS) return { allowed: false, reason: 'duplicate' }
  for (const [key, timestamp] of applicationLogFingerprints) {
    if (now - timestamp >= APPLICATION_LOG_DEDUPE_WINDOW_MS) applicationLogFingerprints.delete(key)
  }
  while (applicationLogWriteTimestamps.length && now - applicationLogWriteTimestamps[0] >= APPLICATION_LOG_RATE_WINDOW_MS) {
    applicationLogWriteTimestamps.shift()
  }
  if (!options.priority && applicationLogWriteTimestamps.length >= APPLICATION_LOG_RATE_LIMIT) return { allowed: false, reason: 'rate-limit' }
  applicationLogFingerprints.set(fingerprint, now)
  if (!options.priority) applicationLogWriteTimestamps.push(now)
  return { allowed: true }
}

function rotateApplicationLogIfNeeded(file, incomingBytes) {
  const currentSize = fs.existsSync(file) ? fs.statSync(file).size : 0
  if (currentSize + incomingBytes <= APPLICATION_LOG_MAX_BYTES) return
  const previousFile = getPreviousApplicationLogFile()
  if (fs.existsSync(previousFile)) fs.unlinkSync(previousFile)
  if (fs.existsSync(file)) fs.renameSync(file, previousFile)
}

function appendApplicationLog(payload = {}, options = {}) {
  try {
    const file = getApplicationLogFile()
    const level = ['info', 'warning', 'error'].includes(payload.level) ? payload.level : 'error'
    const entry = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      level,
      source: redactApplicationLogText(payload.source || 'application', 160),
      message: redactApplicationLogText(payload.message || '未知错误', 4000),
      stack: redactApplicationLogText(payload.stack || '', 12000),
      details: stringifyApplicationLogDetails(payload.details)
    }
    const writeDecision = shouldAppendApplicationLog(entry, options)
    if (!writeDecision.allowed) return { ok: true, skipped: writeDecision.reason, file }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const line = `${JSON.stringify(entry)}\n`
    rotateApplicationLogIfNeeded(file, Buffer.byteLength(line))
    fs.appendFileSync(file, line, 'utf8')
    return { ok: true, file }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  }
}

function readApplicationLogs() {
  const file = getApplicationLogFile()
  const previousFile = getPreviousApplicationLogFile()
  const files = [previousFile, file].filter(target => fs.existsSync(target))
  let corruptEntries = 0
  const entries = files.flatMap(target => fs.readFileSync(target, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line)]
      } catch (error) {
        corruptEntries += 1
        return []
      }
    }))
    .slice(-APPLICATION_LOG_MAX_ENTRIES)
    .reverse()
  const size = files.reduce((total, target) => total + fs.statSync(target).size, 0)
  return { file, size, entries, corruptEntries }
}

function clearApplicationLogs() {
  const files = [getApplicationLogFile(), getPreviousApplicationLogFile()]
  for (const file of files) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
  return { ok: true, file: getApplicationLogFile() }
}

function deleteApplicationLogEntry(payload = {}) {
  const targetId = String(payload.id || '').trim()
  if (!targetId) return { ok: false, error: '缺少日志记录标识' }
  const files = [getApplicationLogFile(), getPreviousApplicationLogFile()]
  let deleted = 0
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    const nextLines = []
    for (const line of lines) {
      if (!line) continue
      try {
        const entry = JSON.parse(line)
        if (String(entry.id || '') === targetId) {
          deleted += 1
          continue
        }
      } catch {}
      nextLines.push(line)
    }
    if (nextLines.length) fs.writeFileSync(file, `${nextLines.join('\n')}\n`, 'utf8')
    else fs.unlinkSync(file)
  }
  return { ok: deleted > 0, deleted }
}

function assertApplicationLogIpcSender(event) {
  const sender = event?.sender
  const ownerWindow = sender ? BrowserWindow.fromWebContents(sender) : null
  if (!sender || !ownerWindow || ownerWindow.webContents !== sender || (event.senderFrame && event.senderFrame !== sender.mainFrame)) {
    throw new Error('拒绝非应用主窗口的日志请求')
  }
  const senderUrl = String(event.senderFrame?.url || sender.getURL() || '')
  if (isDev) {
    const expectedOrigin = new URL(process.env.APP_DEV_URL || 'http://127.0.0.1:35040').origin
    if (new URL(senderUrl).origin !== expectedOrigin) throw new Error('拒绝未知来源的日志请求')
  } else if (!senderUrl.startsWith('file:')) {
    throw new Error('拒绝未知来源的日志请求')
  }
}

// ---- 出站连接审计 ----
const OUTBOUND_AUDIT_MAX_ENTRIES = 500
const outboundAuditEntries = []
let outboundAuditInstalled = false
let outboundAuditLastKey = ''
let outboundAuditLastAt = 0

function getOutboundAuditLogFile() {
  return path.join(getApplicationLogDirectory(), 'network-audit.log')
}

function describeOutboundCaller() {
  try {
    const frames = String(new Error().stack || '').split('\n')
    const frame = frames.find((line, index) => index >= 2
      && !line.includes('recordOutboundConnection')
      && !line.includes('installOutboundConnectionAudit')
      && !line.includes('Socket.connect'))
    if (!frame) return ''
    const match = frame.match(/\(?([^()\s]+:\d+:\d+)\)?$/)
    return match ? match[1] : frame.trim()
  } catch {
    return ''
  }
}

function recordOutboundConnection(host, port, kind) {
  const targetHost = String(host || '').trim()
  const targetPort = Number(port || 0)
  if (!targetHost && !targetPort) return

  const isLocal = targetHost === '127.0.0.1' || targetHost === '::1' || targetHost === 'localhost'
  const entry = {
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    host: targetHost || '(unix socket)',
    port: targetPort,
    kind,
    local: isLocal,
    caller: describeOutboundCaller(),
  }
  outboundAuditEntries.push(entry)
  if (outboundAuditEntries.length > OUTBOUND_AUDIT_MAX_ENTRIES) outboundAuditEntries.shift()

  const key = `${entry.host}:${entry.port}:${entry.kind}`
  const now = Date.now()
  if (key === outboundAuditLastKey && now - outboundAuditLastAt < 3000) return
  outboundAuditLastKey = key
  outboundAuditLastAt = now

  try {
    const file = getOutboundAuditLogFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `[${entry.time}] ${entry.host}:${entry.port} ${entry.kind}${entry.caller ? ` <- ${entry.caller}` : ''}\n`)
  } catch {}
}

function installOutboundConnectionAudit() {
  if (outboundAuditInstalled) return
  outboundAuditInstalled = true

  const originalConnect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (...args) {
    try {
      const raw = args[0]
      const target = Array.isArray(raw) ? raw[0] : raw
      const second = Array.isArray(raw) ? raw[1] : args[1]
      let host = ''
      let port = 0
      let kind = 'tcp'
      if (target && typeof target === 'object') {
        if (target.path) {
          host = String(target.path)
          kind = 'unix'
        } else {
          host = String(target.host || target.hostname || '')
          port = Number(target.port || 0)
        }
      } else if (typeof target === 'number') {
        port = Number(target)
        if (typeof second === 'string') host = second
        else if (second && typeof second === 'object') host = String(second.host || second.hostname || '')
      } else if (typeof target === 'string') {
        host = target
        kind = 'unix'
      }
      recordOutboundConnection(host, port, kind)
    } catch {}
    return originalConnect.apply(this, args)
  }
}

function readOutboundAuditLog() {
  return {
    file: getOutboundAuditLogFile(),
    entries: outboundAuditEntries.slice().reverse(),
  }
}

async function getAppDatabase() {
  if (!appDatabasePromise) appDatabasePromise = openAppDatabase()
  return appDatabasePromise
}

async function openAppDatabase() {
  const SQL = await initSqlJs()
  const file = getAppDatabaseFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database()
  applyAppDatabaseSchema(db)
  ensureAppDatabaseColumns(db)
  ensureDefaultAppIdentity(db)
  migrateStructuredAppData(db)
  db.run('PRAGMA user_version = 2')
  persistAppDatabase(db)
  return db
}

function applyAppDatabaseSchema(db) {
  const schemaFile = getAppDatabaseSchemaFile()
  const schemaSql = fs.readFileSync(schemaFile, 'utf8')
  schemaSql
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean)
    .forEach(statement => db.run(statement))
}

function ensureAppDatabaseColumns(db) {
  ensureAppDatabaseColumn(db, 'nginx_ssl_certificates', 'target_dir', "TEXT NOT NULL DEFAULT ''")
  ensureAppDatabaseColumn(db, 'nginx_ssl_certificates', 'certbot_domain', "TEXT NOT NULL DEFAULT ''")
  ensureAppDatabaseColumn(db, 'nginx_ssl_certificates', 'data_json', "TEXT NOT NULL DEFAULT '{}'")
}

function ensureDefaultAppIdentity(db) {
  const now = getCurrentTimestamp()
  db.run(
    `INSERT OR IGNORE INTO users
      (id, username, display_name, email, phone, password_hash, password_salt, status, created_at, updated_at)
      VALUES (?, ?, ?, '', '', '', '', 'active', ?, ?)`,
    [DEFAULT_USER_ID, 'local', '本机默认用户', now, now]
  )
  db.run(
    `INSERT OR IGNORE INTO workspaces
      (id, user_id, name, description, is_default, created_at, updated_at)
      VALUES (?, ?, ?, '', 1, ?, ?)`,
    [DEFAULT_WORKSPACE_ID, DEFAULT_USER_ID, '默认工作区', now, now]
  )
}

function ensureAppDatabaseColumn(db, tableName, columnName, definition) {
  const columns = queryAppRows(db, `PRAGMA table_info(${tableName})`).map(row => row.name)
  if (columns.includes(columnName)) return
  db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

function queryAppRows(db, sql, params = []) {
  const result = db.exec(sql, params)
  const columns = result?.[0]?.columns || []
  return (result?.[0]?.values || []).map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
}

function queryAppValue(db, sql, params = []) {
  const result = db.exec(sql, params)
  return result?.[0]?.values?.[0]?.[0]
}

function parseJsonValue(value, fallback = null) {
  if (value == null || value === '') return fallback
  try {
    return JSON.parse(String(value))
  } catch (error) {
    return fallback
  }
}

function createStableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16)}`
}

function normalizeAppIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function createAppDeviceId() {
  let machineIdentity = ''
  if (process.platform === 'win32') {
    try {
      const output = execFileSync(
        'reg.exe',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', windowsHide: true }
      )
      machineIdentity = String(output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)?.[1] || '').trim()
    } catch {}
  }
  if (!machineIdentity) {
    machineIdentity = [os.hostname(), os.platform(), os.arch(), os.homedir()].join('|')
  }
  const raw = crypto.createHash('sha256').update(`linux-visual:${machineIdentity}`).digest('hex').slice(0, 20).toUpperCase()
  return `LV-${raw.slice(0, 6)}-${raw.slice(6, 12)}-${raw.slice(12, 20)}`
}

function getActiveWorkspaceId() {
  return currentAppUserContext?.workspaceId || DEFAULT_WORKSPACE_ID
}

function getWorkspaceIdForUser(userId) {
  return createStableId('workspace', userId || DEFAULT_USER_ID)
}

function getOrCreateAppDeviceId(db) {
  const value = createAppDeviceId()
  db.run('INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)', [APP_DEVICE_ID_STORAGE_KEY, JSON.stringify(value), getCurrentTimestamp()])
  return value
}

function getCurrentTimestamp() {
  return Date.now()
}

function migrateStructuredAppData(db) {
  if (queryAppValue(db, 'SELECT value FROM app_kv WHERE key = ? LIMIT 1', [STRUCTURED_APP_DATA_MIGRATION_KEY]) === 'true') return
  if (!queryAppValue(db, 'SELECT 1 FROM server_accounts LIMIT 1')) migrateServerAccountsToDatabase(db, readConnections())
  if (!queryAppValue(db, 'SELECT 1 FROM database_connections LIMIT 1')) migrateDatabaseConnectionsToDatabase(db, readDatabaseConnections())
  if (!queryAppValue(db, 'SELECT 1 FROM object_storage_connections LIMIT 1')) migrateObjectStorageConnectionsToDatabase(db, readObjectStorageConnections())
  migrateNginxSslCertificatesToDatabase(db, readNginxSslCertificates())
  migrateAppSettingsToDatabase(db)
  migrateNginxStructuredDataFromKv(db)
  db.run('INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)', [STRUCTURED_APP_DATA_MIGRATION_KEY, 'true', getCurrentTimestamp()])
}

function upsertAppSetting(db, key, value, scope = 'app') {
  if (!key) return
  db.run(
    'INSERT OR REPLACE INTO app_settings (workspace_id, scope, key, value, updated_at) VALUES (?, ?, ?, ?, ?)',
    [getActiveWorkspaceId(), scope, String(key), JSON.stringify(value ?? null), getCurrentTimestamp()]
  )
}

function parseRemoteProfileStorageKey(key = '', prefix = '') {
  const text = String(key || '')
  if (!text.startsWith(`${prefix}:`)) return null
  const parts = text.slice(prefix.length + 1).split(':')
  if (parts.length < 4) return null
  return {
    protocol: parts[0] === 'sftp' ? 'sftp' : 'ssh',
    host: String(parts[1] || '').trim().toLowerCase(),
    port: Number(parts[2] || 22),
    username: String(parts.slice(3).join(':') || '').trim().toLowerCase()
  }
}

function ensureServerAccountForProfile(db, profile = {}) {
  if (!profile.host || !profile.username) return null
  const workspaceId = profile.workspaceId || getActiveWorkspaceId()
  const existingId = queryAppValue(
    db,
    'SELECT id FROM server_accounts WHERE workspace_id = ? AND protocol = ? AND host = ? AND port = ? AND username = ? LIMIT 1',
    [workspaceId, profile.protocol, profile.host, profile.port, profile.username]
  )
  if (existingId) return existingId
  const id = createStableId('server', `${workspaceId}:${profile.protocol}:${profile.host}:${profile.port}:${profile.username}`)
  const now = getCurrentTimestamp()
  db.run(
    `INSERT OR IGNORE INTO server_accounts
      (id, workspace_id, name, protocol, host, port, username, auth_type, encrypted_password, private_key, encrypted_passphrase, remark, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'password', '', '', '', '', ?, ?)`,
    [id, workspaceId, `${profile.username}@${profile.host}`, profile.protocol, profile.host, profile.port, profile.username, now, now]
  )
  return id
}

function getSessionServerAccountId(db, sessionId) {
  const session = sessions.get(String(sessionId || ''))
  const config = session?.config || {}
  const profile = {
    protocol: normalizeProtocol(config.protocol || session?.protocol || 'ssh'),
    host: String(config.host || '').trim().toLowerCase(),
    port: Number(config.port || 22),
    username: String(config.username || '').trim().toLowerCase(),
    workspaceId: config.workspaceId || getActiveWorkspaceId()
  }
  return ensureServerAccountForProfile(db, profile)
}

async function withAppDatabaseWrite(task) {
  try {
    const db = await getAppDatabase()
    const result = await task(db)
    persistAppDatabase(db)
    return result
  } catch (error) {
    console.warn('[app-db] write failed', error)
    return null
  }
}

function ensureWorkspaceForAppUser(db, userId, identifier) {
  const workspaceId = getWorkspaceIdForUser(userId)
  const now = getCurrentTimestamp()
  db.run(
    `INSERT OR IGNORE INTO workspaces
      (id, user_id, name, description, is_default, created_at, updated_at)
      VALUES (?, ?, ?, '', 1, ?, ?)`,
    [workspaceId, userId, `${identifier || '当前数据'} 的工作区`, now, now]
  )
  return workspaceId
}

function setCurrentAppUserContext(userId, workspaceId, identifier) {
  currentAppUserContext = {
    userId: userId || DEFAULT_USER_ID,
    workspaceId: workspaceId || DEFAULT_WORKSPACE_ID,
    identifier: normalizeAppIdentifier(identifier)
  }
}

function persistCurrentAppUserContext(db, userId, workspaceId, identifier) {
  const nextUserId = String(userId || '').trim()
  if (!nextUserId || nextUserId === DEFAULT_USER_ID) return
  db.run(
    'INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)',
    [APP_LAST_USER_STORAGE_KEY, JSON.stringify({ userId: nextUserId, workspaceId: workspaceId || getWorkspaceIdForUser(nextUserId), identifier: normalizeAppIdentifier(identifier) }), getCurrentTimestamp()]
  )
}

function restoreCurrentAppUserContext(db) {
  if (currentAppUserContext?.userId && currentAppUserContext.userId !== DEFAULT_USER_ID) return false
  const stored = parseJsonValue(queryAppValue(db, 'SELECT value FROM app_kv WHERE key = ? LIMIT 1', [APP_LAST_USER_STORAGE_KEY]), null)
  const userId = String(stored?.userId || '').trim()
  let user = userId && userId !== DEFAULT_USER_ID
    ? queryAppRows(db, 'SELECT * FROM users WHERE id = ? LIMIT 1', [userId])[0]
    : null
  if (!user || String(user.status || 'active') !== 'active') {
    // Preserve the most recently used legacy workspace after removing application login.
    user = queryAppRows(
      db,
      `SELECT * FROM users
        WHERE id != ? AND status = 'active'
        ORDER BY COALESCE(last_login_at, updated_at, created_at, 0) DESC
        LIMIT 1`,
      [DEFAULT_USER_ID]
    )[0]
  }
  if (!user || String(user.status || 'active') !== 'active') return false
  const identifier = normalizeAppIdentifier(user.username || stored.identifier)
  const workspaceId = ensureWorkspaceForAppUser(db, user.id, identifier)
  setCurrentAppUserContext(user.id, workspaceId, identifier)
  persistCurrentAppUserContext(db, user.id, workspaceId, identifier)
  return true
}

function buildOfflineActivationState(db) {
  const deviceId = getOrCreateAppDeviceId(db)
  const stored = parseJsonValue(
    queryAppValue(db, 'SELECT value FROM app_kv WHERE key = ? LIMIT 1', [OFFLINE_ACTIVATION_STORAGE_KEY]),
    null
  )
  const validation = stored?.activationCode
    ? verifyActivationCode(stored.activationCode, deviceId)
    : { ok: false, error: '' }
  return {
    version: 1,
    activated: validation.ok === true,
    activationMode: validation.ok === true ? 'offline' : '',
    deviceId,
    productCode: PRODUCT_CODE,
    purchaseUrl: createPurchaseUrl(deviceId),
    activationCode: validation.ok ? validation.code : '',
    license: validation.ok ? validation.license : null,
    error: stored?.activationCode && !validation.ok ? validation.error : ''
  }
}

async function getOfflineActivationState() {
  const db = await getAppDatabase()
  restoreCurrentAppUserContext(db)
  const state = buildOfflineActivationState(db)
  persistAppDatabase(db)
  return state
}

async function activateOfflineLicense(payload = {}) {
  const activationCode = String(payload.activationCode || '').replace(/\s+/g, '')
  if (!activationCode) return { ok: false, error: '请输入激活码' }
  const db = await getAppDatabase()
  restoreCurrentAppUserContext(db)
  const deviceId = getOrCreateAppDeviceId(db)
  const validation = verifyActivationCode(activationCode, deviceId)
  if (!validation.ok) return validation
  db.run(
    'INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)',
    [OFFLINE_ACTIVATION_STORAGE_KEY, JSON.stringify({ activationCode: validation.code, activatedAt: getCurrentTimestamp() }), getCurrentTimestamp()]
  )
  persistAppDatabase(db)
  return { ok: true, state: buildOfflineActivationState(db) }
}

function normalizeSnapshotText(value = '') {
  return String(value ?? '').trim()
}

async function persistServerOverviewSnapshot(sessionId, overview = {}) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const id = `overview-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`
    db.run(
      `INSERT INTO server_overview_snapshots
        (id, workspace_id, server_account_id, hostname, os_name, kernel, cpu_model, cpu_cores, memory_total, disk_total, ip_address, raw_json, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, DEFAULT_WORKSPACE_ID, serverAccountId, overview.HOSTNAME || '', overview.SYSTEM || '', '', '', 0, 0, 0, overview.IP || '', JSON.stringify(overview || {}), getCurrentTimestamp()]
    )
  })
}

async function persistServiceSnapshot(sessionId, services = []) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const snapshotId = `svc-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`
    db.run('INSERT INTO service_snapshots (id, workspace_id, server_account_id, service_manager, collected_at) VALUES (?, ?, ?, ?, ?)', [snapshotId, DEFAULT_WORKSPACE_ID, serverAccountId, 'systemd', getCurrentTimestamp()])
    ;(Array.isArray(services) ? services : []).forEach(item => {
      db.run(
        `INSERT INTO service_units (id, snapshot_id, name, load_state, active_state, sub_state, description, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`svc-unit-${snapshotId}-${item.key || item.name}`, snapshotId, normalizeSnapshotText(item.name || item.key), '', normalizeSnapshotText(item.status || 'unknown'), '', normalizeSnapshotText(item.key || ''), JSON.stringify(item || {})]
      )
    })
  })
}

async function persistSystemUsersSnapshot(sessionId, overview = {}) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const snapshotId = `users-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`
    db.run('INSERT INTO system_user_snapshots (id, workspace_id, server_account_id, collected_at) VALUES (?, ?, ?, ?)', [snapshotId, DEFAULT_WORKSPACE_ID, serverAccountId, getCurrentTimestamp()])
    ;(Array.isArray(overview.users) ? overview.users : []).forEach(user => {
      db.run(
        `INSERT INTO system_users (id, snapshot_id, username, uid, gid, home, shell, groups_text, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`sys-user-${snapshotId}-${user.uid}-${user.name}`, snapshotId, normalizeSnapshotText(user.name), Number(user.uid || 0), Number(user.gid || 0), normalizeSnapshotText(user.home), normalizeSnapshotText(user.shell), (Array.isArray(user.groups) ? user.groups : []).join(','), JSON.stringify(user || {})]
      )
    })
  })
}

async function persistFirewallSnapshot(sessionId, overview = {}) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const snapshotId = `fw-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`
    const selected = overview.selected || overview.active || {}
    db.run('INSERT INTO firewall_snapshots (id, workspace_id, server_account_id, firewall_type, collected_at) VALUES (?, ?, ?, ?, ?)', [snapshotId, DEFAULT_WORKSPACE_ID, serverAccountId, normalizeSnapshotText(selected.backend || overview.backend || ''), getCurrentTimestamp()])
    const rules = []
    ;(Array.isArray(overview.diagnostics?.firewallLayers) ? overview.diagnostics.firewallLayers : []).forEach(layer => {
      ;(Array.isArray(layer.rules) ? layer.rules : []).forEach(rule => rules.push({ ...rule, layer: layer.key }))
    })
    ;(rules.length ? rules : Array.isArray(selected.rules) ? selected.rules : []).forEach((rule, index) => {
      db.run(
        `INSERT INTO firewall_rules (id, snapshot_id, rule_no, direction, action, protocol, port, source, target, raw_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`fw-rule-${snapshotId}-${index}`, snapshotId, index + 1, normalizeSnapshotText(rule.direction || rule.chain || rule.family || ''), normalizeSnapshotText(rule.action || ''), normalizeSnapshotText(rule.protocol || ''), normalizeSnapshotText(rule.port || ''), normalizeSnapshotText(rule.source || ''), normalizeSnapshotText(rule.target || ''), normalizeSnapshotText(rule.raw || JSON.stringify(rule || {}))]
      )
    })
    ;(Array.isArray(overview.diagnostics?.listening?.items) ? overview.diagnostics.listening.items : []).forEach((item, index) => {
      const portSnapshotId = `${snapshotId}-ports`
      if (index === 0) db.run('INSERT INTO port_scan_snapshots (id, workspace_id, server_account_id, collected_at) VALUES (?, ?, ?, ?)', [portSnapshotId, DEFAULT_WORKSPACE_ID, serverAccountId, getCurrentTimestamp()])
      db.run(
        `INSERT INTO listening_ports (id, snapshot_id, protocol, local_address, port, process_name, pid, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`listen-${snapshotId}-${index}`, portSnapshotId, normalizeSnapshotText(item.protocol), normalizeSnapshotText(item.address), Number(item.port || 0), normalizeSnapshotText(item.process), null, JSON.stringify(item || {})]
      )
    })
  })
}

async function persistPm2Snapshot(sessionId, processes = []) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const snapshotId = `pm2-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`
    db.run('INSERT INTO pm2_snapshots (id, workspace_id, server_account_id, collected_at) VALUES (?, ?, ?, ?)', [snapshotId, DEFAULT_WORKSPACE_ID, serverAccountId, getCurrentTimestamp()])
    ;(Array.isArray(processes) ? processes : []).forEach(item => {
      db.run(
        `INSERT INTO pm2_processes (id, snapshot_id, pm_id, name, namespace, status, script_path, cwd, restart_count, cpu, memory, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`pm2-proc-${snapshotId}-${item.pmId ?? item.id}`, snapshotId, Number(item.pmId || 0), normalizeSnapshotText(item.name), normalizeSnapshotText(item.namespace || 'default'), normalizeSnapshotText(item.status), normalizeSnapshotText(item.script), normalizeSnapshotText(item.cwd), Number(item.restarts || 0), Number(item.cpuValue || 0), Number(item.memoryBytes || 0), JSON.stringify(item || {})]
      )
    })
  })
}

async function persistDockerContainersSnapshot(sessionId, containers = []) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const snapshotId = `docker-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`
    db.run('INSERT INTO docker_snapshots (id, workspace_id, server_account_id, collected_at) VALUES (?, ?, ?, ?)', [snapshotId, DEFAULT_WORKSPACE_ID, serverAccountId, getCurrentTimestamp()])
    ;(Array.isArray(containers) ? containers : []).forEach(item => {
      db.run(
        `INSERT INTO docker_containers (id, snapshot_id, container_id, name, image, status, ports, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`docker-container-${snapshotId}-${item.id}`, snapshotId, normalizeSnapshotText(item.id), normalizeSnapshotText(item.names || item.name), normalizeSnapshotText(item.image), normalizeSnapshotText(item.status), normalizeSnapshotText(item.ports), JSON.stringify(item || {})]
      )
    })
  })
}

async function persistLogSources(sessionId, records = []) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    ;(Array.isArray(records) ? records : []).forEach(item => {
      const filePath = normalizeSnapshotText(item.path)
      if (!filePath) return
      const id = createStableId('log-source', `${serverAccountId}:${filePath}`)
      db.run(
        `INSERT OR REPLACE INTO log_sources (id, workspace_id, server_account_id, name, path, source_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM log_sources WHERE id = ?), ?), ?)`,
        [id, DEFAULT_WORKSPACE_ID, serverAccountId, normalizeSnapshotText(item.name || path.posix.basename(filePath)), filePath, 'file', id, getCurrentTimestamp(), getCurrentTimestamp()]
      )
    })
  })
}

async function persistLogReadHistory(sessionId, payload = {}) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const filePath = normalizeSnapshotText(payload.path)
    if (!filePath) return
    db.run(
      'INSERT INTO log_read_history (id, workspace_id, server_account_id, path, lines, keyword, read_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`log-read-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`, DEFAULT_WORKSPACE_ID, serverAccountId, filePath, Number(payload.lines || 200), normalizeSnapshotText(payload.keyword || ''), getCurrentTimestamp()]
    )
  })
}

async function persistTerminalCommandHistory(sessionId, payload = {}) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const command = normalizeSnapshotText(payload.command)
    if (!command) return
    db.run(
      `INSERT INTO terminal_command_history
        (id, workspace_id, server_account_id, command, exit_code, duration_ms, executed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`term-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`, DEFAULT_WORKSPACE_ID, serverAccountId, command, Number(payload.exitCode ?? 0), Number(payload.durationMs || 0), getCurrentTimestamp()]
    )
  })
}

function getNginxInstanceIdForPayload(db, payload = {}) {
  return upsertNginxInstanceFromSettings(db, {
    nginxHome: payload.nginxHome || '/etc/nginx',
    mainConfigPath: payload.mainConfigPath || '/etc/nginx/nginx.conf',
    backupDir: payload.backupDir || '/www/backup/nginx',
    sslDir: payload.sslDir || '/etc/letsencrypt/live',
    scanPaths: Array.isArray(payload.scanPaths) ? payload.scanPaths.join('\n') : payload.scanPaths || ''
  })
}

function upsertNginxConfigFileRow(db, nginxInstanceId, file = {}) {
  const filePath = normalizeSnapshotText(file.path)
  if (!nginxInstanceId || !filePath) return null
  const id = createStableId('nginx-file', `${nginxInstanceId}:${filePath}`)
  db.run(
    `INSERT OR REPLACE INTO nginx_config_files
      (id, nginx_instance_id, path, name, content_hash, size, server_count, include_count, last_scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, nginxInstanceId, filePath, normalizeSnapshotText(file.name || path.posix.basename(filePath)), normalizeSnapshotText(file.contentHash), Number(file.size || 0), Number(file.serverCount || (Array.isArray(file.servers) ? file.servers.length : 0)), Number(Array.isArray(file.includes) ? file.includes.length : 0), getCurrentTimestamp()]
  )
  return id
}

async function persistNginxSitesSnapshot(sessionId, payload = {}, sites = []) {
  await withAppDatabaseWrite(db => {
    const nginxInstanceId = getNginxInstanceIdForPayload(db, payload)
    ;(Array.isArray(sites) ? sites : []).forEach(site => upsertNginxConfigFileRow(db, nginxInstanceId, site))
  })
}

async function persistNginxTopologySnapshot(sessionId, payload = {}, topology = {}) {
  await withAppDatabaseWrite(db => {
    const nginxInstanceId = getNginxInstanceIdForPayload(db, payload)
    ;(Array.isArray(topology.files) ? topology.files : []).forEach(file => {
      const fileId = upsertNginxConfigFileRow(db, nginxInstanceId, file)
      if (!fileId) return
      db.run('DELETE FROM nginx_config_includes WHERE nginx_config_file_id = ?', [fileId])
      db.run('DELETE FROM nginx_server_blocks WHERE nginx_config_file_id = ?', [fileId])
      db.run('DELETE FROM nginx_upstream_blocks WHERE nginx_config_file_id = ?', [fileId])
      ;(Array.isArray(file.includes) ? file.includes : []).forEach((item, index) => {
        db.run(
          `INSERT INTO nginx_config_includes (id, nginx_config_file_id, line, pattern, matched_paths, raw_json)
            VALUES (?, ?, ?, ?, ?, ?)`,
          [`nginx-include-${fileId}-${index}`, fileId, Number(item.line || 0), normalizeSnapshotText(item.pattern), (Array.isArray(item.matched) ? item.matched : []).join('\n'), JSON.stringify(item || {})]
        )
      })
      ;(Array.isArray(file.servers) ? file.servers : []).forEach((server, index) => {
        db.run(
          `INSERT INTO nginx_server_blocks
            (id, nginx_config_file_id, start_line, title, server_name, listens, root, proxy_pass, ssl_certificates, ssl_certificate_keys, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [`nginx-server-${fileId}-${server.startLine || index}`, fileId, Number(server.startLine || 0), normalizeSnapshotText(server.title), normalizeSnapshotText(server.serverName), (Array.isArray(server.listens) ? server.listens : []).join('\n'), normalizeSnapshotText(server.root), normalizeSnapshotText(server.proxyPass), (Array.isArray(server.sslCertificates) ? server.sslCertificates : []).join('\n'), (Array.isArray(server.sslCertificateKeys) ? server.sslCertificateKeys : []).join('\n'), JSON.stringify(server || {})]
        )
      })
      ;(Array.isArray(file.upstreams) ? file.upstreams : []).forEach((upstream, index) => {
        db.run(
          `INSERT INTO nginx_upstream_blocks (id, nginx_config_file_id, start_line, name, servers, raw_json)
            VALUES (?, ?, ?, ?, ?, ?)`,
          [`nginx-upstream-${fileId}-${upstream.startLine || index}`, fileId, Number(upstream.startLine || 0), normalizeSnapshotText(upstream.name), (Array.isArray(upstream.servers) ? upstream.servers : []).join('\n'), JSON.stringify(upstream || {})]
        )
      })
    })
  })
}

async function persistNginxConfigVersion(sessionId, payload = {}) {
  await withAppDatabaseWrite(db => {
    const nginxInstanceId = getNginxInstanceIdForPayload(db, payload)
    const fileId = upsertNginxConfigFileRow(db, nginxInstanceId, {
      path: payload.path,
      name: path.posix.basename(payload.path || ''),
      contentHash: hashSha256Hex(payload.content || ''),
      size: Buffer.byteLength(String(payload.content || ''), 'utf8')
    })
    if (!fileId) return
    const content = String(payload.content || '')
    const contentHash = hashSha256Hex(content)
    db.run(
      'INSERT INTO nginx_config_versions (id, nginx_config_file_id, content_hash, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [`nginx-version-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`, fileId, contentHash, content, normalizeSnapshotText(payload.source || 'safe-write'), getCurrentTimestamp()]
    )
  })
}

async function persistPm2ProcessDetail(sessionId, detail = {}) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    db.run(
      'INSERT INTO pm2_process_details (id, workspace_id, server_account_id, pm_id, name, detail_json, collected_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`pm2-detail-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`, DEFAULT_WORKSPACE_ID, serverAccountId, Number(detail.pmId || 0), normalizeSnapshotText(detail.name), JSON.stringify(detail || {}), getCurrentTimestamp()]
    )
  })
}

async function persistPm2LogSnapshot(sessionId, target, lines, logLines = []) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    const name = normalizeSnapshotText(target)
    db.run(
      'INSERT INTO pm2_log_snapshots (id, workspace_id, server_account_id, pm_id, name, lines, stdout, stderr, collected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [`pm2-log-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`, DEFAULT_WORKSPACE_ID, serverAccountId, Number.isFinite(Number(target)) ? Number(target) : null, name, Number(lines || 200), (Array.isArray(logLines) ? logLines : []).join('\n'), '', getCurrentTimestamp()]
    )
  })
}

async function persistDockerContainerProcesses(sessionId, containerId, processes = []) {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, sessionId)
    ;(Array.isArray(processes) ? processes : []).forEach((item, index) => {
      db.run(
        `INSERT INTO docker_container_processes
          (id, workspace_id, server_account_id, container_id, pid, command, args, raw_json, collected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`docker-proc-${getCurrentTimestamp()}-${index}-${Math.random().toString(16).slice(2)}`, DEFAULT_WORKSPACE_ID, serverAccountId, normalizeSnapshotText(containerId), Number(item.pid || 0), normalizeSnapshotText(item.command), normalizeSnapshotText(item.args), JSON.stringify(item || {}), getCurrentTimestamp()]
      )
    })
  })
}

async function persistDockerLogSnapshot(sessionId, payload = {}, content = '') {
  await withAppDatabaseWrite(db => {
    const serverAccountId = getSessionServerAccountId(db, payload.sessionId || sessionId)
    db.run(
      'INSERT INTO docker_log_snapshots (id, workspace_id, server_account_id, container_id, lines, content, collected_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`docker-log-${getCurrentTimestamp()}-${Math.random().toString(16).slice(2)}`, DEFAULT_WORKSPACE_ID, serverAccountId, normalizeSnapshotText(payload.id), Number(payload.lines || 200), String(content || ''), getCurrentTimestamp()]
    )
  })
}

function mirrorAppStorageValueToStructuredTables(db, key, value) {
  const normalizedKey = String(key || '')
  if (normalizedKey === 'whssh:media-preview-preferences') {
    db.run(
      'INSERT OR REPLACE INTO file_preview_preferences (workspace_id, file_type, value, updated_at) VALUES (?, ?, ?, ?)',
      [DEFAULT_WORKSPACE_ID, 'media', JSON.stringify(value || {}), getCurrentTimestamp()]
    )
    return
  }

  const shortcutProfile = parseRemoteProfileStorageKey(normalizedKey, 'whssh:remote-shortcuts')
  if (shortcutProfile) {
    const serverAccountId = ensureServerAccountForProfile(db, shortcutProfile)
    const items = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []
    db.run('DELETE FROM file_bookmarks WHERE workspace_id = ? AND server_account_id = ? AND side = ?', [DEFAULT_WORKSPACE_ID, serverAccountId, 'remote'])
    items.forEach((item, index) => {
      const pathValue = String(item?.path || '').trim()
      if (!pathValue) return
      const id = createStableId('file-bookmark', `${serverAccountId}:${pathValue}`)
      db.run(
        `INSERT OR REPLACE INTO file_bookmarks
          (id, workspace_id, server_account_id, side, name, path, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM file_bookmarks WHERE id = ?), ?), ?)`,
        [id, DEFAULT_WORKSPACE_ID, serverAccountId, 'remote', String(item.label || item.name || path.basename(pathValue)).trim(), pathValue, index, id, getCurrentTimestamp(), getCurrentTimestamp()]
      )
    })
    return
  }

  const accessProfile = parseRemoteProfileStorageKey(normalizedKey, 'whssh:remote-dir-access')
  if (accessProfile) {
    const serverAccountId = ensureServerAccountForProfile(db, accessProfile)
    const items = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []
    items.forEach(item => {
      const pathValue = String(item?.path || '').trim()
      if (!pathValue) return
      const access = item.access || {}
      db.run(
        `INSERT OR REPLACE INTO remote_directory_access_cache
          (workspace_id, server_account_id, path, readable, writable, executable, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [DEFAULT_WORKSPACE_ID, serverAccountId, pathValue, access.checked === false ? 0 : 1, access.writable === false ? 0 : 1, 0, Number(item.updatedAt || getCurrentTimestamp())]
      )
    })
  }
}

function migrateAppSettingsToDatabase(db) {
  queryAppRows(db, 'SELECT key, value, updated_at FROM app_kv').forEach(row => {
    db.run(
      'INSERT OR IGNORE INTO app_settings (workspace_id, scope, key, value, updated_at) VALUES (?, ?, ?, ?, ?)',
      [DEFAULT_WORKSPACE_ID, 'kv', row.key, row.value, Number(row.updated_at || getCurrentTimestamp())]
    )
    mirrorAppStorageValueToStructuredTables(db, row.key, parseJsonValue(row.value, null))
  })
}

function migrateNginxStructuredDataFromKv(db) {
  const settingsRaw = queryAppValue(db, 'SELECT value FROM app_kv WHERE key = ? LIMIT 1', [NGINX_SYSTEM_SETTINGS_STORAGE_KEY])
  const settings = parseJsonValue(settingsRaw, null)
  const instanceId = settings ? upsertNginxInstanceFromSettings(db, settings) : null
  const historyRaw = queryAppValue(db, 'SELECT value FROM app_kv WHERE key = ? LIMIT 1', [SOURCE_HISTORY_STORAGE_KEY])
  const history = parseJsonValue(historyRaw, null)
  const historyItems = Array.isArray(history) ? history : Array.isArray(history?.items) ? history.items : []
  historyItems.forEach(item => upsertNginxSourceHistoryRow(db, instanceId, item))
  const sslRaw = queryAppValue(db, 'SELECT value FROM app_kv WHERE key = ? LIMIT 1', [NGINX_SSL_CERTIFICATES_STORAGE_KEY])
  const ssl = parseJsonValue(sslRaw, null)
  const sslItems = Array.isArray(ssl) ? ssl : Array.isArray(ssl?.items) ? ssl.items : []
  migrateNginxSslCertificatesToDatabase(db, sslItems, instanceId)
}

function persistAppDatabase(db) {
  fs.writeFileSync(getAppDatabaseFile(), Buffer.from(db.export()))
}

async function getAppStorageItem(key) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return null
  const db = await getAppDatabase()
  const result = db.exec('SELECT value FROM app_kv WHERE key = ? LIMIT 1', [normalizedKey])
  const raw = result?.[0]?.values?.[0]?.[0]
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

async function setAppStorageItem(key, value) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) throw new Error('存储 key 不能为空')
  if (PROTECTED_APP_STORAGE_KEYS.has(normalizedKey)) throw new Error('该内部存储项不允许修改')
  const db = await getAppDatabase()
  db.run('INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)', [normalizedKey, JSON.stringify(value ?? null), Date.now()])
  upsertAppSetting(db, normalizedKey, value, 'kv')
  mirrorAppStorageValueToStructuredTables(db, normalizedKey, value)
  if (normalizedKey === NGINX_SYSTEM_SETTINGS_STORAGE_KEY) upsertNginxInstanceFromSettings(db, value || {})
  if (normalizedKey === SOURCE_HISTORY_STORAGE_KEY) {
    const items = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []
    items.forEach(item => upsertNginxSourceHistoryRow(db, null, item))
  }
  persistAppDatabase(db)
  return { ok: true }
}

async function deleteAppStorageItem(key) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return { ok: true }
  if (PROTECTED_APP_STORAGE_KEYS.has(normalizedKey)) throw new Error('该内部存储项不允许删除')
  const db = await getAppDatabase()
  db.run('DELETE FROM app_kv WHERE key = ?', [normalizedKey])
  db.run('DELETE FROM app_settings WHERE workspace_id = ? AND scope = ? AND key = ?', [DEFAULT_WORKSPACE_ID, 'kv', normalizedKey])
  deleteMirroredAppStorageValue(db, normalizedKey)
  persistAppDatabase(db)
  return { ok: true }
}

function deleteMirroredAppStorageValue(db, key) {
  const normalizedKey = String(key || '')
  if (normalizedKey === 'whssh:media-preview-preferences') {
    db.run('DELETE FROM file_preview_preferences WHERE workspace_id = ? AND file_type = ?', [DEFAULT_WORKSPACE_ID, 'media'])
    return
  }
  const shortcutProfile = parseRemoteProfileStorageKey(normalizedKey, 'whssh:remote-shortcuts')
  if (shortcutProfile) {
    const serverAccountId = ensureServerAccountForProfile(db, shortcutProfile)
    db.run('DELETE FROM file_bookmarks WHERE workspace_id = ? AND server_account_id = ? AND side = ?', [DEFAULT_WORKSPACE_ID, serverAccountId, 'remote'])
    return
  }
  const accessProfile = parseRemoteProfileStorageKey(normalizedKey, 'whssh:remote-dir-access')
  if (accessProfile) {
    const serverAccountId = ensureServerAccountForProfile(db, accessProfile)
    db.run('DELETE FROM remote_directory_access_cache WHERE workspace_id = ? AND server_account_id = ?', [DEFAULT_WORKSPACE_ID, serverAccountId])
  }
}

async function getAppDatabaseSchema() {
  const db = await getAppDatabase()
  const readRows = sql => {
    const result = db.exec(sql)
    const columns = result?.[0]?.columns || []
    return (result?.[0]?.values || []).map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
  }
  const versionResult = db.exec('PRAGMA user_version')
  return {
    file: getAppDatabaseFile(),
    userVersion: Number(versionResult?.[0]?.values?.[0]?.[0] || 0),
    tables: readRows("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"),
    indexes: readRows("SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name"),
    schemaSql: fs.readFileSync(getAppDatabaseSchemaFile(), 'utf8')
  }
}

function quoteSqliteIdentifier(value = '') {
  const name = String(value || '').trim()
  if (!name) throw new Error('名称不能为空')
  return `"${name.replace(/"/g, '""')}"`
}

function formatAppDatabaseRows(result = [], options = {}) {
  const first = result?.[0] || { columns: [], values: [] }
  const columns = (first.columns || []).map(column => ({ prop: column, label: column }))
  const rows = (first.values || []).map((values, rowIndex) => {
    const row = { __rowKey: `${options.keyPrefix || 'row'}-${rowIndex}` }
    ;(first.columns || []).forEach((column, index) => {
      const value = values[index]
      row[column] = value == null ? null : typeof value === 'object' ? JSON.stringify(value) : value
    })
    return row
  })
  return { columns, rows }
}

function ensureReadOnlyAppDatabaseSql(sql = '') {
  const text = String(sql || '').trim().replace(/;\s*$/, '')
  if (!text) throw new Error('SQL 不能为空')
  if (!/^(select|with|pragma)\b/i.test(text)) throw new Error('本地应用数据库只允许执行 SELECT / WITH / PRAGMA 查询')
  if (/\b(insert|update|delete|replace|drop|alter|create|attach|detach|vacuum|reindex|pragma\s+writable_schema)\b/i.test(text)) {
    throw new Error('本地应用数据库查询入口禁止执行写入或结构变更语句')
  }
  return text
}

function assertAppDatabaseInspectionAvailable() {
  if (!isDev) throw new Error('本地应用数据库仅在开发环境可用')
}

async function listAppDatabaseTables() {
  const db = await getAppDatabase()
  return queryAppRows(
    db,
    "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
  ).map(row => ({ name: row.name, type: row.type, sql: row.sql || '' }))
}

async function describeAppDatabaseTable(tableName = '') {
  const db = await getAppDatabase()
  const quotedName = quoteSqliteIdentifier(tableName)
  return queryAppRows(db, `PRAGMA table_info(${quotedName})`).map(row => ({
    cid: Number(row.cid || 0),
    name: row.name,
    type: row.type || '',
    notnull: Number(row.notnull || 0),
    defaultValue: row.dflt_value,
    primaryKey: Number(row.pk || 0)
  }))
}

async function previewAppDatabaseTable(payload = {}) {
  const table = String(payload.table || '').trim()
  if (!table) throw new Error('表名不能为空')
  const page = Math.max(1, Number(payload.page || 1))
  const pageSize = Math.max(10, Math.min(Number(payload.pageSize || 50), 500))
  const offset = (page - 1) * pageSize
  const db = await getAppDatabase()
  const quotedName = quoteSqliteIdentifier(table)
  const total = Number(queryAppValue(db, `SELECT COUNT(*) FROM ${quotedName}`) || 0)
  const formatted = formatAppDatabaseRows(db.exec(`SELECT * FROM ${quotedName} LIMIT ? OFFSET ?`, [pageSize, offset]), { keyPrefix: table })
  return { kind: 'rows', table, page, pageSize, total, ...formatted }
}

async function queryAppDatabase(payload = {}) {
  const sql = ensureReadOnlyAppDatabaseSql(payload.sql)
  const page = Math.max(1, Number(payload.page || 1))
  const pageSize = Math.max(10, Math.min(Number(payload.pageSize || 50), 500))
  const db = await getAppDatabase()
  const startedAt = Date.now()
  const formatted = formatAppDatabaseRows(db.exec(sql), { keyPrefix: 'query' })
  return {
    kind: 'rows',
    columns: formatted.columns,
    rows: formatted.rows.slice((page - 1) * pageSize, page * pageSize),
    total: formatted.rows.length,
    page,
    pageSize,
    durationMs: Date.now() - startedAt,
    message: `查询完成，共 ${formatted.rows.length} 条`
  }
}

function normalizeComposeDraftMeta(payload = {}) {
  const nginxHome = String(payload.nginxHome || '').trim() || 'default'
  const mainConfigPath = String(payload.mainConfigPath || '').trim() || 'nginx.conf'
  const sourcePath = String(payload.sourcePath || mainConfigPath).trim() || mainConfigPath
  const draftKey = String(payload.draftKey || `${nginxHome}\n${mainConfigPath}\n${sourcePath}`).trim()
  if (!draftKey) throw new Error('草稿 key 不能为空')
  return { draftKey, nginxHome, mainConfigPath, sourcePath }
}

async function getNginxComposeDraft(payload = {}) {
  const { draftKey } = normalizeComposeDraftMeta(payload)
  const db = await getAppDatabase()
  const result = db.exec('SELECT value FROM nginx_compose_drafts WHERE draft_key = ? LIMIT 1', [draftKey])
  const raw = result?.[0]?.values?.[0]?.[0]
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

async function setNginxComposeDraft(payload = {}) {
  const meta = normalizeComposeDraftMeta(payload)
  const db = await getAppDatabase()
  db.run(
    'INSERT OR REPLACE INTO nginx_compose_drafts (draft_key, nginx_home, main_config_path, source_path, value, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [meta.draftKey, meta.nginxHome, meta.mainConfigPath, meta.sourcePath, JSON.stringify(payload.value ?? null), Date.now()]
  )
  persistAppDatabase(db)
  return { ok: true }
}

async function deleteNginxComposeDraft(payload = {}) {
  const { draftKey } = normalizeComposeDraftMeta(payload)
  const db = await getAppDatabase()
  db.run('DELETE FROM nginx_compose_drafts WHERE draft_key = ?', [draftKey])
  persistAppDatabase(db)
  return { ok: true }
}

function readConnections() {
  const file = getConnectionsFile()
  if (!fs.existsSync(file)) return []
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    return []
  }
}

function readDatabaseConnections() {
  const file = getDatabaseConnectionsFile()
  if (!fs.existsSync(file)) return []
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    return []
  }
}

function readNginxSslCertificates() {
  const file = getNginxSslCertificatesFile()
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : []
  } catch (error) {
    return []
  }
}

function readObjectStorageConnections() {
  const file = getObjectStorageConnectionsFile()
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : []
  } catch (error) {
    return []
  }
}

function writeConnections(list) {
  fs.writeFileSync(getConnectionsFile(), JSON.stringify(list, null, 2), 'utf8')
}

function writeDatabaseConnections(list) {
  fs.writeFileSync(getDatabaseConnectionsFile(), JSON.stringify(list, null, 2), 'utf8')
}

function writeNginxSslCertificates(list) {
  fs.writeFileSync(getNginxSslCertificatesFile(), JSON.stringify({ version: 1, items: Array.isArray(list) ? list : [] }, null, 2), 'utf8')
}

async function readStoredNginxSslCertificates() {
  return readStoredNginxSslCertificatesFromDatabase()
}

async function writeStoredNginxSslCertificates(list) {
  return writeStoredNginxSslCertificatesToDatabase(list)
}

function writeObjectStorageConnections(list) {
  fs.writeFileSync(getObjectStorageConnectionsFile(), JSON.stringify({ version: 1, items: Array.isArray(list) ? list : [] }, null, 2), 'utf8')
}

function connectionRowToLegacy(row = {}) {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    host: row.host,
    port: Number(row.port || 22),
    username: row.username,
    authType: row.auth_type,
    encryptedPassword: row.encrypted_password,
    encryptedPrivateKey: row.private_key,
    encryptedPassphrase: row.encrypted_passphrase,
    remark: row.remark || '',
    updatedAt: Number(row.updated_at || 0)
  }
}

function databaseConnectionRowToLegacy(row = {}) {
  const options = parseJsonValue(row.options_json, {}) || {}
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: Number(row.port || 3306),
    username: row.username,
    encryptedPassword: row.encrypted_password,
    database: row.default_database || '',
    charset: row.charset || 'utf8mb4',
    useSshTunnel: options.useSshTunnel === true,
    updatedAt: Number(row.updated_at || 0)
  }
}

function objectStorageConnectionRowToLegacy(row = {}) {
  const options = parseJsonValue(row.options_json, {}) || {}
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    region: row.region || '',
    endpoint: row.endpoint || '',
    bucket: row.bucket || '',
    prefix: options.prefix || '',
    encryptedAccessKeyId: row.access_key_id || '',
    encryptedSecretAccessKey: row.encrypted_secret_key || '',
    updatedAt: Number(row.updated_at || 0)
  }
}

function upsertServerAccountRow(db, item = {}) {
  if (!item?.id || !item?.host || !item?.username) return
  const now = Number(item.updatedAt || item.createdAt || getCurrentTimestamp())
  const workspaceId = item.workspaceId || getActiveWorkspaceId()
  db.run(
    `INSERT OR REPLACE INTO server_accounts
      (id, workspace_id, name, protocol, host, port, username, auth_type, encrypted_password, private_key, encrypted_passphrase, remark, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM server_accounts WHERE id = ?), ?), ?)`,
    [
      item.id,
      workspaceId,
      String(item.name || item.host || '服务器连接').trim(),
      normalizeProtocol(item.protocol),
      String(item.host || '').trim(),
      Number(item.port || 22),
      String(item.username || '').trim(),
      item.authType === 'privateKey' ? 'privateKey' : 'password',
      String(item.encryptedPassword || ''),
      String(item.encryptedPrivateKey || ''),
      String(item.encryptedPassphrase || ''),
      String(item.remark || ''),
      item.id,
      now,
      now
    ]
  )
}

function migrateServerAccountsToDatabase(db, list = []) {
  ;(Array.isArray(list) ? list : []).forEach(item => upsertServerAccountRow(db, item))
}

async function listStoredConnections() {
  const db = await getAppDatabase()
  const workspaceId = getActiveWorkspaceId()
  const rows = queryAppRows(db, 'SELECT * FROM server_accounts WHERE workspace_id = ? ORDER BY updated_at DESC, name ASC', [workspaceId])
  return rows.map(connectionRowToLegacy)
}

async function saveStoredConnection(config = {}) {
  const id = config.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const saved = {
    id,
    name: config.name || config.host,
    protocol: normalizeProtocol(config.protocol),
    host: config.host,
    port: Number(config.port || 22),
    username: config.username,
    authType: config.authType === 'privateKey' ? 'privateKey' : 'password',
    encryptedPassword: encryptSecret(config.password || ''),
    encryptedPrivateKey: encryptSecret(config.privateKey || ''),
    encryptedPassphrase: encryptSecret(config.passphrase || ''),
    updatedAt: getCurrentTimestamp(),
    workspaceId: getActiveWorkspaceId()
  }
  const db = await getAppDatabase()
  upsertServerAccountRow(db, saved)
  persistAppDatabase(db)
  return saved
}

async function deleteStoredConnection(id) {
  const db = await getAppDatabase()
  const connectionId = String(id || '')
  if (!queryAppValue(db, 'SELECT 1 FROM server_accounts WHERE id = ? AND workspace_id = ? LIMIT 1', [connectionId, getActiveWorkspaceId()])) {
    throw new Error('连接不存在或已被删除')
  }
  db.run('DELETE FROM server_accounts WHERE id = ? AND workspace_id = ?', [connectionId, getActiveWorkspaceId()])
  persistAppDatabase(db)
  return true
}

function upsertDatabaseConnectionRow(db, item = {}) {
  if (!item?.id || !item?.host || !item?.username) return
  const type = normalizeDatabaseType(item.type)
  const now = Number(item.updatedAt || item.createdAt || getCurrentTimestamp())
  const workspaceId = item.workspaceId || getActiveWorkspaceId()
  db.run(
    `INSERT OR REPLACE INTO database_connections
      (id, workspace_id, name, type, host, port, username, encrypted_password, default_database, charset, ssl_enabled, options_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM database_connections WHERE id = ?), ?), ?)`,
    [
      item.id,
      workspaceId,
      String(item.name || item.host || '数据库连接').trim(),
      type,
      String(item.host || '').trim(),
      Number(item.port || (type === 'sqlserver' ? 1433 : 3306)),
      String(item.username || '').trim(),
      String(item.encryptedPassword || ''),
      String(item.database || item.defaultDatabase || '').trim(),
      String(item.charset || 'utf8mb4').trim(),
      item.sslEnabled === true ? 1 : 0,
      JSON.stringify({ useSshTunnel: item.useSshTunnel === true }),
      item.id,
      now,
      now
    ]
  )
}

function migrateDatabaseConnectionsToDatabase(db, list = []) {
  ;(Array.isArray(list) ? list : []).forEach(item => upsertDatabaseConnectionRow(db, item))
}

async function listStoredDatabaseConnections() {
  const db = await getAppDatabase()
  const workspaceId = getActiveWorkspaceId()
  const rows = queryAppRows(db, 'SELECT * FROM database_connections WHERE workspace_id = ? ORDER BY updated_at DESC, name ASC', [workspaceId])
  return rows.map(databaseConnectionRowToLegacy)
}

async function saveStoredDatabaseConnection(config = {}) {
  const id = config.id || `db-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const type = normalizeDatabaseType(config.type)
  const saved = {
    id,
    name: String(config.name || config.host || '数据库连接').trim(),
    type,
    host: String(config.host || '').trim(),
    port: Number(config.port || (type === 'sqlserver' ? 1433 : 3306)),
    username: String(config.username || '').trim(),
    encryptedPassword: encryptSecret(String(config.password || '')),
    database: String(config.database || '').trim(),
    useSshTunnel: config.useSshTunnel === true,
    updatedAt: getCurrentTimestamp(),
    workspaceId: getActiveWorkspaceId()
  }
  const db = await getAppDatabase()
  upsertDatabaseConnectionRow(db, saved)
  persistAppDatabase(db)
  return saved
}

async function deleteStoredDatabaseConnection(id) {
  const db = await getAppDatabase()
  const connectionId = String(id || '')
  if (!queryAppValue(db, 'SELECT 1 FROM database_connections WHERE id = ? AND workspace_id = ? LIMIT 1', [connectionId, getActiveWorkspaceId()])) {
    throw new Error('数据库连接不存在或已被删除')
  }
  db.run('DELETE FROM database_connections WHERE id = ? AND workspace_id = ?', [connectionId, getActiveWorkspaceId()])
  persistAppDatabase(db)
  return true
}

function upsertObjectStorageConnectionRow(db, item = {}) {
  if (!item?.id) return
  const now = Number(item.updatedAt || item.createdAt || getCurrentTimestamp())
  const workspaceId = item.workspaceId || getActiveWorkspaceId()
  db.run(
    `INSERT OR REPLACE INTO object_storage_connections
      (id, workspace_id, name, provider, endpoint, region, bucket, access_key_id, encrypted_secret_key, options_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM object_storage_connections WHERE id = ?), ?), ?)`,
    [
      item.id,
      workspaceId,
      String(item.name || item.bucket || '对象存储连接').trim(),
      normalizeObjectStorageProvider(item.provider),
      String(item.endpoint || '').trim(),
      String(item.region || '').trim(),
      String(item.bucket || '').trim(),
      String(item.encryptedAccessKeyId || ''),
      String(item.encryptedSecretAccessKey || ''),
      JSON.stringify({ prefix: String(item.prefix || '').trim().replace(/^\/+/, '') }),
      item.id,
      now,
      now
    ]
  )
}

function migrateObjectStorageConnectionsToDatabase(db, list = []) {
  ;(Array.isArray(list) ? list : []).forEach(item => upsertObjectStorageConnectionRow(db, item))
}

async function listStoredObjectStorageConnections() {
  const db = await getAppDatabase()
  const workspaceId = getActiveWorkspaceId()
  const rows = queryAppRows(db, 'SELECT * FROM object_storage_connections WHERE workspace_id = ? ORDER BY updated_at DESC, name ASC', [workspaceId])
  return rows.map(objectStorageConnectionRowToLegacy)
}

async function saveStoredObjectStorageConnection(config = {}) {
  const id = config.id || `oss-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const provider = normalizeObjectStorageProvider(config.provider)
  const saved = {
    id,
    name: String(config.name || config.bucket || '对象存储连接').trim(),
    provider,
    region: String(config.region || '').trim(),
    endpoint: String(config.endpoint || '').trim(),
    bucket: String(config.bucket || '').trim(),
    prefix: String(config.prefix || '').trim().replace(/^\/+/, ''),
    encryptedAccessKeyId: encryptSecret(String(config.accessKeyId || '')),
    encryptedSecretAccessKey: encryptSecret(String(config.secretAccessKey || '')),
    updatedAt: getCurrentTimestamp(),
    workspaceId: getActiveWorkspaceId()
  }
  const db = await getAppDatabase()
  upsertObjectStorageConnectionRow(db, saved)
  persistAppDatabase(db)
  return saved
}

async function deleteStoredObjectStorageConnection(id) {
  const db = await getAppDatabase()
  const connectionId = String(id || '')
  if (!queryAppValue(db, 'SELECT 1 FROM object_storage_connections WHERE id = ? AND workspace_id = ? LIMIT 1', [connectionId, getActiveWorkspaceId()])) {
    throw new Error('对象存储连接不存在或已被删除')
  }
  db.run('DELETE FROM object_storage_connections WHERE id = ? AND workspace_id = ?', [connectionId, getActiveWorkspaceId()])
  persistAppDatabase(db)
  return true
}

function upsertNginxInstanceFromSettings(db, settings = {}) {
  const nginxHome = String(settings.nginxHome || '/etc/nginx').trim()
  const mainConfigPath = String(settings.mainConfigPath || `${nginxHome.replace(/\/+$/, '')}/nginx.conf`).trim()
  const id = createStableId('nginx', `${DEFAULT_WORKSPACE_ID}:${mainConfigPath}`)
  const now = getCurrentTimestamp()
  db.run(
    `INSERT OR REPLACE INTO nginx_instances
      (id, workspace_id, server_account_id, name, nginx_home, main_config_path, backup_dir, ssl_dir, scan_paths, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM nginx_instances WHERE id = ?), ?), ?)`,
    [
      id,
      DEFAULT_WORKSPACE_ID,
      'Nginx',
      nginxHome,
      mainConfigPath,
      String(settings.backupDir || '/www/backup/nginx').trim(),
      String(settings.sslDir || '/etc/letsencrypt/live').trim(),
      String(settings.scanPaths || '').trim(),
      id,
      now,
      now
    ]
  )
  return id
}

function upsertNginxSourceHistoryRow(db, nginxInstanceId, item = {}) {
  const pathValue = String(item.path || item.filePath || '').trim()
  if (!pathValue) return
  const id = createStableId('nginx-history', `${nginxInstanceId || 'default'}:${pathValue}`)
  db.run(
    'INSERT OR REPLACE INTO nginx_source_history (id, nginx_instance_id, path, title, opened_at) VALUES (?, ?, ?, ?, ?)',
    [id, nginxInstanceId || null, pathValue, String(item.title || item.name || path.basename(pathValue)).trim(), Number(item.openedAt || item.updatedAt || getCurrentTimestamp())]
  )
}

function nginxSslCertificateRowToLegacy(row = {}) {
  const data = parseJsonValue(row.data_json, {}) || {}
  return {
    id: row.id,
    source: row.source || 'manual',
    name: row.name || '',
    domains: String(row.domains || '').split(/[\s,;]+/).map(item => item.trim()).filter(Boolean),
    certbotDomain: row.certbot_domain || data.certbotDomain || '',
    certPath: row.cert_path || '',
    keyPath: row.key_path || '',
    targetDir: row.target_dir || data.targetDir || ''
  }
}

function upsertNginxSslCertificateRow(db, item = {}, nginxInstanceId = null) {
  const certPath = String(item.certPath || item.cert_path || '').trim()
  const keyPath = String(item.keyPath || item.key_path || '').trim()
  const domains = Array.isArray(item.domains) ? item.domains : String(item.domains || item.domainText || '').split(/[\s,;]+/).filter(Boolean)
  const certbotDomain = String(item.certbotDomain || domains[0] || '').trim()
  if (!item.id && !certPath && !keyPath && !certbotDomain) return
  const id = String(item.id || createStableId('ssl', `${certPath}:${keyPath}:${certbotDomain}`))
  const now = Number(item.updatedAt || item.createdAt || getCurrentTimestamp())
  db.run(
    `INSERT OR REPLACE INTO nginx_ssl_certificates
      (id, workspace_id, nginx_instance_id, name, domains, cert_path, key_path, target_dir, certbot_domain, issuer, expires_at, status, source, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM nginx_ssl_certificates WHERE id = ?), ?), ?)`,
    [
      id,
      DEFAULT_WORKSPACE_ID,
      nginxInstanceId,
      String(item.name || '').trim(),
      domains.join(' '),
      certPath,
      keyPath,
      String(item.targetDir || item.target_dir || '').trim(),
      certbotDomain,
      String(item.issuer || '').trim(),
      String(item.expiresAt || item.expires_at || '').trim(),
      String(item.status || 'unknown').trim(),
      item.source === 'certbot' ? 'certbot' : 'manual',
      JSON.stringify(item),
      id,
      now,
      now
    ]
  )
}

function migrateNginxSslCertificatesToDatabase(db, list = [], nginxInstanceId = null) {
  ;(Array.isArray(list) ? list : []).forEach(item => upsertNginxSslCertificateRow(db, item, nginxInstanceId))
}

async function readStoredNginxSslCertificatesFromDatabase() {
  const db = await getAppDatabase()
  const rows = queryAppRows(db, 'SELECT * FROM nginx_ssl_certificates WHERE workspace_id = ? ORDER BY updated_at DESC, name ASC', [DEFAULT_WORKSPACE_ID])
  if (rows.length) return rows.map(nginxSslCertificateRowToLegacy)
  const stored = await getAppStorageItem(NGINX_SSL_CERTIFICATES_STORAGE_KEY)
  const storedItems = Array.isArray(stored) ? stored : Array.isArray(stored?.items) ? stored.items : []
  if (storedItems.length) {
    migrateNginxSslCertificatesToDatabase(db, storedItems)
    persistAppDatabase(db)
    return storedItems
  }
  return []
}

async function writeStoredNginxSslCertificatesToDatabase(list = []) {
  const items = Array.isArray(list) ? list : []
  const db = await getAppDatabase()
  db.run('DELETE FROM nginx_ssl_certificates WHERE workspace_id = ?', [DEFAULT_WORKSPACE_ID])
  migrateNginxSslCertificatesToDatabase(db, items)
  persistAppDatabase(db)
  await setAppStorageItem(NGINX_SSL_CERTIFICATES_STORAGE_KEY, { version: 1, items })
  writeNginxSslCertificates(items)
  return items
}

function encryptSecret(value) {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(value, 'utf8').toString('base64')
  return safeStorage.encryptString(value).toString('base64')
}

function decryptSecret(value) {
  if (!value) return ''
  try {
    const buffer = Buffer.from(value, 'base64')
    if (!safeStorage.isEncryptionAvailable()) return buffer.toString('utf8')
    return safeStorage.decryptString(buffer)
  } catch (error) {
    return ''
  }
}

function sanitizeDatabaseConnection(item) {
  const type = String(item.type || 'mysql').trim().toLowerCase()
  const normalizedType = ['mysql', 'mariadb', 'sqlserver'].includes(type) ? type : 'mysql'
  return {
    ...item,
    type: normalizedType,
    port: Number(item.port || (normalizedType === 'sqlserver' ? 1433 : 3306)),
    password: decryptSecret(item.encryptedPassword),
    encryptedPassword: undefined
  }
}

function normalizeObjectStorageProvider(provider = '') {
  const value = String(provider || 'cos').trim().toLowerCase()
  if (['s3', 'minio'].includes(value)) return 's3'
  if (['aliyun', 'aliyun-oss', 'oss'].includes(value)) return 'aliyun-oss'
  if (['huawei', 'huawei-obs', 'obs'].includes(value)) return 'huawei-obs'
  if (['baidu', 'baidu-bos', 'bos'].includes(value)) return 'baidu-bos'
  return 'cos'
}

function sanitizeObjectStorageConnection(item = {}) {
  const provider = normalizeObjectStorageProvider(item.provider)
  return {
    ...item,
    provider,
    name: String(item.name || '对象存储连接').trim(),
    region: String(item.region || '').trim(),
    endpoint: String(item.endpoint || '').trim(),
    bucket: String(item.bucket || '').trim(),
    accessKeyId: decryptSecret(item.encryptedAccessKeyId),
    secretAccessKey: decryptSecret(item.encryptedSecretAccessKey),
    encryptedAccessKeyId: undefined,
    encryptedSecretAccessKey: undefined
  }
}

function normalizeObjectStorageIdentityEndpoint(value = '') {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function getObjectStorageConnectionIdentity(item = {}) {
  return [
    normalizeObjectStorageProvider(item.provider),
    String(item.bucket || '').trim().toLowerCase(),
    String(item.region || '').trim().toLowerCase(),
    normalizeObjectStorageIdentityEndpoint(item.endpoint)
  ].join('|')
}

function normalizeObjectStoragePrefix(value = '') {
  return String(value || '').trim().replace(/^\/+/, '')
}

function encodeObjectStorageQuery(value = '') {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function hashSha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hmacSha256(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding)
}

function inferObjectStorageRegion(connection = {}, host = '') {
  const configured = String(connection.region || '').trim()
  if (configured) return configured
  const hostname = String(host || '').toLowerCase()
  const cosMatch = hostname.match(/(?:^|\.)cos\.([a-z0-9-]+)\.myqcloud\.com$/)
  if (cosMatch) return cosMatch[1]
  const aliyunMatch = hostname.match(/(?:^|\.)oss-([a-z0-9-]+)\.aliyuncs\.com$/)
  if (aliyunMatch) return aliyunMatch[1]
  const huaweiMatch = hostname.match(/(?:^|\.)obs\.([a-z0-9-]+)\.myhuaweicloud\.com$/)
  if (huaweiMatch) return huaweiMatch[1]
  const baiduMatch = hostname.match(/(?:^|\.)([a-z0-9-]+)\.bcebos\.com$/)
  if (baiduMatch) return baiduMatch[1]
  const awsMatch = hostname.match(/(?:^|\.)s3[.-]([a-z0-9-]+)\.amazonaws\.com$/)
  if (awsMatch) return awsMatch[1]
  return 'us-east-1'
}

function buildObjectStorageBaseUrl(connection = {}) {
  const provider = normalizeObjectStorageProvider(connection.provider)
  const bucket = String(connection.bucket || '').trim()
  if (!bucket) throw new Error('Bucket 不能为空')
  let endpoint = String(connection.endpoint || '').trim()
  if (!endpoint) {
    if (provider === 'cos') {
      if (!connection.region) throw new Error('COS 连接需要填写 Region 或 Endpoint')
      endpoint = `cos.${String(connection.region).trim()}.myqcloud.com`
    } else if (provider === 'aliyun-oss') {
      if (!connection.region) throw new Error('阿里云 OSS 连接需要填写 Region 或 Endpoint')
      endpoint = `oss-${String(connection.region).trim()}.aliyuncs.com`
    } else if (provider === 'huawei-obs') {
      if (!connection.region) throw new Error('华为云 OBS 连接需要填写 Region 或 Endpoint')
      endpoint = `obs.${String(connection.region).trim()}.myhuaweicloud.com`
    } else if (provider === 'baidu-bos') {
      if (!connection.region) throw new Error('百度云 BOS 连接需要填写 Region 或 Endpoint')
      endpoint = `${String(connection.region).trim()}.bcebos.com`
    } else {
      endpoint = connection.region ? `s3.${String(connection.region).trim()}.amazonaws.com` : 's3.amazonaws.com'
    }
  }
  const url = new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`)
  const hostname = url.hostname.toLowerCase()
  const bucketPrefix = `${bucket.toLowerCase()}.`
  const shouldUseVirtualHost = hostname.startsWith(bucketPrefix) || ['cos', 'aliyun-oss', 'huawei-obs', 'baidu-bos'].includes(provider) || hostname.includes('amazonaws.com') || hostname.includes('myqcloud.com')
  if (shouldUseVirtualHost && !hostname.startsWith(bucketPrefix)) {
    url.hostname = `${bucket}.${url.hostname}`
  } else if (!shouldUseVirtualHost) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}`
  }
  return url
}

function buildCanonicalObjectStorageQuery(params = {}) {
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .sort()
    .map(key => `${encodeObjectStorageQuery(key)}=${encodeObjectStorageQuery(params[key])}`)
    .join('&')
}

function signObjectStorageRequest(connection, requestUrl, query = {}, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = inferObjectStorageRegion(connection, requestUrl.hostname)
  const service = 's3'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const payloadHash = options.payloadHash || 'UNSIGNED-PAYLOAD'
  const headers = {
    ...(options.headers || {}),
    'host': requestUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  }
  const canonicalHeaderEntries = Object.entries(headers)
    .map(([key, value]) => [String(key).toLowerCase(), String(value).trim().replace(/\s+/g, ' ')])
    .sort(([left], [right]) => left.localeCompare(right))
  const signedHeaders = canonicalHeaderEntries.map(([key]) => key).join(';')
  const canonicalUri = requestUrl.pathname.split('/').map(part => encodeObjectStorageQuery(decodeURIComponent(part))).join('/') || '/'
  const canonicalQuery = buildCanonicalObjectStorageQuery(query)
  const canonicalHeaders = `${canonicalHeaderEntries.map(([key, value]) => `${key}:${value}`).join('\n')}\n`
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashSha256Hex(canonicalRequest)].join('\n')
  const signingKey = hmacSha256(hmacSha256(hmacSha256(hmacSha256(`AWS4${connection.secretAccessKey}`, dateStamp), region), service), 'aws4_request')
  const signature = hmacSha256(signingKey, stringToSign, 'hex')
  return {
    queryString: canonicalQuery,
    headers: {
      ...(options.headers || {}),
      'Authorization': `AWS4-HMAC-SHA256 Credential=${connection.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate
    }
  }
}

function requestObjectStorage(requestUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = requestUrl.protocol === 'http:' ? http : https
    const request = transport.request(requestUrl, { method: options.method || 'GET', headers: options.headers || {}, timeout: options.timeout || 30000 }, response => {
      const statusCode = Number(response.statusCode || 0)
      const chunks = []
      const downloadTotal = Number(response.headers['content-length'] || 0)
      let outputStream = null
      if (options.outputPath && statusCode >= 200 && statusCode < 300) {
        outputStream = fs.createWriteStream(options.outputPath)
        outputStream.on('error', reject)
      }
      response.on('data', chunk => {
        if (outputStream) outputStream.write(chunk)
        else chunks.push(chunk)
        if (typeof options.onDownloadProgress === 'function') options.onDownloadProgress(Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk), downloadTotal)
      })
      response.on('end', () => {
        if (outputStream) {
          outputStream.end(() => resolve({ body: Buffer.alloc(0), headers: response.headers, statusCode }))
          return
        }
        const body = Buffer.concat(chunks)
        if (statusCode >= 200 && statusCode < 300) {
          resolve({ body, headers: response.headers, statusCode })
          return
        }
        const text = body.toString('utf8')
        const code = extractXmlTag(text, 'Code')
        const message = extractXmlTag(text, 'Message') || code || `HTTP ${statusCode}`
        const error = new Error(formatObjectStorageRequestError({
          code,
          message,
          statusCode,
          requestUrl,
          responseBody: text
        }))
        error.statusCode = statusCode
        error.body = text
        reject(error)
      })
    })
    request.on('timeout', () => request.destroy(new Error('对象存储请求超时')))
    request.on('error', error => reject(formatObjectStorageNetworkError(error, requestUrl)))
    if (options.body?.pipe) {
      if (typeof options.onUploadProgress === 'function') {
        options.body.on('data', chunk => options.onUploadProgress(Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk)))
      }
      options.body.pipe(request)
      return
    }
    if (options.body) {
      if (typeof options.onUploadProgress === 'function') options.onUploadProgress(Buffer.isBuffer(options.body) ? options.body.length : Buffer.byteLength(options.body))
      request.write(options.body)
    }
    request.end()
  })
}

function formatObjectStorageRequestError({ code = '', message = '', statusCode = 0, requestUrl = null } = {}) {
  const normalizedCode = String(code || '').trim()
  const normalizedMessage = String(message || '').trim()
  const host = requestUrl?.hostname || '未知地址'
  if (/nosuchbucket/i.test(normalizedCode)) return `对象存储请求失败：Bucket 不存在（${host}）。请确认 Bucket 名称和 Region 是否匹配。`
  if (/invalidaccesskeyid/i.test(normalizedCode)) return '对象存储认证失败：AccessKeyId / SecretId 无效，请检查密钥是否复制完整、是否已禁用。'
  if (/signaturedoesnotmatch|invalidsignature/i.test(normalizedCode)) return '对象存储认证失败：签名不匹配，请检查 SecretKey、Region、Endpoint 和系统时间。'
  if (/accessdenied|unauthorized/i.test(normalizedCode) || Number(statusCode) === 403) return `对象存储权限不足：服务器拒绝访问（${normalizedCode || `HTTP ${statusCode}`}）。请检查密钥对该 Bucket 的读取、写入权限。`
  if (/authorizationheadermalformed/i.test(normalizedCode)) return `对象存储请求参数错误：Region 不匹配（${normalizedMessage || normalizedCode}）。请填写 Bucket 实际所在地域。`
  return `对象存储请求失败：${normalizedCode ? `${normalizedCode}，` : ''}${normalizedMessage || `HTTP ${statusCode}`}（Endpoint：${host}）`
}

function formatObjectStorageNetworkError(error, requestUrl) {
  const code = String(error?.code || '').trim()
  const host = requestUrl?.hostname || '未知地址'
  if (code === 'ENOTFOUND') return new Error(`对象存储地址无法解析：${host}。请检查 Endpoint、网络或 DNS。`)
  if (code === 'ECONNREFUSED') return new Error(`对象存储连接被拒绝：${host}。请检查 Endpoint 端口和服务是否启动。`)
  if (code === 'ETIMEDOUT' || /timeout/i.test(String(error?.message || ''))) return new Error(`对象存储请求超时：${host}。请检查网络、防火墙或 Endpoint。`)
  return error
}

function requestObjectStorageXml(requestUrl, headers) {
  return new Promise((resolve, reject) => {
    requestObjectStorage(requestUrl, { method: 'GET', headers, timeout: 20000 })
      .then(result => resolve(result.body.toString('utf8')))
      .catch(error => {
        reject(error)
      })
  })
}

function inferObjectStorageContentType(name = '') {
  const ext = path.extname(String(name || '')).toLowerCase()
  const map = {
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac'
  }
  return map[ext] || 'application/octet-stream'
}

async function getObjectStorageConnectionById(id) {
  const connectionId = String(id || '').trim()
  if (!connectionId) throw new Error('对象存储请求缺少连接 ID，请先选择左侧的存储连接')
  const connection = (await listStoredObjectStorageConnections()).map(sanitizeObjectStorageConnection).find(item => item.id === connectionId)
  if (!connection) throw new Error(`对象存储连接不存在（ID：${connectionId}）。连接可能刚被删除或列表数据未刷新，请点击“刷新连接”后重试`)
  if (!connection.accessKeyId || !connection.secretAccessKey) throw new Error('对象存储密钥缺失，请重新保存连接')
  return connection
}

function buildObjectStorageObjectUrl(connection, key = '') {
  const requestUrl = buildObjectStorageBaseUrl(connection)
  const normalizedKey = normalizeObjectStoragePrefix(key)
  if (!normalizedKey) return requestUrl
  const encodedKey = normalizedKey.split('/').map(part => encodeObjectStorageQuery(part)).join('/')
  requestUrl.pathname = `${requestUrl.pathname.replace(/\/+$/, '')}/${encodedKey}`
  return requestUrl
}

function signAndRequestObjectStorage(connection, requestUrl, options = {}) {
  const query = options.query || {}
  const signed = signObjectStorageRequest(connection, requestUrl, query, options)
  requestUrl.search = signed.queryString
  return requestObjectStorage(requestUrl, { ...options, headers: { ...(options.headers || {}), ...signed.headers } })
}

function buildObjectStoragePresignedUrl(connection, requestUrl, expires = 3600) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = inferObjectStorageRegion(connection, requestUrl.hostname)
  const service = 's3'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const credential = `${connection.accessKeyId}/${credentialScope}`
  const signedHeaders = 'host'
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.min(Math.max(Number(expires || 3600), 60), 7 * 24 * 60 * 60)),
    'X-Amz-SignedHeaders': signedHeaders
  }
  const canonicalUri = requestUrl.pathname.split('/').map(part => encodeObjectStorageQuery(decodeURIComponent(part))).join('/') || '/'
  const canonicalQuery = buildCanonicalObjectStorageQuery(query)
  const canonicalHeaders = `host:${requestUrl.host}\n`
  const canonicalRequest = ['GET', canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashSha256Hex(canonicalRequest)].join('\n')
  const signingKey = hmacSha256(hmacSha256(hmacSha256(hmacSha256(`AWS4${connection.secretAccessKey}`, dateStamp), region), service), 'aws4_request')
  const signature = hmacSha256(signingKey, stringToSign, 'hex')
  requestUrl.search = `${canonicalQuery}&X-Amz-Signature=${encodeObjectStorageQuery(signature)}`
  return requestUrl.toString()
}

async function objectStorageObjectExists(connection, key) {
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  try {
    await signAndRequestObjectStorage(connection, requestUrl, { method: 'HEAD', timeout: 20000 })
    return true
  } catch (error) {
    if ([404, 403].includes(Number(error?.statusCode)) && /NoSuchKey|Not Found|HTTP 404|404/i.test(String(error?.message || error?.body || ''))) return false
    if (Number(error?.statusCode) === 404) return false
    throw error
  }
}

async function objectStoragePrefixExists(connection, prefix) {
  const normalized = normalizeObjectStoragePrefix(prefix).replace(/\/+$/, '') + '/'
  if (await objectStorageObjectExists(connection, normalized)) return true
  const keys = await listObjectStorageKeysByPrefix(connection, normalized)
  return keys.length > 0
}

async function confirmObjectStorageOverwrite(event, { title, message, multiple = false, directory = false } = {}) {
  const win = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null
  const buttons = multiple
    ? ['全部覆盖', '全部跳过', '取消上传']
    : directory
      ? ['继续', '取消']
      : ['覆盖', '跳过', '取消']
  const result = await dialog.showMessageBox(win || undefined, {
    type: 'warning',
    title: title || '对象已存在',
    message: message || '目标对象已存在，请选择如何处理。',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true
  })
  if (multiple) return result.response === 0 ? 'overwrite' : result.response === 1 ? 'skip' : 'cancel'
  if (directory) return result.response === 0 ? 'overwrite' : 'cancel'
  return result.response === 0 ? 'overwrite' : result.response === 1 ? 'skip' : 'cancel'
}

async function confirmFilePasteConflict(event, { conflicts = [], targetDir = '/', multiple = false } = {}) {
  const win = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null
  const buttons = multiple
    ? ['全部覆盖', '全部跳过', '全部重命名为副本', '取消']
    : ['覆盖', '跳过', '重命名为副本', '取消']
  const preview = conflicts.slice(0, 5).map(item => `- ${item}`).join('\n')
  const moreText = conflicts.length > 5 ? `\n... 另有 ${conflicts.length - 5} 个同名项目` : ''
  const result = await dialog.showMessageBox(win || undefined, {
    type: 'warning',
    title: '粘贴时发现同名项目',
    message: `目标目录“${targetDir}”中已存在同名项目：\n${preview}${moreText}\n\n请选择处理方式。`,
    buttons,
    defaultId: 2,
    cancelId: buttons.length - 1,
    noLink: true
  })
  if (result.response === 0) return 'overwrite'
  if (result.response === 1) return 'skip'
  if (result.response === 2) return 'rename'
  return 'cancel'
}

function joinObjectStorageKey(prefix = '', name = '') {
  const base = normalizeObjectStoragePrefix(prefix).replace(/\/+$/, '')
  const leaf = String(name || '').replace(/^\/+/, '')
  return base ? `${base}/${leaf}` : leaf
}

function getObjectStorageBasename(key = '') {
  const normalized = String(key || '').replace(/\/+$/, '')
  return normalized.split('/').filter(Boolean).pop() || 'object'
}

function getSafeObjectStorageLeafName(value = '') {
  return String(value || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+$/, '') || 'object'
}

async function collectObjectStorageUploadEntries(sourcePath, prefix = '') {
  const targetPath = normalizeLocalPath(sourcePath)
  const stats = await fs.promises.stat(targetPath)
  const rootName = getSafeObjectStorageLeafName(path.basename(targetPath))
  if (stats.isFile()) return [{ filePath: targetPath, relativeKey: prefix || rootName, size: stats.size }]
  if (!stats.isDirectory()) return []

  const entries = []
  async function walk(currentPath, relativeDir) {
    const children = await fs.promises.readdir(currentPath, { withFileTypes: true })
    if (!children.length) {
      entries.push({ relativeKey: `${relativeDir.replace(/\/+$/, '')}/`, isDirectory: true, size: 0 })
      return
    }
    for (const child of children) {
      const childPath = path.join(currentPath, child.name)
      const childRelative = `${relativeDir.replace(/\/+$/, '')}/${child.name}`.replace(/\\/g, '/')
      if (child.isDirectory()) await walk(childPath, childRelative)
      else if (child.isFile()) entries.push({ filePath: childPath, relativeKey: childRelative, size: (await fs.promises.stat(childPath)).size })
    }
  }
  await walk(targetPath, prefix || rootName)
  return entries
}

function emitObjectStorageUploadProgress(event, progressId, payload = {}) {
  if (!progressId || !event?.sender) return
  event.sender.send('object-storage:upload-progress', { id: progressId, ...payload })
}

function emitObjectStorageDownloadProgress(event, progressId, payload = {}) {
  if (!progressId || !event?.sender) return
  event.sender.send('object-storage:download-progress', { id: progressId, ...payload })
}

function createObjectStorageProgressEmitter(emit, event, progressId) {
  let lastProgressAt = 0
  return (payload = {}) => {
    const now = Date.now()
    if (payload.phase === 'progress' && now - lastProgressAt < OBJECT_STORAGE_PROGRESS_INTERVAL_MS) return
    if (payload.phase === 'progress') lastProgressAt = now
    emit(event, progressId, payload)
  }
}

function createObjectStorageDownloadReporter(event, payload = {}) {
  const progressId = String(payload.progressId || '').trim()
  let currentLoadedBytes = 0
  const emit = createObjectStorageProgressEmitter(emitObjectStorageDownloadProgress, event, progressId)
  return {
    progressId,
    file(meta = {}) {
      currentLoadedBytes = 0
      emit({ phase: 'file', loadedBytes: 0, ...meta })
    },
    part(delta, totalBytes = 0, meta = {}) {
      currentLoadedBytes += Number(delta || 0)
      emit({ phase: 'progress', loadedBytes: currentLoadedBytes, totalBytes, ...meta })
    },
    done(meta = {}) {
      emit({ phase: 'done', ...meta })
    },
    error(error) {
      emit({ phase: 'error', message: String(error?.message || error || '下载失败') })
    }
  }
}

function createObjectStorageUploadReporter(event, payload = {}, totalBytes = 0) {
  const progressId = String(payload.progressId || '').trim()
  let loadedBytes = 0
  const emit = createObjectStorageProgressEmitter(emitObjectStorageUploadProgress, event, progressId)
  return {
    progressId,
    start(meta = {}) {
      emit({ phase: 'start', loadedBytes, totalBytes, ...meta })
    },
    file(meta = {}) {
      emit({ phase: 'file', loadedBytes, totalBytes, ...meta })
    },
    part(delta, meta = {}) {
      loadedBytes += Number(delta || 0)
      emit({ phase: 'progress', loadedBytes, totalBytes, ...meta })
    },
    done(meta = {}) {
      emit({ phase: 'done', loadedBytes: totalBytes || loadedBytes, totalBytes, ...meta })
    },
    error(error) {
      emit({ phase: 'error', loadedBytes, totalBytes, message: String(error?.message || error || '上传失败') })
    }
  }
}

async function putObjectStorageFile(connection, key, filePath, size, reporter = null) {
  if (Number(size || 0) >= OBJECT_STORAGE_MULTIPART_THRESHOLD) {
    return multipartUploadObjectStorageFile(connection, key, filePath, size, reporter)
  }
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(size),
      'Content-Type': inferObjectStorageContentType(filePath)
    },
    body: fs.createReadStream(filePath),
    onUploadProgress: delta => reporter?.part(delta, { key, fileName: path.basename(filePath), multipart: false }),
    timeout: 120000
  })
}

async function initiateObjectStorageMultipartUpload(connection, key, filePath) {
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  const result = await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'POST',
    query: { uploads: '' },
    headers: {
      'Content-Length': '0',
      'Content-Type': inferObjectStorageContentType(filePath)
    },
    body: Buffer.alloc(0),
    timeout: 30000
  })
  const uploadId = extractXmlTag(result.body.toString('utf8'), 'UploadId')
  if (!uploadId) throw new Error('初始化分片上传失败：缺少 UploadId')
  return uploadId
}

async function uploadObjectStoragePart(connection, key, uploadId, partNumber, filePath, start, end, reporter = null) {
  const size = end - start + 1
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  const result = await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'PUT',
    query: { partNumber: String(partNumber), uploadId },
    headers: { 'Content-Length': String(size) },
    body: fs.createReadStream(filePath, { start, end }),
    onUploadProgress: delta => reporter?.part(delta, { key, fileName: path.basename(filePath), multipart: true, partNumber }),
    timeout: 120000
  })
  const etag = String(result.headers.etag || '').trim()
  if (!etag) throw new Error(`上传第 ${partNumber} 个分片失败：缺少 ETag`)
  return { partNumber, etag }
}

async function completeObjectStorageMultipartUpload(connection, key, uploadId, parts) {
  const xml = [
    '<CompleteMultipartUpload>',
    ...parts.map(part => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`),
    '</CompleteMultipartUpload>'
  ].join('')
  const body = Buffer.from(xml, 'utf8')
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'POST',
    query: { uploadId },
    headers: {
      'Content-Length': String(body.length),
      'Content-Type': 'application/xml; charset=utf-8'
    },
    body,
    timeout: 60000
  })
}

async function abortObjectStorageMultipartUpload(connection, key, uploadId) {
  if (!uploadId) return
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  try {
    await signAndRequestObjectStorage(connection, requestUrl, {
      method: 'DELETE',
      query: { uploadId },
      timeout: 30000
    })
  } catch (error) {}
}

async function multipartUploadObjectStorageFile(connection, key, filePath, size, reporter = null) {
  const uploadId = await initiateObjectStorageMultipartUpload(connection, key, filePath)
  const parts = []
  try {
    const partCount = Math.ceil(size / OBJECT_STORAGE_MULTIPART_PART_SIZE)
    for (let index = 0; index < partCount; index += 1) {
      const partNumber = index + 1
      const start = index * OBJECT_STORAGE_MULTIPART_PART_SIZE
      const end = Math.min(size - 1, start + OBJECT_STORAGE_MULTIPART_PART_SIZE - 1)
      parts.push(await uploadObjectStoragePart(connection, key, uploadId, partNumber, filePath, start, end, reporter))
    }
    await completeObjectStorageMultipartUpload(connection, key, uploadId, parts)
  } catch (error) {
    await abortObjectStorageMultipartUpload(connection, key, uploadId)
    throw error
  }
}

async function putObjectStorageDirectoryPlaceholder(connection, key) {
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': '0',
      'Content-Type': 'application/x-directory'
    },
    body: Buffer.alloc(0)
  })
}

async function ensureObjectStoragePrefix(connection, prefix) {
  const normalizedPrefix = normalizeObjectStoragePrefix(prefix).replace(/\/+$/, '')
  if (!normalizedPrefix) return { exists: true, created: false }
  const key = `${normalizedPrefix}/`
  if (await objectStoragePrefixExists(connection, normalizedPrefix)) return { exists: true, created: false }
  await putObjectStorageDirectoryPlaceholder(connection, key)
  return { exists: false, created: true }
}

async function resolveObjectStorageUploadConflicts(event, connection, entries) {
  const conflicts = []
  for (const entry of entries) {
    if (!entry?.key) continue
    if (await objectStorageObjectExists(connection, entry.key)) conflicts.push(entry)
  }
  if (!conflicts.length) return { action: 'none', entries }
  const previewKeys = conflicts.slice(0, 5).map(item => `- ${item.key}`).join('\n')
  const moreText = conflicts.length > 5 ? `\n... 另有 ${conflicts.length - 5} 个同名对象` : ''
  const action = await confirmObjectStorageOverwrite(event, {
    title: '发现同名对象',
    message: `发现 ${conflicts.length} 个同名对象：\n${previewKeys}${moreText}\n\n覆盖会替换云端已有对象；跳过会保留云端对象。`,
    multiple: conflicts.length > 1
  })
  if (action === 'cancel') return { action, entries: [] }
  if (action === 'skip') {
    const conflictKeys = new Set(conflicts.map(item => item.key))
    return { action, entries: entries.filter(item => !conflictKeys.has(item.key)), skipped: conflicts.length }
  }
  return { action, entries, overwritten: conflicts.length }
}

async function uploadObjectStorageFiles(payload = {}, event = null) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const preparedPaths = Array.isArray(payload.paths) ? payload.paths.map(item => String(item || '').trim()).filter(Boolean) : []
  const result = preparedPaths.length
    ? { canceled: false, filePaths: preparedPaths }
    : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
  if (result.canceled || !result.filePaths.length) return { uploaded: [] }
  const allEntries = []
  for (const filePath of result.filePaths) {
    allEntries.push(...(await collectObjectStorageUploadEntries(filePath)).map(entry => ({
      ...entry,
      key: joinObjectStorageKey(payload.prefix, entry.relativeKey)
    })))
  }
  if (allEntries.length && payload.prefix) await ensureObjectStoragePrefix(connection, payload.prefix)
  const conflictResult = await resolveObjectStorageUploadConflicts(event, connection, allEntries)
  if (conflictResult.action === 'cancel') return { uploaded: [], canceled: true }
  const uploadEntries = conflictResult.entries
  if (!uploadEntries.length) return { uploaded: [], skipped: conflictResult.skipped || 0 }
  const totalBytes = uploadEntries.reduce((sum, entry) => sum + Number(entry.size || 0), 0)
  const reporter = createObjectStorageUploadReporter(event, payload, totalBytes)
  const uploaded = []
  reporter.start({ totalItems: uploadEntries.length })
  try {
    for (const entry of uploadEntries) {
      const key = entry.key
      reporter.file({ key, fileName: entry.filePath ? path.basename(entry.filePath) : getObjectStorageBasename(key), size: entry.size || 0 })
      if (entry.isDirectory) await putObjectStorageDirectoryPlaceholder(connection, key)
      else await putObjectStorageFile(connection, key, entry.filePath, entry.size, reporter)
      uploaded.push({ key, size: entry.size || 0 })
    }
    reporter.done({ totalItems: uploadEntries.length })
  } catch (error) {
    reporter.error(error)
    throw error
  }
  return { uploaded, skipped: conflictResult.skipped || 0, overwritten: conflictResult.overwritten || 0 }
}

async function createObjectStorageDirectory(payload = {}) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const name = String(payload.name || '').trim().replace(/^\/+|\/+$/g, '')
  if (!name) throw new Error('目录名称不能为空')
  const key = `${joinObjectStorageKey(payload.prefix, name).replace(/\/+$/, '')}/`
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': '0',
      'Content-Type': 'application/x-directory'
    },
    body: Buffer.alloc(0)
  })
  return { key }
}

async function listObjectStorageKeysByPrefix(connection, prefix = '') {
  const keys = []
  let continuationToken = ''
  do {
    const requestUrl = buildObjectStorageBaseUrl(connection)
    const query = {
      'list-type': '2',
      'prefix': normalizeObjectStoragePrefix(prefix),
      'max-keys': '1000'
    }
    if (continuationToken) query['continuation-token'] = continuationToken
    const signed = signObjectStorageRequest(connection, requestUrl, query)
    requestUrl.search = signed.queryString
    const xml = await requestObjectStorageXml(requestUrl, signed.headers)
    const parsed = parseObjectStorageListXml(xml, '')
    keys.push(...parsed.objects.map(item => item.key).filter(Boolean))
    continuationToken = parsed.isTruncated ? parsed.nextContinuationToken : ''
  } while (continuationToken)
  return keys
}

async function deleteObjectStorageKeys(connection, keys = []) {
  const normalizedKeys = Array.from(new Set(keys.map(item => String(item || '').trim()).filter(Boolean)))
  for (const key of normalizedKeys) {
    const requestUrl = buildObjectStorageObjectUrl(connection, key)
    await signAndRequestObjectStorage(connection, requestUrl, { method: 'DELETE' })
  }
  return normalizedKeys
}

async function deleteObjectStorageObjects(payload = {}) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const keys = Array.isArray(payload.keys) ? payload.keys.map(item => String(item || '').trim()).filter(Boolean) : []
  const prefixes = Array.isArray(payload.prefixes) ? payload.prefixes.map(item => normalizeObjectStoragePrefix(item)).filter(Boolean) : []
  for (const prefix of prefixes) {
    const prefixKeys = await listObjectStorageKeysByPrefix(connection, prefix)
    keys.push(...(prefixKeys.length ? prefixKeys : [prefix]))
  }
  if (!keys.length) throw new Error('请选择要删除的对象')
  const deleted = await deleteObjectStorageKeys(connection, keys)
  return { deleted }
}

function normalizeObjectStorageAcl(value = '') {
  const acl = String(value || '').trim().toLowerCase()
  if (['private', 'public-read', 'custom-user'].includes(acl)) return acl
  throw new Error('暂只支持私有读写、公有读私有写和指定用户授权')
}

function buildCosGrantHeaders(connection, grant = {}, grantUsers = []) {
  const users = Array.isArray(grantUsers) && grantUsers.length ? grantUsers : (grant?.targetUin ? [grant] : [])
  if (!users.length) return {}
  if (connection.provider !== 'cos') throw new Error('用户访问权限当前仅支持腾讯云 COS')
  const readGrants = []
  const writeGrants = []
  const readAcpGrants = []
  const writeAcpGrants = []
  const fullControlGrants = []
  for (const item of users) {
    const ownerUin = String(item?.ownerUin || grant.ownerUin || '').trim()
    const targetUin = String(item?.targetUin || '').trim()
    if (!/^\d{5,}$/.test(ownerUin)) throw new Error('当前账号 ID 格式不正确')
    if (!/^\d{5,}$/.test(targetUin)) throw new Error('被授权用户账号 ID 格式不正确')
    const permissions = Array.isArray(item?.permissions) && item.permissions.length ? item.permissions : [item?.permission || 'read']
    const value = `id="qcs::cam::uin/${ownerUin}:uin/${targetUin}"`
    const normalizedPermissions = permissions.map(permission => String(permission || '').trim().toLowerCase()).filter(Boolean)
    if (normalizedPermissions.includes('full-control')) {
      fullControlGrants.push(value)
      continue
    }
    if (normalizedPermissions.includes('read')) readGrants.push(value)
    if (normalizedPermissions.includes('write')) writeGrants.push(value)
    if (normalizedPermissions.includes('read-acp')) readAcpGrants.push(value)
    if (normalizedPermissions.includes('write-acp')) writeAcpGrants.push(value)
  }
  const headers = {}
  if (readGrants.length) headers['x-cos-grant-read'] = readGrants.join(',')
  if (writeGrants.length) headers['x-cos-grant-write'] = writeGrants.join(',')
  if (readAcpGrants.length) headers['x-cos-grant-read-acp'] = readAcpGrants.join(',')
  if (writeAcpGrants.length) headers['x-cos-grant-write-acp'] = writeAcpGrants.join(',')
  if (fullControlGrants.length) headers['x-cos-grant-full-control'] = fullControlGrants.join(',')
  return headers
}

async function putObjectStorageObjectAcl(connection, key, acl, grant = {}, grantUsers = []) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) throw new Error('对象 Key 不能为空')
  const requestUrl = buildObjectStorageObjectUrl(connection, normalizedKey)
  const normalizedAcl = acl === 'custom-user' ? 'private' : acl
  const aclHeaders = { [connection.provider === 'cos' ? 'x-cos-acl' : 'x-amz-acl']: normalizedAcl }
  const grantHeaders = buildCosGrantHeaders(connection, grant, grantUsers)
  await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'PUT',
    query: { acl: '' },
    headers: {
      ...aclHeaders,
      ...grantHeaders,
      'Content-Length': '0'
    },
    body: Buffer.alloc(0),
    timeout: 30000
  })
  return normalizedKey
}

async function setObjectStorageAcl(payload = {}) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const acl = normalizeObjectStorageAcl(payload.acl)
  const grant = payload.grant && typeof payload.grant === 'object' ? payload.grant : {}
  const grantUsers = Array.isArray(payload.grantUsers) ? payload.grantUsers : []
  const keys = Array.isArray(payload.keys) ? payload.keys.map(item => String(item || '').trim()).filter(Boolean) : []
  const prefixes = Array.isArray(payload.prefixes) ? payload.prefixes.map(item => normalizeObjectStoragePrefix(item)).filter(Boolean) : []
  for (const prefix of prefixes) {
    const prefixKeys = await listObjectStorageKeysByPrefix(connection, prefix)
    keys.push(...(prefixKeys.length ? prefixKeys : [prefix]))
  }
  const normalizedKeys = Array.from(new Set(keys))
  if (!normalizedKeys.length) throw new Error('请选择要设置权限的对象')
  const updated = []
  for (const key of normalizedKeys) {
    updated.push(await putObjectStorageObjectAcl(connection, key, acl, grant, grantUsers))
  }
  return { acl, grantPermission: grant.permission || '', grantUsers, updated }
}

function getObjectStoragePermissionLabel(permission = '') {
  const value = String(permission || '').toUpperCase()
  if (value === 'FULL_CONTROL') return '完全控制'
  if (value === 'READ') return '读取对象'
  if (value === 'WRITE') return '写入对象'
  if (value === 'READ_ACP') return '读取权限'
  if (value === 'WRITE_ACP') return '修改权限'
  return permission
}

function parseObjectStorageAclXml(xml = '') {
  const grants = []
  const ownerBlock = String(xml || '').match(/<Owner>([\s\S]*?)<\/Owner>/)?.[1] || ''
  const ownerId = extractXmlTag(ownerBlock, 'ID')
  for (const match of String(xml || '').matchAll(/<Grant>([\s\S]*?)<\/Grant>/g)) {
    const block = match[1]
    const id = extractXmlTag(block, 'ID')
    const permission = extractXmlTag(block, 'Permission')
    const uri = extractXmlTag(block, 'URI')
    const targetUinMatch = String(id || '').match(/:uin\/(\d+)$/) || String(id || '').match(/uin\/(\d+)$/)
    grants.push({
      permission,
      permissionLabel: getObjectStoragePermissionLabel(permission),
      uri,
      id,
      isOwnerGrant: Boolean(ownerId && id === ownerId),
      accountId: targetUinMatch?.[1] || id,
      displayName: extractXmlTag(block, 'DisplayName')
    })
  }
  const publicRead = grants.some(item => /AllUsers/i.test(item.uri) && ['READ', 'FULL_CONTROL'].includes(String(item.permission || '').toUpperCase()))
  const acl = publicRead ? 'public-read' : (grants.length > 1 ? 'custom' : 'private')
  return {
    acl,
    label: acl === 'public-read' ? '公有读私有写' : (acl === 'custom' ? '自定义授权' : '私有读写'),
    ownerId,
    grants
  }
}

async function getObjectStorageAcl(payload = {}) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const key = String(payload.key || '').trim()
  if (!key) throw new Error('对象 Key 不能为空')
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  const signed = signObjectStorageRequest(connection, requestUrl, { acl: '' }, { method: 'GET' })
  requestUrl.search = signed.queryString
  const xml = await requestObjectStorageXml(requestUrl, signed.headers)
  return { key, ...parseObjectStorageAclXml(xml) }
}

async function createObjectStorageSignedUrl(payload = {}) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const key = String(payload.key || '').trim()
  if (!key) throw new Error('对象 Key 不能为空')
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  return { key, url: buildObjectStoragePresignedUrl(connection, requestUrl, payload.expires || 3600), expires: Math.min(Math.max(Number(payload.expires || 3600), 60), 7 * 24 * 60 * 60) }
}

async function downloadObjectStorageObject(payload = {}, event = null) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const key = String(payload.key || '').trim()
  if (!key) throw new Error('对象 Key 不能为空')
  const saveResult = await dialog.showSaveDialog({ defaultPath: getObjectStorageBasename(key) })
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true }
  const reporter = createObjectStorageDownloadReporter(event, payload)
  reporter.file({ key, fileName: payload.name || getObjectStorageBasename(key), totalBytes: Number(payload.size || 0) })
  await downloadObjectStorageFileToPath(connection, key, saveResult.filePath, reporter, { name: payload.name || getObjectStorageBasename(key), size: Number(payload.size || 0) })
  reporter.done({ key })
  return { filePath: saveResult.filePath }
}

async function downloadObjectStorageFileToPath(connection, key, targetPath, reporter = null, item = {}) {
  ensureDirExists(path.dirname(targetPath))
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  const result = await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'GET',
    timeout: 120000,
    onDownloadProgress: (delta, responseTotal) => reporter?.part(delta, Number(item.size || responseTotal || 0), { key, fileName: item.name || getObjectStorageBasename(key) })
  })
  fs.writeFileSync(targetPath, result.body)
  return targetPath
}

async function downloadObjectStorageItemToDirectory(connection, item = {}, localDir, reporter = null) {
  const type = item.type === 'folder' ? 'folder' : 'file'
  const key = String(item.key || '').trim()
  if (!key) throw new Error('对象 Key 不能为空')
  if (type === 'folder' || key.endsWith('/')) {
    const sourcePrefix = normalizeObjectStoragePrefix(key).replace(/\/+$/, '') + '/'
    const folderName = getSafeObjectStorageLeafName(item.name || getObjectStorageBasename(sourcePrefix))
    const destinationRoot = resolveUniqueLocalPath(localDir, folderName)
    fs.mkdirSync(destinationRoot, { recursive: true })
    const keys = await listObjectStorageKeysByPrefix(connection, sourcePrefix)
    for (const objectKey of keys) {
      const relative = objectKey.slice(sourcePrefix.length)
      if (!relative) continue
      const targetPath = path.join(destinationRoot, ...relative.split('/').filter(Boolean))
      reporter?.file({ key: objectKey, fileName: getObjectStorageBasename(objectKey), totalBytes: 0 })
      await downloadObjectStorageFileToPath(connection, objectKey, targetPath, reporter, { name: getObjectStorageBasename(objectKey) })
    }
    return destinationRoot
  }
  const fileName = getSafeObjectStorageLeafName(item.name || getObjectStorageBasename(key))
  const localPath = resolveUniqueLocalPath(localDir, fileName)
  reporter?.file({ key, fileName, totalBytes: Number(item.size || 0) })
  await downloadObjectStorageFileToPath(connection, key, localPath, reporter, { name: fileName, size: Number(item.size || 0) })
  return localPath
}

async function downloadObjectStorageObjectsToDirectory(payload = {}, event = null) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const localDir = normalizeLocalPath(payload.localDir)
  const stats = fs.statSync(localDir)
  if (!stats.isDirectory()) throw new Error('本地目标不是目录')
  const items = Array.isArray(payload.items) ? payload.items : []
  const normalizedItems = items.map(item => ({
    key: String(item?.key || '').trim(),
    type: item?.type === 'folder' ? 'folder' : 'file',
    name: String(item?.name || '').trim(),
    size: Number(item?.size || 0)
  })).filter(item => item.key)
  if (!normalizedItems.length) throw new Error('请选择要下载的对象')
  const reporter = createObjectStorageDownloadReporter(event, payload)
  const paths = []
  try {
    for (const item of normalizedItems) {
      paths.push(await downloadObjectStorageItemToDirectory(connection, item, localDir, reporter))
    }
    reporter.done({ totalItems: normalizedItems.length })
  } catch (error) {
    reporter.error(error)
    throw error
  }
  return { paths }
}

async function startObjectStorageNativeDrag(event, payload = {}) {
  const dragRoot = path.join(app.getPath('temp'), `linux-visual-object-drag-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dragRoot, { recursive: true })
  const result = await downloadObjectStorageObjectsToDirectory({ ...payload, localDir: dragRoot }, event)
  const dragPath = result.paths.length === 1 ? result.paths[0] : dragRoot
  const iconPath = path.join(__dirname, 'assets', 'app-icon.png')
  event.sender.startDrag({
    file: dragPath,
    icon: nativeImage.createFromPath(iconPath)
  })
  scheduleObjectStorageDragTempCleanup(dragRoot)
  return { path: dragPath, count: result.paths.length }
}

async function renameObjectStorageObject(payload = {}, event = null) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const sourceKey = String(payload.sourceKey || '').trim()
  const targetKey = normalizeObjectStoragePrefix(payload.targetKey)
  if (!sourceKey || !targetKey) throw new Error('源对象和目标对象不能为空')
  if (sourceKey === targetKey) return { key: targetKey }
  if (sourceKey.endsWith('/') || targetKey.endsWith('/')) {
    const sourcePrefix = normalizeObjectStoragePrefix(sourceKey).replace(/\/+$/, '') + '/'
    const targetPrefix = targetKey.replace(/\/+$/, '') + '/'
    if (sourcePrefix === targetPrefix) return { key: targetPrefix }
    if (targetPrefix.startsWith(sourcePrefix)) throw new Error('不能将目录重命名到自身子目录下')
    if (await objectStoragePrefixExists(connection, targetPrefix)) {
      const action = await confirmObjectStorageOverwrite(event, {
        title: '目标目录已存在',
        message: `目标目录「${targetPrefix}」已存在。\n继续会合并目录内容，并覆盖同名对象；未同名的已有对象会保留。`,
        directory: true
      })
      if (action === 'cancel') return { canceled: true, key: sourcePrefix }
    }
    const sourceKeys = await listObjectStorageKeysByPrefix(connection, sourcePrefix)
    const keys = sourceKeys.length ? sourceKeys : [sourcePrefix]
    for (const key of keys) {
      const targetObjectKey = `${targetPrefix}${key.slice(sourcePrefix.length)}`
      const requestUrl = buildObjectStorageObjectUrl(connection, targetObjectKey)
      const encodedSource = `/${connection.bucket}/${key.split('/').map(part => encodeObjectStorageQuery(part)).join('/')}`
      await signAndRequestObjectStorage(connection, requestUrl, {
        method: 'PUT',
        headers: {
          'x-amz-copy-source': encodedSource,
          'Content-Length': '0'
        },
        body: Buffer.alloc(0)
      })
    }
    await deleteObjectStorageKeys(connection, keys)
    return { key: targetPrefix, renamed: keys.length }
  }
  if (await objectStorageObjectExists(connection, targetKey)) {
    const action = await confirmObjectStorageOverwrite(event, {
      title: '目标对象已存在',
      message: `目标对象「${targetKey}」已存在。\n继续会覆盖云端已有对象。`
    })
    if (action !== 'overwrite') return { canceled: true, key: sourceKey }
  }
  const requestUrl = buildObjectStorageObjectUrl(connection, targetKey)
  const encodedSource = `/${connection.bucket}/${sourceKey.split('/').map(part => encodeObjectStorageQuery(part)).join('/')}`
  await signAndRequestObjectStorage(connection, requestUrl, {
    method: 'PUT',
    headers: {
      'x-amz-copy-source': encodedSource,
      'Content-Length': '0'
    },
    body: Buffer.alloc(0)
  })
  await deleteObjectStorageKeys(connection, [sourceKey])
  return { key: targetKey }
}

async function previewObjectStorageObject(payload = {}) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const key = String(payload.key || '').trim()
  if (!key) throw new Error('对象 Key 不能为空')
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  const headResult = await signAndRequestObjectStorage(connection, buildObjectStorageObjectUrl(connection, key), { method: 'HEAD', timeout: 20000 })
  const contentType = String(headResult.headers['content-type'] || inferObjectStorageContentType(key))
  const contentLength = Number(headResult.headers['content-length'] || 0)
  const mediaDescriptor = getObjectStoragePreviewMediaDescriptor(key, contentType)
  if (mediaDescriptor) {
    assertPreviewMediaSize(contentLength)
    const tempPath = registerPreviewTempFile(createTempFilePath(key))
    try {
      await signAndRequestObjectStorage(connection, requestUrl, { method: 'GET', timeout: 300000, outputPath: tempPath })
      const stats = fs.existsSync(tempPath) ? fs.statSync(tempPath) : null
      assertPreviewMediaSize(stats?.size || contentLength)
      return {
        key,
        type: mediaDescriptor.kind,
        contentType: mediaDescriptor.mimeType || contentType,
        mediaUrl: registerPreviewMediaResource(tempPath, mediaDescriptor.mimeType || contentType),
        tempPath,
        size: stats?.size || contentLength
      }
    } catch (error) {
      cleanupPreviewTempFile(tempPath)
      throw error
    }
  }
  const result = await signAndRequestObjectStorage(connection, requestUrl, { method: 'GET', timeout: 60000 })
  const maxPreviewSize = 8 * 1024 * 1024
  if (result.body.length > maxPreviewSize) throw new Error('文件超过 8MB，暂不支持预览')
  if (contentType.startsWith('image/')) {
    return { key, type: 'image', contentType, dataUrl: `data:${contentType};base64,${result.body.toString('base64')}` }
  }
  if (contentType.startsWith('text/') || /json|xml|javascript|css|markdown/.test(contentType)) {
    return { key, type: 'text', contentType, text: result.body.toString('utf8') }
  }
  return { key, type: 'binary', contentType, size: result.body.length }
}

async function getObjectStorageThumbnail(payload = {}) {
  const connection = await getObjectStorageConnectionById(payload.id)
  const key = String(payload.key || '').trim()
  if (!key) throw new Error('对象 Key 不能为空')
  if (!/^image\//.test(inferObjectStorageContentType(key))) return { key, dataUrl: '' }
  const requestUrl = buildObjectStorageObjectUrl(connection, key)
  const result = await signAndRequestObjectStorage(connection, requestUrl, { method: 'GET', timeout: 60000 })
  const maxThumbnailSize = 2 * 1024 * 1024
  if (result.body.length > maxThumbnailSize) return { key, dataUrl: '', tooLarge: true }
  const contentType = String(result.headers['content-type'] || inferObjectStorageContentType(key))
  if (!contentType.startsWith('image/')) return { key, dataUrl: '' }
  return { key, dataUrl: `data:${contentType};base64,${result.body.toString('base64')}` }
}

function decodeXmlValue(value = '') {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractXmlTag(xml = '', tag = '') {
  const match = String(xml || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  return match ? decodeXmlValue(match[1]) : ''
}

function parseObjectStorageListXml(xml = '', prefix = '') {
  const prefixes = []
  const objects = []
  for (const match of String(xml || '').matchAll(/<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g)) {
    const value = extractXmlTag(match[1], 'Prefix')
    if (value) prefixes.push({ key: value, name: value.slice(prefix.length).replace(/\/$/, '') || value })
  }
  for (const match of String(xml || '').matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const block = match[1]
    const key = extractXmlTag(block, 'Key')
    if (!key || key === prefix) continue
    objects.push({
      key,
      name: key.slice(prefix.length) || key,
      size: Number(extractXmlTag(block, 'Size') || 0),
      lastModified: extractXmlTag(block, 'LastModified'),
      etag: extractXmlTag(block, 'ETag').replace(/^"|"$/g, ''),
      storageClass: extractXmlTag(block, 'StorageClass')
    })
  }
  return {
    prefixes,
    objects,
    isTruncated: extractXmlTag(xml, 'IsTruncated') === 'true',
    nextContinuationToken: extractXmlTag(xml, 'NextContinuationToken')
  }
}

async function listObjectStorageObjects(payload = {}) {
  const id = String(payload.id || '').trim()
  const connection = await getObjectStorageConnectionById(id)
  const prefix = normalizeObjectStoragePrefix(payload.prefix ?? connection.prefix)
  const requestUrl = buildObjectStorageBaseUrl(connection)
  const query = {
    'delimiter': '/',
    'list-type': '2',
    'prefix': prefix,
    'max-keys': String(Math.min(Math.max(Number(payload.maxKeys || 1000), 1), 1000))
  }
  if (payload.continuationToken) query['continuation-token'] = String(payload.continuationToken)
  const signed = signObjectStorageRequest(connection, requestUrl, query)
  requestUrl.search = signed.queryString
  const xml = await requestObjectStorageXml(requestUrl, signed.headers)
  const parsed = parseObjectStorageListXml(xml, prefix)
  return {
    bucket: connection.bucket,
    prefix,
    endpoint: requestUrl.origin,
    ...parsed
  }
}

function normalizeDatabaseType(type) {
  const value = String(type || 'mysql').trim().toLowerCase()
  if (value === 'mariadb') return 'mariadb'
  if (value === 'sqlserver') return 'sqlserver'
  return 'mysql'
}

function getSession(id) {
  const session = sessions.get(id)
  if (!session) throw new Error('远程会话不存在')
  return session
}

function ensureSshSession(id) {
  const session = getSession(id)
  if (session.protocol !== 'ssh') throw new Error('当前连接协议不支持此操作')
  return session
}

function escapeShellSingleQuotedValue(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`
}

function buildShellCdCommand(targetPath) {
  const normalized = normalizeRemoteDir(targetPath)
  return `cd -- ${escapeShellSingleQuotedValue(normalized)}`
}

function normalizeTerminalSizeValue(value, fallback, min) {
  const numeric = Math.floor(Number(value))
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, numeric)
}

function clearPendingTerminalShellSync(target) {
  if (!target?.pendingTerminalShellSyncTimer) return
  clearTimeout(target.pendingTerminalShellSyncTimer)
  target.pendingTerminalShellSyncTimer = null
}

function scheduleTerminalShellSync(target, cols, rows) {
  if (!target?.stream?.write) return
  clearPendingTerminalShellSync(target)
  target.pendingTerminalShellSyncTimer = setTimeout(() => {
    target.pendingTerminalShellSyncTimer = null
    try {
      if (!Array.isArray(target.pendingTerminalShellSyncEchoes)) target.pendingTerminalShellSyncEchoes = []
      target.pendingTerminalShellSyncEchoes.push(`stty cols ${cols} rows ${rows} 2>/dev/null || true`)
      target.stream.write(`stty cols ${cols} rows ${rows} 2>/dev/null || true\n`)
    } catch (error) {}
  }, 80)
}

function shouldSuppressTerminalEchoLine(target, line = '') {
  if (!Array.isArray(target?.pendingTerminalShellSyncEchoes) || !target.pendingTerminalShellSyncEchoes.length) return false
  const normalized = String(line || '').replace(/\r/g, '').trim()
  if (!normalized) return false
  const index = target.pendingTerminalShellSyncEchoes.findIndex(item => normalized.includes(item))
  if (index === -1) return false
  target.pendingTerminalShellSyncEchoes.splice(index, 1)
  return true
}

function flushTerminalOutputChunk(target, chunk, flush = false) {
  const text = `${String(target?.terminalOutputBuffer || '')}${String(chunk || '')}`
  if (!text) return ''
  const pieces = text.match(/[^\n]*\n|[^\n]+/g) || []
  let output = ''
  let rest = ''
  for (const piece of pieces) {
    const complete = piece.endsWith('\n') || flush
    if (!complete) {
      const normalizedRest = String(piece || '').replace(/\r/g, '').trim()
      const maybeShellSyncEcho = !!normalizedRest && Array.isArray(target?.pendingTerminalShellSyncEchoes)
        && target.pendingTerminalShellSyncEchoes.some(item => item.includes(normalizedRest) || normalizedRest.includes('stty cols'))
      if (maybeShellSyncEcho) rest = piece
      else output += piece
      continue
    }
    if (shouldSuppressTerminalEchoLine(target, piece)) continue
    output += piece
  }
  if (target) target.terminalOutputBuffer = flush ? '' : rest
  return output
}

function syncTerminalWindow(target, cols, rows, forceShellSync = false) {
  if (!target?.stream) return
  const nextCols = normalizeTerminalSizeValue(cols, 120, 20)
  const nextRows = normalizeTerminalSizeValue(rows, 34, 8)
  try {
    target.stream.setWindow(nextRows, nextCols, 0, 0)
  } catch (error) {}
  const shouldSyncShell = forceShellSync || !target.terminalHasUserInput || (Date.now() - Number(target.terminalCreatedAt || 0) <= TERMINAL_SHELL_SYNC_WINDOW_MS)
  if (shouldSyncShell) scheduleTerminalShellSync(target, nextCols, nextRows)
}

function createTerminalShell(conn, cols = 120, rows = 34) {
  return new Promise((resolve, reject) => {
    conn.shell({ term: 'xterm-color', cols, rows }, (err, stream) => {
      if (err) {
        reject(new Error(err.message))
        return
      }
      resolve(stream)
    })
  })
}

function bindTerminalChannel(event, id, stream, state = null, onClose = null) {
  const pushData = chunk => {
    const data = state ? flushTerminalOutputChunk(state, chunk, false) : String(chunk || '')
    if (data) safeWebContentsSend(event.sender, 'terminal:data', { id, data })
  }
  stream.on('data', data => pushData(data.toString('utf8')))
  stream.stderr.on('data', data => pushData(data.toString('utf8')))
  stream.on('close', () => {
    if (state) {
      const tail = flushTerminalOutputChunk(state, '', true)
      if (tail) safeWebContentsSend(event.sender, 'terminal:data', { id, data: tail })
    }
    if (typeof onClose === 'function') onClose()
    safeWebContentsSend(event.sender, 'terminal:closed', { id })
  })
}

function closeTerminalChannel(channelId) {
  const channel = terminalChannels.get(channelId)
  if (!channel?.stream) {
    terminalChannels.delete(channelId)
    return false
  }
  clearPendingTerminalShellSync(channel)
  try {
    channel.stream.end('exit\n')
  } catch (error) {}
  try {
    channel.stream.close()
  } catch (error) {}
  terminalChannels.delete(channelId)
  return true
}

function closeTerminalChannelsBySession(sessionId) {
  for (const [channelId, channel] of terminalChannels.entries()) {
    if (channel.sessionId !== sessionId) continue
    closeTerminalChannel(channelId)
  }
}

function normalizeRemoteDir(value) {
  const text = String(value || '/').trim()
  if (!text) return '/'
  return text.startsWith('/') ? (path.posix.normalize(text) || '/') : (path.posix.normalize(`/${text}`) || '/')
}

function isRemotePathMissingError(error) {
  return /no such file|no such directory|bad path|not found|does not exist/i.test(String(error?.message || error || ''))
}

async function deleteSftpPath(client, targetPath, type = '-') {
  const normalizedPath = normalizeRemoteDir(targetPath)
  if (normalizedPath === '/') throw new Error('不能删除服务器根目录')

  if (type !== 'd') {
    try {
      await client.delete(normalizedPath)
      return { deleted: true, alreadyMissing: false }
    } catch (error) {
      if (isRemotePathMissingError(error)) return { deleted: false, alreadyMissing: true }
      throw error
    }
  }

  let entries = []
  try {
    entries = await client.list(normalizedPath)
  } catch (error) {
    if (isRemotePathMissingError(error)) return { deleted: false, alreadyMissing: true }
    throw error
  }

  for (const entry of entries) {
    if (!entry?.name || entry.name === '.' || entry.name === '..') continue
    const childPath = normalizeRemotePath(normalizedPath, entry.name)
    await deleteSftpPath(client, childPath, entry.type === 'd' ? 'd' : '-')
  }

  try {
    await client.rmdir(normalizedPath, false)
    return { deleted: true, alreadyMissing: false }
  } catch (error) {
    if (isRemotePathMissingError(error)) return { deleted: false, alreadyMissing: true }
    throw error
  }
}

async function resolveFtpStartPath(client) {
  try {
    return normalizeRemoteDir(await client.pwd())
  } catch (error) {
    return '/'
  }
}

async function resolveSftpStartPath(client) {
  try {
    const resolved = await client.realPath('.')
    return normalizeRemoteDir(resolved || '/')
  } catch (error) {
    return '/'
  }
}

function resolveSshStartPath(conn) {
  return new Promise(resolve => {
    conn.sftp((err, sftp) => {
      if (err || !sftp) {
        resolve('/')
        return
      }
      sftp.realpath('.', (realPathError, resolvedPath) => {
        if (typeof sftp.end === 'function') sftp.end()
        if (realPathError || !resolvedPath) {
          resolve('/')
          return
        }
        resolve(normalizeRemoteDir(resolvedPath))
      })
    })
  })
}

function getFtpClient(id) {
  const session = getSession(id)
  if (session.protocol !== 'ftp') throw new Error('当前连接协议不支持 FTP 文件操作')
  if (!session.client || session.client.closed) throw new Error('FTP 会话已断开')
  return session.client
}

async function closeSessionSftpClient(session) {
  if (!session) return
  const pendingClient = session.sftpClientPromise || null
  let client = session.sftpClient || null
  session.sftpClient = null
  session.sftpClientPromise = null

  if (!client && pendingClient) {
    try {
      client = await pendingClient
    } catch (error) {
      client = null
    }
  }

  if (client && typeof client.end === 'function') {
    try {
      await client.end()
    } catch (error) {}
  }
}

async function ensureSessionSftpClient(session) {
  if (session.sftpClient) return session.sftpClient
  if (session.sftpClientPromise) return session.sftpClientPromise

  const client = new SftpClient()
  let connectPromise = null
  const clearClient = () => {
    if (session.sftpClient === client) session.sftpClient = null
    if (session.sftpClientPromise === connectPromise) session.sftpClientPromise = null
  }

  if (typeof client.on === 'function') {
    client.on('close', clearClient)
    client.on('end', clearClient)
    client.on('error', () => {
      if (session.sftpClient === client) session.sftpClient = null
    })
  }

  connectPromise = client.connect(buildConnectionOptions(session.config))
    .then(() => {
      session.sftpClient = client
      if (session.sftpClientPromise === connectPromise) session.sftpClientPromise = null
      return client
    })
    .catch(error => {
      clearClient()
      try { client.end() } catch (innerError) {}
      throw error
    })

  session.sftpClientPromise = connectPromise
  return connectPromise
}

function shouldReconnectSftpClient(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return [
    'not connected',
    'no sftp connection available',
    'unexpected end',
    'connection lost',
    'connection closed',
    'no response from server',
    'end called'
  ].some(keyword => message.includes(keyword))
}

async function withRemoteClient(sessionId, task) {
  const session = getSession(sessionId)
  if (session.protocol === 'ftp') {
    return task(getFtpClient(sessionId), session)
  }
  return withSftp(sessionId, client => task(client, session))
}

function createTempFilePath(name = 'tmp.txt') {
  return path.join(app.getPath('temp'), `linux-visual-${Date.now()}-${Math.random().toString(16).slice(2)}-${path.basename(name)}`)
}

function getImageMimeType(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.ico') return 'image/x-icon'
  throw new Error('当前文件类型不支持图片预览')
}

function assertPreviewImageSize(size) {
  if (Number(size || 0) > MAX_PREVIEW_IMAGE_SIZE) {
    throw new Error('图片超过 20 MB，暂不支持内置预览，请使用默认打开。')
  }
}

function buildImagePreviewPayload(filePath, buffer) {
  assertPreviewImageSize(buffer?.length || 0)
  return {
    mimeType: getImageMimeType(filePath),
    dataUrl: `data:${getImageMimeType(filePath)};base64,${buffer.toString('base64')}`,
    size: buffer.length || 0
  }
}

function getPreviewMediaDescriptor(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (ext === '.mp4') return { kind: 'video', mimeType: 'video/mp4' }
  if (ext === '.webm') return { kind: 'video', mimeType: 'video/webm' }
  if (ext === '.mov') return { kind: 'video', mimeType: 'video/quicktime' }
  if (ext === '.m4v') return { kind: 'video', mimeType: 'video/x-m4v' }
  if (ext === '.mp3') return { kind: 'audio', mimeType: 'audio/mpeg' }
  if (ext === '.wav') return { kind: 'audio', mimeType: 'audio/wav' }
  if (ext === '.ogg') return { kind: 'audio', mimeType: 'audio/ogg' }
  if (ext === '.m4a') return { kind: 'audio', mimeType: 'audio/mp4' }
  if (ext === '.aac') return { kind: 'audio', mimeType: 'audio/aac' }
  if (ext === '.flac') return { kind: 'audio', mimeType: 'audio/flac' }
  throw new Error('当前文件类型暂不支持内置媒体预览')
}

function assertPreviewMediaSize(size) {
  if (Number(size || 0) > MAX_PREVIEW_MEDIA_SIZE) {
    throw new Error('媒体文件超过 200 MB，暂不支持内置预览，请先下载后播放。')
  }
}

function getObjectStoragePreviewMediaDescriptor(key, contentType = '') {
  const mimeType = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (mimeType.startsWith('video/')) return { kind: 'video', mimeType }
  if (mimeType.startsWith('audio/')) return { kind: 'audio', mimeType }
  try {
    return getPreviewMediaDescriptor(key)
  } catch (_) {
    return null
  }
}

function registerPreviewTempFile(filePath) {
  previewTempFiles.add(filePath)
  return filePath
}

function registerPreviewMediaResource(filePath, mimeType) {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  previewMediaRegistry.set(token, { filePath, mimeType })
  return `whssh-media://preview/${token}`
}

function registerRemotePreviewMediaResource(sessionId, remotePath, mimeType, size) {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  previewMediaRegistry.set(token, {
    source: 'remote',
    sessionId: String(sessionId || ''),
    remotePath: String(remotePath || ''),
    mimeType,
    size: Number(size || 0)
  })
  return { token, fileUrl: `whssh-media://preview/${token}` }
}

function cleanupPreviewTempFile(filePath, resourceToken = '') {
  if (resourceToken) previewMediaRegistry.delete(String(resourceToken))
  if (!filePath) return
  for (const [token, item] of previewMediaRegistry.entries()) {
    if (item.filePath === filePath) previewMediaRegistry.delete(token)
  }
  previewTempFiles.delete(filePath)
  removeLocalTempPath(filePath)
}

function parsePreviewMediaRange(rangeHeader, totalSize) {
  const match = String(rangeHeader || '').match(/^bytes=(\d*)-(\d*)$/i)
  if (!match) return null

  const startText = match[1]
  const endText = match[2]

  if (!startText && !endText) return null

  let start = startText ? Number(startText) : null
  let end = endText ? Number(endText) : null

  if (startText && Number.isNaN(start)) return null
  if (endText && Number.isNaN(end)) return null

  if (start === null) {
    const suffixLength = end
    if (!suffixLength || suffixLength <= 0) return null
    start = Math.max(0, totalSize - suffixLength)
    end = totalSize - 1
  } else {
    if (start < 0 || start >= totalSize) return { invalid: true }
    if (end === null || end >= totalSize) end = totalSize - 1
    if (end < start) return { invalid: true }
  }

  return { start, end }
}

function registerMediaPreviewProtocol() {
  protocol.handle('whssh-media', async request => {
    const url = new URL(request.url)
    const token = url.pathname.split('/').filter(Boolean).pop() || ''
    const target = previewMediaRegistry.get(token)
    if (!target) {
      return new Response('Not found', { status: 404 })
    }
    const isRemote = target.source === 'remote'
    if (!isRemote && (!target.filePath || !fs.existsSync(target.filePath))) {
      return new Response('Not found', { status: 404 })
    }
    const totalSize = isRemote ? Number(target.size || 0) : Number(fs.statSync(target.filePath).size || 0)
    if (!totalSize) return new Response('Not found', { status: 404 })
    const range = parsePreviewMediaRange(request.headers.get('range'), totalSize)

    if (range?.invalid) {
      return new Response(null, {
        status: 416,
        headers: {
          'content-range': `bytes */${totalSize}`,
          'accept-ranges': 'bytes'
        }
      })
    }

    const start = range?.start ?? 0
    const end = range?.end ?? totalSize - 1
    let stream
    try {
      stream = isRemote
        ? await withRemoteClient(target.sessionId, client => client.createReadStream(target.remotePath, { start, end }))
        : fs.createReadStream(target.filePath, { start, end })
    } catch (error) {
      return new Response(String(error?.message || '无法读取媒体文件'), { status: 502 })
    }

    if (range) {
      return new Response(Readable.toWeb(stream), {
        status: 206,
        headers: {
          'content-type': target.mimeType || 'application/octet-stream',
          'accept-ranges': 'bytes',
          'content-length': String(end - start + 1),
          'content-range': `bytes ${start}-${end}/${totalSize}`,
          'cache-control': 'no-store'
        }
      })
    }

    return new Response(Readable.toWeb(stream), {
      headers: {
        'content-type': target.mimeType || 'application/octet-stream',
        'accept-ranges': 'bytes',
        'content-length': String(totalSize),
        'cache-control': 'no-store'
      }
    })
  })
}

async function listRemoteNames(client, targetDir) {
  const list = await client.list(targetDir || '/')
  return new Set(list.map(item => item.name))
}

async function resolveUniqueRemotePath(client, targetDir, originalName, existingNames = null) {
  const directory = targetDir || '/'
  const names = existingNames || await listRemoteNames(client, directory)
  if (!names.has(originalName)) return normalizeRemotePath(directory, originalName)

  const ext = path.posix.extname(originalName)
  const base = ext ? originalName.slice(0, -ext.length) : originalName
  let index = 1
  let nextName = `${base}-copy${ext}`
  while (names.has(nextName)) {
    index += 1
    nextName = `${base}-copy-${index}${ext}`
  }
  return normalizeRemotePath(directory, nextName)
}

function removeLocalTempPath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true })
}

function scheduleObjectStorageDragTempCleanup(targetPath) {
  if (!targetPath) return
  const delayMs = 30 * 60 * 1000
  const timer = setTimeout(() => {
    objectStorageDragTempTimers.delete(targetPath)
    removeLocalTempPath(targetPath)
  }, delayMs)
  if (typeof timer.unref === 'function') timer.unref()
  objectStorageDragTempTimers.set(targetPath, timer)
}

function cleanupObjectStorageDragTempPaths() {
  for (const [targetPath, timer] of objectStorageDragTempTimers.entries()) {
    clearTimeout(timer)
    removeLocalTempPath(targetPath)
  }
  objectStorageDragTempTimers.clear()
}

async function copyRemotePath(client, session, sessionId, sourcePath, sourceType, targetPath) {
  if (session.protocol === 'ssh') {
    const copyStart = Date.now()
    const result = await runCommand(
      sessionId,
      `cp -a -- ${escapeShellSingleQuotedValue(sourcePath)} ${escapeShellSingleQuotedValue(targetPath)}`
    )
    const copyMs = Date.now() - copyStart
    logRemotePerf('sftp:remote-copy', {
      protocol: session.protocol,
      sourcePath,
      targetPath,
      sourceType,
      copyMs,
      code: result.code
    })
    if (result.code) {
      const detail = String(result.stderr || result.stdout || '').trim()
      throw new Error(detail || `服务器复制失败（退出码 ${result.code}）`)
    }
    return
  }

  const tempPath = createTempFilePath(path.posix.basename(sourcePath))
  try {
    if (sourceType === 'd') {
      fs.mkdirSync(tempPath, { recursive: true })
      if (session.protocol === 'ftp') {
        await client.downloadToDir(tempPath, sourcePath)
        await client.uploadFromDir(tempPath, targetPath)
      } else {
        await client.downloadDir(sourcePath, tempPath)
        await client.uploadDir(tempPath, targetPath)
      }
      return
    }

    if (session.protocol === 'ftp') {
      await client.downloadTo(tempPath, sourcePath)
      await client.uploadFrom(tempPath, targetPath)
    } else {
      await client.get(sourcePath, tempPath)
      await client.put(tempPath, targetPath)
    }
  } finally {
    removeLocalTempPath(tempPath)
  }
}

function runCommand(sessionId, command) {
  const session = ensureSshSession(sessionId)
  return new Promise((resolve, reject) => {
    session.conn.exec(command, (err, stream) => {
      if (err) {
        reject(new Error(err.message))
        return
      }
      let stdout = ''
      let stderr = ''
      stream.on('close', code => resolve({ code, stdout, stderr }))
      stream.on('data', data => { stdout += data.toString('utf8') })
      stream.stderr.on('data', data => { stderr += data.toString('utf8') })
    })
  })
}

async function runPrivilegedCommand(sessionId, command) {
  const wrapped = `if [ "$(id -u)" -eq 0 ]; then ${command}; else sudo -n sh -lc '${escapeShell(command)}'; fi`
  const result = await runCommand(sessionId, wrapped)
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.trim()
  if (/a password is required|sudo:.*password|not in the sudoers/i.test(text)) {
    throw new Error('当前账号没有 root 或免密 sudo 权限，无法执行系统级管理操作。请使用 root 登录，或给当前用户配置免密 sudo。')
  }
  return result
}

function runShellCommandInDirectory(sessionId, command, cwd = '') {
  const commandText = String(command || '').trim()
  if (!commandText) throw new Error('命令不能为空')
  const normalizedCwd = String(cwd || '').trim()
  const script = normalizedCwd
    ? `${buildShellCdCommand(normalizedCwd)} && ${commandText}`
    : commandText
  return runCommand(sessionId, `sh -lc '${escapeShell(script)}'`)
}

function ensurePm2CommandSuccess(result, fallbackMessage) {
  if (!result.code) return result
  const text = `${result.stderr || ''}
${result.stdout || ''}`.trim()
  if (/command not found|not found/i.test(text)) {
    throw new Error('服务器未安装 PM2，或当前账号环境中找不到 pm2 命令。')
  }
  throw new Error(text || fallbackMessage || 'PM2 命令执行失败')
}

function formatPm2Memory(bytes) {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return '0MB'
  const mb = value / 1024 / 1024
  if (mb >= 1024) {
    const gb = mb / 1024
    return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)}GB`
  }
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1).replace(/\.0$/, '')}MB`
}

function formatPm2Cpu(value) {
  const target = Number(value || 0)
  if (!Number.isFinite(target) || target <= 0) return '0%'
  return `${target >= 10 ? target.toFixed(0) : target.toFixed(1).replace(/\.0$/, '')}%`
}

function formatPm2Uptime(status, timestamp) {
  if (status !== 'online') return '已停止'
  const startedAt = Number(timestamp || 0)
  if (!Number.isFinite(startedAt) || startedAt <= 0) return '刚刚启动'
  const diff = Math.max(0, Date.now() - startedAt)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚启动'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${mins}分钟`
  return `${mins}分钟`
}

function normalizePm2Status(value) {
  const status = String(value || '').trim().toLowerCase()
  if (status === 'online') return 'online'
  if (status === 'errored') return 'errored'
  return 'stopped'
}

function buildPm2ExecModeLabel(pm2Env = {}) {
  const mode = String(pm2Env.exec_mode || '').trim().toLowerCase()
  const instances = Number(pm2Env.instances || 1)
  if (mode.includes('cluster')) return `cluster x${instances > 0 ? instances : 1}`
  return 'fork'
}

function pickPm2EnvName(pm2Env = {}) {
  const env = pm2Env.env && typeof pm2Env.env === 'object' ? pm2Env.env : {}
  return String(env.NODE_ENV || pm2Env.NODE_ENV || 'default').trim() || 'default'
}

function pickPm2Ports(pm2Env = {}) {
  const env = pm2Env.env && typeof pm2Env.env === 'object' ? pm2Env.env : {}
  const values = [env.PORT, env.port, env.APP_PORT, env.PORTS]
    .flatMap(item => Array.isArray(item) ? item : [item])
    .map(item => String(item || '').trim())
    .filter(Boolean)
  return values.length ? [...new Set(values)].join(', ') : '-'
}

function formatPm2NodeArgs(value) {
  if (Array.isArray(value)) return value.join(' ').trim() || '-'
  const text = String(value || '').trim()
  return text || '-'
}

function formatPm2ScriptArgs(value) {
  if (Array.isArray(value)) {
    const text = value.map(item => String(item || '').trim()).filter(Boolean).join(' ')
    return text || '-'
  }
  const text = String(value || '').trim()
  return text || '-'
}

function formatPm2Timestamp(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '-'
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ]
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ]
  return `${parts.join('-')} ${time.join(':')}`
}

function formatPm2ListValue(value) {
  if (Array.isArray(value)) {
    const text = value.map(item => String(item || '').trim()).filter(Boolean).join(', ')
    return text || '-'
  }
  const text = String(value || '').trim()
  return text || '-'
}

function formatPm2DurationMs(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return '-'
  if (numeric % 1000 === 0) return `${numeric / 1000}s`
  return `${numeric}ms`
}

function formatPm2RestartRule(value) {
  const text = String(value || '').trim()
  return text || '-'
}

function buildPm2EnvSummary(pm2Env = {}, processName = '') {
  const env = pm2Env.env && typeof pm2Env.env === 'object' ? pm2Env.env : {}
  const summary = []
  const pushItem = (key, value) => {
    const text = String(value || '').trim()
    if (!key || !text) return
    if (summary.some(item => item.key === key)) return
    summary.push({ key, value: text })
  }
  pushItem('NODE_ENV', env.NODE_ENV || pm2Env.NODE_ENV)
  pushItem('PORT', env.PORT || env.port || env.APP_PORT)
  pushItem('APP_NAME', processName)
  pushItem('TZ', env.TZ)
  for (const [key, value] of Object.entries(env)) {
    if (summary.length >= 4) break
    if (typeof value === 'object') continue
    pushItem(key, value)
  }
  return summary
}

function mapPm2ProcessRecord(item = {}) {
  const pm2Env = item.pm2_env && typeof item.pm2_env === 'object' ? item.pm2_env : {}
  const monit = item.monit && typeof item.monit === 'object' ? item.monit : {}
  const status = normalizePm2Status(pm2Env.status)
  const pmId = Number(pm2Env.pm_id ?? item.pm_id ?? -1)
  const cpuValue = Number(monit.cpu || 0)
  const memoryBytes = Number(monit.memory || 0)
  const name = String(item.name || pm2Env.name || `pm2-${pmId}`).trim() || `pm2-${pmId}`
  return {
    id: `pm2-${pmId}`,
    pmId,
    name,
    status,
    execMode: buildPm2ExecModeLabel(pm2Env),
    script: String(pm2Env.pm_exec_path || pm2Env.script || '-').trim() || '-',
    instances: String(pm2Env.instances || 1),
    cpuValue,
    memoryBytes,
    cpu: formatPm2Cpu(cpuValue),
    memory: formatPm2Memory(memoryBytes),
    uptime: formatPm2Uptime(status, pm2Env.pm_uptime),
    restarts: String(Number(pm2Env.restart_time || 0)),
    cwd: String(pm2Env.pm_cwd || '/').trim() || '/',
    interpreter: String(pm2Env.exec_interpreter || '-').trim() || '-',
    nodeArgs: formatPm2NodeArgs(pm2Env.node_args),
    ports: pickPm2Ports(pm2Env),
    autorestart: pm2Env.autorestart !== false,
    watch: !!pm2Env.watch,
    maxMemoryRestart: String(pm2Env.max_memory_restart || '-').trim() || '-',
    envName: pickPm2EnvName(pm2Env),
    logs: [],
    envSummary: buildPm2EnvSummary(pm2Env, name),
    outLogPath: String(pm2Env.pm_out_log_path || '').trim(),
    errorLogPath: String(pm2Env.pm_err_log_path || '').trim()
  }
}

function buildPm2ProcessDetail(record = {}) {
  const base = mapPm2ProcessRecord(record)
  const pm2Env = record.pm2_env && typeof record.pm2_env === 'object' ? record.pm2_env : {}
  const env = pm2Env.env && typeof pm2Env.env === 'object' ? pm2Env.env : {}
  const pid = Number(record.pid || pm2Env.pid || 0)
  const user = String(pm2Env.username || env.USER || env.LOGNAME || '').trim()
  return {
    ...base,
    pid: pid > 0 ? String(pid) : '-',
    namespace: String(pm2Env.namespace || 'default').trim() || 'default',
    version: String(pm2Env.version || env.npm_package_version || '-').trim() || '-',
    scriptArgs: formatPm2ScriptArgs(pm2Env.args),
    execPath: String(pm2Env.pm_exec_path || pm2Env.script || '-').trim() || '-',
    interpreterArgs: formatPm2NodeArgs(pm2Env.interpreter_args),
    instanceVar: String(pm2Env.instance_var || 'NODE_APP_INSTANCE').trim() || 'NODE_APP_INSTANCE',
    createdAt: formatPm2Timestamp(pm2Env.created_at),
    startedAt: formatPm2Timestamp(pm2Env.pm_uptime),
    restartDelay: formatPm2DurationMs(pm2Env.restart_delay),
    listenTimeout: formatPm2DurationMs(pm2Env.listen_timeout),
    killTimeout: formatPm2DurationMs(pm2Env.kill_timeout),
    minUptime: formatPm2DurationMs(pm2Env.min_uptime),
    maxRestarts: String(pm2Env.max_restarts ?? '-').trim() || '-',
    unstableRestarts: String(pm2Env.unstable_restarts ?? '-').trim() || '-',
    cronRestart: formatPm2RestartRule(pm2Env.cron_restart),
    expBackoffRestartDelay: formatPm2DurationMs(pm2Env.exp_backoff_restart_delay),
    mergeLogs: pm2Env.merge_logs === true ? '开启' : '关闭',
    logDateFormat: String(pm2Env.log_date_format || '-').trim() || '-',
    pidFile: String(pm2Env.pm_pid_path || '').trim() || '-',
    watchIgnore: formatPm2ListValue(pm2Env.ignore_watch),
    watchPaths: formatPm2ListValue(pm2Env.watch && pm2Env.watch !== true ? pm2Env.watch : ''),
    user: user || '-',
    envCount: String(Object.keys(env).length),
    pmOutLogPath: String(pm2Env.pm_out_log_path || '').trim() || '-',
    pmErrorLogPath: String(pm2Env.pm_err_log_path || '').trim() || '-'
  }
}

async function listPm2Processes(sessionId) {
  const result = ensurePm2CommandSuccess(await runCommand(sessionId, 'pm2 jlist'), '读取 PM2 进程失败')
  const text = String(result.stdout || '').trim()
  const records = text ? JSON.parse(text) : []
  if (!Array.isArray(records)) return []
  return records.map(mapPm2ProcessRecord)
}

async function listPm2RawRecords(sessionId) {
  const result = ensurePm2CommandSuccess(await runCommand(sessionId, 'pm2 jlist'), '读取 PM2 进程失败')
  const text = String(result.stdout || '').trim()
  const records = text ? JSON.parse(text) : []
  return Array.isArray(records) ? records : []
}

async function getPm2ProcessDetail(sessionId, target) {
  const record = await getPm2RawProcessRecord(sessionId, target)
  return buildPm2ProcessDetail(record)
}

async function getPm2RawProcessRecord(sessionId, target) {
  const identifier = String(target || '').trim()
  if (!identifier) throw new Error('缺少 PM2 进程标识')
  const list = await listPm2RawRecords(sessionId)
  const numericTarget = Number(identifier)
  const matched = list.find(item => `pm2-${Number(item?.pm2_env?.pm_id ?? item?.pm_id ?? -1)}` === identifier)
    || list.find(item => Number.isFinite(numericTarget) && Number(item?.pm2_env?.pm_id ?? item?.pm_id ?? -1) === numericTarget)
    || list.find(item => String(item?.name || item?.pm2_env?.name || '').trim() === identifier)
  if (!matched) throw new Error('未找到对应的 PM2 进程')
  return matched
}

async function readPm2Logs(sessionId, target, lines = 200) {
  const identifier = String(target || '').trim()
  if (!identifier) throw new Error('缺少 PM2 进程标识')
  const safeLines = Math.max(20, Math.min(Number(lines || 200), 1000))
  const command = `pm2 logs ${escapeShellSingleQuotedValue(identifier)} --lines ${safeLines} --nostream`
  const result = ensurePm2CommandSuccess(await runCommand(sessionId, command), '读取 PM2 日志失败')
  const text = `${String(result.stdout || '')}${result.stderr ? `\n${String(result.stderr || '')}` : ''}`.trim()
  return text ? text.split(/\r?\n/) : []
}

async function runPm2Action(sessionId, action, target) {
  const supportedActions = ['start', 'stop', 'restart', 'delete']
  if (!supportedActions.includes(action)) throw new Error('不支持的 PM2 操作')
  const identifier = String(target || '').trim()
  if (!identifier) throw new Error('缺少 PM2 进程标识')
  const result = ensurePm2CommandSuccess(await runCommand(sessionId, `pm2 ${action} ${escapeShellSingleQuotedValue(identifier)}`), `PM2 ${action} 执行失败`)
  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

function normalizePm2CreatePayload(payload = {}) {
  const name = String(payload.name || '').trim()
  const cwd = String(payload.cwd || '').trim()
  const script = String(payload.script || '').trim()
  const execMode = String(payload.execMode || 'fork').trim().toLowerCase() === 'cluster' ? 'cluster' : 'fork'
  const instances = String(payload.instances || '1').trim() || '1'
  const interpreter = String(payload.interpreter || 'node').trim() || 'node'
  const nodeArgs = String(payload.nodeArgs || '').trim()
  const envName = String(payload.envName || '').trim()
  const ports = String(payload.ports || '').trim()
  const autorestart = payload.autorestart !== false
  if (!name) throw new Error('请填写应用名称')
  if (!cwd) throw new Error('请填写工作目录')
  if (!script) throw new Error('请填写启动脚本或命令')
  return { name, cwd, script, execMode, instances, interpreter, nodeArgs, envName, ports, autorestart }
}

function buildPm2CreateCommand(payload = {}) {
  const form = normalizePm2CreatePayload(payload)
  const segments = ['pm2 start', form.script]
  segments.push(`--name ${escapeShellSingleQuotedValue(form.name)}`)
  segments.push(`--cwd ${escapeShellSingleQuotedValue(normalizeRemoteDir(form.cwd))}`)
  segments.push(`--interpreter ${escapeShellSingleQuotedValue(form.interpreter)}`)
  if (form.execMode === 'cluster') segments.push(`-i ${form.instances}`)
  if (form.nodeArgs) segments.push(`--node-args ${escapeShellSingleQuotedValue(form.nodeArgs)}`)
  if (!form.autorestart) segments.push('--no-autorestart')
  const envSegments = []
  if (form.envName) envSegments.push(`NODE_ENV=${escapeShellSingleQuotedValue(form.envName)}`)
  if (form.ports) envSegments.push(`PORT=${escapeShellSingleQuotedValue(form.ports)}`)
  return `${envSegments.length ? `env ${envSegments.join(' ')} ` : ''}${segments.join(' ')}`
}

function isLikelyPm2ScriptPath(value = '') {
  const text = String(value || '').trim()
  if (!text) return false
  if (/[\s]/.test(text)) return false
  if (/^(\.|\/)/.test(text)) return true
  return /\.(js|cjs|mjs|sh|py|php|ts)$/i.test(text)
}

async function validatePm2CreatePayload(sessionId, payload = {}) {
  const form = normalizePm2CreatePayload(payload)
  const cwd = normalizeRemoteDir(form.cwd)
  const cwdCheck = await runCommand(sessionId, `[ -d ${escapeShellSingleQuotedValue(cwd)} ] && printf ok || printf missing`)
  if (String(cwdCheck.stdout || '').trim() !== 'ok') {
    throw new Error(`工作目录不存在：${cwd}`)
  }

  const interpreter = String(form.interpreter || '').trim()
  if (interpreter) {
    const interpreterCheck = await runCommand(sessionId, `command -v ${escapeShellSingleQuotedValue(interpreter)} >/dev/null 2>&1 && printf ok || printf missing`)
    if (String(interpreterCheck.stdout || '').trim() !== 'ok') {
      throw new Error(`解释器不存在：${interpreter}`)
    }
  }

  const warnings = []
  if (isLikelyPm2ScriptPath(form.script)) {
    const scriptText = String(form.script || '').trim()
    const scriptCheck = scriptText.startsWith('/')
      ? await runCommand(sessionId, `[ -e ${escapeShellSingleQuotedValue(normalizeRemoteDir(scriptText))} ] && printf ok || printf missing`)
      : await runShellCommandInDirectory(sessionId, `[ -e ${escapeShellSingleQuotedValue(scriptText)} ] && printf ok || printf missing`, cwd)
    if (String(scriptCheck.stdout || '').trim() !== 'ok') {
      throw new Error(`启动脚本不存在：${scriptText}`)
    }
  } else {
    warnings.push('当前启动项更像命令而不是脚本路径，未执行文件存在性检查。')
  }

  return {
    valid: true,
    cwd,
    warnings
  }
}

async function createPm2Process(sessionId, payload = {}) {
  const validation = await validatePm2CreatePayload(sessionId, payload)
  const command = buildPm2CreateCommand(payload)
  const result = ensurePm2CommandSuccess(await runCommand(sessionId, command), '创建 PM2 进程失败')
  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    command,
    validation
  }
}

function buildPm2RenameAppConfig(record = {}, nextName = '') {
  const pm2Env = record.pm2_env && typeof record.pm2_env === 'object' ? record.pm2_env : {}
  const env = pm2Env.env && typeof pm2Env.env === 'object' ? { ...pm2Env.env } : {}
  const config = {
    name: nextName,
    script: String(pm2Env.pm_exec_path || pm2Env.script || '').trim(),
    cwd: String(pm2Env.pm_cwd || '/').trim() || '/',
    exec_mode: String(pm2Env.exec_mode || '').trim() || 'fork',
    instances: Number(pm2Env.instances || 1),
    interpreter: String(pm2Env.exec_interpreter || 'node').trim() || 'node',
    autorestart: pm2Env.autorestart !== false,
    watch: !!pm2Env.watch,
    env
  }
  if (Array.isArray(pm2Env.node_args) && pm2Env.node_args.length) config.node_args = pm2Env.node_args
  if (Array.isArray(pm2Env.args) && pm2Env.args.length) config.args = pm2Env.args
  if (pm2Env.max_memory_restart) config.max_memory_restart = pm2Env.max_memory_restart
  if (Array.isArray(pm2Env.ignore_watch) && pm2Env.ignore_watch.length) config.ignore_watch = pm2Env.ignore_watch
  if (pm2Env.restart_delay) config.restart_delay = pm2Env.restart_delay
  if (pm2Env.listen_timeout) config.listen_timeout = pm2Env.listen_timeout
  if (pm2Env.kill_timeout) config.kill_timeout = pm2Env.kill_timeout
  if (pm2Env.exp_backoff_restart_delay) config.exp_backoff_restart_delay = pm2Env.exp_backoff_restart_delay
  if (pm2Env.min_uptime) config.min_uptime = pm2Env.min_uptime
  if (pm2Env.max_restarts) config.max_restarts = pm2Env.max_restarts
  if (pm2Env.cron_restart) config.cron_restart = pm2Env.cron_restart
  return { apps: [config] }
}

async function renamePm2Process(sessionId, payload = {}) {
  const target = String((payload.target ?? payload.pmId ?? payload.name) || '').trim()
  const nextName = String(payload.nextName || '').trim()
  if (!target) throw new Error('缺少 PM2 进程标识')
  if (!nextName) throw new Error('请填写新的进程名称')
  const record = await getPm2RawProcessRecord(sessionId, target)
  const currentName = String(record?.name || record?.pm2_env?.name || '').trim()
  if (!currentName) throw new Error('未找到当前进程名称')
  if (currentName === nextName) {
    return { renamed: false, name: currentName, nextName }
  }
  const appConfig = buildPm2RenameAppConfig(record, nextName)
  if (!appConfig.apps[0].script) {
    throw new Error('当前 PM2 进程缺少可重建的启动脚本，暂不支持重命名')
  }
  const tempFile = `/tmp/whssh-pm2-rename-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  const script = [
    'set -e',
    `cat > ${escapeShellSingleQuotedValue(tempFile)} <<'EOF'`,
    JSON.stringify(appConfig, null, 2),
    'EOF',
    `pm2 start ${escapeShellSingleQuotedValue(tempFile)}`,
    `pm2 delete ${escapeShellSingleQuotedValue(target)}`,
    `rm -f ${escapeShellSingleQuotedValue(tempFile)}`
  ].join('\n')
  const result = ensurePm2CommandSuccess(await runCommand(sessionId, `sh -lc '${escapeShell(script)}'`), '重命名 PM2 进程失败')
  return {
    renamed: true,
    name: currentName,
    nextName,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

function ensureCommandSuccess(result, fallbackMessage) {
  if (!result.code) return result
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.trim()
  throw new Error(text || fallbackMessage || '命令执行失败')
}

function isPrivilegeUnavailableError(error) {
  return /root|sudo|免密|password is required|not in the sudoers|权限/i.test(String(error?.message || ''))
}

function normalizeLinuxUserName(value) {
  const name = String(value || '').trim()
  if (!/^[a-z_][a-z0-9_-]*$/.test(name)) throw new Error('用户名格式不正确，只允许小写字母、数字、下划线、中划线，且必须以字母或下划线开头。')
  return name
}

function normalizeLinuxGroupName(value) {
  const name = String(value || '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_-]*[$]?$/.test(name)) throw new Error('用户组格式不正确，只允许字母、数字、下划线、中划线。')
  return name
}

function normalizeUserGroupList(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',')
  const groups = []
  const seen = new Set()
  for (const item of list) {
    const group = String(item || '').trim()
    if (!group) continue
    const normalized = normalizeLinuxGroupName(group)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    groups.push(normalized)
  }
  return groups
}

function normalizeShellPath(value) {
  const target = String(value || '').trim()
  if (!target) return '/bin/bash'
  if (!/^\/[A-Za-z0-9_./-]+$/.test(target)) throw new Error('Shell 路径格式不正确，必须是绝对路径。')
  return target
}

function normalizeLinuxHomePath(value) {
  const target = String(value || '').trim()
  if (!target) return ''
  if (!/^\/[A-Za-z0-9_./-]+$/.test(target)) throw new Error('家目录路径格式不正确，必须是绝对路径。')
  return target
}

function normalizePortValue(value) {
  const text = String(value || '').trim()
  if (!/^\d{1,5}(-\d{1,5})?$/.test(text)) throw new Error('端口格式不正确，支持单端口或区间，例如 22 或 3000-3010。')
  return text
}

function normalizeProtocolValue(value) {
  const protocol = String(value || 'tcp').trim().toLowerCase()
  if (!['tcp', 'udp', 'icmp', 'icmpv6', 'all'].includes(protocol)) throw new Error('协议只支持 tcp、udp、icmp、icmpv6 或 all')
  return protocol
}

function firewallProtocolNeedsPort(protocol) {
  return ['tcp', 'udp'].includes(normalizeProtocolValue(protocol))
}

function normalizeFirewallPortForProtocol(protocol, value) {
  return firewallProtocolNeedsPort(protocol) ? normalizePortValue(value) : ''
}

function normalizeFirewallAction(value) {
  const action = String(value || 'allow').trim().toLowerCase()
  if (!['allow', 'deny'].includes(action)) throw new Error('规则动作只支持 allow 或 deny')
  return action
}

function normalizeFirewallDirection(value) {
  const direction = String(value || 'inbound').trim().toLowerCase()
  if (!['inbound', 'outbound'].includes(direction)) throw new Error('规则方向只支持入站或出站')
  return direction
}

function normalizeFirewallSource(value) {
  const source = String(value || '').trim()
  if (!source || /^(any|all|\*)$/i.test(source)) return ''
  if (!/^[0-9A-Fa-f:./]+$/.test(source)) throw new Error('地址格式不正确，只支持 IP 或 CIDR。')
  return source
}

function formatUfwPortValue(value) {
  return normalizePortValue(value).replace(/-/g, ':')
}

function formatIptablesPortValue(value) {
  return normalizePortValue(value).replace(/-/g, ':')
}

function isIpv6Address(value) {
  return String(value || '').includes(':')
}

function getIptablesBinaryForRule(rule = {}) {
  return String(rule.family || '').toLowerCase() === 'ipv6' || normalizeProtocolValue(rule.protocol) === 'icmpv6' || isIpv6Address(rule.source) || isIpv6Address(rule.destination) ? 'ip6tables' : 'iptables'
}

function buildIptablesRuleCommand(rule = {}, mode = 'insert') {
  const commandMode = mode === 'delete' ? '-D' : '-I'
  const protocol = normalizeProtocolValue(rule.protocol)
  const port = firewallProtocolNeedsPort(protocol) ? formatIptablesPortValue(rule.port) : ''
  const source = normalizeFirewallSource(rule.source)
  const destination = normalizeFirewallSource(rule.destination)
  const action = normalizeFirewallAction(rule.action)
  const direction = normalizeFirewallDirection(rule.direction)
  const chain = String(rule.chain || (direction === 'outbound' ? 'OUTPUT' : 'INPUT')).trim() || (direction === 'outbound' ? 'OUTPUT' : 'INPUT')
  const target = action === 'allow' ? 'ACCEPT' : 'REJECT'
  const segments = [getIptablesBinaryForRule(rule), commandMode, chain]
  if (mode !== 'delete') segments.push('1')
  if (direction === 'outbound') {
    if (destination) segments.push(`-d ${destination}`)
  } else if (source) {
    segments.push(`-s ${source}`)
  }
  if (protocol === 'icmp') {
    segments.push('-p icmp')
    segments.push('--icmp-type echo-request')
  } else if (protocol === 'icmpv6') {
    segments.push('-p ipv6-icmp')
    segments.push('--icmpv6-type echo-request')
  } else if (protocol !== 'all') {
    segments.push(`-p ${protocol}`)
    segments.push(`--dport ${port}`)
  }
  segments.push(`-j ${target}`)
  return segments.join(' ')
}

function buildNftablesSourceSegment(source, family = 'ipv4') {
  const normalized = normalizeFirewallSource(source)
  if (!normalized) return ''
  return `${family === 'ipv6' ? 'ip6' : 'ip'} saddr ${normalized}`
}

function buildNftablesDestinationSegment(destination, family = 'ipv4') {
  const normalized = normalizeFirewallSource(destination)
  if (!normalized) return ''
  return `${family === 'ipv6' ? 'ip6' : 'ip'} daddr ${normalized}`
}

function buildNftablesRuleStatement(rule = {}) {
  const protocol = normalizeProtocolValue(rule.protocol)
  const port = normalizeFirewallPortForProtocol(protocol, rule.port)
  const direction = normalizeFirewallDirection(rule.direction)
  const family = String(rule.family || '').toLowerCase() === 'ipv6' || protocol === 'icmpv6' || isIpv6Address(rule.source) || isIpv6Address(rule.destination) ? 'ipv6' : 'ipv4'
  const addressSegment = direction === 'outbound'
    ? buildNftablesDestinationSegment(rule.destination, family)
    : buildNftablesSourceSegment(rule.source, family)
  const action = normalizeFirewallAction(rule.action) === 'allow' ? 'accept' : 'reject'
  if (protocol === 'icmp') return [addressSegment, 'icmp type echo-request', action].filter(Boolean).join(' ')
  if (protocol === 'icmpv6') return [addressSegment, 'icmpv6 type echo-request', action].filter(Boolean).join(' ')
  if (protocol === 'all') return [addressSegment, action].filter(Boolean).join(' ')
  return [addressSegment, `${protocol} dport ${port}`, action].filter(Boolean).join(' ')
}

function buildNftablesAddCommand(rule = {}) {
  const direction = normalizeFirewallDirection(rule.direction)
  const chainName = direction === 'outbound' ? 'output' : 'input'
  const protocol = normalizeProtocolValue(rule.protocol)
  const family = String(rule.family || '').toLowerCase() === 'ipv6' || protocol === 'icmpv6' || isIpv6Address(rule.source) || isIpv6Address(rule.destination) ? 'ipv6' : 'ipv4'
  const tableFamily = family === 'ipv6' ? 'ip6' : 'inet'
  const fallbackTable = 'whssh'
  const fallbackChain = chainName
  const statement = buildNftablesRuleStatement(rule)
  const existingInet = `nft list chain inet filter ${chainName} >/dev/null 2>&1`
  const existingIp = `nft list chain ip filter ${chainName} >/dev/null 2>&1`
  const existingIp6 = `nft list chain ip6 filter ${chainName} >/dev/null 2>&1`
  const addToInet = `nft add rule inet filter ${chainName} ${statement}`
  const addToIp = `nft add rule ip filter ${chainName} ${statement}`
  const addToIp6 = `nft add rule ip6 filter ${chainName} ${statement}`
  const ensureFallbackTable = `nft list table ${tableFamily} ${fallbackTable} >/dev/null 2>&1 || nft add table ${tableFamily} ${fallbackTable}`
  const ensureFallbackChain = `nft list chain ${tableFamily} ${fallbackTable} ${fallbackChain} >/dev/null 2>&1 || nft add chain ${tableFamily} ${fallbackTable} ${fallbackChain} '{ type filter hook ${chainName} priority 0 ; policy accept ; }'`
  const addToFallback = `nft add rule ${tableFamily} ${fallbackTable} ${fallbackChain} ${statement}`
  if (family === 'ipv6') {
    return `if ${existingInet}; then ${addToInet}; elif ${existingIp6}; then ${addToIp6}; else ${ensureFallbackTable} && ${ensureFallbackChain} && ${addToFallback}; fi`
  }
  return `if ${existingInet}; then ${addToInet}; elif ${existingIp}; then ${addToIp}; else ${ensureFallbackTable} && ${ensureFallbackChain} && ${addToFallback}; fi`
}

async function detectFirewallBackend(sessionId) {
  const command = [
    'if command -v ufw >/dev/null 2>&1; then state=$(ufw status 2>/dev/null | sed -n "1s/Status: //p"); [ "$state" = "active" ] && { printf ufw; exit 0; }; fi',
    'if command -v firewall-cmd >/dev/null 2>&1; then state=$(firewall-cmd --state 2>/dev/null); [ "$state" = "running" ] && { printf firewalld; exit 0; }; fi',
    'if command -v nft >/dev/null 2>&1; then printf nftables; exit 0; fi',
    'if command -v iptables >/dev/null 2>&1; then printf iptables; exit 0; fi',
    'if command -v ufw >/dev/null 2>&1; then printf ufw; exit 0; fi',
    'if command -v firewall-cmd >/dev/null 2>&1; then printf firewalld; exit 0; fi',
    'printf none'
  ].join(' ; ')
  const result = await runCommand(sessionId, command)
  return (result.stdout || 'none').trim() || 'none'
}

function parseIptablesMode(versionText = '') {
  const text = String(versionText || '').toLowerCase()
  if (text.includes('nf_tables')) return 'nf_tables'
  if (text.includes('legacy')) return 'legacy'
  return text ? 'unknown' : 'missing'
}

async function resolveWritableFirewallBackend(sessionId, backend = 'auto') {
  const requestedBackend = String(backend || 'auto').trim().toLowerCase()
  if (requestedBackend && requestedBackend !== 'auto') {
    if (requestedBackend !== 'iptables') return requestedBackend
    const overview = await loadFirewallOverview(sessionId)
    const nftLayer = overview.diagnostics?.firewallLayers?.find(item => item.key === 'nftables')
    return overview.diagnostics?.iptablesMode === 'nf_tables' && nftLayer?.detected ? 'nftables' : 'iptables'
  }
  const overview = await loadFirewallOverview(sessionId)
  const recommendedBackend = overview?.recommendedBackend || overview?.backend
  if (recommendedBackend && recommendedBackend !== 'none') return recommendedBackend
  return detectFirewallBackend(sessionId)
}

function parseUfwRules(text) {
  const lines = String(text || '').split(/\r?\n/)
  const active = /^Status:\s+active/i.test(lines[0] || '')
  const rules = []
  for (const line of lines) {
    const match = line.match(/^\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT)\s{2,}(.+)$/i)
    if (!match) continue
    const [, id, target, actionText, directionText, peer] = match
    const normalizedTarget = target.replace(/\s*\(v6\)/gi, '').trim()
    const isAllTarget = /^Anywhere$/i.test(normalizedTarget)
    const [rawPort = normalizedTarget, rawProtocol = ''] = normalizedTarget.split('/')
    const port = isAllTarget ? '' : rawPort
    const protocol = isAllTarget ? 'all' : rawProtocol
    const direction = /out/i.test(directionText) ? 'outbound' : 'inbound'
    const peerValue = peer.replace(/\s*\(v6\)/gi, '')
    rules.push({
      id: `ufw-${id}`,
      backend: 'ufw',
      kind: 'numbered',
      number: Number(id),
      direction,
      target: isAllTarget ? 'ALL' : normalizedTarget,
      port,
      protocol,
      action: /allow/i.test(actionText) ? 'allow' : 'deny',
      source: direction === 'inbound' ? peerValue : 'any',
      destination: direction === 'outbound' ? peerValue : 'any',
      raw: line.trim()
    })
  }
  return { active, rules }
}

function parseFirewalldPortRules(text) {
  const rules = []
  String(text || '').trim().split(/\s+/).filter(Boolean).forEach((item, index) => {
    const [port = item, protocol = ''] = item.split('/')
    rules.push({
      id: `firewalld-port-${index}`,
      backend: 'firewalld',
      kind: 'port',
      direction: 'inbound',
      target: item,
      port,
      protocol,
      action: 'allow',
      source: 'any',
      raw: item
    })
  })
  return rules
}

function parseFirewalldServiceRules(text) {
  const rules = []
  String(text || '').trim().split(/\s+/).filter(Boolean).forEach((item, index) => {
    rules.push({
      id: `firewalld-service-${index}`,
      backend: 'firewalld',
      kind: 'service',
      direction: 'inbound',
      target: `service:${item}`,
      service: item,
      port: '',
      protocol: '',
      action: 'allow',
      source: 'any',
      raw: item
    })
  })
  return rules
}

function parseFirewalldRichRules(text) {
  const rules = []
  String(text || '').split(/\r?\n/).filter(Boolean).forEach((line, index) => {
    const portMatch = line.match(/port port="([^"]+)" protocol="([^"]+)"/)
    const protocolRuleMatch = line.match(/protocol value="([^"]+)"/)
    if (!portMatch && !protocolRuleMatch && !/\b(accept|reject|drop)\b/i.test(line)) return
    const sourceMatch = line.match(/source address="([^"]+)"/)
    const actionMatch = line.match(/\b(accept|reject|drop)\b(?!.*\b(accept|reject|drop)\b)/)
    const action = actionMatch?.[1] === 'accept' ? 'allow' : 'deny'
    const protocolValue = protocolRuleMatch?.[1] === 'ipv6-icmp' ? 'icmpv6' : (protocolRuleMatch?.[1] || 'all')
    const port = portMatch?.[1] || ''
    const protocol = portMatch?.[2] || protocolValue
    rules.push({
      id: `firewalld-rich-${index}`,
      backend: 'firewalld',
      kind: 'rich',
      direction: 'inbound',
      target: port ? `${port}/${protocol}` : protocol.toUpperCase(),
      port,
      protocol,
      action,
      source: sourceMatch?.[1] || 'any',
      raw: line.trim()
    })
  })
  return rules
}

function mergeFirewalldRules(targetMap, rules, scope) {
  for (const rule of rules) {
    const mergeKey = [rule.kind, rule.target, rule.service || '', rule.action, rule.source || 'any', rule.raw || ''].join('|')
    if (targetMap.has(mergeKey)) {
      const current = targetMap.get(mergeKey)
      current.scope = current.scope === scope ? current.scope : 'both'
      continue
    }
    targetMap.set(mergeKey, { ...rule, scope })
  }
}

function parseFirewalldRules(stateText, runtimePortsText, permanentPortsText, runtimeServicesText, permanentServicesText, runtimeRichText, permanentRichText) {
  const active = /running/i.test(String(stateText || '').trim())
  const merged = new Map()
  mergeFirewalldRules(merged, parseFirewalldPortRules(runtimePortsText), 'runtime')
  mergeFirewalldRules(merged, parseFirewalldPortRules(permanentPortsText), 'permanent')
  mergeFirewalldRules(merged, parseFirewalldServiceRules(runtimeServicesText), 'runtime')
  mergeFirewalldRules(merged, parseFirewalldServiceRules(permanentServicesText), 'permanent')
  mergeFirewalldRules(merged, parseFirewalldRichRules(runtimeRichText), 'runtime')
  mergeFirewalldRules(merged, parseFirewalldRichRules(permanentRichText), 'permanent')
  const rules = [...merged.values()].sort((a, b) => a.target.localeCompare(b.target) || a.kind.localeCompare(b.kind))
  return { active, rules }
}

function parseIptablesRules(text, family = 'ipv4') {
  const rules = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const raw = String(line || '').trim()
    if (!raw.startsWith('-A ')) continue
    const portMatch = raw.match(/--dports?\s+([0-9,:-]+)/)
    const actionMatch = raw.match(/-j\s+(ACCEPT|REJECT|DROP)\b/i)
    if (!actionMatch) continue
    const protocolMatch = raw.match(/-p\s+(tcp|udp|icmp|ipv6-icmp)\b/i)
    if (!portMatch && !protocolMatch) continue
    const chainMatch = raw.match(/^-A\s+(\S+)/)
    const sourceMatch = raw.match(/-s\s+(\S+)/)
    const destinationMatch = raw.match(/-d\s+(\S+)/)
    const port = portMatch ? portMatch[1].replace(/:/g, '-').replace(/,/g, ',') : ''
    const protocol = protocolMatch?.[1] === 'ipv6-icmp' ? 'icmpv6' : (protocolMatch?.[1]?.toLowerCase() || 'all')
    const action = /accept/i.test(actionMatch[1]) ? 'allow' : 'deny'
    const chain = chainMatch?.[1] || 'INPUT'
    const direction = /^OUTPUT$/i.test(chain) ? 'outbound' : 'inbound'
    rules.push({
      id: `iptables-${family}-${rules.length}`,
      backend: 'iptables',
      kind: 'iptables',
      family,
      chain,
      direction,
      target: port ? `${port}/${protocol}` : protocol.toUpperCase(),
      port,
      protocol,
      action,
      source: sourceMatch?.[1] || 'any',
      destination: destinationMatch?.[1] || 'any',
      scope: 'runtime',
      raw
    })
  }
  return rules
}

function parseNftablesRules(text) {
  const rules = []
  let currentTableFamily = ''
  let currentTableName = ''
  let currentChain = ''
  for (const line of String(text || '').split(/\r?\n/)) {
    const raw = String(line || '').trim()
    const tableMatch = raw.match(/^table\s+(\S+)\s+(\S+)\s*\{(?:\s*#.*)?$/)
    if (tableMatch) {
      currentTableFamily = tableMatch[1]
      currentTableName = tableMatch[2]
      currentChain = ''
      continue
    }
    const chainMatch = raw.match(/^chain\s+(\S+)\s*\{(?:\s*#.*)?$/)
    if (chainMatch) {
      currentChain = chainMatch[1]
      continue
    }
    if (raw === '}') {
      if (currentChain) {
        currentChain = ''
        continue
      }
      currentTableFamily = ''
      currentTableName = ''
      continue
    }
    if (!raw || raw.startsWith('#')) continue
    const statement = raw.replace(/\s+#\s*handle\s+\d+\s*$/i, '').trim()
    if (/^type\s+\w+\s+hook\s+\w+\b/i.test(statement) || /\bpolicy\s+(accept|reject|drop)\s*;?$/i.test(statement)) continue
    const protocolMatch = statement.match(/\b(tcp|udp)\s+dport\s+(\{[^}]+\}|[^\s]+)\b/i)
    const icmpMatch = statement.match(/\b(icmp|icmpv6)\s+type\s+echo-request\b/i)
    const actionMatch = statement.match(/\b(accept|reject|drop)\b/i)
    if (!actionMatch) continue
    if (!protocolMatch && !icmpMatch && currentTableName !== 'whssh') continue
    const sourceMatch = statement.match(/\b(?:ip|ip6)\s+saddr\s+(\S+)/)
    const destinationMatch = statement.match(/\b(?:ip|ip6)\s+daddr\s+(\S+)/)
    const handleMatch = raw.match(/#\s*handle\s+(\d+)/i)
    const family = /\b(ip6|icmpv6)\b/.test(statement) || currentTableFamily === 'ip6' ? 'ipv6' : 'ipv4'
    const protocol = protocolMatch?.[1]?.toLowerCase() || icmpMatch?.[1]?.toLowerCase() || 'all'
    const port = protocolMatch ? protocolMatch[2].replace(/[{}]/g, '').replace(/\s+/g, '').replace(/:/g, '-') : ''
    const action = /accept/i.test(actionMatch[1]) ? 'allow' : 'deny'
    const direction = /^output$/i.test(currentChain) ? 'outbound' : 'inbound'
    rules.push({
      id: `nftables-${rules.length}`,
      backend: 'nftables',
      kind: 'nftables',
      family,
      direction,
      tableFamily: currentTableFamily || (family === 'ipv6' ? 'ip6' : 'ip'),
      table: currentTableName || 'filter',
      chain: currentChain || 'input',
      handle: handleMatch ? Number(handleMatch[1]) : null,
      target: port ? `${port}/${protocol}` : protocol.toUpperCase(),
      port,
      protocol,
      action,
      source: sourceMatch?.[1] || 'any',
      destination: destinationMatch?.[1] || 'any',
      scope: 'runtime',
      raw: statement
    })
  }
  return rules
}

function parseDockerPublishedPorts(text) {
  const items = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const [name, ports] = line.split('|')
    const normalizedName = String(name || '').trim()
    const normalizedPorts = String(ports || '').trim()
    if (!normalizedName || !normalizedPorts || !normalizedPorts.includes('->')) continue
    items.push({ name: normalizedName, ports: normalizedPorts })
  }
  return items
}

function parseListeningAddress(value) {
  const text = String(value || '').trim()
  if (!text) return { address: '', port: '' }
  if (text.startsWith('[')) {
    const end = text.indexOf(']')
    const address = end > -1 ? text.slice(1, end) : text
    const port = end > -1 ? text.slice(end + 2) : ''
    return { address, port }
  }
  const index = text.lastIndexOf(':')
  if (index < 0) return { address: text, port: '' }
  return { address: text.slice(0, index), port: text.slice(index + 1) }
}

function normalizeListeningAddress(value) {
  const text = String(value || '').trim()
  if (!text || text === '*' || text === '0.0.0.0') return '0.0.0.0'
  if (text === '::' || text === '[::]' || text === ':::') return '::'
  return text.replace(/^\[|\]$/g, '')
}

function isPublicListeningAddress(value) {
  const normalized = normalizeListeningAddress(value)
  return normalized === '0.0.0.0' || normalized === '::' || normalized === '*'
}

function parseListeningPorts(text) {
  const items = []
  const seen = new Set()
  for (const line of String(text || '').split(/\r?\n/)) {
    const raw = String(line || '').trim()
    if (!raw) continue
    const columns = raw.split(/\s+/)
    let protocol = ''
    let local = ''
    let process = ''
    if (/^(tcp|udp)/i.test(columns[0] || '')) {
      protocol = String(columns[0]).toLowerCase().replace(/6$/, '')
      if (/^\d+$/.test(columns[1] || '')) {
        local = columns[3] || ''
        process = columns[6] || columns[columns.length - 1] || ''
      } else {
        local = columns[4] || ''
        const processMatch = raw.match(/users:\(\("([^"]+)"/)
        process = processMatch?.[1] || ''
      }
    }
    if (!protocol || !local) continue
    const parsed = parseListeningAddress(local)
    const port = String(parsed.port || '').replace(/\*$/, '')
    if (!/^\d+$/.test(port)) continue
    const address = normalizeListeningAddress(parsed.address)
    const processName = String(process || '').replace(/^\d+\//, '')
    const id = [protocol, address, port, processName].join('|')
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id: `listen-${items.length}`,
      protocol,
      port,
      address,
      process: processName || '-',
      exposure: isPublicListeningAddress(address) ? 'public' : 'local',
      raw
    })
  }
  return items.sort((a, b) => Number(a.port) - Number(b.port) || a.protocol.localeCompare(b.protocol) || a.address.localeCompare(b.address))
}

function createFirewallLayer({ key, label, detected, active, rules = [], note = '', mode = '', role = '' }) {
  return {
    key,
    label,
    detected: !!detected,
    active: !!active,
    ruleCount: Array.isArray(rules) ? rules.length : 0,
    note,
    mode,
    role,
    rules: Array.isArray(rules) ? rules : []
  }
}

function selectFirewallLayer(layers, context = {}) {
  const ufw = layers.find(item => item.key === 'ufw')
  const firewalld = layers.find(item => item.key === 'firewalld')
  const nftables = layers.find(item => item.key === 'nftables')
  const iptables = layers.find(item => item.key === 'iptables')
  if (ufw?.active) return { backend: 'ufw', active: true, rules: ufw.rules, manageable: true }
  if (firewalld?.active) return { backend: 'firewalld', active: true, rules: firewalld.rules, manageable: true }
  if (nftables?.detected && (nftables.ruleCount || context.iptablesMode === 'nf_tables')) return { backend: 'nftables', active: nftables.active, rules: nftables.rules, manageable: true }
  if (nftables?.ruleCount) return { backend: 'nftables', active: nftables.active, rules: nftables.rules, manageable: true }
  if (iptables?.ruleCount) return { backend: 'iptables', active: iptables.active, rules: iptables.rules, manageable: true }
  if (nftables?.detected) return { backend: 'nftables', active: nftables.active, rules: [], manageable: true }
  if (iptables?.detected) return { backend: 'iptables', active: iptables.active, rules: [], manageable: true }
  if (ufw?.detected) return { backend: 'ufw', active: false, rules: ufw.rules, manageable: true }
  if (firewalld?.detected) return { backend: 'firewalld', active: false, rules: firewalld.rules, manageable: true }
  return { backend: 'none', active: false, rules: [], manageable: false }
}

function buildFirewallDiagnostics(sections) {
  const ufwParsed = parseUfwRules(sections.UFW_STATUS)
  const firewalldParsed = parseFirewalldRules(
    sections.FIREWALLD_STATE,
    sections.FIREWALLD_RUNTIME_PORTS,
    sections.FIREWALLD_PERMANENT_PORTS,
    sections.FIREWALLD_RUNTIME_SERVICES,
    sections.FIREWALLD_PERMANENT_SERVICES,
    sections.FIREWALLD_RUNTIME_RICH,
    sections.FIREWALLD_PERMANENT_RICH
  )
  const iptablesMode = parseIptablesMode(sections.IPTABLES_VERSION)
  const nftDetected = String(sections.NFT_EXISTS || '') === '1'
  const rawIptablesRules = [
    ...parseIptablesRules(sections.IPTABLES_RULES, 'ipv4'),
    ...parseIptablesRules(sections.IP6TABLES_RULES, 'ipv6')
  ]
  const nftablesRules = parseNftablesRules(sections.NFT_RULESET)
  const iptablesIsNftView = iptablesMode === 'nf_tables' && nftDetected
  const iptablesRules = iptablesIsNftView ? [] : rawIptablesRules
  const firewallWarnings = []
  if (iptablesIsNftView) firewallWarnings.push('检测到 iptables 使用 nf_tables 后端，iptables 只是 nftables 兼容视图，默认按 nftables 管理。')
  if (iptablesMode === 'legacy' && rawIptablesRules.length && nftablesRules.length) firewallWarnings.push('检测到 iptables-legacy 与 nftables 同时存在规则，属于混用状态，建议只选择一个管理入口。')
  const firewallLayers = [
    createFirewallLayer({
      key: 'ufw',
      label: 'UFW',
      detected: String(sections.UFW_EXISTS || '') === '1',
      active: ufwParsed.active,
      rules: ufwParsed.rules,
      note: String(sections.UFW_EXISTS || '') !== '1'
        ? '当前服务器没有安装 UFW。'
        : (ufwParsed.active ? '优先显示 UFW 已编号规则。' : '已安装，但当前不是 active。')
    }),
    createFirewallLayer({
      key: 'firewalld',
      label: 'firewalld',
      detected: String(sections.FIREWALLD_EXISTS || '') === '1',
      active: firewalldParsed.active,
      rules: firewalldParsed.rules,
      note: String(sections.FIREWALLD_EXISTS || '') !== '1'
        ? '当前服务器没有安装 firewalld。'
        : (firewalldParsed.active ? '同时统计运行态和永久态规则。' : '已安装，但当前没有 running。')
    }),
    createFirewallLayer({
      key: 'iptables',
      label: iptablesMode === 'nf_tables' ? 'iptables-nft' : 'iptables',
      detected: String(sections.IPTABLES_EXISTS || '') === '1',
      active: iptablesRules.length > 0,
      rules: iptablesRules,
      mode: iptablesMode,
      role: iptablesIsNftView ? 'compat-view' : 'backend',
      note: iptablesIsNftView
        ? 'iptables 当前是 nf_tables 兼容视图，不作为独立管理入口。'
        : (iptablesRules.length ? '检测到直接写入 iptables 的端口规则。' : '没有解析到直接开放端口规则。')
    }),
    createFirewallLayer({
      key: 'nftables',
      label: 'nftables',
      detected: String(sections.NFT_EXISTS || '') === '1',
      active: /active/i.test(String(sections.NFT_SERVICE_STATE || '')) || nftablesRules.length > 0,
      rules: nftablesRules,
      note: nftablesRules.length ? '检测到 nftables 运行态规则。' : '没有解析到直接开放端口规则。'
    })
  ]
  const selected = selectFirewallLayer(firewallLayers, { iptablesMode })
  return {
    ...selected,
    recommendedBackend: selected.backend,
    diagnostics: {
      iptablesMode,
      firewallWarnings,
      firewallLayers,
      docker: {
        detected: String(sections.DOCKER_EXISTS || '') === '1',
        publishedPorts: parseDockerPublishedPorts(sections.DOCKER_PORTS),
        note: String(sections.DOCKER_EXISTS || '') === '1'
          ? '这里只列出容器发布到宿主机的端口映射。'
          : '没有检测到 Docker，或当前服务器未安装 Docker。'
      },
      listening: {
        items: parseListeningPorts(sections.LISTENING_PORTS),
        note: '监听端口代表服务已经在本机启动监听；能否从外网访问，还要结合防火墙和云安全组一起判断。'
      },
      cloudSecurityGroup: {
        detected: false,
        note: '云安全组无法从服务器内部可靠读取，请到云平台控制台核对入站规则。'
      }
    }
  }
}

async function loadFirewallOverview(sessionId) {
  const command = [
    "printf '__UFW_EXISTS__\\n'",
    "if command -v ufw >/dev/null 2>&1; then printf 1; else printf 0; fi",
    "printf '\\n__UFW_STATUS__\\n'",
    "if command -v ufw >/dev/null 2>&1; then ufw status numbered 2>/dev/null || ufw status 2>/dev/null; fi",
    "printf '\\n__FIREWALLD_EXISTS__\\n'",
    "if command -v firewall-cmd >/dev/null 2>&1; then printf 1; else printf 0; fi",
    "printf '\\n__FIREWALLD_STATE__\\n'",
    "if command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --state 2>/dev/null || printf not-running; else printf missing; fi",
    "printf '\\n__FIREWALLD_RUNTIME_PORTS__\\n'",
    "if command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --list-ports 2>/dev/null; fi",
    "printf '\\n__FIREWALLD_PERMANENT_PORTS__\\n'",
    "if command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --permanent --list-ports 2>/dev/null; fi",
    "printf '\\n__FIREWALLD_RUNTIME_SERVICES__\\n'",
    "if command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --list-services 2>/dev/null; fi",
    "printf '\\n__FIREWALLD_PERMANENT_SERVICES__\\n'",
    "if command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --permanent --list-services 2>/dev/null; fi",
    "printf '\\n__FIREWALLD_RUNTIME_RICH__\\n'",
    "if command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --list-rich-rules 2>/dev/null; fi",
    "printf '\\n__FIREWALLD_PERMANENT_RICH__\\n'",
    "if command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --permanent --list-rich-rules 2>/dev/null; fi",
    "printf '\\n__IPTABLES_EXISTS__\\n'",
    "if command -v iptables >/dev/null 2>&1; then printf 1; else printf 0; fi",
    "printf '\\n__IPTABLES_VERSION__\\n'",
    "if command -v iptables >/dev/null 2>&1; then iptables --version 2>/dev/null; fi",
    "printf '\\n__IPTABLES_RULES__\\n'",
    "if command -v iptables >/dev/null 2>&1; then iptables -S 2>/dev/null; fi",
    "printf '\\n__IP6TABLES_RULES__\\n'",
    "if command -v ip6tables >/dev/null 2>&1; then ip6tables -S 2>/dev/null; fi",
    "printf '\\n__NFT_EXISTS__\\n'",
    "if command -v nft >/dev/null 2>&1; then printf 1; else printf 0; fi",
    "printf '\\n__NFT_SERVICE_STATE__\\n'",
    "if command -v systemctl >/dev/null 2>&1; then systemctl is-active nftables 2>/dev/null || printf unknown; else printf unknown; fi",
    "printf '\\n__NFT_RULESET__\\n'",
    "if command -v nft >/dev/null 2>&1; then nft -a list ruleset 2>/dev/null; fi",
    "printf '\\n__DOCKER_EXISTS__\\n'",
    "if command -v docker >/dev/null 2>&1; then printf 1; else printf 0; fi",
    "printf '\\n__DOCKER_PORTS__\\n'",
    "if command -v docker >/dev/null 2>&1; then docker ps --format '{{.Names}}|{{.Ports}}' 2>/dev/null; fi",
    "printf '\\n__LISTENING_PORTS__\\n'",
    "if command -v ss >/dev/null 2>&1; then ss -lntupH 2>/dev/null || ss -lntuH 2>/dev/null; elif command -v netstat >/dev/null 2>&1; then netstat -lntup 2>/dev/null | tail -n +3; fi"
  ].join(' ; ')
  let usedUnprivilegedFallback = false
  let result
  try {
    result = await runPrivilegedCommand(sessionId, command)
  } catch (error) {
    if (!isPrivilegeUnavailableError(error)) throw error
    usedUnprivilegedFallback = true
    result = await runCommand(sessionId, command)
  }
  if (result?.code) result = await runCommand(sessionId, command)
  result = ensureCommandSuccess(result, '防火墙规则读取失败')
  const overview = buildFirewallDiagnostics(parseNamedSections(result.stdout))
  if (usedUnprivilegedFallback) {
    overview.diagnostics.firewallWarnings.push('当前账号没有 root 或免密 sudo 权限，已降级为普通用户读取；监听端口可读取，但部分防火墙规则可能为空或不完整。')
  }
  return overview
}

function parseNamedSections(text) {
  const sections = {}
  let current = ''
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.trim().match(/^__([A-Z0-9_]+)__$/)
    if (match) {
      current = match[1]
      if (!sections[current]) sections[current] = []
      continue
    }
    if (!current) continue
    sections[current].push(line)
  }
  return Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, lines.join('\n').trim()]))
}

function parseGroupNames(groupText) {
  return String(groupText || '')
    .split(/\r?\n/)
    .map(line => line.split('|')[0])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function parseShellEntries(text) {
  const shells = []
  const seen = new Set()
  for (const line of String(text || '').split(/\r?\n/)) {
    const shellPath = String(line || '').trim()
    if (!shellPath || !shellPath.startsWith('/') || seen.has(shellPath)) continue
    seen.add(shellPath)
    shells.push(shellPath)
  }
  return shells.length ? shells : ['/bin/sh', '/bin/bash']
}

function parseSystemUsers(passwdText, groupText, shadowText) {
  const groupsByGid = new Map()
  const membersByGroup = []
  for (const line of String(groupText || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [name, gidText, membersText] = line.split('|')
    const gid = Number(gidText)
    if (name) groupsByGid.set(gid, name)
    membersByGroup.push({
      name,
      members: String(membersText || '').split(',').map(item => item.trim()).filter(Boolean)
    })
  }

  const shadowByUser = new Map()
  for (const line of String(shadowText || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [name, passwordState] = line.split('|')
    shadowByUser.set(name, passwordState || '')
  }

  const users = []
  for (const line of String(passwdText || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [name, uidText, gidText, gecos, home, shellPath] = line.split('|')
    const uid = Number(uidText)
    const gid = Number(gidText)
    const groups = new Set()
    const primaryGroup = groupsByGid.get(gid)
    if (primaryGroup) groups.add(primaryGroup)
    for (const group of membersByGroup) {
      if (group.members.includes(name)) groups.add(group.name)
    }
    const passwordState = shadowByUser.get(name) || ''
    users.push({
      name,
      uid,
      gid,
      displayName: String(gecos || '').split(',')[0] || name,
      comment: gecos || '',
      home: home || '',
      shell: shellPath || '',
      groups: [...groups].filter(Boolean).sort((a, b) => a.localeCompare(b)),
      isAdmin: [...groups].some(group => group === 'sudo' || group === 'wheel'),
      locked: /^(!|\*)/.test(passwordState),
      isSystem: uid !== 0 && uid < 1000
    })
  }
  return users.sort((a, b) => a.uid - b.uid || a.name.localeCompare(b.name))
}

async function detectAdminGroup(sessionId) {
  const result = await runCommand(sessionId, 'if getent group sudo >/dev/null 2>&1; then printf sudo; elif getent group wheel >/dev/null 2>&1; then printf wheel; else printf sudo; fi')
  return (result.stdout || 'sudo').trim() || 'sudo'
}

async function loadSystemUsersOverview(sessionId) {
  const command = [
    "printf '__PASSWD__\\n'",
    "getent passwd | awk -F: 'BEGIN {OFS=\"|\"} {print $1,$3,$4,$5,$6,$7}'",
    "printf '__GROUP__\\n'",
    "getent group | awk -F: 'BEGIN {OFS=\"|\"} {print $1,$3,$4}'",
    "printf '__SHADOW__\\n'",
    "getent shadow | awk -F: 'BEGIN {OFS=\"|\"} {print $1,$2}'",
    "printf '__SHELLS__\\n'",
    "if [ -f /etc/shells ]; then grep '^/' /etc/shells; else printf '/bin/sh\\n/bin/bash\\n'; fi"
  ].join(' ; ')
  const result = ensureCommandSuccess(await runPrivilegedCommand(sessionId, command), '系统账户信息读取失败')
  const sections = parseNamedSections(result.stdout)
  return {
    adminGroup: await detectAdminGroup(sessionId),
    groups: parseGroupNames(sections.GROUP),
    shells: parseShellEntries(sections.SHELLS),
    users: parseSystemUsers(sections.PASSWD, sections.GROUP, sections.SHADOW)
  }
}

async function findSystemUser(sessionId, username) {
  const overview = await loadSystemUsersOverview(sessionId)
  return overview.users.find(item => item.name === username) || null
}

function buildFirewalldRichRule(payload) {
  const protocol = normalizeProtocolValue(payload.protocol)
  const port = normalizeFirewallPortForProtocol(protocol, payload.port)
  const action = normalizeFirewallAction(payload.action)
  const source = normalizeFirewallSource(payload.source)
  const family = protocol === 'icmpv6' || source.includes(':') ? 'ipv6' : 'ipv4'
  const segments = ['rule']
  if (source) {
    segments.push(`family="${family}"`)
    segments.push(`source address="${source}"`)
  }
  if (protocol === 'icmp') {
    segments.push('protocol value="icmp"')
  } else if (protocol === 'icmpv6') {
    segments.push('protocol value="ipv6-icmp"')
  } else if (protocol !== 'all') {
    segments.push(`port port="${port}" protocol="${protocol}"`)
  }
  segments.push(action === 'allow' ? 'accept' : 'reject')
  return segments.join(' ')
}

async function getRemoteDirectoryAccess(sessionId, targetPath) {
  const session = getSession(sessionId)
  const pathValue = normalizeRemoteDir(targetPath)
  if (session.protocol === 'ftp') {
    return { path: pathValue, writable: true, checked: false }
  }
  const result = await runCommand(sessionId, `[ -w '${escapeShell(pathValue)}' ] && printf writable || printf readonly`)
  return {
    path: pathValue,
    writable: result.stdout.trim() === 'writable',
    checked: true
  }
}

async function assertRemoteDirectoryWritable(sessionId, targetPath, actionLabel) {
  const access = await getRemoteDirectoryAccess(sessionId, targetPath)
  if (access.writable !== false) return access
  throw new Error(`当前目录 ${access.path} 没有写权限，无法${actionLabel}。请切换到有权限的目录，或使用具备权限的账号。`)
}

function escapeShell(value) {
  return String(value || '').replace(/'/g, "'\\''")
}

function escapeMysqlIdentifier(value) {
  const text = String(value || '').trim()
  if (!text) throw new Error('数据库对象名称不能为空')
  return '`' + text.replace(/`/g, '``') + '`'
}

function normalizeDatabaseConnectionConfig(payload = {}) {
  const type = normalizeDatabaseType(payload.type)
  if (type === 'sqlserver') throw new Error('当前版本暂不支持 SQL Server 连接')
  const host = String(payload.host || '').trim()
  const username = String(payload.username || '').trim()
  const password = String(payload.password || '')
  const database = String(payload.database || '').trim()
  const port = Number(payload.port || 3306)
  const useSshTunnel = payload.useSshTunnel === true
  const sessionId = String(payload.sessionId || '').trim()
  if (!host) throw new Error('请填写数据库主机地址')
  if (!username) throw new Error('请填写数据库用户名')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('数据库端口不正确')
  if (useSshTunnel && !sessionId) throw new Error('启用 SSH 隧道时缺少会话信息，请先连接服务器')
  return {
    type,
    host,
    port,
    username,
    password,
    database,
    useSshTunnel,
    sessionId
  }
}

function getDatabaseSession(id) {
  const session = databaseSessions.get(String(id || '').trim())
  if (!session) throw new Error('数据库连接不存在或已断开')
  return session
}

function normalizeDatabaseValue(value) {
  if (Buffer.isBuffer(value)) return `[二进制 ${value.length} bytes]`
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace('Z', '')
  if (typeof value === 'bigint') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  return value
}

function normalizeDatabaseRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { value: normalizeDatabaseValue(row) }
    }
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeDatabaseValue(value)]))
  })
}

function parseDatabaseCommand(sql = '') {
  return String(sql || '').trim().match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || ''
}

function parseUseDatabase(sql = '') {
  const match = String(sql || '').trim().match(/^USE\s+`?([^`\s;]+)`?/i)
  return String(match?.[1] || '').trim()
}

function parseCreateDatabase(sql = '') {
  const match = String(sql || '').trim().match(/^CREATE\s+DATABASE(?:\s+IF\s+NOT\s+EXISTS)?\s+`?([^`\s;]+)`?/i)
  return String(match?.[1] || '').trim()
}

function normalizeDatabaseIdentifier(value = '') {
  const database = String(value || '').trim()
  if (!database || database.length > 64 || /[\u0000/\\.]/.test(database)) {
    throw new Error('数据库名称不能为空，且不能包含 .、/、\\ 或空字符，最长 64 个字符')
  }
  return database
}

function parseMysqlQualifiedName(text = '') {
  const match = String(text || '').trim().match(/^(?:`([^`]+)`|([A-Za-z0-9_$]+))(?:\s*\.\s*(?:`([^`]+)`|([A-Za-z0-9_$]+)))?/)
  if (!match) return null
  const first = String(match[1] || match[2] || '').trim()
  const second = String(match[3] || match[4] || '').trim()
  if (!first) return null
  return second ? { database: first, table: second } : { database: '', table: first }
}

function parseStatementTableReference(sql = '') {
  const text = String(sql || '').trim()
  const patterns = [
    /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?(?:TABLE|VIEW)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(.+)$/i,
    /^ALTER\s+TABLE\s+(.+)$/i,
    /^DROP\s+(?:TEMPORARY\s+)?(?:TABLE|VIEW)\s+(?:IF\s+EXISTS\s+)?(.+)$/i,
    /^TRUNCATE\s+(?:TABLE\s+)?(.+)$/i,
    /^(?:INSERT|REPLACE)\s+INTO\s+(.+)$/i
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    return parseMysqlQualifiedName(match[1])
  }
  return null
}

function analyzeImportSql(sql = '', fallbackDatabase = '') {
  const statements = splitMysqlStatements(sql)
  const normalizedFallbackDatabase = String(fallbackDatabase || '').trim()
  const databases = new Set()
  const tableMap = new Map()
  const operations = new Map()
  let currentDatabase = normalizedFallbackDatabase

  const addOperation = (action, database = '', table = '') => {
    const normalizedAction = String(action || '').toUpperCase()
    const normalizedDatabase = String(database || '').trim()
    const normalizedTable = String(table || '').trim()
    const key = `${normalizedAction}|${normalizedDatabase}|${normalizedTable}`
    if (!operations.has(key)) operations.set(key, {
      action: normalizedAction,
      database: normalizedDatabase,
      table: normalizedTable
    })
  }

  for (const statement of statements) {
    const createdDatabase = parseCreateDatabase(statement)
    if (createdDatabase) {
      currentDatabase = createdDatabase
      databases.add(createdDatabase)
      addOperation('CREATE DATABASE', createdDatabase)
    }
    const switchedDatabase = parseUseDatabase(statement)
    if (switchedDatabase) {
      currentDatabase = switchedDatabase
      databases.add(switchedDatabase)
    }
    const objectRef = parseStatementTableReference(statement)
    const targetDatabase = String(objectRef?.database || currentDatabase || normalizedFallbackDatabase || '').trim()
    const actionMatch = String(statement || '').match(/^\s*(CREATE|ALTER|DROP|TRUNCATE|INSERT|REPLACE|UPDATE|DELETE)\b/i)
    if (actionMatch && !createdDatabase) addOperation(actionMatch[1], targetDatabase, objectRef?.table || '')
    if (!objectRef?.table || !targetDatabase) continue
    databases.add(targetDatabase)
    if (!tableMap.has(targetDatabase)) tableMap.set(targetDatabase, new Set())
    tableMap.get(targetDatabase).add(String(objectRef.table || '').trim())
  }

  return {
    statements,
    databases: [...databases].filter(Boolean),
    operations: [...operations.values()],
    tablesByDatabase: [...tableMap.entries()].map(([database, tables]) => ({
      database,
      tables: [...tables].filter(Boolean)
    }))
  }
}

function resolveImportDatabaseTarget(filePath, sql = '') {
  const analysis = analyzeImportSql(sql)
  const hasDatabaseStatement = analysis.statements.some(statement => {
    if (parseCreateDatabase(statement) || parseUseDatabase(statement)) return true
    return !!parseStatementTableReference(statement)?.database
  })
  if (hasDatabaseStatement) {
    return { kind: 'database', database: '', analysis }
  }

  const tableRefs = analysis.statements
    .map(statement => parseStatementTableReference(statement))
    .filter(item => item?.table && !item.database)
  if (!tableRefs.length) {
    return { kind: 'database', database: '', analysis }
  }
  const tableName = tableRefs[0].table
  const fileName = path.basename(String(filePath || ''), path.extname(String(filePath || '')))
  return {
    kind: 'table',
    database: normalizeDatabaseIdentifier(tableName || fileName),
    analysis
  }
}

async function buildImportPreview(session, filePaths, fallbackDatabase = '') {
  const normalizedPaths = (Array.isArray(filePaths) ? filePaths : []).map(item => String(item || '').trim()).filter(Boolean)
  const mergedDatabases = new Set()
  const mergedTableMap = new Map()
  const mergedOperations = new Map()

  for (const filePath of normalizedPaths) {
    const sql = fs.readFileSync(filePath, 'utf8')
    const analysis = analyzeImportSql(sql, fallbackDatabase)
    for (const database of analysis.databases) {
      if (database) mergedDatabases.add(database)
    }
    for (const item of analysis.tablesByDatabase) {
      if (!mergedTableMap.has(item.database)) mergedTableMap.set(item.database, new Set())
      for (const table of item.tables || []) {
        if (table) mergedTableMap.get(item.database).add(table)
      }
    }
    for (const item of analysis.operations || []) {
      const key = `${item.action}|${item.database}|${item.table}`
      if (!mergedOperations.has(key)) mergedOperations.set(key, item)
    }
  }

  const [databaseRows] = await session.connection.query('SHOW DATABASES')
  const existingDatabases = new Set((Array.isArray(databaseRows) ? databaseRows : []).map(row => String(Object.values(row || {})[0] || '').trim()).filter(Boolean))
  const overlappingDatabases = [...mergedDatabases].filter(name => existingDatabases.has(name))
  const overlappingTables = []

  for (const [database, tablesSet] of mergedTableMap.entries()) {
    if (!database || !tablesSet.size) continue
    try {
      const [rows] = await session.connection.query(`SHOW FULL TABLES FROM ${escapeMysqlIdentifier(database)} WHERE Table_type IN ('BASE TABLE', 'VIEW')`)
      const existed = new Set((Array.isArray(rows) ? rows : []).map(row => String(Object.values(row || {})[0] || '').trim()).filter(Boolean))
      const duplicates = [...tablesSet].filter(name => existed.has(name))
      if (duplicates.length) overlappingTables.push({ database, tables: duplicates })
    } catch (error) {
    }
  }

  return {
    filePaths: normalizedPaths,
    databases: [...mergedDatabases],
    tablesByDatabase: [...mergedTableMap.entries()].map(([database, tables]) => ({
      database,
      tables: [...tables]
    })),
    operations: [...mergedOperations.values()],
    overlappingDatabases,
    overlappingTables
  }
}

function normalizeDatabasePage(value, fallback = 1) {
  const page = Number(value)
  if (!Number.isInteger(page) || page < 1) return fallback
  return page
}

function normalizeDatabasePageSize(value, fallback = 50) {
  const pageSize = Number(value)
  if (!Number.isInteger(pageSize) || pageSize < 1) return fallback
  return Math.min(pageSize, 200)
}

async function closeDatabaseSession(id) {
  const sessionId = String(id || '').trim()
  const session = databaseSessions.get(sessionId)
  if (!session) return
  databaseSessions.delete(sessionId)
  try {
    await session.connection.end()
  } catch (error) {
    try {
      session.connection.destroy()
    } catch (destroyError) {
      // 忽略关闭失败，避免阻断应用退出。
    }
  }
  try {
    session.tunnelStream?.destroy?.()
  } catch (error) {
    // 忽略 SSH 隧道流销毁失败，避免影响数据库断开。
  }
}

async function ensureDatabaseSelection(session, database = '') {
  const targetDatabase = String(database || '').trim()
  if (!targetDatabase || targetDatabase === session.activeDatabase) return
  await session.connection.query(`USE ${escapeMysqlIdentifier(targetDatabase)}`)
  session.activeDatabase = targetDatabase
}

function isDatabaseBinaryType(type = '') {
  return /\b(tinyblob|blob|mediumblob|longblob|binary|varbinary|bit|geometry|point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection)\b/i.test(String(type || ''))
}

function isDatabaseTextType(type = '') {
  return /\b(char|varchar|text|tinytext|mediumtext|longtext|enum|set|json)\b/i.test(String(type || ''))
}

function isDatabaseIntegerType(type = '') {
  return /\b(tinyint|smallint|mediumint|int|integer|bigint)\b/i.test(String(type || ''))
}

function isDatabaseTimestampType(type = '') {
  return /\b(timestamp|datetime)\b/i.test(String(type || ''))
}

function buildDatabaseEditableExtraClause(extra = '') {
  const text = String(extra || '').trim()
  if (!text) return ''
  const onUpdateMatch = text.match(/on update\s+.+$/i)
  return onUpdateMatch ? onUpdateMatch[0] : ''
}

function formatMysqlColumnDefaultLiteral(value, type = '') {
  if (value === null || value === undefined) return 'NULL'
  const text = String(value)
  const normalized = text.trim().toUpperCase()
  if (/^CURRENT_TIMESTAMP(?:\(\d+\))?$/.test(normalized)) return normalized
  if (/^(CURRENT_DATE|CURRENT_TIME|NOW\(\))$/.test(normalized)) return normalized
  if (/\b(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)\b/i.test(String(type || '')) && /^-?\d+(?:\.\d+)?$/.test(text.trim())) {
    return text.trim()
  }
  return formatMysqlSqlLiteral(text)
}

function buildDatabaseColumnDefinition(column = {}) {
  const name = String(column.name || '').trim()
  const type = String(column.type || '').trim()
  if (!name) throw new Error('字段名称不能为空')
  if (!type) throw new Error('字段类型不能为空')
  let sql = `${escapeMysqlIdentifier(name)} ${type}`
  if (column.collation && isDatabaseTextType(type)) {
    sql += ` COLLATE ${String(column.collation).trim()}`
  }
  sql += column.nullable ? ' NULL' : ' NOT NULL'
  if (column.defaultMode === 'null') {
    sql += ' DEFAULT NULL'
  } else if (column.defaultMode === 'value') {
    sql += ` DEFAULT ${formatMysqlColumnDefaultLiteral(column.defaultValue, type)}`
  }
  const extraParts = []
  if (column.autoIncrement) extraParts.push('AUTO_INCREMENT')
  if (column.onUpdateCurrentTimestamp) extraParts.push('ON UPDATE CURRENT_TIMESTAMP')
  if (!extraParts.length && column.extraClause) extraParts.push(column.extraClause)
  if (extraParts.length) sql += ` ${extraParts.join(' ')}`
  sql += ` COMMENT ${formatMysqlSqlLiteral(String(column.comment || ''))}`
  return sql
}

function normalizeDatabaseColumnMutationPayload(payload = {}) {
  const nextName = String(payload.name || '').trim()
  const nextType = String(payload.type || '').trim()
  const comment = String(payload.comment || '')
  const defaultMode = ['none', 'null', 'value'].includes(String(payload.defaultMode || 'none'))
    ? String(payload.defaultMode || 'none')
    : 'none'
  if (!nextName) throw new Error('字段名称不能为空')
  if (!nextType) throw new Error('字段类型不能为空')
  const supportsCollation = isDatabaseTextType(nextType)
  const supportsAutoIncrement = isDatabaseIntegerType(nextType)
  const supportsOnUpdateCurrentTimestamp = isDatabaseTimestampType(nextType)
  const autoIncrement = supportsAutoIncrement && payload.autoIncrement === true
  const nullable = autoIncrement ? false : payload.nullable === true
  const collation = supportsCollation ? String(payload.collation || '').trim() : ''
  const onUpdateCurrentTimestamp = supportsOnUpdateCurrentTimestamp && payload.onUpdateCurrentTimestamp === true
  const extraClause = String(payload.extraClause || '').trim()
  const key = ['PRI', 'UNI'].includes(String(payload.key || '').trim().toUpperCase())
    ? String(payload.key || '').trim().toUpperCase()
    : ''
  if (defaultMode === 'null' && !nullable) throw new Error('非空字段不能设置默认 NULL')
  return {
    oldName: String(payload.oldName || '').trim(),
    name: nextName,
    type: nextType,
    key,
    nullable,
    defaultMode: autoIncrement ? 'none' : defaultMode,
    defaultValue: payload.defaultValue ?? '',
    comment,
    collation,
    extraClause,
    autoIncrement,
    onUpdateCurrentTimestamp
  }
}

function findDatabaseSingleUniqueIndex(indexMeta = [], columnName = '') {
  const targetName = String(columnName || '').trim()
  if (!targetName) return null
  return (Array.isArray(indexMeta) ? indexMeta : []).find(item => item.kind === 'unique' && Array.isArray(item.columns) && item.columns.length === 1 && item.columns[0] === targetName) || null
}

function buildDatabaseKeyAlterClauses(metadata, currentField, nextColumn) {
  const clauses = []
  const currentKey = String(currentField?.key || '').trim().toUpperCase()
  const nextKey = String(nextColumn?.key || '').trim().toUpperCase()
  const currentName = String(currentField?.name || '').trim()
  const nextName = String(nextColumn?.name || currentName).trim()
  const primaryIndex = (metadata?.indexMeta || []).find(item => item.kind === 'primary') || null
  const currentUniqueIndex = findDatabaseSingleUniqueIndex(metadata?.indexMeta || [], currentName)

  if (currentKey === nextKey) return clauses

  if (currentKey === 'PRI' && nextKey !== 'PRI') {
    clauses.push('DROP PRIMARY KEY')
  }
  if (currentKey === 'UNI' && nextKey !== 'UNI' && currentUniqueIndex?.name) {
    clauses.push(`DROP INDEX ${escapeMysqlIdentifier(currentUniqueIndex.name)}`)
  }

  if (nextKey === 'PRI') {
    if (primaryIndex && !(primaryIndex.columns.length === 1 && primaryIndex.columns[0] === currentName && currentKey === 'PRI')) {
      clauses.push('DROP PRIMARY KEY')
    }
    if (currentKey === 'UNI' && currentUniqueIndex?.name) {
      clauses.push(`DROP INDEX ${escapeMysqlIdentifier(currentUniqueIndex.name)}`)
    }
    clauses.push(`ADD PRIMARY KEY (${escapeMysqlIdentifier(nextName)})`)
  }

  if (nextKey === 'UNI') {
    if (currentKey === 'PRI') {
      clauses.push('DROP PRIMARY KEY')
    }
    if (!(currentKey === 'UNI' && currentUniqueIndex)) {
      clauses.push(`ADD UNIQUE KEY ${escapeMysqlIdentifier(`uniq_${nextName}`)} (${escapeMysqlIdentifier(nextName)})`)
    }
  }

  return [...new Set(clauses)]
}

function normalizeDatabaseFieldMeta(row = {}) {
  const name = String(row?.Field || '').trim()
  const type = String(row?.Type || '').trim()
  const key = String(row?.Key || '').trim().toUpperCase()
  const nullable = String(row?.Null || '').trim().toUpperCase() === 'YES'
  const extra = String(row?.Extra || '').trim()
  return {
    name,
    type,
    nullable,
    defaultValue: row?.Default ?? null,
    collation: String(row?.Collation || '').trim(),
    extra,
    comment: String(row?.Comment || '').trim(),
    key,
    isPrimary: key === 'PRI',
    isUnique: key === 'PRI' || key === 'UNI',
    binary: isDatabaseBinaryType(type),
    extraClause: buildDatabaseEditableExtraClause(extra),
    schemaReadOnly: /\b(virtual generated|stored generated)\b/i.test(extra) || isDatabaseBinaryType(type),
    readOnly: /\b(auto_increment|virtual generated|stored generated)\b/i.test(extra) || isDatabaseBinaryType(type)
  }
}

function extractDatabaseColumnLength(type = '') {
  const text = String(type || '').trim()
  const match = text.match(/^[^(]+\(([^)]+)\)/)
  return match ? String(match[1] || '').trim() : ''
}

const DATABASE_SCHEMA_COLUMN_LABELS = {
  Field: '字段名',
  Type: '字段类型',
  Length: '长度',
  Collation: '排序规则',
  Null: '可为空',
  Key: '键',
  Default: '默认值',
  Extra: '额外',
  Comment: '字段备注'
}

const DATABASE_SCHEMA_COLUMN_ORDER = ['Field', 'Type', 'Length', 'Collation', 'Null', 'Key', 'Default', 'Extra', 'Comment']

function normalizeDatabaseIndexMeta(rows = []) {
  const groups = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const keyName = String(row?.Key_name || '').trim()
    const columnName = String(row?.Column_name || '').trim()
    if (!keyName || !columnName) continue
    if (Number(row?.Non_unique || 0) !== 0) continue
    const entry = groups.get(keyName) || {
      name: keyName,
      kind: keyName === 'PRIMARY' ? 'primary' : 'unique',
      columns: []
    }
    entry.columns.push({
      name: columnName,
      seq: Number(row?.Seq_in_index || 0)
    })
    groups.set(keyName, entry)
  }
  return [...groups.values()]
    .map(item => ({
      ...item,
      columns: item.columns.sort((a, b) => a.seq - b.seq).map(column => column.name)
    }))
    .sort((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name)
      return a.kind === 'primary' ? -1 : 1
    })
}

function resolveDatabaseIdentityKey(fieldMeta = [], indexMeta = []) {
  const fieldMap = new Map((Array.isArray(fieldMeta) ? fieldMeta : []).map(item => [item.name, item]))
  return (Array.isArray(indexMeta) ? indexMeta : []).find(item => {
    if (!item.columns.length || !item.columns.every(column => fieldMap.has(column))) return false
    if (item.kind === 'primary') return true
    return item.columns.every(column => fieldMap.get(column)?.nullable === false)
  }) || null
}

async function readDatabaseTableMetadata(session, database, table) {
  await ensureDatabaseSelection(session, database)
  const target = `${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)}`
  const [columnRows] = await session.connection.query(`SHOW FULL COLUMNS FROM ${target}`)
  let indexRows = []
  try {
    const [rows] = await session.connection.query(`SHOW INDEX FROM ${target}`)
    indexRows = Array.isArray(rows) ? rows : []
  } catch (error) {
    indexRows = []
  }
  const fieldMeta = (Array.isArray(columnRows) ? columnRows : []).map(normalizeDatabaseFieldMeta).filter(item => item.name)
  const indexMeta = normalizeDatabaseIndexMeta(indexRows)
  const identityKey = resolveDatabaseIdentityKey(fieldMeta, indexMeta)
  return {
    columnRows: Array.isArray(columnRows) ? columnRows : [],
    fieldMeta,
    indexMeta,
    identityKey
  }
}

async function readDatabaseObjectMeta(session, database, table) {
  await ensureDatabaseSelection(session, database)
  const [rows] = await session.connection.query(`SHOW FULL TABLES FROM ${escapeMysqlIdentifier(database)} LIKE ?`, [String(table || '').trim()])
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) throw new Error(`未找到 ${database}.${table} 对应的表或视图`)
  const values = Object.values(row || {})
  return {
    name: String(values[0] || '').trim(),
    type: String(row?.Table_type || values[1] || '').trim().toLowerCase() === 'view' ? 'view' : 'table'
  }
}

async function buildTableDumpSql(session, database, table) {
  const object = await readDatabaseObjectMeta(session, database, table)
  const target = `${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(object.name)}`
  const parts = [
    '-- WH SSH MySQL table dump',
    `-- Database: ${database}`,
    `-- Object: ${object.name}`,
    `-- Exported at: ${new Date().toISOString()}`
  ]
  if (object.type === 'view') throw new Error(`当前版本暂不支持把视图 ${object.name} 按“数据表”导出`)
  const [createRows] = await session.connection.query(`SHOW CREATE TABLE ${target}`)
  const createTableSql = readMysqlCreateStatement(createRows?.[0], 'Create Table')
  parts.push('', `DROP TABLE IF EXISTS ${escapeMysqlIdentifier(object.name)};`, `${createTableSql};`)
  const [rows, fields] = await session.connection.query(`SELECT * FROM ${target}`)
  const rowCount = Array.isArray(rows) ? rows.length : 0
  const insertStatements = buildMysqlInsertStatements(database, object.name, rows, fields, { qualifyDatabase: false })
  if (insertStatements.length) {
    parts.push('', `-- Data for table ${object.name}`)
    parts.push(...insertStatements)
  }
  return {
    sql: `${parts.join('\n')}\n`,
    tableCount: 1,
    viewCount: 0,
    rowCount,
    objectType: 'table'
  }
}

async function exportDatabaseTablesToDirectory(session, database, targetDir) {
  const targetDatabase = String(database || session.activeDatabase || '').trim()
  if (!targetDatabase) throw new Error('请选择要导出数据表的数据库')
  const [objectRows] = await session.connection.query(`SHOW FULL TABLES FROM ${escapeMysqlIdentifier(targetDatabase)} WHERE Table_type = 'BASE TABLE'`)
  const tableNames = (Array.isArray(objectRows) ? objectRows : [])
    .map(row => String(Object.values(row || {})[0] || '').trim())
    .filter(Boolean)
  if (!tableNames.length) throw new Error(`数据库 ${targetDatabase} 下没有可导出的数据表`)
  const exportRoot = path.join(targetDir, targetDatabase)
  fs.mkdirSync(exportRoot, { recursive: true })
  let rowCount = 0
  for (const tableName of tableNames) {
    const exported = await buildTableDumpSql(session, targetDatabase, tableName)
    rowCount += Number(exported.rowCount || 0)
    fs.writeFileSync(path.join(exportRoot, `${tableName}.sql`), exported.sql, 'utf8')
  }
  return {
    exportRoot,
    tableCount: tableNames.length,
    rowCount
  }
}

function buildInsertRowPayload(fieldMeta = [], valuesByColumn = {}) {
  const editableFields = new Map((Array.isArray(fieldMeta) ? fieldMeta : []).filter(item => !item.readOnly).map(item => [item.name, item]))
  const columns = []
  const values = []
  for (const [key, value] of Object.entries(valuesByColumn || {})) {
    const name = String(key || '').trim()
    if (!editableFields.has(name)) continue
    columns.push(name)
    values.push(value)
  }
  return { columns, values }
}

function buildAddColumnPositionClause(position = {}) {
  const mode = String(position?.mode || 'last').trim().toLowerCase()
  if (mode === 'first') return ' FIRST'
  if (mode === 'after') {
    const afterColumn = String(position?.afterColumn || '').trim()
    if (!afterColumn) throw new Error('请选择新增字段要放在哪个字段后面')
    return ` AFTER ${escapeMysqlIdentifier(afterColumn)}`
  }
  return ''
}

function buildDatabaseWhereClause(columns = [], valuesByColumn = {}) {
  const clauses = []
  const values = []
  for (const columnName of Array.isArray(columns) ? columns : []) {
    if (!Object.prototype.hasOwnProperty.call(valuesByColumn, columnName)) {
      throw new Error(`缺少定位当前行所需的键列 ${columnName}`)
    }
    const value = valuesByColumn[columnName]
    const escapedColumn = escapeMysqlIdentifier(columnName)
    if (value === null) {
      clauses.push(`${escapedColumn} IS NULL`)
      continue
    }
    clauses.push(`${escapedColumn} = ?`)
    values.push(value)
  }
  if (!clauses.length) throw new Error('当前表未识别到可用的主键或唯一键')
  return {
    sql: clauses.join(' AND '),
    values
  }
}

function openDatabaseTunnelStream(sessionId, host, port) {
  const session = ensureSshSession(sessionId)
  return new Promise((resolve, reject) => {
    session.conn.forwardOut('127.0.0.1', 0, host, Number(port || 3306), (error, stream) => {
      if (error) {
        reject(new Error(`SSH 隧道建立失败：${error.message}`))
        return
      }
      resolve(stream)
    })
  })
}

function escapeMysqlStringLiteral(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\u0000/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u0008/g, '\\b')
    .replace(/\t/g, '\\t')
    .replace(/\u001a/g, '\\Z')
    .replace(/'/g, "\\'")
}

function formatMysqlSqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Date) return `'${escapeMysqlStringLiteral(value.toISOString().replace('T', ' ').replace('Z', ''))}'`
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return `'${escapeMysqlStringLiteral(JSON.stringify(value))}'`
  }
  return `'${escapeMysqlStringLiteral(String(value))}'`
}

function readMysqlCreateStatement(row, preferredKey) {
  if (!row || typeof row !== 'object') throw new Error('读取建表语句失败')
  if (preferredKey && row[preferredKey]) return String(row[preferredKey])
  const entry = Object.entries(row).find(([key]) => /^Create /i.test(key))
  if (entry?.[1]) return String(entry[1])
  const values = Object.values(row)
  const candidate = values.find(value => typeof value === 'string' && /^(CREATE|create)\s+/m.test(value))
  if (candidate) return String(candidate)
  throw new Error('读取建表语句失败')
}

function ensureMysqlCreateDatabaseIfNotExists(sql = '', database = '') {
  const source = String(sql || '').trim()
  if (!source) return `CREATE DATABASE IF NOT EXISTS ${escapeMysqlIdentifier(database)};`
  if (/^CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\b/i.test(source)) return source
  if (/^CREATE\s+DATABASE\b/i.test(source)) {
    return source.replace(/^CREATE\s+DATABASE\b/i, 'CREATE DATABASE IF NOT EXISTS')
  }
  return source
}

function buildMysqlInsertStatements(database, table, rows, fields, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return []
  const columnNames = (Array.isArray(fields) ? fields : []).map(field => String(field?.name || '').trim()).filter(Boolean)
  if (!columnNames.length) return []
  const escapedColumns = columnNames.map(name => escapeMysqlIdentifier(name)).join(', ')
  const target = options.qualifyDatabase === false
    ? escapeMysqlIdentifier(table)
    : `${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)}`
  const batchSize = 200
  const statements = []
  for (let index = 0; index < list.length; index += batchSize) {
    const batch = list.slice(index, index + batchSize)
    const valuesSql = batch.map(row => `(${columnNames.map(name => formatMysqlSqlLiteral(row?.[name])).join(', ')})`).join(',\n')
    statements.push(`INSERT INTO ${target} (${escapedColumns}) VALUES\n${valuesSql};`)
  }
  return statements
}

async function buildDatabaseDumpSql(session, database) {
  const targetDatabase = String(database || session.activeDatabase || '').trim()
  if (!targetDatabase) throw new Error('请选择要导出的数据库')
  const parts = [
    '-- WH SSH MySQL dump',
    `-- Database: ${targetDatabase}`,
    `-- Exported at: ${new Date().toISOString()}`,
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS=0;'
  ]
  try {
    const [databaseRows] = await session.connection.query(`SHOW CREATE DATABASE ${escapeMysqlIdentifier(targetDatabase)}`)
    const createDatabaseSql = ensureMysqlCreateDatabaseIfNotExists(readMysqlCreateStatement(databaseRows?.[0], 'Create Database'), targetDatabase)
    parts.push('', `${createDatabaseSql};`)
  } catch (error) {
    parts.push('', `CREATE DATABASE IF NOT EXISTS ${escapeMysqlIdentifier(targetDatabase)};`)
  }
  parts.push('', `USE ${escapeMysqlIdentifier(targetDatabase)};`)

  const [objectRows] = await session.connection.query(`SHOW FULL TABLES FROM ${escapeMysqlIdentifier(targetDatabase)} WHERE Table_type IN ('BASE TABLE', 'VIEW')`)
  const objects = (Array.isArray(objectRows) ? objectRows : []).map(row => {
    const values = Object.values(row || {})
    return {
      name: String(values[0] || '').trim(),
      type: String(row?.Table_type || values[1] || '').trim().toUpperCase()
    }
  }).filter(item => item.name)

  const tables = objects.filter(item => item.type !== 'VIEW')
  const views = objects.filter(item => item.type === 'VIEW')
  let rowCount = 0

  for (const item of tables) {
    const target = `${escapeMysqlIdentifier(targetDatabase)}.${escapeMysqlIdentifier(item.name)}`
    const [createRows] = await session.connection.query(`SHOW CREATE TABLE ${target}`)
    const createTableSql = readMysqlCreateStatement(createRows?.[0], 'Create Table')
    parts.push('', `DROP TABLE IF EXISTS ${escapeMysqlIdentifier(item.name)};`, `${createTableSql};`)
    const [rows, fields] = await session.connection.query(`SELECT * FROM ${target}`)
    rowCount += Array.isArray(rows) ? rows.length : 0
    const insertStatements = buildMysqlInsertStatements(targetDatabase, item.name, rows, fields)
    if (insertStatements.length) {
      parts.push('', `-- Data for table ${item.name}`)
      parts.push(...insertStatements)
    }
  }

  for (const item of views) {
    const target = `${escapeMysqlIdentifier(targetDatabase)}.${escapeMysqlIdentifier(item.name)}`
    const [createRows] = await session.connection.query(`SHOW CREATE VIEW ${target}`)
    const createViewSql = readMysqlCreateStatement(createRows?.[0], 'Create View')
    parts.push('', `DROP VIEW IF EXISTS ${escapeMysqlIdentifier(item.name)};`, `${createViewSql};`)
  }

  parts.push('', 'SET FOREIGN_KEY_CHECKS=1;')
  return {
    sql: `${parts.join('\n')}\n`,
    tableCount: tables.length,
    viewCount: views.length,
    rowCount
  }
}

// 支持字符串、注释和 DELIMITER 指令，避免 SQL 文件按分号误切。
function splitMysqlStatements(sql = '') {
  const source = stripTextBom(String(sql || '')).replace(/\r\n?/g, '\n')
  const statements = []
  let buffer = ''
  let delimiter = ';'
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let inLineComment = false
  let inBlockComment = false
  let lineStart = true
  let index = 0

  while (index < source.length) {
    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inLineComment && !inBlockComment && lineStart) {
      const directiveMatch = source.slice(index).match(/^[ \t]*DELIMITER[ \t]+([^\n]+)/i)
      if (directiveMatch) {
        delimiter = String(directiveMatch[1] || '').trim() || ';'
        index += directiveMatch[0].length
        while (index < source.length && source[index] !== '\n') index += 1
        if (source[index] === '\n') index += 1
        lineStart = true
        continue
      }
    }

    const char = source[index]
    const nextChar = source[index + 1]

    if (inLineComment) {
      buffer += char
      index += 1
      if (char === '\n') {
        inLineComment = false
        lineStart = true
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        buffer += '*/'
        index += 2
        lineStart = false
        inBlockComment = false
        continue
      }
      buffer += char
      lineStart = char === '\n'
      index += 1
      continue
    }

    if (inSingleQuote || inDoubleQuote || inBacktick) {
      buffer += char
      if ((inSingleQuote || inDoubleQuote) && char === '\\' && index + 1 < source.length) {
        buffer += source[index + 1]
        index += 2
        lineStart = false
        continue
      }
      if (inSingleQuote && char === "'") inSingleQuote = false
      else if (inDoubleQuote && char === '"') inDoubleQuote = false
      else if (inBacktick && char === '`') inBacktick = false
      lineStart = char === '\n'
      index += 1
      continue
    }

    if (char === '-' && nextChar === '-' && /\s/.test(source[index + 2] || '')) {
      buffer += '--'
      index += 2
      inLineComment = true
      lineStart = false
      continue
    }
    if (char === '#') {
      buffer += '#'
      index += 1
      inLineComment = true
      lineStart = false
      continue
    }
    if (char === '/' && nextChar === '*') {
      buffer += '/*'
      index += 2
      inBlockComment = true
      lineStart = false
      continue
    }

    if (delimiter && source.slice(index, index + delimiter.length) === delimiter) {
      const statement = buffer.trim()
      if (hasExecutableMysqlStatement(statement)) statements.push(statement)
      buffer = ''
      index += delimiter.length
      lineStart = false
      continue
    }

    if (char === "'") inSingleQuote = true
    else if (char === '"') inDoubleQuote = true
    else if (char === '`') inBacktick = true

    buffer += char
    if (char === '\n') lineStart = true
    else if (lineStart) lineStart = char === ' ' || char === '\t'
    else lineStart = false
    index += 1
  }

  const lastStatement = buffer.trim()
  if (hasExecutableMysqlStatement(lastStatement)) statements.push(lastStatement)
  return statements
}

function hasExecutableMysqlStatement(statement = '') {
  const stripped = String(statement || '')
    .replace(/\/\*(?!\!)[\s\S]*?\*\//g, ' ')
    .replace(/^\s*--.*$/gm, ' ')
    .replace(/^\s*#.*$/gm, ' ')
    .trim()
  return !!stripped
}

async function importDatabaseSql(session, database, sql) {
  const targetDatabase = String(database || session.activeDatabase || '').trim()
  const statements = splitMysqlStatements(sql)
  if (!statements.length) throw new Error('SQL 文件中没有可执行的语句')
  const hasExplicitDatabaseSelection = statements.some(statement => parseCreateDatabase(statement) || parseUseDatabase(statement))
  if (targetDatabase && !hasExplicitDatabaseSelection) await ensureDatabaseSelection(session, targetDatabase)
  const startedAt = Date.now()
  let executedCount = 0
  const hintedDatabases = []
  for (const statement of statements) {
    const createdDatabase = parseCreateDatabase(statement)
    if (createdDatabase) hintedDatabases.push(createdDatabase)
    await session.connection.query({ sql: statement })
    executedCount += 1
    const switchedDatabase = parseUseDatabase(statement)
    if (switchedDatabase) {
      session.activeDatabase = switchedDatabase
      hintedDatabases.push(switchedDatabase)
    }
  }
  const resolvedDatabase = session.activeDatabase || targetDatabase || hintedDatabases[hintedDatabases.length - 1] || ''
  if (!session.activeDatabase && resolvedDatabase) session.activeDatabase = resolvedDatabase
  return {
    executedCount,
    durationMs: Date.now() - startedAt,
    activeDatabase: resolvedDatabase
  }
}

function normalizeLocalPath(value) {
  const target = value ? path.resolve(value) : app.getPath('home')
  if (!fs.existsSync(target)) throw new Error('本地路径不存在')
  return target
}

function normalizeLocalTargetPath(value) {
  const target = path.resolve(value || app.getPath('home'))
  const parent = path.dirname(target)
  if (!fs.existsSync(parent)) throw new Error(`本地父目录不存在：${parent}`)
  return target
}

function isWindowsDriveRootPath(value) {
  return /^[A-Za-z]:\\?$/.test(String(value || ''))
}

function formatByteSize(value) {
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

function formatLocalDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function getLocalPathTypeLabel(stats) {
  if (!stats) return '未知'
  if (stats.isDirectory()) return '文件夹'
  if (stats.isFile()) return '文件'
  if (stats.isSymbolicLink?.()) return '符号链接'
  return '其他'
}

function getLocalAccessLabel(targetPath) {
  const access = []
  try {
    fs.accessSync(targetPath, fs.constants.R_OK)
    access.push('可读')
  } catch (error) {
    access.push('不可读')
  }
  try {
    fs.accessSync(targetPath, fs.constants.W_OK)
    access.push('可写')
  } catch (error) {
    access.push('只读')
  }
  return access.join(' / ')
}

async function showLocalPathPropertiesDialog(sender, targetPath) {
  const win = BrowserWindow.fromWebContents(sender)
  const stats = fs.statSync(targetPath)
  const isDirectory = stats.isDirectory()
  const detail = [
    `名称：${path.basename(targetPath) || targetPath}`,
    `路径：${targetPath}`,
    `类型：${getLocalPathTypeLabel(stats)}`,
    `大小：${isDirectory ? '文件夹大小未递归计算' : formatByteSize(stats.size)}`,
    `读写状态：${getLocalAccessLabel(targetPath)}`,
    `创建时间：${formatLocalDateTime(stats.birthtime)}`,
    `修改时间：${formatLocalDateTime(stats.mtime)}`,
    `访问时间：${formatLocalDateTime(stats.atime)}`
  ].join('\n')
  await dialog.showMessageBox(win, {
    type: 'info',
    title: `${path.basename(targetPath) || targetPath} 属性`,
    message: path.basename(targetPath) || targetPath,
    detail,
    buttons: ['确定'],
    defaultId: 0,
    noLink: true
  })
  return true
}

async function showLocalDrivePropertiesDialog(sender, targetPath) {
  const win = BrowserWindow.fromWebContents(sender)
  const driveRoot = `${String(targetPath || '').slice(0, 2).toUpperCase()}\\`
  const matchedRoot = listLocalRoots().find(item => String(item.path || '').toUpperCase() === driveRoot.toUpperCase())
  const stats = getLocalVolumeStats(driveRoot)
  const totalSize = Number(stats.totalSize || matchedRoot?.totalSize || 0)
  const freeSize = Number(stats.freeSize || matchedRoot?.freeSize || 0)
  const usedSize = Number(stats.usedSize || matchedRoot?.usedSize || 0)
  const usedRatio = totalSize > 0 ? Math.min(Math.max(usedSize / totalSize, 0), 1) : 0
  const label = matchedRoot?.label || `本地磁盘 (${driveRoot.slice(0, 2)})`
  await dialog.showMessageBox(win, {
    type: 'info',
    title: `${label} 属性`,
    message: label,
    detail: [
      `位置：${driveRoot}`,
      '类型：本地磁盘',
      `已用空间：${formatByteSize(usedSize)}`,
      `可用空间：${formatByteSize(freeSize)}`,
      `总容量：${formatByteSize(totalSize)}`,
      `使用率：${(usedRatio * 100).toFixed(1).replace(/\.0$/, '')}%`
    ].join('\n'),
    buttons: ['确定'],
    defaultId: 0,
    noLink: true
  })
  return true
}

function getLocalVolumeStats(rootPath) {
  try {
    if (typeof fs.statfsSync !== 'function') return {}
    const stats = fs.statfsSync(rootPath)
    const blockSize = Number(stats.bsize || stats.frsize || 0)
    const totalSize = Number(stats.blocks || 0) * blockSize
    const freeSize = Number(stats.bavail || stats.bfree || 0) * blockSize
    if (!Number.isFinite(totalSize) || totalSize <= 0 || !Number.isFinite(freeSize)) return {}
    return {
      totalSize,
      freeSize,
      usedSize: Math.max(totalSize - freeSize, 0),
      usedRatio: Math.min(Math.max((totalSize - freeSize) / totalSize, 0), 1)
    }
  } catch (error) {
    return {}
  }
}

function listLocalRoots() {
  const roots = []
  const addRoot = (label, rootPath) => {
    if (rootPath && fs.existsSync(rootPath) && !roots.some(item => item.path === rootPath)) {
      roots.push({ label, path: rootPath, ...getLocalVolumeStats(rootPath) })
    }
  }

  if (process.platform === 'win32') {
    for (let code = 67; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`
      if (fs.existsSync(drive)) addRoot(`本地磁盘 (${String.fromCharCode(code)}:)`, drive)
    }
  } else {
    addRoot('根目录', path.parse(app.getPath('home')).root)
  }

  addRoot('桌面', app.getPath('desktop'))
  addRoot('文档', app.getPath('documents'))
  addRoot('下载', app.getPath('downloads'))
  addRoot('图片', app.getPath('pictures'))
  addRoot('音乐', app.getPath('music'))
  addRoot('视频', app.getPath('videos'))
  addRoot('主目录', app.getPath('home'))

  return roots
}

function deleteLocalPath(targetPath) {
  if (!fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true })
}

function resolveUniqueLocalPath(targetDir, sourceName) {
  const parsed = path.parse(sourceName)
  let candidate = path.join(targetDir, sourceName)
  if (!fs.existsSync(candidate)) return candidate

  let index = 1
  while (true) {
    const nextName = `${parsed.name}-copy${index === 1 ? '' : `-${index}`}${parsed.ext}`
    candidate = path.join(targetDir, nextName)
    if (!fs.existsSync(candidate)) return candidate
    index += 1
  }
}

function copyLocalPath(sourcePath, targetDir, conflictAction = 'rename') {
  const sourceStats = fs.statSync(sourcePath)
  const originalDestination = path.join(targetDir, path.basename(sourcePath))
  if (conflictAction === 'skip' && fs.existsSync(originalDestination)) return null
  if (conflictAction === 'overwrite' && fs.existsSync(originalDestination)) {
    fs.rmSync(originalDestination, { recursive: true, force: true })
  }
  const destination = conflictAction === 'rename'
    ? resolveUniqueLocalPath(targetDir, path.basename(sourcePath))
    : originalDestination
  if (sourceStats.isDirectory()) {
    fs.cpSync(sourcePath, destination, { recursive: true, errorOnExist: false })
  } else {
    fs.copyFileSync(sourcePath, destination)
  }
  return destination
}

function moveLocalPath(sourcePath, targetDir, conflictAction = 'rename') {
  const destination = path.join(targetDir, path.basename(sourcePath))
  if (path.resolve(sourcePath) === path.resolve(destination)) return destination
  if (fs.existsSync(destination)) {
    if (conflictAction === 'skip') return null
    if (conflictAction === 'rename') return resolveUniqueLocalPath(targetDir, path.basename(sourcePath))
    fs.rmSync(destination, { recursive: true, force: true })
  }
  fs.renameSync(sourcePath, destination)
  return destination
}

function setLocalClipboard(items, operation) {
  const normalized = (items || []).map(item => normalizeLocalPath(item.path)).filter(Boolean)
  if (!normalized.length) {
    localClipboard = null
    return
  }
  localClipboard = {
    items: normalized,
    operation: operation === 'cut' ? 'cut' : 'copy'
  }
  writeSystemFileClipboard(normalized)
}

function normalizeClipboardFilePaths(items) {
  const uniquePaths = new Set()
  for (const item of items || []) {
    const rawPath = String(item || '').replace(/^\uFEFF/, '').trim().replace(/^"|"$/g, '')
    const targetPath = rawPath.replace(/^file:\/\//i, '').replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))
    if (!targetPath || !path.isAbsolute(targetPath) || !fs.existsSync(targetPath)) continue
    uniquePaths.add(path.resolve(targetPath))
  }
  return [...uniquePaths]
}

function readClipboardFileBuffer(format, encoding) {
  try {
    const buffer = clipboard.readBuffer(format)
    if (!buffer?.length) return []
    return buffer.toString(encoding).split(/\u0000|\r?\n/)
  } catch (error) {
    return []
  }
}

function readWindowsClipboardFilePathsViaPowerShell() {
  if (process.platform !== 'win32') return []
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$utf8 = New-Object System.Text.UTF8Encoding($false)",
    '[Console]::OutputEncoding = $utf8',
    'Add-Type -AssemblyName System.Windows.Forms',
    '[Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { [Console]::WriteLine($_.ToString()) }'
  ].join('; ')
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', command], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true
    })
    return String(output || '').split(/\r?\n/)
  } catch (error) {
    return []
  }
}

function readSystemFileClipboard() {
  if (process.platform !== 'win32') return []
  const candidates = [
    ...readClipboardFileBuffer('FileNameW', 'utf16le'),
    ...readClipboardFileBuffer('FileName', 'latin1'),
    ...readClipboardFileBuffer('text/uri-list', 'utf8'),
    ...readWindowsClipboardFilePathsViaPowerShell()
  ]
  return normalizeClipboardFilePaths(candidates)
}

function writeSystemFileClipboard(items) {
  if (process.platform !== 'win32') return
  try {
    clipboard.writeBuffer('FileNameW', Buffer.from(`${items.join('\u0000')}\u0000\u0000`, 'utf16le'))
  } catch (error) {
    // 应用内剪贴板仍可继续工作，系统剪贴板写入失败不影响本地操作。
  }
}

function areSameLocalPaths(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function getLocalClipboardPayload(destination) {
  if (!fs.existsSync(destination)) return null
  const internalItems = normalizeClipboardFilePaths(localClipboard?.items)
  const systemItems = readSystemFileClipboard()
  if (internalItems.length && (!systemItems.length || areSameLocalPaths(internalItems, systemItems))) {
    return { items: internalItems, operation: localClipboard.operation }
  }
  if (systemItems.length) return { items: systemItems, operation: 'copy' }
  return null
}

function canPasteLocalClipboard(destination) {
  return !!getLocalClipboardPayload(destination)
}

function pasteLocalClipboard(destination, conflictAction = 'rename') {
  const clipboardPayload = getLocalClipboardPayload(destination)
  if (!clipboardPayload) return []
  const results = []
  for (const item of clipboardPayload.items) {
    if (clipboardPayload.operation === 'copy') {
      const result = copyLocalPath(item, destination, conflictAction)
      if (result) results.push(result)
    } else if (clipboardPayload.operation === 'cut') {
      const result = moveLocalPath(item, destination, conflictAction)
      if (result) results.push(result)
    }
  }
  if (clipboardPayload.operation === 'cut') localClipboard = null
  return results
}

function renameLocalPath(sourcePath, newPath) {
  fs.renameSync(sourcePath, newPath)
  return newPath
}

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function openTerminalAtPath(targetPath) {
  const dir = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
    ? targetPath
    : path.dirname(targetPath)
  if (process.platform === 'win32') {
    exec(`start cmd.exe /K cd /d "${dir}"`)
  } else if (process.platform === 'darwin') {
    exec(`open -a Terminal "${dir}"`)
  } else {
    exec(`xdg-open "${dir}"`)
  }
}

function openWithFile(targetPath) {
  if (process.platform === 'win32') {
    const child = spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', targetPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    child.unref()
  } else if (process.platform === 'darwin') {
    exec(`open -a Finder "${targetPath}"`)
  } else {
    exec(`xdg-open "${targetPath}"`)
  }
}

function ensureWindowsHelperScript(fileName, content) {
  const helperDir = path.join(app.getPath('userData'), 'native-helpers')
  ensureDirExists(helperDir)
  const scriptPath = path.join(helperDir, fileName)
  const expectedBuffer = fileName.endsWith('.vbs')
    ? Buffer.concat([Buffer.from([0xFF, 0xFE]), iconv.encode(content, 'utf16-le')])
    : Buffer.from(content, 'utf8')
  const currentBuffer = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath) : null
  if (!currentBuffer || !currentBuffer.equals(expectedBuffer)) {
    fs.writeFileSync(scriptPath, expectedBuffer)
  }
  return scriptPath
}

function openLocalInExplorer(targetPath, reveal = false) {
  if (process.platform === 'win32') {
    if (!targetPath || targetPath === '__pc__') {
      exec('explorer.exe shell:MyComputerFolder')
      return ''
    }
    if (reveal) {
      shell.showItemInFolder(targetPath)
      return ''
    }
    return shell.openPath(targetPath)
  }

  if (!targetPath || targetPath === '__pc__') return shell.openPath(app.getPath('home'))
  if (reveal) {
    shell.showItemInFolder(targetPath)
    return ''
  }
  return shell.openPath(targetPath)
}

function showFileProperties(targetPath) {
  if (process.platform === 'win32') {
    const scriptPath = ensureWindowsHelperScript('show-properties.vbs', WINDOWS_SHOW_PROPERTIES_SCRIPT)
    console.info('[local-properties][main] detached:start', { targetPath, scriptPath })
    try {
      const child = spawn('wscript.exe', [scriptPath, targetPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env: {
          ...process.env,
          LINUX_VISUAL_TARGET_PATH: targetPath
        }
      })
      child.unref()
      console.info('[local-properties][main] detached:spawned', { targetPath, pid: child.pid })
      return true
    } catch (error) {
      console.error('[local-properties][main] detached:failed', { targetPath, message: error?.message || String(error) })
      return false
    }
  } else if (process.platform === 'darwin') {
    exec(`osascript -e 'tell application "Finder" to open information window of (POSIX file "${targetPath}" as alias)'`)
    return true
  } else {
    shell.showItemInFolder(targetPath)
    return true
  }
}

function sendLocalRefresh(sender, targetPath) {
  safeWebContentsSend(sender, 'local:refresh', { path: targetPath })
}

function toRemotePath(dir, name) {
  return normalizeRemotePath(dir, name)
}

async function uploadLocalDirectoryToSftp(client, localDir, remoteDir) {
  await client.mkdir(remoteDir, true)
  const entries = fs.readdirSync(localDir, { withFileTypes: true })
  for (const entry of entries) {
    const localEntryPath = path.join(localDir, entry.name)
    const remoteEntryPath = normalizeRemotePath(remoteDir, entry.name)
    if (entry.isDirectory()) {
      await uploadLocalDirectoryToSftp(client, localEntryPath, remoteEntryPath)
      continue
    }
    if (entry.isFile()) {
      await client.put(localEntryPath, remoteEntryPath)
    }
  }
}

function toRemoteListItem(targetPath, item, protocol) {
  return {
    name: item.name,
    type: protocol === 'ftp'
      ? (item.isDirectory || item.type === FileType.Directory ? 'd' : '-')
      : item.type,
    size: item.size,
    modifyTime: protocol === 'ftp'
      ? (item.modifiedAt ? item.modifiedAt.getTime() : 0)
      : item.modifyTime,
    rights: protocol === 'ftp'
      ? (item.permissions ? `${item.permissions.user}${item.permissions.group}${item.permissions.world}` : '')
      : item.rights,
    path: normalizeRemotePath(targetPath, item.name)
  }
}

const FILE_SEARCH_MAX_RESULTS = 300
const FILE_SEARCH_MAX_DIRECTORIES = 3000
const FILE_SEARCH_MAX_MS = 15000

function createFileSearchState(options = {}) {
  return {
    maxResults: Number(options.maxResults || FILE_SEARCH_MAX_RESULTS),
    maxDirectories: Number(options.maxDirectories || FILE_SEARCH_MAX_DIRECTORIES),
    maxMs: Number(options.maxMs || FILE_SEARCH_MAX_MS),
    startedAt: Date.now(),
    scannedDirectories: 0,
    limited: false
  }
}

function shouldStopFileSearch(state, results) {
  if (results.length >= state.maxResults) {
    state.limited = true
    return true
  }
  if (state.scannedDirectories >= state.maxDirectories) {
    state.limited = true
    return true
  }
  if (Date.now() - state.startedAt >= state.maxMs) {
    state.limited = true
    return true
  }
  return false
}

function waitForNextTick() {
  return new Promise(resolve => setImmediate(resolve))
}

async function searchLocalEntries(rootPath, keyword, showHidden, options = {}) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase()
  const results = []
  const queue = [normalizeLocalPath(rootPath)]
  const state = createFileSearchState(options)

  while (queue.length && !shouldStopFileSearch(state, results)) {
    const currentPath = queue.shift()
    let entries = []
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true })
      state.scannedDirectories += 1
    } catch (error) {
      continue
    }

    for (const entry of entries) {
      if (shouldStopFileSearch(state, results)) break
      if (!showHidden && entry.name.startsWith('.')) continue
      const fullPath = path.join(currentPath, entry.name)
      let stats = null
      try {
        stats = fs.statSync(fullPath)
      } catch (error) {
        continue
      }

      if (entry.name.toLowerCase().includes(normalizedKeyword)) {
        results.push({
          name: entry.name,
          type: entry.isDirectory() ? 'd' : '-',
          size: stats.size,
          modifyTime: stats.mtimeMs,
          path: fullPath,
          icon: ''
        })
      }

      if (entry.isDirectory()) queue.push(fullPath)
    }
    if (state.scannedDirectories % 25 === 0) await waitForNextTick()
  }

  return { items: results, limited: state.limited, scannedDirectories: state.scannedDirectories }
}

async function searchRemoteEntries(client, session, rootPath, keyword, options = {}) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase()
  const results = []
  const queue = [rootPath || '/']
  const state = createFileSearchState(options)

  while (queue.length && !shouldStopFileSearch(state, results)) {
    const currentPath = queue.shift()
    let entries = []
    try {
      entries = await client.list(currentPath)
      state.scannedDirectories += 1
    } catch (error) {
      continue
    }

    for (const entry of entries) {
      if (shouldStopFileSearch(state, results)) break
      const normalized = toRemoteListItem(currentPath, entry, session.protocol)
      if (String(entry.name || '').toLowerCase().includes(normalizedKeyword)) {
        results.push(normalized)
      }
      if (normalized.type === 'd') queue.push(normalized.path)
    }
  }

  return { items: results, limited: state.limited, scannedDirectories: state.scannedDirectories }
}

async function withSftp(sessionId, task) {
  const session = getSession(sessionId)
  try {
    const client = await ensureSessionSftpClient(session)
    return await task(client)
  } catch (error) {
    if (!shouldReconnectSftpClient(error)) throw error
    await closeSessionSftpClient(session)
    const client = await ensureSessionSftpClient(session)
    return task(client)
  }
}

ipcMain.handle('app-storage:get', async (event, key) => getAppStorageItem(key))

ipcMain.handle('app-storage:set', async (event, payload = {}) => setAppStorageItem(payload.key, payload.value))

ipcMain.handle('app-storage:delete', async (event, key) => deleteAppStorageItem(key))

ipcMain.handle('activation:get-state', async () => getOfflineActivationState())

ipcMain.handle('activation:activate', async (event, payload = {}) => activateOfflineLicense(payload))

ipcMain.handle('app-database:schema', async () => {
  assertAppDatabaseInspectionAvailable()
  return getAppDatabaseSchema()
})

ipcMain.handle('app-database:tables', async () => {
  assertAppDatabaseInspectionAvailable()
  return listAppDatabaseTables()
})

ipcMain.handle('app-database:describe-table', async (event, tableName = '') => {
  assertAppDatabaseInspectionAvailable()
  return describeAppDatabaseTable(tableName)
})

ipcMain.handle('app-database:preview-table', async (event, payload = {}) => {
  assertAppDatabaseInspectionAvailable()
  return previewAppDatabaseTable(payload)
})

ipcMain.handle('app-database:query', async (event, payload = {}) => {
  assertAppDatabaseInspectionAvailable()
  return queryAppDatabase(payload)
})

ipcMain.handle('app-log:append', async (event, payload = {}) => {
  assertApplicationLogIpcSender(event)
  return appendApplicationLog(payload)
})

ipcMain.handle('app-log:read', async event => {
  assertApplicationLogIpcSender(event)
  return readApplicationLogs()
})

ipcMain.handle('app-log:clear', async event => {
  assertApplicationLogIpcSender(event)
  return clearApplicationLogs()
})

ipcMain.handle('app-log:delete-entry', async (event, payload = {}) => {
  assertApplicationLogIpcSender(event)
  return deleteApplicationLogEntry(payload)
})

ipcMain.handle('network-audit:read', async event => {
  assertApplicationLogIpcSender(event)
  return readOutboundAuditLog()
})

ipcMain.handle('nginx-compose-draft:get', async (event, payload = {}) => getNginxComposeDraft(payload))

ipcMain.handle('nginx-compose-draft:set', async (event, payload = {}) => setNginxComposeDraft(payload))

ipcMain.handle('nginx-compose-draft:delete', async (event, payload = {}) => deleteNginxComposeDraft(payload))

ipcMain.handle('ssh:connect', async (event, config) => {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const options = buildConnectionOptions(config)
  const sessionConfig = {
    ...config,
    protocol: normalizeProtocol(config.protocol),
    authType: config.authType === 'privateKey' ? 'privateKey' : 'password'
  }

  if (sessionConfig.protocol === 'sftp') {
    const client = new SftpClient()
    try {
      await client.connect(options)
      const startPath = await resolveSftpStartPath(client)
      sessions.set(id, { protocol: 'sftp', config: sessionConfig, sftpClient: client, sftpClientPromise: null })
      return { id, protocol: 'sftp', startPath }
    } catch (error) {
      try { client.end() } catch (innerError) {}
      throw formatSshConnectError(error, config)
    }
  }

  const conn = new Client()

  return new Promise((resolve, reject) => {
    conn
      .on('ready', () => {
        createTerminalShell(conn)
          .then(stream => {
            const session = {
              protocol: 'ssh',
              conn,
              stream,
              config: sessionConfig,
              sftpClient: null,
              sftpClientPromise: null,
              terminalCreatedAt: Date.now(),
              pendingTerminalShellSyncTimer: null,
              terminalHasUserInput: false,
              pendingTerminalShellSyncEchoes: [],
              terminalOutputBuffer: ''
            }
            sessions.set(id, session)
            void ensureSessionSftpClient(session).catch(() => {})
            bindTerminalChannel(event, id, stream, session)
            resolveSshStartPath(conn)
              .then(startPath => resolve({ id, protocol: 'ssh', startPath }))
              .catch(() => resolve({ id, protocol: 'ssh', startPath: '/' }))
          })
          .catch(error => {
            conn.end()
            reject(error)
          })
      })
      .on('error', err => reject(formatSshConnectError(err, config)))
      .connect(options)
  })
})

ipcMain.handle('connections:list', async () => {
  return (await listStoredConnections()).map(sanitizeConnection)
})

ipcMain.handle('connections:save', async (event, config) => {
  if (!config.host || !config.username) throw new Error('服务器地址和用户名不能为空')
  const saved = await saveStoredConnection(config)
  return sanitizeConnection(saved)
})

ipcMain.handle('connections:delete', async (event, id) => {
  return deleteStoredConnection(id)
})

ipcMain.handle('db-connections:list', async () => {
  return (await listStoredDatabaseConnections()).map(sanitizeDatabaseConnection)
})

ipcMain.handle('db-connections:save', async (event, config = {}) => {
  if (!config.host || !config.username) throw new Error('数据库主机地址和用户名不能为空')
  const saved = await saveStoredDatabaseConnection(config)
  return sanitizeDatabaseConnection(saved)
})

ipcMain.handle('db-connections:delete', async (event, id) => {
  return deleteStoredDatabaseConnection(id)
})

ipcMain.handle('object-storage-connections:list', async () => {
  return (await listStoredObjectStorageConnections()).map(sanitizeObjectStorageConnection)
})

ipcMain.handle('object-storage-connections:save', async (event, config = {}) => {
  if (!String(config.name || '').trim()) throw new Error('连接名称不能为空，请填写便于识别的名称')
  if (!String(config.bucket || '').trim()) throw new Error('Bucket 不能为空，请填写存储桶名称，不要填写完整访问域名')
  if (!String(config.region || '').trim() && !String(config.endpoint || '').trim()) throw new Error('Region 或 Endpoint 至少填写一项；腾讯云 COS 建议填写实际 Region')
  if (!String(config.accessKeyId || '').trim()) throw new Error('AccessKeyId / SecretId 不能为空')
  if (!String(config.secretAccessKey || '').trim()) throw new Error('SecretAccessKey / SecretKey 不能为空')
  const list = await listStoredObjectStorageConnections()
  const id = config.id || `oss-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const provider = normalizeObjectStorageProvider(config.provider)
  const duplicate = list.find(item => item.id !== id && getObjectStorageConnectionIdentity(item) === getObjectStorageConnectionIdentity({ ...config, provider }))
  if (duplicate) {
    throw new Error(`已存在相同 Bucket 连接「${duplicate.name || duplicate.bucket}」，请编辑已有连接或删除重复项后再保存`)
  }
  const saved = await saveStoredObjectStorageConnection({ ...config, id, provider })
  return sanitizeObjectStorageConnection(saved)
})

ipcMain.handle('object-storage-connections:delete', async (event, id) => {
  return deleteStoredObjectStorageConnection(id)
})

ipcMain.handle('object-storage:objects', async (event, payload = {}) => {
  return listObjectStorageObjects(payload)
})

ipcMain.handle('object-storage:upload', async (event, payload = {}) => {
  return uploadObjectStorageFiles(payload, event)
})

ipcMain.handle('object-storage:create-directory', async (event, payload = {}) => {
  return createObjectStorageDirectory(payload)
})

ipcMain.handle('object-storage:download', async (event, payload = {}) => {
  return downloadObjectStorageObject(payload, event)
})

ipcMain.handle('object-storage:download-to-directory', async (event, payload = {}) => {
  return downloadObjectStorageObjectsToDirectory(payload, event)
})

ipcMain.handle('object-storage:start-drag', async (event, payload = {}) => {
  return startObjectStorageNativeDrag(event, payload)
})

ipcMain.handle('object-storage:delete', async (event, payload = {}) => {
  return deleteObjectStorageObjects(payload)
})

ipcMain.handle('object-storage:rename', async (event, payload = {}) => {
  return renameObjectStorageObject(payload, event)
})

ipcMain.handle('object-storage:set-acl', async (event, payload = {}) => {
  return setObjectStorageAcl(payload)
})

ipcMain.handle('object-storage:get-acl', async (event, payload = {}) => {
  return getObjectStorageAcl(payload)
})

ipcMain.handle('object-storage:signed-url', async (event, payload = {}) => {
  return createObjectStorageSignedUrl(payload)
})

ipcMain.handle('object-storage:preview', async (event, payload = {}) => {
  return previewObjectStorageObject(payload)
})

ipcMain.handle('object-storage:thumbnail', async (event, payload = {}) => {
  return getObjectStorageThumbnail(payload)
})

ipcMain.handle('local:roots', async () => {
  return listLocalRoots()
})

ipcMain.handle('local:list', async (event, payload = {}) => {
  const currentPath = normalizeLocalPath(payload.path)
  const stats = fs.statSync(currentPath)
  if (!stats.isDirectory()) throw new Error('本地路径不是目录')
  const list = fs.readdirSync(currentPath, { withFileTypes: true })
    .filter(item => payload.showHidden || !item.name.startsWith('.'))
  const items = (await Promise.all(list.map(async item => {
    const fullPath = path.join(currentPath, item.name)
    let itemStats = null
    try {
      itemStats = fs.statSync(fullPath)
    } catch (error) {
      return null
    }
    let icon = ''
    try {
      const image = await shell.getFileIcon(fullPath, { size: 'normal' })
      icon = image.toDataURL()
    } catch (error) {
      icon = ''
    }
    return {
      name: item.name,
      type: item.isDirectory() ? 'd' : '-',
      size: itemStats.size,
      modifyTime: itemStats.mtimeMs,
      path: fullPath,
      icon
    }
  }))).filter(Boolean)
  return {
    path: currentPath,
    parent: path.dirname(currentPath),
    items
  }
})

ipcMain.handle('local:search', async (event, payload = {}) => {
  const rootPath = normalizeLocalPath(payload.path)
  const stats = fs.statSync(rootPath)
  if (!stats.isDirectory()) throw new Error('本地搜索根路径不是目录')
  const keyword = String(payload.keyword || '').trim()
  if (!keyword) return { rootPath, items: [] }
  const result = await searchLocalEntries(rootPath, keyword, !!payload.showHidden, payload)
  return { rootPath, keyword, ...result }
})

ipcMain.handle('local:choose-dir', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths.length) return { canceled: true }
  return { canceled: false, path: result.filePaths[0] }
})

ipcMain.handle('local:choose-text-file', async (event, payload = {}) => {
  const result = await dialog.showOpenDialog({
    title: payload.title || '选择文件',
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }
  const filePath = result.filePaths[0]
  return {
    canceled: false,
    path: filePath,
    content: fs.readFileSync(filePath, 'utf8')
  }
})


ipcMain.handle('local:open-path', async (event, payload = {}) => {
  const rawPath = typeof payload === 'string' ? payload : String(payload.path || '')
  if (!rawPath || rawPath === '__pc__') {
    const result = await openLocalInExplorer('__pc__')
    if (result) throw new Error(result)
    return true
  }

  const targetPath = normalizeLocalPath(rawPath)
  const result = await shell.openPath(targetPath)
  if (result) throw new Error(result)
  return true
})

ipcMain.handle('local:read-image', async (event, payload = {}) => {
  const targetPath = normalizeLocalPath(payload.path)
  const stats = fs.statSync(targetPath)
  if (!stats.isFile()) throw new Error('当前路径不是文件')
  assertPreviewImageSize(stats.size)
  const buffer = fs.readFileSync(targetPath)
  return buildImagePreviewPayload(targetPath, buffer)
})

ipcMain.handle('local:open-in-explorer', async (event, payload = {}) => {
  const rawPath = typeof payload === 'string' ? payload : String(payload.path || '')
  const reveal = typeof payload === 'object' && !!payload.reveal
  if (!rawPath || rawPath === '__pc__') {
    await openLocalInExplorer('__pc__')
    return true
  }

  const targetPath = normalizeLocalPath(rawPath)
  const stats = fs.statSync(targetPath)
  const result = await openLocalInExplorer(targetPath, reveal && !stats.isDirectory())
  if (result) throw new Error(result)
  return true
})

ipcMain.handle('local:properties', async (event, payload = {}) => {
  const rawPath = typeof payload === 'string' ? payload : String(payload.path || '')
  if (!rawPath || rawPath === '__pc__') return false
  const targetPath = normalizeLocalPath(rawPath)
  if (process.platform === 'win32' && isWindowsDriveRootPath(targetPath)) {
    return showLocalDrivePropertiesDialog(event.sender, targetPath)
  }
  return showLocalPathPropertiesDialog(event.sender, targetPath)
})

ipcMain.handle('local:create-file', async (event, payload) => {
  const targetPath = normalizeLocalTargetPath(payload.path)
  const dir = path.dirname(targetPath)
  ensureDirExists(dir)
  fs.writeFileSync(targetPath, '', 'utf8')
  return true
})

ipcMain.handle('local:create-directory', async (event, payload) => {
  const targetPath = normalizeLocalTargetPath(payload.path)
  ensureDirExists(targetPath)
  return true
})

ipcMain.handle('local:delete', async (event, payload) => {
  const targetPath = normalizeLocalPath(payload.path)
  if (!fs.existsSync(targetPath)) return true
  const stats = fs.statSync(targetPath)
  if (stats.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  } else {
    fs.unlinkSync(targetPath)
  }
  return true
})

ipcMain.handle('local:rename', async (event, payload) => {
  const oldPath = normalizeLocalPath(payload.oldPath)
  const newPath = normalizeLocalTargetPath(payload.newPath)
  ensureDirExists(path.dirname(newPath))
  fs.renameSync(oldPath, newPath)
  return true
})

ipcMain.handle('local:context-menu', async (event, payload) => {
  const targetPath = normalizeLocalPath(payload.path)
  const win = BrowserWindow.fromWebContents(event.sender)
  const stats = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null
  const isDirectory = stats ? stats.isDirectory() : false
  const parentDir = path.dirname(targetPath)
  const actionDir = isDirectory ? targetPath : parentDir
  const canPaste = canPasteLocalClipboard(actionDir)
  const menu = Menu.buildFromTemplate([
    {
      label: isDirectory ? '打开' : '默认打开',
      click: () => shell.openPath(targetPath)
    },
    ...(!isDirectory ? [{
      label: '打开方式',
      click: () => openWithFile(targetPath)
    }] : []),
    {
      label: isDirectory ? '在资源管理器中显示文件夹' : '在资源管理器中显示',
      click: () => shell.showItemInFolder(targetPath)
    },
    { type: 'separator' },
    {
      label: '复制',
      click: () => {
        setLocalClipboard([{ path: targetPath }], 'copy')
      }
    },
    {
      label: '剪切',
      click: () => {
        setLocalClipboard([{ path: targetPath }], 'cut')
      }
    },
    {
      label: '粘贴',
      enabled: canPaste,
      click: () => {
        const destination = actionDir
        pasteLocalClipboard(destination)
        sendLocalRefresh(event.sender, destination)
      }
    },
    { type: 'separator' },
    {
      label: '重命名',
      click: async () => {
        const result = await dialog.showSaveDialog({
          title: '重命名',
          defaultPath: targetPath,
          buttonLabel: '重命名'
        })
        if (!result.canceled && result.filePath && result.filePath !== targetPath) {
          renameLocalPath(targetPath, result.filePath)
          sendLocalRefresh(event.sender, path.dirname(result.filePath))
        }
      }
    },
    {
      label: '新建文件',
      click: async () => {
        const result = await dialog.showSaveDialog({
          title: '新建文件',
          defaultPath: path.join(actionDir, '新建文件.txt'),
          buttonLabel: '创建'
        })
        if (!result.canceled && result.filePath) {
          ensureDirExists(path.dirname(result.filePath))
          fs.writeFileSync(result.filePath, '', 'utf8')
          sendLocalRefresh(event.sender, path.dirname(result.filePath))
        }
      }
    },
    {
      label: '新建文件夹',
      click: async () => {
        const result = await dialog.showSaveDialog({
          title: '新建文件夹',
          defaultPath: path.join(actionDir, '新建文件夹'),
          buttonLabel: '创建'
        })
        if (!result.canceled && result.filePath) {
          ensureDirExists(result.filePath)
          sendLocalRefresh(event.sender, path.dirname(result.filePath))
        }
      }
    },
    { type: 'separator' },
    {
      label: '删除',
      click: async () => {
        const result = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['删除', '取消'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
          title: '确认删除',
          message: isDirectory
            ? `确认删除文件夹 ${path.basename(targetPath)}？`
            : `确认删除文件 ${path.basename(targetPath)}？`,
          detail: isDirectory ? '该文件夹会递归删除，且此操作不可撤销。' : '此操作不可撤销。'
        })
        if (result.response !== 0) return
        deleteLocalPath(targetPath)
        sendLocalRefresh(event.sender, parentDir)
      }
    },
    {
      label: '在终端中打开',
      click: () => openTerminalAtPath(targetPath)
    },
    { type: 'separator' },
    {
      label: '属性',
      click: async () => {
        await showLocalPathPropertiesDialog(event.sender, targetPath)
      }
    }
  ])
  menu.popup({ window: win })
  return true
})

ipcMain.handle('ui:context-menu', async (event, payload = {}) => {
  const items = Array.isArray(payload.items) ? payload.items : []
  if (!items.length) return false
  const win = BrowserWindow.fromWebContents(event.sender)
  const menu = Menu.buildFromTemplate(items.map(item => {
    if (item.type === 'separator') return { type: 'separator' }
    return {
      label: item.label || '',
      enabled: item.enabled !== false,
      click: () => {
        safeWebContentsSend(event.sender, 'ui:context-menu-action', { requestId: payload.requestId, key: item.key })
      }
    }
  }))
  menu.popup({ window: win })
  return true
})

ipcMain.handle('window:get-state', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { maximized: false, minimized: false }
  return getWindowStatePayload(win)
})

ipcMain.handle('window:minimize', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  win.minimize()
  return true
})

ipcMain.handle('window:toggle-maximize', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { maximized: false, minimized: false }
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
  return getWindowStatePayload(win)
})

ipcMain.handle('window:close', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  win.close()
  return true
})

ipcMain.handle('clipboard:read-text', async () => clipboard.readText())

ipcMain.handle('clipboard:read-file-paths', async () => readSystemFileClipboard())

ipcMain.handle('clipboard:write-text', async (event, text = '') => {
  clipboard.writeText(String(text || ''))
  return true
})

ipcMain.handle('shell:open-external', async (event, targetUrl = '') => {
  const normalizedUrl = String(targetUrl || '').trim()
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    throw new Error('外部链接地址无效')
  }
  await shell.openExternal(normalizedUrl)
  return true
})

ipcMain.handle('local:clipboard-set', async (event, payload = {}) => {
  setLocalClipboard(payload.items || [], payload.operation)
  return true
})

ipcMain.handle('local:paste', async (event, payload = {}) => {
  const targetDir = normalizeLocalPath(payload.targetDir)
  const stats = fs.statSync(targetDir)
  if (!stats.isDirectory()) throw new Error('本地粘贴目标不是目录')
  const clipboardPayload = getLocalClipboardPayload(targetDir)
  if (!clipboardPayload) return { count: 0, paths: [] }
  const conflicts = clipboardPayload.items
    .filter(item => {
      const destination = path.join(targetDir, path.basename(item))
      return fs.existsSync(destination) && path.resolve(destination) !== path.resolve(item)
    })
    .map(item => path.basename(item))
  let conflictAction = 'rename'
  if (conflicts.length && payload.conflictAction !== 'overwrite' && payload.conflictAction !== 'skip' && payload.conflictAction !== 'rename') {
    conflictAction = await confirmFilePasteConflict(event, { conflicts, targetDir, multiple: conflicts.length > 1 })
    if (conflictAction === 'cancel') return { count: 0, paths: [], canceled: true }
  } else if (payload.conflictAction) {
    conflictAction = payload.conflictAction
  }
  const results = pasteLocalClipboard(targetDir, conflictAction)
  sendLocalRefresh(event.sender, targetDir)
  return { count: results.length, paths: results }
})

ipcMain.handle('local:import-paths', async (event, payload = {}) => {
  const targetDir = normalizeLocalPath(payload.targetDir)
  const stats = fs.statSync(targetDir)
  if (!stats.isDirectory()) throw new Error('本地导入目标不是目录')
  const sourcePaths = Array.isArray(payload.paths)
    ? payload.paths.map(item => normalizeLocalPath(item)).filter(Boolean)
    : []
  const results = []
  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(sourcePath)) continue
    results.push(copyLocalPath(sourcePath, targetDir))
  }
  sendLocalRefresh(event.sender, targetDir)
  return { count: results.length, paths: results }
})

ipcMain.handle('transfer:upload-local', async (event, payload) => {
  const localPath = normalizeLocalPath(payload.localPath)
  const stats = fs.statSync(localPath)
  const remoteDir = normalizeRemoteDir(payload.remoteDir || '/')
  const remotePath = toRemotePath(remoteDir, path.basename(localPath))
  return withRemoteClient(payload.sessionId, async (client, session) => {
    if (stats.isDirectory()) {
      if (session.protocol === 'ftp') await client.uploadFromDir(localPath, remotePath)
      else await uploadLocalDirectoryToSftp(client, localPath, remotePath)
      return { remotePath }
    }
    if (session.protocol === 'ftp') await client.uploadFrom(localPath, remotePath)
    else await client.put(localPath, remotePath)
    return { remotePath }
  })
})


ipcMain.handle('transfer:download-remote', async (event, payload) => {
  const localDir = normalizeLocalPath(payload.localDir)
  const stats = fs.statSync(localDir)
  if (!stats.isDirectory()) throw new Error('本地目标不是目录')
  return withRemoteClient(payload.sessionId, async (client, session) => {
    const remotePath = payload.remotePath
    const targetStat = session.protocol === 'ftp'
      ? null
      : await client.stat(remotePath)
    const isDirectory = session.protocol === 'ftp'
      ? payload.type === 'd'
      : (targetStat.isDirectory === true || targetStat.type === 'd')
    if (isDirectory) {
      const destination = resolveUniqueLocalPath(localDir, path.basename(remotePath) || 'download')
      if (!fs.existsSync(destination)) fs.mkdirSync(destination, { recursive: true })
      sendLocalRefresh(event.sender, localDir)
      if (session.protocol === 'ftp') await client.downloadToDir(destination, remotePath)
      else await client.downloadDir(remotePath, destination)
      return { localPath: destination }
    }
    const localPath = resolveUniqueLocalPath(localDir, path.basename(remotePath) || 'download')
    fs.closeSync(fs.openSync(localPath, 'w'))
    sendLocalRefresh(event.sender, localDir)
    try {
      if (session.protocol === 'ftp') await client.downloadTo(localPath, remotePath)
      else await client.get(remotePath, localPath)
      return { localPath }
    } catch (error) {
      if (fs.existsSync(localPath) && fs.statSync(localPath).size === 0) fs.rmSync(localPath, { force: true })
      sendLocalRefresh(event.sender, localDir)
      throw error
    }
  })
})

ipcMain.handle('transfer:start-remote-drag', async (event, payload = {}) => {
  const items = (Array.isArray(payload.items) ? payload.items : []).map(item => ({
    remotePath: String(item?.remotePath || item?.path || '').trim(),
    type: String(item?.type || '').trim()
  })).filter(item => item.remotePath)
  if (!items.length) throw new Error('请选择要拖出的服务器文件')

  const dragRoot = path.join(app.getPath('temp'), `linux-visual-remote-drag-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dragRoot, { recursive: true })
  try {
    const paths = await withRemoteClient(payload.sessionId, async (client, session) => {
      const downloadedPaths = []
      for (const item of items) {
        const targetStat = session.protocol === 'ftp' ? null : await client.stat(item.remotePath)
        const isDirectory = session.protocol === 'ftp'
          ? item.type === 'd'
          : (targetStat.isDirectory === true || targetStat.type === 'd')
        const name = path.posix.basename(item.remotePath.replace(/\/+$/, '')) || 'download'
        const destination = resolveUniqueLocalPath(dragRoot, name)
        if (isDirectory) {
          fs.mkdirSync(destination, { recursive: true })
          if (session.protocol === 'ftp') await client.downloadToDir(destination, item.remotePath)
          else await client.downloadDir(item.remotePath, destination)
        } else if (session.protocol === 'ftp') {
          await client.downloadTo(destination, item.remotePath)
        } else {
          await client.get(item.remotePath, destination)
        }
        downloadedPaths.push(destination)
      }
      return downloadedPaths
    })
    const dragPath = paths.length === 1 ? paths[0] : dragRoot
    event.sender.startDrag({
      file: dragPath,
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'app-icon.png'))
    })
    scheduleObjectStorageDragTempCleanup(dragRoot)
    return { path: dragPath, count: paths.length }
  } catch (error) {
    removeLocalTempPath(dragRoot)
    throw error
  }
})

ipcMain.on('terminal:input', (event, payload) => {
  console.info('[terminal][main] input', {
    id: String(payload?.id || ''),
    length: String(payload?.data || '').length,
    preview: String(payload?.data || '').replace(/\r/g, '\\r').replace(/\n/g, '\\n').slice(0, 40)
  })
  const channel = terminalChannels.get(payload.id)
  if (channel?.stream) {
    channel.terminalHasUserInput = true
    channel.stream.write(payload.data)
    return
  }
  const session = sessions.get(payload.id)
  if (session?.protocol === 'ssh' && session.stream) {
    session.terminalHasUserInput = true
    session.stream.write(payload.data)
  }
})

ipcMain.on('terminal:resize', (event, payload) => {
  const channel = terminalChannels.get(payload.id)
  if (channel?.stream) {
    syncTerminalWindow(channel, payload.cols, payload.rows)
    return
  }
  const session = sessions.get(payload.id)
  if (session?.protocol === 'ssh' && session.stream) syncTerminalWindow(session, payload.cols, payload.rows)
})

ipcMain.handle('terminal:open-channel', async (event, payload) => {
  const session = ensureSshSession(payload.sessionId)
  const channelId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const cols = normalizeTerminalSizeValue(payload.cols, 120, 20)
  const rows = normalizeTerminalSizeValue(payload.rows, 34, 8)
  const stream = await createTerminalShell(session.conn, cols, rows)
  const channel = {
    sessionId: payload.sessionId,
    stream,
    terminalCreatedAt: Date.now(),
    pendingTerminalShellSyncTimer: null,
    terminalHasUserInput: false,
    pendingTerminalShellSyncEchoes: [],
    terminalOutputBuffer: ''
  }
  terminalChannels.set(channelId, channel)
  bindTerminalChannel(event, channelId, stream, channel, () => {
    clearPendingTerminalShellSync(channel)
    terminalChannels.delete(channelId)
  })
  syncTerminalWindow(channel, cols, rows, true)
  const cwd = String(payload.cwd || '').trim()
  if (cwd) {
    stream.write(`${buildShellCdCommand(cwd)}\n`)
  }
  return { id: channelId }
})

ipcMain.handle('terminal:close-channel', async (event, channelId) => {
  return closeTerminalChannel(channelId)
})

ipcMain.handle('server:run-command', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const command = String(payload.command || '')
  const cwd = String(payload.cwd || '').trim()
  const startedAt = Date.now()
  const result = await runShellCommandInDirectory(sessionId, command, cwd)
  void persistTerminalCommandHistory(sessionId, { command, exitCode: result.code, durationMs: Date.now() - startedAt })
  return {
    ...result,
    command,
    cwd: cwd ? normalizeRemoteDir(cwd) : '',
    durationMs: Date.now() - startedAt
  }
})

ipcMain.handle('pm2:list', async (event, sessionId) => {
  const normalizedSessionId = String(sessionId || '').trim()
  const items = await listPm2Processes(normalizedSessionId)
  void persistPm2Snapshot(normalizedSessionId, items)
  return items
})

ipcMain.handle('pm2:detail', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const detail = await getPm2ProcessDetail(sessionId, payload.target ?? payload.pmId ?? payload.name)
  void persistPm2ProcessDetail(sessionId, detail)
  return detail
})

ipcMain.handle('pm2:logs', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const target = payload.target ?? payload.name ?? payload.pmId
  const logs = await readPm2Logs(sessionId, target, payload.lines)
  void persistPm2LogSnapshot(sessionId, target, payload.lines, logs)
  return logs
})

ipcMain.handle('pm2:action', async (event, payload = {}) => {
  return runPm2Action(String(payload.sessionId || '').trim(), String(payload.action || '').trim(), payload.target ?? payload.name ?? payload.pmId)
})

ipcMain.handle('pm2:rename', async (event, payload = {}) => {
  return renamePm2Process(String(payload.sessionId || '').trim(), payload)
})

ipcMain.handle('pm2:create', async (event, payload = {}) => {
  return createPm2Process(String(payload.sessionId || '').trim(), payload)
})

ipcMain.handle('pm2:validate-create', async (event, payload = {}) => {
  return validatePm2CreatePayload(String(payload.sessionId || '').trim(), payload)
})

ipcMain.handle('pm2:save', async (event, sessionId) => {
  const result = ensurePm2CommandSuccess(await runCommand(String(sessionId || '').trim(), 'pm2 save'), '保存 PM2 进程列表失败')
  return { code: result.code, stdout: result.stdout, stderr: result.stderr }
})

ipcMain.handle('pm2:reload-runtime', async (event, sessionId) => {
  const result = ensurePm2CommandSuccess(await runCommand(String(sessionId || '').trim(), 'pm2 reload all'), '重新加载 PM2 失败')
  return { code: result.code, stdout: result.stdout, stderr: result.stderr }
})

ipcMain.handle('ssh:disconnect', async (event, id) => {
  const session = sessions.get(id)
  if (!session) return true
  closeTerminalChannelsBySession(id)
  for (const [tailId, stream] of tailStreams.entries()) {
    stream.signal('TERM')
    stream.end()
    tailStreams.delete(tailId)
  }
  if (session.protocol === 'ssh') {
    await closeSessionSftpClient(session)
    clearPendingTerminalShellSync(session)
    session.stream && session.stream.end()
    session.conn && session.conn.end()
  }
  if (session.protocol === 'sftp') {
    await closeSessionSftpClient(session)
  }
  if (session.protocol === 'ftp') {
    session.client && session.client.close()
  }
  sessions.delete(id)
  return true
})

ipcMain.handle('sftp:list', async (event, payload) => {
  const handlerStart = Date.now()
  return withRemoteClient(payload.sessionId, async (client, session) => {
    const targetPath = payload.path || '/'
    const listStart = Date.now()
    const list = await client.list(targetPath)
    const listMs = Date.now() - listStart
    const totalMs = Date.now() - handlerStart
    logRemotePerf('sftp:list', {
      protocol: session.protocol,
      path: targetPath,
      count: list.length,
      listMs,
      totalMs
    })
    return list.map(item => toRemoteListItem(targetPath, item, session.protocol))
  })
})

ipcMain.handle('sftp:dir-access', async (event, payload = {}) => {
  return getRemoteDirectoryAccess(payload.sessionId, payload.path || '/')
})

ipcMain.handle('sftp:search', async (event, payload = {}) => {
  return withRemoteClient(payload.sessionId, async (client, session) => {
    const rootPath = String(payload.path || '/').trim() || '/'
    if (!rootPath.startsWith('/')) throw new Error('服务器搜索根路径必须是绝对路径')
    const keyword = String(payload.keyword || '').trim()
    if (!keyword) return { rootPath, items: [] }
    const result = await searchRemoteEntries(client, session, rootPath, keyword, payload)
    return { rootPath, keyword, ...result }
  })
})

ipcMain.handle('sftp:upload', async (event, payload) => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'] })
  if (result.canceled || !result.filePaths.length) return { canceled: true }

  const localPath = result.filePaths[0]
  const fileName = path.basename(localPath)
  const remotePath = toRemotePath(payload.remoteDir || '/', fileName)
  return withRemoteClient(payload.sessionId, async (client, session) => {
    if (session.protocol === 'ftp') await client.uploadFrom(localPath, remotePath)
    else await client.put(localPath, remotePath)
    return { canceled: false, remotePath }
  })
})

ipcMain.handle('sftp:download', async (event, payload) => {
  const result = await dialog.showSaveDialog({ defaultPath: path.basename(payload.remotePath) })
  if (result.canceled || !result.filePath) return { canceled: true }

  return withRemoteClient(payload.sessionId, async (client, session) => {
    if (session.protocol === 'ftp') await client.downloadTo(result.filePath, payload.remotePath)
    else await client.get(payload.remotePath, result.filePath)
    return { canceled: false, localPath: result.filePath }
  })
})

ipcMain.handle('sftp:mkdir', async (event, payload) => {
  const targetPath = normalizeRemoteDir(payload.path)
  await assertRemoteDirectoryWritable(payload.sessionId, path.posix.dirname(targetPath), '新建文件夹')
  return withRemoteClient(payload.sessionId, async (client, session) => {
    if (session.protocol === 'ftp') return client.ensureDir(targetPath)
    return client.mkdir(targetPath, true)
  })
})

ipcMain.handle('sftp:delete', async (event, payload) => {
  const targetPath = normalizeRemoteDir(payload.path)
  await assertRemoteDirectoryWritable(payload.sessionId, path.posix.dirname(targetPath), '删除')
  return withRemoteClient(payload.sessionId, async (client, session) => {
    if (payload.type === 'd') {
      if (session.protocol === 'ftp') {
        try {
          await client.removeDir(targetPath)
          return { deleted: true, alreadyMissing: false }
        } catch (error) {
          if (isRemotePathMissingError(error)) return { deleted: false, alreadyMissing: true }
          throw error
        }
      }
      return deleteSftpPath(client, targetPath, 'd')
    }
    if (session.protocol === 'ftp') {
      try {
        await client.remove(targetPath)
        return { deleted: true, alreadyMissing: false }
      } catch (error) {
        if (isRemotePathMissingError(error)) return { deleted: false, alreadyMissing: true }
        throw error
      }
    }
    return deleteSftpPath(client, targetPath, '-')
  })
})

ipcMain.handle('sftp:rename', async (event, payload) => {
  await assertRemoteDirectoryWritable(payload.sessionId, path.posix.dirname(payload.oldPath), '重命名')
  await assertRemoteDirectoryWritable(payload.sessionId, path.posix.dirname(payload.newPath), '重命名')
  return withRemoteClient(payload.sessionId, async client => client.rename(payload.oldPath, payload.newPath))
})

ipcMain.handle('sftp:paste', async (event, payload) => {
  return withRemoteClient(payload.sessionId, async (client, session) => {
    const items = Array.isArray(payload.items) && payload.items.length
      ? payload.items
      : [{ path: payload.sourcePath, type: payload.sourceType }]
    const targetDir = String(payload.targetDir || '/').trim() || '/'
    const operation = payload.operation === 'cut' ? 'cut' : 'copy'

    if (!targetDir.startsWith('/')) throw new Error('目标目录必须是绝对路径')
    await assertRemoteDirectoryWritable(payload.sessionId, targetDir, '粘贴')
    const results = []
    const existingNames = await listRemoteNames(client, targetDir)
    const conflicts = items
      .map(item => path.posix.basename(String(item?.path || '')))
      .filter(name => name && existingNames.has(name))
    let conflictAction = payload.conflictAction === 'overwrite' || payload.conflictAction === 'skip' || payload.conflictAction === 'rename'
      ? payload.conflictAction
      : 'rename'
    if (conflicts.length && !payload.conflictAction) {
      conflictAction = await confirmFilePasteConflict(event, { conflicts, targetDir, multiple: conflicts.length > 1 })
      if (conflictAction === 'cancel') return { items: [], moved: false, canceled: true }
    }

    for (const item of items) {
      const sourcePath = String(item?.path || '')
      const sourceType = item?.type === 'd' ? 'd' : '-'
      const sourceName = path.posix.basename(sourcePath)
      if (!sourcePath.startsWith('/')) throw new Error('源路径必须是绝对路径')

      if (operation === 'cut') {
        const targetPath = normalizeRemotePath(targetDir, sourceName)
        if (targetPath === sourcePath) {
          results.push({ path: sourcePath, name: sourceName, moved: true })
          continue
        }
        if (conflictAction === 'skip' && existingNames.has(sourceName)) continue
        if (conflictAction === 'rename' && existingNames.has(sourceName)) {
          const uniqueTargetPath = await resolveUniqueRemotePath(client, targetDir, sourceName, existingNames)
          await client.rename(sourcePath, uniqueTargetPath)
          existingNames.add(path.posix.basename(uniqueTargetPath))
          results.push({ path: uniqueTargetPath, name: path.posix.basename(uniqueTargetPath), moved: true })
          continue
        }
        if (conflictAction === 'overwrite' && existingNames.has(sourceName)) {
          await deleteSftpPath(client, targetPath, sourceType)
        }
        await client.rename(sourcePath, targetPath)
        existingNames.add(sourceName)
        results.push({ path: targetPath, name: path.posix.basename(targetPath), moved: true })
        continue
      }

      if (conflictAction === 'skip' && existingNames.has(sourceName)) continue
      const targetPath = conflictAction === 'rename'
        ? await resolveUniqueRemotePath(client, targetDir, sourceName, existingNames)
        : normalizeRemotePath(targetDir, sourceName)
      if (conflictAction === 'overwrite' && existingNames.has(sourceName)) {
        await deleteSftpPath(client, targetPath, sourceType)
      }
      await copyRemotePath(client, session, payload.sessionId, sourcePath, sourceType, targetPath)
      existingNames?.add(path.posix.basename(targetPath))
      results.push({ path: targetPath, name: path.posix.basename(targetPath), moved: false })
    }

    return { items: results, moved: operation === 'cut' }
  })
})

ipcMain.handle('sftp:read-text', async (event, payload) => {
  return withRemoteClient(payload.sessionId, async (client, session) => {
    const encoding = normalizeTextEncoding(payload.encoding)
    if (session.protocol === 'ftp') {
      const tempPath = createTempFilePath(payload.path)
      try {
        await client.downloadTo(tempPath, payload.path)
        return decodeRemoteText(fs.readFileSync(tempPath), encoding)
      } finally {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      }
    }
    const buffer = await client.get(payload.path)
    return decodeRemoteText(buffer, encoding)
  })
})

ipcMain.handle('sftp:read-image', async (event, payload) => {
  return withRemoteClient(payload.sessionId, async (client, session) => {
    if (session.protocol === 'ftp') {
      const tempPath = createTempFilePath(payload.path)
      try {
        await client.downloadTo(tempPath, payload.path)
        const stats = fs.statSync(tempPath)
        assertPreviewImageSize(stats.size)
        const buffer = fs.readFileSync(tempPath)
        return buildImagePreviewPayload(payload.path, buffer)
      } finally {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      }
    }
    const buffer = await client.get(payload.path)
    return buildImagePreviewPayload(payload.path, buffer)
  })
})

ipcMain.handle('sftp:prepare-image-preview', async (event, payload) => {
  return withRemoteClient(payload.sessionId, async (client, session) => {
    const mimeType = getImageMimeType(payload.path)
    if (session.protocol !== 'ftp') {
      const stats = await client.stat(payload.path)
      const size = Number(stats?.size || 0)
      if (!size || stats?.isDirectory || stats?.type === 'd') throw new Error('无法读取远程图片文件')
      assertPreviewImageSize(size)
      const resource = registerRemotePreviewMediaResource(payload.sessionId, payload.path, mimeType, size)
      return {
        mimeType,
        size,
        resourceToken: resource.token,
        fileUrl: resource.fileUrl,
        streaming: true
      }
    }

    const tempPath = registerPreviewTempFile(createTempFilePath(payload.path))
    try {
      await client.downloadTo(tempPath, payload.path)
      const stats = fs.statSync(tempPath)
      assertPreviewImageSize(stats.size)
      return {
        mimeType,
        size: stats.size,
        tempPath,
        fileUrl: registerPreviewMediaResource(tempPath, mimeType),
        streaming: false
      }
    } catch (error) {
      cleanupPreviewTempFile(tempPath)
      throw error
    }
  })
})

ipcMain.handle('sftp:prepare-media-preview', async (event, payload) => {
  return withRemoteClient(payload.sessionId, async (client, session) => {
    const descriptor = getPreviewMediaDescriptor(payload.path)
    if (session.protocol !== 'ftp') {
      const stats = await client.stat(payload.path)
      const size = Number(stats?.size || 0)
      if (!size || stats?.isDirectory || stats?.type === 'd') throw new Error('无法读取远程媒体文件')
      const resource = registerRemotePreviewMediaResource(payload.sessionId, payload.path, descriptor.mimeType, size)
      return {
        kind: descriptor.kind,
        mimeType: descriptor.mimeType,
        size,
        resourceToken: resource.token,
        fileUrl: resource.fileUrl,
        streaming: true
      }
    }
    const tempPath = registerPreviewTempFile(createTempFilePath(payload.path))
    try {
      if (session.protocol === 'ftp') {
        await client.downloadTo(tempPath, payload.path)
      } else {
        await client.get(payload.path, tempPath)
      }
      const stats = fs.statSync(tempPath)
      assertPreviewMediaSize(stats.size)
      return {
        kind: descriptor.kind,
        mimeType: descriptor.mimeType,
        size: stats.size,
        tempPath,
        fileUrl: registerPreviewMediaResource(tempPath, descriptor.mimeType)
      }
    } catch (error) {
      cleanupPreviewTempFile(tempPath)
      throw error
    }
  })
})

ipcMain.handle('preview:cleanup-temp-file', async (event, payload = {}) => {
  cleanupPreviewTempFile(String(payload.path || ''), String(payload.resourceToken || ''))
  return true
})

ipcMain.handle('sftp:write-text', async (event, payload) => {
  await assertRemoteDirectoryWritable(payload.sessionId, path.posix.dirname(payload.path), '写入文件')
  return withRemoteClient(payload.sessionId, async (client, session) => {
    const buffer = encodeRemoteText(payload.content || '', payload.encoding)
    if (session.protocol === 'ftp') {
      const tempPath = createTempFilePath(payload.path)
      try {
        fs.writeFileSync(tempPath, buffer)
        return client.uploadFrom(tempPath, payload.path)
      } finally {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      }
    }
    return client.put(buffer, payload.path)
  })
})

ipcMain.handle('nginx:safe-write-config', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const targetPath = normalizeRemotePath(payload.path || '')
  const backupRoot = normalizeRemotePath(payload.backupDir || '/www/backup/nginx')
  const mainConfigPath = normalizeRemotePath(payload.mainConfigPath || '')
  if (!sessionId) throw new Error('缺少会话 ID')
  if (!targetPath || !targetPath.startsWith('/')) throw new Error('缺少有效的 Nginx 配置路径')
  if (!backupRoot || !backupRoot.startsWith('/')) throw new Error('缺少有效的备份目录')
  await assertRemoteDirectoryWritable(sessionId, path.posix.dirname(targetPath), '写入 Nginx 配置')

  const timestamp = formatRemoteBackupTimestamp(new Date())
  const backupDir = normalizeRemotePath(backupRoot, timestamp)
  const backupPath = normalizeRemotePath(backupDir, path.posix.basename(targetPath))
  const encoding = normalizeTextEncoding(payload.encoding)
  const contentBuffer = encodeRemoteText(payload.content || '', encoding)

  return withRemoteClient(sessionId, async (client, session) => {
    const originalBuffer = await readRemoteFileBuffer(client, session, targetPath)
    await client.mkdir(backupDir, true)
    await writeRemoteFileBuffer(client, session, backupPath, originalBuffer)
    await writeRemoteFileBuffer(client, session, targetPath, contentBuffer)

    const testCommand = mainConfigPath ? `nginx -T -c ${escapeShellSingleQuotedValue(mainConfigPath)}` : 'nginx -T'
    const testResult = await runCommand(sessionId, testCommand)
    if (testResult.code !== 0) {
      await writeRemoteFileBuffer(client, session, targetPath, originalBuffer)
      const diagnostic = String(testResult.stderr || '').trim()
        || String(testResult.stdout || '').split(/\r?\n/).slice(-20).join('\n').trim()
      throw new Error(`Nginx 配置校验失败，已恢复备份：${backupPath}\n${diagnostic || 'nginx -T 执行失败'}`)
    }

    const reloadResult = await runCommand(sessionId, 'systemctl reload nginx || nginx -s reload')
    const reloadOutput = `${reloadResult.stdout || ''}\n${reloadResult.stderr || ''}`.trim()
    if (reloadResult.code !== 0) {
      throw new Error(`Nginx 配置已保存且校验通过，但重载失败。备份：${backupPath}\n${reloadOutput || 'reload 执行失败'}`)
    }

    const response = {
      ok: true,
      backupDir,
      backupPath,
      reloadOutput
    }
    void persistNginxConfigVersion(sessionId, { ...payload, path: targetPath, backupDir: backupRoot, mainConfigPath, source: 'safe-write' })
    return response
  })
})

function formatRemoteBackupTimestamp(date) {
  const pad = (value, size = 2) => String(value).padStart(size, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}`
}

async function readRemoteFileBuffer(client, session, remotePath) {
  if (session.protocol === 'ftp') {
    const tempPath = createTempFilePath(remotePath)
    try {
      await client.downloadTo(tempPath, remotePath)
      return fs.readFileSync(tempPath)
    } finally {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
    }
  }
  return client.get(remotePath)
}

async function writeRemoteFileBuffer(client, session, remotePath, buffer) {
  if (session.protocol === 'ftp') {
    const tempPath = createTempFilePath(remotePath)
    try {
      fs.writeFileSync(tempPath, buffer)
      return client.uploadFrom(tempPath, remotePath)
    } finally {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
    }
  }
  return client.put(buffer, remotePath)
}

ipcMain.handle('sftp:chmod', async (event, payload) => {
  const mode = String(payload.mode || '').trim()
  if (!/^[0-7]{3,4}$/.test(mode)) throw new Error('权限格式应为 755 或 0644')
  return runCommand(payload.sessionId, `chmod ${mode} '${escapeShell(payload.path)}'`)
})

ipcMain.handle('sftp:chown', async (event, payload) => {
  const owner = String(payload.owner || '').trim()
  if (!/^[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)?$/.test(owner)) throw new Error('用户/用户组格式不正确')
  return runCommand(payload.sessionId, `chown ${owner} '${escapeShell(payload.path)}'`)
})

ipcMain.handle('server:overview', async (event, sessionId) => {
  const command = [
    'printf "HOSTNAME="; hostname',
    'printf "SYSTEM="; (cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2- | tr -d "\\\"" || uname -a)',
    'printf "UPTIME="; uptime -p 2>/dev/null || uptime',
    'printf "LOAD="; cat /proc/loadavg | awk \'{print $1" "$2" "$3}\'',
    'printf "MEM="; free -m | awk \'/Mem:/ {print $3"/"$2" MB"}\'',
    'printf "DISK="; df -h / | awk \'NR==2 {print $3"/"$2" ("$5")"}\'',
    'printf "IP="; hostname -I 2>/dev/null | awk \'{print $1}\''
  ].join(' && ')
  const result = await runCommand(sessionId, command)
  const data = {}
  result.stdout.split(/\r?\n/).forEach(line => {
    const index = line.indexOf('=')
    if (index > -1) data[line.slice(0, index)] = line.slice(index + 1)
  })
  void persistServerOverviewSnapshot(sessionId, data)
  return data
})

ipcMain.handle('server:services', async (event, sessionId) => {
  const services = Object.entries(SERVICE_COMMANDS)
  const list = []
  for (const [key, serviceName] of services) {
    const command = key === 'pm2'
      ? 'command -v pm2 >/dev/null 2>&1 && pm2 ping >/dev/null 2>&1 && echo active || echo inactive'
      : `systemctl is-active ${serviceName} 2>/dev/null || echo unknown`
    const result = await runCommand(sessionId, command)
    list.push({ key, name: serviceName, status: result.stdout.trim().split(/\r?\n/).pop() || 'unknown' })
  }
  void persistServiceSnapshot(sessionId, list)
  return list
})

ipcMain.handle('server:list-logs', async (event, sessionId) => {
  const directories = [
    '/var/log',
    '/www/wwwlogs',
    '/www/server/panel/logs',
    '/usr/local/nginx/logs',
    '/var/lib/docker/containers'
  ]
  const command = directories
    .map(dir => `[ -d '${escapeShell(dir)}' ] && find '${escapeShell(dir)}' -maxdepth 3 -type f \\( -name '*.log' -o -name '*.log.*' -o -name '*.out' -o -name '*.err' -o -name 'access.log*' -o -name 'error.log*' \\) -printf '%p|%TY-%Tm-%Td %TH:%TM|%s\\n' 2>/dev/null`)
    .join(' ; ')
  const result = await runCommand(sessionId, command)
  const records = []
  const seen = new Set()
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line) continue
    const [filePath, modified, size] = line.split('|')
    if (!filePath || seen.has(filePath)) continue
    seen.add(filePath)
    records.push({
      name: path.posix.basename(filePath),
      path: filePath,
      directory: path.posix.dirname(filePath),
      modified,
      size: Number(size || 0)
    })
  }
  const sortedRecords = records.sort((a, b) => {
    const timeA = a.modified ? Date.parse(a.modified.replace(' ', 'T')) || 0 : 0
    const timeB = b.modified ? Date.parse(b.modified.replace(' ', 'T')) || 0 : 0
    return timeB - timeA || a.path.localeCompare(b.path)
  })
  void persistLogSources(sessionId, sortedRecords)
  return sortedRecords
})

ipcMain.handle('server:service-action', async (event, payload) => {
  if (!['start', 'stop', 'restart'].includes(payload.action)) throw new Error('不支持的服务操作')
  const serviceName = SERVICE_COMMANDS[payload.service]
  if (!serviceName || payload.service === 'pm2') throw new Error('当前服务暂不支持此操作')
  return runCommand(payload.sessionId, `systemctl ${payload.action} ${serviceName}`)
})

ipcMain.handle('server:read-log', async (event, payload) => {
  const file = (payload.path || '').replace(/'/g, "'\\''")
  if (!file.startsWith('/')) throw new Error('日志路径必须是绝对路径')
  const result = await runCommand(payload.sessionId, `tail -n ${Number(payload.lines || 200)} '${file}'`)
  void persistLogReadHistory(payload.sessionId, payload)
  return result
})

ipcMain.handle('server:start-tail', async (event, payload) => {
  const session = getSession(payload.sessionId)
  const file = String(payload.path || '')
  if (!file.startsWith('/')) throw new Error('日志路径必须是绝对路径')
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const lines = Math.max(10, Math.min(Number(payload.lines || 200), 1000))
  return new Promise((resolve, reject) => {
    session.conn.exec(`tail -n ${lines} -f '${escapeShell(file)}'`, (err, stream) => {
      if (err) {
        reject(new Error(err.message))
        return
      }
      tailStreams.set(id, stream)
      stream.on('data', data => event.sender.send('log:tail-data', { id, data: data.toString('utf8') }))
      stream.stderr.on('data', data => event.sender.send('log:tail-data', { id, data: data.toString('utf8') }))
      stream.on('close', () => {
        tailStreams.delete(id)
        event.sender.send('log:tail-closed', { id })
      })
      resolve({ id })
    })
  })
})

ipcMain.handle('server:stop-tail', async (event, id) => {
  const stream = tailStreams.get(id)
  if (stream) {
    stream.signal('TERM')
    stream.end()
    tailStreams.delete(id)
  }
  return true
})

function buildNginxSiteFindCommand(targetPath = '', options = {}) {
  const normalized = normalizeRemotePath(targetPath)
  if (!normalized || !normalized.startsWith('/')) return ''
  const printArgs = "-printf '%p|%TY-%Tm-%Td %TH:%TM|%s\\n'"
  if (!/[*?\[]/.test(normalized)) {
    const targetArg = escapeShellSingleQuotedValue(normalized)
    const defaultNameFilter = "\\( -name '*.conf' -o -name '*.conf.default' -o -name '*.include' \\)"
    return `if [ -f ${targetArg} ]; then find ${targetArg} -maxdepth 0 -type f ${printArgs}; elif [ -d ${targetArg} ]; then find ${targetArg} -maxdepth 3 -type f ${defaultNameFilter} ${printArgs}; fi`
  }

  const slashIndex = normalized.lastIndexOf('/')
  const dirPath = normalizeRemotePath(normalized.slice(0, slashIndex) || '/')
  const filePattern = normalized.slice(slashIndex + 1) || '*'
  const rootPath = normalizeRemotePath(options.nginxHome || '')
  const maxDepth = rootPath && dirPath === rootPath && filePattern === '*.conf' ? 1 : 3
  const nameFilter = filePattern === '*'
    ? "\\( -name '*.conf' -o -name '*.conf.default' -o -name '*.include' \\)"
    : `-name ${escapeShellSingleQuotedValue(filePattern)}`
  return `[ -d ${escapeShellSingleQuotedValue(dirPath)} ] && find ${escapeShellSingleQuotedValue(dirPath)} -maxdepth ${maxDepth} -type f ${nameFilter} ${printArgs}`
}

function buildConfiguredNginxSitesCommand(payload = {}) {
  const scanPaths = Array.isArray(payload.scanPaths) ? payload.scanPaths : []
  const targets = [...new Set([payload.mainConfigPath, ...scanPaths]
    .map(item => normalizeRemotePath(item))
    .filter(item => item && item.startsWith('/')))]
  const commands = targets.map(item => buildNginxSiteFindCommand(item, payload)).filter(Boolean)
  return commands.length ? `{ ${commands.map(command => `${command};`).join(' ')} } 2>/dev/null | sort -u` : ''
}

ipcMain.handle('nginx:sites', async (event, payload) => {
  const sessionId = typeof payload === 'object' && payload ? payload.sessionId : payload
  const nginxHome = typeof payload === 'object' && payload ? String(payload.nginxHome || '').trim() : ''
  const configuredCommand = typeof payload === 'object' && payload ? buildConfiguredNginxSitesCommand({ ...payload, nginxHome }) : ''
  const roots = [...new Set([nginxHome, '/etc/nginx', '/usr/local/nginx/conf', '/usr/local/openresty/nginx/conf', '/www/server/nginx/conf'].filter(Boolean))]
  const rootArgs = roots.map(item => escapeShellSingleQuotedValue(item)).join(' ')
  const defaultCommand = `{ for root in ${rootArgs}; do [ -d "$root" ] || continue; [ -f "$root/nginx.conf" ] && find "$root/nginx.conf" -maxdepth 0 -type f -printf '%p|%TY-%Tm-%Td %TH:%TM|%s\\n'; find "$root" -maxdepth 1 -type f -name '*.conf' -printf '%p|%TY-%Tm-%Td %TH:%TM|%s\\n'; for d in conf.d sites-available sites-enabled vhost vhosts vhost.d servers stream.d http.d; do [ -d "$root/$d" ] && find "$root/$d" -maxdepth 3 -type f \\( -name '*.conf' -o -name '*.conf.default' -o -name '*.include' \\) -printf '%p|%TY-%Tm-%Td %TH:%TM|%s\\n'; done; done; [ -d /www/server/panel/vhost/nginx ] && find /www/server/panel/vhost/nginx -maxdepth 3 -type f -name '*.conf' -printf '%p|%TY-%Tm-%Td %TH:%TM|%s\\n'; } 2>/dev/null | sort -u`
  const command = configuredCommand || defaultCommand
  const result = await runCommand(sessionId, command)
  const sites = result.stdout.split(/\r?\n/).filter(Boolean).map(line => {
    const [pathName, modified, size] = line.split('|')
    return { path: pathName, name: path.basename(pathName || ''), modified, size: Number(size || 0) }
  })
  void persistNginxSitesSnapshot(sessionId, typeof payload === 'object' && payload ? payload : {}, sites)
  return sites
})

ipcMain.handle('nginx:topology', async (event, payload) => {
  const sessionId = typeof payload === 'object' && payload ? payload.sessionId : payload
  const mainConfigPath = typeof payload === 'object' && payload ? normalizeRemotePath(payload.mainConfigPath || '') : ''
  const command = mainConfigPath ? `nginx -T -c ${escapeShellSingleQuotedValue(mainConfigPath)}` : 'nginx -T'
  const result = await runCommand(sessionId, command)
  const output = String(result.stdout || '').trim()
  const topology = parseNginxTopologyDump(output)
  const diagnostic = String(result.stderr || '').trim()
    || (result.code !== 0 ? output.split(/\r?\n/).slice(-20).join('\n').trim() : '')
  const response = {
    ok: result.code === 0 && topology.files.length > 0,
    code: result.code,
    source: 'nginx -T',
    error: result.code !== 0
      ? (diagnostic || `nginx -T 执行失败，退出码 ${result.code}`)
      : (topology.files.length ? '' : 'nginx -T 没有返回可解析的配置内容'),
    ...topology
  }
  if (response.ok) void persistNginxTopologySnapshot(sessionId, typeof payload === 'object' && payload ? payload : {}, response)
  return response
})

function parseNginxTopologyDump(output = '') {
  const fileMap = new Map()
  let currentPath = ''
  let currentLines = []

  function flushCurrentFile() {
    if (!currentPath) return
    fileMap.set(currentPath, {
      path: currentPath,
      content: currentLines.join('\n')
    })
  }

  String(output || '').split(/\r?\n/).forEach(line => {
    const match = line.match(/^#\s*configuration file\s+(.+?):\s*$/i)
    if (match) {
      flushCurrentFile()
      currentPath = normalizeRemotePath(match[1])
      currentLines = []
      return
    }
    if (currentPath) currentLines.push(line)
  })
  flushCurrentFile()

  const filePaths = [...fileMap.keys()]
  const files = filePaths.map(filePath => {
    const content = fileMap.get(filePath)?.content || ''
    const includes = parseNginxIncludes(content, filePath, filePaths)
    const servers = parseNginxServers(content)
    const upstreams = parseNginxUpstreams(content)
    return {
      path: filePath,
      name: path.posix.basename(filePath),
      content,
      contentHash: hashNginxTopologyContent(content),
      size: Buffer.byteLength(content, 'utf8'),
      includes,
      servers,
      upstreams,
      serverCount: servers.length
    }
  })

  const includeEdges = files.flatMap(file => file.includes.flatMap(item => {
    if (!item.matched.length) return [{ from: file.path, to: '', pattern: item.pattern, type: 'include-missing' }]
    return item.matched.map(target => ({ from: file.path, to: target, pattern: item.pattern, type: 'include' }))
  }))
  const serverNodes = files.flatMap(file => file.servers.map(server => ({ ...server, file: file.path })))
  const upstreamNodes = files.flatMap(file => file.upstreams.map(upstream => ({ ...upstream, file: file.path })))

  return { files, includeEdges, serverNodes, upstreamNodes }
}

function hashNginxTopologyContent(content = '') {
  let hash = 2166136261
  const text = String(content || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function parseNginxIncludes(content = '', filePath = '', filePaths = []) {
  const lines = String(content || '').split(/\r?\n/)
  return String(content || '').split(/\r?\n/).map((line, index) => {
    const stripped = stripInlineNginxComment(line).trim()
    const match = stripped.match(/^include\s+(.+?);$/i)
    if (!match) return null
    const pattern = normalizeNginxIncludePath(match[1], filePath)
    const parentBlock = getNginxParentBlockByLine(lines, index + 1)
    return {
      line: index + 1,
      pattern,
      context: parentBlock?.type || 'main',
      parentType: parentBlock?.type || '',
      parentStartLine: Number(parentBlock?.startLine || 0),
      matched: matchNginxIncludePattern(pattern, filePaths)
    }
  }).filter(Boolean)
}

function getNginxParentBlockByLine(lines = [], lineNumber = 0) {
  if (!lineNumber) return null
  const stack = []
  for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
    const stripped = stripInlineNginxComment(lines[index]).trim()
    const blockMatch = stripped.match(/^(events|http|server|location|stream)\b.*\{/)
    if (blockMatch) stack.push({ type: blockMatch[1], startLine: index + 1 })
    const closeCount = countNginxBraceDelta(stripped) < 0 ? Math.abs(countNginxBraceDelta(stripped)) : (stripped.match(/\}/g) || []).length
    for (let closeIndex = 0; closeIndex < closeCount; closeIndex += 1) stack.pop()
  }
  return stack[stack.length - 1] || null
}

function parseNginxServers(content = '') {
  const lines = String(content || '').split(/\r?\n/)
  const servers = []
  let block = null
  let depth = 0

  lines.forEach((line, index) => {
    const stripped = stripInlineNginxComment(line)
    if (!block && /^\s*server\s*\{/.test(stripped)) {
      block = { startLine: index + 1, lines: [line] }
      depth = countNginxBraceDelta(stripped)
      if (depth <= 0) {
        servers.push(buildNginxServerSummary(block))
        block = null
      }
      return
    }
    if (!block) return
    block.lines.push(line)
    depth += countNginxBraceDelta(stripped)
    if (depth <= 0) {
      servers.push(buildNginxServerSummary(block))
      block = null
    }
  })

  return servers
}

function parseNginxUpstreams(content = '') {
  const lines = String(content || '').split(/\r?\n/)
  const upstreams = []
  let block = null
  let depth = 0

  lines.forEach((line, index) => {
    const stripped = stripInlineNginxComment(line)
    const match = stripped.match(/^\s*upstream\s+([^\s{]+)\s*\{/)
    if (!block && match) {
      block = { startLine: index + 1, name: match[1], lines: [line] }
      depth = countNginxBraceDelta(stripped)
      if (depth <= 0) {
        upstreams.push(buildNginxUpstreamSummary(block))
        block = null
      }
      return
    }
    if (!block) return
    block.lines.push(line)
    depth += countNginxBraceDelta(stripped)
    if (depth <= 0) {
      upstreams.push(buildNginxUpstreamSummary(block))
      block = null
    }
  })

  return upstreams
}

function buildNginxServerSummary(block) {
  const text = block.lines.join('\n')
  const serverName = collectNginxDirectiveValues(text, 'server_name').join(' ') || '未命名 server'
  const listens = collectNginxDirectiveValues(text, 'listen')
  const sslCertificates = collectNginxDirectiveValues(text, 'ssl_certificate')
  const sslCertificateKeys = collectNginxDirectiveValues(text, 'ssl_certificate_key')
  return {
    id: `server-${block.startLine}-${serverName}`,
    startLine: block.startLine,
    title: serverName.split(/\s+/)[0] || '未命名 server',
    serverName,
    listens,
    sslCertificates,
    sslCertificateKeys,
    root: collectNginxDirectiveValues(text, 'root')[0] || '',
    proxyPass: collectNginxDirectiveValues(text, 'proxy_pass')[0] || '',
    accessLog: collectNginxDirectiveValues(text, 'access_log')[0] || '',
    errorLog: collectNginxDirectiveValues(text, 'error_log')[0] || '',
    locations: parseNginxLocations(text, block.startLine)
  }
}

function buildNginxUpstreamSummary(block) {
  const text = block.lines.join('\n')
  return {
    id: `upstream-${block.startLine}-${block.name}`,
    startLine: block.startLine,
    name: block.name,
    title: block.name,
    servers: collectNginxDirectiveValues(text, 'server')
  }
}

function parseNginxLocations(content = '', baseLine = 1) {
  const lines = String(content || '').split(/\r?\n/)
  const locations = []
  let block = null
  let depth = 0

  lines.forEach((line, index) => {
    const stripped = stripInlineNginxComment(line)
    const match = stripped.match(/^\s*location\s+(.+?)\s*\{/)
    if (!block && match) {
      block = { startLine: baseLine + index, matcher: match[1].trim(), lines: [line] }
      depth = countNginxBraceDelta(stripped)
      if (depth <= 0) {
        locations.push(buildNginxLocationSummary(block))
        block = null
      }
      return
    }
    if (!block) return
    block.lines.push(line)
    depth += countNginxBraceDelta(stripped)
    if (depth <= 0) {
      locations.push(buildNginxLocationSummary(block))
      block = null
    }
  })

  return locations
}

function buildNginxLocationSummary(block) {
  const text = block.lines.join('\n')
  return {
    id: `location-${block.startLine}-${block.matcher}`,
    startLine: block.startLine,
    matcher: block.matcher,
    title: block.matcher,
    root: collectNginxDirectiveValues(text, 'root')[0] || '',
    alias: collectNginxDirectiveValues(text, 'alias')[0] || '',
    proxyPass: collectNginxDirectiveValues(text, 'proxy_pass')[0] || '',
    tryFiles: collectNginxDirectiveValues(text, 'try_files')[0] || '',
    returns: collectNginxDirectiveValues(text, 'return'),
    rewrites: collectNginxDirectiveValues(text, 'rewrite'),
    accessLog: collectNginxDirectiveValues(text, 'access_log')[0] || '',
    errorLog: collectNginxDirectiveValues(text, 'error_log')[0] || ''
  }
}

function collectNginxDirectiveValues(text = '', directive = '') {
  const pattern = new RegExp(`^\\s*${directive}\\s+(.+?);`, 'gim')
  const values = []
  let match = pattern.exec(text)
  while (match) {
    values.push(match[1].trim())
    match = pattern.exec(text)
  }
  return values
}

function normalizeNginxIncludePath(pattern = '', filePath = '') {
  const normalized = normalizeRemotePath(String(pattern || '').trim().replace(/^['"]|['"]$/g, ''))
  if (!normalized || normalized.startsWith('/')) return normalized
  return normalizeRemotePath(path.posix.join(path.posix.dirname(normalizeRemotePath(filePath)), normalized))
}

function matchNginxIncludePattern(pattern = '', filePaths = []) {
  const regex = globToRegExp(normalizeRemotePath(pattern))
  return filePaths.filter(filePath => regex.test(normalizeRemotePath(filePath))).sort()
}

function globToRegExp(pattern = '') {
  const escaped = String(pattern || '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
  return new RegExp(`^${escaped}$`)
}

function stripInlineNginxComment(line = '') {
  return String(line || '').replace(/\s+#.*$/, '')
}

function countNginxBraceDelta(line = '') {
  return (String(line).match(/\{/g) || []).length - (String(line).match(/\}/g) || []).length
}

function normalizeRemotePath(value = '', name = '') {
  const base = String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  const leaf = String(name || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  const normalized = leaf ? path.posix.join(base || '/', leaf) : base
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}

function parseDomainList(value = '') {
  return String(value || '')
    .split(/[\s,;]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
}

function buildLetsEncryptLivePath(domain = '', fileName = '') {
  const safeDomain = String(domain || '').trim()
  if (!safeDomain || !/^[A-Za-z0-9.-]+$/.test(safeDomain)) throw new Error('域名格式不正确')
  return `/etc/letsencrypt/live/${safeDomain}/${fileName}`
}

async function syncCertificateToTargetDir(sessionId, options = {}) {
  const targetDir = normalizeRemotePath(options.targetDir || '')
  if (!targetDir || !targetDir.startsWith('/')) throw new Error('请指定有效的证书同步目录')
  const certPath = normalizeRemotePath(options.certbotDomain ? buildLetsEncryptLivePath(options.certbotDomain, 'fullchain.pem') : options.certPath || '')
  const keyPath = normalizeRemotePath(options.certbotDomain ? buildLetsEncryptLivePath(options.certbotDomain, 'privkey.pem') : options.keyPath || '')
  if (!certPath || !keyPath || !certPath.startsWith('/') || !keyPath.startsWith('/')) throw new Error('请指定有效的证书和私钥路径')
  const nextCertPath = normalizeRemotePath(`${targetDir}/fullchain.pem`)
  const nextKeyPath = normalizeRemotePath(`${targetDir}/privkey.pem`)
  const command = [
    `mkdir -p ${escapeShellSingleQuotedValue(targetDir)}`,
    `cp ${escapeShellSingleQuotedValue(certPath)} ${escapeShellSingleQuotedValue(nextCertPath)}`,
    `cp ${escapeShellSingleQuotedValue(keyPath)} ${escapeShellSingleQuotedValue(nextKeyPath)}`,
    `chmod 600 ${escapeShellSingleQuotedValue(nextKeyPath)}`
  ].join(' && ')
  const result = await runCommand(sessionId, command)
  return { ...result, certPath: nextCertPath, keyPath: nextKeyPath }
}

function parseOpenSslCertificateOutput(output = '') {
  const text = String(output || '')
  const subject = text.match(/^subject=(.+)$/im)?.[1]?.trim() || ''
  const issuer = text.match(/^issuer=(.+)$/im)?.[1]?.trim() || ''
  const notBeforeText = text.match(/^notBefore=(.+)$/im)?.[1]?.trim() || ''
  const notAfterText = text.match(/^notAfter=(.+)$/im)?.[1]?.trim() || ''
  const notBefore = notBeforeText ? new Date(notBeforeText) : null
  const notAfter = notAfterText ? new Date(notAfterText) : null
  const startsAt = notBefore && !Number.isNaN(notBefore.getTime()) ? notBefore.toISOString() : ''
  const expiresAt = notAfter && !Number.isNaN(notAfter.getTime()) ? notAfter.toISOString() : ''
  const daysRemaining = notAfter && !Number.isNaN(notAfter.getTime()) ? Math.ceil((notAfter.getTime() - Date.now()) / 86400000) : null
  const san = [...text.matchAll(/DNS:([^,\s]+)/g)].map(match => match[1]).filter(Boolean)
  return { subject, issuer, startsAt, expiresAt, daysRemaining, san }
}

function buildCertificateStatusPayload(certPath = '', keyPath = '', output = '', options = {}) {
  const parsed = parseOpenSslCertificateOutput(output)
  let status = 'normal'
  let statusText = '正常'
  if (parsed.daysRemaining === null) {
    status = 'error'
    statusText = '无法解析'
  } else if (parsed.daysRemaining < 0) {
    status = 'expired'
    statusText = '已过期'
  } else if (parsed.daysRemaining <= 30) {
    status = 'warning'
    statusText = '即将过期'
  }
  return { certPath, keyPath, keyExists: options.keyExists, exists: true, status, statusText, error: '', ...parsed }
}

ipcMain.handle('nginx:ssl-status', async (event, payload) => {
  const sessionId = typeof payload === 'object' && payload ? payload.sessionId : payload
  const certificates = Array.isArray(payload?.certificates) ? payload.certificates : []
  const seen = new Set()
  const targets = certificates
    .map(item => ({ certPath: normalizeRemotePath(item?.certPath || item?.path || ''), keyPath: normalizeRemotePath(item?.keyPath || '') }))
    .filter(item => item.certPath && item.certPath.startsWith('/'))
    .filter(item => {
      if (seen.has(item.certPath)) return false
      seen.add(item.certPath)
      return true
    })

  const results = []
  for (const item of targets) {
    const certArg = escapeShellSingleQuotedValue(item.certPath)
    const certExists = (await runCommand(sessionId, `[ -f ${certArg} ] && printf yes || printf no`)).stdout.trim() === 'yes'
    const keyExists = item.keyPath ? (await runCommand(sessionId, `[ -f ${escapeShellSingleQuotedValue(item.keyPath)} ] && printf yes || printf no`)).stdout.trim() === 'yes' : null
    if (!certExists) {
      results.push({ certPath: item.certPath, keyPath: item.keyPath, keyExists, exists: false, status: 'missing', statusText: '证书不存在', error: '证书文件不存在', subject: '', issuer: '', startsAt: '', expiresAt: '', daysRemaining: null, san: [] })
      continue
    }

    const result = await runCommand(sessionId, `openssl x509 -in ${certArg} -noout -subject -issuer -dates -ext subjectAltName 2>&1`)
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
    if (result.code) {
      results.push({ certPath: item.certPath, keyPath: item.keyPath, keyExists, exists: true, status: 'error', statusText: '读取失败', error: output || 'openssl 读取证书失败', subject: '', issuer: '', startsAt: '', expiresAt: '', daysRemaining: null, san: [] })
      continue
    }
    results.push(buildCertificateStatusPayload(item.certPath, item.keyPath, output, { keyExists }))
  }
  return { ok: true, certificates: results }
})

ipcMain.handle('nginx:ssl-certificates:list', async () => {
  return { ok: true, items: await readStoredNginxSslCertificates() }
})

ipcMain.handle('nginx:ssl-certificates:save', async (event, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : []
  return { ok: true, items: await writeStoredNginxSslCertificates(items) }
})

ipcMain.handle('nginx:ssl-certificates:delete', async (event, id) => {
  const target = String(id || '').trim()
  const items = (await readStoredNginxSslCertificates()).filter(item => String(item?.id || '') !== target)
  return { ok: true, items: await writeStoredNginxSslCertificates(items) }
})

ipcMain.handle('nginx:action', async (event, payload) => {
  if (payload.action === 'test') return runCommand(payload.sessionId, 'nginx -t')
  if (payload.action === 'start') return runCommand(payload.sessionId, 'systemctl start nginx || service nginx start || nginx')
  if (payload.action === 'reload') return runCommand(payload.sessionId, 'systemctl reload nginx || nginx -s reload')
  if (payload.action === 'renew-dry-run') return runCommand(payload.sessionId, 'certbot renew --dry-run')
  if (payload.action === 'renew') return runCommand(payload.sessionId, 'certbot renew')
  if (payload.action === 'sync-certificate') {
    return syncCertificateToTargetDir(payload.sessionId, {
      certbotDomain: payload.certbotDomain,
      certPath: payload.certPath,
      keyPath: payload.keyPath,
      targetDir: payload.targetDir
    })
  }
  if (payload.action === 'certbot') {
    const domains = parseDomainList(payload.domain)
    if (!domains.length) throw new Error('请先填写申请域名')
    if (domains.some(domain => !/^[A-Za-z0-9.-]+$/.test(domain))) throw new Error('域名格式不正确')
    const result = await runCommand(payload.sessionId, `certbot --nginx ${domains.map(domain => `-d ${escapeShellSingleQuotedValue(domain)}`).join(' ')}`)
    if (result.code || !payload.targetDir) return result
    const syncResult = await syncCertificateToTargetDir(payload.sessionId, {
      certbotDomain: domains[0],
      targetDir: payload.targetDir
    })
    return {
      ...syncResult,
      stdout: [result.stdout, syncResult.stdout, `证书已同步到 ${normalizeRemotePath(payload.targetDir)}`].filter(Boolean).join('\n'),
      stderr: [result.stderr, syncResult.stderr].filter(Boolean).join('\n')
    }
  }
  throw new Error('不支持的 Nginx 操作')
})

function buildDockerCommand(command, useSudo = false) {
  return useSudo ? `sudo -n docker ${command}` : `docker ${command}`
}

function explainDockerFatalError(result) {
  if (!result.code) return ''
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.trim()
  if (/a password is required|sudo:.*password|not in the sudoers/i.test(text)) {
    return '已尝试使用 sudo 读取 Docker，但当前账号没有免密 sudo 权限。请改用 root 登录，或给当前用户配置 Docker 权限。'
  }
  if (/command not found|not found|No such file/i.test(text)) {
    return '服务器没有安装 Docker，所以无法显示 Docker 容器。请先在服务器安装 Docker。'
  }
  if (/Cannot connect to the Docker daemon|Is the docker daemon running/i.test(text)) {
    return 'Docker 服务没有启动。服务管理里 Docker 显示运行中才可以读取容器；如果已经运行，请稍等后刷新。'
  }
  if (/permission denied|Got permission denied|connect: permission denied/i.test(text)) {
    return '当前登录账号没有 Docker 操作权限。Docker 服务虽然运行中，但这个账号不能访问 Docker。请使用 root 登录，或把当前用户加入 docker 用户组后重新登录。'
  }
  return ''
}

function parseDockerLabels(input) {
  const pairs = String(input || '').split(',').map(item => item.trim()).filter(Boolean)
  const labels = {}
  for (const pair of pairs) {
    const index = pair.indexOf('=')
    if (index < 1) continue
    labels[pair.slice(0, index)] = pair.slice(index + 1)
  }
  return labels
}

ipcMain.handle('docker:containers', async (event, payload = {}) => {
  const sessionId = typeof payload === 'string' ? payload : payload.sessionId
  const useSudo = typeof payload === 'object' && !!payload.useSudo
  const format = '{{json .}}'
  const result = await runCommand(sessionId, `${buildDockerCommand(`ps -a --format '${format}'`, useSudo)}`)
  const dockerError = explainDockerError(result)
  if (dockerError) throw new Error(dockerError)
  const containers = result.stdout.split(/\r?\n/).filter(Boolean).map(line => {
    try {
      const item = JSON.parse(line)
      const labels = parseDockerLabels(item.Labels)
      return {
        id: item.ID,
        image: item.Image,
        command: item.Command,
        createdAt: item.CreatedAt,
        status: item.Status,
        ports: item.Ports,
        names: item.Names,
        composeProject: labels['com.docker.compose.project'] || '',
        composeService: labels['com.docker.compose.service'] || ''
      }
    } catch (error) {
      return null
    }
  }).filter(Boolean)
  void persistDockerContainersSnapshot(sessionId, containers)
  return containers
})

function explainDockerError(result) {
  const fatalError = explainDockerFatalError(result)
  if (fatalError) return fatalError
  if (!result.code) return ''
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.trim()
  return `Docker 命令执行失败：${text || `退出码 ${result.code}`}`
}

function parseDockerProcessLine(line, header) {
  const text = String(line || '').trim()
  if (!text) return null
  const columns = text.split(/\s+/)
  const normalizedHeader = String(header || '').trim().toLowerCase()
  if (normalizedHeader.startsWith('uid pid ')) {
    if (columns.length < 8) return null
    return {
      pid: columns[1],
      command: columns[7] || columns[6] || '',
      args: columns.slice(8).join(' ')
    }
  }
  if (normalizedHeader.startsWith('user pid ')) {
    if (columns.length < 11) return null
    return {
      pid: columns[1],
      command: columns[10] || columns[9] || '',
      args: columns.slice(11).join(' ')
    }
  }
  const match = text.match(/^(\S+)\s+(\S+)\s*(.*)$/)
  if (!match) return null
  return {
    pid: match[1],
    command: match[2],
    args: match[3] || ''
  }
}

function parseDockerProcesses(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const header = lines[0]
  const rows = /pid/i.test(header) ? lines.slice(1) : lines
  return rows.map(line => parseDockerProcessLine(line, header)).filter(item => item && item.pid && item.command)
}

ipcMain.handle('docker:processes', async (event, payload = {}) => {
  const id = String(payload.id || '').trim()
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) throw new Error('容器 ID 不正确')
  const commands = [
    buildDockerCommand(`top ${id} -eo pid,comm,args`, !!payload.useSudo),
    buildDockerCommand(`exec ${id} sh -lc \"ps -eo pid,comm,args 2>/dev/null || ps aux 2>/dev/null || ps\"`, !!payload.useSudo),
    buildDockerCommand(`top ${id}`, !!payload.useSudo)
  ]
  let lastText = ''
  for (const command of commands) {
    const result = await runCommand(payload.sessionId, command)
    const fatalError = explainDockerFatalError(result)
    if (fatalError) throw new Error(fatalError)
    const parsed = parseDockerProcesses(result.stdout || result.stderr)
    if (parsed.length) {
      void persistDockerContainerProcesses(payload.sessionId, id, parsed)
      return parsed
    }
    lastText = `${result.stderr || ''}\n${result.stdout || ''}`.trim()
  }
  if (lastText) throw new Error(`容器内进程读取失败：${lastText}`)
  return []
})

ipcMain.handle('docker:logs', async (event, payload = {}) => {
  const id = String(payload.id || '').trim()
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) throw new Error('容器 ID 不正确')
  const lines = Math.max(20, Math.min(Number(payload.lines || 200), 1000))
  const result = await runCommand(payload.sessionId, buildDockerCommand(`logs --tail ${lines} ${id}`, !!payload.useSudo))
  const dockerError = explainDockerError(result)
  if (dockerError) throw new Error(dockerError)
  const content = result.stdout || result.stderr || '该容器暂无日志输出。'
  void persistDockerLogSnapshot(payload.sessionId, payload, content)
  return { content }
})

ipcMain.handle('docker:action', async (event, payload) => {
  const actions = ['start', 'stop', 'restart', 'rm']
  if (!actions.includes(payload.action)) throw new Error('不支持的 Docker 操作')
  const id = String(payload.id || '').trim()
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) throw new Error('容器 ID 不正确')
  const action = payload.action === 'rm' ? 'rm -f' : payload.action
  const result = await runCommand(payload.sessionId, buildDockerCommand(`${action} ${id}`, !!payload.useSudo))
  const dockerError = explainDockerError(result)
  if (dockerError) throw new Error(dockerError)
  return result
})

ipcMain.handle('system-users:overview', async (event, sessionId) => {
  const overview = await loadSystemUsersOverview(sessionId)
  void persistSystemUsersSnapshot(sessionId, overview)
  return overview
})

ipcMain.handle('system-users:create', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const username = normalizeLinuxUserName(payload.username)
  if (username === 'root') throw new Error('root 账户不支持通过此功能创建。')
  const adminGroup = await detectAdminGroup(sessionId)
  const groups = normalizeUserGroupList(payload.groups)
  if (payload.admin && !groups.includes(adminGroup)) groups.push(adminGroup)
  const shellPath = normalizeShellPath(payload.shell)
  const homePath = normalizeLinuxHomePath(payload.home)
  const options = [payload.createHome === false ? '-M' : '-m', `-s '${escapeShell(shellPath)}'`]
  if (homePath) options.push(`-d '${escapeShell(homePath)}'`)
  if (groups.length) options.push(`-G '${escapeShell(groups.join(','))}'`)
  ensureCommandSuccess(await runPrivilegedCommand(sessionId, `useradd ${options.join(' ')} ${username}`), '创建系统账户失败')
  if (String(payload.password || '')) {
    ensureCommandSuccess(await runPrivilegedCommand(sessionId, `printf '%s\n' '${escapeShell(`${username}:${String(payload.password)}`)}' | chpasswd`), '设置账户密码失败')
  }
  return { ok: true }
})

ipcMain.handle('system-users:update', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const username = normalizeLinuxUserName(payload.username)
  const adminGroup = await detectAdminGroup(sessionId)
  const commands = []
  if (payload.shell !== undefined) {
    commands.push(`usermod -s '${escapeShell(normalizeShellPath(payload.shell))}' ${username}`)
  }
  if (payload.groups !== undefined || payload.admin !== undefined) {
    const groups = normalizeUserGroupList(payload.groups)
    const nextGroups = payload.admin ? [...new Set([...groups, adminGroup])] : groups.filter(item => item !== adminGroup)
    commands.push(`usermod -G '${escapeShell(nextGroups.join(','))}' ${username}`)
  }
  if (payload.locked === true) {
    if (username === 'root') throw new Error('root 账户不支持锁定。')
    commands.push(`passwd -l ${username}`)
  }
  if (payload.locked === false) commands.push(`passwd -u ${username} || usermod -U ${username}`)
  if (!commands.length) return { ok: true }
  ensureCommandSuccess(await runPrivilegedCommand(sessionId, commands.join(' && ')), '更新系统账户失败')
  return { ok: true }
})

ipcMain.handle('system-users:rename', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const username = normalizeLinuxUserName(payload.username)
  const nextUsername = normalizeLinuxUserName(payload.newUsername)
  if (username === 'root' || nextUsername === 'root') throw new Error('root 账户不支持改名。')
  const currentUser = await findSystemUser(sessionId, username)
  if (!currentUser) throw new Error('要修改的系统账户不存在。')
  const shouldMoveHome = currentUser.home === `/home/${username}`
  const renameCommand = shouldMoveHome
    ? `usermod -l ${nextUsername} -d '/home/${escapeShell(nextUsername)}' -m ${username}`
    : `usermod -l ${nextUsername} ${username}`
  const groupRenameCommand = `if getent group ${username} >/dev/null 2>&1; then groupmod -n ${nextUsername} ${username}; fi`
  ensureCommandSuccess(await runPrivilegedCommand(sessionId, `${renameCommand} && ${groupRenameCommand}`), '系统账户改名失败')
  return { ok: true }
})

ipcMain.handle('system-users:delete', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const username = normalizeLinuxUserName(payload.username)
  if (username === 'root') throw new Error('root 账户不支持删除。')
  const option = payload.removeHome === false ? '' : '-r '
  ensureCommandSuccess(await runPrivilegedCommand(sessionId, `userdel ${option}${username}`.trim()), '删除系统账户失败')
  return { ok: true }
})

ipcMain.handle('system-users:change-password', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const username = normalizeLinuxUserName(payload.username)
  const password = String(payload.password || '')
  if (!password) throw new Error('新密码不能为空。')
  ensureCommandSuccess(await runPrivilegedCommand(sessionId, `printf '%s\n' '${escapeShell(`${username}:${password}`)}' | chpasswd`), '修改系统账户密码失败')
  return { ok: true }
})

ipcMain.handle('firewall:overview', async (event, sessionId) => {
  const overview = await loadFirewallOverview(sessionId)
  void persistFirewallSnapshot(sessionId, overview)
  return overview
})

ipcMain.handle('firewall:add-rule', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const requestedBackend = String(payload.backend || '').trim().toLowerCase()
  if (requestedBackend && !['auto', 'ufw', 'firewalld', 'iptables', 'nftables'].includes(requestedBackend)) throw new Error('不支持的防火墙写入后端。')
  const backend = await resolveWritableFirewallBackend(sessionId, requestedBackend || 'auto')
  if (backend === 'none') throw new Error('当前服务器没有检测到可管理的防火墙组件。')
  const protocol = normalizeProtocolValue(payload.protocol)
  const port = normalizeFirewallPortForProtocol(protocol, payload.port)
  const action = normalizeFirewallAction(payload.action)
  const direction = normalizeFirewallDirection(payload.direction)
  const source = normalizeFirewallSource(payload.source)
  const destination = normalizeFirewallSource(payload.destination || payload.target)
  if (backend === 'ufw') {
    if (protocol === 'icmp' || protocol === 'icmpv6') throw new Error('UFW 不支持通过普通端口规则管理 Ping/ICMP，请使用 iptables、nftables 或手动调整 UFW before.rules。')
    const ufwPort = port ? formatUfwPortValue(port) : ''
    const command = protocol === 'all'
      ? (direction === 'outbound'
          ? `ufw ${action} out to ${destination || 'any'}`
          : `ufw ${action} in from ${source || 'any'}`)
      : (direction === 'outbound'
          ? (destination
              ? `ufw ${action} out to ${destination} port ${ufwPort} proto ${protocol}`
              : `ufw ${action} out to any port ${ufwPort} proto ${protocol}`)
          : (source
              ? `ufw ${action} in from ${source} to any port ${ufwPort} proto ${protocol}`
              : `ufw ${action} in ${ufwPort}/${protocol}`))
    ensureCommandSuccess(await runPrivilegedCommand(sessionId, command), 'UFW 规则添加失败')
    return { ok: true }
  }
  if (backend === 'iptables') {
    ensureCommandSuccess(
      await runPrivilegedCommand(sessionId, buildIptablesRuleCommand({ port, protocol, action, direction, source, destination }, 'insert')),
      'iptables 规则添加失败'
    )
    return { ok: true }
  }
  if (backend === 'nftables') {
    ensureCommandSuccess(
      await runPrivilegedCommand(sessionId, buildNftablesAddCommand({ port, protocol, action, direction, source, destination })),
      'nftables 规则添加失败'
    )
    return { ok: true }
  }
  if (backend !== 'firewalld') {
    throw new Error(`当前服务器没有可管理的防火墙后端：${backend}`)
  }
  if (direction === 'outbound') throw new Error('firewalld 当前仅支持管理入站端口规则，出站规则请使用 UFW、iptables 或 nftables。')
  const firewalldCommand = !source && action === 'allow'
    && firewallProtocolNeedsPort(protocol)
    ? `firewall-cmd --permanent --add-port=${port}/${protocol}`
    : `firewall-cmd --permanent --add-rich-rule='${escapeShell(buildFirewalldRichRule({ port, protocol, action, source }))}'`
  const reloadCommand = 'if firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --reload >/dev/null 2>&1; fi'
  ensureCommandSuccess(await runPrivilegedCommand(sessionId, `${firewalldCommand} && ${reloadCommand}`), 'firewalld 规则添加失败')
  return { ok: true }
})

ipcMain.handle('firewall:enable-backend', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const backend = String(payload.backend || '').trim().toLowerCase()
  if (!sessionId) throw new Error('缺少服务器会话，无法启用防火墙。')
  if (backend === 'ufw') {
    ensureCommandSuccess(await runPrivilegedCommand(sessionId, 'command -v ufw >/dev/null 2>&1 && ufw --force enable'), 'UFW 启用失败')
    return { ok: true }
  }
  if (backend === 'firewalld') {
    const command = 'command -v firewall-cmd >/dev/null 2>&1 && { if command -v systemctl >/dev/null 2>&1; then systemctl enable --now firewalld; else service firewalld start; fi; }'
    ensureCommandSuccess(await runPrivilegedCommand(sessionId, command), 'firewalld 启用失败')
    return { ok: true }
  }
  throw new Error('当前防火墙后端不支持一键启用。')
})

ipcMain.handle('firewall:disable-backend', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const backend = String(payload.backend || '').trim().toLowerCase()
  if (!sessionId) throw new Error('缺少服务器会话，无法停用防火墙。')
  if (backend === 'ufw') {
    ensureCommandSuccess(await runPrivilegedCommand(sessionId, 'command -v ufw >/dev/null 2>&1 && ufw --force disable'), 'UFW 停用失败')
    return { ok: true }
  }
  if (backend === 'firewalld') {
    const command = 'command -v firewall-cmd >/dev/null 2>&1 && { if command -v systemctl >/dev/null 2>&1; then systemctl disable --now firewalld; else service firewalld stop; fi; }'
    ensureCommandSuccess(await runPrivilegedCommand(sessionId, command), 'firewalld 停用失败')
    return { ok: true }
  }
  throw new Error('当前防火墙后端不支持一键停用。')
})

ipcMain.handle('firewall:delete-rule', async (event, payload = {}) => {
  const sessionId = String(payload.sessionId || '').trim()
  const rule = payload.rule || {}
  const backend = String(rule.backend || await detectFirewallBackend(sessionId)).trim()
  if (backend === 'ufw') {
    if (!Number.isInteger(rule.number) || rule.number <= 0) throw new Error('UFW 规则编号不正确，无法删除。')
    ensureCommandSuccess(await runPrivilegedCommand(sessionId, `ufw --force delete ${rule.number}`), 'UFW 规则删除失败')
    return { ok: true }
  }
  if (backend === 'iptables') {
    const rawRule = String(rule.raw || '').trim()
    if (!rawRule.startsWith('-A ')) throw new Error('iptables 规则内容不完整，无法删除。')
    const deleteCommand = `${getIptablesBinaryForRule(rule)} ${rawRule.replace(/^-A\s+/, '-D ')}`
    ensureCommandSuccess(await runPrivilegedCommand(sessionId, deleteCommand), 'iptables 规则删除失败')
    return { ok: true }
  }
  if (backend === 'nftables') {
    const tableFamily = String(rule.tableFamily || '').trim()
    const table = String(rule.table || '').trim()
    const chain = String(rule.chain || '').trim()
    const handle = Number(rule.handle)
    if (tableFamily && table && chain && Number.isFinite(handle) && handle > 0) {
      const directResult = await runPrivilegedCommand(sessionId, `nft delete rule ${tableFamily} ${table} ${chain} handle ${handle}`)
      if (!directResult.code) return { ok: true }
    }

    const normalizeRulePeer = value => String(value || 'any').trim() || 'any'
    const targetText = String(rule.target || '').trim()
    const [targetPort = '', targetProtocol = ''] = targetText.split('/')
    const targetProtocolOnly = !targetProtocol && ['all', 'icmp', 'icmpv6'].includes(targetText.toLowerCase()) ? targetText.toLowerCase() : ''
    const targetLooksLikePort = /^\d{1,5}([,:-]\d{1,5})*$/.test(targetPort)
    const expectedPort = String(rule.port || (targetProtocol || targetLooksLikePort ? targetPort : '') || '').trim()
    const expectedProtocol = String(rule.protocol || targetProtocol || targetProtocolOnly || '').trim().toLowerCase()
    const expectedAction = String(rule.action || '').trim()
    const expectedDirection = String(rule.direction || 'inbound').trim()
    const expectedSource = normalizeRulePeer(rule.source)
    const expectedDestination = normalizeRulePeer(rule.destination)
    const ruleRaw = String(rule.raw || '').trim()
    const latestOverview = await loadFirewallOverview(sessionId)
    const nftLayer = latestOverview.diagnostics?.firewallLayers?.find(item => item.key === 'nftables')
    const latestNftRules = [...(latestOverview.rules || []), ...(nftLayer?.rules || [])]
      .filter(item => item.backend === 'nftables')
      .filter((item, index, items) => items.findIndex(candidate => candidate.tableFamily === item.tableFamily
        && candidate.table === item.table
        && candidate.chain === item.chain
        && Number(candidate.handle) === Number(item.handle)) === index)
    const latestRule = latestNftRules.find(item => {
      const itemHandle = Number(item.handle)
      if (!Number.isFinite(itemHandle) || itemHandle <= 0) return false
      const itemRaw = String(item.raw || '').trim()
      if (ruleRaw && itemRaw === ruleRaw) return true
      if (expectedPort && String(item.port || '') !== expectedPort) return false
      if (expectedProtocol && String(item.protocol || '').toLowerCase() !== expectedProtocol) return false
      if (expectedAction && String(item.action || '') !== expectedAction) return false
      if (expectedDirection && String(item.direction || 'inbound') !== expectedDirection) return false
      if (normalizeRulePeer(item.source) !== expectedSource) return false
      if (normalizeRulePeer(item.destination) !== expectedDestination) return false
      return !!(expectedPort || expectedProtocol || ruleRaw)
    })

    const latestTableFamily = String(latestRule?.tableFamily || '').trim()
    const latestTable = String(latestRule?.table || '').trim()
    const latestChain = String(latestRule?.chain || '').trim()
    const latestHandle = Number(latestRule?.handle)
    if (!latestTableFamily || !latestTable || !latestChain || !Number.isFinite(latestHandle) || latestHandle <= 0) {
      return { ok: true, alreadyDeleted: true }
    }
    ensureCommandSuccess(
      await runPrivilegedCommand(sessionId, `nft delete rule ${latestTableFamily} ${latestTable} ${latestChain} handle ${latestHandle}`),
      'nftables 规则删除失败'
    )
    return { ok: true }
  }
  if (backend !== 'firewalld') throw new Error('当前服务器没有可删除的防火墙规则。')
  const scopes = rule.scope === 'both'
    ? ['runtime', 'permanent']
    : [rule.scope || 'permanent']
  const commands = []
  for (const scope of scopes) {
    const prefix = scope === 'permanent' ? '--permanent ' : ''
    if (rule.kind === 'port') {
      commands.push(`firewall-cmd ${prefix}--remove-port=${normalizePortValue(rule.port)}/${normalizeProtocolValue(rule.protocol)}`)
    } else if (rule.kind === 'service') {
      const service = String(rule.service || rule.raw || '').trim()
      if (!service) throw new Error('service 规则内容为空，无法删除。')
      commands.push(`firewall-cmd ${prefix}--remove-service=${service}`)
    } else if (rule.kind === 'rich') {
      if (!String(rule.raw || '').trim()) throw new Error('rich rule 内容为空，无法删除。')
      commands.push(`firewall-cmd ${prefix}--remove-rich-rule='${escapeShell(String(rule.raw || '').trim())}'`)
    } else {
      throw new Error('暂不支持删除这条 firewalld 规则。')
    }
  }
  if (!commands.length) {
    throw new Error('暂不支持删除这条 firewalld 规则。')
  }
  const reloadCommand = 'if firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --reload >/dev/null 2>&1; fi'
  const fullCommand = scopes.includes('permanent') ? `${commands.join(' && ')} && ${reloadCommand}` : commands.join(' && ')
  ensureCommandSuccess(await runPrivilegedCommand(sessionId, fullCommand), 'firewalld 规则删除失败')
  return { ok: true }
})

ipcMain.handle('db:connect', async (event, payload = {}) => {
  const config = normalizeDatabaseConnectionConfig(payload)
  const tunnelStream = config.useSshTunnel ? await openDatabaseTunnelStream(config.sessionId, config.host, config.port) : null
  const connection = await mysql.createConnection({
    host: config.useSshTunnel ? undefined : config.host,
    port: config.useSshTunnel ? undefined : config.port,
    user: config.username,
    password: config.password,
    database: config.database || undefined,
    connectTimeout: 10000,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    stream: tunnelStream || undefined
  })
  const id = `db-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const [versionRows] = await connection.query('SELECT VERSION() AS version')
  databaseSessions.set(id, {
    id,
    type: config.type,
    connection,
    tunnelStream,
    activeDatabase: config.database,
    host: config.host,
    port: config.port,
    username: config.username,
    useSshTunnel: config.useSshTunnel,
    sessionId: config.sessionId
  })
  return {
    id,
    type: config.type,
    host: config.host,
    port: config.port,
    username: config.username,
    activeDatabase: config.database,
    useSshTunnel: config.useSshTunnel,
    version: String(versionRows?.[0]?.version || '').trim()
  }
})

ipcMain.handle('db:disconnect', async (event, id) => {
  await closeDatabaseSession(id)
  return { ok: true }
})

ipcMain.handle('db:list-databases', async (event, id) => {
  const session = getDatabaseSession(id)
  try {
    const [rows] = await session.connection.query('SHOW DATABASES')
    return (Array.isArray(rows) ? rows : [])
      .map(row => String(Object.values(row || {})[0] || '').trim())
      .filter(Boolean)
  } catch (error) {
    if (session.activeDatabase) return [session.activeDatabase]
    throw new Error(`读取数据库列表失败：${error.message}`)
  }
})

ipcMain.handle('db:create-database', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = normalizeDatabaseIdentifier(payload.database)
  const startedAt = Date.now()
  await session.connection.query({
    sql: `CREATE DATABASE ${escapeMysqlIdentifier(database)} CHARACTER SET utf8mb4`,
    timeout: 20000
  })
  session.activeDatabase = database
  return {
    kind: 'command',
    command: 'CREATE DATABASE',
    activeDatabase: database,
    durationMs: Date.now() - startedAt,
    message: `已新建数据库 ${database}`
  }
})

ipcMain.handle('db:list-tables', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  if (!database) return []
  const [rows] = await session.connection.query(`SHOW FULL TABLES FROM ${escapeMysqlIdentifier(database)} WHERE Table_type IN ('BASE TABLE', 'VIEW')`)
  return (Array.isArray(rows) ? rows : []).map(row => {
    const values = Object.values(row || {})
    const name = String(values[0] || '').trim()
    const type = String(row?.Table_type || values[1] || '').trim().toLowerCase()
    return {
      name,
      type: type === 'view' ? 'view' : 'table'
    }
  }).filter(item => item.name)
})

ipcMain.handle('db:describe-table', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再查看表结构')
  if (!table) throw new Error('请选择表后再查看表结构')
  const startedAt = Date.now()
  const metadata = await readDatabaseTableMetadata(session, database, table)
  const durationMs = Date.now() - startedAt
  const normalizedRows = normalizeDatabaseRows(metadata.columnRows).map(row => ({
    ...row,
    Length: extractDatabaseColumnLength(row?.Type)
  }))
  const availableKeys = new Set(Object.keys(normalizedRows[0] || {}))
  const orderedKeys = DATABASE_SCHEMA_COLUMN_ORDER.filter(key => availableKeys.has(key))
  const remainingKeys = Object.keys(normalizedRows[0] || {}).filter(key => !orderedKeys.includes(key))
  return {
    kind: 'rows',
    command: 'DESCRIBE',
    columns: [...orderedKeys, ...remainingKeys].map(key => ({
      prop: key,
      label: DATABASE_SCHEMA_COLUMN_LABELS[key] || key
    })),
    rows: normalizedRows,
    fieldMeta: metadata.fieldMeta,
    identityKey: metadata.identityKey,
    canMutateRows: !!metadata.identityKey,
    rowCount: normalizedRows.length,
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: `已读取 ${database}.${table} 的表结构`
  }
})

ipcMain.handle('db:preview-table', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再预览表数据')
  if (!table) throw new Error('请选择表后再预览数据')
  await ensureDatabaseSelection(session, database)
  const page = normalizeDatabasePage(payload.page)
  const pageSize = normalizeDatabasePageSize(payload.pageSize)
  const offset = (page - 1) * pageSize
  const target = `${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)}`
  let total = 0
  try {
    const [countRows] = await session.connection.query(`SELECT COUNT(*) AS total FROM ${target}`)
    total = Number(countRows?.[0]?.total || 0)
  } catch (error) {
    total = 0
  }
  const startedAt = Date.now()
  const [rows, fields] = await session.connection.query(`SELECT * FROM ${target} LIMIT ${pageSize} OFFSET ${offset}`)
  const durationMs = Date.now() - startedAt
  const normalizedRows = normalizeDatabaseRows(rows)
  return {
    kind: 'rows',
    command: 'SELECT',
    columns: (fields || []).map(field => ({ prop: field.name, label: field.name })),
    rows: normalizedRows,
    rowCount: normalizedRows.length,
    total,
    page,
    pageSize,
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: `已预览 ${database}.${table}，第 ${page} 页`
  }
})

function limitDatabaseQueryRows(sql = '') {
  const statement = String(sql || '').trim().replace(/;+\s*$/, '')
  if (!/^select\b/i.test(statement) || /\blimit\b/i.test(statement) || /\binto\s+(?:outfile|dumpfile)\b/i.test(statement) || /\bfor\s+(?:update|share)\b|\block\s+in\s+share\s+mode\b/i.test(statement)) {
    return { sql: statement, limited: false }
  }
  return { sql: `${statement} LIMIT ${DATABASE_SQL_MAX_ROWS + 1}`, limited: true }
}

ipcMain.handle('db:query', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const sql = String(payload.sql || '').trim()
  if (!sql) throw new Error('SQL 不能为空')
  const targetDatabase = String(payload.database || session.activeDatabase || '').trim()
  if (targetDatabase) await ensureDatabaseSelection(session, targetDatabase)
  const queryPlan = limitDatabaseQueryRows(sql)
  const startedAt = Date.now()
  const [rows, fields] = await session.connection.query({ sql: queryPlan.sql, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  const command = parseDatabaseCommand(sql)
  const switchedDatabase = parseUseDatabase(sql)
  if (switchedDatabase) session.activeDatabase = switchedDatabase
  if (Array.isArray(rows)) {
    const truncated = queryPlan.limited && rows.length > DATABASE_SQL_MAX_ROWS
    const normalizedRows = normalizeDatabaseRows(truncated ? rows.slice(0, DATABASE_SQL_MAX_ROWS) : rows)
    return {
      kind: 'rows',
      command,
      columns: (fields || []).map(field => ({ prop: field.name, label: field.name })),
      rows: normalizedRows,
      rowCount: normalizedRows.length,
      truncated,
      durationMs,
      activeDatabase: session.activeDatabase || '',
      message: truncated
        ? `查询完成，仅显示前 ${DATABASE_SQL_MAX_ROWS} 行；请使用 LIMIT 分页查询更多数据`
        : `查询完成，返回 ${normalizedRows.length} 行`
    }
  }
  const affectedRows = Number(rows?.affectedRows || 0)
  return {
    kind: 'command',
    command,
    columns: [],
    rows: [],
    affectedRows,
    insertId: Number(rows?.insertId || 0),
    warningStatus: Number(rows?.warningStatus || 0),
    durationMs,
    activeDatabase: session.activeDatabase || '',
    message: command === 'USE'
      ? `已切换到数据库 ${session.activeDatabase || targetDatabase || ''}`.trim()
      : (rows?.info || `执行完成，影响 ${affectedRows} 行`)
  }
})

ipcMain.handle('db:update-row', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再保存行修改')
  if (!table) throw new Error('请选择数据表后再保存行修改')
  const metadata = await readDatabaseTableMetadata(session, database, table)
  if (!metadata.identityKey) throw new Error('当前表未识别到主键或唯一键，暂不支持行编辑')
  const editableFields = new Map(metadata.fieldMeta.filter(item => !item.readOnly && !metadata.identityKey.columns.includes(item.name)).map(item => [item.name, item]))
  const changes = Object.entries(payload.changes || {}).filter(([key]) => editableFields.has(String(key || '').trim()))
  if (!changes.length) {
    return {
      kind: 'command',
      command: 'UPDATE',
      affectedRows: 0,
      durationMs: 0,
      activeDatabase: session.activeDatabase || database,
      message: '没有检测到可保存的字段修改'
    }
  }
  const identityValues = payload.identityValues && typeof payload.identityValues === 'object' ? payload.identityValues : {}
  const where = buildDatabaseWhereClause(metadata.identityKey.columns, identityValues)
  const setSql = changes.map(([key]) => `${escapeMysqlIdentifier(key)} = ?`).join(', ')
  const sql = `UPDATE ${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)} SET ${setSql} WHERE ${where.sql}`
  const params = [...changes.map(([, value]) => value), ...where.values]
  const startedAt = Date.now()
  const [result] = await session.connection.query({ sql, values: params, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  const affectedRows = Number(result?.affectedRows || 0)
  return {
    kind: 'command',
    command: 'UPDATE',
    affectedRows,
    insertId: Number(result?.insertId || 0),
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: affectedRows
      ? `已更新 ${database}.${table} 中的 ${affectedRows} 行`
      : '没有匹配到可更新的行，数据可能已被修改'
  }
})

ipcMain.handle('db:delete-row', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再删除行数据')
  if (!table) throw new Error('请选择数据表后再删除行数据')
  const metadata = await readDatabaseTableMetadata(session, database, table)
  if (!metadata.identityKey) throw new Error('当前表未识别到主键或唯一键，暂不支持行删除')
  const identityValues = payload.identityValues && typeof payload.identityValues === 'object' ? payload.identityValues : {}
  const where = buildDatabaseWhereClause(metadata.identityKey.columns, identityValues)
  const sql = `DELETE FROM ${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)} WHERE ${where.sql}`
  const startedAt = Date.now()
  const [result] = await session.connection.query({ sql, values: where.values, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  const affectedRows = Number(result?.affectedRows || 0)
  return {
    kind: 'command',
    command: 'DELETE',
    affectedRows,
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: affectedRows
      ? `已从 ${database}.${table} 删除 ${affectedRows} 行`
      : '没有匹配到可删除的行，数据可能已被修改'
  }
})

ipcMain.handle('db:update-column', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再编辑字段')
  if (!table) throw new Error('请选择数据表后再编辑字段')
  const nextColumn = normalizeDatabaseColumnMutationPayload(payload.column)
  const currentName = String(nextColumn.oldName || '').trim()
  if (!currentName) throw new Error('缺少原字段名称，无法保存修改')
  const metadata = await readDatabaseTableMetadata(session, database, table)
  const currentField = metadata.fieldMeta.find(item => item.name === currentName)
  if (!currentField) throw new Error(`字段 ${currentName} 不存在或已被修改`)
  if (currentField.schemaReadOnly) throw new Error(`字段 ${currentName} 当前不支持通过可视化方式编辑`)
  const definition = buildDatabaseColumnDefinition({
    ...currentField,
    ...nextColumn,
    collation: nextColumn.collation,
    comment: nextColumn.comment
  })
  const alterClauses = [
    `CHANGE COLUMN ${escapeMysqlIdentifier(currentName)} ${definition}`,
    ...buildDatabaseKeyAlterClauses(metadata, currentField, nextColumn)
  ]
  const sql = `ALTER TABLE ${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)} ${alterClauses.join(', ')}`
  const startedAt = Date.now()
  const [result] = await session.connection.query({ sql, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  const affectedRows = Number(result?.affectedRows || 0)
  return {
    kind: 'command',
    command: 'ALTER',
    affectedRows,
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: `已更新 ${table}.${nextColumn.name} 的字段定义`
  }
})

ipcMain.handle('db:delete-column', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  const column = String(payload.column || '').trim()
  if (!database) throw new Error('请选择数据库后再删除字段')
  if (!table) throw new Error('请选择数据表后再删除字段')
  if (!column) throw new Error('请选择字段后再删除')
  const sql = `ALTER TABLE ${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)} DROP COLUMN ${escapeMysqlIdentifier(column)}`
  const startedAt = Date.now()
  const [result] = await session.connection.query({ sql, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  const affectedRows = Number(result?.affectedRows || 0)
  return {
    kind: 'command',
    command: 'ALTER',
    affectedRows,
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: `已删除 ${table}.${column} 字段`
  }
})

ipcMain.handle('db:add-row', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再新增数据')
  if (!table) throw new Error('请选择数据表后再新增数据')
  const metadata = await readDatabaseTableMetadata(session, database, table)
  const insertPayload = buildInsertRowPayload(metadata.fieldMeta, payload.values || {})
  const target = `${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)}`
  const sql = insertPayload.columns.length
    ? `INSERT INTO ${target} (${insertPayload.columns.map(escapeMysqlIdentifier).join(', ')}) VALUES (${insertPayload.columns.map(() => '?').join(', ')})`
    : `INSERT INTO ${target} () VALUES ()`
  const startedAt = Date.now()
  const [result] = await session.connection.query({ sql, values: insertPayload.values, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  const affectedRows = Number(result?.affectedRows || 0)
  return {
    kind: 'command',
    command: 'INSERT',
    affectedRows,
    insertId: Number(result?.insertId || 0),
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: affectedRows ? `已向 ${database}.${table} 新增 1 行数据` : `已尝试向 ${database}.${table} 新增数据`
  }
})

ipcMain.handle('db:add-column', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再新增字段')
  if (!table) throw new Error('请选择数据表后再新增字段')
  const nextColumn = normalizeDatabaseColumnMutationPayload(payload.column)
  const definition = buildDatabaseColumnDefinition(nextColumn)
  const positionClause = buildAddColumnPositionClause(payload.position)
  const sql = `ALTER TABLE ${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(table)} ADD COLUMN ${definition}${positionClause}`
  const startedAt = Date.now()
  const [result] = await session.connection.query({ sql, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  const affectedRows = Number(result?.affectedRows || 0)
  return {
    kind: 'command',
    command: 'ALTER',
    affectedRows,
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: `已向 ${table} 新增字段 ${nextColumn.name}`
  }
})

ipcMain.handle('db:delete-database', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  if (!database) throw new Error('请选择要删除的数据库')
  const sql = `DROP DATABASE ${escapeMysqlIdentifier(database)}`
  const startedAt = Date.now()
  const [result] = await session.connection.query({ sql, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  session.activeDatabase = session.activeDatabase === database ? '' : session.activeDatabase
  return {
    kind: 'command',
    command: 'DROP',
    affectedRows: Number(result?.affectedRows || 0),
    durationMs,
    activeDatabase: session.activeDatabase || '',
    message: `已删除数据库 ${database}`
  }
})

ipcMain.handle('db:delete-table', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再删除数据表')
  if (!table) throw new Error('请选择数据表后再删除')
  const object = await readDatabaseObjectMeta(session, database, table)
  const keyword = object.type === 'view' ? 'VIEW' : 'TABLE'
  const sql = `DROP ${keyword} ${escapeMysqlIdentifier(database)}.${escapeMysqlIdentifier(object.name)}`
  const startedAt = Date.now()
  const [result] = await session.connection.query({ sql, timeout: 20000 })
  const durationMs = Date.now() - startedAt
  return {
    kind: 'command',
    command: 'DROP',
    affectedRows: Number(result?.affectedRows || 0),
    durationMs,
    activeDatabase: session.activeDatabase || database,
    message: object.type === 'view' ? `已删除视图 ${database}.${object.name}` : `已删除数据表 ${database}.${object.name}`
  }
})

ipcMain.handle('db:prepare-import-table-sql', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再导入 SQL')
  const result = await dialog.showOpenDialog({
    title: table ? `导入 SQL 到 ${database}.${table}` : `导入数据表到 ${database}`,
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'SQL 文件', extensions: ['sql'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }
  const preview = await buildImportPreview(session, result.filePaths, database)
  return {
    canceled: false,
    database,
    table,
    ...preview
  }
})

ipcMain.handle('db:import-table-sql', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再导入 SQL')
  const preparedPaths = Array.isArray(payload.filePaths) ? payload.filePaths.filter(Boolean) : []
  const result = preparedPaths.length ? { canceled: false, filePaths: preparedPaths } : await dialog.showOpenDialog({
    title: table ? `导入 SQL 到 ${database}.${table}` : `导入数据表到 ${database}`,
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'SQL 文件', extensions: ['sql'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }
  let executedCount = 0
  const startedAt = Date.now()
  for (const filePath of result.filePaths) {
    const sql = fs.readFileSync(filePath, 'utf8')
    const imported = await importDatabaseSql(session, database, sql)
    executedCount += Number(imported.executedCount || 0)
  }
  return {
    canceled: false,
    filePaths: result.filePaths,
    kind: 'command',
    command: 'IMPORT',
    activeDatabase: session.activeDatabase || database,
    durationMs: Date.now() - startedAt,
    affectedRows: 0,
    statementCount: executedCount,
    message: `已向 ${database} 导入 ${result.filePaths.length} 个数据表 SQL 文件，共执行 ${executedCount} 条语句`
  }
})

ipcMain.handle('db:export-table-sql', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  const table = String(payload.table || '').trim()
  if (!database) throw new Error('请选择数据库后再导出表')
  if (!table) throw new Error('请选择数据表后再导出')
  const result = await dialog.showSaveDialog({
    title: `导出 ${database}.${table}`,
    defaultPath: `${database}-${table}.sql`,
    buttonLabel: '导出',
    filters: [
      { name: 'SQL 文件', extensions: ['sql'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  const startedAt = Date.now()
  const exported = await buildTableDumpSql(session, database, table)
  fs.writeFileSync(result.filePath, exported.sql, 'utf8')
  return {
    canceled: false,
    filePath: result.filePath,
    kind: 'command',
    command: 'EXPORT',
    activeDatabase: database,
    durationMs: Date.now() - startedAt,
    affectedRows: 0,
    tableCount: exported.tableCount,
    viewCount: exported.viewCount,
    rowCount: exported.rowCount,
    message: exported.objectType === 'view'
      ? `已导出视图 ${database}.${table}`
      : `已导出表 ${database}.${table}，共 ${exported.rowCount} 行数据`
  }
})

ipcMain.handle('db:export-database-tables', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  if (!database) throw new Error('请选择要导出数据表的数据库')
  const result = await dialog.showOpenDialog({
    title: `选择 ${database} 数据表导出目录`,
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }
  const startedAt = Date.now()
  const exported = await exportDatabaseTablesToDirectory(session, database, result.filePaths[0])
  return {
    canceled: false,
    folderPath: exported.exportRoot,
    kind: 'command',
    command: 'EXPORT',
    activeDatabase: database,
    durationMs: Date.now() - startedAt,
    affectedRows: 0,
    tableCount: exported.tableCount,
    rowCount: exported.rowCount,
    message: `已导出 ${database} 的 ${exported.tableCount} 张数据表到 ${exported.exportRoot}`
  }
})

ipcMain.handle('db:prepare-import-sql', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || '').trim()
  const result = await dialog.showOpenDialog({
    title: database ? `导入 SQL 到 ${database}` : '导入数据库 SQL',
    properties: ['openFile'],
    filters: [
      { name: 'SQL 文件', extensions: ['sql'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }
  const filePath = result.filePaths[0]
  const sql = fs.readFileSync(filePath, 'utf8')
  const detected = database ? { kind: 'database', database } : resolveImportDatabaseTarget(filePath, sql)
  const targetDatabase = database || detected.database
  const preview = await buildImportPreview(session, result.filePaths, targetDatabase)
  return {
    canceled: false,
    database,
    targetDatabase,
    importKind: detected.kind,
    inferredDatabase: database ? '' : detected.database,
    filePath,
    ...preview
  }
})

ipcMain.handle('db:import-sql', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || '').trim()
  const preparedPath = String(payload.filePath || '').trim()
  const result = preparedPath ? { canceled: false, filePaths: [preparedPath] } : await dialog.showOpenDialog({
    title: database ? `导入 SQL 到 ${database}` : '导入数据库 SQL',
    properties: ['openFile'],
    filters: [
      { name: 'SQL 文件', extensions: ['sql'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return { canceled: true }
  const filePath = result.filePaths[0]
  const sql = fs.readFileSync(filePath, 'utf8')
  const detected = database ? { kind: 'database', database } : resolveImportDatabaseTarget(filePath, sql)
  const targetDatabase = database || detected.database
  if (detected.kind === 'table') {
    await session.connection.query({
      sql: `CREATE DATABASE IF NOT EXISTS ${escapeMysqlIdentifier(targetDatabase)} CHARACTER SET utf8mb4`,
      timeout: 20000
    })
  }
  const imported = await importDatabaseSql(session, targetDatabase, sql)
  return {
    canceled: false,
    filePath,
    kind: 'command',
    command: 'IMPORT',
    activeDatabase: imported.activeDatabase || targetDatabase,
    durationMs: imported.durationMs,
    affectedRows: 0,
    statementCount: imported.executedCount,
    importKind: detected.kind,
    inferredDatabase: detected.kind === 'table' ? targetDatabase : '',
    message: detected.kind === 'table'
      ? `已创建或使用数据库 ${targetDatabase}，并导入 ${imported.executedCount} 条 SQL 语句`
      : (imported.activeDatabase
          ? `已向 ${imported.activeDatabase} 导入 ${imported.executedCount} 条 SQL 语句`
          : `已导入 ${imported.executedCount} 条 SQL 语句`)
  }
})

ipcMain.handle('db:export-sql', async (event, payload = {}) => {
  const session = getDatabaseSession(payload.id)
  const database = String(payload.database || session.activeDatabase || '').trim()
  if (!database) throw new Error('请选择要导出的数据库')
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const result = await dialog.showSaveDialog({
    title: `导出 ${database}`,
    defaultPath: `${database}-${timestamp}.sql`,
    buttonLabel: '导出',
    filters: [
      { name: 'SQL 文件', extensions: ['sql'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  const startedAt = Date.now()
  const exported = await buildDatabaseDumpSql(session, database)
  fs.writeFileSync(result.filePath, exported.sql, 'utf8')
  return {
    canceled: false,
    filePath: result.filePath,
    kind: 'command',
    command: 'EXPORT',
    activeDatabase: database,
    durationMs: Date.now() - startedAt,
    affectedRows: 0,
    tableCount: exported.tableCount,
    viewCount: exported.viewCount,
    rowCount: exported.rowCount,
    message: `已导出 ${database}：${exported.tableCount} 张表、${exported.viewCount} 个视图、${exported.rowCount} 行数据`
  }
})

process.on('uncaughtExceptionMonitor', (error, origin) => {
  appendApplicationLog({
    level: 'error',
    source: 'main-process',
    message: error?.message || '主进程发生未捕获异常',
    stack: error?.stack || '',
    details: { origin }
  }, { priority: true })
})

app.on('child-process-gone', (event, details) => {
  if (details?.reason === 'clean-exit' || details?.reason === 'killed') return
  appendApplicationLog({
    level: 'error',
    source: 'electron-child-process',
    message: `Electron 子进程异常退出：${details?.type || 'unknown'} / ${details?.reason || 'unknown'}`,
    details
  }, { priority: true })
})

app.whenReady().then(() => {
  migrateLegacyUserData()
  migrateLegacyApplicationLogs()
  cleanupStaleTempFiles()
  installOutboundConnectionAudit()
  appendApplicationLog({
    level: 'info',
    source: 'application',
    message: `应用启动，版本 ${app.getVersion()}`
  }, { priority: true })
  registerMediaPreviewProtocol()
  createWindow()
})

app.on('window-all-closed', () => {
  cleanupObjectStorageDragTempPaths()
  for (const previewPath of previewTempFiles) {
    removeLocalTempPath(previewPath)
  }
  previewTempFiles.clear()
  for (const stream of tailStreams.values()) {
    stream.signal('TERM')
    stream.end()
  }
  tailStreams.clear()
  for (const channelId of terminalChannels.keys()) {
    closeTerminalChannel(channelId)
  }
  terminalChannels.clear()
  for (const session of sessions.values()) {
    if (session.protocol === 'ssh') {
      void closeSessionSftpClient(session)
      clearPendingTerminalShellSync(session)
      session.stream && session.stream.end()
      session.conn && session.conn.end()
    }
    if (session.protocol === 'sftp') {
      void closeSessionSftpClient(session)
    }
    if (session.protocol === 'ftp') {
      session.client && session.client.close()
    }
  }
  sessions.clear()
  for (const session of databaseSessions.values()) {
    try {
      session.connection.destroy()
    } catch (error) {
      // 忽略数据库连接销毁失败，避免阻断应用退出。
    }
  }
  databaseSessions.clear()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
