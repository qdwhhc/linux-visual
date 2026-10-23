import { ref } from 'vue'

let nginxVisualId = 0

function nextNginxVisualId(prefix = 'item') {
  nginxVisualId += 1
  return `${prefix}-${Date.now()}-${nginxVisualId}`
}

function createNginxVisualLocation(overrides = {}) {
  return {
    id: nextNginxVisualId('loc'),
    modifier: '',
    matcher: '/',
    mode: 'proxy',
    pathDirective: 'root',
    proxyPass: '',
    root: '',
    index: '',
    tryFiles: '',
    returnRule: '',
    customDirectives: '',
    ...overrides
  }
}

function createNginxVisualServer(overrides = {}) {
  return {
    id: nextNginxVisualId('srv'),
    listenText: '80',
    serverNameText: '',
    root: '',
    index: 'index.html index.htm',
    accessLog: '',
    errorLog: '',
    sslCertificate: '',
    sslCertificateKey: '',
    customDirectives: '',
    locations: [createNginxVisualLocation()],
    ...overrides
  }
}

function createNginxVisualModel(overrides = {}) {
  return {
    mainDirectives: '',
    httpDirectives: '',
    servers: [createNginxVisualServer()],
    ...overrides
  }
}

function createNginxEditorState(overrides = {}) {
  return {
    path: '',
    name: '',
    modified: '',
    size: 0,
    loading: false,
    saving: false,
    code: '',
    originalCode: '',
    visualModel: createNginxVisualModel(),
    parseOk: false,
    parseMessage: '等待加载站点配置',
    ...overrides
  }
}

function isMainConfigPath(filePath = '') {
  return String(filePath || '').endsWith('/nginx.conf')
}

function toSingleLineText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function splitNonEmptyLines(value = '') {
  return String(value || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

function normalizeDirectiveLine(line = '') {
  return String(line || '').trim().replace(/;$/, '').trim()
}

const reportedNginxErrorKeys = new Set()

function reportNginxError(scope = '', payload = {}) {
  const entry = {
    time: new Date().toISOString(),
    scope: String(scope || ''),
    payload: payload || {}
  }
  const error = new Error(payload?.message || `Nginx 操作失败：${entry.scope}`)
  const details = { scope: entry.scope, path: String(payload?.path || '') }
  const fingerprint = `${entry.scope}:${details.path}:${error.message}`
  if (reportedNginxErrorKeys.has(fingerprint)) return entry
  reportedNginxErrorKeys.add(fingerprint)
  window.setTimeout(() => reportedNginxErrorKeys.delete(fingerprint), 30000)
  if (window.reportApplicationError) window.reportApplicationError('nginx', error, details)
  else console.error('[nginx]', error, details)
  return entry
}

function countToken(text = '', token = '') {
  if (!text || !token) return 0
  return String(text).split(token).length - 1
}

function indentBlock(text = '', indent = '    ') {
  const lines = String(text || '').split(/\r?\n/)
  return lines.map(line => `${indent}${line}`).join('\n')
}

function extractTopLevelHttpBlock(content = '') {
  const lines = String(content || '').split(/\r?\n/)
  const beforeLines = []
  const afterLines = []
  const blockLines = []
  let found = false
  let closed = false
  let depth = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!found) {
      if (/^http\s*\{/.test(trimmed)) {
        found = true
        blockLines.push(line)
        depth = countToken(line, '{') - countToken(line, '}')
        if (depth <= 0) closed = true
      } else {
        beforeLines.push(line)
      }
      continue
    }

    if (!closed) {
      blockLines.push(line)
      depth += countToken(line, '{') - countToken(line, '}')
      if (depth <= 0) closed = true
      continue
    }

    afterLines.push(line)
  }

  return {
    found,
    before: beforeLines.join('\n').trim(),
    block: blockLines.join('\n').trim(),
    after: afterLines.join('\n').trim()
  }
}

function unwrapBlockContent(blockText = '') {
  const lines = String(blockText || '').split(/\r?\n/)
  if (lines.length < 2) return ''
  return lines.slice(1, -1).join('\n').trim()
}

function extractServerBlocks(content = '') {
  const lines = String(content || '').split(/\r?\n/)
  const outsideLines = []
  const blocks = []
  let activeBlock = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!activeBlock) {
      if (/^server\s*\{/.test(trimmed)) {
        activeBlock = {
          lines: [line],
          depth: countToken(line, '{') - countToken(line, '}')
        }
        if (activeBlock.depth <= 0) {
          blocks.push(activeBlock.lines)
          activeBlock = null
        }
      } else {
        outsideLines.push(line)
      }
      continue
    }

    activeBlock.lines.push(line)
    activeBlock.depth += countToken(line, '{') - countToken(line, '}')
    if (activeBlock.depth <= 0) {
      blocks.push(activeBlock.lines)
      activeBlock = null
    }
  }

  return {
    outsideDirectives: outsideLines.join('\n').trim(),
    blocks
  }
}

function extractLocationBlocks(content = '') {
  const lines = String(content || '').split(/\r?\n/)
  const blocks = []
  let activeBlock = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!activeBlock) {
      if (/^location\s+.+\{/.test(trimmed)) {
        activeBlock = {
          lines: [line],
          depth: countToken(line, '{') - countToken(line, '}')
        }
        if (activeBlock.depth <= 0) {
          blocks.push(activeBlock.lines)
          activeBlock = null
        }
      }
      continue
    }

    activeBlock.lines.push(line)
    activeBlock.depth += countToken(line, '{') - countToken(line, '}')
    if (activeBlock.depth <= 0) {
      blocks.push(activeBlock.lines)
      activeBlock = null
    }
  }

  return blocks
}

export function parseLocationBlock(lines = []) {
  const header = String(Array.isArray(lines) ? lines[0] || '' : '').trim()
  const headerMatch = header.match(/^location\s+(?:(=|~\*|~|\^~)\s+)?(.+?)\s*\{$/)
  const location = createNginxVisualLocation({
    modifier: headerMatch?.[1] || '',
    matcher: headerMatch?.[2] || '/'
  })
  const customLines = []
  let depth = 0
  let customBlockDepth = 0

  for (let index = 0; index < (Array.isArray(lines) ? lines.length : 0); index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const depthBefore = depth
    const braceDelta = countToken(line, '{') - countToken(line, '}')
    depth += braceDelta
    if (index === 0) continue
    if (customBlockDepth > 0) {
      customLines.push(trimmed)
      customBlockDepth += braceDelta
      continue
    }
    if (depthBefore !== 1) continue
    if (!trimmed || trimmed === '}') continue
    if (trimmed.startsWith('#')) {
      customLines.push(trimmed)
      continue
    }
    const normalized = normalizeDirectiveLine(trimmed)
    const directiveMatch = normalized.match(/^([A-Za-z_]+)\s+(.+)$/)
    if (!directiveMatch) {
      customLines.push(trimmed)
      continue
    }
    const [, directive, rawValue] = directiveMatch
    const value = toSingleLineText(rawValue)
    if (directive === 'proxy_pass') location.proxyPass = value
    else if (directive === 'root' || directive === 'alias') {
      location.pathDirective = directive === 'alias' ? 'alias' : 'root'
      location.root = value
    }
    else if (directive === 'index') location.index = location.index ? `${location.index}\n${value}`.trim() : value
    else if (directive === 'try_files') location.tryFiles = value
    else if (directive === 'return') location.returnRule = value
    else {
      customLines.push(trimmed)
      if (braceDelta > 0) customBlockDepth = braceDelta
    }
  }

  if (location.proxyPass) location.mode = 'proxy'
  else if (location.returnRule) location.mode = 'redirect'
  else if (location.root || location.tryFiles) location.mode = 'static'
  else location.mode = 'custom'
  location.customDirectives = customLines.join('\n').trim()
  return location
}

export function parseServerBlock(lines = []) {
  const serverText = Array.isArray(lines) ? lines.join('\n') : String(lines || '')
  const locationBlocks = extractLocationBlocks(serverText).map(parseLocationBlock)
  const server = createNginxVisualServer({
    listenText: '',
    locations: locationBlocks.length ? locationBlocks : [createNginxVisualLocation()]
  })
  const customLines = []
  let depth = 0
  let customBlockDepth = 0

  for (let index = 0; index < (Array.isArray(lines) ? lines.length : 0); index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const depthBefore = depth
    const braceDelta = countToken(line, '{') - countToken(line, '}')
    depth += braceDelta
    if (index === 0) continue
    if (customBlockDepth > 0) {
      customLines.push(trimmed)
      customBlockDepth += braceDelta
      continue
    }
    if (depthBefore !== 1) continue
    if (!trimmed || trimmed === '}') continue
    if (trimmed.startsWith('location ')) continue
    if (trimmed.startsWith('#')) {
      customLines.push(trimmed)
      continue
    }
    const normalized = normalizeDirectiveLine(trimmed)
    const directiveMatch = normalized.match(/^([A-Za-z_]+)\s+(.+)$/)
    if (!directiveMatch) {
      customLines.push(trimmed)
      continue
    }
    const [, directive, rawValue] = directiveMatch
    const value = toSingleLineText(rawValue)
    if (directive === 'listen') {
      server.listenText = server.listenText ? `${server.listenText}\n${value}` : value
    } else if (directive === 'server_name') {
      server.serverNameText = server.serverNameText ? `${server.serverNameText}\n${value}`.trim() : value
    } else if (directive === 'root') {
      server.root = value
    } else if (directive === 'index') {
      server.index = server.index ? `${server.index}\n${value}`.trim() : value
    } else if (directive === 'access_log') {
      server.accessLog = server.accessLog ? `${server.accessLog}\n${value}`.trim() : value
    } else if (directive === 'error_log') {
      server.errorLog = server.errorLog ? `${server.errorLog}\n${value}`.trim() : value
    } else if (directive === 'ssl_certificate') {
      server.sslCertificate = value
    } else if (directive === 'ssl_certificate_key') {
      server.sslCertificateKey = value
    } else {
      customLines.push(trimmed)
      if (braceDelta > 0) customBlockDepth = braceDelta
    }
  }

  server.listenText = server.listenText.trim() || '80'
  server.customDirectives = customLines.join('\n').trim()
  return server
}

export function parseNginxConfigToVisualModel(content = '', filePath = '') {
  const text = String(content || '')
  let mainDirectives = ''
  let httpBody = text

  if (isMainConfigPath(filePath)) {
    const httpBlock = extractTopLevelHttpBlock(text)
    mainDirectives = [httpBlock.before, httpBlock.after].filter(Boolean).join('\n\n').trim()
    httpBody = httpBlock.found ? unwrapBlockContent(httpBlock.block) : ''
  }

  const { outsideDirectives, blocks } = extractServerBlocks(httpBody)
  const servers = blocks.map(parseServerBlock)

  return createNginxVisualModel({
    mainDirectives,
    httpDirectives: outsideDirectives,
    servers: servers.length ? servers : [createNginxVisualServer()]
  })
}

function buildLocationBlock(location) {
  const modifier = String(location?.modifier || '').trim()
  const matcher = String(location?.matcher || '/').trim() || '/'
  const lines = [`    location ${modifier ? `${modifier} ` : ''}${matcher} {`]
  if (location?.mode === 'proxy' && String(location?.proxyPass || '').trim()) {
    lines.push(`        proxy_pass ${String(location.proxyPass).trim()};`)
  }
  if (location?.mode === 'static' && String(location?.root || '').trim()) {
    const directive = String(location?.pathDirective || '').trim() === 'alias' ? 'alias' : 'root'
    lines.push(`        ${directive} ${String(location.root).trim()};`)
  }
  splitNonEmptyLines(location?.index || '').forEach(item => lines.push(`        index ${toSingleLineText(item)};`))
  if (location?.mode === 'static' && String(location?.tryFiles || '').trim()) {
    lines.push(`        try_files ${String(location.tryFiles).trim()};`)
  }
  if (location?.mode === 'redirect' && String(location?.returnRule || '').trim()) {
    lines.push(`        return ${String(location.returnRule).trim()};`)
  }
  const customDirectives = String(location?.customDirectives || '').trim()
  if (customDirectives) lines.push(indentBlock(customDirectives, '        '))
  lines.push('    }')
  return lines.join('\n')
}

function buildServerBlock(server) {
  const lines = ['server {']
  const listenLines = splitNonEmptyLines(server?.listenText || '')
  if (!listenLines.length) lines.push('    listen 80;')
  else listenLines.forEach(item => lines.push(`    listen ${normalizeDirectiveLine(item)};`))

  splitNonEmptyLines(server?.serverNameText || '').forEach(item => lines.push(`    server_name ${toSingleLineText(item)};`))
  if (String(server?.root || '').trim()) lines.push(`    root ${String(server.root).trim()};`)
  splitNonEmptyLines(server?.index || '').forEach(item => lines.push(`    index ${toSingleLineText(item)};`))
  splitNonEmptyLines(server?.accessLog || '').forEach(item => lines.push(`    access_log ${String(item).trim()};`))
  splitNonEmptyLines(server?.errorLog || '').forEach(item => lines.push(`    error_log ${String(item).trim()};`))
  if (String(server?.sslCertificate || '').trim()) lines.push(`    ssl_certificate ${String(server.sslCertificate).trim()};`)
  if (String(server?.sslCertificateKey || '').trim()) lines.push(`    ssl_certificate_key ${String(server.sslCertificateKey).trim()};`)

  const customDirectives = String(server?.customDirectives || '').trim()
  if (customDirectives) lines.push(indentBlock(customDirectives, '    '))

  const locations = Array.isArray(server?.locations) && server.locations.length ? server.locations : [createNginxVisualLocation()]
  locations.forEach(location => lines.push(buildLocationBlock(location)))
  lines.push('}')
  return lines.join('\n')
}

function buildNginxConfigFromVisualModel(model, filePath = '') {
  const serverBlockText = (Array.isArray(model?.servers) && model.servers.length ? model.servers : [createNginxVisualServer()])
    .map(buildServerBlock)
    .join('\n\n')
  const httpDirectives = String(model?.httpDirectives || '').trim()

  if (isMainConfigPath(filePath)) {
    const mainDirectives = String(model?.mainDirectives || '').trim()
    const httpBody = [httpDirectives, serverBlockText].filter(Boolean).join('\n\n')
    const parts = []
    if (mainDirectives) parts.push(mainDirectives)
    parts.push(`http {\n${indentBlock(httpBody, '    ')}\n}`)
    return `${parts.join('\n\n').trim()}\n`
  }

  return `${[httpDirectives, serverBlockText].filter(Boolean).join('\n\n').trim()}\n`
}

export function useNginxManager(options) {
  const {
    connected,
    sessionId,
    ensureSshFeature,
    message,
    openEditor
  } = options

  const nginxSites = ref([])
  const sslDomain = ref('')
  const selectedNginxSitePath = ref('')
  const selectedNginxSiteEditor = ref(createNginxEditorState())
  let parseTimer = null

  function resetNginxState() {
    nginxSites.value = []
    sslDomain.value = ''
    selectedNginxSitePath.value = ''
    selectedNginxSiteEditor.value = createNginxEditorState()
    if (parseTimer) {
      clearTimeout(parseTimer)
      parseTimer = null
    }
  }

  function getNginxSiteByPath(path = '') {
    const target = String(path || '').trim()
    if (!target) return null
    return nginxSites.value.find(item => item.path === target) || null
  }

  function setSelectedNginxVisualModel(model) {
    selectedNginxSiteEditor.value.visualModel = createNginxVisualModel({
      mainDirectives: String(model?.mainDirectives || '').trim(),
      httpDirectives: String(model?.httpDirectives || '').trim(),
      servers: (Array.isArray(model?.servers) && model.servers.length ? model.servers : [createNginxVisualServer()]).map(server => createNginxVisualServer({
        ...server,
        locations: (Array.isArray(server?.locations) && server.locations.length ? server.locations : [createNginxVisualLocation()]).map(location => createNginxVisualLocation(location))
      }))
    })
  }

  function parseSelectedNginxCode() {
    try {
      const model = parseNginxConfigToVisualModel(selectedNginxSiteEditor.value.code, selectedNginxSiteEditor.value.path)
      setSelectedNginxVisualModel(model)
      selectedNginxSiteEditor.value.parseOk = true
      selectedNginxSiteEditor.value.parseMessage = '已从右侧代码同步回左侧结构化表单'
    } catch (error) {
      selectedNginxSiteEditor.value.parseOk = false
      selectedNginxSiteEditor.value.parseMessage = `代码解析失败：${error.message}`
    }
  }

  function scheduleParseSelectedNginxCode() {
    if (parseTimer) clearTimeout(parseTimer)
    parseTimer = setTimeout(() => {
      parseSelectedNginxCode()
      parseTimer = null
    }, 260)
  }

  function syncVisualToCode() {
    selectedNginxSiteEditor.value.code = buildNginxConfigFromVisualModel(selectedNginxSiteEditor.value.visualModel, selectedNginxSiteEditor.value.path)
    selectedNginxSiteEditor.value.parseOk = true
    selectedNginxSiteEditor.value.parseMessage = '已根据左侧结构化表单重新生成配置文件'
  }

  async function selectNginxSite(site, options = {}) {
    if (!site?.path) return
    const forceReload = options.forceReload === true
    if (!forceReload && selectedNginxSitePath.value === site.path && selectedNginxSiteEditor.value.code) return
    if (!ensureSshFeature('Nginx 管理')) return
    selectedNginxSitePath.value = String(site.path || '')
    selectedNginxSiteEditor.value = createNginxEditorState({
      path: String(site.path || ''),
      name: String(site.name || ''),
      modified: String(site.modified || ''),
      size: Number(site.size || 0),
      loading: true
    })

    try {
      const content = await window.whSSH.readTextFile({
        sessionId: sessionId.value,
        path: site.path,
        encoding: 'utf8'
      })
      const visualModel = parseNginxConfigToVisualModel(content, site.path)
      selectedNginxSiteEditor.value = createNginxEditorState({
        path: String(site.path || ''),
        name: String(site.name || ''),
        modified: String(site.modified || ''),
        size: Number(site.size || 0),
        code: content,
        originalCode: content,
        visualModel,
        parseOk: true,
        parseMessage: '已读取配置文件，并转换为 Main / HTTP / Server / Location 结构'
      })
    } catch (error) {
      reportNginxError('select-site:failed', {
        path: String(site.path || ''),
        message: error?.message || String(error || '')
      })
      selectedNginxSiteEditor.value.loading = false
      selectedNginxSiteEditor.value.parseOk = false
      selectedNginxSiteEditor.value.parseMessage = `读取配置文件失败：${error.message}`
      message.value = `Nginx 站点读取失败：${error.message}`
    }
  }

  async function loadNginxSites(options = {}) {
    if (!connected.value) return
    if (!ensureSshFeature('Nginx 管理')) return
    try {
      nginxSites.value = await window.whSSH.listNginxSites({
        sessionId: sessionId.value,
        nginxHome: options.nginxHome || options.root,
        mainConfigPath: options.mainConfigPath,
        scanPaths: options.scanPaths
      })
      const preferredPath = String(options.path || selectedNginxSitePath.value || '').trim()
      const nextSite = getNginxSiteByPath(preferredPath) || nginxSites.value[0] || null
      if (nextSite) await selectNginxSite(nextSite, { forceReload: options.forceReload === true })
      else {
        selectedNginxSitePath.value = ''
        selectedNginxSiteEditor.value = createNginxEditorState({ parseMessage: '还没有读取到站点文件' })
      }
    } catch (error) {
      reportNginxError('load-sites:failed', {
        message: error?.message || String(error || '')
      })
      message.value = `Nginx 站点读取失败：${error.message}`
    }
  }

  function updateSelectedNginxCode(code = '') {
    selectedNginxSiteEditor.value.code = String(code || '')
    selectedNginxSiteEditor.value.parseMessage = '正在根据右侧代码重新同步结构...'
    scheduleParseSelectedNginxCode()
  }

  function addVisualServer() {
    selectedNginxSiteEditor.value.visualModel.servers.push(createNginxVisualServer())
    syncVisualToCode()
  }

  function removeVisualServer(serverId) {
    const list = selectedNginxSiteEditor.value.visualModel.servers
    if (list.length <= 1) {
      list.splice(0, list.length, createNginxVisualServer())
    } else {
      const index = list.findIndex(item => item.id === serverId)
      if (index > -1) list.splice(index, 1)
    }
    syncVisualToCode()
  }

  function addVisualLocation(serverId) {
    const server = selectedNginxSiteEditor.value.visualModel.servers.find(item => item.id === serverId)
    if (!server) return
    server.locations.push(createNginxVisualLocation())
    syncVisualToCode()
  }

  function removeVisualLocation(serverId, locationId) {
    const server = selectedNginxSiteEditor.value.visualModel.servers.find(item => item.id === serverId)
    if (!server) return
    if (server.locations.length <= 1) {
      server.locations.splice(0, server.locations.length, createNginxVisualLocation())
    } else {
      const index = server.locations.findIndex(item => item.id === locationId)
      if (index > -1) server.locations.splice(index, 1)
    }
    syncVisualToCode()
  }

  async function saveSelectedNginxSite(saveOptions = {}) {
    if (!selectedNginxSiteEditor.value.path || selectedNginxSiteEditor.value.saving) return
    if (!ensureSshFeature('Nginx 管理')) return
    const content = Object.prototype.hasOwnProperty.call(saveOptions, 'content') ? String(saveOptions.content || '') : selectedNginxSiteEditor.value.code
    try {
      selectedNginxSiteEditor.value.saving = true
      const payload = {
        sessionId: sessionId.value,
        path: selectedNginxSiteEditor.value.path,
        content,
        encoding: 'utf8',
        backupDir: saveOptions.backupDir || '/www/backup/nginx',
        mainConfigPath: saveOptions.mainConfigPath || ''
      }
      const result = window.whSSH.safeWriteNginxConfig
        ? await window.whSSH.safeWriteNginxConfig(payload)
        : await window.whSSH.writeTextFile(payload)
      selectedNginxSiteEditor.value.code = content
      selectedNginxSiteEditor.value.originalCode = content
      message.value = result?.backupPath
        ? `已备份、保存、校验并重载 Nginx：${result.backupPath}`
        : `已保存 ${selectedNginxSiteEditor.value.name || selectedNginxSiteEditor.value.path}`
      await loadNginxSites({ path: selectedNginxSiteEditor.value.path, forceReload: true })
      return true
    } catch (error) {
      reportNginxError('save-site:failed', {
        path: String(selectedNginxSiteEditor.value.path || ''),
        message: error?.message || String(error || '')
      })
      message.value = `保存 Nginx 配置失败：${error.message}`
      return false
    } finally {
      selectedNginxSiteEditor.value.saving = false
    }
  }

  async function saveAndRunNginxAction(action, saveOptions = {}) {
    const saved = await saveSelectedNginxSite(saveOptions)
    if (saved && selectedNginxSiteEditor.value.path && action && action !== 'reload') await runNginxAction(action)
  }

  async function runNginxAction(action, options = {}) {
    if (!ensureSshFeature('Nginx 管理')) return
    try {
      const result = await window.whSSH.nginxAction({ sessionId: sessionId.value, action, domain: options.domain ?? sslDomain.value, ...options })
      message.value = result.stderr || result.stdout || 'Nginx 操作已执行'
      if (action !== 'certbot') await loadNginxSites({ path: selectedNginxSitePath.value, forceReload: true })
      return result
    } catch (error) {
      reportNginxError(`nginx-action-${action}:failed`, {
        message: error?.message || String(error || '')
      })
      message.value = `Nginx 操作失败：${error.message}`
      return null
    }
  }

  function openSelectedNginxSiteInEditor() {
    if (!selectedNginxSiteEditor.value.path) return
    openEditor({ path: selectedNginxSiteEditor.value.path })
  }

  return {
    nginxSites,
    sslDomain,
    selectedNginxSitePath,
    selectedNginxSiteEditor,
    resetNginxState,
    loadNginxSites,
    selectNginxSite,
    updateSelectedNginxCode,
    parseSelectedNginxCode,
    syncVisualToCode,
    addVisualServer,
    removeVisualServer,
    addVisualLocation,
    removeVisualLocation,
    saveSelectedNginxSite,
    saveAndRunNginxAction,
    runNginxAction,
    openSelectedNginxSiteInEditor
  }
}
