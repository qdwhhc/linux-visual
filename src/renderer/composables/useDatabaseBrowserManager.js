import { computed } from 'vue'

export function useDatabaseBrowserManager(options) {
  const {
    databaseConnected,
    databaseConnectionId,
    databaseLoading,
    databaseDatabases,
    databaseTables,
    databaseTablesByDatabase,
    databaseExpandedKeys,
    databaseTreeLoadingKeys,
    databaseActiveDatabase,
    databaseSelectedTable,
    databaseContentTab,
    databaseDataTab,
    databasePreview,
    databaseSchema,
    databaseResult,
    databaseSqlResult,
    databaseRowDialog,
    databaseColumnDialog,
    selectedDatabaseResultRow,
    selectedDatabaseSchemaRow,
    selectedDatabaseSqlRow,
    databaseSqlHistory,
    activeDatabaseSqlRecordId,
    databaseForm,
    databaseTreeWidth,
    databaseTreeResizing,
    databaseSql,
    message,
    createDatabasePreviewState,
    createDatabaseSchemaState,
    createDatabaseRowDialogState,
    createDatabaseColumnDialogState,
    createDatabaseSqlResultState,
    createDatabaseResultState,
    createDatabaseSqlRecord,
    reportError,
    ensureBridgeMethod,
    fetchDatabaseTableSchemaResult,
    applyDatabaseSchemaResult,
    escapeDatabaseIdentifier
  } = options

  const databaseLayoutStyle = computed(() => ({
    gridTemplateColumns: `${databaseTreeWidth.value}px 7px minmax(0, 1fr)`
  }))

  const databaseSchemaPageRows = computed(() => {
    const page = Math.max(1, Number(databaseSchema.value.page || 1))
    const pageSize = Math.max(1, Number(databaseSchema.value.pageSize || 50))
    const start = (page - 1) * pageSize
    return (databaseSchema.value.rows || []).slice(start, start + pageSize)
  })

  const databaseResultSummary = computed(() => {
    if (!databaseConnected.value) return '连接后可浏览数据库结构并执行 SQL。'
    if (databasePreview.value.table) {
      const totalText = Number.isFinite(Number(databasePreview.value.total)) ? `共 ${databasePreview.value.total} 行` : '已开启分页预览'
      return `${totalText}${databaseResult.value.durationMs ? ` · ${databaseResult.value.durationMs}ms` : ''}`
    }
    if (databaseResult.value.kind === 'rows') {
      return `${databaseResult.value.message || '查询完成'}${databaseResult.value.durationMs ? `，耗时 ${databaseResult.value.durationMs}ms` : ''}`
    }
    if (databaseResult.value.kind === 'command') {
      return `${databaseResult.value.message || '命令已执行'}${databaseResult.value.durationMs ? `，耗时 ${databaseResult.value.durationMs}ms` : ''}`
    }
    return databaseActiveDatabase.value
      ? `当前数据库：${databaseActiveDatabase.value}`
      : '已连接数据库，可从左侧选择库表快速预览。'
  })

  const databaseHasActiveTable = computed(() => !!databaseSelectedTable.value && !!databaseActiveDatabase.value)

  const databaseCurrentIdentityKey = computed(() => {
    if (databaseSchema.value.database !== databaseActiveDatabase.value) return null
    if (databaseSchema.value.table !== databaseSelectedTable.value) return null
    return databaseSchema.value.identityKey || null
  })

  const canMutateDatabaseRows = computed(() => {
    if (databaseResult.value.source !== 'preview') return false
    if (databaseDataTab.value !== 'rows') return false
    return !!databaseCurrentIdentityKey.value?.columns?.length
  })

  const canEditDatabaseRows = computed(() => {
    if (!canMutateDatabaseRows.value) return false
    const identityColumns = new Set(databaseCurrentIdentityKey.value?.columns || [])
    return (databaseSchema.value.fieldMeta || []).some(item => !item.readOnly && !identityColumns.has(item.name))
  })

  const currentDatabaseTableItem = computed(() => {
    const databaseName = String(databaseActiveDatabase.value || databasePreview.value.database || databaseSchema.value.database || '').trim()
    const tableName = String(databaseSelectedTable.value || databasePreview.value.table || databaseSchema.value.table || '').trim()
    if (!databaseName || !tableName) return null
    return (databaseTablesByDatabase.value[databaseName] || []).find(item => item.name === tableName) || null
  })

  const canCreateDatabaseRows = computed(() => {
    return !!databasePreview.value.database && !!databasePreview.value.table && currentDatabaseTableItem.value?.type !== 'view'
  })

  const canCreateDatabaseColumns = computed(() => {
    return !!databaseSchema.value.database && !!databaseSchema.value.table && currentDatabaseTableItem.value?.type !== 'view'
  })

  function isDatabaseExpanded(name) {
    return databaseExpandedKeys.value.includes(name)
  }

  function isDatabaseTreeLoading(name) {
    return databaseTreeLoadingKeys.value.includes(name)
  }

  async function loadDatabaseTables(databaseName, force = false) {
    const name = String(databaseName || '').trim()
    if (!name || !databaseConnectionId.value) return []
    if (!force && Array.isArray(databaseTablesByDatabase.value[name])) {
      return databaseTablesByDatabase.value[name]
    }
    if (!isDatabaseTreeLoading(name)) {
      databaseTreeLoadingKeys.value = [...databaseTreeLoadingKeys.value, name]
    }
    try {
      ensureBridgeMethod('listDatabaseTables')
      const list = await window.whSSH.listDatabaseTables({ id: databaseConnectionId.value, database: name })
      databaseTablesByDatabase.value = {
        ...databaseTablesByDatabase.value,
        [name]: list
      }
      if (databaseActiveDatabase.value === name) databaseTables.value = list
      return list
    } finally {
      databaseTreeLoadingKeys.value = databaseTreeLoadingKeys.value.filter(item => item !== name)
    }
  }

  function resetDatabaseBrowser() {
    databaseDatabases.value = []
    databaseTables.value = []
    databaseTablesByDatabase.value = {}
    databaseExpandedKeys.value = []
    databaseTreeLoadingKeys.value = []
    databaseSelectedTable.value = ''
    databaseActiveDatabase.value = ''
    databaseContentTab.value = 'data'
    databaseDataTab.value = 'rows'
    databasePreview.value = createDatabasePreviewState()
    databaseSchema.value = createDatabaseSchemaState()
    databaseRowDialog.value = createDatabaseRowDialogState()
    databaseColumnDialog.value = createDatabaseColumnDialogState()
    databaseSqlHistory.value = [createDatabaseSqlRecord('SHOW DATABASES;', 'SQL 记录 1')]
    activeDatabaseSqlRecordId.value = databaseSqlHistory.value[0].id
    databaseSqlResult.value = createDatabaseSqlResultState()
    databaseResult.value = createDatabaseResultState()
    selectedDatabaseResultRow.value = null
    selectedDatabaseSchemaRow.value = null
    selectedDatabaseSqlRow.value = null
  }

  async function refreshDatabaseBrowser(forceReload = false, options = {}) {
    if (!databaseConnected.value || !databaseConnectionId.value) return
    const { notify = false } = options
    databaseLoading.value = true
    try {
      ensureBridgeMethod('listDatabases')
      databaseDatabases.value = await window.whSSH.listDatabases(databaseConnectionId.value)
      const availableDatabases = new Set(databaseDatabases.value)
      databaseExpandedKeys.value = databaseExpandedKeys.value.filter(name => availableDatabases.has(name))
      databaseTreeLoadingKeys.value = databaseTreeLoadingKeys.value.filter(name => availableDatabases.has(name))
      databaseTablesByDatabase.value = Object.fromEntries(Object.entries(databaseTablesByDatabase.value).filter(([name]) => availableDatabases.has(name)))
      if (databaseActiveDatabase.value && !availableDatabases.has(databaseActiveDatabase.value)) databaseActiveDatabase.value = ''
      if (databaseForm.value.database && !availableDatabases.has(databaseForm.value.database)) databaseForm.value.database = ''
      const preferredDatabase = databaseActiveDatabase.value || databaseForm.value.database || databaseDatabases.value[0] || ''
      databaseActiveDatabase.value = preferredDatabase
      if (preferredDatabase) {
        const targets = databaseExpandedKeys.value.filter(name => availableDatabases.has(name))
        for (const name of targets) {
          await loadDatabaseTables(name, forceReload)
        }
        databaseTables.value = databaseTablesByDatabase.value[preferredDatabase] || []
      } else {
        databaseTables.value = []
      }
      if (notify) message.value = '数据库结构已刷新'
    } catch (error) {
      await reportError(error)
    } finally {
      databaseLoading.value = false
    }
  }

  async function toggleDatabaseTree(name) {
    const nextDatabase = String(name || '').trim()
    if (!nextDatabase || !databaseConnectionId.value) return
    if (isDatabaseExpanded(nextDatabase)) {
      databaseExpandedKeys.value = databaseExpandedKeys.value.filter(item => item !== nextDatabase)
      return
    }
    databaseExpandedKeys.value = [...databaseExpandedKeys.value, nextDatabase]
    databaseActiveDatabase.value = nextDatabase
    databaseSelectedTable.value = ''
    databaseForm.value.database = nextDatabase
    databaseDataTab.value = 'rows'
    databasePreview.value = createDatabasePreviewState({ database: nextDatabase })
    databaseSchema.value = createDatabaseSchemaState({ database: nextDatabase })
    databaseResult.value = createDatabaseResultState({ activeDatabase: nextDatabase, message: '' })
    databaseLoading.value = true
    try {
      databaseTables.value = await loadDatabaseTables(nextDatabase, false)
    } catch (error) {
      await reportError(error)
    } finally {
      databaseLoading.value = false
    }
  }

  function selectDatabaseTreeTable(databaseName, item) {
    const tableName = String(item?.name || '').trim()
    if (!tableName || !databaseName) return
    databaseActiveDatabase.value = databaseName
    databaseForm.value.database = databaseName
    databaseSelectedTable.value = tableName
    databaseSql.value = `SELECT * FROM ${escapeDatabaseIdentifier(databaseName)}.${escapeDatabaseIdentifier(tableName)} LIMIT ${databasePreview.value.pageSize} OFFSET 0;`
  }

  async function loadDatabaseTablePreview(databaseName, tableName, page = 1, pageSize = databasePreview.value.pageSize || 50) {
    if (!databaseConnectionId.value) return
    databaseLoading.value = true
    try {
      ensureBridgeMethod('previewDatabaseTable')
      const result = await window.whSSH.previewDatabaseTable({
        id: databaseConnectionId.value,
        database: databaseName,
        table: tableName,
        page,
        pageSize
      })
      databasePreview.value = createDatabasePreviewState({
        database: databaseName,
        table: tableName,
        page: result.page || page,
        pageSize: result.pageSize || pageSize,
        total: result.total || 0
      })
      if (databaseSchema.value.database !== databaseName || databaseSchema.value.table !== tableName) {
        databaseSchema.value = createDatabaseSchemaState()
      }
      databaseResult.value = createDatabaseResultState({ ...result, source: 'preview' })
      selectedDatabaseResultRow.value = null
      databaseContentTab.value = 'data'
      databaseDataTab.value = 'rows'
      databaseSql.value = `SELECT * FROM ${escapeDatabaseIdentifier(databaseName)}.${escapeDatabaseIdentifier(tableName)} LIMIT ${databasePreview.value.pageSize} OFFSET ${(databasePreview.value.page - 1) * databasePreview.value.pageSize};`
      databaseActiveDatabase.value = databaseName
      databaseForm.value.database = databaseName
      databaseSelectedTable.value = tableName
      return true
    } catch (error) {
      await reportError(error)
      return false
    } finally {
      databaseLoading.value = false
    }
  }

  async function openDatabaseTreeTable(databaseName, item) {
    const tableName = String(item?.name || '').trim()
    if (!tableName || !databaseName) return
    selectDatabaseTreeTable(databaseName, item)
    await loadDatabaseTablePreview(databaseName, tableName, 1, databasePreview.value.pageSize || 50)
  }

  async function handleDatabasePageChange(page) {
    if (databaseDataTab.value === 'schema') {
      databaseSchema.value = {
        ...databaseSchema.value,
        page: Number(page || 1)
      }
      return
    }
    if (!databasePreview.value.table || !databasePreview.value.database) return
    await loadDatabaseTablePreview(databasePreview.value.database, databasePreview.value.table, Number(page || 1), databasePreview.value.pageSize)
  }

  async function handleDatabasePageSizeChange(pageSize) {
    if (databaseDataTab.value === 'schema') {
      databaseSchema.value = {
        ...databaseSchema.value,
        page: 1,
        pageSize: Number(pageSize || 50)
      }
      return
    }
    if (!databasePreview.value.table || !databasePreview.value.database) return
    await loadDatabaseTablePreview(databasePreview.value.database, databasePreview.value.table, 1, Number(pageSize || 50))
  }

  async function reloadDatabasePreview(options = {}) {
    if (!databasePreview.value.table || !databasePreview.value.database) return
    const refreshed = await loadDatabaseTablePreview(databasePreview.value.database, databasePreview.value.table, databasePreview.value.page, databasePreview.value.pageSize)
    if (refreshed && options.notify) message.value = '表数据已刷新'
  }

  function startDatabaseTreeResize(event) {
    databaseTreeResizing.value = true
    const panel = event.currentTarget.parentElement
    const rect = panel.getBoundingClientRect()
    const move = moveEvent => {
      if (!databaseTreeResizing.value) return
      const nextWidth = moveEvent.clientX - rect.left
      databaseTreeWidth.value = Math.max(160, Math.round(nextWidth))
    }
    const stop = () => {
      databaseTreeResizing.value = false
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
    move(event)
  }

  async function loadDatabaseTableSchema(databaseName = databaseActiveDatabase.value, tableName = databaseSelectedTable.value, options = {}) {
    const nextDatabase = String(databaseName || '').trim()
    const nextTable = String(tableName || '').trim()
    if (!nextDatabase || !nextTable || !databaseConnectionId.value) return
    databaseLoading.value = true
    try {
      const result = await fetchDatabaseTableSchemaResult(nextDatabase, nextTable)
      applyDatabaseSchemaResult(result, nextDatabase, nextTable)
      selectedDatabaseSchemaRow.value = null
      databaseContentTab.value = 'data'
      databaseDataTab.value = 'schema'
      databaseActiveDatabase.value = nextDatabase
      databaseForm.value.database = nextDatabase
      databaseSelectedTable.value = nextTable
      if (options.notify) message.value = '表结构已刷新'
    } catch (error) {
      await reportError(error)
    } finally {
      databaseLoading.value = false
    }
  }

  async function ensureDatabaseTableSchemaLoaded(databaseName = databaseActiveDatabase.value, tableName = databaseSelectedTable.value) {
    const nextDatabase = String(databaseName || '').trim()
    const nextTable = String(tableName || '').trim()
    if (!nextDatabase || !nextTable || !databaseConnectionId.value) return null
    if (databaseSchema.value.database === nextDatabase && databaseSchema.value.table === nextTable && (databaseSchema.value.fieldMeta || []).length) {
      return databaseSchema.value
    }
    const result = await fetchDatabaseTableSchemaResult(nextDatabase, nextTable)
    applyDatabaseSchemaResult(result, nextDatabase, nextTable)
    return databaseSchema.value
  }

  async function switchDatabaseDataTab(tab) {
    databaseDataTab.value = tab
    if (!databaseHasActiveTable.value) return
    if (tab === 'rows' && (!databasePreview.value.table || databasePreview.value.table !== databaseSelectedTable.value)) {
      await loadDatabaseTablePreview(databaseActiveDatabase.value, databaseSelectedTable.value, 1, databasePreview.value.pageSize || 50)
      return
    }
    if (tab === 'schema' && (!databaseSchema.value.table || databaseSchema.value.table !== databaseSelectedTable.value)) {
      await loadDatabaseTableSchema(databaseActiveDatabase.value, databaseSelectedTable.value)
    }
  }

  return {
    databaseLayoutStyle,
    databaseSchemaPageRows,
    databaseResultSummary,
    databaseHasActiveTable,
    databaseCurrentIdentityKey,
    canMutateDatabaseRows,
    canEditDatabaseRows,
    currentDatabaseTableItem,
    canCreateDatabaseRows,
    canCreateDatabaseColumns,
    isDatabaseExpanded,
    isDatabaseTreeLoading,
    loadDatabaseTables,
    resetDatabaseBrowser,
    refreshDatabaseBrowser,
    toggleDatabaseTree,
    selectDatabaseTreeTable,
    loadDatabaseTablePreview,
    openDatabaseTreeTable,
    handleDatabasePageChange,
    handleDatabasePageSizeChange,
    reloadDatabasePreview,
    startDatabaseTreeResize,
    loadDatabaseTableSchema,
    switchDatabaseDataTab,
    ensureDatabaseTableSchemaLoaded
  }
}
