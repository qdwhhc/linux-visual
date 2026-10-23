<template>
  <aside class="database-tree-pane" @contextmenu.prevent="showNativeContextMenu('database-root', null, $event)">
    <div class="database-tree-head" @contextmenu.prevent.stop="showNativeContextMenu('database-root', null, $event)">
      <strong>数据库目录</strong>
      <div class="database-tree-head-actions">
        <el-dropdown trigger="click" @command="handleTreeAction">
          <el-button class="database-tree-actions-button" text circle :disabled="!databaseConnected || databaseLoading" aria-label="数据库目录操作" title="数据库目录操作">
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="refresh">刷新</el-dropdown-item>
              <el-dropdown-item command="import">导入数据库</el-dropdown-item>
              <el-dropdown-item command="create">新建数据库</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    <div v-if="databaseDatabases.length" class="database-tree-list">
      <div v-for="name in databaseDatabases" :key="name" class="database-tree-node">
        <button class="database-tree-db" :class="{ active: databaseActiveDatabase === name }" @click="toggleDatabaseTree(name)" @contextmenu.prevent.stop="showNativeContextMenu('database-db', { name }, $event)">
          <span class="database-tree-caret">{{ isDatabaseExpanded(name) ? '▾' : '▸' }}</span>
          <el-icon class="database-tree-icon"><Coin /></el-icon>
          <span class="database-tree-name">{{ name }}</span>
          <em class="database-tree-type">数据库</em>
        </button>
        <div v-if="isDatabaseExpanded(name)" class="database-tree-children">
          <div v-if="isDatabaseTreeLoading(name)" class="database-tree-empty">正在加载表列表...</div>
          <button
            v-for="item in databaseTablesByDatabase[name] || []"
            :key="`${name}-${item.name}`"
            class="database-tree-table"
            :class="{ active: databasePreview.database === name && databasePreview.table === item.name }"
            @click="openDatabaseTreeTable(name, item)"
            @contextmenu.prevent.stop="showNativeContextMenu('database-table', { database: name, name: item.name, type: item.type }, $event)"
          >
            <el-icon class="database-tree-icon"><Grid /></el-icon>
            <span class="database-tree-table-name">{{ item.name }}</span>
            <em>{{ item.type === 'view' ? '视图' : '表' }}</em>
          </button>
          <div v-if="!isDatabaseTreeLoading(name) && !(databaseTablesByDatabase[name] || []).length" class="database-tree-empty">当前数据库下暂无表或视图。</div>
        </div>
      </div>
    </div>
    <div v-else class="database-tree-empty">当前账号没有读取到可访问的数据库。</div>
  </aside>
</template>

<script setup>
  import { Coin, Grid, MoreFilled } from '@element-plus/icons-vue'

  const props = defineProps([
    'databaseConnected',
    'databaseLoading',
    'databaseDatabases',
    'createDatabase',
    'importDatabaseSqlToDatabase',
    'refreshDatabaseBrowser',
    'databaseActiveDatabase',
    'toggleDatabaseTree',
    'showNativeContextMenu',
    'isDatabaseExpanded',
    'isDatabaseTreeLoading',
    'databaseTablesByDatabase',
    'databasePreview',
    'openDatabaseTreeTable'
  ])

  function handleTreeAction(command) {
    if (command === 'refresh') return props.refreshDatabaseBrowser(true, { notify: true })
    if (command === 'import') return props.importDatabaseSqlToDatabase()
    if (command === 'create') return props.createDatabase()
  }
</script>
