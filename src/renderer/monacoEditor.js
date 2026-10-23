import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let monacoRuntimePromise = null
const registeredThemes = new Set()
let nginxLanguageRegistered = false
let modelSeed = 0

const DEFAULT_MONACO_THEME = 'whssh-dark'

const MONACO_THEMES = {
  'whssh-dark': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' },
      { token: 'string', foreground: '34d399' },
      { token: 'number', foreground: 'c084fc' },
      { token: 'type', foreground: '2dd4bf' },
      { token: 'delimiter', foreground: 'cbd5e1' },
      { token: 'tag', foreground: 'f87171' },
      { token: 'attribute.name', foreground: '5eead4' },
      { token: 'attribute.value', foreground: '86efac' }
    ],
    colors: {
      'editor.background': '#0b1220',
      'editor.foreground': '#dbeafe',
      'editorLineNumber.foreground': '#64748b',
      'editorLineNumber.activeForeground': '#e2e8f0',
      'editor.lineHighlightBackground': '#111827',
      'editor.selectionBackground': '#2563eb99',
      'editor.selectionHighlightBackground': '#60a5fa44',
      'editor.inactiveSelectionBackground': '#47556988',
      'editor.wordHighlightBackground': '#47556955',
      'editor.wordHighlightStrongBackground': '#1d4ed866',
      'editor.findMatchBackground': '#f59e0b66',
      'editor.findMatchHighlightBackground': '#fbbf2444',
      'editorCursor.foreground': '#f8fafc',
      'editorIndentGuide.background1': '#1f2937',
      'editorIndentGuide.activeBackground1': '#475569',
      'editorWidget.background': '#111827',
      'editorWidget.border': '#334155',
      'editorSuggestWidget.background': '#111827',
      'editorSuggestWidget.border': '#334155',
      'editorSuggestWidget.foreground': '#e5e7eb',
      'editorSuggestWidget.selectedBackground': '#1e3a8a',
      'editorHoverWidget.background': '#111827',
      'editorHoverWidget.border': '#334155'
    }
  },
  'whssh-light': {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      { token: 'keyword', foreground: '2563eb', fontStyle: 'bold' },
      { token: 'string', foreground: '059669' },
      { token: 'number', foreground: '7c3aed' },
      { token: 'type', foreground: '0f766e' }
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#111827',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#0f172a',
      'editor.lineHighlightBackground': '#f8fafc',
      'editor.selectionBackground': '#bfdbfe',
      'editor.selectionHighlightBackground': '#dbeafe',
      'editor.inactiveSelectionBackground': '#e2e8f0',
      'editorCursor.foreground': '#111827'
    }
  }
}

if (!globalThis.MonacoEnvironment) {
  globalThis.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
      if (label === 'typescript' || label === 'javascript') return new tsWorker()
      return new editorWorker()
    }
  }
}

async function ensureMonacoRuntime() {
  if (!monacoRuntimePromise) {
    monacoRuntimePromise = (async () => {
      await import('monaco-editor/esm/nls.messages.zh-cn.js')
      const monaco = await import('monaco-editor/esm/vs/editor/editor.api')
      await Promise.all([
        import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/shell/shell.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/python/python.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/php/php.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/java/java.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/go/go.contribution.js'),
        import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js'),
        import('monaco-editor/esm/vs/language/json/monaco.contribution.js'),
        import('monaco-editor/esm/vs/language/css/monaco.contribution.js'),
        import('monaco-editor/esm/vs/language/html/monaco.contribution.js'),
        import('monaco-editor/esm/vs/language/typescript/monaco.contribution.js')
      ])
      ensureNginxLanguage(monaco)
      return monaco
    })()
  }
  return monacoRuntimePromise
}

export { ensureMonacoRuntime }

const MONACO_LANGUAGE_MAP = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  vue: 'html',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  py: 'python',
  php: 'php',
  java: 'java',
  go: 'go',
  sql: 'sql',
  ini: 'plaintext',
  conf: 'nginx',
  txt: 'plaintext',
  log: 'plaintext'
}

function ensureNginxLanguage(monaco) {
  if (nginxLanguageRegistered) return
  if (!monaco.languages.getLanguages().some(item => item.id === 'nginx')) {
    monaco.languages.register({ id: 'nginx', extensions: ['.conf'], aliases: ['Nginx', 'nginx'] })
  }
  monaco.languages.setMonarchTokensProvider('nginx', {
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\b(events|http|server|location|upstream|map|stream|types)\b/, 'keyword'],
        [/\b(listen|server_name|root|alias|index|try_files|proxy_pass|proxy_set_header|return|rewrite|include|access_log|error_log|ssl_certificate|ssl_certificate_key|client_max_body_size|gzip|sendfile|keepalive_timeout)\b/, 'type'],
        [/\b(on|off|default_server|ssl|http2)\b/, 'keyword'],
        [/\$[A-Za-z0-9_]+/, 'variable'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string_double'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, 'string', '@string_single'],
        [/\b\d+[kKmMgGsS]?\b/, 'number'],
        [/[{}();]/, 'delimiter']
      ],
      string_double: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop']
      ],
      string_single: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape.invalid'],
        [/'/, 'string', '@pop']
      ]
    }
  })
  monaco.languages.setLanguageConfiguration('nginx', {
    comments: { lineComment: '#' },
    brackets: [['{', '}'], ['(', ')']],
    autoClosingPairs: [{ open: '{', close: '}' }, { open: '"', close: '"' }, { open: "'", close: "'" }],
    surroundingPairs: [{ open: '{', close: '}' }, { open: '"', close: '"' }, { open: "'", close: "'" }]
  })
  nginxLanguageRegistered = true
}

function getFileExtension(filePath = '') {
  const text = String(filePath || '')
  const index = text.lastIndexOf('.')
  return index > -1 ? text.slice(index + 1).toLowerCase() : ''
}

function buildModelUri(monaco, filePath = '') {
  const safePath = String(filePath || 'untitled').replace(/[^A-Za-z0-9._/-]+/g, '_') || 'untitled'
  modelSeed += 1
  return monaco.Uri.parse(`inmemory://whssh/${modelSeed}/${safePath}`)
}

function getMonacoLanguage(filePath = '') {
  return MONACO_LANGUAGE_MAP[getFileExtension(filePath)] || 'plaintext'
}

function resolveThemeName(theme) {
  return typeof theme === 'string' && theme ? theme : DEFAULT_MONACO_THEME
}

function ensureTheme(monaco, theme = DEFAULT_MONACO_THEME) {
  const themeName = resolveThemeName(theme)
  if (!registeredThemes.has(themeName)) {
    monaco.editor.defineTheme(themeName, MONACO_THEMES[themeName] || MONACO_THEMES[DEFAULT_MONACO_THEME])
    registeredThemes.add(themeName)
  }
  return themeName
}

export async function createMonacoEditorSession(container, options = {}) {
  const monaco = await ensureMonacoRuntime()
  const themeName = ensureTheme(monaco, options.theme)

  let syncing = false
  const editor = monaco.editor.create(container, {
    value: '',
    language: 'plaintext',
    theme: themeName,
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: 'on',
    glyphMargin: false,
    folding: true,
    roundedSelection: false,
    readOnly: !!options.readOnly,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    lineDecorationsWidth: 12,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    fontSize: 14,
    lineHeight: 22,
    wordWrap: 'off',
    tabSize: 2,
    insertSpaces: true,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    contextmenu: true
  })

  const changeDisposable = editor.onDidChangeModelContent(() => {
    if (syncing) return
    options.onChange?.(editor.getValue())
  })

  const cursorDisposable = editor.onDidChangeCursorPosition(event => {
    options.onCursorChange?.({
      lineNumber: event.position.lineNumber,
      column: event.position.column
    })
  })

  function setFileContent(filePath, value) {
    syncing = true
    const nextModel = monaco.editor.createModel(String(value || ''), getMonacoLanguage(filePath), buildModelUri(monaco, filePath))
    const currentModel = editor.getModel()
    editor.setModel(nextModel)
    if (currentModel) currentModel.dispose()
    syncing = false
  }

  function setReadOnly(value) {
    editor.updateOptions({ readOnly: !!value })
  }

  function setTheme(theme) {
    editor.updateOptions({ theme: ensureTheme(monaco, theme) })
  }

  function focusStart() {
    editor.focus()
    editor.setPosition({ lineNumber: 1, column: 1 })
    editor.setScrollTop(0)
    editor.setScrollLeft(0)
    editor.revealLineNearTop(1)
  }

  function focus() {
    editor.focus()
  }

  function openFind() {
    editor.focus()
    return editor.getAction('actions.find')?.run()
  }

  function openReplace() {
    editor.focus()
    return editor.getAction('editor.action.startFindReplaceAction')?.run()
  }

  function getSelectedText() {
    const selection = editor.getSelection()
    const model = editor.getModel()
    if (!selection || !model || selection.isEmpty()) return ''
    return model.getValueInRange(selection)
  }

  function getSearchScope(options = {}) {
    if (!options.inSelection) return false
    const selections = editor.getSelections()?.filter(item => item && !item.isEmpty()) || []
    if (!selections.length) return false
    return selections
  }

  function getFindWordSeparators(options = {}) {
    if (!options.wholeWord) return null
    return editor.getOption(monaco.editor.EditorOption.wordSeparators)
  }

  function buildReplacementText(match, searchText, replaceText, options = {}) {
    if (!options.isRegex) {
      if (!options.preserveCase) return String(replaceText || '')
      const sourceText = match?.range ? (editor.getModel()?.getValueInRange(match.range) || '') : ''
      const targetText = String(replaceText || '')
      if (!sourceText) return targetText
      if (sourceText.toUpperCase() === sourceText) return targetText.toUpperCase()
      if (sourceText.toLowerCase() === sourceText) return targetText.toLowerCase()
      if (sourceText[0] === sourceText[0].toUpperCase() && sourceText.slice(1) === sourceText.slice(1).toLowerCase()) {
        return targetText.charAt(0).toUpperCase() + targetText.slice(1)
      }
      return targetText
    }
    const rangeText = match?.range ? (editor.getModel()?.getValueInRange(match.range) || '') : ''
    const sourceText = match?.matches?.[0] ?? rangeText
    const flags = options.matchCase ? '' : 'i'
    try {
      return String(sourceText).replace(new RegExp(searchText, flags), String(replaceText || ''))
    } catch {
      return String(replaceText || '')
    }
  }

  function findMatches(searchText, options = {}) {
    const model = editor.getModel()
    if (!model || !searchText) return []
    return model.findMatches(
      searchText,
      getSearchScope(options),
      !!options.isRegex,
      !!options.matchCase,
      getFindWordSeparators(options),
      !!options.isRegex
    )
  }

  function revealMatch(range) {
    if (!range) return
    editor.setSelection(range)
    editor.revealRangeInCenterIfOutsideViewport(range)
    editor.focus()
  }

  function replaceRange(match, searchText, replaceText, options = {}) {
    if (!match?.range) return false
    const text = buildReplacementText(match, searchText, replaceText, options)
    editor.executeEdits('whssh-find', [{ range: match.range, text }])
    editor.pushUndoStop()
    return true
  }

  function replaceAll(searchText, replaceText, options = {}) {
    const matches = findMatches(searchText, options)
    if (!matches.length) return 0
    editor.executeEdits('whssh-find-all', matches.map(item => ({
      range: item.range,
      text: buildReplacementText(item, searchText, replaceText, options)
    })).reverse())
    editor.pushUndoStop()
    return matches.length
  }

  function dispose() {
    changeDisposable.dispose()
    cursorDisposable.dispose()
    const model = editor.getModel()
    if (model) model.dispose()
    editor.dispose()
  }

  return {
    editor,
    setFileContent,
    setReadOnly,
    setTheme,
    focusStart,
    focus,
    openFind,
    openReplace,
    getSelectedText,
    findMatches,
    revealMatch,
    replaceRange,
    replaceAll,
    layout: () => editor.layout(),
    dispose
  }
}
