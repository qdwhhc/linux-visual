<template>
  <section class="database-query-pane">
    <div class="database-sql-editor-shell">
      <div class="database-sql-toolbar">
        <div class="database-sql-history-shell">
          <el-popover v-if="databaseSqlOverflowRecords.length" placement="bottom-start" trigger="click" :width="320" popper-class="database-sql-overflow-popper">
            <template #reference>
              <button class="database-sql-overflow-btn" type="button" title="展开折叠的 SQL 记录" aria-label="展开折叠的 SQL 记录">
                <span class="database-sql-overflow-dots" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </button>
            </template>
            <div class="database-sql-overflow-list">
              <button v-for="(item, index) in databaseSqlOverflowRecords" :key="item.id" class="database-sql-overflow-item" :class="{ active: isActiveDatabaseSqlHistory(item) }" :title="item.sql || getDatabaseSqlRecordLabel(item, index)" @click="activateDatabaseSqlHistory(item.id)">
                <span class="database-sql-overflow-item-text">{{ getDatabaseSqlRecordLabel(item, index) }}</span>
                <span class="database-sql-overflow-item-close" title="关闭 SQL 记录" @click.stop="removeDatabaseSqlHistory(item, $event)">x</span>
              </button>
            </div>
          </el-popover>
          <div class="database-sql-history vscode-tabs-like">
            <button v-for="(item, index) in databaseSqlVisibleRecords" :key="item.id" class="database-sql-history-item" :class="{ active: isActiveDatabaseSqlHistory(item) }" :title="item.sql || getDatabaseSqlRecordLabel(item, index)" @click="activateDatabaseSqlHistory(item.id)">
              <span class="database-sql-history-text">{{ getDatabaseSqlRecordLabel(item, index) }}</span>
              <span class="database-sql-history-close" @click.stop="removeDatabaseSqlHistory(item, $event)">x</span>
            </button>
          </div>
          <button class="database-sql-history-add" type="button" title="新建 SQL 记录" aria-label="新建 SQL 记录" @click="appendDatabaseSqlHistory('')">+</button>
        </div>
        <div class="database-sql-toolbar-actions">
          <el-button type="primary" size="small" :loading="databaseLoading" @click="runDatabaseSql()">执行 SQL</el-button>
        </div>
      </div>
      <div class="database-sql-editor-card">
        <div :ref="setDatabaseSqlMonacoRef" class="database-sql-monaco editor-monaco"></div>
      </div>
    </div>

    <div class="database-sql-output-shell">
      <div class="database-pane-meta database-pane-meta--sql">
        <p>{{ databaseSqlResult.message || '执行 SQL 后，这里会直接显示结果。' }}</p>
      </div>
      <div v-if="databaseSqlResult.kind === 'rows'" class="database-sql-output-table-wrap database-table-wrap--scroll">
        <el-table border :data="databaseSqlResultPageRows" height="100%" :fit="true" table-layout="auto" :show-overflow-tooltip="tableTooltipOptions" class="manage-table database-data-table" empty-text="暂无查询数据" :row-class-name="databaseSqlResultRowClassName" @row-click="handleDatabaseSqlRowChange" @current-change="handleDatabaseSqlRowChange" @cell-dblclick="handleDatabaseSqlTableCellDblClick" highlight-current-row>
          <el-table-column
            v-for="column in databaseSqlResult.columns"
            :key="column.prop"
            :prop="column.prop"
            :label="column.label"
            min-width="108"
            :show-overflow-tooltip="databaseTableTooltipOptions"
          />
        </el-table>
      </div>
      <div v-else class="database-sql-output-table-wrap database-sql-empty-table-wrap">
        <div class="database-sql-empty-table">
          <strong>暂无查询数据</strong>
          <span v-if="databaseSqlResult.kind === 'command'">
            {{ databaseSqlResult.message || '命令已执行' }}，影响行数：{{ databaseSqlResult.affectedRows || 0 }}
            <template v-if="databaseSqlResult.insertId">，插入 ID：{{ databaseSqlResult.insertId }}</template>
            <template v-if="databaseSqlResult.durationMs">，耗时：{{ databaseSqlResult.durationMs }}ms</template>
          </span>
          <span v-else>输入 SQL 后点击“执行 SQL”，查询结果会显示在这里。</span>
        </div>
      </div>
      <div class="database-pagination-bar">
        <div class="database-pagination-controls">
          <span class="database-pagination-summary">
            {{ databaseSqlResult.kind === 'rows' ? `共 ${databaseSqlResult.total} 条` : '等待执行' }}
          </span>
          <template v-if="databaseSqlResult.kind === 'rows'">
            <div class="database-page-size-wrap">
              <el-select size="small" :model-value="databaseSqlResult.pageSize" class="database-page-size-select" @change="handleDatabaseSqlResultPageSizeChange">
                <el-option v-for="size in [20, 50, 100, 200]" :key="size" :label="`${size}`" :value="size" />
              </el-select>
            </div>
            <el-pagination
              size="small"
              background
              layout="prev, pager, next"
              prev-text="上一页"
              next-text="下一页"
              :total="databaseSqlResult.total"
              :current-page="databaseSqlResult.page"
              :page-size="databaseSqlResult.pageSize"
              @current-change="handleDatabaseSqlResultPageChange"
            />
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
  defineProps([
    'databaseSqlResult',
    'databaseSqlResultPageRows',
    'tableTooltipOptions',
    'databaseSqlResultRowClassName',
    'handleDatabaseSqlTableCellDblClick',
    'databaseTableTooltipOptions',
    'handleDatabaseSqlResultPageSizeChange',
    'handleDatabaseSqlResultPageChange',
    'databaseSqlOverflowRecords',
    'isActiveDatabaseSqlHistory',
    'getDatabaseSqlRecordLabel',
    'activateDatabaseSqlHistory',
    'removeDatabaseSqlHistory',
    'databaseSqlVisibleRecords',
    'appendDatabaseSqlHistory',
    'runDatabaseSql',
    'databaseLoading',
    'setDatabaseSqlMonacoRef'
  ])

  const emit = defineEmits(['update:selectedDatabaseSqlRow'])

  function handleDatabaseSqlRowChange(row) {
    emit('update:selectedDatabaseSqlRow', row || null)
  }
</script>
