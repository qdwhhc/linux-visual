<template>
  <el-card shadow="never" class="xftp-pane" :class="{ 'drop-active': remoteDropActive }"
    @mousedown="handleRemotePaneMouseDown"
    @contextmenu.prevent="showRemotePanelContextMenu">
    <template #header>
      <div class="pane-head pane-head-stack">
          <div class="pane-head-top">
            <div>
              <strong>服务器文件</strong>
            </div>
            <div class="pane-head-actions">
              <el-button plain size="small" title="全局搜索" @click.stop="openRemoteGlobalSearch">全局搜索</el-button>
            </div>
          </div>
        <div class="pane-toolbar">
          <input v-model.trim="remotePathInputModel" class="pane-path-input" placeholder="输入服务器路径后回车跳转"
            @keydown.enter.prevent="navigateRemotePath" @blur="resetRemotePathInput" />
          <div class="pane-search-wrap">
            <input v-model.trim="remoteSearchKeywordModel" class="pane-search-input" placeholder="搜索"
              @input="handleRemoteSearchInput" @mousedown.stop />
            <button v-if="remoteSearchKeyword" class="pane-search-clear-icon" title="清空搜索" @click.stop="clearRemoteSearch">
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </div>
        <div class="local-breadcrumb-bar">
          <template v-for="(item, index) in remoteBreadcrumbs" :key="`${item.path}-${index}`">
            <button class="local-breadcrumb-button" :class="{ active: isRemoteBreadcrumbActive(item.path) }" :title="item.label" @click="openRemoteShortcut(item.path)">
              <span class="local-breadcrumb-text">{{ item.label }}</span>
            </button>
            <span v-if="index < remoteBreadcrumbs.length - 1" class="local-breadcrumb-separator">›</span>
          </template>
          <span v-if="remoteSearchActive" class="local-breadcrumb-status">搜索：{{ remoteSearchKeyword }}</span>
        </div>
      </div>
    </template>
    <div class="local-explorer-layout remote-explorer-layout" :class="{ 'shortcuts-collapsed': remoteShortcutsCollapsed }">
      <aside v-if="connected" class="local-shortcuts-pane remote-shortcuts-pane" :class="{ collapsed: remoteShortcutsCollapsed }">
        <div class="local-shortcuts-group">
          <div class="local-shortcuts-title-row">
            <span class="local-shortcuts-title">快捷访问</span>
            <button class="shortcut-pane-toggle" :title="remoteShortcutsCollapsed ? '展开快捷访问' : '折叠快捷访问'" @click.stop="toggleRemoteShortcutsCollapsed">
              <el-icon class="shortcut-pane-toggle-icon">
                <Expand v-if="remoteShortcutsCollapsed" />
                <Fold v-else />
              </el-icon>
            </button>
          </div>
          <button v-for="item in remotePinnedRoots" :key="item.path" class="local-shortcut-button" :class="getRemoteShortcutButtonClass(item)" :title="item.label" draggable="true" @click="openRemoteShortcut(item.path)" @contextmenu.prevent="showRemoteShortcutContextMenu(item, $event)" @dragstart="onRemoteShortcutDragStart(item, $event)" @dragover.prevent="onRemoteShortcutDragOver(item, $event)" @drop.prevent="onRemoteShortcutDrop(item, $event)" @dragend="onRemoteShortcutDragEnd">
            <span class="local-shortcut-icon" :class="item.icon || 'folder'"></span>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </aside>
      <div class="local-table-wrapper" :class="{ 'is-loading-cursor': mediaPreview.loading }"
        @dragover.prevent="onRemotePanelDragOver" @dragenter.prevent="onRemotePanelDragEnter"
        @dragleave.prevent="onRemotePanelDragLeave" @drop.prevent="onRemotePanelDrop">
        <el-table :ref="setRemoteTableRef" border :data="remoteTableFiles" height="100%" :row-key="getRemoteRowKey" class="file-grid-table"
          :row-class-name="remoteRowClassName" @row-click="handleRemoteRowClick"
          @current-change="emitSelectedRemote" @row-dblclick="openRemoteFile"
          @row-contextmenu="showRemoteContextMenu">
          <el-table-column label="名称" min-width="220" label-class-name="file-col-header">
            <template #default="{ row }">
              <div class="file-cell-drag" draggable="true" @dragstart="onRemoteDragStart(row, $event)"
                @dragend="onDragEnd" @dragenter.prevent="onRemoteRowDragEnter(row, $event)" @dragleave.prevent="onRemoteRowDragLeave(row, $event)" @dragover.prevent="onRemoteRowDragOver(row, $event)"
                @drop.prevent.stop="onRemoteRowDrop(row, $event)">
                <span class="file-cell-name">
                  <span v-if="row.type === 'd' && !row.isParent" class="file-icon solid-folder-icon"></span>
                  <el-icon v-else :class="getFileIconClass(row)">
                    <Folder v-if="row.isParent || row.type === 'd'" />
                    <VideoCamera v-else-if="isVideoFile(row.name)" />
                    <Picture v-else-if="isImageFile(row.name)" />
                    <Headset v-else-if="isAudioFile(row.name)" />
                    <Files v-else-if="isArchiveFile(row.name)" />
                    <Tickets v-else-if="isCodeFile(row.name)" />
                    <Document v-else />
                  </el-icon>
                  {{ row.name }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="大小" width="110" label-class-name="file-col-header" class-name="file-meta-col">
            <template #default="{ row }">{{ row.isParent || row.type === 'd' ? '-' : formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column label="修改时间" width="170" label-class-name="file-col-header" class-name="file-meta-col">
            <template #default="{ row }">{{ formatTime(row.modifyTime) }}</template>
          </el-table-column>
          <el-table-column v-if="remoteSearchActive" label="所在路径" min-width="240" label-class-name="file-col-header">
            <template #default="{ row }">{{ getRemoteItemDirectory(row) }}</template>
          </el-table-column>
        </el-table>
        <div v-if="remoteDropActive" class="file-drop-overlay" aria-hidden="true"
          @dragover.prevent.stop="onRemotePanelDragOver" @dragenter.prevent.stop="onRemotePanelDragEnter"
          @dragleave.prevent.stop="onRemotePanelDragLeave" @drop.prevent.stop="onRemotePanelDrop">
          <div class="file-drop-overlay-card">
            <span class="file-drop-overlay-icon">↓</span>
            <strong>将文件拖放到此处</strong>
          </div>
        </div>
        <div v-if="fileSearchState?.remoteLoading" class="file-search-overlay">
          <div class="file-search-overlay-card">
            <span class="file-search-spinner"></span>
            <strong>正在执行搜索...</strong>
            <small>{{ fileSearchState.remoteKeyword }} · {{ fileSearchState.remoteRootPath }}</small>
            <button type="button" @click.stop="cancelRemoteSearch">取消搜索</button>
          </div>
        </div>
      </div>
    </div>
   </el-card>
   <el-drawer :model-value="remoteGlobalSearch.open" title="服务器全局搜索" direction="rtl" size="420px" class="file-global-search-drawer"
      @update:model-value="setRemoteGlobalSearchOpen">
      <div class="file-global-search-body">
        <div class="file-global-search-controls">
          <el-input class="file-global-search-input" :model-value="remoteGlobalSearch.keyword" clearable placeholder="输入文件或文件夹名称" @input="scheduleGlobalSearch('remote', $event)" @clear="clearGlobalSearch('remote')">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button class="file-global-search-button" :loading="remoteGlobalSearch.loading" @click="runGlobalSearch('remote')">搜索</el-button>
        </div>
       <div class="file-global-search-meta">
         <span v-if="remoteGlobalSearch.rootPath">当前目录：{{ remoteGlobalSearch.rootPath }}</span>
         <span v-if="remoteGlobalSearch.loading">正在检索...</span>
       </div>
       <div v-if="remoteGlobalSearch.loading" class="file-global-search-loading"><span class="file-global-search-spinner"></span><span>正在搜索...</span></div>
       <div v-else-if="remoteGlobalSearch.searched && !remoteGlobalSearch.items.length" class="file-global-search-empty">暂无匹配结果</div>
       <div v-else-if="!remoteGlobalSearch.searched" class="file-global-search-empty">输入名称开始检索</div>
       <button v-for="row in remoteGlobalSearch.items" :key="row.__rowKey || row.path" type="button" class="file-global-search-result" @click="openRemoteGlobalSearchResultAndClose(row)">
         <span class="file-global-search-result-icon"><el-icon :class="getFileIconClass(row)"><Folder v-if="row.type === 'd'" /><Document v-else /></el-icon></span>
         <span class="file-global-search-result-content">
           <strong>{{ row.name }}</strong>
           <small>{{ row.path }}</small>
         </span>
       </button>
       <div v-if="remoteGlobalSearch.limited" class="file-global-search-tip">结果较多，仅显示部分结果</div>
     </div>
   </el-drawer>
</template>

<script setup>
  import { computed } from 'vue'
   import { Close, Document, Expand, Files, Fold, Folder, Headset, Picture, Search, Tickets, VideoCamera } from '@element-plus/icons-vue'

  const props = defineProps([
    'remoteDropActive',
    'handleRemotePaneMouseDown',
    'onRemotePanelDragOver',
    'onRemotePanelDragEnter',
    'onRemotePanelDragLeave',
    'onRemotePanelDrop',
    'showRemotePanelContextMenu',
    'openRemoteGlobalSearch',
    'setRemoteGlobalSearchOpen',
    'remotePathInput',
    'navigateRemotePath',
    'resetRemotePathInput',
    'remoteSearchKeyword',
    'handleRemoteSearchInput',
    'clearRemoteSearch',
    'remoteSearchActive',
    'remoteBreadcrumbs',
    'isRemoteBreadcrumbActive',
    'openRemoteShortcut',
    'remoteShortcutsCollapsed',
    'connected',
    'remotePinnedRoots',
    'getRemoteShortcutButtonClass',
    'showRemoteShortcutContextMenu',
    'onRemoteShortcutDragStart',
    'onRemoteShortcutDragOver',
    'onRemoteShortcutDrop',
    'onRemoteShortcutDragEnd',
    'mediaPreview',
    'setRemoteTableRef',
    'remoteTableFiles',
    'fileSearchState',
    'cancelRemoteSearch',
    'remoteRowClassName',
    'handleRemoteRowClick',
    'openRemoteFile',
    'showRemoteContextMenu',
    'onRemoteDragStart',
    'onDragEnd',
    'onRemoteRowDragEnter',
    'onRemoteRowDragLeave',
    'onRemoteRowDragOver',
    'onRemoteRowDrop',
    'getFileIconClass',
    'isVideoFile',
    'isImageFile',
    'isAudioFile',
    'isArchiveFile',
    'isCodeFile',
    'formatSize',
    'formatTime',
    'getRemoteItemDirectory',
    'remoteGlobalSearch',
    'scheduleGlobalSearch',
    'runGlobalSearch',
    'clearGlobalSearch',
    'openRemoteGlobalSearchResult'
  ])

  const emit = defineEmits([
    'update:remotePathInput',
    'update:remoteSearchKeyword',
    'update:remoteShortcutsCollapsed',
    'update:selectedRemote'
  ])

  const remotePathInputModel = computed({
    get: () => props.remotePathInput,
    set: value => emit('update:remotePathInput', value)
  })

  const remoteSearchKeywordModel = computed({
    get: () => props.remoteSearchKeyword,
    set: value => emit('update:remoteSearchKeyword', value)
  })

  function toggleRemoteShortcutsCollapsed() {
    emit('update:remoteShortcutsCollapsed', !props.remoteShortcutsCollapsed)
  }

  function emitSelectedRemote(row) {
    emit('update:selectedRemote', row || null)
  }

  function openRemoteGlobalSearchResultAndClose(row) {
    props.openRemoteGlobalSearchResult?.(row)
    props.setRemoteGlobalSearchOpen?.(false)
  }

  function getRemoteRowKey(row) {
    if (row?.__rowKey) return row.__rowKey
    const index = props.remoteTableFiles.indexOf(row)
    if (index >= 0) return `remote-row:${index}`
    const path = String(row?.path || '').trim()
    if (path) return path
    return [row?.scope || 'remote', row?.type || '', row?.name || '', row?.size || 0, row?.modifyTime || 0].join(':')
  }
</script>
