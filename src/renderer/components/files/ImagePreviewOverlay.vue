<template>
  <div v-if="imagePreview.open" class="editor-mask image-preview-mask" @click.self="closeImagePreview">
    <div class="editor-panel image-preview-panel">
      <div class="editor-head image-preview-head">
        <div class="image-preview-meta">
          <span class="image-preview-title">{{ imagePreview.name }}</span>
        </div>
        <div class="image-preview-toolbar">
          <button class="preview-icon-btn preview-icon-btn--danger" type="button" title="关闭" aria-label="关闭" @mousedown.stop @click.stop="closeImagePreview"><el-icon><Close /></el-icon></button>
        </div>
      </div>
      <div class="image-preview-stage" :class="{ 'is-dragging': imagePreview.dragging }" @wheel.prevent="handleImagePreviewWheel" @mousedown="startImagePreviewDrag">
        <img :src="imagePreview.src" :alt="imagePreview.name" class="image-preview-image" :class="{ 'is-draggable': imagePreview.scale > 1 || imagePreview.dragging || imagePreview.offsetX || imagePreview.offsetY }" :style="imagePreviewTransformStyle" draggable="false" @dragstart.prevent />
        <div class="image-preview-floating-tools" @mousedown.stop>
          <el-tooltip content="缩小" placement="top"><button class="image-preview-tool-btn" type="button" aria-label="缩小" @click="zoomImagePreview(-0.2)"><el-icon><ZoomOut /></el-icon></button></el-tooltip>
          <el-tooltip content="放大" placement="top"><button class="image-preview-tool-btn" type="button" aria-label="放大" @click="zoomImagePreview(0.2)"><el-icon><ZoomIn /></el-icon></button></el-tooltip>
          <span class="image-preview-tool-divider"></span>
          <el-tooltip content="向左旋转" placement="top"><button class="image-preview-tool-btn" type="button" aria-label="向左旋转" @click="rotateImagePreview(-90)"><el-icon><RefreshLeft /></el-icon></button></el-tooltip>
          <el-tooltip content="向右旋转" placement="top"><button class="image-preview-tool-btn" type="button" aria-label="向右旋转" @click="rotateImagePreview(90)"><el-icon><RefreshRight /></el-icon></button></el-tooltip>
          <span class="image-preview-tool-divider"></span>
          <el-tooltip content="重置" placement="top"><button class="image-preview-tool-btn" type="button" aria-label="重置" @click="resetImagePreviewTransform"><el-icon><Refresh /></el-icon></button></el-tooltip>
        </div>
      </div>
      <div class="editor-actions image-preview-foot">
        <span>{{ imagePreview.size ? `图片大小：${formatSize(imagePreview.size)}` : '图片预览' }}</span>
        <span>缩放 {{ Math.round(imagePreview.scale * 100) }}% · 旋转 {{ normalizeImagePreviewRotation(imagePreview.rotation) }}°</span>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { Close, Refresh, RefreshLeft, RefreshRight, ZoomIn, ZoomOut } from '@element-plus/icons-vue'

  defineProps([
    'imagePreview',
    'closeImagePreview',
    'zoomImagePreview',
    'rotateImagePreview',
    'resetImagePreviewTransform',
    'handleImagePreviewWheel',
    'startImagePreviewDrag',
    'imagePreviewTransformStyle',
    'formatSize',
    'normalizeImagePreviewRotation'
  ])
</script>
