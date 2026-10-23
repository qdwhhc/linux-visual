<template>
  <section class="activation-page page-section">
    <header class="activation-page__header">
      <div>
        <h3>应用授权</h3>
        <p>输入官网授权中心生成的本机激活码，完成本地激活。</p>
      </div>
      <strong :class="['activation-status-pill', { active: appActivated }]">
        {{ appActivationReady ? appActivationStatusText : '正在读取激活状态' }}
      </strong>
    </header>

    <div v-if="appActivationError" class="activation-notice">
      <el-icon><Warning /></el-icon>
      <span>{{ appActivationError }}</span>
    </div>

    <div class="activation-layout">
      <section class="activation-panel">
        <div class="activation-panel__head">
          <span class="activation-panel__icon"><el-icon><Key /></el-icon></span>
          <div>
            <h4>本地激活</h4>
            <p>{{ appActivationExpiresText }}</p>
          </div>
        </div>

        <label class="activation-field">
          <span>本机设备号</span>
          <div class="activation-device-row">
            <code>{{ appActivationDeviceId || '-' }}</code>
            <el-tooltip content="复制设备号" placement="top">
              <el-button link aria-label="复制设备号" @click="copyDeviceId">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </label>

        <label class="activation-field">
          <span>产品标识</span>
          <div class="activation-device-row activation-product-row">
            <code>{{ appActivationProductCode || '-' }}</code>
            <el-tooltip content="复制产品标识" placement="top">
              <el-button link aria-label="复制产品标识" @click="copyProductCode">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </label>

        <label class="activation-field">
          <span class="activation-field-head">
            <span>激活码</span>
            <span class="activation-code-links">
              <button type="button" @click="openPurchasePage">获取授权</button>
            </span>
          </span>
          <el-input
            v-model.trim="appActivationForm.activationCode"
            type="textarea"
            :rows="5"
            resize="none"
            placeholder="请输入 LV1 开头的本机激活码"
            :disabled="appActivationBusyAction === 'offline-activate'"
          />
        </label>

        <div class="activation-actions">
          <el-button type="primary" :loading="appActivationBusyAction === 'offline-activate'" @click="submitOfflineActivation">
            验证并激活
          </el-button>
        </div>
      </section>

      <aside class="activation-guide">
        <strong>授权中心</strong>
        <span>获取本机激活码在官网完成，桌面端只校验本地激活码。</span>
        <dl>
          <div>
            <dt>当前设备</dt>
            <dd>{{ maskDeviceId(appActivationDeviceId) }}</dd>
          </div>
          <div>
            <dt>产品标识</dt>
            <dd>{{ appActivationProductCode || '-' }}</dd>
          </div>
          <div>
            <dt>激活方式</dt>
            <dd>本地签名校验</dd>
          </div>
        </dl>
      </aside>
    </div>
  </section>
</template>

<script setup>
  import { ElMessage } from 'element-plus'

  const props = defineProps([
    'appActivationReady',
    'appActivated',
    'appActivationStatusText',
    'appActivationExpiresText',
    'appActivationDeviceId',
    'appActivationProductCode',
    'appActivationPurchaseUrl',
    'appActivationBusyAction',
    'appActivationError',
    'appActivationForm',
    'submitAppActivation'
  ])

  function maskDeviceId(value) {
    const text = String(value || '')
    if (text.length <= 16) return text || '-'
    return `${text.slice(0, 9)}...${text.slice(-7)}`
  }

  async function openPurchasePage() {
    const targetUrl = String(props.appActivationPurchaseUrl || '').trim()
    if (!targetUrl) {
      ElMessage.warning('授权中心地址暂不可用')
      return
    }
    try {
      await window.whSSH.openExternalUrl(targetUrl)
    } catch (error) {
      ElMessage.error(`打开授权中心失败：${error.message || error}`)
    }
  }

  async function copyDeviceId() {
    try {
      await window.whSSH.writeClipboardText(String(props.appActivationDeviceId || ''))
      ElMessage.success('设备号已复制')
    } catch (error) {
      ElMessage.error(`复制失败：${error.message || error}`)
    }
  }

  async function copyProductCode() {
    try {
      await window.whSSH.writeClipboardText(String(props.appActivationProductCode || ''))
      ElMessage.success('产品标识已复制')
    } catch (error) {
      ElMessage.error(`复制失败：${error.message || error}`)
    }
  }

  async function submitOfflineActivation() {
    const success = await props.submitAppActivation()
    if (success) ElMessage.success('应用已激活')
  }
</script>

<style scoped>
  .activation-page {
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding: 0;
    border-radius: 6px;
    background: #fff;
  }

  .activation-page__header {
    min-height: 78px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 0 22px;
    border-bottom: 1px solid #e5e7eb;
  }

  h3,
  h4,
  p {
    margin: 0;
  }

  .activation-page__header h3 {
    font-size: 18px;
    color: #111827;
  }

  .activation-page__header p,
  .activation-panel__head p {
    margin-top: 5px;
    color: #6b7280;
    font-size: 12px;
  }

  .activation-status-pill {
    flex: none;
    padding: 7px 12px;
    border-radius: 999px;
    background: #f3f4f6;
    color: #6b7280;
    font-size: 12px;
  }

  .activation-status-pill.active {
    background: #dcfce7;
    color: #15803d;
  }

  .activation-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 14px 22px 0;
    padding: 10px 12px;
    border: 1px solid #fecaca;
    border-radius: 4px;
    background: #fef2f2;
    color: #b91c1c;
    font-size: 12px;
  }

  .activation-layout {
    display: grid;
    grid-template-columns: minmax(420px, 1fr) 280px;
    gap: 18px;
    margin: 22px;
  }

  .activation-panel,
  .activation-guide {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fff;
  }

  .activation-panel {
    display: grid;
    gap: 18px;
    padding: 24px;
  }

  .activation-panel__head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .activation-panel__icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: #0f172a;
    color: #fff;
    font-size: 20px;
  }

  .activation-panel__head h4 {
    color: #111827;
    font-size: 15px;
  }

  .activation-field {
    display: grid;
    gap: 8px;
    color: #374151;
    font-size: 12px;
    font-weight: 700;
  }

  .activation-field :deep(.el-textarea__inner) {
    font-size: 12px;
    font-weight: 400;
  }

  .activation-field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .activation-code-links {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .activation-code-links button {
    padding: 0;
    border: 0;
    background: transparent;
    color: #2563eb;
    font-size: 12px;
    font-weight: 700;
  }

  .activation-code-links button:hover {
    color: #1d4ed8;
    text-decoration: underline;
  }

  .activation-device-row {
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px 0 12px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    background: #f9fafb;
  }

  .activation-device-row code {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: #374151;
    font-family: Consolas, monospace;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activation-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }

  .activation-guide {
    align-self: start;
    display: grid;
    gap: 10px;
    padding: 22px;
    background: #f8fafc;
  }

  .activation-guide > strong {
    color: #111827;
    font-size: 16px;
  }

  .activation-guide > span {
    color: #4b5563;
    font-size: 12px;
    line-height: 1.8;
  }

  .activation-guide dl {
    display: grid;
    gap: 10px;
    margin: 8px 0 0;
  }

  .activation-guide dl > div {
    display: grid;
    gap: 4px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
  }

  .activation-guide dt {
    color: #6b7280;
    font-size: 10px;
  }

  .activation-guide dd {
    margin: 0;
    color: #0f172a;
    font-family: Consolas, monospace;
    font-size: 11px;
    word-break: break-all;
  }

  @media (max-width: 900px) {
    .activation-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
