<template>
  <div v-if="drawer.visible" class="nginx-compose-config-drawer" @pointerdown.stop>
    <div class="nginx-compose-config-drawer-backdrop" @click="closeDrawer"></div>
    <aside class="nginx-compose-config-drawer-panel">
      <header class="nginx-compose-config-drawer-head">
        <div>
          <strong>编辑代码块</strong>
          <span>{{ nodeTitle() }}</span>
        </div>
        <button type="button" aria-label="关闭编辑代码块" @click="closeDrawer">×</button>
      </header>
      <div class="nginx-compose-config-note">
        <strong>{{ drawer.blockLabel || '配置块' }}</strong>
        <span>保存后会重新解析当前节点；这里不直接写回文件，顶部“仅保存文件修改”负责真正落盘。</span>
      </div>
      <div class="nginx-compose-config-editor">
        <MonacoCodeEditor
          v-model="drawer.code"
          :path="drawer.path || 'nginx.conf'"
          theme="whssh-dark"
          :focus-on-content-change="drawer.visible"
        />
      </div>
      <p v-if="drawer.error" class="nginx-compose-config-error">{{ drawer.error }}</p>
      <footer class="nginx-compose-config-actions">
        <button type="button" @click="closeDrawer">取消</button>
        <button type="button" class="nginx-compose-config-save" @click="saveDrawer">解析并应用</button>
      </footer>
    </aside>
  </div>
</template>

<script setup>
  import MonacoCodeEditor from '../common/MonacoCodeEditor.vue'

  defineProps({
    drawer: { type: Object, required: true },
    nodeTitle: { type: Function, required: true },
    closeDrawer: { type: Function, required: true },
    saveDrawer: { type: Function, required: true }
  })
</script>

<style scoped>
  .nginx-compose-config-drawer {
    position: fixed;
    inset: 0;
    z-index: 220;
    pointer-events: auto;
  }

  .nginx-compose-config-drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.24);
    backdrop-filter: blur(2px);
  }

  .nginx-compose-config-drawer-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: min(760px, 92vw);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    border-left: 1px solid rgba(15, 23, 42, 0.12);
    background: linear-gradient(180deg, #f8fafc 0%, #ffffff 36%, #f7fee7 100%);
    box-shadow: -24px 0 54px rgba(15, 23, 42, 0.22);
  }

  .nginx-compose-config-drawer-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 22px 14px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }

  .nginx-compose-config-drawer-head div {
    display: grid;
    gap: 5px;
  }

  .nginx-compose-config-drawer-head strong {
    color: #0f172a;
    font-size: 20px;
    font-weight: 700;
  }

  .nginx-compose-config-drawer-head span {
    color: #64748b;
    font-size: 12px;
  }

  .nginx-compose-config-drawer-head button {
    width: 34px;
    height: 34px;
    border: 1px solid #dbe3ea;
    border-radius: 999px;
    background: #ffffff;
    color: #475569;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .nginx-compose-config-note {
    display: grid;
    gap: 6px;
    padding: 14px 22px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }

  .nginx-compose-config-note strong {
    color: #14532d;
    font-size: 13px;
    font-weight: 700;
  }

  .nginx-compose-config-note span {
    color: #64748b;
    font-size: 12px;
    line-height: 1.6;
  }

  .nginx-compose-config-editor {
    min-height: 0;
    padding: 16px 22px 12px;
  }

  .nginx-compose-config-editor :deep(.monaco-code-editor) {
    width: 100%;
    height: calc(100vh - 250px);
    min-height: 320px;
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-radius: var(--nginx-radius, 4px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  }

  .nginx-compose-config-error {
    margin: 0;
    padding: 0 22px 6px;
    color: #b91c1c;
    font-size: 12px;
    line-height: 1.6;
  }

  .nginx-compose-config-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 22px 18px;
    border-top: 1px solid rgba(15, 23, 42, 0.08);
    background: rgba(255, 255, 255, 0.86);
  }

  .nginx-compose-config-actions button {
    height: 34px;
    padding: 0 16px;
    border: 1px solid #dbe3ea;
    border-radius: var(--nginx-radius, 4px);
    background: #ffffff;
    color: #334155;
    font-size: 13px;
    cursor: pointer;
  }

  .nginx-compose-config-actions .nginx-compose-config-save {
    border-color: #16a34a;
    background: #16a34a;
    color: #ffffff;
    font-weight: 700;
  }

  @media (max-width: 760px) {
    .nginx-compose-config-drawer-panel {
      width: 100vw;
    }

    .nginx-compose-config-editor :deep(.monaco-code-editor) {
      height: calc(100vh - 270px);
    }
  }
</style>
