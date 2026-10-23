<template>
  <div class="pm2-overview-strip">
    <div class="pm2-overview-grid">
      <article v-for="item in items" :key="item.key" :class="['pm2-overview-card', item.tone || 'neutral']">
        <span class="pm2-overview-label">{{ item.label }}</span>
        <strong class="pm2-overview-value">{{ item.value }}</strong>
      </article>
    </div>
  </div>
</template>

<script setup>
  defineProps({
    items: {
      type: Array,
      default: () => []
    }
  })
</script>

<style scoped>
  .pm2-overview-strip {
    min-width : 0;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .pm2-overview-grid {
    display              : grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap                  : 12px;
    min-width            : 840px;
  }

  .pm2-overview-card {
    display      : grid;
    gap          : 4px;
    min-height   : 64px;
    padding      : 10px 12px;
    border       : 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 3px;
    background   : #ffffff;
  }

  .pm2-overview-card.active {
    border-color: #bbf7d0;
    background  : linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
  }

  .pm2-overview-card.info {
    border-color: #bfdbfe;
    background  : linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
  }

  .pm2-overview-card.warning {
    border-color: #fde68a;
    background  : linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
  }

  .pm2-overview-card.danger {
    border-color: #fecaca;
    background  : linear-gradient(135deg, #fef2f2 0%, #ffffff 100%);
  }

  .pm2-overview-card.cpu {
    border-color: #fde68a;
    background  : linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
  }

  .pm2-overview-card.memory {
    border-color: #a5f3fc;
    background  : linear-gradient(135deg, #ecfeff 0%, #ffffff 100%);
  }

  .pm2-overview-label {
    color    : #64748b;
    font-size: 11px;
  }

  .pm2-overview-value {
    color      : #0f172a;
    font-size  : 13px;
    font-weight: 400;
    line-height: 1.2;
  }
</style>
