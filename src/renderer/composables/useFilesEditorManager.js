import { computed, nextTick, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const EDITOR_ENCODING_OPTIONS = [
  { value: 'utf8', label: 'UTF-8' },
  { value: 'utf8-bom', label: 'UTF-8 BOM' },
  { value: 'gbk', label: 'GBK' },
  { value: 'gb2312', label: 'GB2312' },
  { value: 'gb18030', label: 'GB18030' },
  { value: 'big5', label: 'Big5' },
  { value: 'shift_jis', label: 'Shift-JIS' },
  { value: 'utf16le', label: 'UTF-16 LE' },
  { value: 'latin1', label: 'ANSI / Latin-1' }
]

function createEditorState(overrides = {}) {
  return {
    open: false,
    path: '',
    content: '',
    encoding: 'utf8',
    savedContent: '',
    loading: false,
    cursorLine: 1,
    cursorColumn: 1,
    ...overrides
  }
}

function cloneEditorState(state = {}) {
  return createEditorState({ ...state })
}

function normalizeEditorEncoding(value = 'utf8') {
  const normalized = String(value || 'utf8').trim().toLowerCase().replace(/[_\s]+/g, '-')
  const matched = EDITOR_ENCODING_OPTIONS.find(item => item.value === normalized)
  if (matched) return matched.value
  if (normalized === 'utf-8') return 'utf8'
  if (normalized === 'utf-8-bom') return 'utf8-bom'
  if (normalized === 'utf-16le') return 'utf16le'
  if (normalized === 'shift-jis') return 'shift_jis'
  if (normalized === 'latin-1' || normalized === 'ansi') return 'latin1'
  return 'utf8'
}

function getFileBaseName(value) {
  const normalized = String(value || '').replace(/[\\/]+$/, '')
  if (!normalized) return ''
  const parts = normalized.split(/[\\/]/)
  return parts[parts.length - 1] || normalized
}

export function useFilesEditorManager(options) {
  const {
    sessionId,
    message,
    getExt,
    ensureEditorMonaco,
    syncEditorMonacoContent,
    disposeEditorMonaco,
    setEditorMonacoReadOnly,
    openEditorMonacoFind,
    openEditorMonacoReplace
  } = options

  const editor = ref(createEditorState())
  const editorTabs = ref([])
  const editorHasUnsavedChanges = computed(() => editor.value.content !== editor.value.savedContent)

  function findEditorTabIndex(path) {
    return editorTabs.value.findIndex(item => item.path === path)
  }

  function syncEditorIntoTabs() {
    if (!editor.value.open || !editor.value.path) return
    const index = findEditorTabIndex(editor.value.path)
    if (index < 0) return
    editorTabs.value.splice(index, 1, cloneEditorState(editor.value))
  }

  function getEditorEncodingLabel(value = 'utf8') {
    return EDITOR_ENCODING_OPTIONS.find(item => item.value === normalizeEditorEncoding(value))?.label || 'UTF-8'
  }

  function getEditorFileTypeLabel(value = '') {
    const ext = getExt(value)
    if (!ext) return 'PLAIN TEXT'
    if (ext === 'js') return 'JAVASCRIPT'
    if (ext === 'ts') return 'TYPESCRIPT'
    if (ext === 'md') return 'MARKDOWN'
    if (ext === 'yml') return 'YAML'
    return ext.toUpperCase()
  }

  function openEditorFind() {
    openEditorMonacoFind()
  }

  function openEditorReplace() {
    openEditorMonacoReplace()
  }

  async function handleEditorEncodingCommand(value) {
    const encoding = normalizeEditorEncoding(value)
    if (encoding === editor.value.encoding) return
    if (!editor.value.path) {
      editor.value.encoding = encoding
      syncEditorIntoTabs()
      return
    }
    if (!await confirmDiscardEditorChanges(`按 ${getEditorEncodingLabel(encoding)} 重新打开`)) return
    editor.value.encoding = encoding
    syncEditorIntoTabs()
    message.value = `正在按 ${getEditorEncodingLabel(encoding)} 重新打开文件...`
    await openEditor({ path: editor.value.path }, { encoding, reload: true })
  }

  async function copyEditorPath() {
    const text = String(editor.value.path || '').trim()
    if (!text) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const input = document.createElement('textarea')
        input.value = text
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      ElMessage({ message: '已复制', type: 'success', duration: 1200, grouping: true })
    } catch (error) {
      ElMessage({ message: '复制文件路径失败', type: 'error', duration: 1600, grouping: true })
    }
  }

  async function confirmDiscardEditorChanges(actionLabel = '继续操作') {
    if (!editor.value.open || !editorHasUnsavedChanges.value) return true
    try {
      await ElMessageBox.confirm(`当前文件有未保存修改，继续${actionLabel}会丢失这些内容。是否继续？`, '未保存修改', {
        type: 'warning',
        confirmButtonText: '继续',
        cancelButtonText: '取消'
      })
      return true
    } catch (error) {
      return false
    }
  }

  async function confirmDiscardEditorTab(path, actionLabel = '继续操作') {
    const index = findEditorTabIndex(path)
    const target = index > -1 ? editorTabs.value[index] : null
    if (!target || target.content === target.savedContent) return true
    try {
      await ElMessageBox.confirm(`文件 ${getFileBaseName(path)} 有未保存修改，继续${actionLabel}会丢失这些内容。是否继续？`, '未保存修改', {
        type: 'warning',
        confirmButtonText: '继续',
        cancelButtonText: '取消'
      })
      return true
    } catch (error) {
      return false
    }
  }

  async function activateEditorTab(path) {
    if (!path || path === editor.value.path) return
    syncEditorIntoTabs()
    const index = findEditorTabIndex(path)
    if (index < 0) return
    editor.value = cloneEditorState({ ...editorTabs.value[index], open: true })
    await nextTick()
    await ensureEditorMonaco()
    syncEditorMonacoContent(editor.value.content, editor.value.path)
  }

  async function closeEditor() {
    syncEditorIntoTabs()
    const dirtyTabs = editorTabs.value.filter(item => item.content !== item.savedContent)
    if (dirtyTabs.length) {
      try {
        await ElMessageBox.confirm(`当前有 ${dirtyTabs.length} 个页签存在未保存修改，继续关闭会丢失这些内容。是否继续？`, '未保存修改', {
          type: 'warning',
          confirmButtonText: '关闭全部',
          cancelButtonText: '取消'
        })
      } catch (error) {
        return
      }
    }
    disposeEditorMonaco()
    editorTabs.value = []
    editor.value = createEditorState()
  }

  async function closeEditorTab(path) {
    syncEditorIntoTabs()
    if (!await confirmDiscardEditorTab(path, '关闭页签')) return
    const index = findEditorTabIndex(path)
    if (index < 0) return
    const isActive = editor.value.path === path
    editorTabs.value.splice(index, 1)
    if (!editorTabs.value.length) {
      disposeEditorMonaco()
      editor.value = createEditorState()
      return
    }
    if (!isActive) return
    const nextIndex = Math.max(0, index - 1)
    await activateEditorTab(editorTabs.value[nextIndex].path)
  }

  async function openEditor(file, options = {}) {
    const encoding = normalizeEditorEncoding(options.encoding || editor.value.encoding || 'utf8')
    const tabIndex = findEditorTabIndex(file.path)
    if (tabIndex > -1 && !options.reload) {
      if (editorTabs.value[tabIndex].encoding !== encoding) {
        editorTabs.value[tabIndex].encoding = encoding
      }
      await activateEditorTab(file.path)
      return
    }
    try {
      syncEditorIntoTabs()
      editor.value = createEditorState({
        open: true,
        path: file.path,
        encoding,
        loading: true
      })
      const content = await window.whSSH.readTextFile({ sessionId: sessionId.value, path: file.path, encoding })
      editor.value = createEditorState({
        open: true,
        path: file.path,
        content,
        savedContent: content,
        encoding
      })
      const nextTab = cloneEditorState(editor.value)
      if (tabIndex > -1) editorTabs.value.splice(tabIndex, 1, nextTab)
      else editorTabs.value.push(nextTab)
      await nextTick()
      await ensureEditorMonaco()
      syncEditorMonacoContent(content, file.path)
    } catch (error) {
      editor.value.loading = false
      message.value = `读取文件失败：${error.message}`
    }
  }

  async function reloadEditorWithEncoding() {
    if (!editor.value.path) return
    if (!await confirmDiscardEditorChanges(`按 ${getEditorEncodingLabel(editor.value.encoding)} 重新打开`)) return
    await openEditor({ path: editor.value.path }, { encoding: editor.value.encoding, reload: true })
  }

  async function saveEditor() {
    try {
      editor.value.loading = true
      syncEditorIntoTabs()
      setEditorMonacoReadOnly(true)
      await window.whSSH.writeTextFile({
        sessionId: sessionId.value,
        path: editor.value.path,
        content: editor.value.content,
        encoding: editor.value.encoding
      })
      editor.value.savedContent = editor.value.content
      syncEditorIntoTabs()
      message.value = `文件已按 ${getEditorEncodingLabel(editor.value.encoding)} 保存`
    } catch (error) {
      message.value = `保存文件失败：${error.message}`
    } finally {
      editor.value.loading = false
      setEditorMonacoReadOnly(false)
    }
  }

  return {
    editor,
    editorTabs,
    editorHasUnsavedChanges,
    EDITOR_ENCODING_OPTIONS,
    syncEditorIntoTabs,
    getFileBaseName,
    getEditorEncodingLabel,
    getEditorFileTypeLabel,
    openEditorFind,
    openEditorReplace,
    handleEditorEncodingCommand,
    copyEditorPath,
    confirmDiscardEditorChanges,
    activateEditorTab,
    closeEditor,
    closeEditorTab,
    openEditor,
    reloadEditorWithEncoding,
    saveEditor
  }
}
