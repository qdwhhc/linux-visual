<template>
  <section class="panel placeholder-panel page-section object-storage-page">
    <div class="section-line page-hero-line">
      <div>
        <h3>对象存储</h3>
        <p>管理 COS / S3 兼容 Bucket 连接，集中浏览云端对象、目录前缀和连接详情。</p>
      </div>
      <div class="service-actions">
        <el-button plain :loading="loading" @click="loadConnections(true)">刷新连接</el-button>
        <el-button type="primary" plain @click="createConnection">新增对象存储</el-button>
        <el-badge class="object-storage-transfer-badge" :value="transferBadgeCount" :hidden="!transferBadgeCount" :max="99">
          <el-button plain class="object-storage-transfer-button" @click="transferDrawerVisible = true">传输列表</el-button>
        </el-badge>
      </div>
    </div>

    <div class="object-storage-layout">
      <aside class="object-storage-tree-pane">
        <div class="object-storage-tree-head">
          <strong>对象存储连接</strong>
          <span>{{ filteredConnections.length }} / {{ connections.length }}</span>
        </div>
        <input v-model.trim="storageKeyword" class="object-storage-tree-search" placeholder="搜索连接、Bucket、Endpoint" />
        <div v-if="filteredConnections.length" class="object-storage-tree-list">
          <div
            v-for="item in filteredConnections"
            :key="item.id"
            class="object-storage-tree-item"
            :class="{ active: activeConnection?.id === item.id }"
            @click="selectConnection(item)"
            @contextmenu.prevent.stop="openConnectionContextMenu(item, $event)"
          >
            <button class="object-storage-tree-select" type="button" @click.stop="selectConnection(item)">
              <span class="object-storage-tree-icon"></span>
              <span class="object-storage-tree-content">
                <span class="object-storage-tree-title-line">
                  <span class="object-storage-tree-name">{{ item.name }}</span>
                  <em class="object-storage-provider-tag" :class="`is-${item.provider || 'cos'}`">{{ getProviderLabel(item.provider) }}</em>
                </span>
              </span>
            </button>
            <button class="object-storage-manage-button" type="button" title="管理连接" aria-label="管理连接" @click.stop="openConnectionContextMenu(item, $event)">
              <span class="object-storage-manage-dots" aria-hidden="true">⋮</span>
            </button>
          </div>
        </div>
        <div v-else class="object-storage-empty">{{ connections.length ? '没有匹配的对象存储连接。' : '暂无对象存储连接。' }}</div>
      </aside>

      <Teleport to="body">
        <div
          v-if="connectionContextMenu.visible"
          class="object-storage-context-menu"
          :style="{ left: `${connectionContextMenu.x}px`, top: `${connectionContextMenu.y}px` }"
          @click.stop
          @contextmenu.prevent.stop
        >
          <button type="button" @click="handleConnectionContextEdit">编辑连接</button>
          <div class="object-storage-context-divider"></div>
          <button type="button" class="danger" @click="handleConnectionContextDelete">删除</button>
        </div>
      </Teleport>

      <section class="object-storage-main">
        <div class="object-storage-card object-storage-browser-card">
          <div class="object-storage-pathbar">
            <span>路径：</span>
            <button type="button" :disabled="!activeConnection" @click="enterPrefix('')">根目录</button>
            <template v-for="part in prefixBreadcrumbs" :key="part.path">
              <span>/</span>
              <button type="button" @click="enterPrefix(part.path)">{{ part.name }}</button>
            </template>
          </div>
          <div class="object-storage-prefix-row">
            <input v-model.trim="currentPrefix" placeholder="当前目录前缀，例如 images/2026/" @keyup.enter="loadObjects" />
            <el-button plain :disabled="!currentPrefix || loadingObjects" @click="goParentPrefix">上一级</el-button>
            <el-button plain :disabled="!activeConnection || loadingObjects" :loading="loadingObjects" @click="loadObjects(true)">刷新列表</el-button>
          </div>
          <div class="object-storage-file-toolbar">
            <div class="object-storage-file-actions">
              <el-button type="primary" plain :disabled="!activeConnection" @click="uploadObjects">上传文件</el-button>
              <el-button plain :disabled="!activeConnection || objectActionLoading" @click="createDirectory">新建目录</el-button>
              <el-button plain :disabled="!selectedObjectItems.length || objectActionLoading" @click="downloadSelectedObjects">下载</el-button>
              <el-button plain type="danger" :disabled="!selectedObjectItems.length || objectActionLoading" @click="deleteObjects(selectedObjectItems)">删除</el-button>
            </div>
            <input v-model.trim="objectKeyword" placeholder="搜索文件名 / Key" />
          </div>
          <div
            class="object-storage-browser-body"
            :class="{ 'is-drop-active': objectDropActive, 'is-transfer-active': objectTransfer.active }"
            @dragenter.prevent="handleObjectPanelDragEnter"
            @dragover.prevent="handleObjectPanelDragOver"
            @dragleave="handleObjectPanelDragLeave"
            @drop.prevent="handleObjectPanelDrop"
          >
            <div class="object-storage-browser-summary">
              <span>{{ activeConnection ? `当前前缀：${storageResult?.prefix || currentPrefix || '根目录'}` : '请选择左侧对象存储连接' }}</span>
              <span>{{ getObjectListSummaryText() }}</span>
            </div>
            <el-table
              class="object-storage-el-table"
              :data="visibleObjectRows"
              height="100%"
              row-key="key"
              :empty-text="objectKeyword ? '当前搜索没有匹配对象' : '当前目录暂无文件'"
              @selection-change="handleObjectSelectionChange"
            >
              <el-table-column type="selection" width="44" :selectable="isSelectableObjectRow" />
              <el-table-column label="名称" min-width="320" show-overflow-tooltip>
                <template #default="{ row }">
                  <button
                    v-if="row.type === 'folder'"
                    class="object-storage-name-button"
                    type="button"
                    draggable="true"
                    @click="enterPrefix(row.key)"
                    @dragstart="startObjectNativeDrag(row, $event)"
                    @dragover.prevent.stop="handleObjectFolderDragOver(row, $event)"
                    @drop.prevent.stop="handleObjectFolderDrop(row, $event)"
                  >
                    <span class="file-icon solid-folder-icon"></span>
                    <span>{{ row.name }}</span>
                  </button>
                  <span v-else class="object-storage-file-name" draggable="true" @dragstart="startObjectNativeDrag(row, $event)">
                    <el-icon :class="getObjectFileIconClass(row)">
                      <VideoCamera v-if="isObjectVideoFile(row.name)" />
                      <Picture v-else-if="isObjectImageFile(row.name)" />
                      <Headset v-else-if="isObjectAudioFile(row.name)" />
                      <Files v-else-if="isObjectArchiveFile(row.name)" />
                      <Tickets v-else-if="isObjectCodeFile(row.name)" />
                      <Document v-else />
                    </el-icon>
                    <span>{{ row.name }}</span>
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="预览" width="86" align="center">
                <template #default="{ row }">
                  <button v-if="row.type === 'file' && isObjectImageFile(row.name)" class="object-storage-thumb-button" type="button" @click="previewObject(row)">
                    <img v-if="thumbnailMap[row.key]" :src="thumbnailMap[row.key]" alt="图片缩略图" />
                    <span v-else>图片</span>
                  </button>
                  <span v-else class="object-storage-thumb-empty">-</span>
                </template>
              </el-table-column>
              <el-table-column label="大小" width="120">
                <template #default="{ row }">{{ row.type === 'folder' ? '-' : formatObjectSize(row.size) }}</template>
              </el-table-column>
              <el-table-column label="更新时间" width="190">
                <template #default="{ row }">{{ row.type === 'folder' ? '-' : formatObjectDate(row.lastModified) }}</template>
              </el-table-column>
              <el-table-column label="存储类型" width="120">
                <template #default="{ row }">{{ row.type === 'folder' ? '目录' : (row.storageClass || 'STANDARD') }}</template>
              </el-table-column>
              <el-table-column label="权限" width="118">
                <template #default="{ row }">
                  <span class="object-storage-acl-tag" :class="getObjectAclClass(row)">{{ getObjectAclLabel(row) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <div class="object-storage-table-actions">
                    <template v-if="row.type === 'folder'">
                      <el-button link type="primary" @click="enterPrefix(row.key)">打开</el-button>
                      <el-dropdown trigger="click" @command="command => handleObjectMoreCommand(command, row)">
                         <el-button link type="primary">更多</el-button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="download">下载</el-dropdown-item>
                            <el-dropdown-item command="rename">重命名</el-dropdown-item>
                            <el-dropdown-item command="permission">设置权限</el-dropdown-item>
                            <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </template>
                    <template v-else>
                      <el-button link type="primary" @click="previewObject(row)">预览</el-button>
                       <el-dropdown trigger="click" @command="command => handleObjectMoreCommand(command, row)">
                         <el-button link type="primary">更多</el-button>
                         <template #dropdown>
                           <el-dropdown-menu>
                             <el-dropdown-item command="detail">详情</el-dropdown-item>
                             <el-dropdown-item command="download">下载</el-dropdown-item>
                            <el-dropdown-item command="rename">重命名</el-dropdown-item>
                            <el-dropdown-item command="permission">访问权限</el-dropdown-item>
                            <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </template>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="activeConnection" class="object-storage-list-more">
              <span>{{ getObjectListFooterText() }}</span>
              <el-button v-if="objectListHasMore" plain :loading="loadingMoreObjects" @click="loadMoreObjects">加载更多</el-button>
            </div>
            <div v-if="objectDropActive" class="object-storage-drop-overlay">
              释放后上传到 {{ objectDropTargetLabel }}
            </div>
          </div>
        </div>
      </section>
    </div>

    <el-dialog v-model="previewDialog.visible" width="760px" class="object-storage-preview-dialog" @closed="cleanupObjectPreviewTempFile">
      <template #header>
        <span class="object-storage-preview-title" :title="previewDialog.fullTitle || previewDialog.title">{{ previewDialog.title }}</span>
      </template>
      <div v-if="previewDialog.loading" class="object-storage-preview-state">正在读取预览...</div>
      <img v-else-if="previewDialog.type === 'image'" class="object-storage-preview-image" :src="previewDialog.dataUrl" alt="对象预览" />
      <pre v-else-if="previewDialog.type === 'text'" class="object-storage-preview-text">{{ previewDialog.text }}</pre>
      <video v-else-if="previewDialog.type === 'video'" class="object-storage-preview-video" :src="previewDialog.mediaUrl" controls autoplay></video>
      <audio v-else-if="previewDialog.type === 'audio'" class="object-storage-preview-audio" :src="previewDialog.mediaUrl" controls autoplay></audio>
      <div v-else class="object-storage-preview-state">该文件类型暂不支持在线预览，请下载后查看。</div>
    </el-dialog>

    <el-dialog v-model="detailDialog.visible" title="对象详情" width="620px" class="object-storage-detail-dialog">
      <div class="object-storage-detail-list">
        <div><span>名称</span><strong>{{ detailDialog.row?.name || '-' }}</strong></div>
        <div><span>Key</span><strong>{{ detailDialog.row?.key || '-' }}</strong></div>
        <div><span>访问地址</span><strong>{{ getObjectAccessUrl(detailDialog.row) }}</strong></div>
        <div><span>Bucket</span><strong>{{ activeConnection?.bucket || '-' }}</strong></div>
        <div><span>所属目录</span><strong>{{ getObjectDirectory(detailDialog.row?.key) }}</strong></div>
        <div><span>大小</span><strong>{{ formatObjectSize(detailDialog.row?.size) }}</strong></div>
        <div><span>更新时间</span><strong>{{ formatObjectDate(detailDialog.row?.lastModified) }}</strong></div>
        <div><span>存储类型</span><strong>{{ detailDialog.row?.storageClass || 'STANDARD' }}</strong></div>
        <div><span>权限</span><strong>{{ getDetailAclText(detailDialog.row) }}</strong></div>
        <div><span>文件类型</span><strong>{{ inferObjectDisplayContentType(detailDialog.row?.name) }}</strong></div>
        <div><span>ETag</span><strong>{{ detailDialog.row?.etag || '-' }}</strong></div>
      </div>
      <div v-if="detailDialog.row?.type !== 'folder'" class="object-storage-detail-actions">
        <el-button plain @click="copyObjectAccessUrl(detailDialog.row)">复制访问地址</el-button>
        <el-button plain :loading="signedUrlLoading" @click="copyObjectSignedUrl(detailDialog.row)">复制临时链接（1小时）</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="permissionDialog.visible" title="权限设置" width="680px" class="object-storage-permission-dialog">
      <div class="object-storage-permission-body">
        <div class="object-storage-permission-target">
          <span>作用范围</span>
          <strong>{{ getPermissionScopeText() }}</strong>
        </div>
        <div class="object-storage-permission-section-title">基础权限</div>
        <el-radio-group v-model="permissionDialog.acl" class="object-storage-permission-options">
          <el-radio value="private">私有读写（仅授权账号可访问）</el-radio>
          <el-radio value="public-read">公有读私有写（拿到链接即可查看）</el-radio>
        </el-radio-group>
        <div v-if="activeConnection?.provider === 'cos' && permissionDialog.row?.type === 'folder'" class="object-storage-permission-user-grid">
          <div class="object-storage-permission-user-head">
            <strong>用户访问权限</strong>
            <span>{{ permissionDialog.row?.type === 'folder' ? '为此前缀下已有文件批量设置访问账户' : '当前文件已授权账户和新增授权账户' }}</span>
          </div>
          <label>
            <span>当前账号 ID</span>
            <input v-model.trim="permissionDialog.ownerUin" placeholder="Bucket 所属账号 ID，例如控制台账号 ID" />
          </label>
          <div class="object-storage-permission-table-head">
            <span>访问账户</span>
            <button type="button" @click="addPermissionUser">添加访问账户</button>
          </div>
          <div v-if="permissionDialog.grantUsers.length" class="object-storage-permission-table">
            <div class="object-storage-permission-table-row is-head">
              <span>账号 ID</span>
              <span>权限</span>
              <span>操作</span>
            </div>
            <div v-for="(item, index) in permissionDialog.grantUsers" :key="item.id" class="object-storage-permission-table-row">
              <input v-model.trim="item.targetUin" placeholder="被授权账号 ID" />
              <div class="object-storage-permission-checks">
                <label v-for="option in permissionOptions" :key="option.value">
                  <input type="checkbox" :checked="item.permissions.includes(option.value)" @change="togglePermissionUserPermission(item, option.value, $event.target.checked)" />
                  <span>{{ option.label }}</span>
                </label>
              </div>
              <button type="button" @click="removePermissionUser(index)">删除</button>
            </div>
          </div>
          <div v-else class="object-storage-permission-user-empty">暂无指定访问账户，可点击“添加访问账户”。</div>
        </div>
        <p class="object-storage-permission-tip">
          {{ getPermissionTipText() }}
        </p>
      </div>
      <template #footer>
        <el-button plain @click="permissionDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="objectActionLoading" @click="submitPermissionSettings">保存权限</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="transferDrawerVisible" title="传输列表" size="430px" class="object-storage-transfer-drawer">
      <div class="object-storage-transfer-drawer-body">
        <div class="object-storage-transfer-drawer-head">
          <span>{{ transferRecords.length ? `共 ${transferRecords.length} 个传输项目` : '暂无传输任务' }}</span>
          <button type="button" :disabled="!completedTransferRecords.length" @click="clearCompletedTransfers">清除完成</button>
        </div>
        <div v-if="transferRecords.length" class="object-storage-transfer-list">
          <div v-for="item in transferRecords" :key="item.id" class="object-storage-transfer-item">
            <div class="object-storage-transfer-item-head">
              <strong>{{ item.fileName || item.key || '未命名对象' }}</strong>
              <em :class="`is-${item.status}`">{{ getTransferStatusText(item) }}</em>
            </div>
            <div class="object-storage-transfer-item-key">{{ item.key || '-' }}</div>
            <div class="object-storage-transfer-item-track">
              <span :style="{ width: `${item.percent || 0}%` }"></span>
            </div>
            <div class="object-storage-transfer-item-meta">
              <span>{{ item.percent || 0 }}%</span>
              <span>{{ formatObjectSize(item.loadedBytes) }} / {{ formatObjectSize(item.totalBytes) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="object-storage-transfer-empty">上传、下载任务会显示在这里。</div>
      </div>
    </el-drawer>

    <el-drawer v-model="connectionDrawerVisible" :title="form.id ? '编辑对象存储连接' : '新增对象存储连接'" size="520px" class="object-storage-drawer">
      <div class="object-storage-drawer-body">
        <p class="object-storage-drawer-tip">这里填写的是 API 密钥，不是腾讯云登录用户名/密码。腾讯云 COS 请填 SecretId / SecretKey，子账号也需要先在访问管理 CAM 中创建 API 密钥。</p>
        <div class="object-storage-form-grid object-storage-form-grid--drawer">
          <label>
            <span>连接名称 <em class="required-mark">*</em></span>
            <input v-model.trim="form.name" placeholder="自定义备注名，例如：生产环境 COS" />
          </label>
          <label>
            <span>存储类型 <em class="required-mark">*</em></span>
            <el-select v-model="form.provider" class="object-storage-select">
              <el-option label="腾讯云 COS（推荐 / 已支持）" value="cos" />
              <el-option label="S3 / MinIO（兼容）" value="s3" />
              <el-option label="阿里云 OSS（实验性 / 待验证）" value="aliyun-oss" />
              <el-option label="华为云 OBS（实验性 / 待验证）" value="huawei-obs" />
              <el-option label="百度云 BOS（实验性 / 待验证）" value="baidu-bos" />
            </el-select>
          </label>
          <label>
            <span>Region <em class="required-mark">*</em></span>
            <input v-model.trim="form.region" placeholder="Bucket 所在地域，例如：ap-shanghai / cn-shanghai" />
          </label>
          <label>
            <span>Endpoint</span>
            <input v-model.trim="form.endpoint" placeholder="可选；自定义域名或 MinIO 填完整地址，例如：http://127.0.0.1:9000" />
          </label>
          <label>
            <span>Bucket <em class="required-mark">*</em></span>
            <input v-model.trim="form.bucket" placeholder="存储桶名称，不要填完整域名，例如：linux-visual-1257760531" />
          </label>
          <label>
            <span>默认前缀</span>
            <input v-model.trim="form.prefix" placeholder="可选；默认进入的目录前缀，例如：backup/mysql/" />
          </label>
          <label>
            <span>SecretId / AccessKeyId <em class="required-mark">*</em></span>
            <input v-model.trim="form.accessKeyId" placeholder="腾讯云填 SecretId；子账号需在 CAM 中创建 API 密钥" />
          </label>
          <label>
            <span>SecretKey / SecretAccessKey <em class="required-mark">*</em></span>
            <span class="object-storage-secret-field">
              <input v-model="form.secretAccessKey" :type="secretVisible ? 'text' : 'password'" placeholder="腾讯云填 SecretKey，不是登录密码；只会加密保存在本机" />
              <button type="button" :title="secretVisible ? '隐藏 SecretKey' : '显示 SecretKey'" @click="secretVisible = !secretVisible">
                <el-icon><View v-if="secretVisible" /><Hide v-else /></el-icon>
              </button>
            </span>
          </label>
        </div>
        <div class="object-storage-actions object-storage-drawer-actions">
          <el-button type="primary" :loading="saving" @click="saveConnection">保存连接</el-button>
          <el-button plain @click="connectionDrawerVisible = false">取消</el-button>
          <el-button plain type="danger" :disabled="!form.id" @click="deleteConnection(form)">删除连接</el-button>
        </div>
      </div>
    </el-drawer>
  </section>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Document, Files, Headset, Hide, Picture, Tickets, VideoCamera, View } from '@element-plus/icons-vue'

  const connections = ref([])
  const activeId = ref('')
  const storageKeyword = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const loadingObjects = ref(false)
  const loadingMoreObjects = ref(false)
  const signedUrlLoading = ref(false)
  const objectActionLoading = ref(false)
  const connectionDrawerVisible = ref(false)
  const currentPrefix = ref('')
  const objectKeyword = ref('')
  const secretVisible = ref(false)
  const transferDrawerVisible = ref(false)
  const objectPrefixes = ref([])
  const storageObjects = ref([])
  const storageResult = ref(null)
  const selectedObjectRows = ref([])
  const objectDropActive = ref(false)
  const objectDropTargetPrefix = ref('')
  const objectTransfer = reactive({ active: false, title: '' })
  const uploadProgress = reactive({ visible: false, id: '', title: '', fileName: '', loadedBytes: 0, totalBytes: 0, percent: 0 })
  const transferRecords = ref([])
  const thumbnailMap = reactive({})
  const objectAclMap = reactive({})
  const objectAclLoadingMap = reactive({})
  const connectionContextMenu = reactive({ visible: false, x: 0, y: 0, item: null })
  const previewDialog = reactive({ visible: false, loading: false, title: '', fullTitle: '', type: '', dataUrl: '', text: '', mediaUrl: '', tempPath: '', contentType: '' })
  const detailDialog = reactive({ visible: false, row: null })
  const permissionDialog = reactive({ visible: false, row: null, loading: false, acl: 'private', ownerUin: '', grantUsers: [] })
  const form = reactive(createEmptyForm())
  let removeObjectStorageUploadProgressListener = null
  let removeObjectStorageDownloadProgressListener = null
  let uploadProgressHideTimer = null
  const uploadTransferSessions = new Map()
  const downloadTransferSessions = new Map()
  const permissionOptions = [
    { value: 'read', label: '读取对象' },
    { value: 'write', label: '写入对象' },
    { value: 'read-acp', label: '读取权限' },
    { value: 'write-acp', label: '修改权限' },
    { value: 'full-control', label: '完全控制' }
  ]

  const activeConnection = computed(() => connections.value.find(item => item.id === activeId.value) || null)
  const normalizedCurrentPrefix = computed(() => String(currentPrefix.value || '').replace(/^\/+/, '').replace(/\/+/g, '/'))
  const prefixBreadcrumbs = computed(() => {
    const parts = normalizedCurrentPrefix.value.replace(/\/+$/, '').split('/').filter(Boolean)
    return parts.map((name, index) => ({ name, path: `${parts.slice(0, index + 1).join('/')}/` }))
  })
  const filteredConnections = computed(() => {
    const keyword = storageKeyword.value.toLowerCase()
    if (!keyword) return connections.value
    return connections.value.filter(item => [item.name, item.provider, item.region, item.endpoint, item.bucket, item.prefix]
      .some(value => String(value || '').toLowerCase().includes(keyword)))
  })
  const objectRowCount = computed(() => objectPrefixes.value.length + storageObjects.value.length)
  const visibleFolderRows = computed(() => {
    const keyword = objectKeyword.value.toLowerCase()
    const rows = objectPrefixes.value.map(item => ({ ...item, type: 'folder', name: item.name || item.key }))
    if (!keyword) return rows
    return rows.filter(item => [item.name, item.key].some(value => String(value || '').toLowerCase().includes(keyword)))
  })
  const visibleFileRows = computed(() => {
    const keyword = objectKeyword.value.toLowerCase()
    const rows = storageObjects.value.map(item => ({ ...item, type: 'file', name: item.name || item.key }))
    if (!keyword) return rows
    return rows.filter(item => [item.name, item.key, item.storageClass].some(value => String(value || '').toLowerCase().includes(keyword)))
  })
  const visibleObjectRows = computed(() => [...visibleFolderRows.value, ...visibleFileRows.value])
  const selectedFileRows = computed(() => selectedObjectRows.value.filter(item => item.type === 'file'))
  const selectedObjectItems = computed(() => selectedObjectRows.value.filter(item => item?.key && ['file', 'folder'].includes(item.type)))
  const objectDropTargetLabel = computed(() => objectDropTargetPrefix.value || currentPrefix.value || '根目录')
  const transferBadgeCount = computed(() => transferRecords.value.length)
  const completedTransferRecords = computed(() => transferRecords.value.filter(item => ['completed', 'skipped', 'failed'].includes(item.status)))
  const objectListHasMore = computed(() => Boolean(storageResult.value?.isTruncated && storageResult.value?.nextContinuationToken))

  function createEmptyForm() {
    return {
      id: '',
      name: '',
      provider: 'cos',
      region: '',
      endpoint: '',
      bucket: '',
       prefix: 'linux/packages/',
      accessKeyId: '',
      secretAccessKey: ''
    }
  }

  function assignForm(payload = {}) {
    Object.assign(form, createEmptyForm(), payload)
  }

  function getProviderLabel(provider = '') {
    const value = String(provider || '').toLowerCase()
    if (value === 's3') return 'S3'
    if (value === 'aliyun-oss') return 'OSS'
    if (value === 'huawei-obs') return 'OBS'
    if (value === 'baidu-bos') return 'BOS'
    return 'COS'
  }

  function getObjectFileExt(name) {
    const index = String(name || '').lastIndexOf('.')
    return index > -1 ? String(name).slice(index + 1).toLowerCase() : ''
  }

  function isObjectImageFile(name) {
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(getObjectFileExt(name))
  }

  function isObjectVideoFile(name) {
    return ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv', 'flv', 'wmv'].includes(getObjectFileExt(name))
  }

  function isObjectAudioFile(name) {
    return ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'].includes(getObjectFileExt(name))
  }

  function isObjectArchiveFile(name) {
    return ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(getObjectFileExt(name))
  }

  function isObjectCodeFile(name) {
    return ['js', 'ts', 'vue', 'css', 'scss', 'html', 'json', 'xml', 'yml', 'yaml', 'md', 'sh', 'py', 'java', 'php', 'go', 'sql', 'conf'].includes(getObjectFileExt(name))
  }

  function getObjectFileIconClass(row) {
    const name = row?.name || ''
    if (isObjectVideoFile(name)) return 'file-icon video-icon'
    if (isObjectImageFile(name)) return 'file-icon image-icon'
    if (isObjectAudioFile(name)) return 'file-icon audio-icon'
    if (isObjectArchiveFile(name)) return 'file-icon archive-icon'
    if (isObjectCodeFile(name)) return 'file-icon code-icon'
    return 'file-icon document-icon'
  }

  function getObjectDirectory(key = '') {
    const text = String(key || '').replace(/\/+$/, '')
    const index = text.lastIndexOf('/')
    return index > -1 ? text.slice(0, index + 1) : '根目录'
  }

  function getObjectParentPrefix(key = '') {
    const text = String(key || '').replace(/\/+$/, '')
    const index = text.lastIndexOf('/')
    return index > -1 ? text.slice(0, index + 1) : ''
  }

  function inferObjectDisplayContentType(name = '') {
    const ext = getObjectFileExt(name)
    if (!ext) return '未知'
    if (isObjectImageFile(name)) return `图片 / .${ext}`
    if (['txt', 'log', 'md'].includes(ext)) return `文本 / .${ext}`
    if (['json', 'xml', 'yml', 'yaml'].includes(ext)) return `结构化文本 / .${ext}`
    if (isObjectArchiveFile(name)) return `压缩包 / .${ext}`
    if (isObjectVideoFile(name)) return `视频 / .${ext}`
    if (isObjectAudioFile(name)) return `音频 / .${ext}`
    return `文件 / .${ext}`
  }

  function getObjectAccessUrl(row = null) {
    if (!activeConnection.value?.bucket || !row?.key) return '-'
    const endpoint = String(activeConnection.value.endpoint || '').trim()
    const provider = String(activeConnection.value.provider || 'cos').toLowerCase()
    const region = String(activeConnection.value.region || '').trim()
    let host = endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    if (!host) {
      if (provider === 'aliyun-oss') host = `oss-${region}.aliyuncs.com`
      else if (provider === 'huawei-obs') host = `obs.${region}.myhuaweicloud.com`
      else if (provider === 'baidu-bos') host = `${region}.bcebos.com`
      else if (provider === 's3') host = region ? `s3.${region}.amazonaws.com` : 's3.amazonaws.com'
      else host = `cos.${region}.myqcloud.com`
    }
    const protocol = /^http:\/\//i.test(endpoint) ? 'http' : 'https'
    const bucketPrefix = `${activeConnection.value.bucket.toLowerCase()}.`
    const hostname = host.toLowerCase().startsWith(bucketPrefix) ? host : `${activeConnection.value.bucket}.${host}`
    return `${protocol}://${hostname}/${String(row.key).split('/').map(encodeURIComponent).join('/')}`
  }

  function selectConnection(item) {
    activeId.value = item?.id || ''
    currentPrefix.value = item?.prefix || ''
    objectKeyword.value = ''
    clearObjects()
    if (item?.id) loadObjects()
  }

  function createConnection() {
    assignForm()
    secretVisible.value = false
    connectionDrawerVisible.value = true
  }

  function editConnection(item = null) {
    const target = item || activeConnection.value
    if (!target) return
    closeConnectionContextMenu()
    assignForm(target)
    secretVisible.value = false
    connectionDrawerVisible.value = true
  }

  function openConnectionContextMenu(item, event) {
    connectionContextMenu.visible = true
    connectionContextMenu.item = item
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    connectionContextMenu.x = rect ? rect.right - 118 : (event?.clientX || 0)
    connectionContextMenu.y = rect ? rect.bottom + 4 : (event?.clientY || 0)
    if (item?.id) activeId.value = item.id
  }

  function closeConnectionContextMenu() {
    connectionContextMenu.visible = false
    connectionContextMenu.item = null
  }

  function handleConnectionContextEdit() {
    editConnection(connectionContextMenu.item)
  }

  function handleConnectionContextDelete() {
    const target = connectionContextMenu.item
    closeConnectionContextMenu()
    deleteConnection(target)
  }

  function clearObjects() {
    objectPrefixes.value = []
    storageObjects.value = []
    storageResult.value = null
    selectedObjectRows.value = []
    Object.keys(objectAclMap).forEach(key => delete objectAclMap[key])
    Object.keys(objectAclLoadingMap).forEach(key => delete objectAclLoadingMap[key])
  }

  async function loadConnections(notify = false) {
    loading.value = true
    try {
      const list = await window.whSSH.listObjectStorageConnections()
      connections.value = Array.isArray(list) ? list : []
      if (activeId.value && !connections.value.some(item => item.id === activeId.value)) activeId.value = ''
      if (!activeId.value && connections.value[0]) selectConnection(connections.value[0])
      if (notify) ElMessage({ message: '对象存储连接已刷新', type: 'success', duration: 1400, grouping: true })
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '读取对象存储连接失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      loading.value = false
    }
  }

  async function saveConnection() {
    saving.value = true
    try {
      const saved = await window.whSSH.saveObjectStorageConnection({ ...form })
      await loadConnections()
      selectConnection(saved)
      connectionDrawerVisible.value = false
      ElMessage({ message: '对象存储连接已保存', type: 'success', duration: 1400, grouping: true })
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '保存对象存储连接失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      saving.value = false
    }
  }

  async function deleteConnection(target = null) {
    const item = target || form
    if (!item?.id) return
    try {
      await ElMessageBox.confirm(`确认删除对象存储连接「${item.name || item.bucket}」？\nBucket：${item.bucket || '-'}\n此操作只删除本机保存的连接配置，不会删除云端 Bucket 或对象。`, '删除连接', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      await window.whSSH.deleteObjectStorageConnection(item.id)
      if (activeId.value === item.id) {
        activeId.value = ''
        currentPrefix.value = ''
        clearObjects()
      }
      if (form.id === item.id) assignForm()
      connectionDrawerVisible.value = false
      await loadConnections()
      ElMessage({ message: '对象存储连接已删除', type: 'success', duration: 1400, grouping: true })
    } catch (error) {
      if (error !== 'cancel') ElMessage({ message: String(error?.message || error || '删除对象存储连接失败'), type: 'error', duration: 2200, grouping: true })
    }
  }

  async function loadObjects(notify = false) {
    if (!activeConnection.value) return
    currentPrefix.value = normalizedCurrentPrefix.value
    loadingObjects.value = true
    try {
      const result = await window.whSSH.listObjectStorageObjects({ id: activeConnection.value.id, prefix: currentPrefix.value })
      objectPrefixes.value = Array.isArray(result?.prefixes) ? result.prefixes : []
      storageObjects.value = Array.isArray(result?.objects) ? result.objects : []
      storageResult.value = result || { prefix: currentPrefix.value }
      selectedObjectRows.value = []
      loadObjectThumbnails()
      loadObjectAclSummaries()
      if (!objectPrefixes.value.length && !storageObjects.value.length) {
        ElMessage({ message: '当前前缀暂无对象', type: 'info', duration: 1400, grouping: true })
      } else if (notify) {
        ElMessage({ message: '对象列表已刷新', type: 'success', duration: 1400, grouping: true })
      }
    } catch (error) {
      clearObjects()
      ElMessage({ message: String(error?.message || error || '读取对象列表失败'), type: 'error', duration: 2400, grouping: true })
    } finally {
      loadingObjects.value = false
    }
  }

  async function loadMoreObjects() {
    if (!activeConnection.value || !objectListHasMore.value || loadingMoreObjects.value) return
    loadingMoreObjects.value = true
    try {
      const result = await window.whSSH.listObjectStorageObjects({
        id: activeConnection.value.id,
        prefix: storageResult.value?.prefix ?? currentPrefix.value,
        continuationToken: storageResult.value.nextContinuationToken
      })
      appendObjectRows(result)
      storageResult.value = result || storageResult.value
      loadObjectThumbnails()
      loadObjectAclSummaries()
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '加载更多对象失败'), type: 'error', duration: 2400, grouping: true })
    } finally {
      loadingMoreObjects.value = false
    }
  }

  function appendObjectRows(result) {
    const mergeByKey = (current, next) => {
      const map = new Map(current.map(item => [item.key, item]))
      for (const item of next) {
        if (item?.key) map.set(item.key, item)
      }
      return Array.from(map.values())
    }
    objectPrefixes.value = mergeByKey(objectPrefixes.value, Array.isArray(result?.prefixes) ? result.prefixes : [])
    storageObjects.value = mergeByKey(storageObjects.value, Array.isArray(result?.objects) ? result.objects : [])
  }

  function getObjectListSummaryText() {
    if (selectedObjectItems.value.length) return `已选 ${selectedObjectItems.value.length} 个项目`
    const suffix = objectListHasMore.value ? ' / 可继续加载' : ''
    return `${visibleFolderRows.value.length} 个目录 / ${visibleFileRows.value.length} 个文件${suffix}`
  }

  function getObjectListFooterText() {
    const total = objectPrefixes.value.length + storageObjects.value.length
    if (loadingObjects.value) return '正在加载对象列表...'
    if (objectListHasMore.value) return `当前已加载 ${total} 项，云端还有更多对象。`
    return `已全部加载，共 ${total} 项。`
  }

  function enterPrefix(prefix) {
    currentPrefix.value = prefix || ''
    objectKeyword.value = ''
    loadObjects()
  }

  function goParentPrefix() {
    const normalized = String(currentPrefix.value || '').replace(/\/+$/, '')
    const index = normalized.lastIndexOf('/')
    currentPrefix.value = index > -1 ? `${normalized.slice(0, index + 1)}` : ''
    loadObjects()
  }

  function formatObjectSize(size) {
    const value = Number(size || 0)
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
  }

  function getObjectAclLabel(row) {
    if (row?.type === 'folder') return '前缀'
    if (!row?.key) return '-'
    if (objectAclLoadingMap[row.key]) return '读取中'
    return objectAclMap[row.key]?.label || '未读取'
  }

  function getObjectAclClass(row) {
    if (row?.type === 'folder') return 'is-prefix'
    const acl = objectAclMap[row?.key]?.acl
    if (objectAclLoadingMap[row?.key]) return 'is-loading'
    if (acl === 'public-read') return 'is-public'
    if (acl === 'custom') return 'is-custom'
    if (acl === 'private') return 'is-private'
    return 'is-unknown'
  }

  function getDetailAclText(row) {
    if (!row?.key) return '-'
    if (row.type === 'folder') return '前缀对象权限，需通过权限设置批量作用于已有对象'
    return getObjectAclLabel(row)
  }

  function cacheObjectAcl(result) {
    if (result?.key) objectAclMap[result.key] = { acl: result.acl || 'custom', label: result.label || '自定义授权', grants: Array.isArray(result.grants) ? result.grants : [] }
  }

  async function ensureObjectAcl(row, force = false) {
    if (!activeConnection.value || !row?.key || row.type === 'folder' || (!force && objectAclMap[row.key]) || objectAclLoadingMap[row.key]) return objectAclMap[row?.key]
    objectAclLoadingMap[row.key] = true
    try {
      const result = await window.whSSH.getObjectStorageAcl({ id: activeConnection.value.id, key: row.key })
      cacheObjectAcl(result)
      return result
    } catch (error) {
      objectAclMap[row.key] = { acl: 'unknown', label: '读取失败' }
      return null
    } finally {
      delete objectAclLoadingMap[row.key]
    }
  }

  function loadObjectAclSummaries() {
    if (!activeConnection.value || typeof window.whSSH?.getObjectStorageAcl !== 'function') return
    storageObjects.value
      .filter(item => item?.key && !objectAclMap[item.key] && !objectAclLoadingMap[item.key])
      .slice(0, 50)
      .forEach(row => ensureObjectAcl({ ...row, type: 'file' }))
  }

  function formatObjectDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('zh-CN', { hour12: false })
  }

  function isSelectableObjectRow(row) {
    return ['file', 'folder'].includes(row?.type)
  }

  function handleObjectSelectionChange(rows) {
    selectedObjectRows.value = Array.isArray(rows) ? rows : []
  }

  function hasExternalDraggedFiles(event) {
    return Array.from(event?.dataTransfer?.types || []).includes('Files')
  }

  function isLeavingDropArea(event) {
    const target = event?.currentTarget
    if (!target?.getBoundingClientRect) return true
    const rect = target.getBoundingClientRect()
    return event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom
  }

  async function getExternalDraggedPaths(event) {
    const files = Array.from(event?.dataTransfer?.files || [])
    if (!files.length) return []
    const paths = typeof window.whSSH?.getDroppedFilePaths === 'function'
      ? await window.whSSH.getDroppedFilePaths(files)
      : files.map(item => String(item?.path || '').trim())
    return [...new Set((paths || []).filter(Boolean))]
  }

  async function runObjectTransfer(title, task, refresh = false) {
    objectTransfer.active = true
    objectTransfer.title = title
    objectActionLoading.value = true
    try {
      const result = await task()
      if (refresh) await loadObjects()
      return result
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '对象拖拽操作失败'), type: 'error', duration: 2400, grouping: true })
      return null
    } finally {
      objectTransfer.active = false
      objectTransfer.title = ''
      objectActionLoading.value = false
      objectDropActive.value = false
      objectDropTargetPrefix.value = ''
    }
  }

  function createUploadProgressId() {
    return `oss-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function createDownloadProgressId() {
    return `oss-download-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function bindUploadProgress(progressId, title = '正在上传对象') {
    if (uploadProgressHideTimer) {
      clearTimeout(uploadProgressHideTimer)
      uploadProgressHideTimer = null
    }
    Object.assign(uploadProgress, { visible: true, id: progressId, title, fileName: '', loadedBytes: 0, totalBytes: 0, percent: 0 })
  }

  function closeUploadProgress() {
    if (uploadProgressHideTimer) clearTimeout(uploadProgressHideTimer)
    uploadProgressHideTimer = null
    Object.assign(uploadProgress, { visible: false, id: '', title: '', fileName: '', loadedBytes: 0, totalBytes: 0, percent: 0 })
  }

  function finishUploadProgress(delay = 0) {
    if (!delay) return
    if (uploadProgressHideTimer) clearTimeout(uploadProgressHideTimer)
    uploadProgressHideTimer = setTimeout(closeUploadProgress, delay)
  }

  function getTransferStatusText(item) {
    const status = typeof item === 'string' ? item : item?.status
    const type = typeof item === 'object' ? item.type : 'upload'
    if (status === 'completed') return '完成'
    if (status === 'failed') return '失败'
    if (status === 'skipped') return '跳过'
    if (status === 'pending') return '等待'
    return type === 'download' ? '下载中' : '上传中'
  }

  function getTransferSession(map, progressId) {
    if (!map.has(progressId)) map.set(progressId, { id: progressId, lastLoadedBytes: 0, currentRecordId: '' })
    return map.get(progressId)
  }

  function getUploadTransferSession(progressId) {
    return getTransferSession(uploadTransferSessions, progressId)
  }

  function getDownloadTransferSession(progressId) {
    return getTransferSession(downloadTransferSessions, progressId)
  }

  function findTransferRecord(recordId) {
    return transferRecords.value.find(item => item.id === recordId) || null
  }

  function completeCurrentTransferRecord(session) {
    const record = findTransferRecord(session.currentRecordId)
    if (!record || ['completed', 'failed', 'skipped'].includes(record.status)) return
    record.loadedBytes = record.totalBytes
    record.percent = 100
    record.status = 'completed'
  }

  function startTransferRecord(session, payload = {}, type = 'upload') {
    completeCurrentTransferRecord(session)
    const recordId = `${payload.id}:${payload.key || payload.fileName || Date.now()}`
    let record = findTransferRecord(recordId)
    if (!record) {
      record = reactive({
        id: recordId,
        transferId: payload.id,
        type,
        status: type === 'download' ? 'downloading' : 'uploading',
        key: payload.key || '',
        fileName: payload.fileName || payload.key || '对象上传',
        loadedBytes: 0,
        totalBytes: Number(payload.size || 0),
        percent: Number(payload.size || 0) > 0 ? 0 : 100,
        createdAt: Date.now()
      })
      transferRecords.value.unshift(record)
    }
    record.status = record.totalBytes > 0 ? (type === 'download' ? 'downloading' : 'uploading') : 'completed'
    session.currentRecordId = record.id
  }

  function updateCurrentTransferRecord(session, payload = {}) {
    const record = findTransferRecord(session.currentRecordId)
    if (!record) return
    const loadedBytes = Number(payload.loadedBytes || 0)
    const delta = Math.max(0, loadedBytes - Number(session.lastLoadedBytes || 0))
    session.lastLoadedBytes = loadedBytes
    if (!record.totalBytes && Number(payload.totalBytes || 0) > 0) record.totalBytes = Number(payload.totalBytes || 0)
    record.loadedBytes = Math.min(record.totalBytes || loadedBytes, Number(record.loadedBytes || 0) + delta)
    record.percent = record.totalBytes > 0 ? Math.min(100, Math.round((record.loadedBytes / record.totalBytes) * 100)) : 100
    record.status = record.percent >= 100 ? 'completed' : (record.type === 'download' ? 'downloading' : 'uploading')
  }

  function failUploadTransferSession(progressId) {
    const session = getUploadTransferSession(progressId)
    const record = findTransferRecord(session.currentRecordId)
    if (record) record.status = 'failed'
  }

  function completeUploadTransferSession(progressId) {
    const session = getUploadTransferSession(progressId)
    completeCurrentTransferRecord(session)
    uploadTransferSessions.delete(progressId)
  }

  function failDownloadTransferSession(progressId) {
    const session = getDownloadTransferSession(progressId)
    const record = findTransferRecord(session.currentRecordId)
    if (record) record.status = 'failed'
  }

  function completeDownloadTransferSession(progressId) {
    const session = getDownloadTransferSession(progressId)
    completeCurrentTransferRecord(session)
    downloadTransferSessions.delete(progressId)
  }

  function clearCompletedTransfers() {
    transferRecords.value = transferRecords.value.filter(item => !['completed', 'skipped', 'failed'].includes(item.status))
  }

  function handleObjectStorageUploadProgress(payload = {}) {
    if (!payload?.id) return
    const session = getUploadTransferSession(payload.id)
    if (payload.phase === 'file') startTransferRecord(session, payload)
    if (payload.phase === 'progress') updateCurrentTransferRecord(session, payload)
    if (payload.phase === 'done') completeUploadTransferSession(payload.id)
    if (payload.phase === 'error') failUploadTransferSession(payload.id)
    if (payload.id !== uploadProgress.id) return
    const totalBytes = Number(payload.totalBytes || 0)
    const loadedBytes = Number(payload.loadedBytes || 0)
    const percent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : (payload.phase === 'done' ? 100 : 0)
    uploadProgress.visible = true
    uploadProgress.loadedBytes = loadedBytes
    uploadProgress.totalBytes = totalBytes
    uploadProgress.percent = percent
    if (payload.fileName) uploadProgress.fileName = payload.fileName
    if (payload.phase === 'file') uploadProgress.title = payload.multipart ? '正在分片上传对象' : '正在上传对象'
    if (payload.phase === 'progress' && payload.multipart) uploadProgress.title = '正在分片上传对象'
    if (payload.phase === 'done') {
      uploadProgress.percent = 100
      uploadProgress.title = '上传完成'
    }
    if (payload.phase === 'error') {
      uploadProgress.title = '上传失败'
    }
  }

  function handleObjectStorageDownloadProgress(payload = {}) {
    if (!payload?.id) return
    const session = getDownloadTransferSession(payload.id)
    if (payload.phase === 'file') startTransferRecord(session, payload, 'download')
    if (payload.phase === 'progress') updateCurrentTransferRecord(session, payload)
    if (payload.phase === 'done') completeDownloadTransferSession(payload.id)
    if (payload.phase === 'error') failDownloadTransferSession(payload.id)
  }

  async function uploadDraggedObjectPaths(paths, targetPrefix = currentPrefix.value) {
    if (!activeConnection.value || !paths.length) return
    const progressId = createUploadProgressId()
    bindUploadProgress(progressId, `正在上传 ${paths.length} 个项目`)
    objectDropActive.value = false
    objectDropTargetPrefix.value = ''
    window.whSSH.uploadObjectStorageObjects({
      id: activeConnection.value.id,
      prefix: targetPrefix,
      paths,
      progressId
    }).then(async result => {
      if (result?.uploaded?.length) ElMessage({ message: result.uploaded.length > 1 ? `已上传 ${result.uploaded.length} 个项目` : '文件已上传', type: 'success', duration: 1400, grouping: true })
      else if (result?.skipped) ElMessage({ message: `已跳过 ${result.skipped} 个同名对象`, type: 'info', duration: 1600, grouping: true })
      if (activeConnection.value?.id) await loadObjects()
      if (!result?.uploaded?.length) finishUploadProgress(800)
    }).catch(error => {
      failUploadTransferSession(progressId)
      ElMessage({ message: String(error?.message || error || '上传失败'), type: 'error', duration: 2400, grouping: true })
    })
  }

  function handleObjectPanelDragEnter(event) {
    if (!activeConnection.value || !hasExternalDraggedFiles(event)) return
    objectDropTargetPrefix.value = currentPrefix.value
    objectDropActive.value = true
  }

  function handleObjectPanelDragOver(event) {
    if (!activeConnection.value || !hasExternalDraggedFiles(event)) return
    event.dataTransfer.dropEffect = 'copy'
    objectDropTargetPrefix.value = currentPrefix.value
    objectDropActive.value = true
  }

  function handleObjectPanelDragLeave(event) {
    if (!isLeavingDropArea(event)) return
    objectDropActive.value = false
    objectDropTargetPrefix.value = ''
  }

  async function handleObjectPanelDrop(event) {
    if (!activeConnection.value) return
    const paths = await getExternalDraggedPaths(event)
    if (!paths.length) {
      objectDropActive.value = false
      return
    }
    await uploadDraggedObjectPaths(paths, currentPrefix.value)
  }

  function handleObjectFolderDragOver(row, event) {
    if (!activeConnection.value || !hasExternalDraggedFiles(event) || row?.type !== 'folder') return
    event.dataTransfer.dropEffect = 'copy'
    objectDropTargetPrefix.value = row.key
    objectDropActive.value = true
  }

  async function handleObjectFolderDrop(row, event) {
    if (!activeConnection.value || row?.type !== 'folder') return
    const paths = await getExternalDraggedPaths(event)
    if (!paths.length) return
    await uploadDraggedObjectPaths(paths, row.key)
  }

  function getObjectDragItems(row) {
    if (!row?.key) return []
    if (row.type === 'file' && selectedFileRows.value.some(item => item.key === row.key)) {
      return selectedFileRows.value.map(item => ({ key: item.key, type: 'file', name: item.name || item.key, size: Number(item.size || 0) }))
    }
    return [{ key: row.key, type: row.type === 'folder' ? 'folder' : 'file', name: row.name || row.key, size: Number(row.size || 0) }]
  }

  async function startObjectNativeDrag(row, event) {
    if (!activeConnection.value || !row?.key) return
    event.preventDefault()
    event.stopPropagation()
    const items = getObjectDragItems(row)
    if (!items.length) return
    const progressId = createDownloadProgressId()
    await runObjectTransfer(`正在准备拖拽下载 ${items.length} 个项目`, () => window.whSSH.startObjectStorageDrag({
      id: activeConnection.value.id,
      items,
      progressId
    }))
  }

  async function runObjectAction(task, successMessage) {
    if (!activeConnection.value) return
    objectActionLoading.value = true
    try {
      const result = await task()
      if (successMessage && !result?.canceled) ElMessage({ message: successMessage, type: 'success', duration: 1400, grouping: true })
      await loadObjects()
      return result
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '对象操作失败'), type: 'error', duration: 2400, grouping: true })
      return null
    } finally {
      objectActionLoading.value = false
    }
  }

  async function uploadObjects() {
    const progressId = createUploadProgressId()
    bindUploadProgress(progressId, '正在上传对象')
    window.whSSH.uploadObjectStorageObjects({ id: activeConnection.value.id, prefix: currentPrefix.value, progressId }).then(async result => {
      if (result?.uploaded?.length) ElMessage({ message: result.uploaded.length > 1 ? `已上传 ${result.uploaded.length} 个项目` : '文件已上传', type: 'success', duration: 1400, grouping: true })
      else if (result?.skipped) ElMessage({ message: `已跳过 ${result.skipped} 个同名对象`, type: 'info', duration: 1600, grouping: true })
      if (activeConnection.value?.id) await loadObjects()
      if (!result?.uploaded?.length) finishUploadProgress(800)
    }).catch(error => {
      failUploadTransferSession(progressId)
      ElMessage({ message: String(error?.message || error || '上传失败'), type: 'error', duration: 2400, grouping: true })
    })
  }

  async function createDirectory() {
    if (!activeConnection.value) return
    try {
      const { value } = await ElMessageBox.prompt('请输入目录名称', '新建目录', {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '目录名称不能为空'
      })
      await runObjectAction(() => window.whSSH.createObjectStorageDirectory({ id: activeConnection.value.id, prefix: currentPrefix.value, name: value }), '目录已创建')
    } catch (error) {
      if (error !== 'cancel') ElMessage({ message: String(error?.message || error || '创建目录失败'), type: 'error', duration: 2200, grouping: true })
    }
  }

  async function downloadObject(row) {
    if (!activeConnection.value || !row?.key) return
    if (row.type === 'folder') {
      await downloadObjectsToDirectory([row])
      return
    }
    const progressId = createDownloadProgressId()
    window.whSSH.downloadObjectStorageObject({ id: activeConnection.value.id, key: row.key, name: row.name || row.key, size: Number(row.size || 0), progressId }).then(result => {
      if (!result?.canceled) ElMessage({ message: '文件已下载', type: 'success', duration: 1400, grouping: true })
    }).catch(error => {
      failDownloadTransferSession(progressId)
      ElMessage({ message: String(error?.message || error || '下载失败'), type: 'error', duration: 2400, grouping: true })
    })
  }

  async function downloadSelectedObjects() {
    const targets = selectedObjectItems.value
    if (!targets.length) return
    if (targets.length === 1 && targets[0].type === 'file') {
      await downloadObject(targets[0])
      return
    }
    await downloadObjectsToDirectory(targets)
  }

  async function downloadObjectsToDirectory(rows) {
    const targets = (Array.isArray(rows) ? rows : []).filter(item => item?.key && ['file', 'folder'].includes(item.type))
    if (!activeConnection.value || !targets.length) return
    const result = await window.whSSH.chooseLocalDir()
    if (result?.canceled || !result?.path) return
    const progressId = createDownloadProgressId()
    window.whSSH.downloadObjectStorageObjectsToDirectory({
      id: activeConnection.value.id,
      localDir: result.path,
      progressId,
      items: targets.map(item => ({ key: item.key, type: item.type, name: item.name || item.key, size: Number(item.size || 0) }))
    }).then(result => {
      if (!result?.canceled) ElMessage({ message: targets.length > 1 ? `已下载 ${targets.length} 个项目` : '项目已下载', type: 'success', duration: 1400, grouping: true })
    }).catch(error => {
      failDownloadTransferSession(progressId)
      ElMessage({ message: String(error?.message || error || '下载失败'), type: 'error', duration: 2400, grouping: true })
    })
  }

  function handleObjectMoreCommand(command, row) {
    if (!row?.key) return
    if (command === 'download') return downloadObject(row)
    if (command === 'rename') return renameObject(row)
    if (command === 'permission') return openPermissionDialog(row)
    if (command === 'detail') return showObjectDetail(row)
    if (command === 'delete') return deleteObjects([row])
    return null
  }

  async function deleteObjects(rows) {
    const targets = (Array.isArray(rows) ? rows : []).filter(item => item?.key && ['file', 'folder'].includes(item?.type))
    if (!activeConnection.value || !targets.length) return
    const fileRows = targets.filter(item => item.type === 'file')
    const folderRows = targets.filter(item => item.type === 'folder')
    try {
      const message = folderRows.length
        ? `确认删除 ${folderRows.length} 个目录${fileRows.length ? `和 ${fileRows.length} 个对象` : ''}？目录下所有对象会一起删除，删除后无法恢复。`
        : `确认删除 ${fileRows.length} 个对象？删除后无法恢复。`
      await ElMessageBox.confirm(message, folderRows.length ? '删除目录' : '删除对象', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      await runObjectAction(() => window.whSSH.deleteObjectStorageObjects({
        id: activeConnection.value.id,
        keys: fileRows.map(item => item.key),
        prefixes: folderRows.map(item => item.key)
      }), folderRows.length ? '目录已删除' : '对象已删除')
    } catch (error) {
      if (error !== 'cancel') ElMessage({ message: String(error?.message || error || '删除对象失败'), type: 'error', duration: 2200, grouping: true })
    }
  }

  async function renameObject(row) {
    if (!activeConnection.value || !row?.key) return
    try {
      if (row.type === 'folder') {
        const { value } = await ElMessageBox.prompt('请输入新的目录名称', '重命名目录', {
          inputValue: String(row.name || '').replace(/\/+$/, ''),
          confirmButtonText: '保存',
          cancelButtonText: '取消',
          inputPattern: /^[^/\\]+$/,
          inputErrorMessage: '目录名称不能为空，且不能包含斜杠或反斜杠'
        })
        const targetKey = `${getObjectParentPrefix(row.key)}${String(value || '').trim().replace(/^\/+|\/+$/g, '')}/`
        await runObjectAction(() => window.whSSH.renameObjectStorageObject({ id: activeConnection.value.id, sourceKey: row.key, targetKey }), '目录已重命名')
        return
      }
      const { value } = await ElMessageBox.prompt('请输入新的对象 Key', '重命名对象', {
        inputValue: row.key,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '对象 Key 不能为空'
      })
      await runObjectAction(() => window.whSSH.renameObjectStorageObject({ id: activeConnection.value.id, sourceKey: row.key, targetKey: value }), '对象已重命名')
    } catch (error) {
      if (error !== 'cancel') ElMessage({ message: String(error?.message || error || '重命名对象失败'), type: 'error', duration: 2200, grouping: true })
    }
  }

  async function previewObject(row) {
    if (!activeConnection.value || !row?.key) return
    cleanupObjectPreviewTempFile()
    previewDialog.visible = true
    previewDialog.loading = true
    previewDialog.title = row.name || row.key
    previewDialog.fullTitle = row.key
    previewDialog.type = ''
    previewDialog.dataUrl = ''
    previewDialog.text = ''
    previewDialog.mediaUrl = ''
    previewDialog.tempPath = ''
    previewDialog.contentType = ''
    try {
      const result = await window.whSSH.previewObjectStorageObject({ id: activeConnection.value.id, key: row.key })
      previewDialog.type = result?.type || 'binary'
      previewDialog.dataUrl = result?.dataUrl || ''
      previewDialog.text = result?.text || ''
      previewDialog.mediaUrl = result?.mediaUrl || ''
      previewDialog.tempPath = result?.tempPath || ''
      previewDialog.contentType = result?.contentType || ''
    } catch (error) {
      previewDialog.type = 'binary'
      ElMessage({ message: String(error?.message || error || '预览失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      previewDialog.loading = false
    }
  }

  function cleanupObjectPreviewTempFile() {
    const tempPath = previewDialog.tempPath
    previewDialog.mediaUrl = ''
    previewDialog.tempPath = ''
    if (tempPath && typeof window.whSSH?.cleanupPreviewTempFile === 'function') {
      window.whSSH.cleanupPreviewTempFile({ path: tempPath }).catch(() => {})
    }
  }

  function showObjectDetail(row) {
    detailDialog.row = row || null
    detailDialog.visible = true
    ensureObjectAcl(row)
  }

  async function copyTextToClipboard(text, successMessage = '已复制') {
    const value = String(text || '')
    if (!value) return
    if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(value)
    ElMessage({ message: successMessage, type: 'success', duration: 1400, grouping: true })
  }

  async function copyObjectAccessUrl(row) {
    if (!row?.key) return
    try {
      await copyTextToClipboard(getObjectAccessUrl(row), '访问地址已复制')
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '复制失败'), type: 'error', duration: 2200, grouping: true })
    }
  }

  async function copyObjectSignedUrl(row) {
    if (!activeConnection.value || !row?.key) return
    signedUrlLoading.value = true
    try {
      const result = await window.whSSH.createObjectStorageSignedUrl({ id: activeConnection.value.id, key: row.key, expires: 3600 })
      await copyTextToClipboard(result?.url, '1 小时临时链接已复制')
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '生成临时链接失败'), type: 'error', duration: 2400, grouping: true })
    } finally {
      signedUrlLoading.value = false
    }
  }

  async function openPermissionDialog(row) {
    if (!activeConnection.value || !row?.key) return
    permissionDialog.row = row
    permissionDialog.acl = 'private'
    permissionDialog.grantUsers = []
    permissionDialog.visible = true
    if (row.type !== 'folder') {
      permissionDialog.loading = true
      try {
        const result = await ensureObjectAcl(row, true)
        fillPermissionDialogFromAcl(result)
      } finally {
        permissionDialog.loading = false
      }
    }
  }

  function createPermissionUser(source = {}) {
    const sourcePermissions = Array.isArray(source.permissions) ? source.permissions : [source.permission || 'read']
    return {
      id: `grant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      targetUin: String(source.targetUin || source.accountId || '').replace(/^qcs::cam::uin\//, '').trim(),
      permissions: normalizePermissionSelections(sourcePermissions)
    }
  }

  function normalizePermissionSelections(values = []) {
    const list = Array.from(new Set((Array.isArray(values) ? values : [values]).map(item => normalizePermissionValue(item)).filter(Boolean)))
    if (list.includes('full-control')) return ['full-control']
    return list.length ? list : ['read']
  }

  function normalizePermissionValue(value = '') {
    const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-')
    if (normalized === 'full-control') return 'full-control'
    if (['read', 'write', 'read-acp', 'write-acp'].includes(normalized)) return normalized
    return ''
  }

  function fillPermissionDialogFromAcl(result) {
    if (!result) return
    permissionDialog.acl = result.acl === 'public-read' ? 'public-read' : 'private'
    const grantMap = new Map()
    ;(Array.isArray(result.grants) ? result.grants : [])
      .filter(item => item?.accountId && !/AllUsers/i.test(String(item.uri || '')))
      .filter(item => !item.isOwnerGrant)
      .forEach(item => {
        const key = String(item.accountId || '')
        if (!grantMap.has(key)) grantMap.set(key, [])
        grantMap.get(key).push(item.permission)
      })
    permissionDialog.grantUsers = Array.from(grantMap.entries()).map(([targetUin, permissions]) => createPermissionUser({ targetUin, permissions }))
  }

  function togglePermissionUserPermission(item, permission, checked) {
    const current = new Set(item.permissions || [])
    if (checked) {
      if (permission === 'full-control') item.permissions = ['full-control']
      else {
        current.delete('full-control')
        current.add(permission)
        item.permissions = normalizePermissionSelections(Array.from(current))
      }
      return
    }
    current.delete(permission)
    item.permissions = normalizePermissionSelections(Array.from(current))
  }

  function addPermissionUser() {
    permissionDialog.grantUsers.push(createPermissionUser())
  }

  function removePermissionUser(index) {
    permissionDialog.grantUsers.splice(index, 1)
  }

  function getPermissionScopeText() {
    const row = permissionDialog.row
    if (!row?.key) return '-'
    return row.type === 'folder' ? `此前缀下已有对象：${row.key}` : `当前对象：${row.key}`
  }

  function getPermissionTipText() {
    if (permissionDialog.row?.type === 'folder') return '文件夹会按当前前缀批量设置已有对象权限；后续新上传对象不会自动继承，若需要继承应使用 Bucket Policy。'
    return '公开读会让知道对象地址的人可以直接读取该文件，请确认文件内容允许公开。'
  }

  function getPermissionAclText() {
    if (permissionDialog.acl === 'public-read') return '公有读私有写'
    return '私有读写'
  }

  async function submitPermissionSettings() {
    const row = permissionDialog.row
    if (!activeConnection.value || !row?.key) return
    const aclText = getPermissionAclText()
    try {
      const grantUsers = row.type === 'folder'
        ? permissionDialog.grantUsers
          .map(item => ({ ownerUin: permissionDialog.ownerUin, targetUin: String(item.targetUin || '').trim(), permissions: normalizePermissionSelections(item.permissions) }))
          .filter(item => item.targetUin)
        : []
      if (grantUsers.length) {
        if (activeConnection.value.provider !== 'cos') throw new Error('指定用户授权当前仅支持腾讯云 COS')
        if (!/^\d{5,}$/.test(permissionDialog.ownerUin)) throw new Error('请填写正确的当前账号 ID')
        const invalidUser = grantUsers.find(item => !/^\d{5,}$/.test(item.targetUin))
        if (invalidUser) throw new Error('请填写正确的被授权用户账号 ID')
      }
      if (row.type === 'folder' || permissionDialog.acl !== 'private' || grantUsers.length) {
        const grantText = grantUsers.length ? `，并设置 ${grantUsers.length} 个访问账户` : ''
        const message = row.type === 'folder'
          ? `确认将「${row.key}」前缀下已有对象设置为「${aclText}${grantText}」？\n此操作不会自动影响未来新上传对象。`
          : `确认将对象「${row.key}」设置为「${aclText}${grantText}」？\n请确认该授权符合你的访问控制要求。`
        await ElMessageBox.confirm(message, '确认权限设置', {
          type: permissionDialog.acl === 'private' && !grantUsers.length ? 'info' : 'warning',
          confirmButtonText: '确认设置',
          cancelButtonText: '取消'
        })
      }
      const payload = row.type === 'folder'
        ? { id: activeConnection.value.id, acl: permissionDialog.acl, prefixes: [row.key] }
        : { id: activeConnection.value.id, acl: permissionDialog.acl, keys: [row.key] }
      payload.grantUsers = grantUsers
      const result = await runObjectAction(() => window.whSSH.setObjectStorageAcl(payload), '权限已更新')
      if (result) {
        updateAclCacheAfterSet(result)
        permissionDialog.visible = false
      }
    } catch (error) {
      if (error !== 'cancel') ElMessage({ message: String(error?.message || error || '设置权限失败'), type: 'error', duration: 2400, grouping: true })
    }
  }

  function updateAclCacheAfterSet(result) {
    const hasGrantUsers = Array.isArray(result?.grantUsers) && result.grantUsers.length
    const label = hasGrantUsers ? '自定义授权' : (result?.acl === 'public-read' ? '公有读私有写' : '私有读写')
    const acl = hasGrantUsers ? 'custom' : (result?.acl || 'private')
    const keys = Array.isArray(result?.updated) ? result.updated : []
    keys.forEach(key => {
      objectAclMap[key] = { acl, label }
    })
  }

  async function loadObjectThumbnails() {
    if (!activeConnection.value) return
    Object.keys(thumbnailMap).forEach(key => delete thumbnailMap[key])
    const imageRows = storageObjects.value.filter(item => isObjectImageFile(item.name || item.key)).slice(0, 30)
    await Promise.all(imageRows.map(async row => {
      try {
        const result = await window.whSSH.getObjectStorageThumbnail({ id: activeConnection.value.id, key: row.key })
        if (result?.dataUrl) thumbnailMap[row.key] = result.dataUrl
      } catch (error) {}
    }))
  }

  onMounted(() => {
    if (typeof window.whSSH?.onObjectStorageUploadProgress === 'function') {
      removeObjectStorageUploadProgressListener = window.whSSH.onObjectStorageUploadProgress(handleObjectStorageUploadProgress)
    }
    if (typeof window.whSSH?.onObjectStorageDownloadProgress === 'function') {
      removeObjectStorageDownloadProgressListener = window.whSSH.onObjectStorageDownloadProgress(handleObjectStorageDownloadProgress)
    }
    loadConnections()
    window.addEventListener('click', closeConnectionContextMenu)
    window.addEventListener('blur', closeConnectionContextMenu)
  })

  onBeforeUnmount(() => {
    if (typeof removeObjectStorageUploadProgressListener === 'function') removeObjectStorageUploadProgressListener()
    if (typeof removeObjectStorageDownloadProgressListener === 'function') removeObjectStorageDownloadProgressListener()
    if (uploadProgressHideTimer) clearTimeout(uploadProgressHideTimer)
    cleanupObjectPreviewTempFile()
    window.removeEventListener('click', closeConnectionContextMenu)
    window.removeEventListener('blur', closeConnectionContextMenu)
  })
</script>

<style scoped>
  .object-storage-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }

  .object-storage-page :deep(.page-hero-line) {
    flex-wrap: nowrap;
    overflow: visible;
  }

  .object-storage-page :deep(.page-hero-line > div:first-child) {
    min-width: 0;
  }

  .object-storage-layout {
    min-height: 0;
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 12px;
  }

  .object-storage-tree-pane,
  .object-storage-card {
    border: 1px solid rgba(15, 23, 42, 0.05);
    border-radius: 6px;
    background: #ffffff;
  }

  .object-storage-page div,
  .object-storage-page section,
  .object-storage-page aside,
  .object-storage-page article,
  .object-storage-page main,
  .object-storage-page table,
  .object-storage-page tr,
  .object-storage-page th,
  .object-storage-page td,
  .object-storage-page span,
  .object-storage-page em {
    border-radius: 0 !important;
  }

  .object-storage-page :deep(.el-table),
  .object-storage-page :deep(.el-table__inner-wrapper),
  .object-storage-page :deep(.el-table__body-wrapper),
  .object-storage-page :deep(.el-scrollbar__wrap) {
    border-radius: 0 !important;
  }

  .object-storage-tree-pane {
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
    padding: 14px;
    overflow: hidden;
  }

  .object-storage-tree-head,
  .object-storage-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .object-storage-tree-head strong,
  .object-storage-card-head strong {
    color: #111827;
    font-size: 13px;
  }

  .object-storage-tree-head span,
  .object-storage-card-head span,
  .object-storage-empty {
    color: #6b7280;
    font-size: 12px;
  }

  .object-storage-card-head > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .object-storage-card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .object-storage-tree-search {
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 1px solid #a7f3d0;
    border-radius: 6px;
    background: #ecfdf5;
    color: #111827;
    font-size: 12px;
    outline: none;
    box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.08);
  }

  .object-storage-page :deep(.service-actions) {
    position: relative;
    z-index: 2;
    align-items: center;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    overflow: visible;
  }

  .object-storage-page :deep(.page-hero-line::after) {
    pointer-events: none;
  }

  .object-storage-transfer-badge {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    height: 32px;
    line-height: 1;
    overflow: visible;
    vertical-align: middle;
  }

  .object-storage-transfer-badge :deep(.object-storage-transfer-button.el-button) {
    height: 32px;
    padding: 0 12px;
    border-color: #a7f3d0;
    border-radius: 6px;
    background: #f0fdf4;
    color: #047857;
    font-size: 12px;
  }

  .object-storage-transfer-badge :deep(.object-storage-transfer-button.el-button:hover) {
    border-color: #10b981;
    background: #d1fae5;
    color: #065f46;
  }

  .object-storage-transfer-badge :deep(.el-badge__content.is-fixed) {
    top: auto;
    right: -5px;
    bottom: -5px;
    transform: none;
    height: 16px;
    min-width: 16px;
    padding: 0 4px;
    border: 0;
    background: #ef4444;
    font-size: 11px;
    line-height: 16px;
    box-shadow: 0 0 0 2px #ffffff;
  }

  .object-storage-tree-search::placeholder {
    color: #6b8f80;
    font-size: 12px;
  }

  .object-storage-tree-search:focus {
    border-color: #10b981;
    background: #ffffff;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.12);
  }

  .object-storage-tree-list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
  }

  .object-storage-tree-item {
    width: 100%;
    min-width: 0;
    min-height: 36px;
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 7px 5px 10px;
    border: 1px solid #e5e7eb;
    border-left: 3px solid transparent;
    border-radius: 6px;
    background: #ffffff;
    color: #111827;
    text-align: left;
  }

  .object-storage-tree-item:hover {
    border-color: #6ee7b7;
    border-left-color: #34d399;
    background: #ecfdf5;
  }

  .object-storage-tree-item.active {
    border-color: #10b981;
    border-left-color: #059669;
    background: linear-gradient(135deg, #d1fae5 0%, #ffffff 76%);
    color: #047857;
  }

  .object-storage-tree-select {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .object-storage-manage-button {
    flex: 0 0 auto;
    width: 28px;
    height: 24px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #047857;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .object-storage-manage-button:hover {
    color: #065f46;
  }

  .object-storage-manage-dots {
    display: inline-block;
    color: currentColor;
    font-size: 20px;
    line-height: 20px;
    transform: translateY(-1px);
  }

  .object-storage-tree-caret {
    width: 12px;
    color: #64748b;
    text-align: center;
    flex: 0 0 auto;
  }

  .object-storage-tree-icon {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #10b981;
    flex: 0 0 auto;
  }

  .object-storage-tree-content {
    min-width: 0;
    display: block;
    flex: 1 1 auto;
  }

  .object-storage-tree-title-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .object-storage-tree-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .object-storage-provider-tag {
    padding: 0 4px;
    border: 1px solid #a7f3d0;
    background: #ecfdf5;
    color: #047857;
    font-size: 10px;
    font-style: normal;
    line-height: 14px;
    flex: 0 0 auto;
  }

  .object-storage-provider-tag.is-s3 {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #2563eb;
  }

  .object-storage-provider-tag.is-aliyun-oss {
    border-color: #fed7aa;
    background: #fff7ed;
    color: #ea580c;
  }

  .object-storage-provider-tag.is-huawei-obs {
    border-color: #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  .object-storage-provider-tag.is-baidu-bos {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #1d4ed8;
  }

  .object-storage-context-menu {
    position: fixed;
    z-index: 4000;
    min-width: 128px;
    padding: 5px;
    border: 1px solid #d8e0ec;
    background: #ffffff;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
  }

  .object-storage-context-menu button {
    width: 100%;
    height: 28px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border: 0;
    background: transparent;
    color: #334155;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .object-storage-context-menu button:hover {
    background: #ecfdf5;
    color: #047857;
  }

  .object-storage-context-divider {
    height: 1px;
    margin: 4px 2px;
    background: #e5e7eb;
  }

  .object-storage-context-menu button.danger {
    color: #dc2626;
  }

  .object-storage-context-menu button.danger:hover {
    background: #fef2f2;
    color: #b91c1c;
  }

  .object-storage-main {
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
  }

  .object-storage-card {
    min-height: 0;
    display: grid;
    gap: 12px;
    padding: 14px;
    overflow: hidden;
  }

  .object-storage-browser-card {
    grid-template-rows: auto auto auto minmax(0, 1fr);
    gap: 8px;
  }

  .object-storage-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
  }

  .object-storage-form-grid--drawer {
    grid-template-columns: 1fr;
  }

  .object-storage-form-grid label {
    display: grid;
    gap: 6px;
    color: #334155;
    font-size: 12px;
  }

  .required-mark {
    color: #dc2626;
    font-style: normal;
  }

  .object-storage-form-grid input,
  .object-storage-prefix-row input,
  .object-storage-file-toolbar input {
    height: 30px;
    padding: 0 10px;
    border: 1px solid #d8e0ec;
    border-radius: 6px;
    background: #ffffff;
    color: #111827;
    font-size: 12px;
    outline: none;
  }

  .object-storage-secret-field {
    display: flex;
    align-items: center;
  }

  .object-storage-secret-field input {
    flex: 1 1 auto;
    min-width: 0;
    border-right: 0;
    border-radius: 6px 0 0 6px;
  }

  .object-storage-secret-field button {
    width: 34px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid #d8e0ec;
    border-radius: 0 6px 6px 0;
    background: #ffffff;
    color: #64748b;
    cursor: pointer;
  }

  .object-storage-secret-field button:hover {
    color: #047857;
  }

  .object-storage-prefix-row input::placeholder,
  .object-storage-file-toolbar input::placeholder {
    color: #94a3b8;
    font-size: 12px;
  }

  .object-storage-select :deep(.el-select__wrapper) {
    min-height: 32px;
    border-radius: 6px;
  }

  .object-storage-select :deep(.el-select__placeholder),
  .object-storage-select :deep(.el-select__selected-item) {
    font-size: 12px;
  }

  .object-storage-actions,
  .object-storage-prefix-row,
  .object-storage-file-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .object-storage-prefix-row input {
    flex: 1 1 auto;
    min-width: 280px;
  }

  .object-storage-pathbar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #f8fafc;
    color: #64748b;
    font-size: 12px;
    overflow: hidden;
  }

  .object-storage-pathbar button {
    border: 0;
    background: transparent;
    color: #047857;
    font-size: 12px;
    cursor: pointer;
  }

  .object-storage-pathbar button:disabled {
    color: #94a3b8;
    cursor: default;
  }

  .object-storage-prefix-row {
    min-width: 0;
  }

  .object-storage-file-toolbar {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 36px;
    padding: 6px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #ffffff;
  }

  .object-storage-file-actions {
    flex: 0 0 auto;
  }

  .object-storage-file-actions :deep(.el-button),
  .object-storage-prefix-row :deep(.el-button) {
    height: 28px;
    padding: 0 10px;
    font-size: 12px;
  }

  .object-storage-file-toolbar input {
    width: 260px;
    flex: 0 0 auto;
  }

  .object-storage-upload-progress {
    display: grid;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid #a7f3d0;
    background: #f0fdf4;
    color: #047857;
    font-size: 12px;
  }

  .object-storage-upload-progress-head,
  .object-storage-upload-progress-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .object-storage-upload-progress-head strong {
    color: #065f46;
    font-size: 12px;
  }

  .object-storage-upload-progress-head-right {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .object-storage-upload-progress-head-right button {
    width: 18px;
    height: 18px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid #a7f3d0;
    background: #ffffff;
    color: #047857;
    line-height: 1;
    cursor: pointer;
  }

  .object-storage-upload-progress-head-right button:hover {
    border-color: #10b981;
    background: #d1fae5;
  }

  .object-storage-upload-progress-meta {
    color: #64748b;
  }

  .object-storage-upload-progress-meta span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-storage-upload-progress-track {
    height: 7px;
    overflow: hidden;
    background: #d1fae5;
  }

  .object-storage-upload-progress-track span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #10b981, #22c55e);
    transition: width 0.16s ease;
  }

  .object-storage-transfer-drawer :deep(.el-drawer__body) {
    padding: 0;
    overflow: hidden;
  }

  .object-storage-transfer-drawer-body {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 14px;
    background: #f8fafc;
  }

  .object-storage-transfer-drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #334155;
    font-size: 12px;
  }

  .object-storage-transfer-drawer-head button {
    height: 26px;
    padding: 0 9px;
    border: 1px solid #d8e0ec;
    background: #ffffff;
    color: #475569;
    font-size: 12px;
    cursor: pointer;
  }

  .object-storage-transfer-drawer-head button:disabled {
    color: #94a3b8;
    cursor: not-allowed;
  }

  .object-storage-transfer-list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: auto;
  }

  .object-storage-transfer-item {
    display: grid;
    gap: 7px;
    padding: 10px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .object-storage-transfer-item-head,
  .object-storage-transfer-item-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .object-storage-transfer-item-head strong {
    min-width: 0;
    overflow: hidden;
    color: #111827;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-storage-transfer-item-head em {
    flex: 0 0 auto;
    padding: 1px 6px;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #2563eb;
    font-size: 11px;
    font-style: normal;
  }

  .object-storage-transfer-item-head em.is-completed {
    border-color: #a7f3d0;
    background: #ecfdf5;
    color: #047857;
  }

  .object-storage-transfer-item-head em.is-failed {
    border-color: #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  .object-storage-transfer-item-head em.is-skipped {
    border-color: #fde68a;
    background: #fffbeb;
    color: #b45309;
  }

  .object-storage-transfer-item-key {
    min-width: 0;
    overflow: hidden;
    color: #64748b;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-storage-transfer-item-track {
    height: 7px;
    overflow: hidden;
    background: #e2e8f0;
  }

  .object-storage-transfer-item-track span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #0ea5e9, #10b981);
    transition: width 0.16s ease;
  }

  .object-storage-transfer-item-meta {
    color: #64748b;
    font-size: 11px;
  }

  .object-storage-transfer-empty {
    display: grid;
    place-items: center;
    border: 1px dashed #cbd5e1;
    background: #ffffff;
    color: #64748b;
    font-size: 12px;
  }

  .object-storage-placeholder {
    min-height: 0;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 8px;
    padding: 34px;
    border: 1px dashed #a7f3d0;
    background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 72%);
    color: #047857;
    text-align: center;
  }

  .object-storage-placeholder p {
    max-width: 520px;
    margin: 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.6;
  }

  .object-storage-browser-body {
    position: relative;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 10px;
    overflow: hidden;
  }

  .object-storage-browser-body.is-drop-active .object-storage-el-table {
    border-color: #10b981;
    box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.25);
  }

  .object-storage-browser-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 10px;
    border: 1px solid #a7f3d0;
    background: #f0fdf4;
    color: #047857;
    font-size: 12px;
  }

  .object-storage-el-table {
    min-height: 0;
    border: 1px solid #e5e7eb;
  }

  .object-storage-el-table :deep(.el-table__inner-wrapper) {
    border: 1px solid #e5e7eb;
    border-bottom: 0;
    border-right: 0;
  }

  .object-storage-el-table :deep(th.el-table__cell),
  .object-storage-el-table :deep(td.el-table__cell) {
    border-right: 1px solid #eef2f7;
    border-bottom: 1px solid #eef2f7;
  }

  .object-storage-el-table :deep(td.el-table__cell) {
    background: #ffffff;
  }

  .object-storage-el-table :deep(.el-table__body tr:hover > td.el-table__cell) {
    background: #f8fafc;
  }

  .object-storage-el-table :deep(.el-table__cell) {
    padding: 5px 0;
    font-size: 12px;
  }

  .object-storage-el-table :deep(.cell) {
    line-height: 20px;
  }

  .object-storage-el-table :deep(.el-table__inner-wrapper),
  .object-storage-el-table :deep(.el-table__body-wrapper),
  .object-storage-el-table :deep(.el-scrollbar),
  .object-storage-el-table :deep(.el-scrollbar__wrap) {
    min-height: 0;
  }

  .object-storage-el-table :deep(.el-table__header th) {
    background: #f8fafc;
    color: #475569;
    font-weight: 600;
  }

  .object-storage-list-more {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    min-height: 32px;
    color: #64748b;
    font-size: 12px;
  }

  .object-storage-list-more :deep(.el-button) {
    height: 28px;
    padding: 0 10px;
    border-color: #a7f3d0;
    border-radius: 6px;
    background: #f0fdf4;
    color: #047857;
    font-size: 12px;
  }

  .object-storage-acl-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    height: 20px;
    padding: 0 7px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background: #f8fafc;
    color: #64748b;
    font-size: 11px;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-storage-acl-tag.is-private {
    border-color: #dbeafe;
    background: #eff6ff;
    color: #1d4ed8;
  }

  .object-storage-acl-tag.is-public {
    border-color: #fecaca;
    background: #fef2f2;
    color: #b91c1c;
  }

  .object-storage-acl-tag.is-custom {
    border-color: #fde68a;
    background: #fffbeb;
    color: #92400e;
  }

  .object-storage-acl-tag.is-prefix {
    border-color: #d1fae5;
    background: #ecfdf5;
    color: #047857;
  }

  .object-storage-name-button,
  .object-storage-file-name {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    color: #334155;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-storage-file-name[draggable="true"],
  .object-storage-name-button[draggable="true"] {
    cursor: grab;
  }

  .object-storage-file-name[draggable="true"]:active,
  .object-storage-name-button[draggable="true"]:active {
    cursor: grabbing;
  }

  .object-storage-name-button {
    width: 100%;
    border: 0;
    background: transparent;
    color: #047857;
    cursor: pointer;
    text-align: left;
  }

  .object-storage-table-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .object-storage-table-actions :deep(.el-button) {
    padding-inline: 4px;
    font-size: 12px;
  }

  .object-storage-table-actions :deep(.el-dropdown) {
    display: inline-flex;
  }

  .object-storage-thumb-button {
    width: 42px;
    height: 28px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid #e5e7eb;
    background: #f8fafc;
    color: #64748b;
    font-size: 11px;
    cursor: pointer;
    overflow: hidden;
  }

  .object-storage-thumb-button:hover {
    border-color: #10b981;
  }

  .object-storage-thumb-button img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .object-storage-thumb-empty {
    color: #94a3b8;
    font-size: 12px;
  }

  .object-storage-drop-overlay,
  .object-storage-transfer-overlay {
    position: absolute;
    inset: 42px 12px 12px;
    z-index: 12;
    display: grid;
    place-items: center;
    border: 2px dashed #10b981;
    background: rgba(240, 253, 244, 0.86);
    color: #047857;
    font-size: 14px;
    font-weight: 700;
    pointer-events: none;
    backdrop-filter: blur(2px);
  }

  .object-storage-transfer-overlay {
    border-color: #38bdf8;
    background: rgba(240, 249, 255, 0.9);
    color: #0369a1;
  }

  .object-storage-drawer-body {
    min-height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 14px;
  }

  .object-storage-drawer :deep(.el-drawer__body) {
    padding-bottom: 0;
  }

  .object-storage-drawer-tip {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid #a7f3d0;
    background: #f0fdf4;
    color: #047857;
    font-size: 12px;
    line-height: 1.6;
  }

  .object-storage-drawer-actions {
    position: sticky;
    bottom: 0;
    justify-content: flex-end;
    padding: 12px 0 16px;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
    z-index: 1;
  }

  .object-storage-drawer-actions :deep(.el-button) {
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
  }

  .object-storage-preview-state {
    display: grid;
    place-items: center;
    min-height: 220px;
    color: #64748b;
    font-size: 13px;
  }

  .object-storage-preview-dialog :deep(.el-dialog__header) {
    min-width: 0;
    padding-right: 44px;
  }

  .object-storage-preview-title {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: #111827;
    font-size: 15px;
    font-weight: 600;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-storage-preview-image {
    display: block;
    max-width: 100%;
    max-height: 70vh;
    margin: 0 auto;
    object-fit: contain;
  }

  .object-storage-preview-video {
    display: block;
    width: 100%;
    max-height: 70vh;
    background: #020617;
    outline: none;
  }

  .object-storage-preview-audio {
    display: block;
    width: 100%;
    margin: 36px 0 18px;
    outline: none;
  }

  .object-storage-preview-text {
    max-height: 70vh;
    margin: 0;
    padding: 12px;
    overflow: auto;
    border: 1px solid #e5e7eb;
    background: #0f172a;
    color: #e5e7eb;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .object-storage-detail-list {
    display: grid;
    gap: 8px;
  }

  .object-storage-detail-list div {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 8px 10px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .object-storage-detail-list span {
    color: #64748b;
    font-size: 12px;
  }

  .object-storage-detail-list strong {
    min-width: 0;
    overflow-wrap: anywhere;
    color: #111827;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.5;
  }

  .object-storage-detail-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  .object-storage-detail-actions :deep(.el-button) {
    height: 30px;
    padding: 0 12px;
    border-color: #a7f3d0;
    border-radius: 6px;
    background: #f0fdf4;
    color: #047857;
    font-size: 12px;
  }

  .object-storage-permission-body {
    display: grid;
    gap: 14px;
  }

  .object-storage-permission-target {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 10px 12px;
    border: 1px solid #d1fae5;
    background: #f0fdf4;
  }

  .object-storage-permission-target span {
    color: #047857;
    font-size: 12px;
  }

  .object-storage-permission-target strong {
    min-width: 0;
    overflow-wrap: anywhere;
    color: #111827;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.5;
  }

  .object-storage-permission-options {
    display: grid;
    gap: 8px;
  }

  .object-storage-permission-section-title {
    color: #047857;
    font-size: 12px;
    font-weight: 700;
  }

  .object-storage-permission-user-grid {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid #d1fae5;
    background: #f8fffb;
  }

  .object-storage-permission-user-grid.is-disabled {
    opacity: 0.72;
  }

  .object-storage-permission-user-head {
    display: grid;
    gap: 3px;
  }

  .object-storage-permission-user-head strong {
    color: #047857;
    font-size: 12px;
  }

  .object-storage-permission-user-head span {
    color: #64748b;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.5;
  }

  .object-storage-permission-user-grid label {
    display: grid;
    gap: 6px;
  }

  .object-storage-permission-table-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .object-storage-permission-table-head > span {
    color: #047857;
    font-size: 12px;
    font-weight: 700;
  }

  .object-storage-permission-table-head button,
  .object-storage-permission-table-row button {
    height: 28px;
    padding: 0 10px;
    border: 1px solid #a7f3d0;
    border-radius: 6px;
    background: #ecfdf5;
    color: #047857;
    font-size: 12px;
    cursor: pointer;
  }

  .object-storage-permission-table {
    display: grid;
    border: 1px solid #d1fae5;
    background: #ffffff;
  }

  .object-storage-permission-table-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px 68px;
    gap: 8px;
    align-items: center;
    padding: 8px;
    border-top: 1px solid #ecfdf5;
  }

  .object-storage-permission-table-row:first-child {
    border-top: 0;
  }

  .object-storage-permission-table-row.is-head {
    background: #f0fdf4;
    color: #047857;
    font-size: 12px;
    font-weight: 700;
  }

  .object-storage-permission-user-empty {
    padding: 10px 12px;
    border: 1px dashed #a7f3d0;
    background: #ffffff;
    color: #64748b;
    font-size: 12px;
  }

  .object-storage-permission-user-grid span {
    color: #047857;
    font-size: 12px;
    font-weight: 600;
  }

  .object-storage-permission-checks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
  }

  .object-storage-permission-checks label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #334155;
    font-size: 12px;
  }

  .object-storage-permission-checks input {
    width: 13px;
    height: 13px;
    accent-color: #10b981;
  }

  .object-storage-permission-checks span {
    color: #334155;
    font-size: 12px;
    font-weight: 500;
  }

  .object-storage-permission-user-grid input:not([type="checkbox"]),
  .object-storage-permission-user-grid select {
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 1px solid #a7f3d0;
    border-radius: 6px;
    background: #ffffff;
    color: #111827;
    font-size: 12px;
    outline: none;
  }

  .object-storage-permission-user-grid input:not([type="checkbox"]):disabled,
  .object-storage-permission-user-grid select:disabled {
    background: #f1f5f9;
    color: #94a3b8;
    cursor: not-allowed;
  }

  .object-storage-permission-tip {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid #fde68a;
    background: #fffbeb;
    color: #92400e;
    font-size: 12px;
    line-height: 1.6;
  }

  .object-storage-page {
    --el-color-primary: #111111;
    --el-color-success: #111111;
    --el-color-warning: #111111;
    --el-color-danger : #111111;
    --el-border-color: #cbd5e1;
    --el-table-border-color: #e5e7eb;
    --el-table-header-bg-color: #f8fafc;
    --el-table-row-hover-bg-color: #f8fafc;
  }

  .object-storage-page :deep(.page-hero-line) {
    min-height: 0;
    padding: 0 2px 2px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .object-storage-page :deep(.page-hero-line::after) {
    display: none;
  }

  .object-storage-tree-pane,
  .object-storage-card,
  .object-storage-pathbar,
  .object-storage-file-toolbar,
  .object-storage-el-table,
  .object-storage-el-table :deep(.el-table__inner-wrapper),
  .object-storage-permission-table {
    border-color: #d1d5db;
    background: #ffffff;
  }

  .object-storage-tree-search,
  .object-storage-form-grid input,
  .object-storage-prefix-row input,
  .object-storage-file-toolbar input,
  .object-storage-permission-user-grid input:not([type="checkbox"]),
  .object-storage-permission-user-grid select {
    border-color: #cbd5e1;
    background: #ffffff;
    box-shadow: none;
  }

  .object-storage-tree-search:focus,
  .object-storage-form-grid input:focus,
  .object-storage-prefix-row input:focus,
  .object-storage-file-toolbar input:focus,
  .object-storage-permission-user-grid input:not([type="checkbox"]):focus,
  .object-storage-permission-user-grid select:focus {
    border-color: #111111;
    box-shadow: none;
  }

  .object-storage-tree-item:hover,
  .object-storage-tree-item.active {
    border-color: #cbd5e1;
    border-left-color: #111111;
    background: #f5f5f5;
    color: #111111;
  }

  .object-storage-tree-icon {
    background: #111111;
  }

  .object-storage-manage-button,
  .object-storage-transfer-badge :deep(.object-storage-transfer-button.el-button),
  .object-storage-list-more :deep(.el-button),
  .object-storage-permission-table-head button,
  .object-storage-permission-table-row button {
    border-color: transparent;
    background: transparent;
    color: #111111;
  }

  .object-storage-manage-button:hover,
  .object-storage-transfer-badge :deep(.object-storage-transfer-button.el-button:hover),
  .object-storage-list-more :deep(.el-button:hover) {
    border-color: transparent;
    background: transparent;
    color: #111111;
  }

  .object-storage-provider-tag,
  .object-storage-provider-tag.is-s3,
  .object-storage-provider-tag.is-aliyun-oss,
  .object-storage-provider-tag.is-huawei-obs,
  .object-storage-provider-tag.is-baidu-bos,
  .object-storage-acl-tag,
  .object-storage-acl-tag.is-private,
  .object-storage-acl-tag.is-public,
  .object-storage-acl-tag.is-custom,
  .object-storage-acl-tag.is-prefix {
    border-color: #d1d5db;
    background: #ffffff;
    color: #111111;
  }

  .object-storage-upload-progress,
  .object-storage-browser-summary,
  .object-storage-placeholder,
  .object-storage-drawer-tip,
  .object-storage-permission-user-grid,
  .object-storage-permission-table-row.is-head {
    border-color: #e5e7eb;
    background: #f5f5f5;
    color: #111111;
  }

  .object-storage-upload-progress-head strong,
  .object-storage-permission-section-title,
  .object-storage-permission-user-head strong,
  .object-storage-permission-table-head > span,
  .object-storage-permission-user-grid span,
  .object-storage-name-button,
  .object-storage-pathbar button {
    color: #111111;
  }

  .object-storage-upload-progress-track,
  .object-storage-transfer-item-track {
    background: #e5e5e5;
  }

  .object-storage-upload-progress-track span,
  .object-storage-transfer-item-track span {
    background: #111111;
  }

  .object-storage-browser-body.is-drop-active .object-storage-el-table,
  .object-storage-drop-overlay,
  .object-storage-transfer-overlay {
    border-color: #111111;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: none;
    color: #111111;
  }

  .object-storage-permission-checks input {
    accent-color: #111111;
  }

  @media (max-width: 1280px) {
    .object-storage-file-actions {
      flex-wrap: wrap;
    }

    .object-storage-file-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .object-storage-file-toolbar input {
      width: 100%;
    }
  }
</style>
