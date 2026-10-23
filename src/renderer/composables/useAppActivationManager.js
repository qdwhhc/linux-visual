import { computed, onBeforeUnmount, ref } from 'vue'

function createDefaultState() {
  return {
    activated: false,
    activationMode: '',
    deviceId: '',
    productCode: 'desktop',
    purchaseUrl: '',
    activationCode: '',
    license: null,
    error: ''
  }
}

export function useAppActivationManager() {
  const ready = ref(false)
  const busyAction = ref('')
  const error = ref('')
  const state = ref(createDefaultState())
  const offlineForm = ref({ activationCode: '' })
  let expiryTimer = null

  const activated = computed(() => state.value.activated === true)
  const statusText = computed(() => {
    if (activated.value) return '已激活全部功能'
    return '应用未激活'
  })
  const expiresText = computed(() => {
    const expiresAt = Number(state.value.license?.expiresAt || 0)
    return !expiresAt ? '永久授权' : `有效期至 ${new Date(expiresAt).toLocaleDateString('zh-CN')}`
  })

  function applyState(nextState) {
    state.value = {
      ...createDefaultState(),
      ...(nextState || {})
    }
    offlineForm.value = {
      activationCode: state.value.activationCode || offlineForm.value.activationCode || ''
    }
    error.value = String(state.value.error || '')
    scheduleExpiryCheck()
  }

  function scheduleExpiryCheck() {
    if (expiryTimer) window.clearTimeout(expiryTimer)
    expiryTimer = null
    if (!state.value.activated) return
    const deadlines = []
    const rawExpiresAt = state.value.license?.expiresAt
    if (rawExpiresAt) deadlines.push(new Date(rawExpiresAt).getTime())
    const expiresAt = deadlines.filter(Number.isFinite).reduce((nearest, deadline) => Math.min(nearest, deadline), Infinity)
    if (!Number.isFinite(expiresAt)) return
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) {
      state.value = { ...state.value, activated: false }
      return
    }
    expiryTimer = window.setTimeout(() => {
      scheduleExpiryCheck()
    }, Math.min(remaining, 2147483647))
  }

  async function runStateAction(action, request) {
    if (busyAction.value) return false
    busyAction.value = action
    error.value = ''
    try {
      const result = await request()
      if (!result?.ok) {
        error.value = result?.error || '授权操作失败'
        return false
      }
      if (result.state) applyState(result.state)
      return true
    } catch (actionError) {
      error.value = actionError?.message || '授权操作失败'
      return false
    } finally {
      busyAction.value = ''
    }
  }

  async function initialize() {
    if (busyAction.value) return false
    busyAction.value = 'refresh'
    error.value = ''
    try {
      if (!window.whSSH?.getActivationState) throw new Error('当前环境不支持应用激活')
      applyState(await window.whSSH.getActivationState())
      return true
    } catch (initializationError) {
      error.value = initializationError?.message || '读取激活状态失败'
      return false
    } finally {
      ready.value = true
      busyAction.value = ''
    }
  }

  function submitOfflineActivation() {
    const activationCode = String(offlineForm.value.activationCode || '').trim()
    if (!activationCode) {
      error.value = '请输入激活码'
      return Promise.resolve(false)
    }
    return runStateAction('offline-activate', () => window.whSSH.activateOfflineLicense({ activationCode }))
  }

  onBeforeUnmount(() => {
    if (expiryTimer) window.clearTimeout(expiryTimer)
  })

  return {
    appActivationReady: ready,
    appActivated: activated,
    appActivationStatusText: statusText,
    appActivationExpiresText: expiresText,
    appActivationDeviceId: computed(() => state.value.deviceId),
    appActivationProductCode: computed(() => state.value.productCode || 'desktop'),
    appActivationPurchaseUrl: computed(() => state.value.purchaseUrl),
    appActivationLicense: computed(() => state.value.license),
    appActivationMode: computed(() => state.value.activationMode),
    appActivationBusyAction: busyAction,
    appActivationError: error,
    appActivationForm: offlineForm,
    initializeAppActivation: initialize,
    submitAppActivation: submitOfflineActivation
  }
}
