import { ElMessageBox } from 'element-plus'

export function useDatabaseMaintenanceManager(options) {
  const {
    databaseConnected,
    databaseConnectionId,
    databaseActiveDatabase,
    databaseSelectedTable,
    databaseForm,
    databasePreview,
    databaseSchema,
    databaseResult,
    databaseSqlResult,
    databaseExpandedKeys,
    databaseTreeLoadingKeys,
    databaseTablesByDatabase,
    databaseTables,
    databaseDataTab,
    databaseLoading,
    createDatabasePreviewState,
    createDatabaseSchemaState,
    createDatabaseSqlResultState,
    createDatabaseResultState,
    ensureBridgeMethod,
    refreshDatabaseBrowser,
    loadDatabaseTables,
    loadDatabaseTableSchema,
    loadDatabaseTablePreview,
    reportError,
    message,
    showPendingActionToast
  } = options

  function formatImportPreviewMessage(preview, options = {}) {
    const {
      title = '导入 SQL',
      targetDatabase = '',
      targetTable = '',
      fileCount = 0
    } = options
    const lines = []
    lines.push(`${title}前请确认以下信息：`)
    if (fileCount > 0) lines.push(`- 已选择 ${fileCount} 个 SQL 文件`)
    if (targetDatabase) lines.push(`- 目标数据库：${targetDatabase}`)
    if (targetTable) lines.push(`- 当前选中表：${targetDatabase}.${targetTable}`)
    if (preview?.importKind === 'table' && preview?.inferredDatabase) {
      lines.push(`- 已识别为数据表 SQL：将创建或使用数据库 ${preview.inferredDatabase}`)
    }
    if (preview?.databases?.length) lines.push(`- 脚本涉及数据库：${preview.databases.join('、')}`)

    if (preview?.overlappingDatabases?.length) {
      lines.push(`- 脚本引用已存在的数据库：${preview.overlappingDatabases.join('、')}（不会自动删除整个数据库）`)
    }
    const operations = Array.isArray(preview?.operations) ? preview.operations : []
    const operationLabels = operations.map(item => {
      const target = item.database && item.table ? `${item.database}.${item.table}` : item.database
      return target ? `${item.action} ${target}` : item.action
    })
    if (operationLabels.length) lines.push(`- 检测到的 SQL 操作：${operationLabels.join('、')}`)
    if (Array.isArray(preview?.overlappingTables) && preview.overlappingTables.length) {
      const tableLines = preview.overlappingTables
        .map(item => `${item.database}：${(item.tables || []).join('、')}`)
        .filter(Boolean)
      if (tableLines.length) {
        lines.push(`- 检测到可能被覆盖的同名表：`)
        for (const item of tableLines) lines.push(`  ${item}`)
      }
    }

    lines.push('程序会按 SQL 文件原文逐条执行，不会自动删除整个数据库。请重点确认上面的 DROP、TRUNCATE、CREATE、INSERT、UPDATE 等实际操作；这些操作可能改写已有表结构或数据，且通常不可撤销。是否继续？')
    return lines.join('\n')
  }

  async function importDatabaseSqlToDatabase(databaseName = '') {
    const targetDatabase = String(databaseName || '').trim()
    if (!databaseConnected.value || !databaseConnectionId.value) {
      message.value = '请先连接数据库'
      return
    }
    let pendingToast = null
    try {
      ensureBridgeMethod('prepareImportDatabaseSql')
      const preview = await window.whSSH.prepareImportDatabaseSql({
        id: databaseConnectionId.value,
        database: targetDatabase
      })
      if (preview?.canceled) {
        message.value = targetDatabase ? `已取消导入 ${targetDatabase}` : '已取消导入数据库 SQL'
        return
      }
      const resolvedTargetDatabase = String(preview?.targetDatabase || targetDatabase || '').trim()
      await ElMessageBox.confirm(formatImportPreviewMessage(preview, {
        title: resolvedTargetDatabase ? `导入数据库 ${resolvedTargetDatabase}` : '导入数据库 SQL',
        targetDatabase: resolvedTargetDatabase,
        fileCount: preview?.filePaths?.length || 0
      }), '导入 SQL', {
        type: 'warning',
        confirmButtonText: '确认导入',
        cancelButtonText: '取消'
      })
      databaseLoading.value = true
      pendingToast = showPendingActionToast(resolvedTargetDatabase
        ? `正在处理 ${resolvedTargetDatabase} 的 SQL 导入，请在弹出的文件选择框中继续操作。`
        : '正在处理数据库 SQL 导入，请在弹出的文件选择框中继续操作。')
      ensureBridgeMethod('importDatabaseSql')
      const result = await window.whSSH.importDatabaseSql({
        id: databaseConnectionId.value,
        database: targetDatabase,
        filePath: preview.filePath
      })
      if (result?.canceled) {
        message.value = targetDatabase ? `已取消导入 ${targetDatabase}` : '已取消导入数据库 SQL'
        return
      }
      const nextDatabase = String(result.activeDatabase || targetDatabase || '').trim()
      databaseActiveDatabase.value = nextDatabase
      databaseForm.value.database = nextDatabase
      databaseSelectedTable.value = ''
      databasePreview.value = createDatabasePreviewState({ database: nextDatabase })
      databaseSchema.value = createDatabaseSchemaState({ database: nextDatabase })
      databaseSqlResult.value = createDatabaseSqlResultState()
      databaseResult.value = createDatabaseResultState({ ...result, source: 'import' })
      await refreshDatabaseBrowser(true)
      if (nextDatabase && !databaseExpandedKeys.value.includes(nextDatabase)) {
        databaseExpandedKeys.value = [...databaseExpandedKeys.value, nextDatabase]
      }
      message.value = result.message || (nextDatabase ? `已导入 ${nextDatabase}` : '数据库 SQL 已导入')
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function createDatabase() {
    if (!databaseConnected.value || !databaseConnectionId.value) {
      message.value = '请先连接数据库'
      return
    }
    let pendingToast = null
    try {
      const { value } = await ElMessageBox.prompt('请输入数据库名称。新建操作不会覆盖已有同名数据库。', '新建数据库', {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPattern: /^[^./\\\u0000]{1,64}$/,
        inputErrorMessage: '不能为空，且不能包含 .、/、\\ 或空字符，最长 64 个字符'
      })
      const database = String(value || '').trim()
      if (!database) return
      databaseLoading.value = true
      pendingToast = showPendingActionToast(`正在新建数据库 ${database}...`)
      ensureBridgeMethod('createDatabase')
      const result = await window.whSSH.createDatabase({ id: databaseConnectionId.value, database })
      databaseActiveDatabase.value = database
      databaseForm.value.database = database
      databaseSelectedTable.value = ''
      databasePreview.value = createDatabasePreviewState({ database })
      databaseSchema.value = createDatabaseSchemaState({ database })
      databaseResult.value = createDatabaseResultState({ ...result, source: 'database-create' })
      await refreshDatabaseBrowser(true)
      if (!databaseExpandedKeys.value.includes(database)) {
        databaseExpandedKeys.value = [...databaseExpandedKeys.value, database]
      }
      message.value = result.message || `已新建数据库 ${database}`
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function exportDatabaseSqlFromDatabase(databaseName = databaseActiveDatabase.value) {
    const targetDatabase = String(databaseName || databaseActiveDatabase.value || databaseForm.value.database || '').trim()
    if (!targetDatabase) {
      message.value = '请先选择一个数据库'
      return
    }
    if (!databaseConnected.value || !databaseConnectionId.value) {
      message.value = '请先连接数据库'
      return
    }
    databaseLoading.value = true
    let pendingToast = null
    try {
      pendingToast = showPendingActionToast(`正在准备导出 ${targetDatabase}，请在弹出的保存对话框中确认导出位置。`)
      ensureBridgeMethod('exportDatabaseSql')
      const result = await window.whSSH.exportDatabaseSql({
        id: databaseConnectionId.value,
        database: targetDatabase
      })
      if (result?.canceled) {
        message.value = `已取消导出 ${targetDatabase}`
        return
      }
      databaseActiveDatabase.value = result.activeDatabase || targetDatabase
      databaseForm.value.database = databaseActiveDatabase.value
      databaseResult.value = createDatabaseResultState({ ...result, source: 'export' })
      message.value = result.message || `已导出 ${targetDatabase}`
    } catch (error) {
      await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function importDatabaseSqlToTable(databaseName = databaseActiveDatabase.value, tableName = databaseSelectedTable.value) {
    const nextDatabase = String(databaseName || '').trim()
    const nextTable = String(tableName || '').trim()
    if (!nextDatabase || !nextTable) {
      message.value = '请先选择一张表'
      return
    }
    if (!databaseConnected.value || !databaseConnectionId.value) {
      message.value = '请先连接数据库'
      return
    }
    let pendingToast = null
    try {
      ensureBridgeMethod('prepareImportDatabaseTableSql')
      const preview = await window.whSSH.prepareImportDatabaseTableSql({
        id: databaseConnectionId.value,
        database: nextDatabase,
        table: nextTable
      })
      if (preview?.canceled) {
        message.value = `已取消导入 ${nextDatabase}.${nextTable}`
        return
      }
      await ElMessageBox.confirm(formatImportPreviewMessage(preview, {
        title: `导入数据表到 ${nextDatabase}`,
        targetDatabase: nextDatabase,
        targetTable: nextTable,
        fileCount: preview?.filePaths?.length || 0
      }), '导入表 SQL', {
        type: 'warning',
        confirmButtonText: '确认导入',
        cancelButtonText: '取消'
      })
      databaseLoading.value = true
      pendingToast = showPendingActionToast(`正在处理 ${nextDatabase}.${nextTable} 的表级 SQL 导入，请在弹出的文件选择框中继续操作。`)
      ensureBridgeMethod('importDatabaseTableSql')
      const result = await window.whSSH.importDatabaseTableSql({
        id: databaseConnectionId.value,
        database: nextDatabase,
        table: nextTable,
        filePaths: preview.filePaths
      })
      if (result?.canceled) {
        message.value = `已取消导入 ${nextDatabase}.${nextTable}`
        return
      }
      databaseResult.value = createDatabaseResultState({ ...result, source: 'table-import' })
      await refreshDatabaseBrowser(true)
      message.value = result.message || `已导入 ${nextDatabase}.${nextTable}`
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function exportDatabaseSqlFromTable(databaseName = databaseActiveDatabase.value, tableName = databaseSelectedTable.value) {
    const nextDatabase = String(databaseName || '').trim()
    const nextTable = String(tableName || '').trim()
    if (!nextDatabase || !nextTable) {
      message.value = '请先选择一张表'
      return
    }
    if (!databaseConnected.value || !databaseConnectionId.value) {
      message.value = '请先连接数据库'
      return
    }
    let pendingToast = null
    databaseLoading.value = true
    try {
      pendingToast = showPendingActionToast(`正在准备导出 ${nextDatabase}.${nextTable}，请在弹出的保存对话框中确认导出位置。`)
      ensureBridgeMethod('exportDatabaseTableSql')
      const result = await window.whSSH.exportDatabaseTableSql({
        id: databaseConnectionId.value,
        database: nextDatabase,
        table: nextTable
      })
      if (result?.canceled) {
        message.value = `已取消导出 ${nextDatabase}.${nextTable}`
        return
      }
      databaseResult.value = createDatabaseResultState({ ...result, source: 'table-export' })
      message.value = result.message || `已导出 ${nextDatabase}.${nextTable}`
    } catch (error) {
      await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function importDatabaseTablesToDatabase(databaseName = databaseActiveDatabase.value) {
    const nextDatabase = String(databaseName || '').trim()
    if (!nextDatabase) {
      message.value = '请先选择一个数据库'
      return
    }
    if (!databaseConnected.value || !databaseConnectionId.value) {
      message.value = '请先连接数据库'
      return
    }
    let pendingToast = null
    try {
      ensureBridgeMethod('prepareImportDatabaseTableSql')
      const preview = await window.whSSH.prepareImportDatabaseTableSql({
        id: databaseConnectionId.value,
        database: nextDatabase
      })
      if (preview?.canceled) {
        message.value = `已取消向 ${nextDatabase} 导入数据表`
        return
      }
      await ElMessageBox.confirm(formatImportPreviewMessage(preview, {
        title: `向 ${nextDatabase} 导入数据表`,
        targetDatabase: nextDatabase,
        fileCount: preview?.filePaths?.length || 0
      }), '导入数据表', {
        type: 'warning',
        confirmButtonText: '确认导入',
        cancelButtonText: '取消'
      })
      databaseLoading.value = true
      pendingToast = showPendingActionToast(`正在向 ${nextDatabase} 导入数据表，请在弹出的文件选择框中继续操作。`)
      ensureBridgeMethod('importDatabaseTableSql')
      const result = await window.whSSH.importDatabaseTableSql({
        id: databaseConnectionId.value,
        database: nextDatabase,
        filePaths: preview.filePaths
      })
      if (result?.canceled) {
        message.value = `已取消向 ${nextDatabase} 导入数据表`
        return
      }
      databaseResult.value = createDatabaseResultState({ ...result, source: 'table-import' })
      databaseActiveDatabase.value = nextDatabase
      databaseForm.value.database = nextDatabase
      await refreshDatabaseBrowser(true)
      message.value = result.message || `已向 ${nextDatabase} 导入数据表`
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function exportDatabaseTablesFromDatabase(databaseName = databaseActiveDatabase.value) {
    const nextDatabase = String(databaseName || '').trim()
    if (!nextDatabase) {
      message.value = '请先选择一个数据库'
      return
    }
    if (!databaseConnected.value || !databaseConnectionId.value) {
      message.value = '请先连接数据库'
      return
    }
    let pendingToast = null
    databaseLoading.value = true
    try {
      pendingToast = showPendingActionToast(`正在准备导出 ${nextDatabase} 下的所有数据表，请在弹出的目录选择框中确认保存位置。`)
      ensureBridgeMethod('exportDatabaseTables')
      const result = await window.whSSH.exportDatabaseTables({
        id: databaseConnectionId.value,
        database: nextDatabase
      })
      if (result?.canceled) {
        message.value = `已取消导出 ${nextDatabase} 的数据表`
        return
      }
      databaseResult.value = createDatabaseResultState({ ...result, source: 'tables-export' })
      message.value = result.message || `已导出 ${nextDatabase} 的数据表`
    } catch (error) {
      await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function refreshDatabaseNode(databaseName) {
    const nextDatabase = String(databaseName || '').trim()
    if (!nextDatabase) return
    databaseActiveDatabase.value = nextDatabase
    await loadDatabaseTables(nextDatabase, true)
    if (databaseSelectedTable.value && databasePreview.value.database === nextDatabase && databasePreview.value.table === databaseSelectedTable.value) {
      if (databaseDataTab.value === 'schema') await loadDatabaseTableSchema(nextDatabase, databaseSelectedTable.value)
      else await loadDatabaseTablePreview(nextDatabase, databaseSelectedTable.value, databasePreview.value.page || 1, databasePreview.value.pageSize || 50)
    }
    message.value = `数据库 ${nextDatabase} 已刷新`
  }

  async function refreshDatabaseTableNode(databaseName, row) {
    const nextDatabase = String(databaseName || '').trim()
    const nextTable = String(row?.name || '').trim()
    if (!nextDatabase || !nextTable) return
    await loadDatabaseTables(nextDatabase, true)
    if (databasePreview.value.database === nextDatabase && databasePreview.value.table === nextTable) {
      if (databaseDataTab.value === 'schema') await loadDatabaseTableSchema(nextDatabase, nextTable)
      else await loadDatabaseTablePreview(nextDatabase, nextTable, databasePreview.value.page || 1, databasePreview.value.pageSize || 50)
    }
    message.value = `数据表 ${nextDatabase}.${nextTable} 已刷新`
  }

  async function deleteDatabaseTreeItem(databaseName) {
    const nextDatabase = String(databaseName || '').trim()
    if (!nextDatabase || !databaseConnectionId.value) return
    let pendingToast = null
    try {
      await ElMessageBox.confirm(`确认删除数据库 ${nextDatabase}？\n\n这会删除库内所有数据表和数据，且不可撤销。`, '删除数据库', {
        type: 'warning',
        confirmButtonText: '删除数据库',
        cancelButtonText: '取消'
      })
      databaseLoading.value = true
      pendingToast = showPendingActionToast(`正在删除数据库 ${nextDatabase}...`)
      ensureBridgeMethod('deleteDatabase')
      const result = await window.whSSH.deleteDatabase({
        id: databaseConnectionId.value,
        database: nextDatabase
      })
      databaseExpandedKeys.value = databaseExpandedKeys.value.filter(name => name !== nextDatabase)
      databaseTreeLoadingKeys.value = databaseTreeLoadingKeys.value.filter(name => name !== nextDatabase)
      const nextTablesByDatabase = { ...databaseTablesByDatabase.value }
      delete nextTablesByDatabase[nextDatabase]
      databaseTablesByDatabase.value = nextTablesByDatabase
      if (databaseActiveDatabase.value === nextDatabase) {
        databaseSelectedTable.value = ''
        databasePreview.value = createDatabasePreviewState({ database: nextDatabase })
        databaseSchema.value = createDatabaseSchemaState({ database: nextDatabase })
        databaseActiveDatabase.value = ''
        databaseForm.value.database = ''
        databaseTables.value = []
      }
      databaseResult.value = createDatabaseResultState({ ...result, source: 'database-delete' })
      await refreshDatabaseBrowser(true)
      message.value = result.message || `已删除数据库 ${nextDatabase}`
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function deleteDatabaseTableItem(databaseName, row) {
    const nextDatabase = String(databaseName || '').trim()
    const nextTable = String(row?.name || '').trim()
    if (!nextDatabase || !nextTable || !databaseConnectionId.value) return
    const objectLabel = row?.type === 'view' ? '视图' : '数据表'
    let pendingToast = null
    try {
      await ElMessageBox.confirm(`确认删除${objectLabel} ${nextDatabase}.${nextTable}？\n\n此操作不可撤销。`, '删除数据表', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      databaseLoading.value = true
      pendingToast = showPendingActionToast(`正在删除 ${nextDatabase}.${nextTable}...`)
      ensureBridgeMethod('deleteDatabaseTable')
      const result = await window.whSSH.deleteDatabaseTable({
        id: databaseConnectionId.value,
        database: nextDatabase,
        table: nextTable
      })
      if (databasePreview.value.database === nextDatabase && databasePreview.value.table === nextTable) {
        databaseSelectedTable.value = ''
        databasePreview.value = createDatabasePreviewState({ database: nextDatabase })
        databaseSchema.value = createDatabaseSchemaState({ database: nextDatabase })
      }
      databaseResult.value = createDatabaseResultState({ ...result, source: 'table-delete' })
      await loadDatabaseTables(nextDatabase, true)
      message.value = result.message || `已删除 ${nextDatabase}.${nextTable}`
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  return {
    createDatabase,
    importDatabaseSqlToDatabase,
    exportDatabaseSqlFromDatabase,
    importDatabaseSqlToTable,
    exportDatabaseSqlFromTable,
    importDatabaseTablesToDatabase,
    exportDatabaseTablesFromDatabase,
    refreshDatabaseNode,
    refreshDatabaseTableNode,
    deleteDatabaseTreeItem,
    deleteDatabaseTableItem
  }
}
