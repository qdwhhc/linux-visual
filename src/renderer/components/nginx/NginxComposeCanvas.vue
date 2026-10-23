<template>
  <div
    :ref="setCanvasElement"
    class="nginx-compose-canvas"
    :class="{ 'nginx-compose-canvas--dragging': !!canvas.dragState, 'nginx-compose-canvas--space-panning': canvas.spacePressed, 'nginx-compose-canvas--panning': canvas.panActive }"
    @pointerdown.capture="canvas.handlePointerDownCapture"
    @pointerdown="canvas.handlePointerDown"
    @pointermove="canvas.handlePointerMove"
    @contextmenu.prevent
    @wheel="canvas.handleWheel"
  >
    <div class="nginx-compose-space" :style="canvas.spaceStyle">
      <div :ref="setSurfaceElement" class="nginx-compose-surface" :style="canvas.surfaceStyle">
        <svg class="nginx-compose-lines" :width="edges.canvasSize.width" :height="edges.canvasSize.height" aria-hidden="true">
          <g v-for="edge in edges.items" :key="edge.id" class="nginx-compose-edge-group" @pointerdown.stop="edges.select(edge)">
            <path class="nginx-compose-line-hit" :d="edges.buildPath(edge)" />
            <path
              class="nginx-compose-line"
              :class="{ 'nginx-compose-line--selected': edges.selectedId === edge.id || edges.isConnectedToSelectedPort(edge) }"
              :style="edges.buildStyle(edge)"
              :d="edges.buildPath(edge)"
            />
          </g>
          <path v-if="edges.connectionDraft" class="nginx-compose-line nginx-compose-line--draft" :d="edges.draftPath" />
        </svg>

        <NginxComposeNode
          v-for="node in nodes.items"
          :key="node.id"
          :node="node"
          :node-style="nodes.buildStyle(node)"
          :is-dragging="canvas.dragState?.nodeId === node.id"
          :is-raised="nodes.raisedId === node.id"
          :is-draft-node="nodes.isDraft"
          :is-detached-node="nodes.isDetached"
          :get-node-state-label="nodes.getStateLabel"
          :start-node-drag="nodeActions.startDrag"
          :start-node-resize="nodeActions.startResize"
          :is-external-preview-node="nodeActions.isExternalPreview"
          :get-preview-hint="nodeActions.getPreviewHint"
          :get-include-files="includeFiles.getFiles"
          :get-include-file-port="includeFiles.getFilePort"
          :get-top-ports="nodeActions.getTopPorts"
          :get-top-ports-by-side="nodeActions.getTopPortsBySide"
          :is-port-connected="nodeActions.isPortConnected"
          :build-port-row-style="nodeActions.buildPortRowStyle"
          :get-port-display-label="nodeActions.getPortDisplayLabel"
        />
      </div>
    </div>
  </div>

  <NginxComposeZoomTools :label="zoom.label" :step="zoom.step" :adjust="zoom.adjust" />
</template>

<script setup>
  import NginxComposeNode from './NginxComposeNode.vue'
  import NginxComposeZoomTools from './NginxComposeZoomTools.vue'

  const props = defineProps({
    refs: { type: Object, required: true },
    canvas: { type: Object, required: true },
    edges: { type: Object, required: true },
    nodes: { type: Object, required: true },
    nodeActions: { type: Object, required: true },
    includeFiles: { type: Object, required: true },
    zoom: { type: Object, required: true }
  })

  function setCanvasElement(element) {
    props.refs.setCanvasRef(element || null)
  }

  function setSurfaceElement(element) {
    props.refs.setSurfaceRef(element || null)
  }
</script>

<style scoped>
  .nginx-compose-canvas {
    position: relative;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: auto;
    display: block;
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius, 4px);
    background:
      linear-gradient(90deg, rgba(15, 118, 110, 0.06) 1px, transparent 1px),
      linear-gradient(180deg, rgba(15, 118, 110, 0.06) 1px, transparent 1px),
      #f8fafc;
    background-size: 28px 28px;
  }

  .nginx-compose-canvas--space-panning,
  .nginx-compose-canvas--panning {
    cursor: grab;
  }

  .nginx-compose-canvas--panning {
    cursor: grabbing;
  }

  .nginx-compose-space {
    position: relative;
    min-width: 100%;
    min-height: 100%;
  }

  .nginx-compose-surface {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }

  .nginx-compose-lines {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    pointer-events: auto;
    z-index: 1;
  }

  .nginx-compose-edge-group {
    cursor: pointer;
  }

  .nginx-compose-line-hit {
    fill: none;
    stroke: transparent;
    stroke-width: 14;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: stroke;
  }

  .nginx-compose-canvas--dragging .nginx-compose-line-hit {
    display: none;
  }

  .nginx-compose-line {
    fill: none;
    stroke: var(--nginx-compose-edge-color, #16a34a);
    stroke-width: 2.35;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-opacity: 0.82;
    pointer-events: none;
    filter: drop-shadow(0 1px 1px color-mix(in srgb, var(--nginx-compose-edge-color, #16a34a) 18%, transparent));
    transition: stroke-width 0.12s ease, stroke-opacity 0.12s ease, filter 0.12s ease;
  }

  .nginx-compose-canvas--dragging .nginx-compose-line {
    filter: none;
  }

  .nginx-compose-edge-group:hover .nginx-compose-line:not(.nginx-compose-line--selected) {
    stroke-width: 3;
    stroke-opacity: 1;
    filter: drop-shadow(0 0 5px color-mix(in srgb, var(--nginx-compose-edge-color, #16a34a) 24%, transparent));
  }

  .nginx-compose-line--selected {
    stroke: #f97316;
    stroke-width: 3.6;
    stroke-opacity: 1;
    filter: drop-shadow(0 0 5px rgba(249, 115, 22, 0.34));
  }

  .nginx-compose-line--draft {
    stroke: #f97316;
    stroke-width: 2.8;
    stroke-opacity: 0.92;
    stroke-dasharray: 8 6;
    pointer-events: none;
  }
</style>
