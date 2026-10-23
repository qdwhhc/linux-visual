<template>
  <aside class="pm2-sidebar">
    <div class="pm2-sidebar-head">
      <div class="pm2-sidebar-title">
        <strong>PM2 应用</strong>
        <span>{{ total }} 个应用</span>
      </div>
      <el-button plain size="small" @click="$emit('createProcess')">新增应用</el-button>
    </div>
    <div class="pm2-sidebar-toolbar">
      <input :value="searchKeyword" class="pm2-sidebar-search" placeholder="搜索应用名、脚本、目录" @input="$emit('update:searchKeyword', $event.target.value)" />
      <el-select :model-value="statusFilter" class="pm2-sidebar-filter" @change="$emit('update:statusFilter', $event)">
        <el-option label="全部状态" value="all" />
        <el-option label="在线" value="online" />
        <el-option label="异常" value="errored" />
        <el-option label="已停止" value="stopped" />
      </el-select>
    </div>
    <div class="pm2-sidebar-groups">
      <section v-for="group in groups" :key="group.key" class="pm2-group">
        <button class="pm2-group-button" :class="`pm2-group-button--${group.key}`" type="button" @click="toggleGroup(group.key)">
          <span class="pm2-status-icon" :class="`pm2-status-icon--${group.key}`"></span>
          <span class="pm2-group-name">{{ group.label }}</span>
          <el-icon class="pm2-group-caret"><ArrowUp v-if="isGroupExpanded(group.key)" /><ArrowDown v-else /></el-icon>
        </button>
        <div v-if="isGroupExpanded(group.key)" class="pm2-group-children">
          <button
            v-for="item in group.items"
            :key="item.id"
            class="pm2-app-item"
            :class="[`pm2-app-item--${item.status}`, { active: item.id === activeId }]"
            @click="$emit('selectProcess', item.id)"
            @contextmenu.prevent="showProcessContextMenu(item, $event)"
          >
            <span class="pm2-status-icon" :class="`pm2-status-icon--${item.status}`"></span>
            <span class="pm2-app-main">
              <span class="pm2-app-name">{{ item.name }}</span>
              <span class="pm2-app-path">{{ item.cwd || item.script || '未读取到工作目录' }}</span>
            </span>
            <span class="pm2-app-metrics">
              <em>{{ formatProcessMode(item) }}</em>
              <em>CPU {{ item.cpu || formatCpu(item.cpuValue) }}</em>
              <em>{{ item.memory || formatMemory(item.memoryBytes) }}</em>
            </span>
          </button>
          <div v-if="!group.items.length" class="pm2-group-empty">当前筛选下没有应用</div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup>
  import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
  import { onBeforeUnmount, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'

  const props = defineProps({
    groups: {
      type: Array,
      default: () => []
    },
    activeId: {
      type: String,
      default: ''
    },
    searchKeyword: {
      type: String,
      default: ''
    },
    statusFilter: {
      type: String,
      default: 'all'
    },
    total: {
      type: Number,
      default: 0
    }
  })

  const emit = defineEmits(['update:searchKeyword', 'update:statusFilter', 'selectProcess', 'processAction', 'createProcess'])

  const expandedGroups = ref({})

  function isGroupExpanded(key = '') {
    return expandedGroups.value[String(key || '')] !== false
  }

  function toggleGroup(key = '') {
    const groupKey = String(key || '').trim()
    if (!groupKey) return
    expandedGroups.value = {
      ...expandedGroups.value,
      [groupKey]: !isGroupExpanded(groupKey)
    }
  }

  watch(() => (props.groups || []).map(item => String(item?.key || '')).filter(Boolean), keys => {
    const nextState = { ...expandedGroups.value }
    for (const key of keys) {
      if (!(key in nextState)) nextState[key] = key === 'online'
    }
    expandedGroups.value = nextState
  }, { immediate: true })

  function formatCpu(value) {
    const number = Number(value || 0)
    if (!Number.isFinite(number) || number <= 0) return '0%'
    return `${number >= 10 ? number.toFixed(0) : number.toFixed(1).replace(/\.0$/, '')}%`
  }

  function formatMemory(bytes) {
    const value = Number(bytes || 0)
    if (!Number.isFinite(value) || value <= 0) return '0MB'
    const mb = value / 1024 / 1024
    if (mb >= 1024) {
      const gb = mb / 1024
      return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1).replace(/\.0$/, '')}GB`
    }
    return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1).replace(/\.0$/, '')}MB`
  }

  function formatProcessMode(item) {
    const mode = String(item?.execMode || '').trim() || 'fork'
    const instances = String(item?.instances ?? '').trim() || '1'
    return `${mode} · ${instances}`
  }

  function getProcessContextMenuItems(item) {
    const status = String(item?.status || '').trim().toLowerCase()
    return [
      status === 'online'
        ? { key: 'stop', label: '停止', enabled: true }
        : { key: 'start', label: '启动', enabled: true },
      { key: 'restart', label: '重启', enabled: true },
      { key: 'logs', label: '日志', enabled: true },
      { type: 'separator' },
      { key: 'rename', label: '重命名', enabled: true },
      { key: 'delete', label: '删除', enabled: true }
    ]
  }

  let activeContextRequestId = ''
  let activeContextRow = null
  let stopNativeContextMenuAction = null

  async function showProcessContextMenu(item, event) {
    event.preventDefault()
    event.stopPropagation()
    activeContextRequestId = `pm2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    activeContextRow = item
    try {
      await window.whSSH.showNativeContextMenu({
        requestId: activeContextRequestId,
        items: getProcessContextMenuItems(item)
      })
    } catch (error) {
      activeContextRequestId = ''
      activeContextRow = null
      ElMessage.error(`打开 PM2 操作菜单失败：${error?.message || error}`)
    }
  }

  stopNativeContextMenuAction = window.whSSH.onNativeContextMenuAction(payload => {
    if (!payload || payload.requestId !== activeContextRequestId || !activeContextRow) return
    emit('processAction', { action: payload.key, item: activeContextRow })
    activeContextRequestId = ''
    activeContextRow = null
  })

  onBeforeUnmount(() => {
    if (stopNativeContextMenuAction) stopNativeContextMenuAction()
  })
</script>

<style scoped>
  .pm2-sidebar {
    min-height        : 0;
    height            : 100%;
    display           : grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap               : 12px;
    padding           : 14px;
    border            : 1px solid rgba(15, 23, 42, 0.08);
    border-radius     : 0;
    background        : #ffffff;
    overflow          : hidden;
  }

  .pm2-sidebar-head {
    display        : flex;
    align-items    : center;
    justify-content: space-between;
    gap            : 10px;
  }

  .pm2-sidebar-title {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .pm2-sidebar-head strong {
    color    : #111827;
    font-size: 13px;
  }

  .pm2-sidebar-title span,
  .pm2-group-empty {
    color    : #6b7280;
    font-size: 11px;
    font-style: normal;
  }

  .pm2-sidebar-head .el-button {
    --el-button-bg-color        : #ffffff;
    --el-button-border-color    : #111111;
    --el-button-text-color      : #111111;
    --el-button-hover-bg-color  : #f5f5f5;
    --el-button-hover-border-color: rgba(17, 17, 17, 0.7);
    --el-button-hover-text-color: #111111;
    --el-button-active-bg-color : #e5e5e5;
    --el-button-active-border-color: #111111;
    --el-button-active-text-color: #ffffff;
    border-radius: 4px;
    font-weight: 600;
  }

  .pm2-sidebar-toolbar {
    display: grid;
    gap    : 8px;
  }

  .pm2-sidebar-search {
    height      : 30px;
    padding     : 0 10px;
    border      : 1px solid #d1d5db;
    border-radius: 4px;
    background  : #ffffff;
    color       : #111827;
    font-size   : 12px;
    line-height : 30px;
    outline     : none;
    transition  : border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
  }

  .pm2-sidebar-search:focus {
    border-color: #111111;
    background  : #ffffff;
    box-shadow  : none;
  }

  .pm2-sidebar-filter {
    width: 100%;
  }

  .pm2-sidebar-filter :deep(.el-select__wrapper) {
    min-height: 30px;
    height    : 30px;
    border-radius: 4px;
    box-shadow: 0 0 0 1px #d1d5db inset;
    transition: box-shadow 0.16s ease, background-color 0.16s ease;
  }

  .pm2-sidebar-filter :deep(.el-select__wrapper.is-focused),
  .pm2-sidebar-filter :deep(.el-select__wrapper:hover) {
    box-shadow: 0 0 0 1px #111111 inset;
  }

  .pm2-sidebar-groups {
    min-height    : 0;
    display       : flex;
    flex-direction: column;
    gap           : 12px;
    overflow-y    : auto;
    overflow-x    : hidden;
  }

  .pm2-group {
    display: grid;
    gap    : 7px;
  }

  .pm2-group-button {
    width         : 100%;
    min-width     : 0;
    display       : flex;
    align-items   : center;
    gap           : 8px;
    min-height    : 28px;
    padding       : 3px 2px 6px;
    border        : 0;
    border-bottom : 1px solid #eef2f7;
    border-radius : 0;
    background    : transparent;
    color         : #111827;
    text-align    : left;
    transition    : border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;
  }

  .pm2-group-button:hover {
    color: #111111;
  }

  .pm2-group-button em {
    min-width      : 24px;
    height         : 20px;
    display        : inline-flex;
    align-items    : center;
    justify-content: center;
    padding        : 0 7px;
    border         : 1px solid #e5e7eb;
    border-radius  : 4px;
    background     : #f8fafc;
    color          : #475569;
    font-size      : 11px;
    font-weight    : 700;
  }

  .pm2-group-caret {
    color      : #111111;
    font-size  : 14px;
    line-height: 1;
    flex       : 0 0 auto;
  }

  .pm2-group-name,
  .pm2-app-name,
  .pm2-group-button em,
  .pm2-app-path,
  .pm2-app-metrics em {
    overflow     : hidden;
    text-overflow: ellipsis;
    white-space  : nowrap;
  }

  .pm2-group-name {
    flex     : 1 1 auto;
    min-width: 0;
    color    : inherit;
    font-size: 12px;
  }

  .pm2-group-button em,
  .pm2-group-empty,
  .pm2-app-path,
  .pm2-app-metrics em {
    color     : #6b7280;
    font-size : 12px;
    font-style: normal;
  }

  .pm2-group-children {
    display   : grid;
    gap       : 7px;
    min-width : 0;
  }

  .pm2-app-item {
    width                : 100%;
    min-width            : 0;
    display              : grid;
    grid-template-columns: 8px minmax(0, 1fr);
    grid-template-areas  : "status main" "status metrics";
    align-items          : center;
    gap                  : 8px 11px;
    min-height           : 78px;
    padding              : 11px 12px 11px 10px;
    border               : 1px solid #e8edf3;
    border-radius        : 4px;
    background           : #ffffff;
    color                : #111827;
    text-align           : left;
    position             : relative;
    overflow             : hidden;
    transition           : border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  }

  .pm2-app-item:hover {
    border-color: #111111;
    box-shadow  : none;
    transform   : none;
  }

  .pm2-app-item--online {
    border-color: #bbf7d0;
    background  : linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
  }

  .pm2-app-item--errored {
    border-color: #fecaca;
    background  : linear-gradient(135deg, #fef2f2 0%, #ffffff 100%);
  }

  .pm2-app-item--stopped {
    border-color: #fde68a;
    background  : linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
  }

  .pm2-app-item--online:hover,
  .pm2-app-item--online.active {
    border-color: #16a34a;
    background  : #dcfce7;
  }

  .pm2-app-item--errored:hover,
  .pm2-app-item--errored.active {
    border-color: #dc2626;
    background  : #fee2e2;
  }

  .pm2-app-item--stopped:hover,
  .pm2-app-item--stopped.active {
    border-color: #d97706;
    background  : #fef3c7;
  }

  .pm2-app-item.active {
    box-shadow: 0 0 0 1px currentColor;
    color     : #111111;
  }

  .pm2-status-icon {
    width        : 10px;
    height       : 10px;
    border-radius: 50%;
    flex         : 0 0 auto;
    box-shadow   : inset 0 0 0 1px rgba(15, 23, 42, 0.08);
  }

  .pm2-app-item > .pm2-status-icon {
    grid-area : status;
    align-self: center;
    width     : 8px;
    height    : 8px;
    margin-left: 1px;
  }

  .pm2-status-icon--online {
    background: #16a34a;
  }

  .pm2-status-icon--errored {
    background: #dc2626;
  }

  .pm2-status-icon--stopped {
    background: #d97706;
  }

  .pm2-app-main {
    grid-area: main;
    min-width: 0;
    display  : grid;
    gap      : 5px;
    overflow : hidden;
  }

  .pm2-app-name {
    color    : inherit;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.25;
    display  : block;
    max-width: 100%;
    overflow : hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm2-app-path {
    display: block;
    max-width: 100%;
    font-size: 11px;
    line-height: 1.3;
    color: #64748b;
  }

  .pm2-app-metrics {
    grid-area: metrics;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    gap: 6px;
  }

  .pm2-app-metrics em {
    max-width: 100%;
    min-width: 0;
    padding: 3px 6px;
    border: 1px solid #e8edf3;
    border-radius: 4px;
    background: #ffffff;
    color: #475569;
    font-size: 11px;
    line-height: 1.2;
    text-align: center;
  }

  .pm2-app-item.active .pm2-app-metrics em {
    border-color: #cbd5e1;
    background: #ffffff;
    color: #111111;
  }
</style>
