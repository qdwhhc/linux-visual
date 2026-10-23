<template>
  <section class="panel accounts-panel page-section accounts-page">
    <div class="accounts-page-head">
      <div>
        <h3>连接账号管理</h3>
        <p>集中管理已保存的 SSH / SFTP 登录账号，可快速带入表单或直接连接。</p>
      </div>
    </div>
    <div class="accounts-table-toolbar">
      <strong>连接账号管理</strong>
      <input v-model.trim="accountKeywordModel" placeholder="搜索名称、主机或用户名" />
      <el-select v-model="accountProtocolFilterModel" class="accounts-filter">
        <el-option label="全部协议" value="all" />
        <el-option label="SSH" value="ssh" />
        <el-option label="SFTP" value="sftp" />
      </el-select>
      <el-button plain @click="loadConnections({ notify: true })">刷新列表</el-button>
      <el-button type="primary" @click="openNewConnection">新增账号</el-button>
    </div>
    <div class="accounts-table-shell">
      <el-table v-if="managedConnections.length" border size="small" height="100%" :data="managedConnections" :show-overflow-tooltip="tableTooltipOptions" class="manage-table account-saved-table" row-key="id" empty-text="暂无保存连接" @row-dblclick="editConnection">
        <el-table-column prop="name" label="连接名称" min-width="150" show-overflow-tooltip>
          <template #default="scope">
            <span>{{ scope.row.name || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="协议" width="74">
          <template #default="scope">
            <span>{{ (scope.row.protocol || 'ssh').toUpperCase() }}</span>
          </template>
        </el-table-column>
        <el-table-column label="主机地址" min-width="180" show-overflow-tooltip>
          <template #default="scope">
            <span>{{ scope.row.host }}:{{ scope.row.port }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="用户名" min-width="92" show-overflow-tooltip />
        <el-table-column label="认证方式" width="86">
          <template #default="scope">
            <span>{{ scope.row.authType === 'privateKey' ? '私钥' : '密码' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="144" show-overflow-tooltip>
          <template #default="scope">
            <span>{{ formatTime(scope.row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="172">
          <template #default="scope">
            <el-button link :type="isManagedConnectionActive(scope.row) ? 'danger' : 'success'" size="small" :disabled="connecting && !isManagedConnectionActive(scope.row)" @click="toggleSavedConnection(scope.row)">{{ isManagedConnectionActive(scope.row) ? '断开' : '直连' }}</el-button>
            <el-button link type="primary" size="small" @click="editConnection(scope.row)">编辑</el-button>
            <el-button link type="primary" size="small" @click="applyConnectionToLogin(scope.row)">带入</el-button>
            <el-button link type="danger" size="small" @click="removeConnection(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="empty-state">
        <strong>还没有保存的账号</strong>
        <p>先在登录弹窗里保存一个连接，或者点击右上角新增账号。</p>
      </div>
    </div>
  </section>
</template>

<script setup>
  import { computed } from 'vue'

  const props = defineProps([
    'accountKeyword',
    'accountProtocolFilter',
    'managedConnections',
    'tableTooltipOptions',
    'formatTime',
    'connecting',
    'loadConnections',
    'openNewConnection',
    'isManagedConnectionActive',
    'toggleSavedConnection',
    'editConnection',
    'applyConnectionToLogin',
    'removeConnection'
  ])

  const emit = defineEmits([
    'update:accountKeyword',
    'update:accountProtocolFilter'
  ])

  const accountKeywordModel = computed({
    get: () => props.accountKeyword,
    set: value => emit('update:accountKeyword', value)
  })

  const accountProtocolFilterModel = computed({
    get: () => props.accountProtocolFilter,
    set: value => emit('update:accountProtocolFilter', value)
  })
</script>
