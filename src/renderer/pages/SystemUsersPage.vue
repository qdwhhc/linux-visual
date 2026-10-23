<template>
  <section class="panel placeholder-panel page-section table-page">
    <div class="section-line page-hero-line">
      <div>
        <h3>系统账户</h3>
        <p>{{ isSSHSession ? `集中管理 Linux 本机用户、登录 Shell、用户组与 ${systemUsersOverview.adminGroup || 'sudo'} 管理权限。` : 'SFTP 连接不支持系统账户管理。' }}</p>
      </div>
      <div class="service-actions">
      <el-button :disabled="!connected || !isSSHSession || systemUserLoading" @click="loadSystemUsers({ notify: true })">
          {{ systemUserLoading ? '刷新中...' : '刷新账户' }}
        </el-button>
        <el-button type="primary" :disabled="!connected || !isSSHSession" @click="openCreateSystemUserDialog">新建系统账户</el-button>
      </div>
    </div>
    <div class="management-inline-form system-user-toolbar">
      <input v-model.trim="systemUserKeywordModel" placeholder="搜索用户名、家目录、Shell 或用户组" />
      <el-select v-model="systemUserFilterModel" class="toolbar-select">
        <el-option label="全部账户" value="all" />
        <el-option label="管理员" value="admin" />
        <el-option label="普通账户" value="human" />
        <el-option label="系统账户" value="system" />
        <el-option label="已锁定" value="locked" />
      </el-select>
    </div>
    <div class="table-shell" v-loading="systemUserLoading" element-loading-text="加载系统账户...">
      <el-table border :data="filteredSystemUsers" height="100%" :show-overflow-tooltip="tableTooltipOptions" row-key="name" class="manage-table" empty-text="暂无系统账户数据">
        <el-table-column label="用户" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="家目录" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.home || '-' }}</template>
        </el-table-column>
        <el-table-column label="UID / GID" width="130">
          <template #default="{ row }">{{ row.uid }} / {{ row.gid }}</template>
        </el-table-column>
        <el-table-column label="Shell" min-width="160">
          <template #default="{ row }">{{ row.shell || '-' }}</template>
        </el-table-column>
        <el-table-column label="用户组" min-width="260">
          <template #default="{ row }">{{ row.groups?.join(', ') || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="170">
          <template #default="{ row }">
            <div class="status-stack">
              <em :class="['status-pill', row.isAdmin ? 'active' : 'neutral']">{{ row.isAdmin ? '管理员' : '普通账户' }}</em>
              <em :class="['status-pill', row.locked ? 'inactive' : 'active']">{{ row.locked ? '已锁定' : '可登录' }}</em>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="left" fixed="right">
          <template #default="{ row }">
            <div class="dropdown-actions" @click.stop>
              <el-dropdown trigger="click" @command="handleSystemUserMenuCommand(row, $event)">
                <button class="table-action-more-link" type="button">更多操作</button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">编辑权限</el-dropdown-item>
                    <el-dropdown-item command="rename" :disabled="row.name === 'root'">修改名称</el-dropdown-item>
                    <el-dropdown-item command="password">修改密码</el-dropdown-item>
                    <el-dropdown-item command="lock-toggle" :disabled="row.name === 'root'">{{ row.locked ? '解除锁定' : '锁定账户' }}</el-dropdown-item>
                    <el-dropdown-item command="delete" :disabled="row.name === 'root'">删除账户</el-dropdown-item>
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
  import { computed } from 'vue'

  const props = defineProps([
    'connected',
    'isSSHSession',
    'systemUsersOverview',
    'systemUserLoading',
    'loadSystemUsers',
    'openCreateSystemUserDialog',
    'systemUserKeyword',
    'systemUserFilter',
    'filteredSystemUsers',
    'tableTooltipOptions',
    'handleSystemUserMenuCommand'
  ])

  const emit = defineEmits(['update:systemUserKeyword', 'update:systemUserFilter'])

  const systemUserKeywordModel = computed({
    get: () => props.systemUserKeyword,
    set: value => emit('update:systemUserKeyword', value)
  })

  const systemUserFilterModel = computed({
    get: () => props.systemUserFilter,
    set: value => emit('update:systemUserFilter', value)
  })
</script>
