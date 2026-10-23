import { computed, ref } from 'vue'

const STORAGE_KEY = 'linux-visual:language'

function detectLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh-CN' || stored === 'en-US') return stored
    return /^zh(?:-|$)/i.test(navigator.language || '') ? 'zh-CN' : 'en-US'
  } catch {
    return 'zh-CN'
  }
}

export const appLanguage = ref(detectLanguage())

export function setAppLanguage(value) {
  appLanguage.value = value === 'en-US' ? 'en-US' : 'zh-CN'
  try {
    window.localStorage.setItem(STORAGE_KEY, appLanguage.value)
    document.documentElement.lang = appLanguage.value
  } catch {}
}

export function useAppLanguage() {
  const selectedLanguage = computed({
    get: () => appLanguage.value,
    set: value => setAppLanguage(value)
  })
  const translate = (chinese, english) => appLanguage.value === 'en-US' ? english : chinese
  return { appLanguage, selectedLanguage, translate }
}

setAppLanguage(appLanguage.value)
