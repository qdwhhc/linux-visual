<template>
  <section class="panel placeholder-panel page-section table-page">
    <div class="section-line page-hero-line">
      <div>
        <h3>日志中心</h3>
        <p>{{ logSource === 'application' ? '查看应用运行期间捕获的错误、异常退出和未处理任务。' : (logSource === 'network' ? '审计应用发起的每一次对外连接，只记录目标地址，不记录传输内容。' : (isSSHSession ? '用表格集中展示常见日志文件，点击即可查看最近内容或实时跟随。' : '当前连接不支持服务器日志命令。')) }}</p>
      </div>
      <div v-if="logSource === 'application'" class="service-actions">
        <el-button plain :loading="applicationLogLoading" @click="loadApplicationLogs({ notify: true })">刷新</el-button>
        <el-button type="danger" plain :disabled="!applicationLogInfo.size" @click="clearApplicationLogs">删除全部</el-button>
      </div>
      <div v-else-if="logSource === 'network'" class="service-actions">
        <el-button plain :loading="networkAuditLoading" @click="loadNetworkAuditLog({ notify: true })">刷新</el-button>
      </div>
      <div v-else class="service-actions">
        <select v-model.number="logLinesModel">
          <option :value="100">最近 100 行</option>
          <option :value="200">最近 200 行</option>
          <option :value="500">最近 500 行</option>
          <option :value="1000">最近 1000 行</option>
        </select>
        <el-button plain :loading="logFilesLoading" :disabled="!connected || !isSSHSession" @click="loadLogFiles({ notify: true })">刷新日志列表</el-button>
        <el-button type="primary" :disabled="!connected || !isSSHSession || !customLogPath.trim()" @click="openCustomLogPath">按路径查看</el-button>
      </div>
    </div>

    <div class="log-source-switch" role="tablist" aria-label="日志来源">
      <button type="button" :class="{ active: logSource === 'application' }" @click="switchLogSource('application')">应用日志</button>
      <button type="button" :class="{ active: logSource === 'server' }" @click="switchLogSource('server')">服务器日志</button>
      <button type="button" :class="{ active: logSource === 'network' }" @click="switchLogSource('network')">出站连接</button>
    </div>

    <div class="logs-source-content">
      <div v-if="logSourceLoading" class="logs-content-loading-mask">
        <div class="logs-content-loading-card">
          <span class="logs-content-loading-spinner"></span>
          <strong>{{ logSource === 'application' ? '正在加载应用日志...' : (logSource === 'network' ? '正在加载出站连接记录...' : '正在加载服务器日志...') }}</strong>
        </div>
      </div>

    <template v-if="logSource === 'application'">
      <div class="application-log-toolbar">
        <input v-model.trim="applicationLogKeywordModel" placeholder="搜索时间、级别、来源、错误信息或堆栈" />
        <div class="application-log-file" :title="applicationLogInfo.file">
          <span>{{ applicationLogInfo.file || '尚未生成应用日志文件' }}</span>
          <strong>{{ formatSize(applicationLogInfo.size || 0) }}<template v-if="applicationLogInfo.corruptEntries"> · {{ applicationLogInfo.corruptEntries }} 条损坏记录</template></strong>
        </div>
      </div>
      <div class="table-shell">
        <el-table v-loading="applicationLogLoading" border :data="filteredApplicationLogs" height="100%" :show-overflow-tooltip="tableTooltipOptions" row-key="id" class="log-table manage-table" empty-text="当前没有应用错误日志">
          <el-table-column type="expand" width="46">
            <template #default="{ row }">
              <div class="application-log-detail">
                <div v-if="row.stack">
                  <strong>错误堆栈</strong>
                  <pre>{{ row.stack }}</pre>
                </div>
                <div v-if="row.details">
                  <strong>附加信息</strong>
                  <pre>{{ formatApplicationLogDetails(row.details) }}</pre>
                </div>
                <span v-if="!row.stack && !row.details">该条日志没有附加详情。</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="180">
            <template #default="{ row }">{{ formatApplicationLogTime(row.time) }}</template>
          </el-table-column>
          <el-table-column label="级别" width="90">
            <template #default="{ row }"><span :class="['application-log-level', `is-${row.level || 'error'}`]">{{ applicationLogLevelLabel(row.level) }}</span></template>
          </el-table-column>
          <el-table-column prop="source" label="来源" width="190" />
          <el-table-column prop="message" label="错误信息" min-width="360" />
          <el-table-column label="操作" width="92" fixed="right" align="left">
            <template #default="{ row }">
              <button class="log-action-link log-action-link--danger" type="button" :disabled="!row.id" @click.stop="deleteApplicationLogEntry(row)">删除</button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <template v-else-if="logSource === 'network'">
      <div class="application-log-toolbar">
        <input v-model.trim="networkAuditKeyword" placeholder="搜索时间、目标地址、端口或调用位置" />
        <div class="application-log-file" :title="networkAuditInfo.file">
          <span>{{ networkAuditInfo.file || '尚未生成出站连接日志文件' }}</span>
          <strong>{{ filteredNetworkAuditEntries.length }} 条</strong>
        </div>
      </div>
      <div class="table-shell">
        <el-table v-loading="networkAuditLoading" border :data="filteredNetworkAuditEntries" height="100%" :show-overflow-tooltip="tableTooltipOptions" class="log-table manage-table" empty-text="暂无出站连接记录，连接服务器后会出现记录">
          <el-table-column label="时间" width="180" prop="time" />
          <el-table-column label="目标地址" min-width="220" prop="host" />
          <el-table-column label="端口" width="90" prop="port" />
          <el-table-column label="类型" width="90" prop="kind" />
          <el-table-column label="本机" width="80">
            <template #default="{ row }">{{ row.local ? '是' : '否' }}</template>
          </el-table-column>
          <el-table-column label="调用位置" min-width="260" prop="caller" />
        </el-table>
      </div>
    </template>

    <template v-else>
      <div class="log-toolbar logs-toolbar">
        <input v-model.trim="logKeywordModel" placeholder="搜索日志名称、目录或完整路径" />
        <input v-model.trim="customLogPathModel" placeholder="没有扫到时，可输入绝对路径直接查看，例如 /var/log/nginx/error.log" />
      </div>
      <div class="table-shell">
        <el-table ref="serverLogTableRef" v-loading="logFilesLoading" border :data="filteredLogFiles" height="100%" :show-overflow-tooltip="tableTooltipOptions" row-key="path" class="log-table manage-table" empty-text="没有扫描到日志文件，可直接输入绝对路径查看"
          @row-click="selectLogFile" @current-change="selectLogFile" @expand-change="handleServerLogExpand" @row-contextmenu="showLogContextMenu">
          <el-table-column type="expand" width="46">
            <template #default="{ row }">
              <div class="server-log-detail">
                <div class="server-log-detail-head">
                  <strong :title="row.path">{{ row.path }}</strong>
                  <button class="log-action-link log-action-link--primary" type="button" :disabled="isServerLogLoading(row)" @click.stop="handleReadServerLog(row)">
                    {{ isServerLogLoading(row) ? '刷新中' : '刷新内容' }}
                  </button>
                </div>
                <pre v-if="getServerLogContent(row)" class="server-log-output">{{ getServerLogContent(row) }}</pre>
                <span v-else class="server-log-placeholder">{{ isServerLogLoading(row) ? '正在读取日志内容...' : '展开后读取最近日志内容。' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="日志文件" min-width="220">
            <template #default="{ row }">
              <div class="log-name-cell">
                <span class="log-name-text" @dblclick.stop="openLogFile(row)">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="目录" min-width="220">
            <template #default="{ row }">{{ row.directory }}</template>
          </el-table-column>
          <el-table-column label="大小" width="120">
            <template #default="{ row }">{{ formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column label="更新时间" width="180">
            <template #default="{ row }">{{ row.modified || '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150" align="left">
            <template #default="{ row }">
              <div class="dropdown-actions log-action-group" @click.stop>
                <button class="log-action-link log-action-link--primary" type="button" :disabled="isServerLogLoading(row)" @click="handleReadServerLog(row)">
                  {{ isServerLogLoading(row) ? '加载中' : '展开查看' }}
                </button>
                <el-dropdown trigger="click" @command="handleLogMenuCommand(row, $event)">
                  <button class="log-action-link log-action-link--success" type="button">更多操作</button>
                  <template #dropdown>
                    <el-dropdown-menu>
                       <el-dropdown-item command="view">查看内容</el-dropdown-item>
                       <el-dropdown-item command="tail">{{ tailing && tailPath === row.path ? '停止跟随' : '实时跟随' }}</el-dropdown-item>
                       <el-dropdown-item command="delete" divided>删除日志文件</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
    </div>
  </section>
</template>

<script setup>
  import { computed, nextTick, onMounted, ref } from 'vue'

  const props = defineProps([
    'connected',
    'isSSHSession',
    'logLines',
    'loadLogFiles',
    'logFilesLoading',
    'customLogPath',
    'openCustomLogPath',
    'logKeyword',
    'filteredLogFiles',
    'tableTooltipOptions',
    'selectLogFile',
    'openLogFile',
    'formatSize',
    'handleLogMenuCommand',
    'deleteServerLog',
    'showNativeContextMenu',
    'tailing',
    'tailPath',
    'selectedLogFile',
    'applicationLogs',
    'filteredApplicationLogs',
    'applicationLogKeyword',
    'applicationLogLoading',
    'applicationLogInfo',
    'networkAuditEntries',
    'networkAuditLoading',
    'networkAuditInfo',
    'loadNetworkAuditLog',
    'loadApplicationLogs',
    'clearApplicationLogs',
    'deleteApplicationLogEntry',
    'serverLogContents',
    'serverLogLoadingPaths',
    'readServerLogInline'
  ])

  const emit = defineEmits(['update:logLines', 'update:logKeyword', 'update:customLogPath', 'update:applicationLogKeyword'])
  const logSource = ref('application')
  const logSourceLoading = ref(false)
  const serverLogTableRef = ref(null)
  let latestLogSourceLoadingToken = null

  onMounted(() => props.loadApplicationLogs?.())

  const logLinesModel = computed({
    get: () => props.logLines,
    set: value => emit('update:logLines', Number(value || 0))
  })

  const logKeywordModel = computed({
    get: () => props.logKeyword,
    set: value => emit('update:logKeyword', value)
  })

  const customLogPathModel = computed({
    get: () => props.customLogPath,
    set: value => emit('update:customLogPath', value)
  })

  const applicationLogKeywordModel = computed({
    get: () => props.applicationLogKeyword,
    set: value => emit('update:applicationLogKeyword', value)
  })

  const networkAuditKeyword = ref('')
  const filteredNetworkAuditEntries = computed(() => {
    const entries = Array.isArray(props.networkAuditEntries) ? props.networkAuditEntries : []
    const keyword = networkAuditKeyword.value.trim().toLowerCase()
    if (!keyword) return entries
    return entries.filter(item => [item.time, item.host, item.port, item.kind, item.caller]
      .filter(value => value !== undefined && value !== null)
      .some(value => String(value).toLowerCase().includes(keyword)))
  })

  async function switchLogSource(source) {
    logSource.value = source
    const loadingToken = Symbol(source)
    latestLogSourceLoadingToken = loadingToken
    logSourceLoading.value = true
    try {
      await nextTick()
      if (source === 'application') await props.loadApplicationLogs?.()
      else if (source === 'network') await props.loadNetworkAuditLog?.()
      else if (props.connected && props.isSSHSession) await props.loadLogFiles?.()
    } finally {
      if (latestLogSourceLoadingToken === loadingToken) logSourceLoading.value = false
    }
  }

  function showLogContextMenu(row, column, event) {
    event?.preventDefault?.()
    props.selectLogFile?.(row)
    props.showNativeContextMenu?.('server-log', row, event)
  }

  function handleServerLogExpand(row, expandedRows) {
    const expanded = Array.isArray(expandedRows) && expandedRows.some(item => item?.path === row?.path)
    if (expanded && row?.path && !getServerLogContent(row)) props.readServerLogInline?.(row)
  }

  async function handleReadServerLog(row) {
    if (!row?.path) return
    serverLogTableRef.value?.toggleRowExpansion?.(row, true)
    await nextTick()
    props.readServerLogInline?.(row, { notify: true })
  }

  function getServerLogContent(row) {
    return String(props.serverLogContents?.[row?.path] || '')
  }

  function isServerLogLoading(row) {
    return Array.isArray(props.serverLogLoadingPaths) && props.serverLogLoadingPaths.includes(row?.path)
  }

  function formatApplicationLogTime(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? String(value || '-') : date.toLocaleString('zh-CN', { hour12: false })
  }

  function applicationLogLevelLabel(level) {
    if (level === 'warning') return '警告'
    if (level === 'info') return '信息'
    return '错误'
  }

  function formatApplicationLogDetails(value) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch (error) {
      return String(value || '')
    }
  }
</script>
