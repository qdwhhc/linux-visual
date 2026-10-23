import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'

export function useSystemUsersManager(options) {
  const {
    createSystemUserForm,
    connected,
    sessionId,
    ensureSshFeature,
    reportError,
    message,
    ensureBridgeMethod
  } = options

  const defaultOverview = { users: [], groups: [], shells: ['/bin/bash'], adminGroup: 'sudo' }

  const systemUsersOverview = ref({ ...defaultOverview })
  const systemUserLoading = ref(false)
  const systemUserKeyword = ref('')
  const systemUserFilter = ref('all')
  const systemUserDialog = ref({ open: false, mode: 'create', originalName: '', form: createSystemUserForm() })

  const filteredSystemUsers = computed(() => {
    const keyword = systemUserKeyword.value.trim().toLowerCase()
    return (systemUsersOverview.value.users || []).filter(item => {
      if (systemUserFilter.value === 'admin' && !item.isAdmin) return false
      if (systemUserFilter.value === 'human' && item.isSystem) return false
      if (systemUserFilter.value === 'system' && !item.isSystem) return false
      if (systemUserFilter.value === 'locked' && !item.locked) return false
      if (!keyword) return true
      return [item.name, item.home, item.shell, ...(item.groups || [])]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(keyword))
    })
  })

  function resetSystemUsersState() {
    systemUsersOverview.value = { ...defaultOverview }
    systemUserLoading.value = false
    systemUserKeyword.value = ''
    systemUserFilter.value = 'all'
    systemUserDialog.value = { open: false, mode: 'create', originalName: '', form: createSystemUserForm() }
  }

  async function loadSystemUsers(options = {}) {
    if (!connected.value) return
    if (!ensureSshFeature('系统账户')) return
    const { notify = false } = options
    systemUserLoading.value = true
    try {
      ensureBridgeMethod('getSystemUsersOverview')
      systemUsersOverview.value = await window.whSSH.getSystemUsersOverview(sessionId.value)
      if (notify) message.value = '系统账户列表已刷新'
    } catch (error) {
      await reportError(error)
    } finally {
      systemUserLoading.value = false
    }
  }

  function openCreateSystemUserDialog() {
    systemUserDialog.value = {
      open: true,
      mode: 'create',
      originalName: '',
      form: createSystemUserForm(null, {
        adminGroup: systemUsersOverview.value.adminGroup,
        defaultShell: systemUsersOverview.value.shells?.[0]
      })
    }
  }

  function openEditSystemUserDialog(user) {
    systemUserDialog.value = {
      open: true,
      mode: 'edit',
      originalName: user.name,
      form: createSystemUserForm(user, {
        adminGroup: systemUsersOverview.value.adminGroup,
        defaultShell: systemUsersOverview.value.shells?.[0]
      })
    }
  }

  async function submitSystemUserDialog() {
    if (!ensureSshFeature('系统账户')) return
    const dialog = systemUserDialog.value
    const formValue = dialog.form
    if (!formValue.username.trim()) {
      message.value = '请输入系统用户名'
      return
    }
    try {
      if (dialog.mode === 'create') {
        ensureBridgeMethod('createSystemUser')
        await window.whSSH.createSystemUser({
          sessionId: sessionId.value,
          username: formValue.username,
          password: formValue.password,
          shell: formValue.shell,
          groups: formValue.groups,
          admin: formValue.admin,
          createHome: formValue.createHome,
          home: formValue.home
        })
        message.value = `系统账户 ${formValue.username} 已创建`
      } else {
        ensureBridgeMethod('updateSystemUser')
        await window.whSSH.updateSystemUser({
          sessionId: sessionId.value,
          username: dialog.originalName,
          shell: formValue.shell,
          groups: formValue.groups,
          admin: formValue.admin,
          locked: formValue.locked
        })
        message.value = `系统账户 ${dialog.originalName} 已更新`
      }
      systemUserDialog.value.open = false
      await loadSystemUsers()
    } catch (error) {
      await reportError(error)
    }
  }

  async function renameSystemUserAccount(user) {
    try {
      ensureBridgeMethod('renameSystemUser')
      const result = await ElMessageBox.prompt('请输入新的系统用户名', '修改系统账户名称', {
        inputValue: user.name,
        confirmButtonText: '修改',
        cancelButtonText: '取消',
        inputPattern: /^[a-z_][a-z0-9_-]*$/,
        inputErrorMessage: '用户名只允许小写字母、数字、下划线和中划线'
      })
      const nextName = result.value.trim()
      if (!nextName || nextName === user.name) return
      await window.whSSH.renameSystemUser({ sessionId: sessionId.value, username: user.name, newUsername: nextName })
      message.value = `系统账户已改名为 ${nextName}`
      await loadSystemUsers()
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function changeSystemUserPassword(user) {
    try {
      ensureBridgeMethod('changeSystemUserPassword')
      const result = await ElMessageBox.prompt(`请输入 ${user.name} 的新密码`, '修改系统账户密码', {
        confirmButtonText: '修改',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '密码不能为空',
        inputType: 'password'
      })
      const password = result.value
      if (!password) return
      await window.whSSH.changeSystemUserPassword({ sessionId: sessionId.value, username: user.name, password })
      message.value = `已更新 ${user.name} 的密码`
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function toggleSystemUserLock(user) {
    try {
      ensureBridgeMethod('updateSystemUser')
      await ElMessageBox.confirm(
        user.locked ? `确认解除系统账户 ${user.name} 的锁定？` : `确认锁定系统账户 ${user.name}？`,
        user.locked ? '解除账户锁定' : '锁定账户',
        {
          type: 'warning',
          confirmButtonText: user.locked ? '解除锁定' : '锁定账户',
          cancelButtonText: '取消'
        }
      )
      await window.whSSH.updateSystemUser({ sessionId: sessionId.value, username: user.name, locked: !user.locked })
      systemUsersOverview.value = {
        ...systemUsersOverview.value,
        users: (systemUsersOverview.value.users || []).map(item => item.name === user.name ? { ...item, locked: !user.locked } : item)
      }
      message.value = user.locked ? `已解除 ${user.name} 的锁定` : `已锁定 ${user.name}`
      await loadSystemUsers()
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  async function removeSystemUser(user) {
    try {
      ensureBridgeMethod('deleteSystemUser')
      await ElMessageBox.confirm(`确认删除系统账户 ${user.name}？默认会同时删除它的家目录。`, '确认删除系统账户', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      await window.whSSH.deleteSystemUser({ sessionId: sessionId.value, username: user.name, removeHome: true })
      message.value = `系统账户 ${user.name} 已删除`
      await loadSystemUsers()
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
    }
  }

  function handleSystemUserMenuCommand(row, command) {
    if (command === 'edit') return openEditSystemUserDialog(row)
    if (command === 'rename') return renameSystemUserAccount(row)
    if (command === 'password') return changeSystemUserPassword(row)
    if (command === 'lock-toggle') return toggleSystemUserLock(row)
    if (command === 'delete') return removeSystemUser(row)
  }

  return {
    systemUsersOverview,
    systemUserLoading,
    systemUserKeyword,
    systemUserFilter,
    systemUserDialog,
    filteredSystemUsers,
    resetSystemUsersState,
    loadSystemUsers,
    openCreateSystemUserDialog,
    openEditSystemUserDialog,
    submitSystemUserDialog,
    renameSystemUserAccount,
    changeSystemUserPassword,
    toggleSystemUserLock,
    removeSystemUser,
    handleSystemUserMenuCommand
  }
}
