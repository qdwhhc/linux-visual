import { ElMessageBox } from 'element-plus'
import { ref } from 'vue'

const DATABASE_INLINE_NULL_OPTION = '__LINUX_VISUAL_INLINE_NULL__'

export function useDatabaseMutationManager(options) {
  const {
    databaseConnectionId,
    databaseSchema,
    databasePreview,
    databaseRowDialog,
    databaseColumnDialog,
    databaseLoading,
    databaseDataTab,
    databaseResult,
    selectedDatabaseResultRow,
    selectedDatabaseSchemaRow,
    createDatabaseRowDialogState,
    createDatabaseColumnDialogState,
    createDatabaseResultState,
    ensureDatabaseTableSchemaLoaded,
    buildDatabaseRowDialogFields,
    buildDatabaseRowIdentityValues,
    buildDatabaseIdentityLabel,
    normalizeDatabaseComparableValue,
    normalizeDatabaseColumnDefaultPayload,
    formatDatabaseColumnDefaultInput,
    getDatabaseSchemaFieldMeta,
    ensureBridgeMethod,
    reloadDatabasePreview,
    loadDatabaseTableSchema,
    loadDatabaseTablePreview,
    reportError,
    message,
    showPendingActionToast,
    showNativeContextMenu
  } = options

  function createDatabaseInlineEditState(overrides = {}) {
    return {
      open: false,
      saving: false,
      database: '',
      table: '',
      identityKey: null,
      activeRow: null,
      activeRowIndex: -1,
      activeField: '',
      rows: [],
      ...overrides
    }
  }

  const databaseInlineEdit = ref(createDatabaseInlineEditState())

  function closeDatabaseInlineEdit() {
    databaseInlineEdit.value = createDatabaseInlineEditState()
  }

  function getDatabaseInlineEditEntry(row = null) {
    const entries = Array.isArray(databaseInlineEdit.value.rows) ? databaseInlineEdit.value.rows : []
    if (row) return entries.find(item => item.row === row) || null
    if (databaseInlineEdit.value.activeRow) {
      return entries.find(item => item.row === databaseInlineEdit.value.activeRow) || null
    }
    return entries[0] || null
  }

  function getDatabaseInlineEditField(fieldName = '', row = null) {
    const targetName = String(fieldName || '').trim()
    if (!targetName) return null
    const entry = getDatabaseInlineEditEntry(row)
    return (entry?.fields || []).find(item => item.name === targetName) || null
  }

  function buildDatabaseInlineEditSuggestionItems(fieldName = '', row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field) return []
    const type = String(field.type || '').trim().toLowerCase()
    const category = getDatabaseInlineEditFieldCategory(fieldName, row)
    const options = []
    const pushItem = (value, label = '', useNull = false) => {
      const text = String(value ?? '').trim()
      if (!useNull && !text && label !== "'' (空字符串)") return
      options.push({ value: useNull ? 'NULL' : text, label: label || text, useNull })
    }

    if (field.nullable) pushItem('NULL', 'NULL', true)

    if (category === 'date' || category === 'datetime' || category === 'time') {
      return options
    }

    if (/\bjson\b/.test(type)) {
      pushItem('{}')
      pushItem('[]')
    } else if (category === 'string' || category === 'text') {
      pushItem('', "'' (空字符串)")
    }

    const seen = new Set()
    return options.filter(item => {
      const key = `${item.useNull ? 'null' : 'value'}:${item.label}::${item.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function getDatabaseInlineEditSuggestionItems(fieldName = '', row = null) {
    return buildDatabaseInlineEditSuggestionItems(fieldName, row).slice(0, 20)
  }

  function parseDatabaseInlineEnumOptions(type = '') {
    const text = String(type || '').trim()
    const match = text.match(/^\s*(enum|set)\s*\((.*)\)\s*$/i)
    if (!match) return []
    const body = match[2] || ''
    const values = []
    const regex = /'((?:\\'|[^'])*)'/g
    let result = null
    while ((result = regex.exec(body))) {
      values.push(result[1].replace(/\\'/g, "'"))
    }
    return values
  }

  function isDatabaseInlineBooleanLikeField(field) {
    const type = String(field?.type || '').trim().toLowerCase()
    return /\bboolean\b/.test(type) || /\bbit\s*\(\s*1\s*\)\b/.test(type) || /\btinyint\s*\(\s*1\s*\)\b/.test(type)
  }

  function getDatabaseInlineEditFieldCategory(fieldName = '', row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    const type = String(field?.type || '').trim().toLowerCase()
    if (!field) return 'string'
    if (field.multiline) return 'text'
    if (parseDatabaseInlineEnumOptions(field.type).length || isDatabaseInlineBooleanLikeField(field)) return 'boolean'
    if (/\b(datetime|timestamp)\b/.test(type)) return 'datetime'
    if (/\bdate\b/.test(type) && !/\b(datetime|timestamp)\b/.test(type)) return 'date'
    if (/\btime\b/.test(type) && !/\b(datetime|timestamp)\b/.test(type)) return 'time'
    if (/\b(decimal|numeric|float|double|real|tinyint|smallint|mediumint|int|integer|bigint|serial|number)\b/.test(type)) return 'number'
    return 'string'
  }

  function getDatabaseFieldTypeCategory(type = '') {
    const normalizedType = String(type || '').trim().toLowerCase()
    if (/\bjson\b/.test(normalizedType)) return 'json'
    if (/\bboolean\b/.test(normalizedType) || /\bbit\s*\(\s*1\s*\)\b/.test(normalizedType) || /\btinyint\s*\(\s*1\s*\)\b/.test(normalizedType)) return 'boolean'
    if (/\b(decimal|numeric|float|double|real|tinyint|smallint|mediumint|int|integer|bigint|serial|number)\b/.test(normalizedType)) return 'number'
    if (/\b(text|json|longtext|mediumtext|tinytext)\b/.test(normalizedType)) return 'text'
    return 'string'
  }

  function isDatabaseCreateFieldMultiline(type = '') {
    return ['text', 'json'].includes(getDatabaseFieldTypeCategory(type))
  }

  function getDatabaseCreateFieldFallbackValue(field = null) {
    const category = getDatabaseFieldTypeCategory(field?.type)
    if (category === 'json') return '{}'
    if (category === 'number' || category === 'boolean') return '0'
    return ''
  }

  function formatDatabaseInlineDatetimeValue(value = '') {
    const text = String(value || '').trim()
    if (!text) return ''
    const normalized = text.replace(' ', 'T')
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized.slice(0, 16)
    return normalized
  }

  function normalizeDatabaseInlineDatetimeSubmitValue(value = '') {
    const text = String(value || '').trim()
    if (!text) return ''
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return `${text.replace('T', ' ')}:00`
    return text.replace('T', ' ')
  }

  function getDatabaseInlineEditControlType(fieldName = '', row = null) {
    const category = getDatabaseInlineEditFieldCategory(fieldName, row)
    if (category === 'text') return 'textarea'
    if (category === 'boolean') return 'select'
    return 'input'
  }

  function getDatabaseInlineEditInputType(fieldName = '', row = null) {
    const category = getDatabaseInlineEditFieldCategory(fieldName, row)
    if (category === 'date') return 'date'
    if (category === 'datetime') return 'datetime-local'
    if (category === 'time') return 'time'
    if (category === 'number') return 'number'
    return 'text'
  }

  function getDatabaseInlineEditEditorValue(fieldName = '', row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field) return ''
    if (field.useNull) return ''
    if (getDatabaseInlineEditFieldCategory(fieldName, row) === 'datetime') {
      return formatDatabaseInlineDatetimeValue(field.value)
    }
    return field.value === undefined || field.value === null ? '' : String(field.value)
  }

  function shouldUseDatabaseInlineSuggestions(fieldName = '', row = null) {
    if (getDatabaseInlineEditControlType(fieldName, row) !== 'input') return false
    const category = getDatabaseInlineEditFieldCategory(fieldName, row)
    if (category !== 'string') return false
    return buildDatabaseInlineEditSuggestionItems(fieldName, row).length > 0
  }

  function getDatabaseInlineEditSelectOptions(fieldName = '', row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field) return []
    const options = []
    const pushOption = (value, label = '', useNull = false) => {
      options.push({
        value: useNull ? DATABASE_INLINE_NULL_OPTION : String(value ?? ''),
        label: label || String(value ?? ''),
        useNull
      })
    }
    if (field.nullable) pushOption('', 'NULL', true)
    for (const value of parseDatabaseInlineEnumOptions(field.type)) {
      pushOption(value, value)
    }
    if (isDatabaseInlineBooleanLikeField(field)) {
      pushOption('1', '1')
      pushOption('0', '0')
    }
    const seen = new Set()
    return options.filter(item => {
      const key = `${item.value}::${item.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function queryDatabaseInlineEditSuggestions(fieldName, queryString, callback, row = null) {
    const keyword = String(queryString || '').trim().toLowerCase()
    const options = buildDatabaseInlineEditSuggestionItems(fieldName, row)
    if (!keyword) {
      callback(options.slice(0, 20))
      return
    }
    callback(options.filter(item => {
      const label = String(item.label || '').toLowerCase()
      const value = String(item.value || '').toLowerCase()
      return label.includes(keyword) || value.includes(keyword)
    }).slice(0, 20))
  }

  function handleDatabaseInlineEditSuggestionSelect(fieldName, item, row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field) return
    if (item?.useNull) {
      field.useNull = true
      field.value = ''
      return
    }
    field.useNull = false
    field.value = item?.value === undefined ? '' : String(item.value)
  }

  function getDatabaseInlineEditSelectValue(fieldName = '', row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field) return ''
    if (field.useNull) return DATABASE_INLINE_NULL_OPTION
    return field.value === undefined || field.value === null ? '' : String(field.value)
  }

  function handleDatabaseInlineEditSelectChange(fieldName, value, row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field || field.readOnly) return
    if (value === DATABASE_INLINE_NULL_OPTION) {
      field.useNull = true
      field.value = ''
      return
    }
    field.useNull = false
    field.value = value === undefined || value === null ? '' : String(value)
  }

  function handleDatabaseInlineEditFieldInput(fieldName, value, row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field) return
    field.useNull = false
    field.value = value
  }

  function closeDatabaseRowDialog() {
    databaseRowDialog.value = createDatabaseRowDialogState()
  }

  function closeDatabaseColumnDialog() {
    databaseColumnDialog.value = createDatabaseColumnDialogState()
  }

  function openCreateDatabaseColumnDialog(afterField = null) {
    if (!databaseSchema.value.database || !databaseSchema.value.table) return
    const afterName = String(afterField?.name || afterField?.Field || '').trim()
    databaseColumnDialog.value = createDatabaseColumnDialogState({
      open: true,
      mode: 'create',
      readOnly: false,
      database: databaseSchema.value.database,
      table: databaseSchema.value.table,
      originalName: '',
      position: {
        mode: afterName ? 'after' : 'last',
        afterColumn: afterName
      }
    })
  }

  function extractDatabaseColumnTypeBase(type = '') {
    return String(type || '').trim().replace(/\(.*\)$/, '').trim()
  }

  function extractDatabaseColumnTypeLength(type = '') {
    const match = String(type || '').trim().match(/^[^(]+\(([^)]+)\)/)
    return match ? String(match[1] || '').trim() : ''
  }

  function composeDatabaseColumnType(type = '', length = '') {
    const baseType = extractDatabaseColumnTypeBase(type)
    const normalizedLength = String(length || '').trim()
    if (!baseType) return ''
    return normalizedLength ? `${baseType}(${normalizedLength})` : baseType
  }

  function createPlainDatabaseColumnPayload(input = {}) {
    const source = input && typeof input === 'object' ? input : {}
    return {
      oldName: String(source.oldName || ''),
      name: String(source.name || ''),
      type: String(source.type || ''),
      nullable: source.nullable === true,
      key: String(source.key || ''),
      defaultMode: String(source.defaultMode || 'none'),
      defaultValue: source.defaultValue === null || source.defaultValue === undefined ? '' : String(source.defaultValue),
      extraClause: String(source.extraClause || ''),
      comment: String(source.comment || ''),
      collation: String(source.collation || ''),
      autoIncrement: source.autoIncrement === true,
      onUpdateCurrentTimestamp: source.onUpdateCurrentTimestamp === true
    }
  }

  function createPlainDatabaseColumnPosition(input = {}) {
    const source = input && typeof input === 'object' ? input : {}
    return {
      mode: String(source.mode || 'last'),
      afterColumn: String(source.afterColumn || '')
    }
  }

  function openDatabaseColumnDialog(row) {
    const fieldMeta = getDatabaseSchemaFieldMeta(row)
    if (!fieldMeta || !databaseSchema.value.database || !databaseSchema.value.table) return
    databaseColumnDialog.value = createDatabaseColumnDialogState({
      open: true,
      mode: 'edit',
      readOnly: fieldMeta.schemaReadOnly === true,
      database: databaseSchema.value.database,
      table: databaseSchema.value.table,
      originalName: fieldMeta.name,
      form: {
        name: fieldMeta.name,
        type: extractDatabaseColumnTypeBase(fieldMeta.type),
        length: extractDatabaseColumnTypeLength(fieldMeta.type),
        nullable: fieldMeta.nullable === true,
        key: fieldMeta.key || '',
        defaultInput: formatDatabaseColumnDefaultInput(fieldMeta),
        extra: fieldMeta.extraClause || '',
        comment: fieldMeta.comment || '',
        collation: fieldMeta.collation || '',
        autoIncrement: /\bauto_increment\b/i.test(String(fieldMeta.extra || '')),
        onUpdateCurrentTimestamp: /\bon update\s+current_timestamp(?:\(\d+\))?\b/i.test(String(fieldMeta.extra || ''))
      }
    })
  }

  async function openCreateDatabaseRowDialog() {
    if (!databasePreview.value.database || !databasePreview.value.table) return
    databaseLoading.value = true
    try {
      const schema = await ensureDatabaseTableSchemaLoaded(databasePreview.value.database, databasePreview.value.table)
      const fieldMeta = schema?.fieldMeta || []
      const fields = fieldMeta
        .filter(item => !item.readOnly)
        .map(item => ({
          name: item.name,
          label: item.name,
          type: item.type || '',
          nullable: item.nullable === true,
          readOnly: false,
          identity: false,
          multiline: isDatabaseCreateFieldMultiline(item.type),
          originalValue: undefined,
          useNull: false,
          defaultValue: item.defaultValue,
          value: ''
        }))
      if (!fields.length) {
        message.value = '当前表没有可写字段，无法新增数据'
        return
      }
      databaseRowDialog.value = createDatabaseRowDialogState({
        open: true,
        saving: false,
        mode: 'create',
        database: databasePreview.value.database,
        table: databasePreview.value.table,
        row: null,
        identityKey: null,
        identityValues: {},
        fields
      })
    } catch (error) {
      await reportError(error)
    } finally {
      databaseLoading.value = false
    }
  }

  async function openDatabaseRowDialog(row) {
    if (!row || !databasePreview.value.database || !databasePreview.value.table) return
    databaseLoading.value = true
    try {
      const schema = await ensureDatabaseTableSchemaLoaded(databasePreview.value.database, databasePreview.value.table)
      if (!schema?.identityKey?.columns?.length) {
        await reportError(new Error('当前表未识别到主键或唯一键，暂不支持编辑当前行。'))
        return
      }
      const fields = buildDatabaseRowDialogFields(row, schema.fieldMeta || [], schema.identityKey)
      if (!fields.some(item => !item.readOnly)) {
        await reportError(new Error('当前表没有可编辑字段，暂不支持编辑当前行。'))
        return
      }
      databaseRowDialog.value = createDatabaseRowDialogState({
        open: true,
        mode: 'edit',
        database: databasePreview.value.database,
        table: databasePreview.value.table,
        row,
        identityKey: schema.identityKey,
        identityValues: buildDatabaseRowIdentityValues(schema.identityKey, row),
        identityLabel: buildDatabaseIdentityLabel(schema.identityKey, row),
        fields
      })
    } catch (error) {
      await reportError(error)
    } finally {
      databaseLoading.value = false
    }
  }

  async function openDatabaseInlineEdit(row, fieldName = '') {
    if (!row || databaseResult.value.source !== 'preview' || !databasePreview.value.database || !databasePreview.value.table) return
    const preferredField = String(fieldName || '').trim()
    if (databaseInlineEdit.value.open) {
      const isSameTable = databaseInlineEdit.value.database === databasePreview.value.database
        && databaseInlineEdit.value.table === databasePreview.value.table
      const entry = getDatabaseInlineEditEntry(row)
      if (!isSameTable || !entry) {
        closeDatabaseInlineEdit()
      } else {
        const targetField = getDatabaseInlineEditField(preferredField, row)
        if (!targetField) return
        databaseInlineEdit.value.activeField = targetField.name
        databaseInlineEdit.value.activeRow = entry?.row || null
        databaseInlineEdit.value.activeRowIndex = entry?.rowIndex ?? -1
        return
      }
    }
    databaseLoading.value = true
    try {
      const schema = await ensureDatabaseTableSchemaLoaded(databasePreview.value.database, databasePreview.value.table)
      if (!schema?.identityKey?.columns?.length) {
        await reportError(new Error('当前表未识别到主键或唯一键，暂不支持编辑当前行。'))
        return
      }
      const fields = buildDatabaseRowDialogFields(row, schema.fieldMeta || [], schema.identityKey)
      if (!fields.some(item => !item.readOnly)) {
        await reportError(new Error('当前表没有可编辑字段，暂不支持编辑当前行。'))
        return
      }
      const pageRows = Array.isArray(databaseResult.value.rows) ? databaseResult.value.rows : []
      const inlineRows = pageRows.map((currentRow, rowIndex) => ({
        row: currentRow,
        rowIndex,
        identityValues: buildDatabaseRowIdentityValues(schema.identityKey, currentRow),
        identityLabel: buildDatabaseIdentityLabel(schema.identityKey, currentRow),
        fields: buildDatabaseRowDialogFields(currentRow, schema.fieldMeta || [], schema.identityKey)
      }))
      const activeEntry = inlineRows.find(item => item.row === row) || inlineRows[0] || null
      const targetField = activeEntry?.fields?.find(item => item.name === preferredField) || null
      databaseInlineEdit.value = createDatabaseInlineEditState({
        open: true,
        saving: false,
        database: databasePreview.value.database,
        table: databasePreview.value.table,
        identityKey: schema.identityKey,
        activeRow: activeEntry?.row || null,
        activeRowIndex: activeEntry?.rowIndex ?? -1,
        activeField: targetField?.name || '',
        rows: inlineRows
      })
    } catch (error) {
      await reportError(error)
    } finally {
      databaseLoading.value = false
    }
  }

  function isDatabaseInlineEditRow(row) {
    return databaseInlineEdit.value.open && Array.isArray(databaseInlineEdit.value.rows) && databaseInlineEdit.value.rows.some(item => item.row === row)
  }

  function isDatabaseInlineEditFieldActive(fieldName = '', row = null) {
    return databaseInlineEdit.value.activeRow === row && String(databaseInlineEdit.value.activeField || '') === String(fieldName || '')
  }

  function getDatabaseInlineEditFieldValue(fieldName = '', row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field) return ''
    return field.value === undefined || field.value === null ? '' : field.value
  }

  function isDatabaseInlineEditFieldNull(fieldName = '', row = null) {
    return getDatabaseInlineEditField(fieldName, row)?.useNull === true
  }

  function setDatabaseInlineEditFieldNull(fieldName = '', nextValue = false, row = null) {
    const field = getDatabaseInlineEditField(fieldName, row)
    if (!field || field.readOnly) return
    const shouldUseNull = nextValue === true
    if (shouldUseNull && !field.nullable) return
    field.useNull = shouldUseNull
    if (field.useNull) field.value = ''
  }

  function activateDatabaseInlineEditField(fieldName = '', row = null) {
    const targetName = String(fieldName || '').trim()
    if (!targetName) {
      databaseInlineEdit.value.activeField = ''
      databaseInlineEdit.value.activeRow = null
      databaseInlineEdit.value.activeRowIndex = -1
      return
    }
    const entry = getDatabaseInlineEditEntry(row)
    const field = getDatabaseInlineEditField(targetName, row)
    if (!field || field.readOnly) return
    databaseInlineEdit.value.activeField = field.name
    databaseInlineEdit.value.activeRow = entry?.row || null
    databaseInlineEdit.value.activeRowIndex = entry?.rowIndex ?? -1
  }

  function shouldUseDatabaseInlineTextarea(fieldName = '') {
    return getDatabaseInlineEditField(fieldName)?.multiline === true
  }

  function isDatabaseInlineEditFieldReadOnly(fieldName = '', row = null) {
    return getDatabaseInlineEditField(fieldName, row)?.readOnly === true
  }

  function isDatabaseInlineEditFieldNullable(fieldName = '', row = null) {
    return getDatabaseInlineEditField(fieldName, row)?.nullable === true
  }

  async function saveDatabaseInlineEdit() {
    if (!databaseInlineEdit.value.open || databaseInlineEdit.value.saving) return false
    const changedEntries = getDatabaseInlineEditChangedEntries()
    if (!changedEntries.length) {
      message.value = '没有检测到字段修改'
      closeDatabaseInlineEdit()
      return false
    }
    let pendingToast = null
    try {
      databaseInlineEdit.value.saving = true
      pendingToast = showPendingActionToast(`正在保存 ${databaseInlineEdit.value.table} 的 ${changedEntries.length} 行修改...`)
      ensureBridgeMethod('updateDatabaseRow')
      let totalAffectedRows = 0
      for (const item of changedEntries) {
        const payload = {
          id: databaseConnectionId.value,
          database: String(databaseInlineEdit.value.database || ''),
          table: String(databaseInlineEdit.value.table || ''),
          identityValues: { ...(item.identityValues || {}) },
          changes: { ...(item.changes || {}) }
        }
        const result = await window.whSSH.updateDatabaseRow({
          ...payload
        })
        totalAffectedRows += Number(result?.affectedRows || 0)
      }
      databaseResult.value = createDatabaseResultState({
        source: 'row-update',
        message: `已更新 ${changedEntries.length} 行`,
        affectedRows: totalAffectedRows
      })
      closeDatabaseInlineEdit()
      await reloadDatabasePreview()
      message.value = changedEntries.length === 1 ? '行数据已更新' : `已更新 ${changedEntries.length} 行数据`
      return true
    } catch (error) {
      await reportError(error)
      return false
    } finally {
      pendingToast?.close?.()
      if (databaseInlineEdit.value.open) databaseInlineEdit.value.saving = false
    }
  }

  function cancelDatabaseInlineEdit() {
    closeDatabaseInlineEdit()
  }

  function getDatabaseInlineEditRowChanges(entry) {
    const changes = {}
    for (const field of entry?.fields || []) {
      if (field.readOnly) continue
      let nextFieldValue = field.value
      if (getDatabaseInlineEditFieldCategory(field.name, entry?.row) === 'datetime') {
        nextFieldValue = normalizeDatabaseInlineDatetimeSubmitValue(nextFieldValue)
      }
      const nextValue = field.useNull ? null : normalizeDatabaseComparableValue(nextFieldValue)
      const originalValue = normalizeDatabaseComparableValue(field.originalValue)
      if (nextValue !== originalValue) changes[field.name] = nextValue
    }
    return changes
  }

  function sanitizeDatabaseMutationPayloadValues(values = {}) {
    const nextValues = {}
    for (const [key, value] of Object.entries(values || {})) {
      nextValues[key] = normalizeDatabaseComparableValue(value)
    }
    return nextValues
  }

  function getDatabaseInlineEditChangedEntries() {
    return (databaseInlineEdit.value.rows || []).map(entry => ({
      ...entry,
      identityValues: sanitizeDatabaseMutationPayloadValues(entry.identityValues),
      changes: getDatabaseInlineEditRowChanges(entry)
    })).filter(entry => Object.keys(entry.changes).length)
  }

  function hasDatabaseInlineEditPendingChanges() {
    return getDatabaseInlineEditChangedEntries().length > 0
  }

  function getDatabaseRowDialogChanges() {
    const changes = {}
    for (const field of databaseRowDialog.value.fields || []) {
      if (field.readOnly) continue
      const nextValue = field.useNull ? null : normalizeDatabaseComparableValue(field.value)
      const originalValue = normalizeDatabaseComparableValue(field.originalValue)
      if (nextValue !== originalValue) changes[field.name] = nextValue
    }
    return changes
  }

  function getDatabaseRowDialogInsertValues() {
    const values = {}
    for (const field of databaseRowDialog.value.fields || []) {
      if (field.readOnly) continue
      if (field.useNull === true) {
        values[field.name] = field.nullable ? null : normalizeDatabaseComparableValue(getDatabaseCreateFieldFallbackValue(field))
        continue
      }
      const nextValue = normalizeDatabaseComparableValue(field.value)
      if (nextValue === null || nextValue === '') {
        if (field.nullable) {
          values[field.name] = null
          continue
        }
        values[field.name] = normalizeDatabaseComparableValue(
          field.defaultValue !== undefined && field.defaultValue !== null
            ? field.defaultValue
            : getDatabaseCreateFieldFallbackValue(field)
        )
        continue
      }
      values[field.name] = nextValue
    }
    return values
  }

  async function submitDatabaseRowDialog() {
    if (!databaseRowDialog.value.open || databaseRowDialog.value.saving) return
    if (databaseRowDialog.value.mode === 'create') {
      const values = getDatabaseRowDialogInsertValues()
      let pendingToast = null
      try {
        databaseRowDialog.value.saving = true
        pendingToast = showPendingActionToast(`正在向 ${databaseRowDialog.value.table} 新增数据...`)
        ensureBridgeMethod('addDatabaseRow')
        const result = await window.whSSH.addDatabaseRow({
          id: databaseConnectionId.value,
          database: databaseRowDialog.value.database,
          table: databaseRowDialog.value.table,
          values
        })
        databaseResult.value = createDatabaseResultState({ ...result, source: 'row-create' })
        closeDatabaseRowDialog()
        await reloadDatabasePreview()
        message.value = result.message || '数据已新增'
      } catch (error) {
        await reportError(error)
      } finally {
        pendingToast?.close?.()
        if (databaseRowDialog.value.open) databaseRowDialog.value.saving = false
      }
      return
    }
    const changes = getDatabaseRowDialogChanges()
    if (!Object.keys(changes).length) {
      message.value = '没有检测到字段修改'
      return
    }
    let pendingToast = null
    try {
      databaseRowDialog.value.saving = true
      pendingToast = showPendingActionToast(`正在保存 ${databaseRowDialog.value.table} 的这一行修改...`)
      ensureBridgeMethod('updateDatabaseRow')
      const result = await window.whSSH.updateDatabaseRow({
        id: databaseConnectionId.value,
        database: databaseRowDialog.value.database,
        table: databaseRowDialog.value.table,
        identityValues: databaseRowDialog.value.identityValues,
        changes
      })
      databaseResult.value = createDatabaseResultState({ ...result, source: 'row-update' })
      closeDatabaseRowDialog()
      await reloadDatabasePreview()
      message.value = result.message || '行数据已更新'
    } catch (error) {
      await reportError(error)
    } finally {
      pendingToast?.close?.()
      if (databaseRowDialog.value.open) databaseRowDialog.value.saving = false
    }
  }

  async function submitDatabaseColumnDialog() {
    if (!databaseColumnDialog.value.open || databaseColumnDialog.value.saving || databaseColumnDialog.value.readOnly) return
    let pendingToast = null
    try {
      databaseColumnDialog.value.saving = true
      const isCreate = databaseColumnDialog.value.mode === 'create'
      pendingToast = showPendingActionToast(isCreate
        ? `正在向 ${databaseColumnDialog.value.table} 新增字段 ${databaseColumnDialog.value.form.name || ''}...`
        : `正在保存 ${databaseColumnDialog.value.table}.${databaseColumnDialog.value.originalName} 的字段修改...`)
      const defaultPayload = normalizeDatabaseColumnDefaultPayload(databaseColumnDialog.value.form.defaultInput)
      const composedType = composeDatabaseColumnType(databaseColumnDialog.value.form.type, databaseColumnDialog.value.form.length)
      const columnPayload = createPlainDatabaseColumnPayload({
        oldName: String(databaseColumnDialog.value.originalName || ''),
        name: String(databaseColumnDialog.value.form.name || ''),
        type: String(composedType || ''),
        nullable: databaseColumnDialog.value.form.nullable === true,
        key: String(databaseColumnDialog.value.form.key || ''),
        defaultMode: defaultPayload.defaultMode,
        defaultValue: defaultPayload.defaultValue,
        extraClause: String(databaseColumnDialog.value.form.extra || ''),
        comment: String(databaseColumnDialog.value.form.comment || ''),
        collation: String(databaseColumnDialog.value.form.collation || ''),
        autoIncrement: databaseColumnDialog.value.form.autoIncrement === true,
        onUpdateCurrentTimestamp: databaseColumnDialog.value.form.onUpdateCurrentTimestamp === true
      })
      const payload = {
        id: databaseConnectionId.value,
        database: String(databaseColumnDialog.value.database || ''),
        table: String(databaseColumnDialog.value.table || ''),
        column: columnPayload
      }
      let result = null
      if (isCreate) {
        ensureBridgeMethod('addDatabaseColumn')
        result = await window.whSSH.addDatabaseColumn({
          ...payload,
          position: createPlainDatabaseColumnPosition(databaseColumnDialog.value.position)
        })
      } else {
        ensureBridgeMethod('updateDatabaseColumn')
        result = await window.whSSH.updateDatabaseColumn(payload)
      }
      databaseResult.value = createDatabaseResultState({ ...result, source: isCreate ? 'column-create' : 'column-update' })
      closeDatabaseColumnDialog()
      await loadDatabaseTableSchema(databaseSchema.value.database, databaseSchema.value.table)
      if (databaseDataTab?.value !== 'schema') await reloadDatabasePreview()
      message.value = result.message || (isCreate ? '字段已新增' : '字段定义已更新')
    } catch (error) {
      await reportError(error)
    } finally {
      pendingToast?.close?.()
      if (databaseColumnDialog.value.open) databaseColumnDialog.value.saving = false
    }
  }

  async function saveDatabaseSchemaInlineColumn(payload = {}) {
    const database = String(payload.database || databaseSchema.value.database || '').trim()
    const table = String(payload.table || databaseSchema.value.table || '').trim()
    const originalName = String(payload.originalName || '').trim()
    const form = payload.form && typeof payload.form === 'object' ? payload.form : null
    if (!database || !table || !originalName || !form) return
    let pendingToast = null
    try {
      pendingToast = showPendingActionToast(`正在保存 ${table}.${originalName} 的字段修改...`)
      const defaultPayload = normalizeDatabaseColumnDefaultPayload(form.defaultInput)
      ensureBridgeMethod('updateDatabaseColumn')
      const result = await window.whSSH.updateDatabaseColumn({
        id: databaseConnectionId.value,
        database,
        table,
        column: createPlainDatabaseColumnPayload({
          oldName: originalName,
          name: String(form.name || ''),
          type: String(form.type || ''),
          key: String(form.key || ''),
          nullable: form.nullable,
          defaultMode: defaultPayload.defaultMode,
          defaultValue: defaultPayload.defaultValue,
          comment: String(form.comment || ''),
          collation: String(form.collation || ''),
          autoIncrement: form.autoIncrement,
          onUpdateCurrentTimestamp: form.onUpdateCurrentTimestamp
        })
      })
      databaseResult.value = createDatabaseResultState({ ...result, source: 'column-update' })
      await loadDatabaseTableSchema(database, table)
      if (databaseDataTab?.value !== 'schema') await reloadDatabasePreview()
      message.value = result.message || '字段定义已更新'
      return result
    } catch (error) {
      await reportError(error)
      throw error
    } finally {
      pendingToast?.close?.()
    }
  }

  async function deleteDatabaseSchemaColumn(row) {
    const fieldMeta = getDatabaseSchemaFieldMeta(row)
    if (!fieldMeta || !databaseSchema.value.database || !databaseSchema.value.table) return
    let pendingToast = null
    databaseLoading.value = true
    try {
      await ElMessageBox.confirm(`确认删除字段 ${fieldMeta.name}？\n\n这会直接修改 ${databaseSchema.value.table} 的表结构，且不可撤销。`, '删除字段', {
        type: 'warning',
        confirmButtonText: '删除字段',
        cancelButtonText: '取消'
      })
      pendingToast = showPendingActionToast(`正在删除 ${databaseSchema.value.table}.${fieldMeta.name} 字段...`)
      ensureBridgeMethod('deleteDatabaseColumn')
      const result = await window.whSSH.deleteDatabaseColumn({
        id: databaseConnectionId.value,
        database: databaseSchema.value.database,
        table: databaseSchema.value.table,
        column: fieldMeta.name
      })
      databaseResult.value = createDatabaseResultState({ ...result, source: 'column-delete' })
      selectedDatabaseSchemaRow.value = null
      await loadDatabaseTableSchema(databaseSchema.value.database, databaseSchema.value.table)
      if (databaseDataTab?.value !== 'schema') await reloadDatabasePreview()
      message.value = result.message || '字段已删除'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function deleteDatabasePreviewRow(row) {
    if (!row || !databasePreview.value.database || !databasePreview.value.table) return
    databaseLoading.value = true
    let pendingToast = null
    try {
      const schema = await ensureDatabaseTableSchemaLoaded(databasePreview.value.database, databasePreview.value.table)
      if (!schema?.identityKey?.columns?.length) {
        await reportError(new Error('当前表未识别到主键或唯一键，暂不支持删除当前行。'))
        return
      }
      const identityLabel = buildDatabaseIdentityLabel(schema.identityKey, row)
      await ElMessageBox.confirm(`确认删除 ${databasePreview.value.table} 中的这一行？\n\n${identityLabel}`, '删除数据行', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      pendingToast = showPendingActionToast(`正在删除 ${databasePreview.value.table} 的这一行...`)
      ensureBridgeMethod('deleteDatabaseRow')
      const result = await window.whSSH.deleteDatabaseRow({
        id: databaseConnectionId.value,
        database: databasePreview.value.database,
        table: databasePreview.value.table,
        identityValues: buildDatabaseRowIdentityValues(schema.identityKey, row)
      })
      databaseResult.value = createDatabaseResultState({ ...result, source: 'row-delete' })
      await reloadDatabasePreview()
      if (!databaseResult.value.rows.length && databasePreview.value.page > 1) {
        await loadDatabaseTablePreview(databasePreview.value.database, databasePreview.value.table, databasePreview.value.page - 1, databasePreview.value.pageSize)
      }
      message.value = result.message || '行数据已删除'
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    } finally {
      pendingToast?.close?.()
      databaseLoading.value = false
    }
  }

  async function handleDatabaseResultCellDblClick(row, column) {
    if (!row || databaseResult.value.source !== 'preview') return
    const fieldName = String(column?.property || '').trim()
    if (!fieldName) return
    await openDatabaseInlineEdit(row, fieldName)
  }

  async function handleDatabaseResultCellClick(row, column) {
    if (!row || databaseResult.value.source !== 'preview') return
    const fieldName = String(column?.property || '').trim()
    if (!fieldName) return
    await openDatabaseInlineEdit(row, fieldName)
  }

  async function showDatabaseResultContextMenu(row, column, event) {
    event.preventDefault()
    event.stopPropagation()
    if (!row || databaseResult.value.source !== 'preview') return
    selectedDatabaseResultRow.value = row
    try {
      await ensureDatabaseTableSchemaLoaded(databasePreview.value.database, databasePreview.value.table)
    } catch (error) {
      await reportError(error)
      return
    }
    await showNativeContextMenu('database-row', row, event)
  }

  async function showDatabaseSchemaContextMenu(row, column, event) {
    event.preventDefault()
    event.stopPropagation()
    if (!row || !databaseSchema.value.table) return
    selectedDatabaseSchemaRow.value = row
    await showNativeContextMenu('database-schema-row', row, event)
  }

  return {
    closeDatabaseRowDialog,
    closeDatabaseColumnDialog,
    openCreateDatabaseColumnDialog,
    openDatabaseColumnDialog,
    openCreateDatabaseRowDialog,
    openDatabaseRowDialog,
    submitDatabaseRowDialog,
    submitDatabaseColumnDialog,
    saveDatabaseSchemaInlineColumn,
    deleteDatabaseSchemaColumn,
    deleteDatabasePreviewRow,
    databaseInlineEdit,
    queryDatabaseInlineEditSuggestions,
    getDatabaseInlineEditSuggestionItems,
    handleDatabaseInlineEditSuggestionSelect,
    handleDatabaseInlineEditFieldInput,
    getDatabaseInlineEditFieldCategory,
    getDatabaseInlineEditControlType,
    getDatabaseInlineEditInputType,
    getDatabaseInlineEditEditorValue,
    shouldUseDatabaseInlineSuggestions,
    getDatabaseInlineEditSelectOptions,
    getDatabaseInlineEditSelectValue,
    handleDatabaseInlineEditSelectChange,
    isDatabaseInlineEditRow,
    isDatabaseInlineEditFieldActive,
    getDatabaseInlineEditFieldValue,
    isDatabaseInlineEditFieldNull,
    setDatabaseInlineEditFieldNull,
    activateDatabaseInlineEditField,
    shouldUseDatabaseInlineTextarea,
    isDatabaseInlineEditFieldReadOnly,
    isDatabaseInlineEditFieldNullable,
    saveDatabaseInlineEdit,
    cancelDatabaseInlineEdit,
    handleDatabaseResultCellClick,
    handleDatabaseResultCellDblClick,
    showDatabaseResultContextMenu,
    showDatabaseSchemaContextMenu
  }
}
