<template>
  <div v-if="mediaPreview.open" class="editor-mask image-preview-mask" @click.self="closeMediaPreview">
    <div class="editor-panel image-preview-panel media-preview-panel" :class="{ 'media-preview-panel--audio': mediaPreview.kind === 'audio' }">
      <div class="editor-head image-preview-head">
        <div class="image-preview-meta">
          <span class="image-preview-title">{{ mediaPreview.name }}</span>
        </div>
        <div class="image-preview-toolbar">
          <button class="preview-icon-btn preview-icon-btn--danger" type="button" title="关闭" aria-label="关闭" @mousedown.stop @click.stop="closeMediaPreview"><el-icon><Close /></el-icon></button>
        </div>
      </div>
      <div class="image-preview-stage media-preview-stage" :class="{ 'media-preview-stage--audio': mediaPreview.kind === 'audio' }">
        <div v-if="mediaPreview.status !== 'ready'" class="media-preview-status-card" :class="`media-preview-status-card--${mediaPreview.status}`">
          <div v-if="mediaPreview.status === 'loading'" class="media-preview-loading-orbit" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <strong>{{ mediaPreviewStatusTitle }}</strong>
          <span>{{ mediaPreview.statusText || '请稍候。' }}</span>
        </div>
        <video v-if="mediaPreview.kind === 'video'" v-show="mediaPreview.src" :ref="setMediaPreviewPlayerRef" :key="mediaPreview.src" class="media-preview-player media-preview-player--video" controls autoplay preload="metadata" @canplay="handleMediaPreviewCanPlay" @error="handleMediaPreviewError">
          <source :src="mediaPreview.src" :type="mediaPreview.mimeType" />
        </video>
        <div v-if="mediaPreview.kind === 'audio'" v-show="mediaPreview.status === 'ready'" class="media-preview-audio-shell">
          <el-icon><Headset /></el-icon>
          <span>{{ mediaPreview.name }}</span>
          <audio :ref="setMediaPreviewPlayerRef" :key="mediaPreview.src" class="media-preview-player media-preview-player--audio" controls autoplay preload="metadata" @canplay="handleMediaPreviewCanPlay" @error="handleMediaPreviewError">
            <source :src="mediaPreview.src" :type="mediaPreview.mimeType" />
          </audio>
        </div>
      </div>
      <div class="editor-actions image-preview-foot">
        <span>{{ mediaPreview.size ? `媒体大小：${formatSize(mediaPreview.size)}` : '媒体预览' }}</span>
        <span>{{ mediaPreview.kind === 'video' ? '远程视频预览' : '远程音频预览' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { Close, Headset } from '@element-plus/icons-vue'

  defineProps([
    'mediaPreview',
    'closeMediaPreview',
    'mediaPreviewStatusTitle',
    'setMediaPreviewPlayerRef',
    'handleMediaPreviewCanPlay',
    'handleMediaPreviewError',
    'formatSize'
  ])
</script>
