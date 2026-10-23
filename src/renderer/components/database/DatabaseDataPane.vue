<template>
  <section class="database-preview-pane">
    <div class="database-pane-meta">
      <p>{{ databaseResultSummary }}</p>
    </div>

    <div class="database-preview-body">
      <div v-if="databaseDataTab === 'rows' && databaseResult.kind === 'rows'" class="database-rows-pane">
        <div class="database-rows-toolbar">
          <el-tooltip content="新增数据" placement="top" :show-after="400">
            <button type="button" class="database-rows-toolbar-btn database-rows-toolbar-btn--add" :disabled="!canCreateDatabaseRows || databaseLoading" @click="handleCreateDatabaseRow">
              <el-icon><Plus /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip content="删除当前选中行" placement="top" :show-after="400">
            <button type="button" class="database-rows-toolbar-btn database-rows-toolbar-btn--delete" :disabled="!selectedDatabaseResultRow || databaseLoading" @click="handleDeleteSelectedDatabaseRow">
              <el-icon><Delete /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip content="刷新表数据" placement="top" :show-after="400">
            <button type="button" class="database-rows-toolbar-btn database-rows-toolbar-btn--refresh" :disabled="!databasePreview?.table || databaseLoading" @click="handleReloadDatabasePreview">
              <el-icon><RefreshRight /></el-icon>
            </button>
          </el-tooltip>
        </div>

        <div class="database-table-wrap database-table-wrap--scroll" @pointerdown.capture="handleDatabaseTablePointerDown('rows', $event)" @contextmenu.capture="handleDatabaseTableContextMenu('rows', $event)">
        <el-table
          border
          :data="databaseResult.rows"
          height="100%"
          :fit="true"
          table-layout="auto"
          class="manage-table database-data-table"
          empty-text="查询结果为空"
          :row-class-name="getDatabaseResultTableRowClassName"
          @cell-click="handleDatabaseResultCellSelect"
          @cell-contextmenu="handleDatabaseResultCellContextMenu"
          @row-click="handleDatabaseResultRowChange"
          @current-change="handleDatabaseResultRowChange"
        >
          <el-table-column
            v-for="column in databaseResult.columns"
            :key="column.prop"
            :prop="column.prop"
            :label="column.label"
            min-width="108"
          >
            <template #default="scope">
              <div
                class="database-cell-surface"
                :class="{
                  'database-cell-surface--editing': isDatabaseInlineEditCell(scope.row, column.prop),
                  'database-cell-surface--row-editing': isDatabaseInlineEditActiveRow(scope.row),
                  'database-cell-surface--null': isDatabaseCellNullValue(scope.row, column.prop, scope.row?.[column.prop])
                }"
                @pointerdown="handleDatabaseCellPointerDown('rows', scope.row, column, scope.$index, $event)"
                @contextmenu.prevent.stop="openDatabaseCellContextMenu('rows', scope.row, column, scope.$index, $event)"
              >
                <div class="database-cell-inner">
                  <el-tooltip
                    :content="formatDatabaseCellValue(getDatabaseCellDisplayValue(scope.row, column.prop, scope.row?.[column.prop]))"
                    placement="top-start"
                    :show-after="1200"
                    :hide-after="0"
                    :enterable="false"
                    :disabled="isDatabaseInlineEditCell(scope.row, column.prop) || !hasDatabaseCellTooltipContent(getDatabaseCellDisplayValue(scope.row, column.prop, scope.row?.[column.prop]))"
                  >
                      <span class="database-cell-text-tooltip-trigger">
                        <span class="database-cell-text">{{ formatDatabaseCellValue(getDatabaseCellDisplayValue(scope.row, column.prop, scope.row?.[column.prop])) }}</span>
                      </span>
                  </el-tooltip>
                </div>

                <div v-if="false && isDatabaseInlineEditCell(scope.row, column.prop)" class="database-cell-editor-layer">
                  <div
                    v-if="getDatabaseInlineEditControlType(column.prop, scope.row) === 'textarea'"
                    class="database-cell-editor-ui database-cell-editor-ui--textarea-shell"
                    :class="{ 'database-cell-editor-ui--active': isDatabaseInlineEditCell(scope.row, column.prop) }"
                  >
                    <el-input
                      :ref="instance => setInlineEditorRef(scope.$index, column.prop, instance)"
                      :model-value="getDatabaseInlineEditEditorValue(column.prop, scope.row)"
                      type="textarea"
                      resize="none"
                      :autosize="false"
                      :readonly="isDatabaseInlineEditFieldReadOnly(column.prop, scope.row)"
                      class="database-cell-editor-ui database-cell-editor-ui--textarea"
                      @focus="handleInlineEditorComponentFocus(scope.$index, column.prop, scope.row, $event)"
                      @blur="handleInlineEditorBlur(scope.$index, column.prop)"
                      @update:model-value="value => handleDatabaseInlineEditFieldInput(column.prop, value, scope.row)"
                      @keydown.esc.stop="cancelDatabaseInlineEdit"
                    />

                    <el-dropdown
                      v-if="hasInlineDropdownMenu(column.prop, scope.row)"
                      trigger="click"
                      popper-class="database-inline-dropdown-popper"
                      @visible-change="visible => handleInlineSelectorVisibleChange(scope.$index, column.prop, visible)"
                      @command="command => handleInlineOptionCommand(scope.$index, column.prop, scope.row, command)"
                    >
                      <button
                        type="button"
                        class="database-cell-action-btn"
                        :title="getInlineActionButtonTitle(column.prop, scope.row)"
                        :disabled="isDatabaseInlineEditFieldReadOnly(column.prop, scope.row)"
                        @mousedown.prevent.stop
                      >
                        <el-icon><ArrowDown /></el-icon>
                      </button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item
                            v-for="item in getInlineDropdownItems(column.prop, scope.row)"
                            :key="item.key"
                            :command="item.command"
                          >
                            {{ item.label }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>

                  </div>

                  <div v-else class="database-cell-editor-ui database-cell-editor-ui--shell" :class="{ 'database-cell-editor-ui--active': isDatabaseInlineEditCell(scope.row, column.prop) }">
                    <input
                      :ref="element => setInlineEditorRef(scope.$index, column.prop, element)"
                      :value="getInlineShellDisplayValue(column.prop, scope.row)"
                      :type="getInlineShellInputType(column.prop, scope.row)"
                      class="database-cell-editor database-cell-editor--shell"
                      :class="{
                        'database-cell-editor--readonly': isInlineShellReadonly(column.prop, scope.row),
                        'database-cell-editor--picker': isDatabaseInlinePickerField(column.prop, scope.row)
                      }"
                      :readonly="isInlineShellReadonly(column.prop, scope.row)"
                      :disabled="isDatabaseInlineEditFieldReadOnly(column.prop, scope.row)"
                      :data-picker-manual="isDatabaseInlinePickerField(column.prop, scope.row) ? 'true' : null"
                      @focus="handleInlineEditorComponentFocus(scope.$index, column.prop, scope.row, $event)"
                      @blur="handleInlineEditorBlur(scope.$index, column.prop)"
                      @input="handleDatabaseInlineEditFieldInput(column.prop, $event.target.value, scope.row)"
                      @keydown.esc.stop="cancelDatabaseInlineEdit"
                    />

                    <input
                      v-if="isDatabaseInlinePickerField(column.prop, scope.row)"
                      :ref="element => setInlinePickerRef(scope.$index, column.prop, element)"
                      :value="getDatabaseInlineEditEditorValue(column.prop, scope.row)"
                      :type="getInlineNativePickerInputType(column.prop, scope.row)"
                      class="database-cell-native-picker"
                      tabindex="-1"
                      aria-hidden="true"
                      @input="handleDatabaseInlineEditFieldInput(column.prop, $event.target.value, scope.row)"
                      @change="handleDatabaseInlineEditFieldInput(column.prop, $event.target.value, scope.row)"
                    />

                    <el-dropdown
                      v-if="hasInlineDropdownMenu(column.prop, scope.row)"
                      trigger="click"
                      popper-class="database-inline-dropdown-popper"
                      @visible-change="visible => handleInlineSelectorVisibleChange(scope.$index, column.prop, visible)"
                      @command="command => handleInlineOptionCommand(scope.$index, column.prop, scope.row, command)"
                    >
                      <button
                        type="button"
                        class="database-cell-action-btn"
                        :title="getInlineActionButtonTitle(column.prop, scope.row)"
                        :disabled="isDatabaseInlineEditFieldReadOnly(column.prop, scope.row)"
                        @mousedown.prevent.stop
                      >
                        <el-icon><ArrowDown /></el-icon>
                      </button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item
                            v-for="item in getInlineDropdownItems(column.prop, scope.row)"
                            :key="item.key"
                            :command="item.command"
                          >
                            {{ item.label }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>

                  </div>
                </div>
              </div>
            </template>
          </el-table-column>
        </el-table>
        </div>
      </div>

      <div v-else-if="databaseDataTab === 'schema' && databaseSchema.rows.length" class="database-rows-pane">
        <div class="database-rows-toolbar">
          <el-tooltip content="新增字段" placement="top" :show-after="400">
            <button type="button" class="database-rows-toolbar-btn database-rows-toolbar-btn--add" :disabled="!canCreateDatabaseColumns || databaseLoading" @click="handleCreateDatabaseColumn">
              <el-icon><Plus /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip content="删除当前选中字段" placement="top" :show-after="400">
            <button type="button" class="database-rows-toolbar-btn database-rows-toolbar-btn--delete" :disabled="!selectedDatabaseSchemaRow || databaseLoading" @click="handleDeleteSelectedDatabaseSchemaRow">
              <el-icon><Delete /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip content="刷新表结构" placement="top" :show-after="400">
            <button type="button" class="database-rows-toolbar-btn database-rows-toolbar-btn--refresh" :disabled="!databaseSchema.table || databaseLoading" @click="handleReloadDatabaseSchema">
              <el-icon><RefreshRight /></el-icon>
            </button>
          </el-tooltip>
        </div>

        <div class="database-table-wrap database-table-wrap--scroll" @pointerdown.capture="handleDatabaseTablePointerDown('schema', $event)" @contextmenu.capture="handleDatabaseTableContextMenu('schema', $event)">
          <el-table border :data="databaseSchemaPageRows" height="100%" :fit="true" table-layout="auto" class="manage-table database-data-table" empty-text="没有读取到字段信息" :row-class-name="getDatabaseSchemaTableRowClassName" @row-click="handleDatabaseSchemaRowChange" @current-change="handleDatabaseSchemaRowChange" @cell-click="handleDatabaseSchemaCellSelect" @cell-contextmenu="handleDatabaseSchemaCellContextMenu">
            <el-table-column
              v-for="column in databaseSchema.columns"
              :key="column.prop"
              :prop="column.prop"
              :label="column.label"
              min-width="100"
            >
              <template #default="scope">
                <div
                  class="database-cell-surface"
                  :class="{
                    'database-cell-surface--editing': isDatabaseSchemaInlineEditCell(scope.row, column.prop),
                    'database-cell-surface--row-editing': isDatabaseSchemaInlineEditActiveRow(scope.row),
                    'database-cell-surface--null': isDatabaseSchemaCellNullValue(scope.row, column.prop)
                  }"
                  @pointerdown="handleDatabaseCellPointerDown('schema', scope.row, column, scope.$index, $event)"
                  @contextmenu.prevent.stop="openDatabaseCellContextMenu('schema', scope.row, column, scope.$index, $event)"
                >
                  <div class="database-cell-inner">
                    <el-tooltip
                      :content="formatDatabaseCellValue(getDatabaseSchemaCellDisplayValue(scope.row, column.prop))"
                      placement="top-start"
                      :show-after="1200"
                      :hide-after="0"
                      :enterable="false"
                      :disabled="isDatabaseSchemaInlineEditCell(scope.row, column.prop) || !hasDatabaseCellTooltipContent(getDatabaseSchemaCellDisplayValue(scope.row, column.prop))"
                    >
                      <span class="database-cell-text-tooltip-trigger">
                        <span class="database-cell-text">{{ formatDatabaseCellValue(getDatabaseSchemaCellDisplayValue(scope.row, column.prop)) }}</span>
                      </span>
                    </el-tooltip>
                  </div>

                  <div v-if="false && isDatabaseSchemaInlineEditCell(scope.row, column.prop)" class="database-cell-editor-layer">
                    <div v-if="column.prop === 'Comment'" class="database-cell-editor-ui database-cell-editor-ui--textarea-shell database-cell-editor-ui--active">
                      <el-input
                        :ref="instance => setSchemaInlineEditorRef(scope.$index, column.prop, instance)"
                        :model-value="getDatabaseSchemaInlineEditEditorValue(column.prop)"
                        type="textarea"
                        resize="none"
                        :autosize="false"
                        class="database-cell-editor-ui database-cell-editor-ui--textarea"
                        @focus="handleSchemaInlineEditorFocus(scope.$index, column.prop, scope.row)"
                        @blur="handleSchemaInlineEditorBlur(scope.$index, column.prop)"
                        @update:model-value="value => handleDatabaseSchemaInlineEditFieldInput(column.prop, value)"
                        @keydown.esc.stop="cancelDatabaseSchemaInlineEdit"
                      />
                    </div>

                    <div v-else class="database-cell-editor-ui database-cell-editor-ui--shell database-cell-editor-ui--active">
                      <input
                        :ref="element => setSchemaInlineEditorRef(scope.$index, column.prop, element)"
                        :value="getDatabaseSchemaInlineEditEditorValue(column.prop)"
                        type="text"
                        class="database-cell-editor database-cell-editor--shell"
                        @focus="handleSchemaInlineEditorFocus(scope.$index, column.prop, scope.row)"
                        @blur="handleSchemaInlineEditorBlur(scope.$index, column.prop)"
                        @input="handleDatabaseSchemaInlineEditFieldInput(column.prop, $event.target.value)"
                        @keydown.esc.stop="cancelDatabaseSchemaInlineEdit"
                      />

                      <el-dropdown
                        v-if="hasDatabaseSchemaInlineDropdown(column.prop, scope.row)"
                        trigger="click"
                        popper-class="database-inline-dropdown-popper"
                        @visible-change="visible => handleSchemaInlineSelectorVisibleChange(scope.$index, column.prop, visible)"
                        @command="command => handleDatabaseSchemaInlineOptionCommand(scope.$index, column.prop, command)"
                      >
                        <button type="button" class="database-cell-action-btn" :title="getDatabaseSchemaInlineActionTitle(column.prop)" @mousedown.prevent.stop>
                          <el-icon><ArrowDown /></el-icon>
                        </button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item
                              v-for="item in getDatabaseSchemaInlineDropdownItems(column.prop, scope.row)"
                              :key="item.key"
                              :command="item.command"
                            >
                              {{ item.label }}
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </div>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div v-else-if="databaseActiveDatabase && !databaseHasActiveTable" class="database-preview-empty-state">
        <div class="database-preview-empty-illustration" aria-hidden="true">
          <span class="database-preview-empty-folder"></span>
          <span class="database-preview-empty-grid"></span>
        </div>
        <strong>{{ databaseDataTab === 'schema' ? '请选择一张表后再查看表结构' : '请选择左侧表名查看表数据' }}</strong>
        <span>从左侧单击一张表即可加载内容。</span>
      </div>

      <div v-else class="database-command-result">
        <strong>{{ databaseResult.message || '点击左侧表名后，这里会显示分页表数据。' }}</strong>
        <span v-if="databaseDataTab === 'schema' && databaseHasActiveTable">点击“表结构”后，这里会显示字段定义。</span>
        <span v-else-if="databaseResult.kind === 'command'">
          影响行数：{{ databaseResult.affectedRows || 0 }}
          <template v-if="databaseResult.insertId">，插入 ID：{{ databaseResult.insertId }}</template>
          <template v-if="databaseResult.durationMs">，耗时：{{ databaseResult.durationMs }}ms</template>
        </span>
        <span v-else>也可以切到 SQL 页签直接输入查询语句。</span>
      </div>
    </div>

    <div class="database-pagination-bar">
      <div class="database-pagination-controls">
        <span class="database-pagination-summary">
          {{ databaseDataTab === 'schema'
            ? `字段 ${databaseSchema.total} 个`
            : (databasePreview.table ? `共 ${databasePreview.total} 条` : '未选择表') }}
        </span>
        <template v-if="databaseDataTab === 'schema' && databaseSchema.total">
          <div class="database-page-size-wrap">
            <el-select size="small" :model-value="databaseSchema.pageSize" class="database-page-size-select" @change="handleDatabasePageSizeChange">
              <el-option v-for="size in [20, 50, 100, 200]" :key="size" :label="`${size}`" :value="size" />
            </el-select>
          </div>
          <el-pagination
            size="small"
            background
            layout="prev, pager, next"
            prev-text="上一页"
            next-text="下一页"
            :total="databaseSchema.total"
            :current-page="databaseSchema.page"
            :page-size="databaseSchema.pageSize"
            @current-change="handleDatabasePageChange"
          />
        </template>
        <template v-else-if="databaseDataTab === 'rows' && databasePreview.table">
          <div class="database-page-size-wrap">
            <el-select size="small" :model-value="databasePreview.pageSize" class="database-page-size-select" @change="handleDatabasePageSizeChange">
              <el-option v-for="size in [20, 50, 100, 200]" :key="size" :label="`${size}`" :value="size" />
            </el-select>
          </div>
          <el-pagination
            size="small"
            background
            layout="prev, pager, next"
            prev-text="上一页"
            next-text="下一页"
            :total="databasePreview.total"
            :current-page="databasePreview.page"
            :page-size="databasePreview.pageSize"
            @current-change="handleDatabasePageChange"
          />
        </template>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="databaseCellMenu.visible" class="database-cell-context-menu" :style="buildDatabaseCellMenuStyle()" @click.stop @contextmenu.prevent>
        <button type="button" :disabled="!canEditContextCell()" @click="editContextCell">编辑此单元格</button>
        <button type="button" :disabled="!canSetContextCellNull()" @click="setContextCellNull">设置为 NULL</button>
        <button type="button" :disabled="!canSetContextCellEmpty()" @click="setContextCellEmpty">设置为空字符串</button>
        <button type="button" @click="copyContextCellValue">复制单元格值</button>
        <button type="button" @click="copyContextRowValue">复制当前行</button>
        <button type="button" class="database-cell-context-menu-danger" :disabled="!canDeleteContextRow()" @click="deleteContextRow">{{ databaseCellMenu.mode === 'schema' ? '删除当前字段' : '删除当前行' }}</button>
      </div>
    </Teleport>

    <el-dialog v-model="databaseCellEditor.open" :title="databaseCellEditorTitle" width="560px" align-center class="database-cell-edit-dialog" :close-on-click-modal="false" @closed="closeDatabaseCellEditor">
      <section v-if="databaseCellEditor.mode === 'rows'" class="database-cell-edit-panel">
        <div class="database-cell-edit-meta">
          <div class="database-cell-edit-meta-row">
            <span>名称：</span>
            <strong>{{ databaseCellEditor.fieldName }}</strong>
          </div>
          <div class="database-cell-edit-meta-row">
            <span>类型：</span>
            <strong>{{ getRowEditorFieldTypeText() }}</strong>
          </div>
        </div>
        <p v-if="isRowEditorDisabled()" class="database-cell-edit-readonly-tip">{{ getRowEditorReadonlyReason() }}</p>
        <label class="database-cell-edit-null-toggle" :title="getRowEditorNullToggleTitle()">
          <input type="checkbox" :checked="isRowEditorNull()" :disabled="isRowEditorNullToggleDisabled()" @change="toggleRowEditorNull($event.target.checked)" />
          <span>是否为 NULL</span>
          <small v-if="!isRowEditorNullable() && !isRowEditorNull()">字段不允许 NULL</small>
        </label>
        <select v-if="isRowEditorSelectControl()" class="database-cell-edit-input" :value="props.getDatabaseInlineEditSelectValue(databaseCellEditor.fieldName, databaseCellEditor.row)" :disabled="isRowEditorControlDisabled()" @change="props.handleDatabaseInlineEditSelectChange(databaseCellEditor.fieldName, $event.target.value, databaseCellEditor.row)">
          <option v-for="item in props.getDatabaseInlineEditSelectOptions(databaseCellEditor.fieldName, databaseCellEditor.row)" :key="`${item.value}-${item.label}`" :value="item.value">{{ item.label }}</option>
        </select>
        <textarea v-else-if="isRowEditorTextareaControl()" class="database-cell-edit-textarea" rows="8" :value="props.getDatabaseInlineEditEditorValue(databaseCellEditor.fieldName, databaseCellEditor.row)" :disabled="isRowEditorControlDisabled()" :placeholder="isRowEditorNull() ? '当前将保存为 NULL；取消勾选后可编辑' : ''" @input="props.handleDatabaseInlineEditFieldInput(databaseCellEditor.fieldName, $event.target.value, databaseCellEditor.row)"></textarea>
        <input v-else class="database-cell-edit-input" :type="getRowEditorInputType()" :value="props.getDatabaseInlineEditEditorValue(databaseCellEditor.fieldName, databaseCellEditor.row)" :disabled="isRowEditorControlDisabled()" :placeholder="isRowEditorNull() ? '当前将保存为 NULL；取消勾选后可编辑' : ''" @input="props.handleDatabaseInlineEditFieldInput(databaseCellEditor.fieldName, $event.target.value, databaseCellEditor.row)" />
      </section>

      <section v-else-if="databaseCellEditor.mode === 'schema'" class="database-cell-edit-panel">
        <div class="database-cell-edit-meta">
          <strong>{{ databaseCellEditor.fieldName }}</strong>
          <span>{{ databaseSchema.database }} / {{ databaseSchema.table }} / {{ databaseCellEditor.row?.Field }}</span>
        </div>
        <select v-if="getSchemaEditorOptions().length" class="database-cell-edit-input" :value="getSchemaEditorSelectedKey()" @change="handleSchemaEditorOptionChange($event.target.value)">
          <option v-for="item in getSchemaEditorOptions()" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
        <textarea v-else-if="databaseCellEditor.fieldName === 'Comment'" class="database-cell-edit-textarea" rows="6" :value="getDatabaseSchemaInlineEditEditorValue(databaseCellEditor.fieldName)" @input="handleDatabaseSchemaInlineEditFieldInput(databaseCellEditor.fieldName, $event.target.value)"></textarea>
        <input v-else class="database-cell-edit-input" :value="getDatabaseSchemaInlineEditEditorValue(databaseCellEditor.fieldName)" @input="handleDatabaseSchemaInlineEditFieldInput(databaseCellEditor.fieldName, $event.target.value)" />
      </section>

      <template #footer>
        <div class="database-cell-edit-actions">
          <button type="button" @click="closeDatabaseCellEditor">取消</button>
          <button type="button" class="database-cell-edit-save" :disabled="databaseLoading || isDatabaseCellEditorSaveDisabled()" @click="saveDatabaseCellEditor">保存</button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { ElMessage } from 'element-plus'
  import { ArrowDown, Delete, Plus, RefreshRight } from '@element-plus/icons-vue'
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

  const props = defineProps([
    'databaseResultSummary',
    'databaseDataTab',
    'databaseResult',
    'databaseInlineEdit',
    'selectedDatabaseResultRow',
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
    'isDatabaseInlineEditFieldReadOnly',
    'saveDatabaseInlineEdit',
    'cancelDatabaseInlineEdit',
    'deleteDatabasePreviewRow',
    'reloadDatabasePreview',
    'ensureDatabaseTableSchemaLoaded',
    'databaseLoading',
    'databaseTableTooltipOptions',
    'databaseSchema',
    'databaseSchemaPageRows',
    'databaseSchemaRowClassName',
    'selectedDatabaseSchemaRow',
    'showDatabaseSchemaContextMenu',
    'databaseActiveDatabase',
    'databaseHasActiveTable',
    'canCreateDatabaseRows',
    'openCreateDatabaseRowDialog',
    'canCreateDatabaseColumns',
    'openCreateDatabaseColumnDialog',
    'deleteDatabaseSchemaColumn',
    'saveDatabaseSchemaInlineColumn',
    'reloadDatabaseSchema',
    'databasePreview',
    'handleDatabasePageSizeChange',
    'handleDatabasePageChange'
  ])

  const emit = defineEmits([
    'update:selectedDatabaseResultRow',
    'update:selectedDatabaseSchemaRow'
  ])

  function handleDatabaseResultRowChange(row) {
    emit('update:selectedDatabaseResultRow', row || null)
  }

  function handleDatabaseSchemaRowChange(row) {
    emit('update:selectedDatabaseSchemaRow', row || null)
  }

  const databaseCellMenu = reactive({ visible: false, mode: '', row: null, column: null, rowIndex: -1, x: 0, y: 0 })
  const databaseCellEditor = reactive({ open: false, mode: '', row: null, column: null, rowIndex: -1, fieldName: '' })
  const databaseCellEditorTitle = computed(() => {
    if (!databaseCellEditor.open) return '编辑单元格'
    return databaseCellEditor.mode === 'schema'
      ? `编辑字段属性：${databaseCellEditor.fieldName}`
      : '编辑数据'
  })

  function handleDatabaseResultCellSelect(row) {
    handleDatabaseResultRowChange(row)
  }

  function handleDatabaseSchemaCellSelect(row) {
    handleDatabaseSchemaRowChange(row)
  }

  function handleDatabaseResultCellContextMenu(row, column, cell, event) {
    const rowIndex = Array.isArray(props.databaseResult?.rows) ? props.databaseResult.rows.findIndex(item => item === row) : -1
    void openDatabaseCellContextMenu('rows', row, column, rowIndex, event)
  }

  function handleDatabaseSchemaCellContextMenu(row, column, cell, event) {
    const rowIndex = Array.isArray(props.databaseSchemaPageRows) ? props.databaseSchemaPageRows.findIndex(item => item === row) : -1
    void openDatabaseCellContextMenu('schema', row, column, rowIndex, event)
  }

  function handleDatabaseCellPointerDown(mode, row, column, rowIndex, event) {
    if (event?.button !== 2) return
    event.preventDefault()
    event.stopPropagation()
    void openDatabaseCellContextMenu(mode, row, column, rowIndex, event)
  }

  function handleDatabaseTablePointerDown(mode, event) {
    if (event?.button !== 2) return
    void openDatabaseCellContextMenuFromDom(mode, event)
  }

  function handleDatabaseTableContextMenu(mode, event) {
    void openDatabaseCellContextMenuFromDom(mode, event)
  }

  function getDatabaseColumnFieldName(column = null) {
    return String(column?.property || column?.prop || '').trim()
  }

  function normalizeDatabaseMenuColumn(column = null) {
    const fieldName = getDatabaseColumnFieldName(column)
    if (!fieldName) return null
    return {
      ...(column || {}),
      prop: column?.prop || fieldName,
      property: fieldName,
      label: column?.label || fieldName
    }
  }

  function getDatabaseTableRows(mode) {
    return mode === 'schema' ? props.databaseSchemaPageRows : props.databaseResult?.rows
  }

  function getDatabaseTableColumns(mode) {
    return mode === 'schema' ? props.databaseSchema?.columns : props.databaseResult?.columns
  }

  function resolveDatabaseDomCell(mode, event) {
    const target = event?.target
    const cellElement = target?.closest?.('td')
    const rowElement = target?.closest?.('tr')
    if (!cellElement || !rowElement || !rowElement.closest?.('.el-table__body')) return null
    const bodyElement = rowElement.parentElement
    const rowElements = Array.from(bodyElement?.children || []).filter(item => item.classList?.contains('el-table__row'))
    const rowIndex = rowElements.indexOf(rowElement)
    const cellIndex = Array.from(rowElement.children || []).indexOf(cellElement)
    const rows = getDatabaseTableRows(mode)
    const columns = getDatabaseTableColumns(mode)
    const row = Array.isArray(rows) ? rows[rowIndex] : null
    const column = Array.isArray(columns) ? normalizeDatabaseMenuColumn(columns[cellIndex]) : null
    if (!row || !column) return null
    return { row, column, rowIndex }
  }

  async function openDatabaseCellContextMenuFromDom(mode, event) {
    const resolved = resolveDatabaseDomCell(mode, event)
    if (!resolved) return
    event?.preventDefault?.()
    event?.stopPropagation?.()
    await openDatabaseCellContextMenu(mode, resolved.row, resolved.column, resolved.rowIndex, event)
  }

  async function openDatabaseCellContextMenu(mode, row, column, rowIndex, event) {
    const normalizedColumn = normalizeDatabaseMenuColumn(column)
    if (!row || !normalizedColumn) return
    if (mode === 'rows') handleDatabaseResultRowChange(row)
    else handleDatabaseSchemaRowChange(row)
    await ensureDatabaseContextSchemaLoaded(mode)
    databaseCellMenu.visible = true
    databaseCellMenu.mode = mode
    databaseCellMenu.row = row
    databaseCellMenu.column = normalizedColumn
    databaseCellMenu.rowIndex = rowIndex
    databaseCellMenu.x = event?.clientX || 0
    databaseCellMenu.y = event?.clientY || 0
  }

  async function ensureDatabaseContextSchemaLoaded(mode) {
    if (mode !== 'rows') return
    const database = String(props.databasePreview?.database || '').trim()
    const table = String(props.databasePreview?.table || '').trim()
    if (!database || !table || typeof props.ensureDatabaseTableSchemaLoaded !== 'function') return
    await props.ensureDatabaseTableSchemaLoaded(database, table)
    await nextTick()
  }

  function closeDatabaseCellContextMenu() {
    databaseCellMenu.visible = false
  }

  function buildDatabaseCellMenuStyle() {
    const width = 168
    const height = 204
    const x = Math.max(8, Math.min(databaseCellMenu.x, window.innerWidth - width - 8))
    const y = Math.max(8, Math.min(databaseCellMenu.y, window.innerHeight - height - 8))
    return { left: `${x}px`, top: `${y}px` }
  }

  function getContextFieldName() {
    return getDatabaseColumnFieldName(databaseCellMenu.column)
  }

  function canEditContextCell() {
    const fieldName = getContextFieldName()
    if (!fieldName || props.databaseLoading) return false
    if (databaseCellMenu.mode === 'schema') return isDatabaseSchemaEditableColumn(fieldName, databaseCellMenu.row)
    return databaseCellMenu.mode === 'rows' && props.databaseResult?.source === 'preview' && !!props.databasePreview?.table
  }

  function canDeleteContextRow() {
    if (!databaseCellMenu.row || props.databaseLoading) return false
    if (databaseCellMenu.mode === 'schema') return !!props.databaseSchema?.table && !!getDatabaseSchemaFieldMetaByRow(databaseCellMenu.row)
    return props.databaseResult?.source === 'preview'
      && !!props.databasePreview?.table
      && (props.databaseSchema?.identityKey?.columns || []).length > 0
  }

  function isContextRowDataCellEditable() {
    const fieldName = getContextFieldName()
    if (!fieldName || props.databaseLoading || databaseCellMenu.mode !== 'rows') return false
    if (props.databaseResult?.source !== 'preview') return false
    if (!(props.databaseSchema?.identityKey?.columns || []).length) return false
    if ((props.databaseSchema?.identityKey?.columns || []).includes(fieldName)) return false
    const fieldMeta = getContextRowDataFieldMeta()
    if (fieldMeta?.readOnly === true) return false
    if (fieldMeta?.schemaReadOnly === true) return false
    return true
  }

  function getContextRowDataFieldMeta() {
    const fieldName = getContextFieldName()
    return (props.databaseSchema?.fieldMeta || []).find(item => item.name === fieldName) || null
  }

  function canSetContextCellNull() {
    if (!isContextRowDataCellEditable()) return false
    const fieldMeta = getContextRowDataFieldMeta()
    if (!fieldMeta) return true
    return fieldMeta.nullable === true
  }

  function canSetContextCellEmpty() {
    return isContextRowDataCellEditable()
  }

  async function editContextCell() {
    const mode = databaseCellMenu.mode
    const row = databaseCellMenu.row
    const column = databaseCellMenu.column
    const rowIndex = databaseCellMenu.rowIndex
    const fieldName = getDatabaseColumnFieldName(column)
    closeDatabaseCellContextMenu()
    if (!row || !fieldName) return
    if (mode === 'schema') {
      openDatabaseSchemaInlineEdit(row, fieldName)
      openDatabaseCellEditor('schema', row, column, rowIndex, fieldName)
      return
    }
    await Promise.resolve(props.handleDatabaseResultCellClick?.(row, column))
    await nextTick()
    openDatabaseCellEditor('rows', row, column, rowIndex, fieldName)
  }

  async function prepareContextRowInlineEdit() {
    const row = databaseCellMenu.row
    const column = databaseCellMenu.column
    const fieldName = getDatabaseColumnFieldName(column)
    if (!row || !fieldName || databaseCellMenu.mode !== 'rows') return null
    await Promise.resolve(props.handleDatabaseResultCellClick?.(row, column))
    await nextTick()
    if (props.isDatabaseInlineEditRow?.(row) !== true) return null
    if (props.isDatabaseInlineEditFieldReadOnly?.(fieldName, row) === true) return null
    return { row, fieldName }
  }

  async function setContextCellNull() {
    if (!canSetContextCellNull()) return
    const context = await prepareContextRowInlineEdit()
    closeDatabaseCellContextMenu()
    if (!context) return
    props.setDatabaseInlineEditFieldNull?.(context.fieldName, true, context.row)
    await props.saveDatabaseInlineEdit?.()
  }

  async function setContextCellEmpty() {
    if (!canSetContextCellEmpty()) return
    const context = await prepareContextRowInlineEdit()
    closeDatabaseCellContextMenu()
    if (!context) return
    props.handleDatabaseInlineEditFieldInput?.(context.fieldName, '', context.row)
    await props.saveDatabaseInlineEdit?.()
  }

  function openDatabaseCellEditor(mode, row, column, rowIndex, fieldName) {
    databaseCellEditor.open = true
    databaseCellEditor.mode = mode
    databaseCellEditor.row = row
    databaseCellEditor.column = column
    databaseCellEditor.rowIndex = rowIndex
    databaseCellEditor.fieldName = String(fieldName || getDatabaseColumnFieldName(column)).trim()
  }

  function closeDatabaseCellEditor() {
    if (databaseCellEditor.mode === 'schema') cancelDatabaseSchemaInlineEdit()
    else if (databaseCellEditor.mode === 'rows') props.cancelDatabaseInlineEdit?.()
    databaseCellEditor.open = false
    databaseCellEditor.mode = ''
    databaseCellEditor.row = null
    databaseCellEditor.column = null
    databaseCellEditor.rowIndex = -1
    databaseCellEditor.fieldName = ''
  }

  async function saveDatabaseCellEditor() {
    const mode = databaseCellEditor.mode
    if (databaseCellEditor.mode === 'schema') {
      await handleSaveDatabaseSchemaInlineEdit()
    } else if (databaseCellEditor.mode === 'rows') {
      await props.saveDatabaseInlineEdit?.()
    }
    databaseCellEditor.mode = mode
    closeDatabaseCellEditor()
  }

  async function writeClipboardText(text = '') {
    const value = String(text ?? '')
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }
    if (typeof window.whSSH?.writeClipboardText === 'function') {
      await window.whSSH.writeClipboardText(value)
      return
    }
    throw new Error('当前环境不支持写入系统剪贴板')
  }

  async function copyContextCellValue() {
    const fieldName = getContextFieldName()
    const value = databaseCellMenu.mode === 'schema'
      ? getDatabaseSchemaCellDisplayValue(databaseCellMenu.row, fieldName)
      : getDatabaseCellDisplayValue(databaseCellMenu.row, fieldName, databaseCellMenu.row?.[fieldName])
    closeDatabaseCellContextMenu()
    try {
      await writeClipboardText(formatDatabaseCellValue(value))
      ElMessage.success('已复制单元格值')
    } catch (error) {
      ElMessage.error(`复制失败：${String(error?.message || error || '无法写入剪贴板')}`)
    }
  }

  async function copyContextRowValue() {
    const row = buildContextRowCopyValue()
    closeDatabaseCellContextMenu()
    try {
      await writeClipboardText(JSON.stringify(row, null, 2))
      ElMessage.success('已复制当前行')
    } catch (error) {
      ElMessage.error(`复制失败：${String(error?.message || error || '无法写入剪贴板')}`)
    }
  }

  function buildContextRowCopyValue() {
    const row = databaseCellMenu.row || {}
    if (databaseCellMenu.mode === 'schema') {
      const columns = Array.isArray(props.databaseSchema?.columns) ? props.databaseSchema.columns : []
      if (!columns.length) return row
      return Object.fromEntries(columns.map(column => {
        const fieldName = getDatabaseColumnFieldName(column)
        return [fieldName, getDatabaseSchemaCellDisplayValue(row, fieldName)]
      }).filter(([fieldName]) => fieldName))
    }
    const columns = Array.isArray(props.databaseResult?.columns) ? props.databaseResult.columns : []
    if (!columns.length) return row
    return Object.fromEntries(columns.map(column => {
      const fieldName = getDatabaseColumnFieldName(column)
      return [fieldName, getDatabaseCellDisplayValue(row, fieldName, row?.[fieldName])]
    }).filter(([fieldName]) => fieldName))
  }

  function deleteContextRow() {
    const mode = databaseCellMenu.mode
    const row = databaseCellMenu.row
    closeDatabaseCellContextMenu()
    if (!row) return
    if (mode === 'schema') props.deleteDatabaseSchemaColumn(row)
    else props.deleteDatabasePreviewRow(row)
  }

  function isDatabaseResultRowSelected(row) {
    return props.selectedDatabaseResultRow === row
  }

  function handleDeleteSelectedDatabaseRow() {
    if (!props.selectedDatabaseResultRow) return
    props.deleteDatabasePreviewRow(props.selectedDatabaseResultRow)
  }

  function handleCreateDatabaseRow() {
    props.openCreateDatabaseRowDialog()
  }

  function handleReloadDatabasePreview() {
    props.reloadDatabasePreview({ notify: true })
  }

  function handleCreateDatabaseColumn() {
    props.openCreateDatabaseColumnDialog()
  }

  function handleDeleteSelectedDatabaseSchemaRow() {
    if (!props.selectedDatabaseSchemaRow) return
    props.deleteDatabaseSchemaColumn(props.selectedDatabaseSchemaRow)
  }

  const DATABASE_SCHEMA_TYPE_OPTIONS = [
    'varchar(255)',
    'char(36)',
    'text',
    'longtext',
    'int',
    'bigint',
    'tinyint(1)',
    'decimal(10,2)',
    'datetime',
    'timestamp',
    'date',
    'json'
  ]
  const DATABASE_SCHEMA_COLLATION_OPTIONS = [
    'utf8mb4_0900_ai_ci',
    'utf8mb4_general_ci',
    'utf8mb4_unicode_ci',
    'utf8mb4_bin',
    'utf8mb3_general_ci',
    'latin1_swedish_ci'
  ]
  const schemaInlineEdit = ref(createDatabaseSchemaInlineEditState())
  const schemaInlineEditorRefs = new Map()
  const schemaInlineDropdownOpenKey = ref('')

  function createDatabaseSchemaInlineEditState(overrides = {}) {
    return {
      open: false,
      row: null,
      rowIndex: -1,
      activeField: '',
      originalName: '',
      form: null,
      originalForm: null,
      ...overrides
    }
  }

  function getSchemaInlineRefKey(rowIndex, fieldName = '') {
    return `schema::${Number(rowIndex)}::${String(fieldName || '').trim()}`
  }

  function setSchemaInlineEditorRef(rowIndex, fieldName, target) {
    const key = getSchemaInlineRefKey(rowIndex, fieldName)
    if (!key) return
    if (!target) {
      schemaInlineEditorRefs.delete(key)
      return
    }
    schemaInlineEditorRefs.set(key, target)
  }

  function focusSchemaInlineEditor(rowIndex, fieldName) {
    const target = schemaInlineEditorRefs.get(getSchemaInlineRefKey(rowIndex, fieldName))
    const input = resolveInlineInputElement(target)
    if (typeof target?.focus === 'function') target.focus()
    else input?.focus?.()
    if (input?.tagName === 'TEXTAREA') {
      resizeInlineTextarea(target)
      moveCursorToEnd(target)
      return
    }
    moveCursorToEnd(target)
  }

  function getDatabaseSchemaFieldMetaByRow(row = null) {
    const name = String(row?.Field || '').trim()
    if (!name) return null
    return (props.databaseSchema?.fieldMeta || []).find(item => item.name === name) || null
  }

  function buildDatabaseSchemaInlineEditForm(row = null) {
    const fieldMeta = getDatabaseSchemaFieldMetaByRow(row)
    if (!fieldMeta) return null
    const extraText = String(fieldMeta.extra || row?.Extra || '')
    return {
      name: fieldMeta.name,
      type: fieldMeta.type || '',
      key: fieldMeta.key || '',
      nullable: fieldMeta.nullable === true,
      defaultInput: formatDatabaseSchemaDefaultInput(fieldMeta.defaultValue),
      comment: fieldMeta.comment || '',
      collation: fieldMeta.collation || '',
      autoIncrement: /\bauto_increment\b/i.test(extraText),
      onUpdateCurrentTimestamp: /\bon update\s+current_timestamp(?:\(\d+\))?\b/i.test(extraText)
    }
  }

  function cloneDatabaseSchemaInlineEditForm(form = null) {
    return form ? { ...form } : null
  }

  function formatDatabaseSchemaDefaultInput(value) {
    if (value === null || value === undefined) return '无默认值'
    if (value === '') return "'' (空字符串)"
    return String(value)
  }

  function extractDatabaseSchemaTypeBase(type = '') {
    return String(type || '').trim().replace(/\(.*\)$/, '').trim()
  }

  function extractDatabaseSchemaTypeLength(type = '') {
    const match = String(type || '').trim().match(/^[^(]+\(([^)]+)\)/)
    return match ? String(match[1] || '').trim() : ''
  }

  function canDatabaseSchemaTypeUseLength(type = '') {
    const baseType = extractDatabaseSchemaTypeBase(type).toLowerCase()
    return ['varchar', 'char', 'decimal', 'numeric', 'float', 'double', 'bit', 'binary', 'varbinary', 'tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint'].includes(baseType)
  }

  function applyDatabaseSchemaTypeLength(type = '', lengthValue = '') {
    const baseType = extractDatabaseSchemaTypeBase(type)
    const normalizedLength = String(lengthValue || '').trim()
    if (!baseType) return ''
    if (!canDatabaseSchemaTypeUseLength(baseType)) return String(type || '')
    if (!normalizedLength) return baseType
    return `${baseType}(${normalizedLength})`
  }

  function getDatabaseSchemaFieldTypeCategory(type = '') {
    const normalizedType = String(type || '').trim().toLowerCase()
    if (/\b(datetime|timestamp)\b/.test(normalizedType)) return 'datetime'
    if (/\bdate\b/.test(normalizedType) && !/\b(datetime|timestamp)\b/.test(normalizedType)) return 'date'
    if (/\btime\b/.test(normalizedType) && !/\b(datetime|timestamp)\b/.test(normalizedType)) return 'time'
    if (/\b(decimal|numeric|float|double|real|tinyint|smallint|mediumint|int|integer|bigint|serial|number)\b/.test(normalizedType)) return 'number'
    if (/\bjson\b/.test(normalizedType)) return 'json'
    if (/\b(text|longtext|mediumtext|tinytext)\b/.test(normalizedType)) return 'text'
    return 'string'
  }

  function isDatabaseSchemaEditableColumn(fieldName = '', row = null) {
    const meta = getDatabaseSchemaFieldMetaByRow(row)
    if (!meta || meta.schemaReadOnly === true) return false
    const targetField = String(fieldName || '').trim()
    if (targetField === 'Length') return canDatabaseSchemaTypeUseLength(meta.type)
    return ['Field', 'Type', 'Null', 'Key', 'Default', 'Comment', 'Collation', 'Extra'].includes(targetField)
  }

  function isDatabaseSchemaInlineEditActiveRow(row) {
    return schemaInlineEdit.value.row === row
  }

  function isDatabaseSchemaInlineEditCell(row, fieldName = '') {
    return schemaInlineEdit.value.row === row && String(schemaInlineEdit.value.activeField || '') === String(fieldName || '')
  }

  function getDatabaseSchemaTableRowClassName(params = {}) {
    const classes = []
    const baseClassName = typeof props.databaseSchemaRowClassName === 'function'
      ? props.databaseSchemaRowClassName(params)
      : props.databaseSchemaRowClassName
    if (baseClassName) classes.push(baseClassName)
    if (params?.row && isDatabaseSchemaInlineEditActiveRow(params.row)) classes.push('database-result-row--editing')
    return classes.filter(Boolean).join(' ')
  }

  function handleDatabaseSchemaCellClick(row, column) {
    handleDatabaseSchemaRowChange(row)
    const fieldName = String(column?.property || '').trim()
    if (!isDatabaseSchemaEditableColumn(fieldName, row)) return
    openDatabaseSchemaInlineEdit(row, fieldName)
  }

  function openDatabaseSchemaInlineEdit(row, fieldName = '') {
    if (!row) return
    const form = buildDatabaseSchemaInlineEditForm(row)
    if (!form) return
    const nextField = String(fieldName || '').trim()
    if (schemaInlineEdit.value.row === row) {
      schemaInlineEdit.value.activeField = nextField
      nextTick(() => focusSchemaInlineEditor(schemaInlineEdit.value.rowIndex, nextField))
      return
    }
    const rowIndex = (props.databaseSchemaPageRows || []).findIndex(item => item === row)
    schemaInlineEdit.value = createDatabaseSchemaInlineEditState({
      open: true,
      row,
      rowIndex,
      activeField: nextField,
      originalName: String(row?.Field || '').trim(),
      form,
      originalForm: cloneDatabaseSchemaInlineEditForm(form)
    })
    nextTick(() => focusSchemaInlineEditor(rowIndex, nextField))
  }

  function cancelDatabaseSchemaInlineEdit() {
    schemaInlineEdit.value = createDatabaseSchemaInlineEditState()
    schemaInlineDropdownOpenKey.value = ''
  }

  function handleSchemaInlineEditorFocus(rowIndex, fieldName, row) {
    if (schemaInlineEdit.value.row !== row) openDatabaseSchemaInlineEdit(row, fieldName)
  }

  function handleSchemaInlineEditorBlur(rowIndex, fieldName) {
    const currentKey = getSchemaInlineRefKey(rowIndex, fieldName)
    requestAnimationFrame(() => {
      if (schemaInlineDropdownOpenKey.value && schemaInlineDropdownOpenKey.value === currentKey) return
      const activeElement = document.activeElement
      if (activeElement?.closest?.('.database-cell-editor-layer')) return
      if (schemaInlineEdit.value.activeField === fieldName) schemaInlineEdit.value.activeField = ''
    })
  }

  function handleSchemaInlineSelectorVisibleChange(rowIndex, fieldName, visible) {
    const currentKey = getSchemaInlineRefKey(rowIndex, fieldName)
    if (visible) {
      schemaInlineDropdownOpenKey.value = currentKey
      return
    }
    if (schemaInlineDropdownOpenKey.value === currentKey) schemaInlineDropdownOpenKey.value = ''
    handleSchemaInlineEditorBlur(rowIndex, fieldName)
  }

  function handleDatabaseSchemaInlineEditFieldInput(fieldName, value) {
    if (!schemaInlineEdit.value.form) return
    const form = schemaInlineEdit.value.form
    if (fieldName === 'Field') form.name = value
    else if (fieldName === 'Type') form.type = value
    else if (fieldName === 'Length') form.type = applyDatabaseSchemaTypeLength(form.type, value)
    else if (fieldName === 'Key') form.key = String(value || '').trim().toUpperCase()
    else if (fieldName === 'Default') form.defaultInput = value
    else if (fieldName === 'Comment') form.comment = value
    else if (fieldName === 'Collation') form.collation = value
  }

  function getDatabaseSchemaInlineEditEditorValue(fieldName = '') {
    const form = schemaInlineEdit.value.form
    if (!form) return ''
    if (fieldName === 'Field') return form.name
    if (fieldName === 'Type') return form.type
    if (fieldName === 'Length') return extractDatabaseSchemaTypeLength(form.type)
    if (fieldName === 'Key') return form.key || ''
    if (fieldName === 'Default') return form.defaultInput
    if (fieldName === 'Comment') return form.comment
    if (fieldName === 'Collation') return form.collation
    if (fieldName === 'Extra') return buildDatabaseSchemaInlineExtraText(form)
    if (fieldName === 'Null') return form.nullable ? 'YES' : 'NO'
    return ''
  }

  function buildDatabaseSchemaInlineExtraText(form = null) {
    if (!form) return ''
    const parts = []
    if (form.autoIncrement) parts.push('auto_increment')
    if (form.onUpdateCurrentTimestamp) parts.push('on update CURRENT_TIMESTAMP')
    return parts.join(' ')
  }

  function getDatabaseSchemaCellDisplayValue(row, fieldName = '') {
    if (!isDatabaseSchemaInlineEditActiveRow(row)) return row?.[fieldName]
    const form = schemaInlineEdit.value.form
    if (!form) return row?.[fieldName]
    if (fieldName === 'Field') return form.name
    if (fieldName === 'Type') return form.type
    if (fieldName === 'Length') return extractDatabaseSchemaTypeLength(form.type)
    if (fieldName === 'Null') return form.nullable ? 'YES' : 'NO'
    if (fieldName === 'Key') return form.key || ''
    if (fieldName === 'Default') return form.defaultInput === '无默认值' ? null : form.defaultInput
    if (fieldName === 'Comment') return form.comment
    if (fieldName === 'Collation') return form.collation
    if (fieldName === 'Extra') return buildDatabaseSchemaInlineExtraText(form)
    return row?.[fieldName]
  }

  function isDatabaseSchemaCellNullValue(row, fieldName = '') {
    const value = getDatabaseSchemaCellDisplayValue(row, fieldName)
    return value === null || value === undefined
  }

  function getDatabaseSchemaInlineDropdownItems(fieldName = '', row = null) {
    const meta = getDatabaseSchemaFieldMetaByRow(row)
    const form = schemaInlineEdit.value.form
    if (!meta || !form) return []
    if (fieldName === 'Type') {
      return DATABASE_SCHEMA_TYPE_OPTIONS.map(item => ({ key: `${fieldName}-${item}`, label: item, command: { kind: 'value', value: item } }))
    }
    if (fieldName === 'Key') {
      return [
        { key: `${fieldName}-none`, label: '无', command: { kind: 'key', value: '' } },
        { key: `${fieldName}-pri`, label: 'PRI', command: { kind: 'key', value: 'PRI' } },
        { key: `${fieldName}-uni`, label: 'UNI', command: { kind: 'key', value: 'UNI' } }
      ]
    }
    if (fieldName === 'Null') {
      return [
        { key: `${fieldName}-YES`, label: 'YES', command: { kind: 'toggle-nullable', value: true } },
        { key: `${fieldName}-NO`, label: 'NO', command: { kind: 'toggle-nullable', value: false } }
      ]
    }
    if (fieldName === 'Default') {
      const items = []
      if (meta.nullable) items.push({ key: `${fieldName}-null`, label: 'NULL', command: { kind: 'value', value: 'NULL' } })
      items.push({ key: `${fieldName}-none`, label: '无默认值', command: { kind: 'value', value: '无默认值' } })
      const category = getDatabaseSchemaFieldTypeCategory(form.type)
      if (category === 'json') items.push({ key: `${fieldName}-json-obj`, label: '{}', command: { kind: 'value', value: '{}' } }, { key: `${fieldName}-json-arr`, label: '[]', command: { kind: 'value', value: '[]' } })
      if (category === 'datetime') items.push({ key: `${fieldName}-ts`, label: 'CURRENT_TIMESTAMP', command: { kind: 'value', value: 'CURRENT_TIMESTAMP' } })
      if (category === 'date') items.push({ key: `${fieldName}-date`, label: 'CURRENT_DATE', command: { kind: 'value', value: 'CURRENT_DATE' } })
      if (category === 'time') items.push({ key: `${fieldName}-time`, label: 'CURRENT_TIME', command: { kind: 'value', value: 'CURRENT_TIME' } })
      if (category === 'number') items.push({ key: `${fieldName}-0`, label: '0', command: { kind: 'value', value: '0' } }, { key: `${fieldName}-1`, label: '1', command: { kind: 'value', value: '1' } })
      if (['string', 'text'].includes(category)) items.push({ key: `${fieldName}-empty`, label: "'' (空字符串)", command: { kind: 'value', value: "'' (空字符串)" } })
      return items
    }
    if (fieldName === 'Collation') {
      const values = [...new Set([String(form.collation || '').trim(), ...DATABASE_SCHEMA_COLLATION_OPTIONS].filter(Boolean))]
      return values.map(item => ({ key: `${fieldName}-${item}`, label: item, command: { kind: 'value', value: item } }))
    }
    if (fieldName === 'Extra') {
      const items = [{ key: `${fieldName}-none`, label: '空', command: { kind: 'extra', autoIncrement: false, onUpdateCurrentTimestamp: false } }]
      if (getDatabaseSchemaFieldTypeCategory(form.type) === 'number') {
        items.push({ key: `${fieldName}-auto`, label: 'auto_increment', command: { kind: 'extra', autoIncrement: true, onUpdateCurrentTimestamp: false } })
      }
      if (['datetime', 'date'].includes(getDatabaseSchemaFieldTypeCategory(form.type)) || /\btimestamp\b/i.test(String(form.type || ''))) {
        items.push({ key: `${fieldName}-update-ts`, label: 'on update CURRENT_TIMESTAMP', command: { kind: 'extra', autoIncrement: false, onUpdateCurrentTimestamp: true } })
      }
      return items
    }
    return []
  }

  function getSchemaEditorOptions() {
    const fieldName = databaseCellEditor.fieldName
    const row = databaseCellEditor.row
    return getDatabaseSchemaInlineDropdownItems(fieldName, row)
  }

  function getSchemaEditorSelectedKey() {
    const value = String(getDatabaseSchemaInlineEditEditorValue(databaseCellEditor.fieldName) || '')
    const options = getSchemaEditorOptions()
    const matched = options.find(item => String(item.command?.value ?? item.label ?? '') === value || String(item.label || '') === value)
    return matched?.key || options[0]?.key || ''
  }

  function handleSchemaEditorOptionChange(optionKey = '') {
    const option = getSchemaEditorOptions().find(item => item.key === optionKey)
    if (!option) return
    handleDatabaseSchemaInlineOptionCommand(databaseCellEditor.rowIndex, databaseCellEditor.fieldName, option.command)
  }

  function isRowEditorNullable() {
    return props.isDatabaseInlineEditFieldNullable?.(databaseCellEditor.fieldName, databaseCellEditor.row) === true
  }

  function isRowEditorNull() {
    return props.isDatabaseInlineEditFieldNull?.(databaseCellEditor.fieldName, databaseCellEditor.row) === true
  }

  function toggleRowEditorNull(value) {
    props.setDatabaseInlineEditFieldNull?.(databaseCellEditor.fieldName, value === true, databaseCellEditor.row)
  }

  function isRowEditorNullToggleDisabled() {
    if (isRowEditorDisabled()) return true
    if (isRowEditorNullable()) return false
    return !isRowEditorNull()
  }

  function getRowEditorNullToggleTitle() {
    if (isRowEditorNullable()) return '勾选后保存为 NULL；取消勾选后保存输入值'
    if (isRowEditorNull()) return '当前值为 NULL；取消勾选后可改为普通值'
    return '当前字段不允许保存为 NULL'
  }

  function getRowEditorFieldMeta() {
    const fieldName = String(databaseCellEditor.fieldName || '').trim()
    if (!fieldName) return null
    const activeEntry = (props.databaseInlineEdit?.rows || []).find(item => item.row === databaseCellEditor.row) || null
    const inlineField = (activeEntry?.fields || []).find(item => item.name === fieldName) || null
    if (inlineField) return inlineField
    return (props.databaseSchema?.fieldMeta || []).find(item => item.name === fieldName) || null
  }

  function getRowEditorFieldTypeText() {
    const meta = getRowEditorFieldMeta()
    const type = String(meta?.type || '').trim()
    if (type) return type
    return '未知'
  }

  function getRowEditorReadonlyReason() {
    const fieldName = String(databaseCellEditor.fieldName || '').trim()
    const meta = getRowEditorFieldMeta()
    if (!(props.databaseSchema?.identityKey?.columns || []).length) return '当前表未识别到主键或唯一键，暂不支持编辑当前行。'
    if (props.isDatabaseInlineEditRow?.(databaseCellEditor.row) !== true) return '当前单元格尚未进入可编辑状态，请重新打开编辑窗口。'
    if ((props.databaseSchema?.identityKey?.columns || []).includes(fieldName)) return '该字段用于定位当前行，不支持直接编辑。'
    const extra = String(meta?.extra || '').trim()
    if (/\bauto_increment\b/i.test(extra)) return '该字段为自增字段，不支持直接编辑。'
    if (/\b(virtual generated|stored generated)\b/i.test(extra)) return '该字段为生成字段，不支持直接编辑。'
    if (meta?.binary === true) return '该字段为二进制字段，不支持通过此弹窗编辑。'
    return '该字段不可编辑。'
  }

  function isRowEditorSelectControl() {
    return String(props.getDatabaseInlineEditControlType?.(databaseCellEditor.fieldName, databaseCellEditor.row) || '') === 'select'
      && props.getDatabaseInlineEditSelectOptions?.(databaseCellEditor.fieldName, databaseCellEditor.row)?.length > 0
  }

  function isRowEditorTextareaControl() {
    return String(props.getDatabaseInlineEditControlType?.(databaseCellEditor.fieldName, databaseCellEditor.row) || '') === 'textarea'
  }

  function getRowEditorInputType() {
    return props.getDatabaseInlineEditInputType?.(databaseCellEditor.fieldName, databaseCellEditor.row) || 'text'
  }

  function isRowEditorDisabled() {
    const fieldName = String(databaseCellEditor.fieldName || '').trim()
    if (!(props.databaseSchema?.identityKey?.columns || []).length) return true
    if (props.isDatabaseInlineEditRow?.(databaseCellEditor.row) !== true) return true
    if ((props.databaseSchema?.identityKey?.columns || []).includes(fieldName)) return true
    return props.isDatabaseInlineEditFieldReadOnly?.(fieldName, databaseCellEditor.row) === true
  }

  function isRowEditorControlDisabled() {
    return isRowEditorDisabled() || isRowEditorNull()
  }

  function isDatabaseCellEditorSaveDisabled() {
    if (!databaseCellEditor.open) return false
    if (databaseCellEditor.mode === 'rows') return isRowEditorDisabled()
    if (databaseCellEditor.mode === 'schema') return !isDatabaseSchemaEditableColumn(databaseCellEditor.fieldName, databaseCellEditor.row)
    return false
  }

  function hasDatabaseSchemaInlineDropdown(fieldName = '', row = null) {
    return getDatabaseSchemaInlineDropdownItems(fieldName, row).length > 0
  }

  function getDatabaseSchemaInlineActionTitle(fieldName = '') {
    if (fieldName === 'Null') return '选择是否允许 NULL'
    if (fieldName === 'Key') return '选择键类型'
    if (fieldName === 'Default') return '选择默认值'
    if (fieldName === 'Extra') return '选择附加属性'
    return '选择预设值'
  }

  function handleDatabaseSchemaInlineOptionCommand(rowIndex, fieldName, command) {
    const form = schemaInlineEdit.value.form
    if (!form || !command) return
    schemaInlineDropdownOpenKey.value = ''
    if (command.kind === 'value') {
      handleDatabaseSchemaInlineEditFieldInput(fieldName, command.value)
    } else if (command.kind === 'key') {
      form.key = command.value
    } else if (command.kind === 'toggle-nullable') {
      form.nullable = command.value === true
    } else if (command.kind === 'extra') {
      form.autoIncrement = command.autoIncrement === true
      form.onUpdateCurrentTimestamp = command.onUpdateCurrentTimestamp === true
    }
    nextTick(() => focusSchemaInlineEditor(rowIndex, fieldName))
  }

  function hasDatabaseSchemaInlinePendingChanges() {
    const current = schemaInlineEdit.value.form
    const original = schemaInlineEdit.value.originalForm
    if (!current || !original) return false
    return JSON.stringify(current) !== JSON.stringify(original)
  }

  async function handleSaveDatabaseSchemaInlineEdit() {
    if (!schemaInlineEdit.value.open || !schemaInlineEdit.value.form || !hasDatabaseSchemaInlinePendingChanges()) return
    const payload = {
      database: props.databaseSchema?.database,
      table: props.databaseSchema?.table,
      originalName: schemaInlineEdit.value.originalName,
      form: { ...schemaInlineEdit.value.form }
    }
    await props.saveDatabaseSchemaInlineColumn(payload)
    cancelDatabaseSchemaInlineEdit()
  }

  function handleReloadDatabaseSchema() {
    cancelDatabaseSchemaInlineEdit()
    props.reloadDatabaseSchema({ notify: true })
  }

  function isDatabaseInlineEditActiveRow(row) {
    return props.databaseInlineEdit?.activeRow === row
  }

  function getDatabaseResultTableRowClassName(params = {}) {
    const classes = []
    const baseClassName = typeof props.databaseResultRowClassName === 'function'
      ? props.databaseResultRowClassName(params)
      : props.databaseResultRowClassName
    if (baseClassName) classes.push(baseClassName)
    if (params?.row && isDatabaseInlineEditActiveRow(params.row)) classes.push('database-result-row--editing')
    return classes.filter(Boolean).join(' ')
  }

  function isDatabaseInlineEditCell(row, fieldName = '') {
    return props.isDatabaseInlineEditRow(row) && props.isDatabaseInlineEditFieldActive(fieldName, row)
  }

  function getDatabaseCellDisplayValue(row, fieldName = '', fallbackValue = null) {
    if (!props.isDatabaseInlineEditRow(row)) return fallbackValue
    if (props.isDatabaseInlineEditFieldNull(fieldName, row)) return null
    return props.getDatabaseInlineEditFieldValue(fieldName, row)
  }

  function isDatabaseCellNullValue(row, fieldName = '', fallbackValue = null) {
    return getDatabaseCellDisplayValue(row, fieldName, fallbackValue) === null || getDatabaseCellDisplayValue(row, fieldName, fallbackValue) === undefined
  }

  const inlineEditorRefs = new Map()
  const inlinePickerRefs = new Map()
  const inlineDropdownOpenKey = ref('')

  function getInlineEditorRefKey(rowIndex, fieldName = '') {
    return `${Number(rowIndex)}::${String(fieldName || '').trim()}`
  }

  function setInlineEditorRef(rowIndex, fieldName, target) {
    const key = getInlineEditorRefKey(rowIndex, fieldName)
    if (!key) return
    if (!target) {
      inlineEditorRefs.delete(key)
      return
    }
    inlineEditorRefs.set(key, target)
  }

  function setInlinePickerRef(rowIndex, fieldName, target) {
    const key = getInlineEditorRefKey(rowIndex, fieldName)
    if (!key) return
    if (!target) {
      inlinePickerRefs.delete(key)
      return
    }
    inlinePickerRefs.set(key, target)
  }

  function resolveInlineInputElement(target) {
    if (!target) return null
    if (target instanceof HTMLElement) return target
    if (target?.textarea instanceof HTMLTextAreaElement) return target.textarea
    if (target?.input instanceof HTMLInputElement) return target.input
    if (target?.inputRef?.input instanceof HTMLInputElement) return target.inputRef.input
    if (target?.$el?.querySelector) {
      return target.$el.querySelector('input, textarea')
    }
    return null
  }

  function resizeInlineTextarea(target) {
    const textarea = target instanceof HTMLTextAreaElement ? target : target?.textarea
    if (!textarea) return
    textarea.style.height = '100%'
  }

  function moveCursorToEnd(target) {
    const input = resolveInlineInputElement(target)
    if (!input || typeof input.setSelectionRange !== 'function') return
    if (input.tagName === 'INPUT') {
      const inputType = String(input.type || '').toLowerCase()
      if (!['', 'text', 'search', 'url', 'tel', 'password', 'email'].includes(inputType)) return
    }
    const text = String(input.value || '')
    try {
      input.setSelectionRange(text.length, text.length)
    } catch {}
  }

  function tryOpenPicker(target) {
    if (typeof target?.handleOpen === 'function') {
      setTimeout(() => {
        try {
          target.handleOpen()
        } catch {}
      }, 0)
      return
    }
    const input = resolveInlineInputElement(target)
    if (!input || typeof input.showPicker !== 'function') return
    setTimeout(() => {
      try {
        input.showPicker()
      } catch {}
    }, 0)
  }

  function focusInlineEditor(rowIndex, fieldName) {
    const key = getInlineEditorRefKey(rowIndex, fieldName)
    const target = inlineEditorRefs.get(key)
    const input = resolveInlineInputElement(target)
    if (typeof target?.focus === 'function') target.focus()
    else if (input?.focus) input.focus()
    if (input?.tagName === 'TEXTAREA') {
      resizeInlineTextarea(target)
      moveCursorToEnd(target)
      return
    }
    if (typeof target?.toggleMenu === 'function' || typeof target?.handleOpen === 'function') {
      tryOpenPicker(target)
      return
    }
    if (input?.tagName === 'INPUT') {
      const inputType = String(input.type || '').toLowerCase()
      if (['date', 'datetime-local', 'time'].includes(inputType)) {
        if (input.dataset.pickerManual === 'true') return
        tryOpenPicker(target)
      } else {
        moveCursorToEnd(target)
      }
    }
  }

  function handleInlineEditorComponentFocus(rowIndex, fieldName, row, event) {
    props.activateDatabaseInlineEditField(fieldName, row)
    const target = event?.target || inlineEditorRefs.get(getInlineEditorRefKey(rowIndex, fieldName))
    if (target?.tagName === 'TEXTAREA') resizeInlineTextarea(target)
  }

  function handleInlineEditorBlur(rowIndex, fieldName) {
    const currentField = String(props.databaseInlineEdit?.activeField || '')
    if (currentField !== String(fieldName || '')) return
    const currentKey = getInlineEditorRefKey(rowIndex, fieldName)
    requestAnimationFrame(() => {
      if (inlineDropdownOpenKey.value && inlineDropdownOpenKey.value === currentKey) return
      const activeElement = document.activeElement
      if (activeElement?.closest?.('.database-cell-editor-layer')) return
      props.activateDatabaseInlineEditField('')
    })
  }

  function handleInlineSelectorVisibleChange(rowIndex, fieldName, visible) {
    const currentKey = getInlineEditorRefKey(rowIndex, fieldName)
    if (visible) {
      inlineDropdownOpenKey.value = currentKey
      const row = props.databaseInlineEdit?.rows?.[rowIndex]?.row || null
      props.activateDatabaseInlineEditField(fieldName, row)
      return
    }
    if (inlineDropdownOpenKey.value === currentKey) inlineDropdownOpenKey.value = ''
    handleInlineEditorBlur(rowIndex, fieldName)
  }

  function handleInlineTextareaInput(fieldName, target) {
    props.handleDatabaseInlineEditFieldInput(fieldName, target.value)
    resizeInlineTextarea(target)
  }

  function isDatabaseInlinePickerField(fieldName = '', row = null) {
    return ['date', 'datetime', 'time'].includes(String(props.getDatabaseInlineEditFieldCategory(fieldName, row) || ''))
  }

  function getInlinePickerButtonTitle(fieldName = '', row = null) {
    const category = String(props.getDatabaseInlineEditFieldCategory(fieldName, row) || '')
    if (category === 'datetime') return '打开日期时间选择器'
    if (category === 'time') return '打开时间选择器'
    return '打开日期选择器'
  }

  function getInlinePickerMenuLabel(fieldName = '', row = null) {
    const category = String(props.getDatabaseInlineEditFieldCategory(fieldName, row) || '')
    if (category === 'datetime') return '选择日期时间'
    if (category === 'time') return '选择时间'
    return '选择日期'
  }

  function openInlineNativePicker(rowIndex, fieldName = '') {
    const key = getInlineEditorRefKey(rowIndex, fieldName)
    const target = inlinePickerRefs.get(key) || inlineEditorRefs.get(key)
    if (!target) return
    target.focus?.()
    tryOpenPicker(target)
  }

  function isInlineShellReadonly(fieldName = '', row = null) {
    const category = String(props.getDatabaseInlineEditFieldCategory(fieldName, row) || '')
    if (props.isDatabaseInlineEditFieldReadOnly(fieldName, row)) return true
    return category === 'boolean'
  }

  function getInlineShellInputType(fieldName = '', row = null) {
    if (isDatabaseInlinePickerField(fieldName, row)) return 'text'
    const category = String(props.getDatabaseInlineEditFieldCategory(fieldName, row) || '')
    if (category === 'number') return 'number'
    return 'text'
  }

  function getInlineNativePickerInputType(fieldName = '', row = null) {
    return props.getDatabaseInlineEditInputType(fieldName, row)
  }

  function getInlineShellDisplayValue(fieldName = '', row = null) {
    if (String(props.getDatabaseInlineEditFieldCategory(fieldName, row) || '') === 'boolean') {
      const currentValue = props.getDatabaseInlineEditSelectValue(fieldName, row)
      const option = props.getDatabaseInlineEditSelectOptions(fieldName, row).find(item => item.value === currentValue)
      return option?.label || ''
    }
    return props.getDatabaseInlineEditEditorValue(fieldName, row)
  }

  function hasInlineDropdownMenu(fieldName = '', row = null) {
    if (props.isDatabaseInlineEditFieldReadOnly(fieldName, row)) return false
    if (isDatabaseInlinePickerField(fieldName, row)) return true
    if (String(props.getDatabaseInlineEditControlType(fieldName, row) || '') === 'select') {
      return props.getDatabaseInlineEditSelectOptions(fieldName, row).length > 0
    }
    return props.getDatabaseInlineEditSuggestionItems(fieldName, row).length > 0
  }

  function getInlineDropdownItems(fieldName = '', row = null) {
    if (isDatabaseInlinePickerField(fieldName, row)) {
      const items = [{
        key: `${fieldName}-picker-open`,
        label: getInlinePickerMenuLabel(fieldName, row),
        command: {
          kind: 'picker'
        }
      }]
      for (const item of props.getDatabaseInlineEditSuggestionItems(fieldName, row)) {
        items.push({
          key: `${fieldName}-picker-${item.useNull ? 'null' : 'value'}-${item.label}-${item.value}`,
          label: item.label,
          command: {
            kind: 'suggestion',
            item
          }
        })
      }
      return items
    }
    if (String(props.getDatabaseInlineEditControlType(fieldName, row) || '') === 'select') {
      return props.getDatabaseInlineEditSelectOptions(fieldName, row).map(item => ({
        key: `${fieldName}-select-${item.value}-${item.label}`,
        label: item.label,
        command: {
          kind: 'select',
          value: item.value
        }
      }))
    }
    return props.getDatabaseInlineEditSuggestionItems(fieldName, row).map(item => ({
      key: `${fieldName}-suggestion-${item.useNull ? 'null' : 'value'}-${item.label}-${item.value}`,
      label: item.label,
      command: {
        kind: 'suggestion',
        item
      }
    }))
  }

  function getInlineActionButtonTitle(fieldName = '', row = null) {
    if (isDatabaseInlinePickerField(fieldName, row)) return '打开日期/时间选项'
    if (String(props.getDatabaseInlineEditControlType(fieldName, row) || '') === 'select') return '选择预设值'
    return '打开固定选项'
  }

  async function handleInlineOptionCommand(rowIndex, fieldName, row, command) {
    inlineDropdownOpenKey.value = ''
    if (command?.kind === 'picker') {
      await nextTick()
      openInlineNativePicker(rowIndex, fieldName)
      return
    }
    if (command?.kind === 'select') {
      props.handleDatabaseInlineEditSelectChange(fieldName, command.value, row)
    } else if (command?.kind === 'suggestion') {
      props.handleDatabaseInlineEditSuggestionSelect(fieldName, command.item, row)
    }
    await nextTick()
    focusInlineEditor(rowIndex, fieldName)
  }

  function formatDatabaseCellValue(value) {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  function hasDatabaseCellTooltipContent(value) {
    if (value === null || value === undefined) return true
    return String(formatDatabaseCellValue(value)).trim().length > 0
  }

  function getInlineDatalistId(fieldName = '') {
    return `database-inline-suggestions-${String(fieldName || '').trim()}`
  }

  function handleDatabaseDataPaneKeydown(event) {
    const isSave = (event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 's'
    if (!isSave) return
    if (!props.databaseInlineEdit?.open && !schemaInlineEdit.value.open) return
    event.preventDefault()
    event.stopPropagation()
    if (databaseCellEditor.open) void saveDatabaseCellEditor()
    else if (schemaInlineEdit.value.open) void handleSaveDatabaseSchemaInlineEdit()
    else props.saveDatabaseInlineEdit()
  }

  function handleDatabaseDataPanePointerDown(event) {
    if (!databaseCellMenu.visible) return
    if (event.target?.closest?.('.database-cell-context-menu')) return
    closeDatabaseCellContextMenu()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleDatabaseDataPaneKeydown)
    window.addEventListener('pointerdown', handleDatabaseDataPanePointerDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleDatabaseDataPaneKeydown)
    window.removeEventListener('pointerdown', handleDatabaseDataPanePointerDown)
  })

  watch(
    () => [props.databaseInlineEdit?.open, props.databaseInlineEdit?.activeField, props.databaseInlineEdit?.activeRowIndex],
    async ([open, activeField]) => {
      if (!open || !activeField) return
      await nextTick()
      focusInlineEditor(props.databaseInlineEdit?.activeRowIndex ?? -1, activeField)
    },
    { flush: 'post' }
  )

  watch(
    () => [props.databaseDataTab, props.databaseResult?.rows, props.databaseInlineEdit?.activeRow],
    ([tab, rows, activeRow]) => {
      if (!props.databaseInlineEdit?.open) return
      if (tab !== 'rows') {
        props.cancelDatabaseInlineEdit()
        return
      }
      if (activeRow && Array.isArray(rows) && !rows.includes(activeRow)) {
        props.cancelDatabaseInlineEdit()
      }
    }
  )

  watch(
    () => [props.databasePreview?.database, props.databasePreview?.table],
    ([databaseName, tableName], [prevDatabaseName, prevTableName]) => {
      if (!props.databaseInlineEdit?.open) return
      if (databaseName === prevDatabaseName && tableName === prevTableName) return
      props.cancelDatabaseInlineEdit()
      inlineDropdownOpenKey.value = ''
    }
  )

  watch(
    () => [props.databaseDataTab, props.databaseSchemaPageRows, props.databaseSchema?.table, props.databaseSchema?.database],
    ([tab, rows, tableName, databaseName], [prevTab, prevRows, prevTableName, prevDatabaseName]) => {
      if (!schemaInlineEdit.value.open) return
      if (tab !== 'schema') {
        cancelDatabaseSchemaInlineEdit()
        return
      }
      if (tableName !== prevTableName || databaseName !== prevDatabaseName || rows !== prevRows || tab !== prevTab) {
        cancelDatabaseSchemaInlineEdit()
      }
    }
  )
</script>

<style scoped>
  .database-cell-surface {
    position: relative;
    min-height: 27px;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid transparent;
    background: transparent;
    padding: 1px 4px;
    color: inherit;
    font: inherit;
    font-size: inherit;
    line-height: 1;
  }

  .database-rows-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 8px;
  }

  .database-rows-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    flex: 0 0 auto;
    border: 1px solid #e3e8f2;
    border-radius: 6px;
    background: #fafcff;
  }

  .database-rows-pane .database-table-wrap {
    flex: 1 1 auto;
    min-height: 0;
  }

  .database-rows-toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 1px solid #d6deeb;
    border-radius: 5px;
    background: #fff;
    color: #9aa4b2;
    cursor: pointer;
    transition: all 120ms ease;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .database-rows-toolbar-btn--add:not(:disabled) {
    color: #2563eb;
  }

  .database-rows-toolbar-btn--delete:not(:disabled) {
    color: #dc2626;
  }

  .database-rows-toolbar-btn--refresh:not(:disabled) {
    color: #111827;
  }

  .database-rows-toolbar-btn:hover:not(:disabled) {
    border-color: #9fc0ff;
    background: #f8fbff;
  }

  .database-rows-toolbar-btn:disabled {
    color: #9aa4b2;
    opacity: 1;
    cursor: not-allowed;
    box-shadow: none;
  }

  .database-rows-toolbar-btn :deep(.el-icon) {
    font-size: 13px;
  }

  .database-cell-context-menu {
    position: fixed;
    z-index: 2600;
    width: 168px;
    display: grid;
    gap: 2px;
    padding: 6px;
    border: 1px solid #d8e0ec;
    background: #ffffff;
    box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
  }

  .database-cell-context-menu button {
    height: 30px;
    padding: 0 10px;
    border: 0;
    background: transparent;
    color: #1f2937;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .database-cell-context-menu button:hover:not(:disabled) {
    background: #eef5ff;
    color: #2563eb;
  }

  .database-cell-context-menu button:disabled {
    color: #9aa4b2;
    cursor: not-allowed;
  }

  .database-cell-context-menu .database-cell-context-menu-danger {
    color: #dc2626;
  }

  .database-cell-edit-panel {
    display: grid;
    gap: 12px;
  }

  .database-cell-edit-meta {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid #e5eaf3;
    background: #f8fafc;
  }

  .database-cell-edit-meta-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .database-cell-edit-meta-row span,
  .database-cell-edit-meta-row strong {
    color: #334155;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.5;
  }

  .database-cell-edit-meta-row strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .database-cell-edit-meta > strong {
    color: #111827;
    font-size: 13px;
    font-weight: 600;
  }

  .database-cell-edit-meta > span {
    color: #64748b;
    font-size: 12px;
  }

  .database-cell-edit-readonly-tip {
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #fde2b8;
    background: #fff8ed;
    color: #9a5b13;
    font-size: 12px;
    line-height: 1.5;
  }

  .database-cell-edit-null-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #334155;
    font-size: 12px;
  }

  .database-cell-edit-null-toggle small {
    color: #94a3b8;
    font-size: 12px;
  }

  .database-cell-edit-input,
  .database-cell-edit-textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #d8e0ec;
    border-radius: 0;
    background: #ffffff;
    color: #111827;
    font-size: 13px;
    outline: none;
  }

  .database-cell-edit-input {
    height: 34px;
    padding: 0 10px;
  }

  .database-cell-edit-textarea {
    min-height: 150px;
    padding: 10px;
    resize: vertical;
    line-height: 1.5;
  }

  .database-cell-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .database-cell-edit-actions button {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #111111;
    border-radius: 0;
    background: #ffffff;
    color: #111111;
    cursor: pointer;
  }

  .database-cell-edit-actions .database-cell-edit-save {
    border-color: #111111;
    background: #111111;
    color: #ffffff;
  }

  .database-cell-edit-actions button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .database-cell-surface--editing {
    border-color: var(--el-color-primary);
    background: transparent;
  }

  .database-cell-surface--row-editing:not(.database-cell-surface--editing) {
    border-color: transparent;
    background: transparent;
  }

  .database-cell-inner {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 23px;
  }

  .database-row-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 8px;
    min-width: 8px;
    height: 10px;
    border: 0;
    background: transparent;
    color: rgba(59, 130, 246, 0.92);
    cursor: pointer;
    padding: 0;
    line-height: 1;
    font-size: 9px;
    box-sizing: border-box;
  }

  .database-row-indicator:not(.database-row-indicator--active) {
    color: transparent;
  }

  .database-row-indicator--active {
    background: transparent;
  }

  .database-cell-text {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 23px;
    padding: 0 4px;
    box-sizing: border-box;
    font: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: 23px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .database-cell-text-tooltip-trigger {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  .database-cell-text--ghost {
    visibility: hidden;
  }

  .database-cell-surface--null,
  .database-cell-surface--null .database-cell-text {
    color: var(--el-text-color-secondary);
  }

  .database-cell-editor {
    display: block;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    border: 0;
    outline: none;
    padding: 0 4px;
    margin: 0;
    background: transparent;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    box-sizing: border-box;
    vertical-align: middle;
  }

  .database-cell-editor-layer {
    position: absolute;
    inset: 1px 4px;
    display: flex;
    align-items: stretch;
    overflow: hidden;
  }

  .database-cell-editor-ui {
    width: 100%;
    height: 100%;
  }

  .database-cell-editor-ui--shell {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-height: 23px;
    overflow: hidden;
    position: relative;
  }

  .database-cell-editor-ui--textarea-shell {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-height: 23px;
    overflow: hidden;
  }

  .database-cell-editor--shell {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding-left: 4px;
    padding-right: 4px;
  }

  .database-cell-editor--shell[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .database-cell-editor--shell[type='number']::-webkit-outer-spin-button,
  .database-cell-editor--shell[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .database-cell-editor--readonly {
    cursor: default;
  }

  .database-cell-native-picker {
    position: absolute;
    inset: auto 0 0 auto;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
    border: 0;
    padding: 0;
    margin: 0;
  }

  .database-cell-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    min-width: 15px;
    height: 100%;
    border: 0;
    border-left: 1px solid #d9dee7;
    border-radius: 0;
    background: #eef2f7;
    color: #6b7280;
    padding: 0;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition: opacity 120ms ease;
    flex: 0 0 auto;
    align-self: stretch;
    margin-left: 0;
    position: relative;
    z-index: 2;
  }

  .database-cell-editor-ui--active .database-cell-action-btn,
  .database-cell-editor-ui--shell:focus-within .database-cell-action-btn,
  .database-cell-editor-ui--textarea-shell:focus-within .database-cell-action-btn {
    opacity: 1;
    visibility: visible;
  }

  .database-cell-action-btn:hover:not(:disabled) {
    background: #e3e8f1;
    color: #475569;
  }

  .database-cell-action-btn:disabled {
    cursor: not-allowed;
    color: var(--el-text-color-placeholder);
  }

  :deep(.database-cell-action-btn .el-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 10px;
  }

  .database-cell-editor--textarea {
    resize: none;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    padding-top: 0;
    padding-bottom: 0;
  }

  .database-cell-editor--select {
    appearance: none;
    cursor: pointer;
  }

  :deep(.database-cell-editor-layer .el-input),
  :deep(.database-cell-editor-layer .el-select) {
    width: 100%;
    height: 100%;
    font: inherit;
    font-size: inherit;
  }

  :deep(.database-cell-editor-ui--textarea-shell .el-input) {
    flex: 1 1 auto;
    min-width: 0;
  }

  :deep(.database-cell-editor-ui--shell .el-dropdown),
  :deep(.database-cell-editor-ui--textarea-shell .el-dropdown) {
    flex: 0 0 auto;
    width: auto;
    height: 100%;
    display: inline-flex;
    align-items: stretch;
  }

  :deep(.database-cell-editor-layer .el-input__wrapper),
  :deep(.database-cell-editor-layer .el-select__wrapper),
  :deep(.database-cell-editor-layer .el-textarea__inner) {
    min-height: 23px !important;
    height: 23px !important;
    border-radius: 0;
    box-shadow: none !important;
    border: 0 !important;
    background: transparent !important;
    padding: 0 4px !important;
    color: inherit !important;
    font: inherit !important;
    font-size: inherit !important;
    font-weight: inherit !important;
    line-height: 23px !important;
  }

  :deep(.database-cell-editor-layer .el-input__wrapper:hover),
  :deep(.database-cell-editor-layer .el-select__wrapper:hover) {
    box-shadow: none !important;
  }

  :deep(.database-cell-editor-layer .el-input__wrapper.is-focus),
  :deep(.database-cell-editor-layer .el-select__wrapper.is-focused) {
    box-shadow: none !important;
  }

  :deep(.database-cell-editor-layer .el-textarea) {
    height: 23px;
  }

  :deep(.database-cell-editor-layer .el-textarea__inner) {
    resize: none;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }

  :deep(.database-cell-editor-layer .el-input__inner),
  :deep(.database-cell-editor-layer .el-select__selected-item),
  :deep(.database-cell-editor-layer .el-textarea__inner) {
    color: inherit !important;
    font: inherit !important;
    font-size: inherit !important;
    font-weight: inherit !important;
    line-height: 23px !important;
  }

  :deep(.database-inline-dropdown-popper) {
    max-height: 240px;
    overflow: hidden;
  }

  :deep(.database-inline-dropdown-popper .el-scrollbar) {
    max-height: 240px;
  }

  :deep(.database-inline-dropdown-popper .el-scrollbar__wrap) {
    max-height: 240px;
    overflow-y: auto !important;
  }

  :deep(.database-inline-dropdown-popper .el-dropdown-menu) {
    max-height: 240px;
    overflow-y: auto;
  }

  :deep(.database-data-table .el-table__cell .cell) {
    padding: 0 2px !important;
    line-height: 1;
  }

  :deep(.database-data-table th.el-table__cell .cell) {
    padding: 0 10px !important;
  }

  :deep(.database-data-table .el-table__body tr.selected-row > td) {
    background: #e9f2ff !important;
  }

  :deep(.database-data-table .el-table__body tr.database-result-row--editing > td) {
    background: #d8e9ff !important;
  }

  :deep(.database-data-table .el-table__body tr.database-result-row--editing.selected-row > td) {
    background: #c7e0ff !important;
  }

  :deep(.database-data-table .el-table__body tr.database-result-row--editing .database-cell-surface--editing) {
    border-color: #4d96ff;
    box-shadow: inset 0 0 0 1px rgba(77, 150, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }

  :deep(.database-data-table .database-row-gutter-column),
  :deep(.database-data-table .database-row-gutter-header) {
    width: 10px !important;
    min-width: 10px !important;
    max-width: 10px !important;
    background: #f8fafc;
  }

  :deep(.database-data-table .database-row-gutter-column .cell),
  :deep(.database-data-table .database-row-gutter-header .cell) {
    padding: 0 !important;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 10px !important;
    min-width: 10px !important;
  }

  :deep(.database-data-table .database-row-gutter-column.el-table__cell),
  :deep(.database-data-table .database-row-gutter-header.el-table__cell) {
    padding: 0 !important;
    border-right-color: #eef2f7;
  }

  :deep(.database-data-table colgroup col:first-child) {
    width: 10px !important;
  }

  .database-cell-editor--picker::-webkit-calendar-picker-indicator {
    opacity: 0;
    width: 0;
    margin: 0;
    padding: 0;
  }
</style>
