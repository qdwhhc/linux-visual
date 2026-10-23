import { ElMessage, ElMessageBox } from 'element-plus'

export function useAppBridgeSupport(options) {
  const {
    message,
    remotePath,
    sessionProtocol
  } = options

  function ensureSshFeature(featureName) {
    if (sessionProtocol.value === 'ssh') return true
    message.value = `${featureName} 仅支持 SSH 协议`
    return false
  }

  function reportError(error) {
    const rawText = error?.message || String(error || '未知错误')
    window.reportApplicationError?.('handled-application-error', error)
    const deniedMatch = rawText.match(/Permission denied\s+([^\s]+)$/) || rawText.match(/Permission denied.*?((?:\/|[A-Za-z]:)[^\s]*)/i)
    const deniedPath = deniedMatch?.[1] || ''
    const isRemoteWriteDenied = /remote method '(sftp:(mkdir|write-text|paste|rename|delete)|transfer:upload-local)'/i.test(rawText) && /Permission denied/i.test(rawText)
    const isFirewallError = /remote method 'firewall:(add-rule|delete-rule|overview)'/i.test(rawText)
      || /\b(ufw|firewalld|iptables|nftables)\b/i.test(rawText)
    let text = rawText
    if (isRemoteWriteDenied) {
      text = `当前目录 ${deniedPath || remotePath.value || '/'} 没有写权限，请切换到有权限的目录，或使用具备权限的账号。`
    } else if (isFirewallError && /No such file|not found|ENOENT/i.test(rawText)) {
      text = `防火墙规则操作失败。系统返回的是 “No such file or directory”，这通常不是文件问题，而是规则、链、表或 handle 已变化，没有命中当前这条规则。请先刷新规则后再试。\n\n原始错误：${rawText}`
    } else if (/command not found|未找到命令|\bnot found\s*$/im.test(rawText)) {
      text = '服务器未安装执行此操作所需的命令（如 zip、unzip、tar 等），请先在服务器端安装后再重试。'
    } else if (/No such file|not found|ENOENT/i.test(rawText)) {
      text = '目标文件或目录不存在，可能已被移动、删除，或当前列表未刷新。请刷新后重试。'
    } else if (/Failure|permission denied/i.test(rawText)) {
      text = `${rawText}\n\n这通常是服务器权限不足、路径不存在或目标目录不可写导致的。`
    }
    return ElMessageBox.alert(text, '错误', { type: 'error', confirmButtonText: '确定' })
  }

  function showPendingActionToast(text) {
    let toast = null
    let closed = false
    const timer = window.setTimeout(() => {
      if (closed) return
      toast = ElMessage({
        message: text,
        type: 'info',
        duration: 0,
        showClose: false,
        grouping: true
      })
    }, 400)
    return {
      close() {
        closed = true
        window.clearTimeout(timer)
        toast?.close?.()
      }
    }
  }

  function ensureBridgeMethod(methodName) {
    if (typeof window.whSSH?.[methodName] === 'function') return true
    throw new Error(`当前运行中的客户端还没有加载最新能力，请完全关闭应用后重新打开，再重试 ${methodName} 操作。`)
  }

  return {
    ensureSshFeature,
    reportError,
    showPendingActionToast,
    ensureBridgeMethod
  }
}
