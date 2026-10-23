<template>
  <section
    class="nginx-compose-node"
    :class="[`nginx-compose-node--${node.type}`, { 'nginx-compose-node--dragging': isDragging, 'nginx-compose-node--raised': isRaised, 'nginx-compose-node--draft': isDraftNode(node), 'nginx-compose-node--detached': isDetachedNode(node) }]"
    :style="nodeStyle"
    @pointerdown="startNodeDrag($event, node)"
    @contextmenu.prevent.stop
  >
    <div class="nginx-compose-node-head">
      <div class="nginx-compose-node-title">
        <span>{{ node.badge }}</span>
        <strong>{{ node.title }}</strong>
      </div>
    </div>
    <div v-if="isExternalPreviewNode(node)" class="nginx-compose-node-preview-note">
      <span>{{ getPreviewHint(node) }}</span>
    </div>
    <span v-if="getNodeStateLabel(node)" class="nginx-compose-node-state">{{ getNodeStateLabel(node) }}</span>

    <div v-if="readonlySourcePorts.length" class="nginx-compose-top-ports">
      <div class="nginx-compose-top-ports-column nginx-compose-top-ports-column--left">
        <div
          v-for="item in readonlySourcePorts"
          :key="item.id || item.label"
          class="nginx-compose-port-row nginx-compose-port-row--left"
          :class="{ 'nginx-compose-port-row--connected': isPortConnected(node, item) }"
          :style="buildPortRowStyle(node, item)"
          :title="item.hint || getPortDisplayLabel(node, item)"
          @pointerdown.stop.prevent
          @click.stop
        >
          <i></i>
          <span>{{ getPortDisplayLabel(node, item) }}</span>
        </div>
      </div>
    </div>

    <div v-if="readonlyGroups.length" class="nginx-compose-readonly-tree">
      <div v-for="group in readonlyGroups" :key="group.key" class="nginx-compose-readonly-group">
        <strong>{{ group.label }}</strong>
        <div class="nginx-compose-readonly-fields">
          <div v-for="row in group.rows" :key="row.key" :class="row.type === 'port' ? 'nginx-compose-readonly-port' : 'nginx-compose-readonly-field'">
            <template v-if="row.type === 'port'">
              <span :title="row.label">{{ row.label }}</span>
              <div
                class="nginx-compose-port-row"
                :class="{ 'nginx-compose-port-row--connected': isPortConnected(node, row.port) }"
                :style="buildPortRowStyle(node, row.port)"
                :title="row.port.hint || getPortDisplayLabel(node, row.port)"
                @pointerdown.stop.prevent
                @click.stop
              >
                <span>{{ getPortDisplayLabel(node, row.port) }}</span>
                <i></i>
              </div>
            </template>
            <template v-else>
              <span :title="row.label">{{ row.label }}</span>
              <em :title="row.value">{{ row.value }}</em>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="node.type === 'include'" class="nginx-compose-include-files">
      <div class="nginx-compose-include-files-head">
        <span>匹配文件</span>
        <small>{{ getIncludeFiles(node).length ? `${getIncludeFiles(node).length} 个` : '未匹配' }}</small>
      </div>
      <div v-if="getIncludeFiles(node).length" class="nginx-compose-include-file-list">
        <div v-for="file in getIncludeFiles(node)" :key="file.id" class="nginx-compose-include-file-row" :class="{ 'nginx-compose-include-file-row--unresolved': file.unresolved }">
          <span :title="file.path">{{ file.name || file.path }}</span>
          <div
            v-if="getIncludeFilePort(node, file)"
            class="nginx-compose-port-row nginx-compose-port-row--file"
            :class="{ 'nginx-compose-port-row--connected': isPortConnected(node, getIncludeFilePort(node, file)) }"
            :style="buildPortRowStyle(node, getIncludeFilePort(node, file))"
            :title="getIncludeFilePort(node, file).hint || getPortDisplayLabel(node, getIncludeFilePort(node, file))"
            @pointerdown.stop.prevent
            @click.stop
          >
            <span>{{ getPortDisplayLabel(node, getIncludeFilePort(node, file)) || 'server' }}</span>
            <i></i>
          </div>
          <small v-else>{{ file.unresolved ? '未解析' : '已匹配' }}</small>
        </div>
      </div>
      <div v-else class="nginx-compose-include-empty">未匹配到配置文件。</div>
    </div>
    <span class="nginx-compose-node-resize" aria-hidden="true" @pointerdown.stop.prevent="startNodeResize($event, node)"></span>
  </section>
</template>

<script setup>
  import { computed } from 'vue'

  const props = defineProps({
    node: { type: Object, required: true },
    nodeStyle: { type: Object, default: () => ({}) },
    isDragging: { type: Boolean, default: false },
    isRaised: { type: Boolean, default: false },
    isDraftNode: { type: Function, required: true },
    isDetachedNode: { type: Function, required: true },
    getNodeStateLabel: { type: Function, required: true },
    startNodeDrag: { type: Function, required: true },
    startNodeResize: { type: Function, required: true },
    isExternalPreviewNode: { type: Function, required: true },
    getPreviewHint: { type: Function, required: true },
    getIncludeFiles: { type: Function, required: true },
    getIncludeFilePort: { type: Function, required: true },
    getTopPorts: { type: Function, required: true },
    getTopPortsBySide: { type: Function, required: true },
    isPortConnected: { type: Function, required: true },
    buildPortRowStyle: { type: Function, required: true },
    getPortDisplayLabel: { type: Function, required: true }
  })

  const readonlyGroups = computed(() => buildReadonlyGroups(props.node))
  const readonlySourcePorts = computed(() => props.getTopPortsBySide(props.node, 'left'))

  function buildReadonlyGroups(node = {}) {
    const groups = []
    let activeGroup = null
    ;(Array.isArray(node.items) ? node.items : []).forEach(item => {
      if (item?.type === 'section') {
        activeGroup = { key: item.key || item.id || item.label, label: item.label || item.key || '配置', rows: [] }
        groups.push(activeGroup)
        return
      }
      if (item?.type === 'port') {
        if ((item.side || 'right') === 'left') return
        if (!activeGroup) {
          activeGroup = { key: 'default', label: getNodeDefaultGroupLabel(node), rows: [] }
          groups.push(activeGroup)
        }
        activeGroup.rows.push({ key: item.id || item.label, type: 'port', label: formatFieldLabel(item.label), port: item })
        return
      }
      if (item?.type !== 'field' || item.enabled === false) return
      const value = String(item.value || '').trim()
      if (!value) return
      if (!activeGroup) {
        activeGroup = { key: 'default', label: getNodeDefaultGroupLabel(node), rows: [] }
        groups.push(activeGroup)
      }
      activeGroup.rows.push({ key: item.id || item.label, type: 'field', label: formatFieldLabel(item.label), value: formatFieldValue(value) })
    })
    return groups.filter(group => group.rows.length)
  }

  function getNodeDefaultGroupLabel(node = {}) {
    if (node.type === 'include') return 'include'
    if (node.type === 'server') return 'server'
    if (node.type === 'location') return 'location'
    return '配置'
  }

  function formatFieldLabel(label = '') {
    const text = String(label || '').trim()
    return text.includes('.') ? text.split('.').pop() : text
  }

  function formatFieldValue(value = '') {
    const text = String(value || '').trim()
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    if (lines.length <= 1) return text
    return lines.join(' / ')
  }
</script>

<style scoped>
  .nginx-compose-node {
    --nginx-compose-node-accent: #16a34a;
    position: absolute;
    z-index: 3;
    width: 360px;
    display: grid;
    align-content: start;
    gap: 9px;
    min-width: 360px;
    padding: 12px;
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: var(--nginx-radius, 4px);
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
    cursor: grab;
    user-select: none;
    touch-action: none;
    will-change: transform;
  }

  .nginx-compose-node:active {
    cursor: grabbing;
  }

  .nginx-compose-node-resize {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 30px;
    height: 30px;
    border-radius: 0 0 calc(var(--nginx-radius, 4px) - 2px) 0;
    background: transparent;
    cursor: nwse-resize;
    touch-action: none;
  }

  .nginx-compose-node-resize::after {
    content: '';
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 15px;
    height: 15px;
    border-right: 2px solid rgba(15, 23, 42, 0.28);
    border-bottom: 2px solid rgba(15, 23, 42, 0.28);
    border-radius: 0 0 calc(var(--nginx-radius, 4px) - 4px) 0;
    background:
      linear-gradient(135deg, transparent 0 46%, rgba(15, 23, 42, 0.22) 47% 53%, transparent 54% 100%),
      linear-gradient(135deg, transparent 0 66%, rgba(15, 23, 42, 0.16) 67% 73%, transparent 74% 100%);
    opacity: 0.62;
    transition: opacity 0.12s ease, border-color 0.12s ease, background 0.12s ease;
  }

  .nginx-compose-node-resize:hover,
  .nginx-compose-node:active .nginx-compose-node-resize {
    background: rgba(249, 115, 22, 0.06);
  }

  .nginx-compose-node-resize:hover::after,
  .nginx-compose-node:active .nginx-compose-node-resize::after {
    border-color: rgba(249, 115, 22, 0.72);
    opacity: 1;
  }

  .nginx-compose-node--dragging {
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
  }

  .nginx-compose-node--raised {
    border-color: color-mix(in srgb, var(--nginx-compose-node-accent) 48%, rgba(15, 23, 42, 0.14));
    box-shadow: 0 24px 58px rgba(15, 23, 42, 0.2), 0 0 0 2px color-mix(in srgb, var(--nginx-compose-node-accent) 14%, transparent);
  }

  .nginx-compose-node--draft,
  .nginx-compose-node--detached {
    border-color: rgba(127, 29, 29, 0.72);
    box-shadow: 0 20px 48px rgba(127, 29, 29, 0.16), 0 0 0 2px rgba(127, 29, 29, 0.08);
  }

  .nginx-compose-node-state {
    justify-self: start;
    max-width: 100%;
    padding: 3px 8px;
    border: 1px solid rgba(127, 29, 29, 0.18);
    border-radius: 999px;
    background: rgba(254, 242, 242, 0.9);
    color: #7f1d1d;
    font-size: 11px;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-summary {
    display: grid;
    gap: 6px;
    padding: 2px 0 4px;
  }

  .nginx-compose-summary-row {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid #e2e8f0;
    border-radius: var(--nginx-radius, 4px);
    background: linear-gradient(180deg, rgba(248, 250, 252, 0.95), rgba(255, 255, 255, 0.98));
  }

  .nginx-compose-summary-row span {
    color: #64748b;
    font-size: 11px;
    line-height: 1.45;
  }

  .nginx-compose-summary-row strong {
    min-width: 0;
    color: #0f172a;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-readonly-tree {
    display: grid;
    gap: 8px;
    padding: 2px 0 4px;
  }

  .nginx-compose-readonly-group {
    display: grid;
    gap: 5px;
    padding-left: 10px;
    border-left: 2px solid color-mix(in srgb, var(--nginx-compose-node-accent) 42%, #dbe3ea);
  }

  .nginx-compose-readonly-group > strong {
    min-height: 18px;
    color: var(--nginx-compose-node-accent);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }

  .nginx-compose-readonly-fields {
    display: grid;
    gap: 4px;
  }

  .nginx-compose-readonly-field,
  .nginx-compose-readonly-port {
    display: grid;
    grid-template-columns: minmax(72px, 32%) minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    min-height: 30px;
    padding: 5px 8px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: var(--nginx-radius, 4px);
    background: rgba(255, 255, 255, 0.68);
    box-sizing: border-box;
  }

  .nginx-compose-readonly-port {
    align-items: center;
    background: rgba(255, 247, 237, 0.54);
  }

  .nginx-compose-readonly-port .nginx-compose-port-row {
    justify-self: end;
    width: auto;
    min-height: 20px;
    padding: 0;
  }

  .nginx-compose-readonly-field span,
  .nginx-compose-readonly-port > span {
    min-width: 0;
    overflow: hidden;
    color: #64748b;
    font-size: 11px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-readonly-field em {
    min-width: 0;
    overflow: hidden;
    color: #0f172a;
    font-size: 12px;
    font-style: normal;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-node--main {
    --nginx-compose-node-accent: #16a34a;
    border-top: 4px solid #16a34a;
    background:
      radial-gradient(circle at 14% 0%, rgba(187, 247, 208, 0.92), transparent 34%),
      linear-gradient(145deg, #ecfdf5 0%, #ffffff 56%, #dcfce7 100%);
  }

  .nginx-compose-node--include {
    --nginx-compose-node-accent: #0284c7;
    width: 360px;
    min-width: 360px;
    border-top: 4px solid #0284c7;
    background:
      radial-gradient(circle at 12% 0%, rgba(186, 230, 253, 0.9), transparent 35%),
      linear-gradient(145deg, #f0f9ff 0%, #ffffff 58%, #e0f2fe 100%);
  }

  .nginx-compose-node--server {
    --nginx-compose-node-accent: #f97316;
    width: 390px;
    border-top: 4px solid #f97316;
    background:
      radial-gradient(circle at 12% 0%, rgba(254, 215, 170, 0.9), transparent 35%),
      linear-gradient(145deg, #fff7ed 0%, #ffffff 58%, #ffedd5 100%);
  }

  .nginx-compose-node--location {
    --nginx-compose-node-accent: #a855f7;
    width: 360px;
    border-top: 4px solid #a855f7;
    background:
      radial-gradient(circle at 12% 0%, rgba(233, 213, 255, 0.92), transparent 35%),
      linear-gradient(145deg, #faf5ff 0%, #ffffff 58%, #f3e8ff 100%);
  }

  .nginx-compose-node--file {
    --nginx-compose-node-accent: #475569;
    width: 360px;
    border-top: 4px solid #475569;
    background:
      radial-gradient(circle at 12% 0%, rgba(203, 213, 225, 0.88), transparent 35%),
      linear-gradient(145deg, #f8fafc 0%, #ffffff 58%, #e2e8f0 100%);
  }

  .nginx-compose-node-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
  }

  .nginx-compose-node-title {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .nginx-compose-node-head-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nginx-compose-node-preview-note {
    margin-top: -2px;
    padding: 6px 8px;
    border: 1px dashed rgba(2, 132, 199, 0.28);
    border-radius: var(--nginx-radius, 4px);
    background: rgba(240, 249, 255, 0.85);
    color: #075985;
    font-size: 11px;
    line-height: 1.45;
  }

  .nginx-compose-node-head span {
    color: #64748b;
    font-size: 11px;
  }

  .nginx-compose-node-head strong {
    color: var(--nginx-compose-node-accent);
    font-size: 13px;
    font-weight: 400;
  }

  .nginx-compose-node-add {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid rgba(22, 163, 74, 0.28);
    border-radius: 999px;
    background: #ffffff;
    color: #16a34a;
    font-size: 16px;
    line-height: 1;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(22, 163, 74, 0.12);
  }

  .nginx-compose-node-add:hover {
    border-color: rgba(22, 163, 74, 0.58);
    background: #dcfce7;
  }

  .nginx-compose-top-ports {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 16px;
    min-height: 34px;
    padding: 4px 0 8px;
  }

  .nginx-compose-node--include .nginx-compose-top-ports {
    min-height: 42px;
    margin-bottom: 4px;
    padding-bottom: 10px;
    border-bottom: 1px dashed rgba(2, 132, 199, 0.2);
  }

  .nginx-compose-top-ports-column {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .nginx-compose-top-ports-column--left {
    justify-items: start;
  }

  .nginx-compose-top-ports-column--right {
    justify-items: end;
  }

  .nginx-compose-port-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    max-width: 100%;
    width: 100%;
    min-width: 0;
    min-height: 32px;
    padding: 6px 6px;
    box-sizing: border-box;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #0f172a;
    text-align: right;
    cursor: default;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .nginx-compose-port-row:hover {
    background: rgba(255, 247, 237, 0.74);
    color: #c2410c;
  }

  .nginx-compose-port-row--selected {
    background: rgba(255, 237, 213, 0.82);
    color: #c2410c;
  }

  .nginx-compose-port-row span {
    min-width: 0;
    color: currentColor;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-port-row em {
    display: none;
  }

  .nginx-compose-port-row i {
    width: 12px;
    height: 12px;
    border: 2px solid #94a3b8;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.12);
    flex: 0 0 auto;
    transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
  }

  .nginx-compose-port-handle {
    cursor: default;
  }

  .nginx-compose-port-row:hover i {
    border-color: #f97316;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.14);
  }

  .nginx-compose-port-row--connected {
    background: transparent;
    color: var(--nginx-compose-edge-color, #16a34a);
  }

  .nginx-compose-port-row--connected i {
    background: var(--nginx-compose-edge-color, #16a34a);
    border-color: var(--nginx-compose-edge-color, #16a34a);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--nginx-compose-edge-color, #16a34a) 16%, transparent), inset 0 0 0 2px #ffffff;
  }

  .nginx-compose-port-row--left {
    justify-content: flex-start;
    text-align: left;
    color: #0369a1;
  }

  .nginx-compose-port-row--left.nginx-compose-port-row--connected {
    background: transparent;
    color: var(--nginx-compose-edge-color, #16a34a);
  }

  .nginx-compose-port-row--selected,
  .nginx-compose-port-row--left.nginx-compose-port-row--selected {
    background: rgba(255, 237, 213, 0.82);
    color: #c2410c;
  }

  .nginx-compose-include-files {
    display: grid;
    gap: 6px;
    margin-top: 6px;
    padding: 8px;
    border: 1px solid rgba(2, 132, 199, 0.16);
    border-radius: var(--nginx-radius, 4px);
    background: rgba(255, 255, 255, 0.62);
  }

  .nginx-compose-include-files-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 20px;
    gap: 8px;
  }

  .nginx-compose-include-files-head span {
    color: #0369a1;
    font-size: 12px;
    font-weight: 600;
  }

  .nginx-compose-include-files-head small,
  .nginx-compose-include-file-row small,
  .nginx-compose-include-empty {
    color: #64748b;
    font-size: 11px;
  }

  .nginx-compose-include-file-list {
    display: grid;
    gap: 4px;
  }

  .nginx-compose-include-file-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 40px;
    gap: 8px;
    padding: 4px 4px 4px 8px;
    border: 1px solid rgba(14, 165, 233, 0.14);
    border-radius: 10px;
    background: rgba(240, 249, 255, 0.72);
    box-sizing: border-box;
  }

  .nginx-compose-include-file-row > span {
    min-width: 0;
    overflow: hidden;
    color: #0f172a;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-include-file-row--unresolved {
    border-color: rgba(148, 163, 184, 0.22);
    background: rgba(248, 250, 252, 0.82);
  }

  .nginx-compose-port-row--file {
    min-height: 24px;
    padding-right: 2px;
    color: #0369a1;
    width: auto;
  }

  .nginx-compose-port-row--file:hover {
    background: rgba(224, 242, 254, 0.88);
    color: #0284c7;
  }
</style>
