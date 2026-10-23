<template>
  <div class="remote-path-picker">
    <input
      :value="modelValue"
      :disabled="disabled"
      :placeholder="placeholder"
      class="remote-path-picker-input"
      @input="handleInput"
    />
    <button type="button" class="remote-path-picker-btn" :disabled="disabled || !connected" @click="openDialog">
      <el-icon><ArrowDown /></el-icon>
    </button>

    <el-dialog v-model="dialogVisible" title="选择服务器路径" width="min(920px, 92vw)" class="remote-path-dialog">
      <div class="remote-path-dialog-body">
        <aside class="remote-path-places" aria-label="常用位置">
          <button
            v-for="item in sidebarLocations"
            :key="item.path"
            type="button"
            class="remote-path-place"
            :class="{ 'remote-path-place--active': currentPath === item.path }"
            :disabled="loading"
            @click="loadDirectory(item.path)"
          >
            <span>{{ item.icon }}</span>
            <strong>{{ item.label }}</strong>
          </button>
        </aside>

        <section class="remote-path-browser">
          <div class="remote-path-navigation">
            <div class="remote-path-toolbar">
              <div class="remote-path-breadcrumbs">
                <button
                  v-for="crumb in breadcrumbs"
                  :key="crumb.path"
                  type="button"
                  :disabled="loading"
                  @click="loadDirectory(crumb.path)"
                >
                  {{ crumb.label }}
                </button>
              </div>
            </div>

            <div class="remote-path-address-row">
              <button type="button" class="remote-path-nav-icon" title="上级" aria-label="上级" :disabled="loading || currentPath === '/'" @click="openParentPath">↑</button>
              <input v-model.trim="pathInput" class="remote-path-address" placeholder="输入服务器路径，例如 /etc/nginx" @keyup.enter="loadDirectory(pathInput)" />
              <button type="button" class="remote-path-nav-btn" title="转到" aria-label="转到" :disabled="loading" @click="loadDirectory(pathInput)">↵</button>
              <button type="button" class="remote-path-nav-icon" title="刷新" aria-label="刷新" :disabled="loading" @click="loadDirectory(currentPath)">⟳</button>
            </div>
          </div>

          <div v-if="errorMessage" class="remote-path-error">{{ errorMessage }}</div>

          <div class="remote-path-list" :class="{ 'remote-path-list--loading': loading }">
            <div class="remote-path-list-head">
              <span>名称</span>
              <span>类型</span>
              <span>大小</span>
            </div>
            <button
              v-for="item in sortedEntries"
              :key="item.path"
              type="button"
              class="remote-path-row"
              :class="{ 'remote-path-row--active': selectedPath === item.path }"
              @click="handleEntryClick(item)"
              @dblclick="openEntry(item)"
            >
              <span class="remote-path-name-cell">
                <i class="remote-path-icon">{{ item.type === 'd' ? '📁' : '📄' }}</i>
                <span class="remote-path-name">{{ item.name }}</span>
              </span>
              <span class="remote-path-kind">{{ item.type === 'd' ? '文件夹' : '文件' }}</span>
              <span class="remote-path-size">{{ item.type === 'd' ? '-' : formatSize(item.size) }}</span>
            </button>
            <div v-if="!loading && !sortedEntries.length" class="remote-path-empty">当前目录为空。</div>
          </div>
        </section>
      </div>

      <template #footer>
        <div class="remote-path-footer">
          <span>{{ selectedPath || currentPath }}</span>
          <div>
            <el-button plain @click="dialogVisible = false">取消</el-button>
            <el-button v-if="props.selectType !== 'file'" plain @click="chooseCurrentDirectory">选择当前目录</el-button>
            <el-button type="primary" :disabled="!canConfirmSelected" @click="confirmSelection">确定</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
  import { ArrowDown } from '@element-plus/icons-vue'
  import { computed, ref, watch } from 'vue'

  const props = defineProps({
    modelValue: { type: String, default: '' },
    sessionId: { type: String, default: '' },
    connected: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    selectType: { type: String, default: 'both' },
    placeholder: { type: String, default: '输入服务器路径' }
  })

  const emit = defineEmits(['update:modelValue', 'change', 'confirm'])

  const dialogVisible = ref(false)
  const loading = ref(false)
  const currentPath = ref('/')
  const pathInput = ref('/')
  const entries = ref([])
  const rootEntries = ref([])
  const selectedPath = ref('')
  const errorMessage = ref('')

  const sortedEntries = computed(() => entries.value.slice().sort((a, b) => {
    if (a.type === 'd' && b.type !== 'd') return -1
    if (a.type !== 'd' && b.type === 'd') return 1
    return String(a.name || '').localeCompare(String(b.name || ''))
  }))
  const sidebarLocations = computed(() => {
    const rootFolders = rootEntries.value
      .filter(item => item.type === 'd' && item.path !== '/')
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map(item => ({ label: item.name, path: item.path, icon: '▣' }))
    return [{ label: '根目录', path: '/', icon: '⌂' }, ...rootFolders]
  })
  const selectedEntry = computed(() => entries.value.find(item => item.path === selectedPath.value) || null)
  const breadcrumbs = computed(() => {
    const normalized = normalizeRemotePath(currentPath.value || '/')
    if (normalized === '/') return [{ label: '根目录', path: '/' }]
    const parts = normalized.split('/').filter(Boolean)
    const result = [{ label: '根目录', path: '/' }]
    parts.reduce((path, part) => {
      const nextPath = normalizeRemotePath(`${path}/${part}`)
      result.push({ label: part, path: nextPath })
      return nextPath
    }, '')
    return result
  })
  const canConfirmSelected = computed(() => {
    if (!selectedPath.value) return false
    if (props.selectType === 'file') return selectedEntry.value?.type !== 'd'
    if (props.selectType === 'directory') return selectedEntry.value?.type === 'd' || selectedPath.value === currentPath.value
    return true
  })

  watch(() => props.modelValue, value => {
    if (!dialogVisible.value) selectedPath.value = String(value || '').trim()
  })

  function handleInput(event) {
    const value = event?.target?.value || ''
    emit('update:modelValue', value)
    emit('change', value)
  }

  async function openDialog() {
    if (props.disabled || !props.connected) return
    dialogVisible.value = true
    selectedPath.value = String(props.modelValue || '').trim()
    const initialDirectory = buildInitialDirectory(props.modelValue)
    await loadDirectory(initialDirectory)
    if (initialDirectory !== '/') await loadRootLocations()
  }

  function normalizeRemotePath(value = '') {
    const text = String(value || '').trim().replace(/\\+/g, '/')
    if (!text) return '/'
    const prefixed = text.startsWith('/') ? text : `/${text}`
    return prefixed.replace(/\/+/g, '/') || '/'
  }

  function getParentPath(value = '') {
    const normalized = normalizeRemotePath(value).replace(/\/+$/, '') || '/'
    if (normalized === '/') return '/'
    const parent = normalized.split('/').slice(0, -1).join('/')
    return parent || '/'
  }

  function buildInitialDirectory(value = '') {
    const normalized = normalizeRemotePath(value || '/')
    if (normalized === '/') return '/'
    if (/\.[A-Za-z0-9_-]+$/.test(normalized.split('/').pop() || '')) return getParentPath(normalized)
    return normalized
  }

  async function loadDirectory(targetPath = '/') {
    if (!props.connected || !props.sessionId) return
    const normalized = normalizeRemotePath(targetPath)
    loading.value = true
    errorMessage.value = ''
    try {
      const list = await window.whSSH.listFiles({ sessionId: props.sessionId, path: normalized })
      currentPath.value = normalized
      pathInput.value = normalized
      entries.value = normalizeEntries(list, normalized)
      if (normalized === '/') rootEntries.value = entries.value
      syncSelectionWithDirectory(normalized)
    } catch (error) {
      const parent = getParentPath(normalized)
      if (parent !== normalized) {
        try {
          const list = await window.whSSH.listFiles({ sessionId: props.sessionId, path: parent })
          currentPath.value = parent
          pathInput.value = parent
          entries.value = normalizeEntries(list, parent)
          syncSelectionWithDirectory(parent)
          errorMessage.value = `无法打开 ${normalized}，已显示上级目录。`
          return
        } catch (parentError) {
          errorMessage.value = parentError.message || error.message || '读取目录失败'
          entries.value = []
          return
        }
      }
      errorMessage.value = error.message || '读取目录失败'
      entries.value = []
    } finally {
      loading.value = false
    }
  }

  function openParentPath() {
    loadDirectory(getParentPath(currentPath.value))
  }

  async function loadRootLocations() {
    if (!props.connected || !props.sessionId) return
    try {
      const list = await window.whSSH.listFiles({ sessionId: props.sessionId, path: '/' })
      rootEntries.value = normalizeEntries(list, '/')
    } catch (error) {
      rootEntries.value = []
    }
  }

  function selectEntry(item) {
    selectedPath.value = item?.path || ''
  }

  function buildChildPath(directory, name) {
    const base = normalizeRemotePath(directory || '/')
    const fileName = String(name || '').replace(/^\/+/, '')
    if (!fileName) return base
    return normalizeRemotePath(base === '/' ? `/${fileName}` : `${base}/${fileName}`)
  }

  function normalizeEntries(result, directory) {
    const list = Array.isArray(result) ? result : (Array.isArray(result?.items) ? result.items : [])
    return list.map(item => {
      const name = String(item?.name || '').trim()
      const itemPath = normalizeRemotePath(item?.path || '')
      const path = (!item?.path || itemPath === normalizeRemotePath(directory)) ? buildChildPath(directory, name) : itemPath
      return {
        ...item,
        name,
        type: item?.type === 'd' ? 'd' : '-',
        size: Number(item?.size || 0),
        path
      }
    }).filter(item => item.name && item.path)
  }

  function syncSelectionWithDirectory(directory) {
    const selected = normalizeRemotePath(selectedPath.value || '')
    if (!selectedPath.value || selected === directory || getParentPath(selected) === directory) return
    selectedPath.value = props.selectType === 'directory' ? directory : ''
  }

  function handleEntryClick(item) {
    if (!item?.path) return
    selectEntry(item)
  }

  function openEntry(item) {
    if (!item?.path) return
    if (item.type === 'd') {
      selectedPath.value = item.path
      loadDirectory(item.path)
      return
    }
    if (props.selectType === 'directory') return
    selectedPath.value = item.path
    confirmSelection()
  }

  function chooseCurrentDirectory() {
    selectedPath.value = currentPath.value || '/'
    confirmSelection()
  }

  function confirmSelection() {
    if (!canConfirmSelected.value && selectedPath.value !== currentPath.value) return
    const value = selectedPath.value || currentPath.value || '/'
    emit('update:modelValue', value)
    emit('change', value)
    emit('confirm', value)
    dialogVisible.value = false
  }

  function formatSize(value = 0) {
    const size = Number(value || 0)
    if (!Number.isFinite(size) || size <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let index = 0
    let next = size
    while (next >= 1024 && index < units.length - 1) {
      next /= 1024
      index += 1
    }
    return `${next >= 10 || index === 0 ? next.toFixed(0) : next.toFixed(1)} ${units[index]}`
  }
</script>

<style scoped>
  .remote-path-picker {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 32px;
    align-items: stretch;
    width: 100%;
    min-height: 30px;
    overflow: hidden;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #ffffff;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  }

  .remote-path-picker:focus-within {
    border-color: #111111;
    box-shadow: none;
  }

  .remote-path-picker-input {
    min-width: 0;
    width: 100%;
    height: 100%;
    min-height: 30px;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: #111827;
    padding: 5px 8px;
    outline: none;
  }

  .remote-path-picker-btn {
    width: 32px;
    height: 100%;
    min-height: 30px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #334155;
    font-size: 14px;
    line-height: 1;
  }

  .remote-path-picker-btn .el-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .remote-path-picker-btn:hover:not(:disabled) {
    background: #f5f5f5;
    color: #111111;
  }

  .remote-path-picker:has(.remote-path-picker-input:disabled),
  .remote-path-picker-btn:disabled {
    background: #f1f5f9;
  }

  :deep(.remote-path-dialog.el-dialog) {
    height: 76vh;
    min-height: 520px;
    max-height: 820px;
    display: flex;
    flex-direction: column;
    margin-top: 8vh !important;
    margin-bottom: 0;
  }

  :deep(.remote-path-dialog .el-dialog__body) {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  :deep(.remote-path-dialog .el-dialog__footer) {
    flex: 0 0 auto;
  }

  .remote-path-dialog-body {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    border: 1px solid #dbe3ef;
    border-radius: 6px;
    overflow: hidden;
    background: #ffffff;
  }

  .remote-path-places {
    display: grid;
    align-content: start;
    gap: 2px;
    padding: 10px 8px;
    min-height: 0;
    overflow-y: auto;
    border-right: 1px solid #e5e7eb;
    background: #f8fafc;
  }

  .remote-path-place {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: #1f2937;
    text-align: left;
    cursor: pointer;
  }

  .remote-path-place:hover:not(:disabled),
  .remote-path-place--active {
    border-color: #bfdbfe;
    background: #eaf3ff;
  }

  .remote-path-place strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .remote-path-browser {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .remote-path-navigation {
    display: grid;
    gap: 8px;
    padding: 4px 0 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    box-shadow: none;
  }

  .remote-path-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
  }

  .remote-path-breadcrumbs {
    min-width: 0;
    display: flex;
    align-items: center;
    height: 26px;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .remote-path-breadcrumbs button {
    position: relative;
    flex: 0 0 auto;
    max-width: 150px;
    height: 26px;
    padding: 0 20px 0 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #111827;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .remote-path-breadcrumbs button:not(:last-child)::after {
    content: '/';
    position: absolute;
    right: 7px;
    color: #c0c4cc;
    font-weight: 400;
  }

  .remote-path-breadcrumbs button:hover:not(:disabled) {
    background: transparent;
    color: #409eff;
  }

  .remote-path-address-row {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 28px 28px;
    align-items: center;
    gap: 6px;
  }

  .remote-path-address,
  .remote-path-nav-btn,
  .remote-path-nav-icon {
    box-sizing: border-box;
    height: 28px;
    min-height: 28px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: #ffffff;
    color: #111827;
    padding: 4px 8px;
    line-height: 18px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .remote-path-nav-btn,
  .remote-path-nav-icon {
    background: #ffffff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .remote-path-nav-icon {
    width: 28px;
    padding: 0;
  }

  .remote-path-nav-btn {
    width: 28px;
    padding: 0;
  }

  .remote-path-nav-btn:hover:not(:disabled),
  .remote-path-nav-icon:hover:not(:disabled) {
    border-color: #93c5fd;
    background: #eff6ff;
    color: #1d4ed8;
  }

  .remote-path-list {
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    overflow: auto;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    background: #ffffff;
  }

  .remote-path-list-head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 96px 96px;
    min-height: 30px;
    border-bottom: 1px solid #dbe3ef;
    background: #f8fafc;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
  }

  .remote-path-list-head span {
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-right: 1px solid #e5e7eb;
  }

  .remote-path-list--loading {
    opacity: 0.7;
  }

  .remote-path-row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 96px 96px;
    align-items: center;
    min-height: 34px;
    padding: 0;
    border-bottom: 1px solid #f1f5f9;
    background: #ffffff;
    color: #111827;
    text-align: left;
  }

  .remote-path-row:hover,
  .remote-path-row--active {
    background: #eaf3ff;
  }

  .remote-path-row > span {
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-right: 1px solid #f1f5f9;
  }

  .remote-path-name-cell {
    gap: 8px;
  }

  .remote-path-icon {
    flex: 0 0 auto;
    font-size: 15px;
    font-style: normal;
  }

  .remote-path-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
  }

  .remote-path-kind,
  .remote-path-size,
  .remote-path-empty,
  .remote-path-error,
  .remote-path-footer span {
    color: #64748b;
    font-size: 12px;
  }

  .remote-path-error {
    padding: 8px 10px;
    border: 1px solid #fde68a;
    border-radius: 4px;
    background: #fffbeb;
    color: #92400e;
  }

  .remote-path-empty {
    padding: 18px;
    text-align: center;
  }

  .remote-path-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 2px;
  }

  .remote-path-footer span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
