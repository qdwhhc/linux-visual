<template>
  <section class="panel placeholder-panel page-section table-page">
    <div class="section-line page-hero-line">
      <div>
        <h3>服务管理</h3>
        <p>{{ isSSHSession ? '明确展示服务当前状态，并支持启动、重启和停止。' : 'SFTP 连接不支持执行远程服务命令。' }}</p>
      </div>
      <el-button plain @click="loadServices({ notify: true })" :disabled="!connected || !isSSHSession || serviceLoading">{{ serviceLoading ? '刷新中...' : '刷新服务' }}</el-button>
    </div>
    <div class="table-shell" v-loading="serviceLoading" element-loading-text="加载服务状态...">
      <el-table border :data="services" height="100%" :show-overflow-tooltip="tableTooltipOptions" row-key="key" class="manage-table" empty-text="暂无服务数据">
        <el-table-column label="服务名" min-width="140">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="服务标识" min-width="120">
          <template #default="{ row }">{{ row.key }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <span :class="['table-status-text', serviceStatusClass(row.status)]">{{ serviceStatusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="280">
          <template #default="{ row }">{{ serviceStatusHint(row.status) }}</template>
        </el-table-column>
        <el-table-column label="控制方式" min-width="140">
          <template #default="{ row }">{{ row.key === 'pm2' ? '暂不支持直接控制' : 'systemctl' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="left" fixed="right">
          <template #default="{ row }">
            <div class="dropdown-actions" @click.stop>
              <el-dropdown trigger="click" @command="handleServiceMenuCommand(row, $event)">
                <button class="table-action-more-link" type="button">更多操作</button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="start" :disabled="row.key === 'pm2'">启动</el-dropdown-item>
                    <el-dropdown-item command="restart" :disabled="row.key === 'pm2'">重启</el-dropdown-item>
                    <el-dropdown-item command="stop" :disabled="row.key === 'pm2'">停止</el-dropdown-item>
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
  defineProps([
    'connected',
    'isSSHSession',
    'serviceLoading',
    'loadServices',
    'services',
    'tableTooltipOptions',
    'serviceStatusClass',
    'serviceStatusLabel',
    'serviceStatusHint',
    'handleServiceMenuCommand'
  ])
</script>
