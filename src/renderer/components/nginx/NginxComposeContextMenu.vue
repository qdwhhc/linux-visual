<template>
  <div v-if="contextMenu.visible" class="nginx-compose-menu-layer" :style="menuStyle" @pointerdown.stop>
    <div class="nginx-compose-context-menu">
      <button type="button" class="nginx-compose-context-menu-parent" :class="{ 'nginx-compose-context-menu-parent--open': contextSubmenu.visible }" @click="emit('toggle-type-submenu')">
        <span>新建节点</span>
        <em>{{ contextSubmenu.visible ? '⌃' : '⌄' }}</em>
      </button>
      <div v-if="contextSubmenu.visible" class="nginx-compose-context-menu-inline-submenu">
        <button v-for="item in contextSubmenu.items" :key="item.type" type="button" @click="emit('add-node', item.type)">
          <span>{{ item.label }}</span>
          <em v-if="item.recommended">推荐</em>
        </button>
      </div>
      <button v-if="contextMenu.node" type="button" :disabled="contextMenu.node?.type === 'main'" @pointerenter="emit('close-submenu')" @click="emit('favorite-node')">收藏为模板</button>
      <button v-if="contextMenu.node" type="button" :disabled="contextMenu.node?.type === 'main'" @pointerenter="emit('close-submenu')" @click="emit('delete-node')">删除当前节点</button>
    </div>
  </div>
</template>

<script setup>
  defineProps({
    contextMenu: { type: Object, required: true },
    contextSubmenu: { type: Object, required: true },
    menuStyle: { type: Object, default: () => ({}) }
  })

  const emit = defineEmits(['toggle-type-submenu', 'add-node', 'favorite-node', 'delete-node', 'close-submenu'])
</script>

<style scoped>
  .nginx-compose-menu-layer {
    position: fixed;
    z-index: 3200;
  }

  .nginx-compose-context-menu {
    position: relative;
    display: grid;
    min-width: 184px;
    padding: 3px;
    border: 1px solid #c8c8c8;
    border-radius: 4px;
    background: #f9f9f9;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
  }

  .nginx-compose-context-menu-inline-submenu {
    display: grid;
    gap: 1px;
    margin: 1px 0 3px 0;
    padding: 2px 0 2px 14px;
    border-left: 1px solid #d7d7d7;
    background: rgba(0, 0, 0, 0.02);
  }

  .nginx-compose-context-menu-inline-submenu button {
    min-height: 24px;
    padding-left: 18px;
    color: #333333;
  }

  .nginx-compose-context-menu button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 26px;
    padding: 4px 28px 4px 24px;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: #1f1f1f;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .nginx-compose-context-menu button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-context-menu button em {
    color: #555555;
    font-size: 11px;
    font-style: normal;
    flex: 0 0 auto;
    margin-right: -18px;
  }

  .nginx-compose-context-menu-parent em {
    color: #333333;
    font-size: 12px;
    line-height: 1;
  }

  .nginx-compose-context-menu button:hover:not(:disabled),
  .nginx-compose-context-menu-parent--open {
    background: #e5f1fb;
    color: #000000;
  }

  .nginx-compose-context-menu button:hover:not(:disabled) em,
  .nginx-compose-context-menu-parent--open em {
    color: #000000;
  }

  .nginx-compose-context-menu button:disabled {
    color: #94a3b8;
    cursor: not-allowed;
  }
</style>
