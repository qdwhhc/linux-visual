<template>
  <section class="panel placeholder-panel page-section table-page">
    <div class="section-line page-hero-line">
      <div>
        <h3>Docker 容器</h3>
        <p>{{ isSSHSession ? '清楚展示容器运行状态、镜像与端口映射。' : 'SFTP 连接不支持 Docker 管理能力。' }}</p>
      </div>
      <div class="docker-toolbar">
        <label>
          <input type="checkbox" v-model="dockerUseSudoModel" /> 使用 sudo 尝试读取
        </label>
        <div class="docker-log-lines-select">
          <select v-model.number="dockerLogLinesModel">
            <option :value="100">最近 100 行日志</option>
            <option :value="200">最近 200 行日志</option>
            <option :value="500">最近 500 行日志</option>
          </select>
          <el-icon aria-hidden="true"><ArrowDown /></el-icon>
        </div>
        <el-button plain @click="loadDockerContainers({ notify: true })" :disabled="!connected || !isSSHSession || dockerLoading">
          {{ dockerLoading ? '刷新中...' : '刷新容器' }}
        </el-button>
      </div>
    </div>
    <div v-if="dockerStatusMessage" class="docker-help-box docker-status-box">{{ dockerStatusMessage }}</div>
    <div class="table-shell" v-loading="dockerLoading" element-loading-text="加载 Docker 容器...">
      <el-table border :data="dockerContainers" height="100%" :show-overflow-tooltip="tableTooltipOptions" row-key="id" class="manage-table" empty-text="暂无容器数据">
        <el-table-column label="容器名" min-width="160">
          <template #default="{ row }">{{ row.names }}</template>
        </el-table-column>
        <el-table-column label="容器 ID" width="150">
          <template #default="{ row }">{{ row.id }}</template>
        </el-table-column>
        <el-table-column label="镜像" min-width="180">
          <template #default="{ row }">{{ row.image }}</template>
        </el-table-column>
        <el-table-column label="Compose" min-width="160">
          <template #default="{ row }">{{ row.composeProject && row.composeService ? `${row.composeProject} / ${row.composeService}` : '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="240">
          <template #default="{ row }">
            <span :class="['table-status-text', dockerStatusClass(row.status)]">{{ row.status || 'unknown' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="端口" min-width="220">
          <template #default="{ row }">{{ row.ports || '无端口映射' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="left" fixed="right">
          <template #default="{ row }">
            <div class="dropdown-actions" @click.stop>
              <el-dropdown trigger="click" @command="handleDockerMenuCommand(row, $event)">
                <button class="table-action-more-link" type="button">更多操作</button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="start">启动</el-dropdown-item>
                    <el-dropdown-item command="restart">重启</el-dropdown-item>
                    <el-dropdown-item command="stop">停止</el-dropdown-item>
                    <el-dropdown-item command="processes" :disabled="!isDockerRunning(row.status)">
                      {{ dockerProcessLoading[row.id] ? '读取中...' : '查看进程' }}
                    </el-dropdown-item>
                    <el-dropdown-item command="logs">查看日志</el-dropdown-item>
                    <el-dropdown-item command="rm">删除容器</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup>
  import { ArrowDown } from '@element-plus/icons-vue'
  import { computed } from 'vue'

  const props = defineProps([
    'connected',
    'isSSHSession',
    'dockerUseSudo',
    'dockerLogLines',
    'loadDockerContainers',
    'dockerLoading',
    'dockerStatusMessage',
    'dockerContainers',
    'tableTooltipOptions',
    'dockerStatusClass',
    'handleDockerMenuCommand',
    'isDockerRunning',
    'dockerProcessLoading'
  ])

  const emit = defineEmits(['update:dockerUseSudo', 'update:dockerLogLines'])

  const dockerUseSudoModel = computed({
    get: () => props.dockerUseSudo,
    set: value => emit('update:dockerUseSudo', value)
  })

  const dockerLogLinesModel = computed({
    get: () => props.dockerLogLines,
    set: value => emit('update:dockerLogLines', Number(value || 0))
  })
</script>
