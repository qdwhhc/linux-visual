import { ElMessage } from 'element-plus'

export function useNativeContextMenuBridge(options) {
  const {
    getContextActions,
    runContextAction
  } = options

  let activeNativeContextMenu = null
  let stopNativeContextMenuAction = null

  async function showNativeContextMenu(menuType, row, event) {
    const items = getContextActions(menuType, row)
    if (!items.length) return
    activeNativeContextMenu = {
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      menuType,
      row
    }
    try {
      await window.whSSH.showNativeContextMenu({
        requestId: activeNativeContextMenu.requestId,
        items: items.map(item => item.type === 'separator'
          ? { type: 'separator' }
          : {
              key: item.key,
              label: item.label,
              enabled: item.enabled !== false
            })
      })
    } catch (error) {
      activeNativeContextMenu = null
      ElMessage.error(`打开右键菜单失败：${error?.message || error}`)
    }
  }

  function bindNativeContextMenuAction() {
    cleanupNativeContextMenuBridge()
    stopNativeContextMenuAction = window.whSSH.onNativeContextMenuAction(payload => {
      if (!activeNativeContextMenu || payload.requestId !== activeNativeContextMenu.requestId) return
      const { menuType, row } = activeNativeContextMenu
      activeNativeContextMenu = null
      runContextAction(payload.key, menuType, row)
    })
  }

  function cleanupNativeContextMenuBridge() {
    if (stopNativeContextMenuAction) {
      stopNativeContextMenuAction()
      stopNativeContextMenuAction = null
    }
    activeNativeContextMenu = null
  }

  return {
    showNativeContextMenu,
    bindNativeContextMenuAction,
    cleanupNativeContextMenuBridge
  }
}
