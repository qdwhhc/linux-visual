<template>
  <div class="nginx-compose-zoom-tools" @pointerdown.stop>
    <span>{{ label }}</span>
    <button type="button" aria-label="放大编排" @click="adjust(step)">+</button>
    <button type="button" aria-label="缩小编排" @click="adjust(-step)">-</button>
  </div>
</template>

<script setup>
  defineProps({
    label: { type: String, default: '100%' },
    step: { type: Number, default: 0.1 },
    adjust: { type: Function, required: true }
  })
</script>

<style scoped>
  .nginx-compose-zoom-tools {
    position: absolute;
    left: 24px;
    bottom: 32px;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    padding: 6px;
    border: 1px solid #dbe3ea;
    border-radius: var(--nginx-radius, 4px);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14);
    backdrop-filter: blur(8px);
  }

  .nginx-compose-zoom-tools button {
    width: 28px;
    height: 28px;
    border: 1px solid #dbe3ea;
    border-radius: var(--nginx-radius, 4px);
    background: #f8fafc;
    color: #0f172a;
    font-size: 15px;
    cursor: pointer;
  }

  .nginx-compose-zoom-tools button:hover {
    border-color: #16a34a;
    color: #15803d;
  }

  .nginx-compose-zoom-tools span {
    min-width: 44px;
    color: #334155;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }
</style>
