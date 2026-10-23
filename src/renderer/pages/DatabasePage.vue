<template>
  <section class="panel placeholder-panel page-section database-page">
    <el-dialog v-model="databaseLoginVisibleModel" title="连接数据库" width="720px" align-center class="login-dialog database-login-dialog">
      <section class="connect-panel connect-panel-scroller database-login-panel">
        <div class="database-dialog-grid">
          <label class="database-dialog-field">
            <span>连接名称：</span>
            <input v-model.trim="databaseForm.name" placeholder="例如 生产数据库" />
          </label>
          <label class="database-dialog-field">
            <span>数据库类型：</span>
            <el-select v-model="databaseForm.type" @change="handleDatabaseTypeChange">
              <el-option label="MySQL" value="mysql" />
              <el-option label="MariaDB" value="mariadb" />
              <el-option label="SQL Server" value="sqlserver" />
            </el-select>
          </label>
          <label class="database-dialog-field">
            <span>主机地址：</span>
            <input v-model.trim="databaseForm.host" placeholder="例如 127.0.0.1 或 db.example.com" />
          </label>
          <label class="database-dialog-field">
            <span>端口：</span>
            <input v-model.number="databaseForm.port" :placeholder="databaseForm.type === 'sqlserver' ? '1433' : '3306'" />
          </label>
          <label class="database-dialog-field">
            <span>用户名：</span>
            <input v-model.trim="databaseForm.username" placeholder="例如 root" />
          </label>
          <label class="database-dialog-field">
            <span>密码：</span>
            <input v-model="databaseForm.password" type="password" placeholder="请输入数据库密码" />
          </label>
          <label class="database-dialog-field full-span">
            <span>默认库：</span>
            <input v-model.trim="databaseForm.database" placeholder="可选，例如 app_prod" />
          </label>
        </div>
        <div class="login-options database-tunnel-options">
          <el-checkbox v-model="databaseForm.useSshTunnel" :disabled="!connected || !isSSHSession">通过当前 SSH 会话连接</el-checkbox>
          <span>
            {{ connected && isSSHSession
              ? '适合连接远程服务器上的 127.0.0.1:3306，不需要额外开放数据库端口。'
              : '需要先连接一个 SSH 服务器后，才能通过当前 SSH 会话连接数据库。' }}
          </span>
        </div>
        <div class="button-line">
          <el-button type="primary" :loading="databaseConnecting" @click="submitDatabaseLoginDialog">{{ databaseConnecting ? (databaseLoginMode === 'connect' ? '连接中...' : '保存中...') : (databaseLoginMode === 'connect' ? '连接数据库' : '保存') }}</el-button>
          <el-button plain @click="databaseLoginVisibleModel = false">取消</el-button>
        </div>
      </section>
    </el-dialog>

    <el-dialog v-model="databaseConnectionChooserVisible" title="更换数据库连接" width="820px" align-center class="login-dialog database-connection-chooser-dialog">
      <section class="database-connection-chooser-panel">
        <div class="database-empty-head database-connection-chooser-head">
          <div>
            <strong>已保存连接</strong>
            <p>选择一个已保存连接进行切换，或新建一个数据库连接。</p>
          </div>
          <el-button type="primary" @click="openCreateDatabaseConnectionFromChooser">新建连接</el-button>
        </div>
        <el-table border size="small" max-height="420" :data="databaseSavedConnections" :show-overflow-tooltip="tableTooltipOptions" class="manage-table database-saved-table" empty-text="暂无已保存数据库连接" row-key="id" @row-dblclick="connectSavedDatabaseConnectionFromChooser">
          <el-table-column prop="name" label="连接名称" min-width="180">
            <template #default="scope">
              <span>{{ scope.row.name || scope.row.host || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="主机地址" min-width="220">
            <template #default="scope">
              <span>{{ scope.row.host || '-' }}:{{ scope.row.port || 3306 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="username" label="用户名" min-width="120" />
          <el-table-column label="连接方式" min-width="130">
            <template #default="scope">
              <span>{{ scope.row.useSshTunnel ? 'SSH 隧道' : '直连' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="scope">
              <el-button link type="primary" size="small" :disabled="scope.row.useSshTunnel && (!connected || !isSSHSession || !sessionId)" @click="connectSavedDatabaseConnectionFromChooser(scope.row)">连接</el-button>
              <el-button link type="primary" size="small" @click="editSavedDatabaseConnectionFromChooser(scope.row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="removeSavedDatabaseConnection(scope.row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </el-dialog>

    <el-drawer v-model="databaseRowDialog.open" :title="databaseRowDialog.mode === 'create' ? `向 ${databaseRowDialog.table} 新增数据` : `编辑 ${databaseRowDialog.table} 的数据行`" size="560px" direction="rtl" class="database-row-drawer database-row-dialog" :close-on-click-modal="false" destroy-on-close>
      <section class="connect-panel connect-panel-scroller database-row-dialog-panel">
        <div class="database-row-form database-row-drawer-form">
          <label v-for="field in databaseRowDialog.fields" :key="field.name" class="database-row-field">
            <div class="database-row-field-head">
              <span>{{ field.label }}</span>
              <em>{{ field.type || 'text' }}</em>
            </div>
            <div class="database-row-field-tags">
              <span v-if="field.readOnly" class="database-row-field-tag database-row-field-tag--readonly">只读</span>
              <span v-if="field.identity" class="database-row-field-tag database-row-field-tag--identity">定位列</span>
              <span v-if="field.nullable" class="database-row-field-tag">可为空</span>
            </div>
            <label v-if="field.nullable && !field.readOnly" class="database-row-null-toggle">
              <input type="checkbox" :checked="field.useNull" @change="toggleDatabaseRowFieldNull(field, $event.target.checked)" />
              <span>保存为 NULL</span>
            </label>
            <div class="database-row-create-control">
              <el-select
                v-if="isDatabaseRowBooleanField(field)"
                :model-value="field.value"
                class="database-row-form-control"
                :disabled="isDatabaseRowFieldControlDisabled(field)"
                placeholder="请选择布尔值"
                @update:model-value="value => handleDatabaseRowFieldInput(field, value)"
              >
                <el-option label="1 / true" value="1" />
                <el-option label="0 / false" value="0" />
              </el-select>
              <el-date-picker
                v-else-if="getDatabaseRowFieldCategory(field) === 'datetime'"
                :model-value="field.value"
                class="database-row-form-control"
                type="datetime"
                format="YYYY-MM-DD HH:mm:ss"
                value-format="YYYY-MM-DD HH:mm:ss"
                editable
                clearable
                :disabled="isDatabaseRowFieldControlDisabled(field)"
                :placeholder="getDatabaseCreateFieldPlaceholder(field)"
                @update:model-value="value => handleDatabaseRowFieldInput(field, value)"
              />
              <el-date-picker
                v-else-if="getDatabaseRowFieldCategory(field) === 'date'"
                :model-value="field.value"
                class="database-row-form-control"
                type="date"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                editable
                clearable
                :disabled="isDatabaseRowFieldControlDisabled(field)"
                :placeholder="getDatabaseCreateFieldPlaceholder(field)"
                @update:model-value="value => handleDatabaseRowFieldInput(field, value)"
              />
              <el-time-picker
                v-else-if="getDatabaseRowFieldCategory(field) === 'time'"
                :model-value="field.value"
                class="database-row-form-control"
                format="HH:mm:ss"
                value-format="HH:mm:ss"
                editable
                clearable
                :disabled="isDatabaseRowFieldControlDisabled(field)"
                :placeholder="getDatabaseCreateFieldPlaceholder(field)"
                @update:model-value="value => handleDatabaseRowFieldInput(field, value)"
              />
              <input
                v-else-if="getDatabaseRowFieldCategory(field) === 'number'"
                type="number"
                step="any"
                :value="field.value"
                class="database-row-create-input"
                :disabled="isDatabaseRowFieldControlDisabled(field)"
                :placeholder="getDatabaseCreateFieldPlaceholder(field)"
                @input="handleDatabaseRowFieldInput(field, $event.target.value)"
              />
              <textarea
                v-else-if="shouldUseDatabaseRowTextarea(field)"
                :value="field.value"
                class="database-row-create-textarea"
                rows="4"
                :disabled="isDatabaseRowFieldControlDisabled(field)"
                :placeholder="getDatabaseCreateFieldPlaceholder(field)"
                @input="handleDatabaseRowFieldInput(field, $event.target.value)"
              />
              <input
                v-else
                type="text"
                :value="field.value"
                class="database-row-create-input"
                :disabled="isDatabaseRowFieldControlDisabled(field)"
                :placeholder="getDatabaseCreateFieldPlaceholder(field)"
                @input="handleDatabaseRowFieldInput(field, $event.target.value)"
              />
            </div>
          </label>
        </div>
      </section>
      <template #footer>
        <div class="button-line database-row-dialog-actions">
          <el-button @click="closeDatabaseRowDialog">取消</el-button>
          <el-button type="primary" :loading="databaseRowDialog.saving" @click="submitDatabaseRowDialog">{{ databaseRowDialog.saving ? (databaseRowDialog.mode === 'create' ? '新增中...' : '保存中...') : (databaseRowDialog.mode === 'create' ? '新增数据' : '保存修改') }}</el-button>
        </div>
      </template>
    </el-drawer>

    <el-drawer v-model="databaseColumnDialog.open" :title="databaseColumnDialog.mode === 'create' ? '新增字段' : (databaseColumnDialog.originalName ? `编辑字段 ${databaseColumnDialog.originalName}` : '编辑字段')" size="560px" direction="rtl" class="database-column-drawer database-column-dialog" :close-on-click-modal="false" destroy-on-close>
      <section class="connect-panel connect-panel-scroller database-column-dialog-panel">
        <div class="database-dialog-grid database-row-create-grid database-column-dialog-grid">
          <label class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">字段名</span>
            <div class="database-row-create-control database-column-dialog-control">
              <input v-model.trim="databaseColumnDialog.form.name" class="database-row-create-input database-column-input" placeholder="请输入字段名，例如 email" />
            </div>
          </label>
          <label class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">字段类型</span>
            <div class="database-row-create-control database-column-dialog-control">
              <el-autocomplete v-model="databaseColumnDialog.form.type" class="database-column-search-autocomplete" :fetch-suggestions="queryDatabaseColumnTypeSuggestions" clearable trigger-on-focus placeholder="请输入字段类型，例如 varchar、int、datetime">
                <template #default="{ item }">
                  <span>{{ item.label || item.value }}</span>
                </template>
              </el-autocomplete>
            </div>
          </label>
          <label class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">长度</span>
            <div class="database-row-create-control database-column-dialog-control">
              <input v-model.trim="databaseColumnDialog.form.length" class="database-row-create-input database-column-input" placeholder="请输入长度，例如 255 或 10,2" />
            </div>
          </label>
          <label class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">排序规则</span>
            <div class="database-row-create-control database-column-dialog-control">
              <el-autocomplete v-model="databaseColumnDialog.form.collation" class="database-column-search-autocomplete" :fetch-suggestions="queryDatabaseColumnCollationSuggestions" clearable trigger-on-focus placeholder="请输入或选择排序规则，例如 utf8mb4_general_ci">
                <template #default="{ item }">
                  <span>{{ item.label || item.value }}</span>
                </template>
              </el-autocomplete>
            </div>
          </label>
          <label class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">可为空</span>
            <div class="database-row-create-control database-column-dialog-control">
              <el-select v-model="databaseColumnDialog.form.nullable">
                <el-option label="YES" :value="true" />
                <el-option label="NO" :value="false" />
              </el-select>
            </div>
          </label>
          <label class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">键</span>
            <div class="database-row-create-control database-column-dialog-control">
              <el-select v-model="databaseColumnDialog.form.key">
                <el-option label="无" value="" />
                <el-option label="PRI" value="PRI" />
                <el-option label="UNI" value="UNI" />
              </el-select>
            </div>
          </label>
          <label class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">默认值</span>
            <div class="database-row-create-control database-column-dialog-control">
              <el-autocomplete v-model="databaseColumnDialog.form.defaultInput" class="database-column-search-autocomplete" :fetch-suggestions="queryDatabaseColumnDefaultValueSuggestions" clearable trigger-on-focus placeholder="请输入或选择默认值，例如 NULL、0、CURRENT_TIMESTAMP">
                <template #default="{ item }">
                  <span>{{ item.label || item.value }}</span>
                </template>
              </el-autocomplete>
            </div>
          </label>
          <label class="database-row-create-field database-column-dialog-field full-span">
            <span class="database-row-create-label database-column-dialog-label">额外</span>
            <div class="database-row-create-control database-column-dialog-control">
              <input v-model.trim="databaseColumnDialog.form.extra" class="database-row-create-input database-column-input" placeholder="请输入额外属性，例如 auto_increment" />
            </div>
          </label>
          <label class="database-row-create-field database-column-dialog-field full-span">
            <span class="database-row-create-label database-column-dialog-label">字段备注</span>
            <div class="database-row-create-control database-column-dialog-control">
              <textarea v-model="databaseColumnDialog.form.comment" rows="3" class="database-row-create-textarea database-column-comment-input" placeholder="请输入字段备注，可留空" />
            </div>
          </label>
          <label v-if="databaseColumnDialog.mode === 'create'" class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">字段位置</span>
            <div class="database-row-create-control database-column-dialog-control">
              <el-select v-model="databaseColumnDialog.position.mode">
                <el-option label="添加到末尾" value="last" />
                <el-option label="添加到开头" value="first" />
                <el-option label="添加到某字段后" value="after" />
              </el-select>
            </div>
          </label>
          <label v-if="databaseColumnDialog.mode === 'create' && databaseColumnDialog.position.mode === 'after'" class="database-row-create-field database-column-dialog-field">
            <span class="database-row-create-label database-column-dialog-label">放在字段后</span>
            <div class="database-row-create-control database-column-dialog-control">
              <el-select v-model="databaseColumnDialog.position.afterColumn">
                <el-option v-for="item in databaseSchema.fieldMeta" :key="item.name" :label="item.name" :value="item.name" />
              </el-select>
            </div>
          </label>
        </div>
        <div class="database-column-dialog-options">
          <span v-if="databaseColumnDialog.readOnly">当前字段是只读结构字段，仅支持删除，不支持直接编辑。</span>
        </div>
      </section>
      <template #footer>
        <div class="button-line database-row-dialog-actions">
          <el-button @click="closeDatabaseColumnDialog">取消</el-button>
          <el-button type="primary" :loading="databaseColumnDialog.saving" :disabled="databaseColumnDialog.readOnly" @click="submitDatabaseColumnDialog">{{ databaseColumnDialog.saving ? (databaseColumnDialog.mode === 'create' ? '新增中...' : '保存中...') : (databaseColumnDialog.mode === 'create' ? '新增字段' : '保存字段') }}</el-button>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="appDatabase.open" title="本地应用数据库" width="92vw" align-center class="database-app-dialog" :close-on-click-modal="false">
      <section class="database-app-shell">
        <aside class="database-app-sidebar">
          <div class="database-app-sidebar-head">
            <div>
              <strong>SQLite 结构</strong>
              <span>{{ appDatabase.tables.length }} 个对象</span>
            </div>
            <el-button link type="primary" :loading="appDatabase.loading" @click="loadAppDatabaseTables">刷新</el-button>
          </div>
          <el-table
            border
            size="small"
            height="100%"
            :data="appDatabase.tables"
            :show-overflow-tooltip="tableTooltipOptions"
            class="manage-table database-app-table-list"
            row-key="name"
            empty-text="暂无本地应用数据库表"
            highlight-current-row
            @row-click="selectAppDatabaseTable"
          >
            <el-table-column prop="name" label="名称" min-width="160" />
            <el-table-column prop="type" label="类型" width="72" />
          </el-table>
        </aside>

        <main class="database-app-main">
          <div class="database-app-main-head">
            <div>
              <strong>{{ appDatabase.activeTable || '选择左侧表或视图' }}</strong>
              <span>只读查看应用内部结构化数据，SQL 入口仅允许 SELECT / WITH / PRAGMA。</span>
            </div>
            <el-button plain :disabled="!appDatabase.activeTable || appDatabase.tableLoading" @click="reloadAppDatabaseTable">刷新当前表</el-button>
          </div>

          <el-tabs v-model="appDatabase.activeTab" type="card" class="database-app-tabs">
            <el-tab-pane label="数据" name="rows" />
            <el-tab-pane label="字段" name="schema" />
            <el-tab-pane label="SQL 查询" name="sql" />
          </el-tabs>

          <div v-show="appDatabase.activeTab === 'rows'" class="database-app-pane">
            <el-table
              border
              size="small"
              height="100%"
              :data="appDatabase.tableRows"
              :show-overflow-tooltip="tableTooltipOptions"
              class="manage-table database-data-table database-app-result-table"
              empty-text="请选择表或当前表暂无数据"
              row-key="__rowKey"
              v-loading="appDatabase.tableLoading"
            >
              <el-table-column
                v-for="column in appDatabase.tableColumns"
                :key="column.prop"
                :prop="column.prop"
                :label="column.label"
                min-width="160"
              >
                <template #default="scope">
                  <span>{{ formatAppDatabaseCell(scope.row[column.prop]) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <div class="database-pagination-bar database-app-pagination">
              <span>共 {{ appDatabase.tableTotal }} 条</span>
              <div class="database-page-size-wrap">
                <el-select size="small" v-model="appDatabase.tablePageSize" class="database-page-size-select database-app-page-size-select" @change="handleAppDatabaseTablePageSizeChange">
                  <el-option v-for="size in [25, 50, 100, 200, 500]" :key="size" :label="`${size}`" :value="size" />
                </el-select>
              </div>
              <el-pagination
                v-model:current-page="appDatabase.tablePage"
                small
                layout="prev, pager, next"
                :total="appDatabase.tableTotal"
                :page-size="appDatabase.tablePageSize"
                @current-change="handleAppDatabaseTablePageChange"
              />
            </div>
          </div>

          <div v-show="appDatabase.activeTab === 'schema'" class="database-app-pane database-app-schema-pane">
            <el-table
              border
              size="small"
              height="100%"
              :data="appDatabase.fields"
              :show-overflow-tooltip="tableTooltipOptions"
              class="manage-table database-data-table database-app-result-table"
              empty-text="请选择表查看字段"
              row-key="name"
              v-loading="appDatabase.tableLoading"
            >
              <el-table-column prop="cid" label="#" width="56" />
              <el-table-column prop="name" label="字段" min-width="160" />
              <el-table-column prop="type" label="类型" min-width="140" />
              <el-table-column label="非空" width="76">
                <template #default="scope">{{ scope.row.notnull ? '是' : '否' }}</template>
              </el-table-column>
              <el-table-column label="主键" width="76">
                <template #default="scope">{{ scope.row.primaryKey ? '是' : '否' }}</template>
              </el-table-column>
              <el-table-column prop="defaultValue" label="默认值" min-width="160" />
            </el-table>
          </div>

          <div v-show="appDatabase.activeTab === 'sql'" class="database-app-pane database-app-sql-pane">
            <div class="database-app-sql-editor">
              <textarea v-model="appDatabase.sql" spellcheck="false" placeholder="SELECT * FROM server_accounts LIMIT 50"></textarea>
              <div class="database-app-sql-actions">
                <span>{{ appDatabase.sqlMessage || '查询结果不会写入本地应用数据库。' }}</span>
                <el-button type="primary" :loading="appDatabase.sqlLoading" @click="runAppDatabaseSql()">执行查询</el-button>
              </div>
            </div>
            <el-table
              border
              size="small"
              height="100%"
              :data="appDatabase.sqlRows"
              :show-overflow-tooltip="tableTooltipOptions"
              class="manage-table database-data-table database-app-result-table"
              empty-text="暂无 SQL 查询结果"
              row-key="__rowKey"
              v-loading="appDatabase.sqlLoading"
            >
              <el-table-column
                v-for="column in appDatabase.sqlColumns"
                :key="column.prop"
                :prop="column.prop"
                :label="column.label"
                min-width="160"
              >
                <template #default="scope">
                  <span>{{ formatAppDatabaseCell(scope.row[column.prop]) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <div class="database-pagination-bar database-app-pagination">
              <span>共 {{ appDatabase.sqlTotal }} 条</span>
              <div class="database-page-size-wrap">
                <el-select size="small" v-model="appDatabase.sqlPageSize" class="database-page-size-select database-app-page-size-select" @change="handleAppDatabaseSqlPageSizeChange">
                  <el-option v-for="size in [25, 50, 100, 200, 500]" :key="size" :label="`${size}`" :value="size" />
                </el-select>
              </div>
              <el-pagination
                v-model:current-page="appDatabase.sqlPage"
                small
                layout="prev, pager, next"
                :total="appDatabase.sqlTotal"
                :page-size="appDatabase.sqlPageSize"
                @current-change="handleAppDatabaseSqlPageChange"
              />
            </div>
          </div>
        </main>
      </section>
    </el-dialog>

    <div class="section-line page-hero-line">
      <div>
        <h3>数据库管理</h3>
        <p>{{ databaseConnected ? databaseConnectionLabel : '左侧浏览数据库和表，右侧查看数据或编写 SQL。' }}</p>
      </div>
      <div class="service-actions">
        <el-button v-if="appDatabaseEntryVisible && canAccessAppDatabase" plain @click="openAppDatabaseDialog">本地应用数据库</el-button>
        <el-button plain :disabled="!databaseConnected || databaseLoading" @click="refreshDatabaseBrowser(true, { notify: true })">刷新结构</el-button>
        <el-button plain :disabled="!databaseConnected || !databasePreview.table || databaseLoading" @click="reloadDatabasePreview({ notify: true })">刷新数据</el-button>
        <el-button plain @click="handleDatabaseConnectionButtonClick">{{ databaseConnected ? '更换连接' : '登录数据库' }}</el-button>
        <el-button v-if="databaseConnected" type="danger" plain :loading="databaseConnecting" @click="disconnectDatabase">断开数据库</el-button>
      </div>
    </div>

    <div v-if="databaseConnected" class="database-layout" :style="databaseLayoutStyle">
      <DatabaseTreePane
        :database-connected="databaseConnected"
        :database-loading="databaseLoading"
        :database-databases="databaseDatabases"
        :create-database="createDatabase"
        :import-database-sql-to-database="importDatabaseSqlToDatabase"
        :refresh-database-browser="refreshDatabaseBrowser"
        :database-active-database="databaseActiveDatabase"
        :toggle-database-tree="toggleDatabaseTree"
        :show-native-context-menu="showNativeContextMenu"
        :is-database-expanded="isDatabaseExpanded"
        :is-database-tree-loading="isDatabaseTreeLoading"
        :database-tables-by-database="databaseTablesByDatabase"
        :database-preview="databasePreview"
        :open-database-tree-table="openDatabaseTreeTable"
      />

      <div class="database-tree-splitter" @mousedown.stop.prevent="startDatabaseTreeResize"></div>

      <div class="database-main-pane">
        <div class="database-main-pane-inner">
          <div class="database-tabbar">
            <el-tabs v-model="databaseWorkspaceTabModel" type="card" class="database-workspace-tabs">
              <el-tab-pane label="表数据" name="rows" />
              <el-tab-pane label="表结构" name="schema" />
              <el-tab-pane label="SQL" name="sql" />
            </el-tabs>

            <div class="database-tabbar-content">
              <DatabaseDataPane
                v-show="databaseWorkspaceTabModel !== 'sql'"
                :database-result-summary="databaseResultSummary"
                :database-data-tab="databaseDataTab"
                :database-result="databaseResult"
                :database-inline-edit="databaseInlineEdit"
                :selected-database-result-row="selectedDatabaseResultRow"
                :table-tooltip-options="tableTooltipOptions"
                :database-result-row-class-name="databaseResultRowClassName"
                :show-database-result-context-menu="showDatabaseResultContextMenu"
                :handle-database-result-cell-click="handleDatabaseResultCellClick"
                :handle-database-result-cell-dbl-click="handleDatabaseResultCellDblClick"
                :query-database-inline-edit-suggestions="queryDatabaseInlineEditSuggestions"
                :get-database-inline-edit-suggestion-items="getDatabaseInlineEditSuggestionItems"
                :handle-database-inline-edit-suggestion-select="handleDatabaseInlineEditSuggestionSelect"
                :handle-database-inline-edit-field-input="handleDatabaseInlineEditFieldInput"
                :get-database-inline-edit-field-category="getDatabaseInlineEditFieldCategory"
                :get-database-inline-edit-control-type="getDatabaseInlineEditControlType"
                :get-database-inline-edit-input-type="getDatabaseInlineEditInputType"
                :get-database-inline-edit-editor-value="getDatabaseInlineEditEditorValue"
                :should-use-database-inline-suggestions="shouldUseDatabaseInlineSuggestions"
                :get-database-inline-edit-select-options="getDatabaseInlineEditSelectOptions"
                :get-database-inline-edit-select-value="getDatabaseInlineEditSelectValue"
                :handle-database-inline-edit-select-change="handleDatabaseInlineEditSelectChange"
                :is-database-inline-edit-row="isDatabaseInlineEditRow"
                :is-database-inline-edit-field-active="isDatabaseInlineEditFieldActive"
                :get-database-inline-edit-field-value="getDatabaseInlineEditFieldValue"
                :is-database-inline-edit-field-null="isDatabaseInlineEditFieldNull"
                :set-database-inline-edit-field-null="setDatabaseInlineEditFieldNull"
                :activate-database-inline-edit-field="activateDatabaseInlineEditField"
                :is-database-inline-edit-field-read-only="isDatabaseInlineEditFieldReadOnly"
                :save-database-inline-edit="saveDatabaseInlineEdit"
                :cancel-database-inline-edit="cancelDatabaseInlineEdit"
                :delete-database-preview-row="deleteDatabasePreviewRow"
                :reload-database-preview="reloadDatabasePreview"
                :ensure-database-table-schema-loaded="ensureDatabaseTableSchemaLoaded"
                :database-loading="databaseLoading"
                :database-table-tooltip-options="databaseTableTooltipOptions"
                :database-schema="databaseSchema"
                :database-schema-page-rows="databaseSchemaPageRows"
                :database-schema-row-class-name="databaseSchemaRowClassName"
                :selected-database-schema-row="selectedDatabaseSchemaRow"
                :show-database-schema-context-menu="showDatabaseSchemaContextMenu"
                :database-active-database="databaseActiveDatabase"
                :database-has-active-table="databaseHasActiveTable"
                :can-create-database-rows="canCreateDatabaseRows"
                :open-create-database-row-dialog="openCreateDatabaseRowDialog"
                :can-create-database-columns="canCreateDatabaseColumns"
                :open-create-database-column-dialog="openCreateDatabaseColumnDialog"
                :delete-database-schema-column="deleteDatabaseSchemaColumn"
                :save-database-schema-inline-column="saveDatabaseSchemaInlineColumn"
                :reload-database-schema="reloadDatabaseSchema"
                :database-preview="databasePreview"
                :handle-database-page-size-change="handleDatabasePageSizeChange"
                :handle-database-page-change="handleDatabasePageChange"
                @update:selected-database-result-row="handleDatabaseResultRowChange"
                @update:selected-database-schema-row="handleDatabaseSchemaRowChange"
              />

              <DatabaseSqlPane
                v-show="databaseWorkspaceTabModel === 'sql'"
                :database-sql-result="databaseSqlResult"
                :database-sql-result-page-rows="databaseSqlResultPageRows"
                :table-tooltip-options="tableTooltipOptions"
                :database-sql-result-row-class-name="databaseSqlResultRowClassName"
                :handle-database-sql-table-cell-dbl-click="handleDatabaseSqlTableCellDblClick"
                :database-table-tooltip-options="databaseTableTooltipOptions"
                :handle-database-sql-result-page-size-change="handleDatabaseSqlResultPageSizeChange"
                :handle-database-sql-result-page-change="handleDatabaseSqlResultPageChange"
                :database-sql-overflow-records="databaseSqlOverflowRecords"
                :is-active-database-sql-history="isActiveDatabaseSqlHistory"
                :get-database-sql-record-label="getDatabaseSqlRecordLabel"
                :activate-database-sql-history="activateDatabaseSqlHistory"
                :remove-database-sql-history="removeDatabaseSqlHistory"
                :database-sql-visible-records="databaseSqlVisibleRecords"
                :append-database-sql-history="appendDatabaseSqlHistory"
                :run-database-sql="runDatabaseSql"
                :database-loading="databaseLoading"
                :set-database-sql-monaco-ref="setDatabaseSqlMonacoRef"
                @update:selected-database-sql-row="handleDatabaseSqlRowChange"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="database-empty-shell">
      <div class="database-empty-head">
        <div>
          <strong>已保存连接</strong>
          <p>未登录数据库时，可以先从这里选择已有连接，或者在右上角新建连接。</p>
        </div>
        <el-button type="primary" @click="startCreateDatabaseConnection">新建</el-button>
      </div>
      <el-table border size="small" max-height="360" :data="databaseSavedConnections" :show-overflow-tooltip="tableTooltipOptions" class="manage-table database-saved-table" empty-text="暂无已保存数据库连接" row-key="id" @row-dblclick="connectSavedDatabaseConnectionDirect">
        <el-table-column prop="name" label="连接名称" min-width="180">
          <template #default="scope">
            <span>{{ scope.row.name || scope.row.host || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="主机地址" min-width="220">
          <template #default="scope">
            <span>{{ scope.row.host || '-' }}:{{ scope.row.port || 3306 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column label="连接方式" min-width="130">
          <template #default="scope">
            <span>{{ scope.row.useSshTunnel ? 'SSH 隧道' : '直连' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" :disabled="scope.row.useSshTunnel && (!connected || !isSSHSession || !sessionId)" @click="connectSavedDatabaseConnectionDirect(scope.row)">连接</el-button>
            <el-button link type="primary" size="small" @click="editSavedDatabaseConnection(scope.row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="removeSavedDatabaseConnection(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import DatabaseDataPane from '../components/database/DatabaseDataPane.vue'
  import DatabaseSqlPane from '../components/database/DatabaseSqlPane.vue'
  import DatabaseTreePane from '../components/database/DatabaseTreePane.vue'

  const props = defineProps([
    'connected',
    'isSSHSession',
    'sessionId',
    'databaseLoginVisible',
    'databaseForm',
    'handleDatabaseTypeChange',
    'databaseConnecting',
    'databaseLoginMode',
    'submitDatabaseLoginDialog',
    'databaseRowDialog',
    'closeDatabaseRowDialog',
    'submitDatabaseRowDialog',
    'databaseColumnDialog',
    'queryDatabaseColumnTypeSuggestions',
    'databaseTypeSupportsCollation',
    'queryDatabaseColumnCollationSuggestions',
    'queryDatabaseColumnDefaultValueSuggestions',
    'databaseSchema',
    'databaseTypeSupportsAutoIncrement',
    'databaseTypeSupportsOnUpdateCurrentTimestamp',
    'closeDatabaseColumnDialog',
    'submitDatabaseColumnDialog',
    'saveDatabaseSchemaInlineColumn',
    'databaseConnected',
    'databaseConnectionLabel',
    'databaseLoading',
    'refreshDatabaseBrowser',
    'databasePreview',
    'reloadDatabasePreview',
    'deleteDatabasePreviewRow',
    'openDatabaseLogin',
    'disconnectDatabase',
    'databaseLayoutStyle',
    'databaseDatabases',
    'createDatabase',
    'importDatabaseSqlToDatabase',
    'databaseActiveDatabase',
    'toggleDatabaseTree',
    'showNativeContextMenu',
    'isDatabaseExpanded',
    'isDatabaseTreeLoading',
    'databaseTablesByDatabase',
    'openDatabaseTreeTable',
    'databaseContentTab',
    'databaseResultSummary',
    'databaseDataTab',
    'switchDatabaseDataTab',
    'databaseResult',
    'databaseInlineEdit',
    'selectedDatabaseResultRow',
    'selectedDatabaseSchemaRow',
    'tableTooltipOptions',
    'databaseResultRowClassName',
    'showDatabaseResultContextMenu',
    'handleDatabaseResultCellClick',
    'handleDatabaseResultCellDblClick',
    'queryDatabaseInlineEditSuggestions',
    'getDatabaseInlineEditSuggestionItems',
    'handleDatabaseInlineEditSuggestionSelect',
    'handleDatabaseInlineEditFieldInput',
    'getDatabaseInlineEditFieldCategory',
    'getDatabaseInlineEditControlType',
    'getDatabaseInlineEditInputType',
    'getDatabaseInlineEditEditorValue',
    'shouldUseDatabaseInlineSuggestions',
    'getDatabaseInlineEditSelectOptions',
    'getDatabaseInlineEditSelectValue',
    'handleDatabaseInlineEditSelectChange',
    'isDatabaseInlineEditRow',
    'isDatabaseInlineEditFieldActive',
    'getDatabaseInlineEditFieldValue',
    'isDatabaseInlineEditFieldNull',
    'setDatabaseInlineEditFieldNull',
    'activateDatabaseInlineEditField',
    'shouldUseDatabaseInlineTextarea',
    'isDatabaseInlineEditFieldReadOnly',
    'isDatabaseInlineEditFieldNullable',
    'saveDatabaseInlineEdit',
    'cancelDatabaseInlineEdit',
    'ensureDatabaseTableSchemaLoaded',
    'databaseTableTooltipOptions',
    'databaseSchemaPageRows',
    'databaseSchemaRowClassName',
    'showDatabaseSchemaContextMenu',
    'databaseHasActiveTable',
    'canCreateDatabaseRows',
    'openCreateDatabaseRowDialog',
    'canCreateDatabaseColumns',
    'openCreateDatabaseColumnDialog',
    'deleteDatabaseSchemaColumn',
    'reloadDatabaseSchema',
    'handleDatabasePageSizeChange',
    'handleDatabasePageChange',
    'databaseSqlResult',
    'databaseSqlResultPageRows',
    'databaseSqlResultRowClassName',
    'handleDatabaseSqlTableCellDblClick',
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
    'setDatabaseSqlMonacoRef',
    'canAccessAppDatabase',
    'startCreateDatabaseConnection',
    'databaseSavedConnections',
    'connectSavedDatabaseConnectionDirect',
    'editSavedDatabaseConnection',
    'removeSavedDatabaseConnection',
    'startDatabaseTreeResize'
  ])

  const emit = defineEmits([
    'update:databaseLoginVisible',
    'update:databaseContentTab',
    'update:databaseDataTab',
    'update:selectedDatabaseResultRow',
    'update:selectedDatabaseSchemaRow',
    'update:selectedDatabaseSqlRow'
  ])

  const databaseLoginVisibleModel = computed({
    get: () => props.databaseLoginVisible,
    set: value => emit('update:databaseLoginVisible', value)
  })

  const appDatabaseEntryVisible = false

  const databaseWorkspaceTabModel = computed({
    get: () => props.databaseContentTab === 'sql' ? 'sql' : props.databaseDataTab,
    set: value => {
      if (value === 'sql') {
        emit('update:databaseContentTab', 'sql')
        return
      }
      emit('update:databaseContentTab', 'data')
      emit('update:databaseDataTab', value)
      props.switchDatabaseDataTab?.(value)
    }
  })

  const databaseConnectionChooserVisible = ref(false)

  function handleDatabaseConnectionButtonClick() {
    if (!props.databaseConnected) {
      props.openDatabaseLogin?.()
      return
    }
    databaseConnectionChooserVisible.value = true
  }

  function openCreateDatabaseConnectionFromChooser() {
    databaseConnectionChooserVisible.value = false
    props.startCreateDatabaseConnection?.()
  }

  function editSavedDatabaseConnectionFromChooser(row) {
    databaseConnectionChooserVisible.value = false
    props.editSavedDatabaseConnection?.(row)
  }

  async function connectSavedDatabaseConnectionFromChooser(row) {
    if (row?.useSshTunnel && (!props.connected || !props.isSSHSession || !props.sessionId)) return
    await props.connectSavedDatabaseConnectionDirect?.(row)
    databaseConnectionChooserVisible.value = false
  }

  const appDatabase = reactive({
    open: false,
    loading: false,
    tableLoading: false,
    sqlLoading: false,
    tables: [],
    activeTable: '',
    activeTab: 'rows',
    fields: [],
    tableColumns: [],
    tableRows: [],
    tablePage: 1,
    tablePageSize: 50,
    tableTotal: 0,
    sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY type, name",
    sqlColumns: [],
    sqlRows: [],
    sqlPage: 1,
    sqlPageSize: 50,
    sqlTotal: 0,
    sqlMessage: ''
  })

  function showAppDatabaseError(error, fallback) {
    ElMessage({ message: String(error?.message || error || fallback), type: 'error', duration: 2400, grouping: true })
  }

  function formatAppDatabaseCell(value) {
    if (value == null) return 'NULL'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  }

  async function openAppDatabaseDialog() {
    if (!props.canAccessAppDatabase) {
      ElMessage.warning('本地应用数据库仅管理员账号可用')
      return
    }
    appDatabase.open = true
    if (!appDatabase.tables.length) await loadAppDatabaseTables()
  }

  async function loadAppDatabaseTables() {
    appDatabase.loading = true
    try {
      const tables = await window.whSSH.listAppDatabaseTables()
      appDatabase.tables = Array.isArray(tables) ? tables : []
      if (!appDatabase.activeTable && appDatabase.tables.length) {
        await selectAppDatabaseTable(appDatabase.tables[0])
      } else if (appDatabase.activeTable && !appDatabase.tables.some(item => item.name === appDatabase.activeTable)) {
        appDatabase.activeTable = ''
        appDatabase.fields = []
        appDatabase.tableColumns = []
        appDatabase.tableRows = []
        appDatabase.tableTotal = 0
      }
    } catch (error) {
      showAppDatabaseError(error, '读取本地应用数据库结构失败')
    } finally {
      appDatabase.loading = false
    }
  }

  async function selectAppDatabaseTable(row = null) {
    const table = String(row?.name || row || '').trim()
    if (!table) return
    appDatabase.activeTable = table
    appDatabase.activeTab = appDatabase.activeTab === 'sql' ? 'sql' : 'rows'
    appDatabase.tablePage = 1
    await reloadAppDatabaseTable()
  }

  async function reloadAppDatabaseTable() {
    if (!appDatabase.activeTable) return
    appDatabase.tableLoading = true
    try {
      const [fields, preview] = await Promise.all([
        window.whSSH.describeAppDatabaseTable(appDatabase.activeTable),
        window.whSSH.previewAppDatabaseTable({
          table: appDatabase.activeTable,
          page: appDatabase.tablePage,
          pageSize: appDatabase.tablePageSize
        })
      ])
      appDatabase.fields = Array.isArray(fields) ? fields : []
      appDatabase.tableColumns = Array.isArray(preview?.columns) ? preview.columns : []
      appDatabase.tableRows = Array.isArray(preview?.rows) ? preview.rows : []
      appDatabase.tableTotal = Number(preview?.total || 0)
    } catch (error) {
      showAppDatabaseError(error, '读取本地应用数据库表失败')
    } finally {
      appDatabase.tableLoading = false
    }
  }

  async function handleAppDatabaseTablePageChange(page) {
    appDatabase.tablePage = Math.max(1, Number(page || 1))
    await reloadAppDatabaseTable()
  }

  async function handleAppDatabaseTablePageSizeChange(pageSize) {
    appDatabase.tablePageSize = Math.max(10, Number(pageSize || 50))
    appDatabase.tablePage = 1
    await reloadAppDatabaseTable()
  }

  async function runAppDatabaseSql(resetPage = true) {
    if (resetPage) appDatabase.sqlPage = 1
    appDatabase.sqlLoading = true
    try {
      const result = await window.whSSH.queryAppDatabase({
        sql: appDatabase.sql,
        page: appDatabase.sqlPage,
        pageSize: appDatabase.sqlPageSize
      })
      appDatabase.sqlColumns = Array.isArray(result?.columns) ? result.columns : []
      appDatabase.sqlRows = Array.isArray(result?.rows) ? result.rows : []
      appDatabase.sqlTotal = Number(result?.total || 0)
      appDatabase.sqlMessage = String(result?.message || `查询完成，共 ${appDatabase.sqlTotal} 条`)
    } catch (error) {
      showAppDatabaseError(error, '执行本地应用数据库查询失败')
    } finally {
      appDatabase.sqlLoading = false
    }
  }

  async function handleAppDatabaseSqlPageChange(page) {
    appDatabase.sqlPage = Math.max(1, Number(page || 1))
    await runAppDatabaseSql(false)
  }

  async function handleAppDatabaseSqlPageSizeChange(pageSize) {
    appDatabase.sqlPageSize = Math.max(10, Number(pageSize || 50))
    appDatabase.sqlPage = 1
    await runAppDatabaseSql(false)
  }

  function handleDatabaseResultRowChange(row) {
    emit('update:selectedDatabaseResultRow', row || null)
  }

  function handleDatabaseSchemaRowChange(row) {
    emit('update:selectedDatabaseSchemaRow', row || null)
  }

  function handleDatabaseSqlRowChange(row) {
    emit('update:selectedDatabaseSqlRow', row || null)
  }

  function getDatabaseRowFieldType(field = null) {
    return String(field?.type || '').trim().toLowerCase()
  }

  function isDatabaseRowBooleanField(field = null) {
    const type = getDatabaseRowFieldType(field)
    return /\b(bool|boolean)\b/.test(type) || /\btinyint\s*\(\s*1\s*\)/.test(type) || /\bbit\s*\(\s*1\s*\)/.test(type)
  }

  function getDatabaseRowFieldCategory(field = null) {
    const type = getDatabaseRowFieldType(field)
    if (isDatabaseRowBooleanField(field)) return 'boolean'
    if (/\b(datetime|timestamp|datetime2|smalldatetime)\b/.test(type)) return 'datetime'
    if (/\bdate\b/.test(type) && !/\b(datetime|timestamp|datetime2|smalldatetime)\b/.test(type)) return 'date'
    if (/\btime\b/.test(type) && !/\b(datetime|timestamp|datetime2|smalldatetime)\b/.test(type)) return 'time'
    if (/\b(decimal|numeric|float|double|real|tinyint|smallint|mediumint|int|integer|bigint|serial|number|money|smallmoney)\b/.test(type)) return 'number'
    if (/\bjson\b/.test(type)) return 'json'
    if (/\b(text|longtext|mediumtext|tinytext|ntext|xml)\b/.test(type)) return 'text'
    return 'string'
  }

  function shouldUseDatabaseRowTextarea(field = null) {
    const category = getDatabaseRowFieldCategory(field)
    return field?.multiline === true || category === 'json' || category === 'text'
  }

  function isDatabaseRowFieldControlDisabled(field = null) {
    return field?.readOnly === true || field?.useNull === true
  }

  function handleDatabaseRowFieldInput(field = null, value = '') {
    if (!field || field.readOnly) return
    field.useNull = false
    field.value = value === null || value === undefined ? '' : String(value)
  }

  function toggleDatabaseRowFieldNull(field = null, checked = false) {
    if (!field || field.readOnly || !field.nullable) return
    field.useNull = checked === true
    if (field.useNull) field.value = ''
  }

  function getDatabaseCreateFieldPlaceholder(field = null) {
    const type = String(field?.type || '').toLowerCase()
    const category = getDatabaseRowFieldCategory(field)
    if (field?.readOnly) return '当前字段不可编辑'
    if (field?.useNull) return '当前将保存为 NULL；取消勾选后可编辑'
    if (category === 'datetime') return '请选择或输入日期时间'
    if (category === 'date') return '请选择或输入日期'
    if (category === 'time') return '请选择或输入时间'
    if (category === 'number') return '请输入数字'
    if (field?.nullable) return '留空时自动保存为 NULL'
    if (/\b(decimal|numeric|float|double|real|tinyint|smallint|mediumint|int|integer|bigint|serial|number|boolean|bit\s*\(\s*1\s*\)|tinyint\s*\(\s*1\s*\))\b/.test(type)) {
      return '留空时默认写入 0'
    }
    if (/\bjson\b/.test(type)) return '留空时默认写入 {}'
    return '留空时默认写入空字符串'
  }
</script>
