<template>
  <el-card shadow="never" class="xftp-pane" :class="{ 'drop-active': localDropActive }"
    @mousedown="handleLocalPaneMouseDown"
    @contextmenu.prevent="showLocalPanelContextMenu">
    <template #header>
      <div class="pane-head pane-head-stack">
          <div class="pane-head-top">
            <div>
              <strong>本地文件</strong>
            </div>
            <div class="pane-head-actions">
              <el-button plain size="small" title="全局搜索" @click.stop="openLocalGlobalSearch">全局搜索</el-button>
              <el-button size="small" @click="openLocalInExplorer">打开资源管理器</el-button>
            </div>
        </div>
        <div class="pane-toolbar">
          <input v-model.trim="localPathInputModel" class="pane-path-input" placeholder="输入本地路径后回车跳转"
            @keydown.enter.prevent="navigateLocalPath" @blur="resetLocalPathInput" />
          <div class="pane-search-wrap">
            <input v-model.trim="localSearchKeywordModel" class="pane-search-input" placeholder="搜索"
              @input="handleLocalSearchInput" @mousedown.stop />
            <button v-if="localSearchKeyword" class="pane-search-clear-icon" title="清空搜索" @click.stop="clearLocalSearch">
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </div>
        <div class="local-breadcrumb-bar">
          <template v-for="(item, index) in localBreadcrumbs" :key="`${item.path}-${index}`">
            <button class="local-breadcrumb-button" :class="{ active: isLocalBreadcrumbActive(item.path) }" :title="item.label" @click="openLocalShortcut(item.path)">
              <span class="local-breadcrumb-text">{{ item.label }}</span>
            </button>
            <span v-if="index < localBreadcrumbs.length - 1" class="local-breadcrumb-separator">›</span>
          </template>
          <span v-if="localSearchActive" class="local-breadcrumb-status">搜索：{{ localSearchKeyword }}</span>
        </div>
      </div>
    </template>
    <div class="local-explorer-layout" :class="{ 'shortcuts-collapsed': localShortcutsCollapsed }">
      <aside class="local-shortcuts-pane" :class="{ collapsed: localShortcutsCollapsed }">
        <div class="local-shortcuts-group">
          <div class="local-shortcuts-title-row">
            <span class="local-shortcuts-title">快捷访问</span>
            <button class="shortcut-pane-toggle" :title="localShortcutsCollapsed ? '展开快捷访问' : '折叠快捷访问'" @click.stop="toggleLocalShortcutsCollapsed">
              <el-icon class="shortcut-pane-toggle-icon">
                <Expand v-if="localShortcutsCollapsed" />
                <Fold v-else />
              </el-icon>
            </button>
          </div>
          <button class="local-shortcut-button" :class="{ active: localPath === '__pc__' }" title="此电脑" @click="loadLocalRoots">
            <span class="local-shortcut-icon computer"></span>
            <span>此电脑</span>
          </button>
          <button v-for="item in localPinnedRoots" :key="item.path" class="local-shortcut-button" :class="{ active: isLocalShortcutActive(item.path) }" :title="item.label" @click="openLocalShortcut(item.path)">
            <span class="local-shortcut-icon folder"></span>
            <span>{{ item.label }}</span>
          </button>
        </div>
        <div v-if="localDriveRoots.length" class="local-shortcuts-group">
          <span class="local-shortcuts-title">磁盘</span>
          <button v-for="item in localDriveRoots" :key="item.path" class="local-shortcut-button" :class="{ active: isLocalShortcutActive(item.path) }" :title="item.label" @click="openLocalShortcut(item.path)">
            <span class="local-shortcut-icon drive"></span>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </aside>
      <div class="local-table-wrapper"
        @dragover.prevent="onLocalPanelDragOver" @dragenter.prevent="onLocalPanelDragEnter"
        @dragleave.prevent="onLocalPanelDragLeave" @drop.prevent="onLocalPanelDrop">
        <div v-if="localPath === '__pc__'" class="local-root-drive-view">
          <button v-for="item in localDriveRoots" :key="item.path" type="button" class="local-root-drive-card" :class="{ active: selectedLocalDrivePath === item.path }" :title="item.path" @click="selectLocalDrive(item)" @dblclick="openLocalDrive(item)" @contextmenu.prevent="showLocalDriveMenu(item, $event)">
            <span class="local-root-drive-icon" :data-drive-letter="getDriveLetter(item)"></span>
            <span class="local-root-drive-content">
              <strong>{{ item.label }}</strong>
              <span v-if="hasDriveSize(item)" class="local-root-drive-meter">
                <span :style="getDriveUsedStyle(item)"></span>
              </span>
              <small v-if="hasDriveSize(item)">{{ formatSize(item.freeSize) }} 可用，共 {{ formatSize(item.totalSize) }}</small>
              <small v-else>{{ item.path }}</small>
            </span>
          </button>
        </div>
        <el-table v-else :ref="setLocalTableRef" border :data="localTableFiles" height="100%" row-key="path" class="file-grid-table"
          :row-class-name="localRowClassName" @row-click="handleLocalRowClick"
          @current-change="emitSelectedLocal" @row-dblclick="openLocalFile"
          @row-contextmenu="showLocalContextMenu">
          <el-table-column label="名称" min-width="220" label-class-name="file-col-header">
            <template #default="{ row }">
              <div class="file-cell-drag" draggable="true" @dragstart="onLocalDragStart(row, $event)"
                @dragend="onDragEnd" @dragenter.prevent="onLocalRowDragEnter(row, $event)" @dragleave.prevent="onLocalRowDragLeave(row, $event)" @dragover.prevent="onLocalRowDragOver(row, $event)"
                @drop.prevent.stop="onLocalRowDrop(row, $event)">
                <span class="file-cell-name">
                  <img v-if="row.icon && row.type !== 'd'" :src="row.icon" class="file-icon local-icon" />
                  <span v-else-if="row.localRootKind === 'drive'" class="file-icon local-drive-root-icon" :data-drive-letter="row.driveLetter"></span>
                  <span v-else-if="row.type === 'd' && !row.isParent" class="file-icon solid-folder-icon"></span>
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
            <template #default="{ row }">{{ formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column label="修改时间" width="170" label-class-name="file-col-header" class-name="file-meta-col">
            <template #default="{ row }">{{ formatTime(row.modifyTime) }}</template>
          </el-table-column>
          <el-table-column v-if="localSearchActive" label="所在路径" min-width="240">
            <template #default="{ row }">{{ getLocalItemDirectory(row) }}</template>
          </el-table-column>
        </el-table>
        <div v-if="localDropActive" class="file-drop-overlay" aria-hidden="true"
          @dragover.prevent.stop="onLocalPanelDragOver" @dragenter.prevent.stop="onLocalPanelDragEnter"
          @dragleave.prevent.stop="onLocalPanelDragLeave" @drop.prevent.stop="onLocalPanelDrop">
          <div class="file-drop-overlay-card">
            <span class="file-drop-overlay-icon">↓</span>
            <strong>将文件拖放到此处</strong>
          </div>
        </div>
        <div v-if="fileSearchState?.localLoading" class="file-search-overlay">
          <div class="file-search-overlay-card">
            <span class="file-search-spinner"></span>
            <strong>正在执行搜索...</strong>
            <small>{{ fileSearchState.localKeyword }} · {{ fileSearchState.localRootPath }}</small>
            <button type="button" @click.stop="cancelLocalSearch">取消搜索</button>
          </div>
        </div>
      </div>
    </div>
   </el-card>
   <el-drawer :model-value="localGlobalSearch.open" title="本地全局搜索" direction="rtl" size="420px" class="file-global-search-drawer"
      @update:model-value="setLocalGlobalSearchOpen">
      <div class="file-global-search-body">
        <div class="file-global-search-controls">
          <el-input class="file-global-search-input" :model-value="localGlobalSearch.keyword" clearable placeholder="输入文件或文件夹名称" @input="scheduleGlobalSearch('local', $event)" @clear="clearGlobalSearch('local')">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button class="file-global-search-button" :loading="localGlobalSearch.loading" @click="runGlobalSearch('local')">搜索</el-button>
        </div>
       <div class="file-global-search-meta">
         <span v-if="localGlobalSearch.rootPath">当前目录：{{ localGlobalSearch.rootPath }}</span>
         <span v-if="localGlobalSearch.loading">正在检索...</span>
       </div>
       <div v-if="localGlobalSearch.loading" class="file-global-search-loading"><span class="file-global-search-spinner"></span><span>正在搜索...</span></div>
       <div v-else-if="localGlobalSearch.searched && !localGlobalSearch.items.length" class="file-global-search-empty">暂无匹配结果</div>
       <div v-else-if="!localGlobalSearch.searched" class="file-global-search-empty">输入名称开始检索</div>
       <button v-for="row in localGlobalSearch.items" :key="row.path" type="button" class="file-global-search-result" @click="openLocalGlobalSearchResultAndClose(row)">
         <span class="file-global-search-result-icon"><el-icon :class="getFileIconClass(row)"><Folder v-if="row.type === 'd'" /><Document v-else /></el-icon></span>
         <span class="file-global-search-result-content">
           <strong>{{ row.name }}</strong>
           <small>{{ row.path }}</small>
         </span>
       </button>
       <div v-if="localGlobalSearch.limited" class="file-global-search-tip">结果较多，仅显示部分结果</div>
     </div>
   </el-drawer>
</template>

<script setup>
  import { computed, ref } from 'vue'
   import { Close, Document, Expand, Files, Fold, Folder, Headset, Picture, Search, Tickets, VideoCamera } from '@element-plus/icons-vue'

  const props = defineProps([
    'localDropActive',
    'handleLocalPaneMouseDown',
    'onLocalPanelDragOver',
    'onLocalPanelDragEnter',
    'onLocalPanelDragLeave',
    'onLocalPanelDrop',
    'showLocalPanelContextMenu',
    'openLocalInExplorer',
    'openLocalGlobalSearch',
    'setLocalGlobalSearchOpen',
    'localPathInput',
    'navigateLocalPath',
    'resetLocalPathInput',
    'localSearchKeyword',
    'handleLocalSearchInput',
    'clearLocalSearch',
    'localSearchActive',
    'localBreadcrumbs',
    'isLocalBreadcrumbActive',
    'openLocalShortcut',
    'localShortcutsCollapsed',
    'localPath',
    'loadLocalRoots',
    'localPinnedRoots',
    'isLocalShortcutActive',
    'localDriveRoots',
    'setLocalTableRef',
    'localTableFiles',
    'fileSearchState',
    'cancelLocalSearch',
    'localRowClassName',
    'handleLocalRowClick',
    'openLocalFile',
    'showLocalContextMenu',
    'showLocalDriveContextMenu',
    'onLocalDragStart',
    'onDragEnd',
    'onLocalRowDragEnter',
    'onLocalRowDragLeave',
    'onLocalRowDragOver',
    'onLocalRowDrop',
    'getFileIconClass',
    'isVideoFile',
    'isImageFile',
    'isAudioFile',
    'isArchiveFile',
    'isCodeFile',
    'formatSize',
    'formatTime',
    'getLocalItemDirectory',
    'localGlobalSearch',
    'scheduleGlobalSearch',
    'runGlobalSearch',
    'clearGlobalSearch',
    'openLocalGlobalSearchResult'
  ])

  const emit = defineEmits([
    'update:localPathInput',
    'update:localSearchKeyword',
    'update:localShortcutsCollapsed',
    'update:selectedLocal'
  ])

  const localPathInputModel = computed({
    get: () => props.localPathInput,
    set: value => emit('update:localPathInput', value)
  })

  const localSearchKeywordModel = computed({
    get: () => props.localSearchKeyword,
    set: value => emit('update:localSearchKeyword', value)
  })

  const selectedLocalDrivePath = ref('')

  function toggleLocalShortcutsCollapsed() {
    emit('update:localShortcutsCollapsed', !props.localShortcutsCollapsed)
  }

  function emitSelectedLocal(row) {
    emit('update:selectedLocal', row || null)
  }

  function getDriveLetter(item) {
    return String(item?.path || item?.label || '').match(/[A-Za-z]/)?.[0]?.toUpperCase() || ''
  }

  function hasDriveSize(item) {
    return Number(item?.totalSize || 0) > 0
  }

  function getDriveUsedStyle(item) {
    const ratio = Number(item?.usedRatio || 0)
    const percent = Math.min(Math.max(ratio * 100, 0), 100)
    return { width: `${percent}%` }
  }

  function selectLocalDrive(item) {
    selectedLocalDrivePath.value = item?.path || ''
  }

  function openLocalDrive(item) {
    selectLocalDrive(item)
    if (item?.path) props.openLocalShortcut(item.path)
  }

  function showLocalDriveMenu(item, event) {
    selectLocalDrive(item)
    props.showLocalDriveContextMenu?.(item, event)
  }

  function openLocalGlobalSearchResultAndClose(row) {
    props.openLocalGlobalSearchResult?.(row)
    props.setLocalGlobalSearchOpen?.(false)
  }

</script>
