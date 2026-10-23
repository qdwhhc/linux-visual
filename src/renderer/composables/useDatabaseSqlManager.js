import { computed } from 'vue'
import { ElMessage } from 'element-plus'

export function useDatabaseSqlManager(options) {
  const {
    databaseSqlHistory,
    activeDatabaseSqlRecordId,
    databaseSql,
    databaseActiveDatabase,
    databaseSelectedTable,
    databaseSqlResult,
    databasePreview,
    databaseSchema,
    databaseResult,
    databaseConnected,
    databaseConnectionId,
    databaseForm,
    databaseLoading,
    createDatabaseSqlRecord,
    createDatabaseSqlResultState,
    createDatabasePreviewState,
    createDatabaseSchemaState,
    createDatabaseResultState,
    ensureBridgeMethod,
    refreshDatabaseBrowser,
    escapeDatabaseIdentifier,
    message,
    reportError
  } = options

  const DATABASE_SQL_VISIBLE_TAB_COUNT = 6

  const activeDatabaseSqlRecord = computed(() => databaseSqlHistory.value.find(item => item.id === activeDatabaseSqlRecordId.value) || null)

  const databaseSqlOverflowRecords = computed(() => {
    if (databaseSqlHistory.value.length <= DATABASE_SQL_VISIBLE_TAB_COUNT) return []
    return databaseSqlHistory.value.slice(0, databaseSqlHistory.value.length - DATABASE_SQL_VISIBLE_TAB_COUNT)
  })

  const databaseSqlVisibleRecords = computed(() => {
    if (databaseSqlHistory.value.length <= DATABASE_SQL_VISIBLE_TAB_COUNT) return databaseSqlHistory.value
    return databaseSqlHistory.value.slice(-DATABASE_SQL_VISIBLE_TAB_COUNT)
  })

  function getDatabaseSqlRecordLabel(item, index = 0) {
    const text = String(item?.sql || '').trim()
    const firstLine = text.split(/\r?\n/).map(line => line.trim()).find(Boolean) || ''
    if (firstLine) return firstLine
    return item?.title || `SQL 记录 ${index + 1}`
  }

  function appendDatabaseSqlHistory(sql = '') {
    const record = createDatabaseSqlRecord(sql, `SQL 记录 ${databaseSqlHistory.value.length + 1}`)
    databaseSqlHistory.value.push(record)
    activeDatabaseSqlRecordId.value = record.id
    return record
  }

  function activateDatabaseSqlHistory(recordId = '') {
    const target = String(recordId || '').trim()
    if (!target) return
    const currentIndex = databaseSqlHistory.value.findIndex(item => item.id === target)
    if (currentIndex === -1) return
    const overflowCount = Math.max(0, databaseSqlHistory.value.length - DATABASE_SQL_VISIBLE_TAB_COUNT)
    if (overflowCount > 0 && currentIndex < overflowCount) {
      const [record] = databaseSqlHistory.value.splice(currentIndex, 1)
      databaseSqlHistory.value.push(record)
      activeDatabaseSqlRecordId.value = record.id
      return
    }
    activeDatabaseSqlRecordId.value = target
  }

  function pushDatabaseSqlHistory(sql = '') {
    const text = String(sql || '').trim()
    if (!text) return
    const active = activeDatabaseSqlRecord.value || appendDatabaseSqlHistory('')
    active.sql = text
  }

  function isActiveDatabaseSqlHistory(item) {
    return String(item?.id || '') === String(activeDatabaseSqlRecordId.value || '')
  }

  function removeDatabaseSqlHistory(item, event) {
    event?.stopPropagation?.()
    const target = String(item?.id || '')
    if (!target) return
    const currentIndex = databaseSqlHistory.value.findIndex(history => history.id === target)
    if (currentIndex === -1) return
    databaseSqlHistory.value.splice(currentIndex, 1)
    if (!databaseSqlHistory.value.length) {
      const record = appendDatabaseSqlHistory('')
      activeDatabaseSqlRecordId.value = record.id
      return
    }
    if (activeDatabaseSqlRecordId.value === target) {
      const fallback = databaseSqlHistory.value[Math.max(0, currentIndex - 1)] || databaseSqlHistory.value[0]
      activeDatabaseSqlRecordId.value = fallback.id
    }
  }

  async function copyDatabaseCellValue(value) {
    const text = String(value ?? '').trim()
    if (!text) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', 'readonly')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      ElMessage({ message: '单元格已复制', type: 'success', duration: 1200, grouping: true })
    } catch (error) {
      ElMessage({ message: '复制单元格失败', type: 'error', duration: 1600, grouping: true })
    }
  }

  async function handleDatabaseSqlTableCellDblClick(row, column) {
    if (!column?.property) return
    await copyDatabaseCellValue(row?.[column.property])
  }

  function fillDatabaseSqlExample() {
    databaseSql.value = databaseActiveDatabase.value
      ? `SELECT * FROM ${escapeDatabaseIdentifier(databaseActiveDatabase.value)}.${escapeDatabaseIdentifier(databaseSelectedTable.value || 'your_table')} LIMIT 50;`
      : 'SHOW DATABASES;'
  }

  async function runDatabaseSql(customSql = '') {
    const isEventPayload = customSql && typeof customSql === 'object' && ('target' in customSql || 'currentTarget' in customSql || 'type' in customSql)
    const sql = String(isEventPayload ? (databaseSql.value || '') : (customSql || databaseSql.value || '')).trim()
    if (!sql) {
      message.value = '请先输入 SQL'
      return
    }
    if (!databaseConnected.value || !databaseConnectionId.value) {
      message.value = '请先连接数据库'
      return
    }
    databaseLoading.value = true
    try {
      pushDatabaseSqlHistory(sql)
      ensureBridgeMethod('queryDatabase')
      const result = await window.whSSH.queryDatabase({
        id: databaseConnectionId.value,
        database: databaseActiveDatabase.value || databaseForm.value.database || '',
        sql
      })
      databaseSqlResult.value = createDatabaseSqlResultState({
        ...result,
        rows: result.rows || [],
        total: Array.isArray(result.rows) ? result.rows.length : 0,
        page: 1,
        pageSize: 50
      })
      databasePreview.value = createDatabasePreviewState()
      databaseSchema.value = createDatabaseSchemaState()
      databaseResult.value = createDatabaseResultState({ ...result, source: 'sql' })
      if (result.activeDatabase !== undefined) {
        databaseActiveDatabase.value = result.activeDatabase || databaseActiveDatabase.value
        databaseForm.value.database = databaseActiveDatabase.value
      }
      const refreshCommands = ['CREATE', 'DROP', 'ALTER', 'RENAME', 'TRUNCATE', 'USE']
      if (refreshCommands.includes(String(result.command || '').toUpperCase())) {
        await refreshDatabaseBrowser()
      }
      message.value = result.message || 'SQL 执行完成'
    } catch (error) {
      await reportError(error)
    } finally {
      databaseLoading.value = false
    }
  }

  function handleDatabaseSqlResultPageChange(page) {
    databaseSqlResult.value = {
      ...databaseSqlResult.value,
      page: Number(page || 1)
    }
  }

  function handleDatabaseSqlResultPageSizeChange(pageSize) {
    databaseSqlResult.value = {
      ...databaseSqlResult.value,
      page: 1,
      pageSize: Number(pageSize || 50)
    }
  }

  return {
    databaseSqlOverflowRecords,
    databaseSqlVisibleRecords,
    getDatabaseSqlRecordLabel,
    appendDatabaseSqlHistory,
    activateDatabaseSqlHistory,
    pushDatabaseSqlHistory,
    isActiveDatabaseSqlHistory,
    removeDatabaseSqlHistory,
    copyDatabaseCellValue,
    handleDatabaseSqlTableCellDblClick,
    fillDatabaseSqlExample,
    runDatabaseSql,
    handleDatabaseSqlResultPageChange,
    handleDatabaseSqlResultPageSizeChange
  }
}
