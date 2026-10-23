<template>
  <div v-if="editor.open" class="editor-mask">
    <div class="editor-panel">
      <div class="editor-head editor-head--code editor-menu-bar">
        <div class="editor-menu-group">
          <button class="editor-menu-btn" :disabled="editor.loading" @click="openEditorFind">查找</button>
          <button class="editor-menu-btn" :disabled="editor.loading" @click="openEditorReplace">替换</button>
          <el-dropdown trigger="click" placement="bottom-start" popper-class="editor-encoding-menu" @command="handleEditorEncodingCommand">
            <button class="editor-menu-btn editor-menu-btn--encoding" :disabled="editor.loading" type="button">
              <span>编码</span>
              <span class="editor-menu-btn-value">{{ getEditorEncodingLabel(editor.encoding) }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu class="editor-encoding-dropdown">
                <el-dropdown-item v-for="item in editorEncodingOptions" :key="item.value" :command="item.value" :class="{ active: item.value === editor.encoding }">
                  <span>{{ item.label }}</span>
                  <span v-if="item.value === editor.encoding" class="editor-encoding-current">当前</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <button class="editor-menu-btn" :disabled="editor.loading" @click="reloadEditorWithEncoding">重载</button>
          <button class="editor-menu-btn editor-menu-btn--strong" :disabled="editor.loading" @click="saveEditor">保存</button>
        </div>
        <button class="editor-path-button" :title="editor.path" @click="copyEditorPath">{{ editor.path }}</button>
        <button class="editor-close-btn" type="button" aria-label="关闭编辑器" @mousedown.stop @click.stop="closeEditor">
          <span class="editor-close-icon"></span>
        </button>
      </div>
      <div class="editor-tab-bar">
        <button v-for="item in editorTabs" :key="item.path" class="editor-tab-item" :class="{ active: item.path === editor.path }" @click="activateEditorTab(item.path)">
          <span class="editor-tab-name">{{ getFileBaseName(item.path) || '未命名文件' }}</span>
          <span v-if="item.content !== item.savedContent" class="editor-tab-dirty"></span>
          <span class="editor-tab-close" aria-label="关闭页签" @click.stop="closeEditorTab(item.path)">x</span>
        </button>
        <div class="editor-tab-bar-spacer"></div>
      </div>
      <div class="editor-code-wrap" :class="{ 'is-loading-cursor': editor.loading }">
        <div :ref="setEditorMonacoRef" class="editor-monaco"></div>
      </div>
      <div class="editor-actions">
        <span class="editor-status-text editor-status-text--strong">{{ editorHasUnsavedChanges ? '未保存修改' : '已保存' }}</span>
        <span class="editor-status-text">{{ getEditorFileTypeLabel(editor.path) }}</span>
        <span class="editor-status-text">{{ getEditorEncodingLabel(editor.encoding) }}</span>
        <span class="editor-status-text">Ln {{ editor.cursorLine }}, Col {{ editor.cursorColumn }}</span>
        <span class="editor-status-text editor-status-text--ghost">仅对服务器文本文件生效，媒体文件仍走预览模式</span>
      </div>
    </div>
  </div>
</template>

<script setup>
  defineProps([
    'editor',
    'openEditorFind',
    'openEditorReplace',
    'handleEditorEncodingCommand',
    'editorEncodingOptions',
    'reloadEditorWithEncoding',
    'saveEditor',
    'copyEditorPath',
    'closeEditor',
    'editorTabs',
    'activateEditorTab',
    'getFileBaseName',
    'closeEditorTab',
    'setEditorMonacoRef',
    'editorHasUnsavedChanges',
    'getEditorFileTypeLabel',
    'getEditorEncodingLabel'
  ])
</script>
