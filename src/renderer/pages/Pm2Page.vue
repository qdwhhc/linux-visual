<template>
  <section class="panel placeholder-panel page-section table-page pm2-page">
    <div class="section-line page-hero-line">
      <div>
        <h3>pm2管理</h3>
        <p>{{ props.isSSHSession ? '用左侧应用目录切换 PM2 进程，右侧集中查看状态、配置、日志与操作。' : 'SFTP 连接不支持 pm2 管理能力。' }}</p>
      </div>
      <div class="service-actions">
        <el-button plain :disabled="!props.connected || !props.isSSHSession || pm2Loading" @click="refreshPm2Processes({ notify: true })">刷新</el-button>
        <el-button plain :disabled="!props.connected || !props.isSSHSession || pm2Loading" @click="handlePm2Save">pm2 save</el-button>
        <el-button plain :disabled="!props.connected || !props.isSSHSession || pm2Loading" @click="handlePm2ReloadRuntime">pm2 reload all</el-button>
      </div>
    </div>

    <template v-if="props.connected && props.isSSHSession">
      <Pm2OverviewCards :items="overviewItems" />
      <div class="pm2-layout">
        <Pm2Sidebar
          :groups="statusGroups"
          :active-id="selectedProcessId"
          :search-keyword="searchKeyword"
          :status-filter="statusFilter"
          :total="processes.length"
          @update:search-keyword="searchKeyword = $event"
          @update:status-filter="statusFilter = $event"
          @select-process="selectedProcessId = $event"
          @process-action="handlePm2ProcessAction"
          @create-process="handleCreatePm2Process"
        />
        <Pm2DetailPanel
          :process="selectedProcess"
          :session-id="props.sessionId"
          :active-tab="activeDetailTab"
          @update:active-tab="activeDetailTab = $event"
        />
      </div>
    </template>

    <div v-else class="empty-state pm2-empty-state">
      <strong>pm2 仅支持 SSH 会话</strong>
      <p>请先连接 SSH 服务器，再查看 PM2 进程目录、日志和运行配置。</p>
    </div>

    <el-drawer v-model="pm2CreateDialogVisible" direction="rtl" size="520px" title="新增 PM2 应用" class="pm2-create-drawer">
      <div class="pm2-create-dialog">
        <div class="pm2-create-grid">
          <label>
            应用名称
            <input v-model.trim="pm2CreateForm.name" placeholder="例如 app-worker" />
          </label>
          <label>
            运行模式
            <el-select v-model="pm2CreateForm.execMode" class="dialog-select">
              <el-option label="fork" value="fork" />
              <el-option label="cluster" value="cluster" />
            </el-select>
          </label>
          <label class="full-span">
            工作目录
            <RemotePathPicker v-model="pm2CreateForm.cwd" :connected="props.connected && props.isSSHSession" :session-id="props.sessionId" select-type="directory" placeholder="例如 /srv/app-worker" />
          </label>
          <label class="full-span">
            启动脚本 / 命令
            <RemotePathPicker v-model="pm2CreateForm.script" :connected="props.connected && props.isSSHSession" :session-id="props.sessionId" select-type="both" placeholder="例如 dist/server.js 或 npm -- start" />
          </label>
          <label>
            解释器
            <input v-model.trim="pm2CreateForm.interpreter" placeholder="例如 node" />
          </label>
          <label>
            实例数
            <input v-model.trim="pm2CreateForm.instances" :disabled="pm2CreateForm.execMode !== 'cluster'" placeholder="cluster 时例如 2 或 max" />
          </label>
          <label>
            Node 参数
            <input v-model.trim="pm2CreateForm.nodeArgs" placeholder="例如 --max-old-space-size=512" />
          </label>
          <label>
            环境名
            <input v-model.trim="pm2CreateForm.envName" placeholder="例如 production" />
          </label>
          <label>
            监听端口
            <input v-model.trim="pm2CreateForm.ports" placeholder="例如 3000,3001" />
          </label>
          <label>
            自动重启
            <el-select v-model="pm2CreateForm.autorestart" class="dialog-select">
              <el-option label="开启" :value="true" />
              <el-option label="关闭" :value="false" />
            </el-select>
          </label>
        </div>

        <div class="pm2-create-preview">
          <strong>命令预览</strong>
          <pre>{{ pm2CreateCommandPreview }}</pre>
        </div>
      </div>
      <template #footer>
        <div class="pm2-create-drawer-footer">
          <el-button @click="pm2CreateDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="pm2Loading" @click="submitPm2CreateDialog">创建并启动</el-button>
        </div>
      </template>
    </el-drawer>
  </section>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import RemotePathPicker from '../components/common/RemotePathPicker.vue'
  import Pm2DetailPanel from '../components/pm2/Pm2DetailPanel.vue'
  import Pm2OverviewCards from '../components/pm2/Pm2OverviewCards.vue'
  import Pm2Sidebar from '../components/pm2/Pm2Sidebar.vue'

  function createPm2AppForm() {
    return {
      name: '',
      cwd: '',
      script: '',
      execMode: 'fork',
      instances: '1',
      interpreter: 'node',
      nodeArgs: '',
      envName: 'production',
      ports: '',
      autorestart: true
    }
  }

  const props = defineProps({
    connected: {
      type: Boolean,
      default: false
    },
    sessionId: {
      type: String,
      default: ''
    },
    isSSHSession: {
      type: Boolean,
      default: false
    }
  })

  const processes = ref([])
  const pm2Loading = ref(false)
  const searchKeyword = ref('')
  const statusFilter = ref('all')
  const selectedProcessId = ref('')
  const activeDetailTab = ref('overview')
  const pm2CreateDialogVisible = ref(false)
  const pm2CreateForm = ref(createPm2AppForm())

  const filteredProcesses = computed(() => {
    const keyword = String(searchKeyword.value || '').trim().toLowerCase()
    return processes.value.filter(item => {
      if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
      if (!keyword) return true
      return [item.name, item.script, item.cwd].some(value => String(value || '').toLowerCase().includes(keyword))
    })
  })

  const statusGroups = computed(() => {
    const groups = [
      { key: 'online', label: '在线', items: [] },
      { key: 'errored', label: '异常', items: [] },
      { key: 'stopped', label: '已停止', items: [] }
    ]
    for (const item of filteredProcesses.value) {
      const target = groups.find(group => group.key === item.status)
      if (target) target.items.push(item)
    }
    return groups
  })

  function formatTotalCpu(value) {
    const target = Number(value || 0)
    if (!Number.isFinite(target) || target <= 0) return '0%'
    return `${target >= 10 ? target.toFixed(0) : target.toFixed(1).replace(/\.0$/, '')}%`
  }

  function formatTotalMemory(bytes) {
    const value = Number(bytes || 0)
    if (!Number.isFinite(value) || value <= 0) return '0MB'
    const mb = value / 1024 / 1024
    if (mb >= 1024) {
      const gb = mb / 1024
      return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)}GB`
    }
    return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1).replace(/\.0$/, '')}MB`
  }

  const overviewItems = computed(() => {
    const list = processes.value
    const onlineCount = list.filter(item => item.status === 'online').length
    const erroredCount = list.filter(item => item.status === 'errored').length
    const stoppedCount = list.filter(item => item.status === 'stopped').length
    const totalCpu = list.reduce((sum, item) => sum + Number(item.cpuValue || 0), 0)
    const totalMemory = list.reduce((sum, item) => sum + Number(item.memoryBytes || 0), 0)
    return [
      { key: 'total', label: '总进程', value: String(list.length), tone: 'info' },
      { key: 'online', label: '在线', value: `数量：${onlineCount}`, tone: 'active' },
      { key: 'errored', label: '异常', value: `数量：${erroredCount}`, tone: 'danger' },
      { key: 'stopped', label: '停止', value: `数量：${stoppedCount}`, tone: 'warning' },
      { key: 'cpu', label: '总 CPU', value: formatTotalCpu(totalCpu), tone: 'cpu' },
      { key: 'memory', label: '总内存', value: formatTotalMemory(totalMemory), tone: 'memory' }
    ]
  })

  const selectedProcess = computed(() => {
    const fromFiltered = filteredProcesses.value.find(item => item.id === selectedProcessId.value)
    return fromFiltered || filteredProcesses.value[0] || null
  })

  const pm2CreateCommandPreview = computed(() => {
    const form = pm2CreateForm.value
    const segments = ['pm2 start']
    const script = String(form.script || '').trim() || '<script>'
    segments.push(script)
    if (form.name.trim()) segments.push(`--name ${form.name.trim()}`)
    if (form.cwd.trim()) segments.push(`--cwd ${form.cwd.trim()}`)
    if (form.interpreter.trim()) segments.push(`--interpreter ${form.interpreter.trim()}`)
    if (form.execMode === 'cluster') segments.push(`-i ${String(form.instances || '1').trim() || '1'}`)
    if (form.nodeArgs.trim()) segments.push(`--node-args "${form.nodeArgs.trim()}"`)
    if (form.autorestart === false) segments.push('--no-autorestart')
    return `${form.envName.trim() || form.ports.trim() ? 'env ' : ''}${form.envName.trim() ? `NODE_ENV='${form.envName.trim()}' ` : ''}${form.ports.trim() ? `PORT='${form.ports.trim()}' ` : ''}${segments.join(' ')}`.trim()
  })

  function mergeProcessLogs(nextList = []) {
    const logsById = new Map(processes.value.map(item => [item.id, Array.isArray(item.logs) ? item.logs : []]))
    return nextList.map(item => ({ ...item, logs: logsById.get(item.id) || [] }))
  }

  async function refreshPm2Processes(options = {}) {
    if (!props.connected || !props.isSSHSession || !props.sessionId) return
    const { preserveSelection = true, notify = false } = options
    const previousSelectedId = selectedProcessId.value
    pm2Loading.value = true
    try {
      const list = await window.whSSH.listPm2Processes(props.sessionId)
      processes.value = mergeProcessLogs(Array.isArray(list) ? list : [])
      if (!preserveSelection) {
        selectedProcessId.value = processes.value[0]?.id || ''
      } else if (previousSelectedId && processes.value.some(item => item.id === previousSelectedId)) {
        selectedProcessId.value = previousSelectedId
      }
      if (notify) ElMessage({ message: 'PM2 进程列表已刷新', type: 'success', duration: 1400, grouping: true })
    } catch (error) {
      processes.value = []
      selectedProcessId.value = ''
      ElMessage({ message: String(error?.message || error || '读取 PM2 列表失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      pm2Loading.value = false
    }
  }

  function updateProcessItem(id, updater) {
    processes.value = processes.value.map(item => item.id === id ? updater({ ...item }) : item)
  }

  async function refreshPm2ProcessDetail(targetId = selectedProcessId.value) {
    const item = processes.value.find(current => current.id === targetId)
    if (!item || !props.sessionId) return
    try {
      const detail = await window.whSSH.getPm2ProcessDetail({
        sessionId: props.sessionId,
        pmId: item.pmId,
        name: item.name,
        target: Number.isFinite(Number(item.pmId)) && Number(item.pmId) >= 0 ? String(item.pmId) : item.name
      })
      updateProcessItem(item.id, current => ({
        ...current,
        ...detail,
        logs: Array.isArray(current.logs) ? current.logs : []
      }))
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '读取 PM2 详情失败'), type: 'error', duration: 2200, grouping: true })
    }
  }

  async function loadPm2ProcessLogs(targetId = selectedProcessId.value) {
    const item = processes.value.find(current => current.id === targetId)
    if (!item || !props.sessionId) return
    updateProcessItem(item.id, current => ({ ...current, logs: ['正在读取日志...'] }))
    try {
      const logs = await window.whSSH.readPm2Logs({
        sessionId: props.sessionId,
        pmId: item.pmId,
        name: item.name,
        lines: 200,
        target: Number.isFinite(Number(item.pmId)) && Number(item.pmId) >= 0 ? String(item.pmId) : item.name
      })
      updateProcessItem(item.id, current => ({ ...current, logs: Array.isArray(logs) && logs.length ? logs : ['暂无日志输出'] }))
    } catch (error) {
      updateProcessItem(item.id, current => ({ ...current, logs: [String(error?.message || error || '读取 PM2 日志失败')] }))
      ElMessage({ message: String(error?.message || error || '读取 PM2 日志失败'), type: 'error', duration: 2200, grouping: true })
    }
  }

  async function renamePm2Process(item) {
    try {
      const result = await ElMessageBox.prompt('请输入新的 PM2 进程名称', '重命名进程', {
        inputValue: item.name,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '请输入名称'
      })
      const nextName = String(result.value || '').trim()
      if (!nextName || nextName === item.name) return
      pm2Loading.value = true
      await window.whSSH.renamePm2Process({
        sessionId: props.sessionId,
        pmId: item.pmId,
        name: item.name,
        target: Number.isFinite(Number(item.pmId)) ? String(item.pmId) : item.name,
        nextName
      })
      await refreshPm2Processes({ preserveSelection: false })
      const renamed = processes.value.find(current => current.name === nextName)
      if (renamed) selectedProcessId.value = renamed.id
      ElMessage({ message: '进程名称已更新', type: 'success', duration: 1400, grouping: true })
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage({ message: String(error?.message || error || '重命名失败'), type: 'error', duration: 2200, grouping: true })
      }
    } finally {
      pm2Loading.value = false
    }
  }

  async function deletePm2Process(item) {
    try {
      await ElMessageBox.confirm(`确认删除 PM2 进程 ${item.name}？`, '删除进程', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      pm2Loading.value = true
      await window.whSSH.pm2Action({ sessionId: props.sessionId, action: 'delete', target: Number.isFinite(Number(item.pmId)) ? String(item.pmId) : item.name })
      await refreshPm2Processes({ preserveSelection: false })
      ElMessage({ message: '进程已删除', type: 'success', duration: 1200, grouping: true })
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage({ message: String(error?.message || error || '删除失败'), type: 'error', duration: 2200, grouping: true })
      }
    } finally {
      pm2Loading.value = false
    }
  }

  async function startPm2Process(item) {
    try {
      pm2Loading.value = true
      await window.whSSH.pm2Action({ sessionId: props.sessionId, action: 'start', target: Number.isFinite(Number(item.pmId)) ? String(item.pmId) : item.name })
      await refreshPm2Processes()
      ElMessage({ message: `已启动 ${item.name}`, type: 'success', duration: 1200, grouping: true })
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '启动失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      pm2Loading.value = false
    }
  }

  async function stopPm2Process(item) {
    try {
      await ElMessageBox.confirm(`确认停止 PM2 进程 ${item.name}？`, '停止进程', {
        type: 'warning',
        confirmButtonText: '停止',
        cancelButtonText: '取消'
      })
      pm2Loading.value = true
      await window.whSSH.pm2Action({ sessionId: props.sessionId, action: 'stop', target: Number.isFinite(Number(item.pmId)) ? String(item.pmId) : item.name })
      await refreshPm2Processes()
      ElMessage({ message: `已停止 ${item.name}`, type: 'success', duration: 1200, grouping: true })
    } catch (error) {
      if (error !== 'cancel') ElMessage({ message: String(error?.message || error || '停止失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      pm2Loading.value = false
    }
  }

  async function restartPm2Process(item) {
    try {
      await ElMessageBox.confirm(`确认重启 PM2 进程 ${item.name}？`, '重启进程', {
        type: 'warning',
        confirmButtonText: '重启',
        cancelButtonText: '取消'
      })
      pm2Loading.value = true
      await window.whSSH.pm2Action({ sessionId: props.sessionId, action: 'restart', target: Number.isFinite(Number(item.pmId)) ? String(item.pmId) : item.name })
      await refreshPm2Processes()
      ElMessage({ message: `已重启 ${item.name}`, type: 'success', duration: 1200, grouping: true })
    } catch (error) {
      if (error !== 'cancel') ElMessage({ message: String(error?.message || error || '重启失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      pm2Loading.value = false
    }
  }

  function handleCreatePm2Process() {
    pm2CreateForm.value = createPm2AppForm()
    pm2CreateDialogVisible.value = true
  }

  async function submitPm2CreateDialog() {
    const form = pm2CreateForm.value
    if (!form.name.trim()) {
      ElMessage({ message: '请填写应用名称', type: 'warning', duration: 1600, grouping: true })
      return
    }
    if (!form.cwd.trim()) {
      ElMessage({ message: '请填写工作目录', type: 'warning', duration: 1600, grouping: true })
      return
    }
    if (!form.script.trim()) {
      ElMessage({ message: '请填写启动脚本或命令', type: 'warning', duration: 1600, grouping: true })
      return
    }
    try {
      pm2Loading.value = true
      await window.whSSH.validatePm2CreateDraft({ ...form, sessionId: props.sessionId })
      await window.whSSH.createPm2Process({ ...form, sessionId: props.sessionId })
      pm2CreateDialogVisible.value = false
      await refreshPm2Processes({ preserveSelection: false })
      const created = processes.value.find(item => item.name === form.name.trim())
      if (created) selectedProcessId.value = created.id
      activeDetailTab.value = 'overview'
      ElMessage({ message: `已创建 ${form.name.trim()}`, type: 'success', duration: 1400, grouping: true })
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '创建 PM2 应用失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      pm2Loading.value = false
    }
  }

  async function handlePm2Save() {
    try {
      pm2Loading.value = true
      await window.whSSH.savePm2ProcessList(props.sessionId)
      ElMessage({ message: 'PM2 进程列表已保存', type: 'success', duration: 1400, grouping: true })
    } catch (error) {
      ElMessage({ message: String(error?.message || error || '保存 PM2 进程列表失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      pm2Loading.value = false
    }
  }

  async function handlePm2ReloadRuntime() {
    try {
      await ElMessageBox.confirm('确认对全部 PM2 应用执行 reload？这会重载当前进程列表中的所有应用。', '重载全部应用', {
        type: 'warning',
        confirmButtonText: '重载全部应用',
        cancelButtonText: '取消'
      })
      pm2Loading.value = true
      await window.whSSH.reloadPm2Runtime(props.sessionId)
      await refreshPm2Processes()
      ElMessage({ message: '已重载全部 PM2 应用', type: 'success', duration: 1400, grouping: true })
    } catch (error) {
      if (error !== 'cancel') ElMessage({ message: String(error?.message || error || '重载全部应用失败'), type: 'error', duration: 2200, grouping: true })
    } finally {
      pm2Loading.value = false
    }
  }

  async function handlePm2ProcessAction(payload) {
    const item = payload?.item
    const action = String(payload?.action || '').trim()
    if (!item?.id || !action) return
    selectedProcessId.value = item.id
    if (action === 'logs') {
      activeDetailTab.value = 'logs'
      await loadPm2ProcessLogs(item.id)
      return
    }
    if (action === 'start') return startPm2Process(item)
    if (action === 'stop') return stopPm2Process(item)
    if (action === 'restart') return restartPm2Process(item)
    if (action === 'rename') return renamePm2Process(item)
    if (action === 'delete') return deletePm2Process(item)
  }

  watch(filteredProcesses, list => {
    if (!list.length) {
      selectedProcessId.value = ''
      return
    }
    if (!list.some(item => item.id === selectedProcessId.value)) {
      selectedProcessId.value = list[0].id
    }
  }, { immediate: true })

  watch(() => props.sessionId, async () => {
    processes.value = []
    selectedProcessId.value = ''
    if (props.connected && props.isSSHSession && props.sessionId) {
      await refreshPm2Processes({ preserveSelection: false })
    }
  }, { immediate: true })

  watch(() => props.connected, async value => {
    if (!value) {
      processes.value = []
      selectedProcessId.value = ''
      return
    }
    if (props.isSSHSession && props.sessionId) {
      await refreshPm2Processes({ preserveSelection: false })
    }
  })

  watch(() => props.isSSHSession, async value => {
    if (!value) {
      processes.value = []
      selectedProcessId.value = ''
      return
    }
    if (props.connected && props.sessionId) {
      await refreshPm2Processes({ preserveSelection: false })
    }
  })

  watch(() => activeDetailTab.value, async tab => {
    if (tab === 'logs' && selectedProcessId.value) {
      await loadPm2ProcessLogs(selectedProcessId.value)
    }
  })

  watch(() => selectedProcessId.value, async value => {
    if (value) {
      await refreshPm2ProcessDetail(value)
    }
    if (activeDetailTab.value === 'logs' && value) {
      await loadPm2ProcessLogs(value)
    }
  })
</script>

<style scoped>
  .pm2-page {
    display           : grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap               : 14px;
    min-width         : 0;
    overflow          : hidden;
  }

  .pm2-page > * {
    min-height: 0;
    min-width : 0;
  }

  .pm2-layout {
    min-height           : 0;
    min-width            : 0;
    display              : grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap                  : 12px;
    overflow             : hidden;
    align-items          : stretch;
    position             : relative;
    z-index              : 1;
  }

  :deep(.pm2-overview-strip) {
    position: relative;
    z-index : 2;
  }

  .pm2-layout > * {
    min-height: 0;
    min-width : 0;
  }

  .pm2-empty-state {
    margin-top: 4px;
  }

  :deep(.pm2-create-drawer .el-drawer__header) {
    margin-bottom: 0;
    padding      : 16px 18px 14px;
    border-bottom: 1px solid #e5e7eb;
  }

  :deep(.pm2-create-drawer .el-drawer__title) {
    color      : #111827;
    font-size  : 15px;
    font-weight: 700;
  }

  :deep(.pm2-create-drawer .el-drawer__body) {
    min-height: 0;
    padding   : 16px 18px;
    overflow  : auto;
    background: #f8fafc;
  }

  :deep(.pm2-create-drawer .el-drawer__footer) {
    padding   : 12px 18px 16px;
    border-top: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .pm2-create-dialog {
    display: grid;
    min-width: 0;
    gap    : 16px;
  }

  .pm2-create-grid {
    display              : grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap                  : 14px;
    min-width            : 0;
    padding              : 14px;
    border               : 1px solid #e5e7eb;
    border-radius        : 8px;
    background           : #ffffff;
  }

  .pm2-create-grid label {
    min-width  : 0;
    color      : #374151;
    font-size  : 13px;
    font-weight: 400;
  }

  .pm2-create-grid input {
    height       : 36px;
    padding      : 0 12px;
    border       : 1px solid #d1d5db;
    border-radius: 4px;
    background   : #ffffff;
    color        : #111827;
    outline      : none;
    transition   : border-color 0.18s ease, box-shadow 0.18s ease;
  }

  .pm2-create-grid input:focus {
    border-color: rgba(34, 197, 94, 0.55);
    box-shadow  : 0 0 0 2px rgba(34, 197, 94, 0.1);
  }

  .pm2-create-grid :deep(.el-select__wrapper) {
    min-height   : 36px;
    border-radius: 4px;
    box-shadow   : 0 0 0 1px #d1d5db inset;
  }

  .pm2-create-grid :deep(.el-select__wrapper.is-focused),
  .pm2-create-grid :deep(.el-select__wrapper:hover) {
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.55) inset, 0 0 0 2px rgba(34, 197, 94, 0.1);
  }

  .pm2-create-grid :deep(.remote-path-picker) {
    min-height: 36px;
  }

  .pm2-create-grid :deep(.remote-path-picker-input) {
    min-height : 34px;
    caret-color: #16a34a;
  }

  .pm2-create-grid :deep(.remote-path-picker-btn) {
    width     : 34px;
    min-height: 34px;
  }

  .pm2-create-preview {
    display      : grid;
    gap          : 8px;
    min-width    : 0;
    padding      : 12px 14px;
    border       : 1px solid #dbeafe;
    border-radius: 10px;
    background   : #eff6ff;
  }

  .pm2-create-preview strong {
    color    : #1e3a8a;
    font-size: 13px;
  }

  .pm2-create-preview pre {
    margin      : 0;
    color       : #1f2937;
    font-family : Consolas, 'Courier New', monospace;
    font-size   : 12px;
    line-height : 1.7;
    white-space : pre-wrap;
    word-break  : break-word;
  }

  .pm2-create-drawer-footer {
    display        : flex;
    align-items    : center;
    justify-content: flex-end;
    gap            : 10px;
  }

  @media (max-width: 1080px) {
    .pm2-layout {
      grid-template-columns: 1fr;
      grid-template-rows   : minmax(220px, 280px) minmax(0, 1fr);
    }

    .pm2-create-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 1180px) {
    :deep(.pm2-create-drawer.el-drawer) {
      width: min(520px, 92vw) !important;
    }
  }
</style>
