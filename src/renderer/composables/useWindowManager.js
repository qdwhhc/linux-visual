import { ElMessage } from 'element-plus'

export function useWindowManager(options) {
  const {
    windowState
  } = options

  async function syncWindowState() {
    try {
      windowState.value = await window.whSSH.getWindowState()
    } catch (error) {
    }
  }

  async function minimizeWindow() {
    try {
      await window.whSSH.minimizeWindow()
    } catch (error) {
      ElMessage.error(`最小化窗口失败：${error?.message || error}`)
    }
  }

  async function toggleWindowMaximize() {
    try {
      windowState.value = await window.whSSH.toggleMaximizeWindow()
    } catch (error) {
      ElMessage.error(`切换窗口大小失败：${error?.message || error}`)
    }
  }

  async function closeWindow() {
    try {
      await window.whSSH.closeWindow()
    } catch (error) {
      ElMessage.error(`关闭窗口失败：${error?.message || error}`)
    }
  }

  return {
    syncWindowState,
    minimizeWindow,
    toggleWindowMaximize,
    closeWindow
  }
}
