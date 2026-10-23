<template>
  <section class="browser-page">
    <div ref="tabsBarRef" class="browser-tabs">
      <div class="browser-tab-menu-wrap" @click.stop>
        <button class="browser-tab-menu-button" type="button" title="打开的页签" @click="tabMenuVisible = !tabMenuVisible">
          <el-icon><ArrowDown /></el-icon>
        </button>
        <div v-if="tabMenuVisible" class="browser-tab-menu">
          <button
            v-for="tab in reversedTabs"
            :key="tab.id"
            type="button"
            :class="['browser-tab-menu-item', { active: tab.id === activeTabId }]"
            :title="tab.url"
            @click="selectTabFromMenu(tab.id)"
          >
            <img class="browser-site-icon" :src="getSiteIcon(tab)" alt="" />
            <span class="browser-tab-menu-title">{{ tab.title || formatTabHost(tab.url) }}</span>
            <span
              class="browser-tab-menu-close"
              role="button"
              tabindex="0"
              title="关闭页签"
              aria-label="关闭页签"
              @click.stop="closeTab(tab.id)"
              @keydown.enter.stop.prevent="closeTab(tab.id)"
              @keydown.space.stop.prevent="closeTab(tab.id)"
            >
              <el-icon><Close /></el-icon>
            </span>
          </button>
        </div>
      </div>
      <button
        v-for="tab in visibleTabs"
        :key="tab.id"
        type="button"
        :class="['browser-tab', { active: tab.id === activeTabId }]"
        :title="tab.url"
        @click="selectTab(tab.id)"
      >
        <img class="browser-site-icon browser-tab-icon" :src="getSiteIcon(tab)" alt="" />
        <span class="browser-tab-title">{{ tab.title || formatTabHost(tab.url) }}</span>
        <span class="browser-tab-close" title="关闭页签" @click.stop="closeTab(tab.id)">
          <el-icon><Close /></el-icon>
        </span>
      </button>
      <button class="browser-tab-add" type="button" title="新建页签" @click="createTab()">
        <el-icon><Plus /></el-icon>
      </button>
    </div>

    <form class="browser-addressbar" @submit.prevent="navigateActiveTab">
      <button type="button" title="后退" :disabled="!canGoBack" @click="goFrameHistory(-1)">
        <el-icon><Back /></el-icon>
      </button>
      <button type="button" title="前进" :disabled="!canGoForward" @click="goFrameHistory(1)">
        <el-icon><Right /></el-icon>
      </button>
      <button type="button" title="刷新" :disabled="!activeTab" @click="reloadActiveTab">
        <el-icon><RefreshRight /></el-icon>
      </button>
      <button type="button" title="主页" @click="navigateTo(HOME_URL)">
        <el-icon><House /></el-icon>
      </button>
      <label class="browser-address-input">
        <el-icon><Search /></el-icon>
        <input v-model.trim="addressInput" placeholder="输入网址或搜索内容" autocomplete="off" />
      </label>
      <button type="button" :class="['browser-star-button', { active: isActiveBookmarked }]" :title="isActiveBookmarked ? '编辑书签' : '收藏当前页'" @click="openBookmarkEditor">
        <el-icon><Star /></el-icon>
      </button>
      <button type="submit" title="前往">
        <el-icon><Position /></el-icon>
      </button>
    </form>

    <div
      ref="bookmarksBarRef"
      class="browser-bookmarks"
      :class="{ 'drop-target': bookmarkDropTargetId === 'root' }"
      :style="{ '--bookmark-item-max-width': `${bookmarkItemMaxWidth}px` }"
      @contextmenu.prevent="showBookmarkContextMenu('bar', null, $event)"
      @dragover.prevent="setBookmarkDropTarget('root')"
      @dragleave="clearBookmarkDropTarget('root')"
      @drop.prevent="dropBookmarkIntoRoot"
    >
      <div
        v-for="(item, index) in bookmarks"
        :key="item.id"
        :ref="element => setBookmarkItemRef(item.id, element)"
        :class="['browser-bookmark-wrap', { 'is-overflow-hidden': index >= visibleBookmarkCount }]"
      >
        <button
          v-if="item.type === 'folder'"
          type="button"
          class="browser-bookmark-item browser-bookmark-folder"
          :class="{ 'drop-target': bookmarkDropTargetId === item.id }"
          :title="item.title"
          @click.stop="toggleBookmarkFolder(item.id)"
          @contextmenu.prevent.stop="showBookmarkContextMenu('folder', item, $event)"
          @dragover.prevent.stop="setBookmarkDropTarget(item.id)"
          @dragleave="clearBookmarkDropTarget(item.id)"
          @drop.prevent.stop="dropBookmarkIntoFolder(item.id)"
        >
          <el-icon><Folder /></el-icon>
          <span>{{ item.title }}</span>
          <el-icon class="browser-bookmark-caret"><ArrowDown /></el-icon>
        </button>
        <button
          v-else
          type="button"
          class="browser-bookmark-item"
          :title="item.url"
          draggable="true"
          @click="openBookmark(item)"
          @contextmenu.prevent.stop="showBookmarkContextMenu('bookmark', item, $event)"
          @dragstart="startBookmarkDrag(item, $event)"
          @dragend="finishBookmarkDrag"
        >
          <img class="browser-site-icon" :src="getSiteIcon(item)" alt="" />
          <span>{{ item.title }}</span>
        </button>

        <div
          v-if="item.type === 'folder' && openBookmarkFolderId === item.id"
          :class="['browser-bookmark-folder-menu', { 'align-right': bookmarkFolderMenuAlignRight }]"
          @click.stop
        >
          <button
            v-for="child in item.children"
            :key="child.id"
            type="button"
            class="browser-bookmark-folder-entry"
            :title="child.url"
            draggable="true"
            @click="openBookmark(child)"
            @contextmenu.prevent.stop="showBookmarkContextMenu('bookmark', child, $event)"
            @dragstart="startBookmarkDrag(child, $event)"
            @dragend="finishBookmarkDrag"
          >
            <img class="browser-site-icon" :src="getSiteIcon(child)" alt="" />
            <span>{{ child.title }}</span>
          </button>
          <span v-if="!item.children.length" class="browser-bookmark-folder-empty">文件夹为空</span>
        </div>
      </div>
      <span v-if="!bookmarks.length" class="browser-bookmarks-empty">暂无书签，点击地址栏右侧星标收藏当前页面。</span>
      <span class="browser-bookmarks-spacer"></span>
      <div v-if="overflowBookmarks.length" class="browser-bookmark-overflow-wrap" @click.stop>
        <button
          :class="['browser-bookmark-overflow-button', { active: bookmarkOverflowVisible }]"
          type="button"
          title="更多书签"
          @click="toggleBookmarkOverflow"
        >
          <el-icon><MoreFilled /></el-icon>
        </button>
        <div v-if="bookmarkOverflowVisible" class="browser-bookmark-overflow-menu">
          <div v-for="item in overflowBookmarks" :key="item.id" class="browser-bookmark-overflow-group">
            <button
              v-if="item.type === 'folder'"
              type="button"
              :class="['browser-bookmark-overflow-entry', 'is-folder', { 'drop-target': bookmarkDropTargetId === item.id }]"
              :title="item.title"
              @click="toggleOverflowBookmarkFolder(item.id)"
              @contextmenu.prevent.stop="showBookmarkContextMenu('folder', item, $event)"
              @dragover.prevent.stop="setBookmarkDropTarget(item.id)"
              @dragleave="clearBookmarkDropTarget(item.id)"
              @drop.prevent.stop="dropBookmarkIntoFolder(item.id)"
            >
              <el-icon><Folder /></el-icon>
              <span>{{ item.title }}</span>
              <el-icon :class="['browser-bookmark-overflow-caret', { expanded: openOverflowBookmarkFolderId === item.id }]">
                <ArrowDown />
              </el-icon>
            </button>
            <button
              v-else
              type="button"
              class="browser-bookmark-overflow-entry"
              :title="item.url"
              draggable="true"
              @click="openBookmark(item)"
              @contextmenu.prevent.stop="showBookmarkContextMenu('bookmark', item, $event)"
              @dragstart="startBookmarkDrag(item, $event)"
              @dragend="finishBookmarkDrag"
            >
              <img class="browser-site-icon" :src="getSiteIcon(item)" alt="" />
              <span>{{ item.title }}</span>
            </button>
            <div v-if="item.type === 'folder' && openOverflowBookmarkFolderId === item.id" class="browser-bookmark-overflow-children">
              <button
                v-for="child in item.children"
                :key="child.id"
                type="button"
                class="browser-bookmark-overflow-entry is-child"
                :title="child.url"
                draggable="true"
                @click="openBookmark(child)"
                @contextmenu.prevent.stop="showBookmarkContextMenu('bookmark', child, $event)"
                @dragstart="startBookmarkDrag(child, $event)"
                @dragend="finishBookmarkDrag"
              >
                <img class="browser-site-icon" :src="getSiteIcon(child)" alt="" />
                <span>{{ child.title }}</span>
              </button>
              <span v-if="!item.children.length" class="browser-bookmark-folder-empty">文件夹为空</span>
            </div>
          </div>
        </div>
      </div>
      <button class="browser-bookmark-manager-button" type="button" title="打开书签管理器" @click="openBookmarkManager">
        <el-icon><CollectionTag /></el-icon>
      </button>
    </div>

    <el-dialog
      v-model="bookmarkEditorVisible"
      :title="bookmarkEditorId ? '编辑书签' : '添加书签'"
      width="440px"
      append-to-body
      class="bookmark-editor-dialog"
    >
      <div class="bookmark-editor-form">
        <label>
          <span>名称</span>
          <el-input v-model="bookmarkEditorName" maxlength="120" autofocus @keyup.enter="saveBookmarkEditor" />
        </label>
        <label>
          <span>链接</span>
          <el-input v-model="bookmarkEditorUrl" maxlength="2048" @keyup.enter="saveBookmarkEditor" />
        </label>
        <label>
          <span>存放目录</span>
          <el-select v-model="bookmarkEditorFolderId">
            <el-option label="书签栏" value="root" />
            <el-option v-for="folder in bookmarkFolders" :key="folder.id" :label="folder.title" :value="folder.id" />
          </el-select>
        </label>
      </div>
      <template #footer>
        <div class="bookmark-editor-footer">
          <span class="bookmark-editor-footer-spacer"></span>
          <el-button @click="bookmarkEditorVisible = false">取消</el-button>
          <el-button v-if="bookmarkEditorAllowRemove" type="danger" @click="removeBookmarkFromEditor">移除</el-button>
          <el-button v-else type="primary" :disabled="!bookmarkEditorName.trim() || !bookmarkEditorUrl.trim()" @click="saveBookmarkEditor">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="bookmarkManagerVisible" title="书签管理器" width="760px" append-to-body class="bookmark-manager-dialog">
      <div class="bookmark-manager">
        <aside class="bookmark-manager-sidebar">
          <button
            type="button"
            :class="{ active: bookmarkManagerFolderId === 'root', 'drop-target': bookmarkDropTargetId === 'root' }"
            @click="bookmarkManagerFolderId = 'root'"
            @dragover.prevent="setBookmarkDropTarget('root')"
            @dragleave="clearBookmarkDropTarget('root')"
            @drop.prevent="dropBookmarkIntoRoot"
          >
            <el-icon><CollectionTag /></el-icon>
            <span>书签栏</span>
          </button>
          <button
            v-for="folder in bookmarkFolders"
            :key="folder.id"
            type="button"
            :class="{ active: bookmarkManagerFolderId === folder.id, 'drop-target': bookmarkDropTargetId === folder.id }"
            @click="bookmarkManagerFolderId = folder.id"
            @contextmenu.prevent="showBookmarkContextMenu('folder', folder, $event)"
            @dragover.prevent="setBookmarkDropTarget(folder.id)"
            @dragleave="clearBookmarkDropTarget(folder.id)"
            @drop.prevent="dropBookmarkIntoFolder(folder.id)"
          >
            <el-icon><Folder /></el-icon>
            <span>{{ folder.title }}</span>
          </button>
          <button type="button" class="bookmark-manager-new-folder" @click="createBookmarkFolder">
            <el-icon><Plus /></el-icon>
            <span>新建文件夹</span>
          </button>
        </aside>

        <section class="bookmark-manager-content">
          <header class="bookmark-manager-header">
            <strong>{{ bookmarkManagerTitle }}</strong>
            <span>{{ bookmarkManagerItems.length }} 项</span>
          </header>
          <div class="bookmark-manager-list">
            <div
              v-for="item in bookmarkManagerItems"
              :key="item.id"
              class="bookmark-manager-row"
              :class="{ 'drop-target': item.type === 'folder' && bookmarkDropTargetId === item.id }"
              :draggable="item.type === 'bookmark'"
              @dragstart="item.type === 'bookmark' && startBookmarkDrag(item, $event)"
              @dragend="finishBookmarkDrag"
              @dragover="item.type === 'folder' && $event.preventDefault()"
              @dragenter="item.type === 'folder' && setBookmarkDropTarget(item.id)"
              @dragleave="item.type === 'folder' && clearBookmarkDropTarget(item.id)"
              @drop.prevent.stop="item.type === 'folder' && dropBookmarkIntoFolder(item.id)"
              @contextmenu.prevent="showBookmarkContextMenu(item.type, item, $event)"
            >
              <button type="button" class="bookmark-manager-row-main" @dblclick="openBookmarkManagerItem(item)">
                <el-icon v-if="item.type === 'folder'"><Folder /></el-icon>
                <img v-else class="browser-site-icon" :src="getSiteIcon(item)" alt="" />
                <span>
                  <strong>{{ item.title }}</strong>
                  <small v-if="item.type === 'bookmark'">{{ item.url }}</small>
                </span>
              </button>
              <button type="button" :title="item.type === 'folder' ? '重命名' : '编辑'" @click="editBookmarkItem(item)"><el-icon><EditPen /></el-icon></button>
              <button type="button" title="删除" @click="deleteBookmarkItem(item)"><el-icon><Delete /></el-icon></button>
            </div>
            <div v-if="!bookmarkManagerItems.length" class="bookmark-manager-empty">当前文件夹为空</div>
          </div>
        </section>
      </div>
    </el-dialog>

    <div class="browser-content">
      <webview
        v-for="tab in tabs"
        v-show="tab.id === activeTabId"
        :key="tab.id"
        :ref="element => setFrameRef(tab.id, element)"
        :src="tab.sourceUrl || tab.url"
        :title="tab.title || '浏览器页面'"
        partition="persist:linux-visual-browser"
        allowpopups
        @dom-ready="handleWebviewReady(tab.id)"
        @did-finish-load="handleWebviewLoad(tab.id)"
        @did-navigate="handleWebviewNavigate($event, tab.id)"
        @did-navigate-in-page="handleWebviewNavigate($event, tab.id)"
        @did-fail-load="handleWebviewStateChange(tab.id)"
        @did-stop-loading="handleWebviewStateChange(tab.id)"
        @render-process-gone="handleWebviewStateChange(tab.id)"
        @page-title-updated="handleWebviewTitle($event, tab.id)"
        @page-favicon-updated="handleWebviewFavicon($event, tab.id)"
        @focus="closeTabMenu"
      ></webview>
      <div v-if="!activeTab" class="browser-empty-state">
        <strong>没有打开的页面</strong>
        <button type="button" @click="createTab()">新建页签</button>
      </div>
    </div>
  </section>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useNativeContextMenuBridge } from '../composables/useNativeContextMenuBridge.js'

  const HOME_URL = 'https://www.baidu.com'
  const STORAGE_KEY = 'linux-visual:browser-state'
  const WEBVIEW_PAGE_CSS = `
    ::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-button {
      display: none;
      width: 0;
      height: 0;
    }

    ::-webkit-scrollbar-thumb {
      border: 3px solid transparent;
      border-radius: 999px;
      background: #a8b4c2;
      background-clip: content-box;
    }

    ::-webkit-scrollbar-thumb:vertical {
      min-height: 36px;
    }

    ::-webkit-scrollbar-thumb:horizontal {
      min-width: 36px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: #7f8fa3;
      background-clip: content-box;
    }

    ::-webkit-scrollbar-corner {
      background: transparent;
    }
  `

  const frameRefs = new Map()
  const tabsBarRef = ref(null)
  const bookmarksBarRef = ref(null)
  const bookmarkItemElements = new Map()
  const tabs = ref([])
  const bookmarks = ref([])
  const activeTabId = ref('')
  const addressInput = ref('')
  const maxVisibleTabs = ref(4)
  const tabMenuVisible = ref(false)
  const visibleBookmarkCount = ref(Number.MAX_SAFE_INTEGER)
  const bookmarkItemMaxWidth = ref(180)
  const bookmarkOverflowVisible = ref(false)
  const openOverflowBookmarkFolderId = ref('')
  const canGoBack = ref(false)
  const canGoForward = ref(false)
  const openBookmarkFolderId = ref('')
  const bookmarkFolderMenuAlignRight = ref(false)
  const bookmarkManagerVisible = ref(false)
  const bookmarkManagerFolderId = ref('root')
  const bookmarkEditorVisible = ref(false)
  const bookmarkEditorId = ref('')
  const bookmarkEditorAllowRemove = ref(false)
  const bookmarkEditorName = ref('')
  const bookmarkEditorFolderId = ref('root')
  const bookmarkEditorUrl = ref('')
  const bookmarkEditorFavicon = ref('')
  const draggedBookmarkId = ref('')
  const bookmarkDropTargetId = ref('')
  let tabsResizeObserver = null
  let bookmarksResizeObserver = null
  let removeBrowserOpenTabListener = null

  const activeTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value) || tabs.value[0] || null)
  const isActiveBookmarked = computed(() => !!activeTab.value && !!findBookmarkByUrl(bookmarks.value, activeTab.value.url))
  const visibleTabs = computed(() => tabs.value.slice(Math.max(0, tabs.value.length - maxVisibleTabs.value)))
  const reversedTabs = computed(() => [...tabs.value].reverse())
  const overflowBookmarks = computed(() => bookmarks.value.slice(visibleBookmarkCount.value))
  const bookmarkFolders = computed(() => bookmarks.value.filter(item => item.type === 'folder'))
  const bookmarkManagerFolder = computed(() => bookmarkManagerFolderId.value === 'root' ? null : findBookmarkById(bookmarks.value, bookmarkManagerFolderId.value))
  const bookmarkManagerItems = computed(() => bookmarkManagerFolder.value?.children || bookmarks.value)
  const bookmarkManagerTitle = computed(() => bookmarkManagerFolder.value?.title || '书签栏')

  const {
    showNativeContextMenu: showBookmarkNativeContextMenu,
    bindNativeContextMenuAction: bindBookmarkContextMenu,
    cleanupNativeContextMenuBridge: cleanupBookmarkContextMenu
  } = useNativeContextMenuBridge({
    getContextActions: getBookmarkContextActions,
    runContextAction: runBookmarkContextAction
  })

  initBrowserState()

  watch(activeTabId, () => {
    const tab = activeTab.value
    addressInput.value = tab?.url || ''
    canGoBack.value = false
    canGoForward.value = false
    nextTick(syncHistoryAvailability)
  }, { immediate: true })

  watch([tabs, bookmarks, activeTabId], saveBrowserState, { deep: true })
  watch(bookmarks, () => nextTick(updateVisibleBookmarksLimit), { deep: true })

  onMounted(() => {
    updateVisibleTabsLimit()
    updateVisibleBookmarksLimit()
    tabsResizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateVisibleTabsLimit) : null
    bookmarksResizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateVisibleBookmarksLimit) : null
    if (tabsResizeObserver && tabsBarRef.value) tabsResizeObserver.observe(tabsBarRef.value)
    if (bookmarksResizeObserver && bookmarksBarRef.value) bookmarksResizeObserver.observe(bookmarksBarRef.value)
    window.addEventListener('resize', updateVisibleTabsLimit)
    window.addEventListener('click', closeTabMenu)
    removeBrowserOpenTabListener = window.whSSH?.onBrowserOpenTab?.(handleBrowserOpenTab) || null
    bindBookmarkContextMenu()
  })

  onBeforeUnmount(() => {
    tabsResizeObserver?.disconnect?.()
    bookmarksResizeObserver?.disconnect?.()
    window.removeEventListener('resize', updateVisibleTabsLimit)
    window.removeEventListener('click', closeTabMenu)
    removeBrowserOpenTabListener?.()
    cleanupBookmarkContextMenu()
  })

  function initBrowserState() {
    const parsed = readStoredState()
    const bookmarkIds = new Set()
    bookmarks.value = Array.isArray(parsed.bookmarks)
      ? parsed.bookmarks.map(item => normalizeBookmarkItem(item, bookmarkIds)).filter(Boolean)
      : [
        normalizeBookmarkItem({ title: '百度', url: 'https://www.baidu.com' }, bookmarkIds),
        normalizeBookmarkItem({ title: 'Node.js', url: 'https://nodejs.org' }, bookmarkIds),
        normalizeBookmarkItem({ title: 'Nginx', url: 'https://nginx.org' }, bookmarkIds)
      ]
    const tabIds = new Set()
    tabs.value = Array.isArray(parsed.tabs) && parsed.tabs.length
      ? parsed.tabs.filter(item => item?.url).map(item => normalizeBrowserItem(item, true, tabIds))
      : [createBrowserTab(HOME_URL, '起始页')]
    activeTabId.value = tabs.value.some(tab => tab.id === parsed.activeTabId) ? parsed.activeTabId : tabs.value[0]?.id || ''
  }

  function readStoredState() {
    try {
      return JSON.parse(window.localStorage?.getItem(STORAGE_KEY) || '{}') || {}
    } catch {
      return {}
    }
  }

  function saveBrowserState() {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
        tabs: tabs.value,
        bookmarks: bookmarks.value,
        activeTabId: activeTabId.value
      }))
    } catch {}
  }

  function createId() {
    return `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function createBrowserTab(url = HOME_URL, title = '') {
    const normalizedUrl = normalizeUrl(url)
    return { id: createId(), title: title || formatTabHost(normalizedUrl) || '新页签', url: normalizedUrl, sourceUrl: normalizedUrl, favicon: getFallbackFavicon(normalizedUrl) }
  }

  function normalizeBrowserItem(item = {}, withId = false, seenIds = null) {
    const url = normalizeUrl(item.url)
    const normalized = {
      title: String(item.title || formatTabHost(url) || url),
      url,
      favicon: String(item.favicon || getFallbackFavicon(url))
    }
    if (!withId) return normalized
    let id = String(item.id || createId())
    if (seenIds?.has(id)) id = createId()
    seenIds?.add(id)
    return { id, ...normalized, sourceUrl: url }
  }

  function normalizeBookmarkItem(item = {}, seenIds = new Set()) {
    if (!item || typeof item !== 'object') return null
    let id = String(item.id || createId())
    if (seenIds.has(id)) id = createId()
    seenIds.add(id)
    if (item.type === 'folder' || Array.isArray(item.children)) {
      return {
        id,
        type: 'folder',
        title: String(item.title || '新建文件夹'),
        children: Array.isArray(item.children)
          ? item.children.flatMap(child => {
              const normalizedChild = normalizeBookmarkItem(child, seenIds)
              if (!normalizedChild) return []
              return normalizedChild.type === 'folder' ? normalizedChild.children : [normalizedChild]
            })
          : []
      }
    }
    if (!item.url) return null
    return {
      id,
      type: 'bookmark',
      ...normalizeBrowserItem(item)
    }
  }

  function createTab(url = HOME_URL, title = '') {
    const tab = createBrowserTab(url, title)
    tabs.value = [...tabs.value, tab]
    activeTabId.value = tab.id
  }

  function selectTab(id) {
    activeTabId.value = id
    nextTick(syncHistoryAvailability)
  }

  function selectTabFromMenu(id) {
    if (!visibleTabs.value.some(tab => tab.id === id)) {
      const selectedTab = tabs.value.find(tab => tab.id === id)
      if (selectedTab) tabs.value = [...tabs.value.filter(tab => tab.id !== id), selectedTab]
    }
    selectTab(id)
    tabMenuVisible.value = false
  }

  function closeTab(id) {
    if (tabs.value.length <= 1) {
      tabs.value = [createBrowserTab(HOME_URL, '起始页')]
      activeTabId.value = tabs.value[0].id
      return
    }
    const index = tabs.value.findIndex(tab => tab.id === id)
    tabs.value = tabs.value.filter(tab => tab.id !== id)
    if (activeTabId.value === id) {
      activeTabId.value = tabs.value[Math.max(0, index - 1)]?.id || tabs.value[0]?.id || ''
    }
  }

  function navigateActiveTab() {
    navigateTo(addressInput.value)
  }

  function navigateTo(value) {
    const tab = activeTab.value
    if (!tab) return createTab(value)
    const nextUrl = normalizeUrl(value)
    addressInput.value = nextUrl
    const webview = getActiveWebview()
    if (webview?.loadURL) {
      webview.loadURL(nextUrl).catch(error => {
        console.warn('[browser] 页面跳转失败', error)
        ElMessage.error(`页面跳转失败：${error?.message || error}`)
      })
      return
    }
    tabs.value = tabs.value.map(item => item.id === tab.id ? {
      ...item,
      url: nextUrl,
      sourceUrl: nextUrl,
      title: formatTabHost(nextUrl) || nextUrl,
      favicon: getFallbackFavicon(nextUrl)
    } : item)
  }

  function normalizeUrl(value = '') {
    const text = String(value || '').trim()
    if (!text) return HOME_URL
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text
    if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(text)) return `https://${text}`
    return `https://www.baidu.com/s?wd=${encodeURIComponent(text)}`
  }

  function formatTabHost(url = '') {
    try {
      const parsed = new URL(url)
      return parsed.hostname.replace(/^www\./, '')
    } catch {
      return String(url || '')
    }
  }

  function getFallbackFavicon(url = '') {
    try {
      const parsed = new URL(url)
      return `${parsed.origin}/favicon.ico`
    } catch {
      return ''
    }
  }

  function getSiteIcon(item = {}) {
    return item.favicon || getFallbackFavicon(item.url)
  }

  function setFrameRef(tabId, element) {
    if (element) frameRefs.set(tabId, element)
    else frameRefs.delete(tabId)
  }

  function setBookmarkItemRef(bookmarkId, element) {
    if (element) bookmarkItemElements.set(bookmarkId, element)
    else bookmarkItemElements.delete(bookmarkId)
  }

  function getActiveWebview() {
    return frameRefs.get(activeTabId.value) || null
  }

  function handleWebviewLoad(tabId) {
    const tab = tabs.value.find(item => item.id === tabId)
    if (!tab) return
    nextTick(() => {
      try {
        const webview = frameRefs.get(tabId)
        const title = webview?.getTitle?.()?.trim()
        const url = webview?.getURL?.()?.trim()
        updateTabMeta(tabId, { title, url })
        if (tabId === activeTabId.value) syncHistoryAvailability()
      } catch {}
    })
  }

  function handleWebviewReady(tabId) {
    if (tabId === activeTabId.value) syncHistoryAvailability()
    frameRefs.get(tabId)?.insertCSS?.(WEBVIEW_PAGE_CSS).catch(error => {
      console.warn('[browser] 注入滚动条样式失败', error)
    })
  }

  function handleBrowserOpenTab(payload = {}) {
    const url = String(payload.url || '').trim()
    if (!/^https?:\/\//i.test(url)) return
    createTab(url)
  }

  function handleWebviewNavigate(event, tabId) {
    if (event?.isMainFrame === false) return
    updateTabMeta(tabId, { url: event?.url })
    if (tabId === activeTabId.value) nextTick(syncHistoryAvailability)
  }

  function handleWebviewStateChange(tabId) {
    if (tabId === activeTabId.value) nextTick(syncHistoryAvailability)
  }

  function handleWebviewTitle(event, tabId) {
    updateTabMeta(tabId, { title: event?.title })
  }

  function handleWebviewFavicon(event, tabId) {
    const favicon = Array.isArray(event?.favicons) ? event.favicons.find(Boolean) : ''
    updateTabMeta(tabId, { favicon })
  }

  function updateTabMeta(tabId, { title = '', url = '', favicon = '' } = {}) {
    const tab = tabs.value.find(item => item.id === tabId)
    if (!tab) return
    const nextUrl = String(url || '').trim()
    const nextTitle = String(title || '').trim()
    const nextFavicon = String(favicon || '').trim()
    tabs.value = tabs.value.map(item => item.id === tabId ? {
      ...item,
      ...(nextUrl ? { url: nextUrl } : {}),
      ...(nextTitle ? { title: nextTitle } : {}),
      ...(nextFavicon ? { favicon: nextFavicon } : {})
    } : item)
    if (nextUrl && tabId === activeTabId.value) addressInput.value = nextUrl
    syncBookmarkMeta(nextUrl || tab.url, { title: nextTitle, favicon: nextFavicon })
  }

  function syncBookmarkMeta(previousUrl, meta = {}) {
    const targetUrl = meta.url || previousUrl
    if (!targetUrl || !findBookmarkByUrl(bookmarks.value, previousUrl) && !findBookmarkByUrl(bookmarks.value, targetUrl)) return
    bookmarks.value = mapBookmarkItems(bookmarks.value, item => item.type === 'bookmark' && (item.url === previousUrl || item.url === targetUrl) ? {
      ...item,
      url: targetUrl,
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.favicon ? { favicon: meta.favicon } : {})
    } : item)
  }

  function reloadActiveTab() {
    try {
      getActiveWebview()?.reload?.()
    } catch (error) {
      ElMessage.error(`刷新页面失败：${error?.message || error}`)
    }
  }

  function goFrameHistory(delta) {
    try {
      const webview = getActiveWebview()
      if (delta < 0 && webview?.canGoBack?.()) webview.goBack()
      if (delta > 0 && webview?.canGoForward?.()) webview.goForward()
      window.setTimeout(syncHistoryAvailability, 80)
    } catch (error) {
      ElMessage.error(`页面历史跳转失败：${error?.message || error}`)
    }
  }

  function syncHistoryAvailability() {
    try {
      const webview = getActiveWebview()
      canGoBack.value = !!webview?.canGoBack?.()
      canGoForward.value = !!webview?.canGoForward?.()
    } catch {
      canGoBack.value = false
      canGoForward.value = false
    }
  }

  function openBookmarkEditor() {
    const tab = activeTab.value
    if (!tab) return
    const bookmark = findBookmarkByUrl(bookmarks.value, tab.url)
    bookmarkEditorId.value = bookmark?.id || ''
    bookmarkEditorAllowRemove.value = !!bookmark
    bookmarkEditorName.value = bookmark?.title || tab.title || formatTabHost(tab.url) || tab.url
    bookmarkEditorFolderId.value = bookmark ? findBookmarkParentId(bookmarks.value, bookmark.id) || 'root' : 'root'
    bookmarkEditorUrl.value = tab.url
    bookmarkEditorFavicon.value = tab.favicon || getFallbackFavicon(tab.url)
    bookmarkEditorVisible.value = true
  }

  function editBookmarkItem(item) {
    if (!item) return
    if (item.type === 'folder') return renameBookmarkItem(item)
    bookmarkEditorId.value = item.id
    bookmarkEditorAllowRemove.value = false
    bookmarkEditorName.value = item.title
    bookmarkEditorFolderId.value = findBookmarkParentId(bookmarks.value, item.id) || 'root'
    bookmarkEditorUrl.value = item.url
    bookmarkEditorFavicon.value = item.favicon || getFallbackFavicon(item.url)
    bookmarkEditorVisible.value = true
  }

  function saveBookmarkEditor() {
    const title = bookmarkEditorName.value.trim()
    const rawUrl = bookmarkEditorUrl.value.trim()
    if (!title || !rawUrl) return
    const url = normalizeUrl(rawUrl)

    const existing = bookmarkEditorId.value ? findBookmarkById(bookmarks.value, bookmarkEditorId.value) : null
    const currentFolderId = existing ? findBookmarkParentId(bookmarks.value, existing.id) || 'root' : ''
    const targetFolderId = bookmarkEditorFolderId.value || 'root'
    const bookmark = {
      id: existing?.id || createId(),
      type: 'bookmark',
      title,
      url,
      favicon: !existing || existing.url === url
        ? bookmarkEditorFavicon.value || getFallbackFavicon(url)
        : getFallbackFavicon(url)
    }

    if (existing && currentFolderId === targetFolderId) {
      bookmarks.value = mapBookmarkItems(bookmarks.value, item => item.id === existing.id ? bookmark : item)
      bookmarkEditorVisible.value = false
      return
    }

    const result = existing ? removeBookmarkById(bookmarks.value, existing.id) : { items: bookmarks.value }
    const targetFolder = targetFolderId === 'root'
      ? null
      : findBookmarkById(result.items, targetFolderId)
    bookmarks.value = targetFolder?.type === 'folder'
      ? appendBookmarkToFolder(result.items, targetFolder.id, bookmark)
      : [...result.items, bookmark]
    bookmarkEditorVisible.value = false
  }

  function removeBookmarkFromEditor() {
    if (bookmarkEditorId.value) {
      bookmarks.value = removeBookmarkById(bookmarks.value, bookmarkEditorId.value).items
    }
    bookmarkEditorVisible.value = false
  }

  function openBookmark(bookmark) {
    openBookmarkFolderId.value = ''
    bookmarkOverflowVisible.value = false
    openOverflowBookmarkFolderId.value = ''
    const current = activeTab.value
    if (!current || current.url === HOME_URL) return navigateTo(bookmark.url)
    createTab(bookmark.url, bookmark.title)
  }

  function findBookmarkById(items, id) {
    for (const item of items) {
      if (item.id === id) return item
      if (item.type === 'folder') {
        const match = findBookmarkById(item.children, id)
        if (match) return match
      }
    }
    return null
  }

  function findBookmarkParentId(items, id, parentId = 'root') {
    for (const item of items) {
      if (item.id === id) return parentId
      if (item.type === 'folder') {
        const match = findBookmarkParentId(item.children, id, item.id)
        if (match !== null) return match
      }
    }
    return null
  }

  function findBookmarkByUrl(items, url) {
    for (const item of items) {
      if (item.type === 'bookmark' && item.url === url) return item
      if (item.type === 'folder') {
        const match = findBookmarkByUrl(item.children, url)
        if (match) return match
      }
    }
    return null
  }

  function mapBookmarkItems(items, mapper) {
    return items.map(item => {
      const nextItem = item.type === 'folder' ? { ...item, children: mapBookmarkItems(item.children, mapper) } : item
      return mapper(nextItem)
    })
  }

  function removeBookmarkById(items, id) {
    let removed = null
    const nextItems = []
    for (const item of items) {
      if (item.id === id) {
        removed = item
        continue
      }
      if (item.type === 'folder') {
        const childResult = removeBookmarkById(item.children, id)
        if (childResult.removed && !removed) removed = childResult.removed
        nextItems.push({ ...item, children: childResult.items })
      } else {
        nextItems.push(item)
      }
    }
    return { items: nextItems, removed }
  }

  function appendBookmarkToFolder(items, folderId, bookmark) {
    return items.map(item => {
      if (item.type !== 'folder') return item
      if (item.id === folderId) return { ...item, children: [...item.children, bookmark] }
      return { ...item, children: appendBookmarkToFolder(item.children, folderId, bookmark) }
    })
  }

  function toggleBookmarkFolder(folderId) {
    bookmarkOverflowVisible.value = false
    openOverflowBookmarkFolderId.value = ''
    const nextFolderId = openBookmarkFolderId.value === folderId ? '' : folderId
    openBookmarkFolderId.value = nextFolderId
    bookmarkFolderMenuAlignRight.value = nextFolderId ? shouldAlignBookmarkFolderMenuRight(nextFolderId) : false
  }

  function shouldAlignBookmarkFolderMenuRight(folderId) {
    const itemElement = bookmarkItemElements.get(folderId)
    const barWidth = bookmarksBarRef.value?.clientWidth || 0
    return !!itemElement && !!barWidth && itemElement.offsetLeft + 270 > barWidth - 10
  }

  function toggleBookmarkOverflow() {
    openBookmarkFolderId.value = ''
    bookmarkOverflowVisible.value = !bookmarkOverflowVisible.value
    if (!bookmarkOverflowVisible.value) openOverflowBookmarkFolderId.value = ''
  }

  function toggleOverflowBookmarkFolder(folderId) {
    openOverflowBookmarkFolderId.value = openOverflowBookmarkFolderId.value === folderId ? '' : folderId
  }

  function openBookmarkManager() {
    openBookmarkFolderId.value = ''
    bookmarkOverflowVisible.value = false
    openOverflowBookmarkFolderId.value = ''
    bookmarkManagerVisible.value = true
  }

  function openBookmarkManagerItem(item) {
    if (item.type === 'folder') {
      bookmarkManagerFolderId.value = item.id
      return
    }
    bookmarkManagerVisible.value = false
    openBookmark(item)
  }

  async function createBookmarkFolder() {
    try {
      const suggestedTitle = getUniqueBookmarkFolderTitle('新建文件夹')
      const result = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
        inputValue: suggestedTitle,
        inputPattern: /\S+/,
        inputErrorMessage: '文件夹名称不能为空',
        confirmButtonText: '创建',
        cancelButtonText: '取消'
      })
      const inputTitle = String(result.value || '').trim()
      if (!inputTitle) return
      const title = getUniqueBookmarkFolderTitle(inputTitle)
      const folder = normalizeBookmarkItem({ type: 'folder', title, children: [] })
      bookmarks.value = [...bookmarks.value, folder]
      bookmarkManagerFolderId.value = folder.id
    } catch {}
  }

  function getUniqueBookmarkFolderTitle(title) {
    const normalizedTitle = String(title || '').trim() || '新建文件夹'
    const existingTitles = new Set(bookmarkFolders.value.map(folder => folder.title))
    if (!existingTitles.has(normalizedTitle)) return normalizedTitle

    const suffixMatch = normalizedTitle.match(/^(.*?)(?:（(\d+)）)$/)
    const baseTitle = suffixMatch?.[1] || normalizedTitle
    let suffix = suffixMatch ? Number(suffixMatch[2]) + 1 : 2
    while (existingTitles.has(`${baseTitle}（${suffix}）`)) suffix += 1
    return `${baseTitle}（${suffix}）`
  }

  async function renameBookmarkItem(item) {
    if (!item) return
    try {
      const result = await ElMessageBox.prompt('请输入新名称', item.type === 'folder' ? '重命名文件夹' : '重命名书签', {
        inputValue: item.title,
        inputPattern: /\S+/,
        inputErrorMessage: '名称不能为空',
        confirmButtonText: '保存',
        cancelButtonText: '取消'
      })
      const title = String(result.value || '').trim()
      if (!title) return
      bookmarks.value = mapBookmarkItems(bookmarks.value, current => current.id === item.id ? { ...current, title } : current)
    } catch {}
  }

  async function deleteBookmarkItem(item) {
    if (!item) return
    try {
      await ElMessageBox.confirm(
        item.type === 'folder' ? `删除“${item.title}”及其中的全部书签？` : `删除书签“${item.title}”？`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      )
      bookmarks.value = removeBookmarkById(bookmarks.value, item.id).items
      if (bookmarkManagerFolderId.value === item.id) bookmarkManagerFolderId.value = 'root'
      if (openBookmarkFolderId.value === item.id) openBookmarkFolderId.value = ''
      if (openOverflowBookmarkFolderId.value === item.id) openOverflowBookmarkFolderId.value = ''
    } catch {}
  }

  function getBookmarkContextActions(menuType) {
    if (menuType === 'bar') {
      return [
        { key: 'new-folder', label: '新建文件夹' },
        { type: 'separator' },
        { key: 'manager', label: '打开书签管理器' }
      ]
    }
    return [
      { key: menuType === 'bookmark' ? 'edit' : 'rename', label: menuType === 'bookmark' ? '编辑' : '重命名' },
      { key: 'delete', label: '删除' },
      { type: 'separator' },
      { key: 'manager', label: '打开书签管理器' }
    ]
  }

  function runBookmarkContextAction(action, menuType, item) {
    if (action === 'new-folder') return createBookmarkFolder()
    if (action === 'manager') return openBookmarkManager()
    if (action === 'edit') return editBookmarkItem(item)
    if (action === 'rename') return renameBookmarkItem(item)
    if (action === 'delete') return deleteBookmarkItem(item)
  }

  function showBookmarkContextMenu(menuType, item, event) {
    openBookmarkFolderId.value = ''
    bookmarkOverflowVisible.value = false
    openOverflowBookmarkFolderId.value = ''
    showBookmarkNativeContextMenu(menuType, item, event)
  }

  function startBookmarkDrag(bookmark, event) {
    if (bookmark.type !== 'bookmark') return
    draggedBookmarkId.value = bookmark.id
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', bookmark.id)
  }

  function finishBookmarkDrag() {
    draggedBookmarkId.value = ''
    bookmarkDropTargetId.value = ''
  }

  function setBookmarkDropTarget(folderId) {
    if (draggedBookmarkId.value) bookmarkDropTargetId.value = folderId
  }

  function clearBookmarkDropTarget(folderId) {
    if (bookmarkDropTargetId.value === folderId) bookmarkDropTargetId.value = ''
  }

  function dropBookmarkIntoFolder(folderId) {
    const bookmarkId = draggedBookmarkId.value
    const targetFolder = findBookmarkById(bookmarks.value, folderId)
    if (!bookmarkId || targetFolder?.type !== 'folder') return finishBookmarkDrag()
    const result = removeBookmarkById(bookmarks.value, bookmarkId)
    if (result.removed?.type === 'bookmark') {
      bookmarks.value = appendBookmarkToFolder(result.items, folderId, result.removed)
    }
    finishBookmarkDrag()
  }

  function dropBookmarkIntoRoot() {
    const bookmarkId = draggedBookmarkId.value
    if (!bookmarkId) return finishBookmarkDrag()
    const result = removeBookmarkById(bookmarks.value, bookmarkId)
    if (result.removed?.type === 'bookmark') {
      bookmarks.value = [...result.items, result.removed]
    }
    finishBookmarkDrag()
  }

  function updateVisibleTabsLimit() {
    const width = tabsBarRef.value?.clientWidth || 0
    if (!width) return
    const reservedWidth = 92
    const tabWidth = 190
    maxVisibleTabs.value = Math.max(1, Math.floor((width - reservedWidth) / tabWidth))
  }

  function updateVisibleBookmarksLimit() {
    const barWidth = bookmarksBarRef.value?.clientWidth || 0
    if (!barWidth || !bookmarks.value.length) {
      bookmarkItemMaxWidth.value = 180
      visibleBookmarkCount.value = bookmarks.value.length
      bookmarkOverflowVisible.value = false
      openOverflowBookmarkFolderId.value = ''
      return
    }

    const preferredWidths = bookmarks.value.map(item => {
      const itemElement = bookmarkItemElements.get(item.id)
      const titleWidth = itemElement?.querySelector('.browser-bookmark-item > span')?.scrollWidth || 0
      if (!itemElement || !titleWidth) return 0
      const fixedWidth = item.type === 'folder' ? 61 : 42
      return Math.min(180, fixedWidth + titleWidth)
    })
    if (preferredWidths.some(width => !width)) return

    const itemGap = 4
    const minimumItemWidth = 84
    const availableWithoutOverflow = Math.max(0, barWidth - 52)
    const widthAtLimit = (widths, limit) => widths.reduce((sum, width) => sum + Math.min(width, limit), 0) + itemGap * Math.max(0, widths.length - 1)
    const findLargestFittingLimit = (widths, availableWidth) => {
      let low = minimumItemWidth
      let high = 180
      let best = minimumItemWidth
      while (low <= high) {
        const middle = Math.floor((low + high) / 2)
        if (widthAtLimit(widths, middle) <= availableWidth) {
          best = middle
          low = middle + 1
        } else {
          high = middle - 1
        }
      }
      return best
    }

    let nextVisibleCount = preferredWidths.length
    let nextItemMaxWidth = 180

    if (widthAtLimit(preferredWidths, 180) > availableWithoutOverflow) {
      if (widthAtLimit(preferredWidths, minimumItemWidth) <= availableWithoutOverflow) {
        nextItemMaxWidth = findLargestFittingLimit(preferredWidths, availableWithoutOverflow)
      } else {
        const availableWithOverflow = Math.max(0, availableWithoutOverflow - 34)
        let usedWidth = 0
        nextVisibleCount = 0
        for (const width of preferredWidths) {
          const nextWidth = usedWidth + (nextVisibleCount ? itemGap : 0) + Math.min(width, minimumItemWidth)
          if (nextWidth > availableWithOverflow) break
          usedWidth = nextWidth
          nextVisibleCount += 1
        }
        nextItemMaxWidth = nextVisibleCount
          ? findLargestFittingLimit(preferredWidths.slice(0, nextVisibleCount), availableWithOverflow)
          : minimumItemWidth
      }
    }

    bookmarkItemMaxWidth.value = nextItemMaxWidth
    visibleBookmarkCount.value = nextVisibleCount
    const visibleIds = new Set(bookmarks.value.slice(0, nextVisibleCount).map(item => item.id))
    const overflowIds = new Set(bookmarks.value.slice(nextVisibleCount).map(item => item.id))
    if (openBookmarkFolderId.value && !visibleIds.has(openBookmarkFolderId.value)) openBookmarkFolderId.value = ''
    bookmarkFolderMenuAlignRight.value = openBookmarkFolderId.value
      ? shouldAlignBookmarkFolderMenuRight(openBookmarkFolderId.value)
      : false
    if (openOverflowBookmarkFolderId.value && !overflowIds.has(openOverflowBookmarkFolderId.value)) openOverflowBookmarkFolderId.value = ''
    if (nextVisibleCount === bookmarks.value.length) {
      bookmarkOverflowVisible.value = false
      openOverflowBookmarkFolderId.value = ''
    }
  }

  function closeTabMenu() {
    tabMenuVisible.value = false
    openBookmarkFolderId.value = ''
    bookmarkOverflowVisible.value = false
    openOverflowBookmarkFolderId.value = ''
  }
</script>

<style scoped>
  .browser-page {
    position: relative;
    min-height: 0;
    height: 100%;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
    gap: 0;
    min-width: 0;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 0;
    background: #eef2f7;
  }

  .browser-tabs {
    min-height: 0;
    height: 43px;
    min-width: 0;
    display: flex;
    align-items: end;
    gap: 2px;
    padding: 6px 8px 0;
    overflow: visible;
    background: #dce7f6;
    border-bottom: 1px solid #cbd5e1;
  }

  .browser-tab,
  .browser-tab-menu-button,
  .browser-tab-add,
  .browser-addressbar button,
  .browser-bookmarks button,
  .browser-empty-state button {
    border: 0;
    background: #ffffff;
    color: #334155;
  }

  .browser-tab-menu-wrap {
    position: relative;
    flex: 0 0 auto;
    margin-bottom: 3px;
  }

  .browser-tab-menu-button {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
  }

  .browser-tab-menu-button,
  .browser-tab-add {
    border: 0;
    background: transparent;
  }

  .browser-tab-menu-button:hover,
  .browser-tab-add:hover {
    background: #cbd7e7;
  }

  .browser-tab-menu {
    position: absolute;
    z-index: 20;
    left: 0;
    top: calc(100% + 6px);
    width: 260px;
    max-height: 320px;
    display: grid;
    gap: 4px;
    padding: 8px;
    overflow-y: auto;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
  }

  .browser-tab-menu-item {
    min-width: 0;
    min-height: 34px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 20px;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #334155;
    text-align: left;
  }

  .browser-tab-menu-item:hover,
  .browser-tab-menu-item.active {
    background: #ecfdf5;
    color: #047857;
  }

  .browser-tab-menu-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .browser-tab-menu-close {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #64748b;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease;
  }

  .browser-tab-menu-item:hover .browser-tab-menu-close,
  .browser-tab-menu-close:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .browser-tab-menu-close:focus-visible {
    outline: 2px solid rgba(22, 163, 74, 0.38);
    outline-offset: 1px;
  }

  .browser-tab-menu-close:hover {
    background: rgba(71, 85, 105, 0.14);
    color: #1f2937;
  }

  .browser-tab {
    width: 184px;
    min-width: 184px;
    height: 34px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
    padding: 5px 10px 5px 13px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: #334155;
    text-align: left;
    position: relative;
    transition: background-color 0.14s ease, color 0.14s ease;
  }

  .browser-tab > * {
    position: relative;
    z-index: 1;
  }

  .browser-tab:not(.active)::before {
    content: '';
    position: absolute;
    inset: 3px 5px;
    border-radius: 999px;
    background: transparent;
    transition: background-color 0.14s ease;
    pointer-events: none;
  }

  .browser-tab:not(.active):not(:hover)::after {
    content: '';
    position: absolute;
    top: 7px;
    right: -2px;
    width: 1px;
    height: 19px;
    border-radius: 1px;
    background: #b5c2d3;
  }

  .browser-tab:not(.active):has(+ .browser-tab:hover)::after,
  .browser-tab:not(.active):has(+ .browser-tab.active)::after {
    opacity: 0;
  }

  .browser-tab.active {
    z-index: 1;
    height: 36px;
    margin-bottom: 0;
    border-radius: 10px 10px 0 0;
    background: #ffffff;
    color: #0f172a;
  }

  .browser-tab.active::before,
  .browser-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    width: 8px;
    height: 8px;
    pointer-events: none;
  }

  .browser-tab.active::before {
    left: -8px;
    border-bottom-right-radius: 8px;
    box-shadow: 4px 4px 0 4px #ffffff;
  }

  .browser-tab.active::after {
    right: -8px;
    border-bottom-left-radius: 8px;
    box-shadow: -4px 4px 0 4px #ffffff;
  }

  .browser-tab:not(.active):hover {
    background: transparent;
    color: #1f2937;
  }

  .browser-tab:not(.active):hover::before {
    background: #c3cfdf;
  }

  .browser-tab.active:hover {
    background: #ffffff;
  }

  .browser-tab-title,
  .browser-bookmarks button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .browser-tab-title {
    font-size: 12px;
    font-weight: 400;
  }

  .browser-tab-close {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #475569;
    opacity: 0.88;
    transition: opacity 0.16s ease, background-color 0.16s ease, color 0.16s ease;
  }

  .browser-tab:hover .browser-tab-close,
  .browser-tab.active .browser-tab-close {
    opacity: 1;
  }

  .browser-tab-close:hover {
    background: rgba(71, 85, 105, 0.16);
    color: #1f2937;
  }

  .browser-tab-add {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 3px;
    border-radius: 8px;
  }

  .browser-site-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    border-radius: 4px;
    object-fit: contain;
  }

  .browser-tab-icon {
    width: 17px;
    height: 17px;
  }

  .browser-addressbar {
    min-height: 0;
    height: 53px;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, 34px) minmax(0, 1fr) repeat(2, 34px);
    gap: 8px;
    align-items: center;
    padding: 9px 10px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
  }

  .browser-addressbar button {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-color: transparent;
    border-radius: 8px;
    background: transparent;
    box-shadow: 0 0 0 1px transparent inset;
  }

  .browser-addressbar button:not(:disabled):hover {
    border-color: transparent;
    box-shadow: 0 0 0 1px #16a34a inset;
    color: #047857;
  }

  .browser-bookmarks button:hover,
  .browser-empty-state button:hover {
    border-color: #16a34a;
    color: #047857;
  }

  .browser-star-button.active {
    border-color: transparent;
    background: #fffbeb;
    color: #d97706;
  }

  .browser-star-button.active:hover {
    border-color: transparent;
    box-shadow: 0 0 0 1px #f59e0b inset;
  }

  .browser-address-input {
    min-width: 0;
    height: 34px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #f8fafc;
    color: #64748b;
  }

  .browser-address-input:focus-within {
    box-shadow: none;
    background: #ffffff;
  }

  .browser-address-input input {
    min-width: 0;
    height: 30px;
    border: 0;
    box-shadow: none;
    outline: none;
    background: transparent;
    color: #0f172a;
    font-size: 13px;
  }

  .browser-bookmarks {
    position: relative;
    min-height: 0;
    height: 43px;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 7px 10px;
    overflow: visible;
    background: #fbfdff;
    border-bottom: 1px solid #e2e8f0;
  }

  .browser-bookmarks.drop-target {
    background: #eff6ff;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.16) inset;
  }

  .browser-bookmark-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .browser-bookmark-wrap.is-overflow-hidden {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
  }

  .browser-bookmark-item {
    height: 28px;
    max-width: var(--bookmark-item-max-width, 180px);
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 0 !important;
    border-radius: 7px;
    background: transparent !important;
    color: #334155;
    font-size: 12px;
    white-space: nowrap;
    transition: background-color 0.14s ease, color 0.14s ease;
  }

  .browser-bookmark-item:hover,
  .browser-bookmark-item.drop-target {
    border-color: transparent !important;
    background: #e7edf5 !important;
    color: #1f2937 !important;
  }

  .browser-bookmark-item.drop-target {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.22) inset;
  }

  .browser-bookmark-caret {
    width: 12px;
    margin-left: 1px;
    font-size: 11px;
  }

  .browser-bookmark-folder-menu {
    position: absolute;
    z-index: 30;
    top: calc(100% + 5px);
    left: 0;
    width: 270px;
    max-height: min(340px, calc(100vh - 180px));
    display: grid;
    gap: 1px;
    padding: 5px;
    overflow-y: auto;
    border: 1px solid #d5dce6;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.2);
  }

  .browser-bookmark-folder-menu.align-right {
    right: 0;
    left: auto;
  }

  .browser-bookmark-folder-entry {
    width: 100%;
    max-width: none !important;
    height: 34px !important;
    display: grid !important;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: center;
    justify-content: stretch;
    gap: 6px !important;
    padding: 0 8px !important;
    border: 0 !important;
    border-radius: 6px !important;
    background: transparent !important;
    color: #334155 !important;
    font-size: 13px;
    line-height: 1.2;
    text-align: left;
  }

  .browser-bookmark-folder-entry .browser-site-icon {
    justify-self: center;
  }

  .browser-bookmark-folder-entry:hover {
    background: #edf2f7 !important;
  }

  .browser-bookmark-folder-empty {
    padding: 16px 10px;
    color: #94a3b8;
    font-size: 12px;
    text-align: center;
  }

  .browser-bookmarks-spacer {
    min-width: 8px;
    flex: 1 1 auto;
  }

  .browser-bookmark-overflow-wrap {
    position: absolute;
    z-index: 36;
    top: 7px;
    right: 42px;
  }

  .browser-bookmark-overflow-button {
    width: 30px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 7px !important;
    background: transparent !important;
    color: #475569 !important;
  }

  .browser-bookmark-overflow-button:hover,
  .browser-bookmark-overflow-button.active {
    background: #e7edf5 !important;
    color: #1f2937 !important;
  }

  .browser-bookmark-overflow-menu {
    position: absolute;
    z-index: 40;
    top: calc(100% + 5px);
    right: 0;
    width: 270px;
    max-height: min(420px, calc(100vh - 180px));
    padding: 6px;
    overflow-y: auto;
    border: 1px solid #d5dce6;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.2);
  }

  .browser-bookmark-overflow-group {
    display: grid;
    gap: 2px;
  }

  .browser-bookmark-overflow-entry {
    width: 100%;
    min-width: 0;
    height: 32px;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 0 !important;
    border-radius: 6px;
    background: transparent !important;
    color: #334155 !important;
    font-size: 13px;
    text-align: left;
  }

  .browser-bookmark-overflow-entry.is-folder {
    grid-template-columns: 20px minmax(0, 1fr) auto;
  }

  .browser-bookmark-overflow-entry.is-child {
    padding-left: 8px;
  }

  .browser-bookmark-overflow-entry .browser-site-icon,
  .browser-bookmark-overflow-entry > .el-icon:first-child {
    justify-self: center;
  }

  .browser-bookmark-overflow-entry:hover,
  .browser-bookmark-overflow-entry.drop-target {
    background: #edf2f7 !important;
    color: #1f2937 !important;
  }

  .browser-bookmark-overflow-entry.drop-target {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.22) inset;
  }

  .browser-bookmark-overflow-caret {
    font-size: 11px;
    transform: rotate(-90deg);
    transition: transform 0.14s ease;
  }

  .browser-bookmark-overflow-caret.expanded {
    transform: rotate(0deg);
  }

  .browser-bookmark-overflow-children {
    display: grid;
    gap: 2px;
    margin-left: 14px;
    padding: 0 0 3px 4px;
    border-left: 1px solid #e2e8f0;
  }

  .browser-bookmark-manager-button {
    position: absolute;
    z-index: 35;
    right: 8px;
    top: 7px;
    width: 30px;
    height: 28px;
    flex: 0 0 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 7px !important;
    background: transparent !important;
    color: #475569 !important;
  }

  .browser-bookmark-manager-button:hover {
    background: #e7edf5 !important;
    color: #1f2937 !important;
  }

  .browser-bookmarks-empty {
    color: #64748b;
    font-size: 12px;
  }

  .bookmark-editor-form {
    display: grid;
    gap: 16px;
    padding: 4px 2px;
  }

  .bookmark-editor-form label {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    color: #475569;
    font-size: 13px;
  }

  .bookmark-editor-form .el-select {
    width: 100%;
  }

  .bookmark-editor-footer {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .bookmark-editor-footer-spacer {
    flex: 1 1 auto;
  }

  .bookmark-manager {
    height: min(58vh, 520px);
    min-height: 360px;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
  }

  .bookmark-manager-sidebar {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 8px;
    overflow-y: auto;
    border-right: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .bookmark-manager-sidebar button {
    min-height: 34px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #475569;
    text-align: left;
  }

  .bookmark-manager-sidebar button:hover,
  .bookmark-manager-sidebar button.active {
    background: #e7edf5;
    color: #1f2937;
  }

  .bookmark-manager-sidebar button.drop-target {
    background: #dbeafe;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25) inset;
  }

  .bookmark-manager-sidebar .bookmark-manager-new-folder {
    margin-top: 6px;
    border-top: 1px solid #e2e8f0;
    border-radius: 0 0 6px 6px;
  }

  .bookmark-manager-sidebar button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-manager-content {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .bookmark-manager-header {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .bookmark-manager-header strong {
    color: #0f172a;
    font-size: 14px;
  }

  .bookmark-manager-header span {
    color: #94a3b8;
    font-size: 12px;
  }

  .bookmark-manager-list {
    min-height: 0;
    padding: 8px;
    overflow-y: auto;
  }

  .bookmark-manager-row {
    min-width: 0;
    min-height: 44px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px 30px;
    align-items: center;
    gap: 4px;
    padding: 3px 5px 3px 8px;
    border-radius: 6px;
  }

  .bookmark-manager-row:hover {
    background: #f1f5f9;
  }

  .bookmark-manager-row.drop-target {
    background: #dbeafe;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.22) inset;
  }

  .bookmark-manager-row[draggable='true'] {
    cursor: grab;
  }

  .bookmark-manager-row-main {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #334155;
    text-align: left;
  }

  .bookmark-manager-row-main > span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .bookmark-manager-row-main strong,
  .bookmark-manager-row-main small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-manager-row-main strong {
    font-size: 12px;
  }

  .bookmark-manager-row-main small {
    color: #94a3b8;
    font-size: 10px;
  }

  .bookmark-manager-row > button:not(.bookmark-manager-row-main) {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: transparent;
    color: #64748b;
  }

  .bookmark-manager-row > button:not(.bookmark-manager-row-main):hover {
    background: #e2e8f0;
    color: #1f2937;
  }

  .bookmark-manager-empty {
    display: grid;
    place-items: center;
    min-height: 180px;
    color: #94a3b8;
    font-size: 12px;
  }

  .browser-content {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: block;
    position: relative;
    overflow: hidden;
    background: #ffffff;
  }

  .browser-content webview {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    border: 0;
    background: #ffffff;
  }

  .browser-empty-state {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    background: #ffffff;
    color: #334155;
  }

  .browser-empty-state button {
    height: 34px;
    padding: 0 14px;
    border-radius: 8px;
  }

  @media (max-width: 760px) {
    .browser-addressbar {
      grid-template-columns: repeat(4, 34px) minmax(180px, 1fr) repeat(2, 34px);
      overflow-x: auto;
    }
  }
</style>
