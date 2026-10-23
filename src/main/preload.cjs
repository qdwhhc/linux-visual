const { contextBridge, ipcRenderer, webUtils } = require('electron')

function normalizeApplicationLogPayload(payload = {}) {
  let details = ''
  try {
    const serializedDetails = JSON.stringify(payload.details ?? '')
    details = serializedDetails.length > 64000
      ? { truncated: true, reason: '附加信息超过 64 KB' }
      : JSON.parse(serializedDetails)
  } catch (error) {
    details = { truncated: true, reason: '附加信息无法序列化' }
  }
  return {
    level: String(payload.level || '').slice(0, 16),
    source: String(payload.source || '').slice(0, 160),
    message: String(payload.message || '').slice(0, 4000),
    stack: String(payload.stack || '').slice(0, 12000),
    details
  }
}

function normalizeClipboardItems(items = []) {
  return Array.from(items || []).map(item => ({
    path: String(item?.path || ''),
    name: String(item?.name || ''),
    type: item?.type === 'd' ? 'd' : '-'
  })).filter(item => item.path)
}

contextBridge.exposeInMainWorld('whSSH', {
  connect: config => ipcRenderer.invoke('ssh:connect', config),
  disconnect: id => ipcRenderer.invoke('ssh:disconnect', id),
  getAppStorageItem: key => ipcRenderer.invoke('app-storage:get', key),
  setAppStorageItem: payload => ipcRenderer.invoke('app-storage:set', payload),
  deleteAppStorageItem: key => ipcRenderer.invoke('app-storage:delete', key),
  getActivationState: () => ipcRenderer.invoke('activation:get-state'),
  activateOfflineLicense: payload => ipcRenderer.invoke('activation:activate', payload),
  getAppDatabaseSchema: () => ipcRenderer.invoke('app-database:schema'),
  listAppDatabaseTables: () => ipcRenderer.invoke('app-database:tables'),
  describeAppDatabaseTable: tableName => ipcRenderer.invoke('app-database:describe-table', tableName),
  previewAppDatabaseTable: payload => ipcRenderer.invoke('app-database:preview-table', payload),
  queryAppDatabase: payload => ipcRenderer.invoke('app-database:query', payload),
  appendApplicationLog: payload => ipcRenderer.invoke('app-log:append', normalizeApplicationLogPayload(payload)),
  readApplicationLogs: () => ipcRenderer.invoke('app-log:read'),
  getNetworkAuditLog: () => ipcRenderer.invoke('network-audit:read'),
  clearApplicationLogs: () => ipcRenderer.invoke('app-log:clear'),
  deleteApplicationLogEntry: payload => ipcRenderer.invoke('app-log:delete-entry', payload),
  getNginxComposeDraft: payload => ipcRenderer.invoke('nginx-compose-draft:get', payload),
  setNginxComposeDraft: payload => ipcRenderer.invoke('nginx-compose-draft:set', payload),
  deleteNginxComposeDraft: payload => ipcRenderer.invoke('nginx-compose-draft:delete', payload),
  listConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: config => ipcRenderer.invoke('connections:save', config),
  deleteConnection: id => ipcRenderer.invoke('connections:delete', id),
  listLocalRoots: () => ipcRenderer.invoke('local:roots'),
  listLocalFiles: args => ipcRenderer.invoke('local:list', args),
  searchLocalFiles: args => ipcRenderer.invoke('local:search', args),
  chooseLocalDir: () => ipcRenderer.invoke('local:choose-dir'),
  chooseLocalTextFile: payload => ipcRenderer.invoke('local:choose-text-file', payload),
  openLocalPath: payload => ipcRenderer.invoke('local:open-path', payload),
  readLocalImage: payload => ipcRenderer.invoke('local:read-image', payload),
  openLocalInExplorer: payload => ipcRenderer.invoke('local:open-in-explorer', payload),
  showLocalProperties: payload => ipcRenderer.invoke('local:properties', payload),
  createLocalFile: payload => ipcRenderer.invoke('local:create-file', payload),
  createLocalDirectory: payload => ipcRenderer.invoke('local:create-directory', payload),
  deleteLocalPath: payload => ipcRenderer.invoke('local:delete', payload),
  renameLocalPath: payload => ipcRenderer.invoke('local:rename', payload),
  setLocalClipboard: payload => ipcRenderer.invoke('local:clipboard-set', {
    operation: payload?.operation === 'cut' ? 'cut' : 'copy',
    items: normalizeClipboardItems(payload?.items)
  }),
  pasteLocalClipboard: payload => ipcRenderer.invoke('local:paste', {
    targetDir: String(payload?.targetDir || ''),
    conflictAction: ['overwrite', 'skip', 'rename'].includes(payload?.conflictAction) ? payload.conflictAction : ''
  }),
  importLocalPaths: payload => ipcRenderer.invoke('local:import-paths', payload),
  getDroppedFilePaths: files => Array.from(files || []).map(file => {
    try {
      return String(webUtils.getPathForFile(file) || '').trim()
    } catch (error) {
      return String(file?.path || '').trim()
    }
  }).filter(Boolean),
  showLocalContextMenu: payload => ipcRenderer.invoke('local:context-menu', payload),
  showNativeContextMenu: payload => ipcRenderer.invoke('ui:context-menu', payload),
  onNativeContextMenuAction: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('ui:context-menu-action', listener)
    return () => ipcRenderer.removeListener('ui:context-menu-action', listener)
  },
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  readClipboardFilePaths: () => ipcRenderer.invoke('clipboard:read-file-paths'),
  writeClipboardText: text => ipcRenderer.invoke('clipboard:write-text', text),
  openExternalUrl: url => ipcRenderer.invoke('shell:open-external', url),
  onBrowserOpenTab: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('browser:open-tab', listener)
    return () => ipcRenderer.removeListener('browser:open-tab', listener)
  },
  onWindowStateChanged: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('window:state-changed', listener)
    return () => ipcRenderer.removeListener('window:state-changed', listener)
  },
  onLocalRefresh: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('local:refresh', listener)
    return () => ipcRenderer.removeListener('local:refresh', listener)
  },
  uploadLocalFile: payload => ipcRenderer.invoke('transfer:upload-local', {
    sessionId: String(payload?.sessionId || ''),
    localPath: String(payload?.localPath || ''),
    remoteDir: String(payload?.remoteDir || '')
  }),
  downloadRemoteFile: payload => ipcRenderer.invoke('transfer:download-remote', payload),
  startRemoteDrag: payload => ipcRenderer.invoke('transfer:start-remote-drag', payload),
  sendInput: (id, data) => ipcRenderer.send('terminal:input', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  openTerminalChannel: payload => ipcRenderer.invoke('terminal:open-channel', payload),
  closeTerminalChannel: id => ipcRenderer.invoke('terminal:close-channel', id),
  onTerminalData: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalClosed: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('terminal:closed', listener)
    return () => ipcRenderer.removeListener('terminal:closed', listener)
  },
  listFiles: payload => ipcRenderer.invoke('sftp:list', payload),
  searchFiles: payload => ipcRenderer.invoke('sftp:search', payload),
  uploadFile: payload => ipcRenderer.invoke('sftp:upload', payload),
  downloadFile: payload => ipcRenderer.invoke('sftp:download', payload),
  getRemoteDirectoryAccess: payload => ipcRenderer.invoke('sftp:dir-access', payload),
  makeDir: payload => ipcRenderer.invoke('sftp:mkdir', payload),
  deleteFile: payload => ipcRenderer.invoke('sftp:delete', payload),
  renameFile: payload => ipcRenderer.invoke('sftp:rename', payload),
  pasteRemoteFile: payload => ipcRenderer.invoke('sftp:paste', {
    sessionId: String(payload?.sessionId || ''),
    items: normalizeClipboardItems(payload?.items),
    targetDir: String(payload?.targetDir || ''),
    operation: payload?.operation === 'cut' ? 'cut' : 'copy',
    conflictAction: ['overwrite', 'skip', 'rename'].includes(payload?.conflictAction) ? payload.conflictAction : ''
  }),
  readTextFile: payload => ipcRenderer.invoke('sftp:read-text', payload),
  readRemoteImage: payload => ipcRenderer.invoke('sftp:read-image', payload),
  prepareRemoteImagePreview: payload => ipcRenderer.invoke('sftp:prepare-image-preview', payload),
  prepareRemoteMediaPreview: payload => ipcRenderer.invoke('sftp:prepare-media-preview', payload),
  cleanupPreviewTempFile: payload => ipcRenderer.invoke('preview:cleanup-temp-file', payload),
  writeTextFile: payload => ipcRenderer.invoke('sftp:write-text', payload),
  safeWriteNginxConfig: payload => ipcRenderer.invoke('nginx:safe-write-config', payload),
  chmodFile: payload => ipcRenderer.invoke('sftp:chmod', payload),
  chownFile: payload => ipcRenderer.invoke('sftp:chown', payload),
  getOverview: sessionId => ipcRenderer.invoke('server:overview', sessionId),
  getServices: sessionId => ipcRenderer.invoke('server:services', sessionId),
  runRemoteCommand: payload => ipcRenderer.invoke('server:run-command', payload),
  listPm2Processes: sessionId => ipcRenderer.invoke('pm2:list', sessionId),
  getPm2ProcessDetail: payload => ipcRenderer.invoke('pm2:detail', payload),
  readPm2Logs: payload => ipcRenderer.invoke('pm2:logs', payload),
  pm2Action: payload => ipcRenderer.invoke('pm2:action', payload),
  renamePm2Process: payload => ipcRenderer.invoke('pm2:rename', payload),
  validatePm2CreateDraft: payload => ipcRenderer.invoke('pm2:validate-create', payload),
  createPm2Process: payload => ipcRenderer.invoke('pm2:create', payload),
  savePm2ProcessList: sessionId => ipcRenderer.invoke('pm2:save', sessionId),
  reloadPm2Runtime: sessionId => ipcRenderer.invoke('pm2:reload-runtime', sessionId),
  listLogFiles: sessionId => ipcRenderer.invoke('server:list-logs', sessionId),
  serviceAction: payload => ipcRenderer.invoke('server:service-action', payload),
  readLog: payload => ipcRenderer.invoke('server:read-log', payload),
  startTail: payload => ipcRenderer.invoke('server:start-tail', payload),
  stopTail: id => ipcRenderer.invoke('server:stop-tail', id),
  onTailData: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('log:tail-data', listener)
    return () => ipcRenderer.removeListener('log:tail-data', listener)
  },
  onTailClosed: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('log:tail-closed', listener)
    return () => ipcRenderer.removeListener('log:tail-closed', listener)
  },
  listNginxSites: payload => ipcRenderer.invoke('nginx:sites', payload),
  getNginxTopology: payload => ipcRenderer.invoke('nginx:topology', payload),
  getNginxSslStatus: payload => ipcRenderer.invoke('nginx:ssl-status', payload),
  listNginxSslCertificates: () => ipcRenderer.invoke('nginx:ssl-certificates:list'),
  saveNginxSslCertificates: payload => ipcRenderer.invoke('nginx:ssl-certificates:save', payload),
  deleteNginxSslCertificate: id => ipcRenderer.invoke('nginx:ssl-certificates:delete', id),
  nginxAction: payload => ipcRenderer.invoke('nginx:action', payload),
  getSystemUsersOverview: sessionId => ipcRenderer.invoke('system-users:overview', sessionId),
  createSystemUser: payload => ipcRenderer.invoke('system-users:create', payload),
  updateSystemUser: payload => ipcRenderer.invoke('system-users:update', payload),
  renameSystemUser: payload => ipcRenderer.invoke('system-users:rename', payload),
  deleteSystemUser: payload => ipcRenderer.invoke('system-users:delete', payload),
  changeSystemUserPassword: payload => ipcRenderer.invoke('system-users:change-password', payload),
  getFirewallOverview: sessionId => ipcRenderer.invoke('firewall:overview', sessionId),
  addFirewallRule: payload => ipcRenderer.invoke('firewall:add-rule', payload),
  enableFirewallBackend: payload => ipcRenderer.invoke('firewall:enable-backend', payload),
  disableFirewallBackend: payload => ipcRenderer.invoke('firewall:disable-backend', payload),
  deleteFirewallRule: payload => ipcRenderer.invoke('firewall:delete-rule', payload),
  connectDatabase: payload => ipcRenderer.invoke('db:connect', payload),
  disconnectDatabase: id => ipcRenderer.invoke('db:disconnect', id),
  listDatabaseConnections: () => ipcRenderer.invoke('db-connections:list'),
  saveDatabaseConnection: payload => ipcRenderer.invoke('db-connections:save', payload),
  deleteDatabaseConnection: id => ipcRenderer.invoke('db-connections:delete', id),
  listDatabases: id => ipcRenderer.invoke('db:list-databases', id),
  createDatabase: payload => ipcRenderer.invoke('db:create-database', payload),
  listDatabaseTables: payload => ipcRenderer.invoke('db:list-tables', payload),
  describeDatabaseTable: payload => ipcRenderer.invoke('db:describe-table', payload),
  previewDatabaseTable: payload => ipcRenderer.invoke('db:preview-table', payload),
  queryDatabase: payload => ipcRenderer.invoke('db:query', payload),
  deleteDatabase: payload => ipcRenderer.invoke('db:delete-database', payload),
  deleteDatabaseTable: payload => ipcRenderer.invoke('db:delete-table', payload),
  addDatabaseRow: payload => ipcRenderer.invoke('db:add-row', payload),
  updateDatabaseRow: payload => ipcRenderer.invoke('db:update-row', payload),
  deleteDatabaseRow: payload => ipcRenderer.invoke('db:delete-row', payload),
  addDatabaseColumn: payload => ipcRenderer.invoke('db:add-column', payload),
  updateDatabaseColumn: payload => ipcRenderer.invoke('db:update-column', payload),
  deleteDatabaseColumn: payload => ipcRenderer.invoke('db:delete-column', payload),
  prepareImportDatabaseSql: payload => ipcRenderer.invoke('db:prepare-import-sql', payload),
  importDatabaseSql: payload => ipcRenderer.invoke('db:import-sql', payload),
  exportDatabaseSql: payload => ipcRenderer.invoke('db:export-sql', payload),
  prepareImportDatabaseTableSql: payload => ipcRenderer.invoke('db:prepare-import-table-sql', payload),
  importDatabaseTableSql: payload => ipcRenderer.invoke('db:import-table-sql', payload),
  exportDatabaseTableSql: payload => ipcRenderer.invoke('db:export-table-sql', payload),
  exportDatabaseTables: payload => ipcRenderer.invoke('db:export-database-tables', payload),
  listObjectStorageConnections: () => ipcRenderer.invoke('object-storage-connections:list'),
  saveObjectStorageConnection: payload => ipcRenderer.invoke('object-storage-connections:save', payload),
  deleteObjectStorageConnection: id => ipcRenderer.invoke('object-storage-connections:delete', id),
  listObjectStorageObjects: payload => ipcRenderer.invoke('object-storage:objects', payload),
  uploadObjectStorageObjects: payload => ipcRenderer.invoke('object-storage:upload', payload),
  onObjectStorageUploadProgress: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('object-storage:upload-progress', listener)
    return () => ipcRenderer.removeListener('object-storage:upload-progress', listener)
  },
  onObjectStorageDownloadProgress: callback => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('object-storage:download-progress', listener)
    return () => ipcRenderer.removeListener('object-storage:download-progress', listener)
  },
  createObjectStorageDirectory: payload => ipcRenderer.invoke('object-storage:create-directory', payload),
  downloadObjectStorageObject: payload => ipcRenderer.invoke('object-storage:download', payload),
  downloadObjectStorageObjectsToDirectory: payload => ipcRenderer.invoke('object-storage:download-to-directory', payload),
  startObjectStorageDrag: payload => ipcRenderer.invoke('object-storage:start-drag', payload),
  deleteObjectStorageObjects: payload => ipcRenderer.invoke('object-storage:delete', payload),
  renameObjectStorageObject: payload => ipcRenderer.invoke('object-storage:rename', payload),
  setObjectStorageAcl: payload => ipcRenderer.invoke('object-storage:set-acl', payload),
  getObjectStorageAcl: payload => ipcRenderer.invoke('object-storage:get-acl', payload),
  createObjectStorageSignedUrl: payload => ipcRenderer.invoke('object-storage:signed-url', payload),
  previewObjectStorageObject: payload => ipcRenderer.invoke('object-storage:preview', payload),
  getObjectStorageThumbnail: payload => ipcRenderer.invoke('object-storage:thumbnail', payload),
  listDockerContainers: payload => ipcRenderer.invoke('docker:containers', payload),
  listDockerProcesses: payload => ipcRenderer.invoke('docker:processes', payload),
  readDockerLogs: payload => ipcRenderer.invoke('docker:logs', payload),
  dockerAction: payload => ipcRenderer.invoke('docker:action', payload)
})
