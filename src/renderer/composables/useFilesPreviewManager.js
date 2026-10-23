import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

function createImagePreviewState() {
  return {
    open: false,
    name: '',
    path: '',
    src: '',
    size: 0,
    tempPath: '',
    resourceToken: '',
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    dragging: false
  }
}

function createMediaPreviewState() {
  return {
    open: false,
    loading: false,
    status: 'idle',
    statusText: '',
    kind: '',
    name: '',
    path: '',
    src: '',
    size: 0,
    mimeType: '',
    tempPath: '',
    resourceToken: ''
  }
}

function clampImagePreviewScale(value) {
  return Math.min(5, Math.max(0.2, Number(value || 1)))
}

export function useFilesPreviewManager(options) {
  const {
    sessionId,
    message,
    isPreviewableVideoFile
  } = options

  const imagePreview = ref(createImagePreviewState())
  const mediaPreview = ref(createMediaPreviewState())
  const mediaPreviewPlayerRef = ref(null)

  let imagePreviewDragState = null

  const imagePreviewTransformStyle = computed(() => ({
    transform: `translate3d(${imagePreview.value.offsetX}px, ${imagePreview.value.offsetY}px, 0) rotate(${imagePreview.value.rotation}deg) scale(${imagePreview.value.scale})`
  }))

  const mediaPreviewStatusTitle = computed(() => {
    if (mediaPreview.value.status === 'loading') return '媒体加载中'
    if (mediaPreview.value.status === 'unsupported') return '编码不支持'
    if (mediaPreview.value.status === 'error') return '加载失败'
    return mediaPreview.value.kind === 'video' ? '远程视频预览' : '远程音频预览'
  })

  function setMediaPreviewPlayerRef(element) {
    mediaPreviewPlayerRef.value = element || null
  }

  function normalizeImagePreviewRotation(value) {
    const normalized = Number(value || 0) % 360
    return normalized < 0 ? normalized + 360 : normalized
  }

  function syncMediaPreviewLoadingCursor(loading) {
    document.body.style.cursor = loading ? 'progress' : ''
  }

  function setMediaPreviewState(patch = {}) {
    mediaPreview.value = {
      ...mediaPreview.value,
      ...patch
    }
    syncMediaPreviewLoadingCursor(mediaPreview.value.loading === true)
  }

  async function cleanupMediaPreviewTempFile(targetPath = mediaPreview.value.tempPath, resourceToken = mediaPreview.value.resourceToken) {
    if (!targetPath && !resourceToken) return
    try {
      await window.whSSH.cleanupPreviewTempFile({ path: targetPath, resourceToken })
    } catch (error) {
      // 忽略清理失败，避免打断关闭流程。
    }
  }

  function resetImagePreviewTransform() {
    imagePreview.value = {
      ...imagePreview.value,
      scale: 1,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      dragging: false
    }
    imagePreviewDragState = null
  }

  async function closeImagePreview() {
    const previousTempPath = imagePreview.value.tempPath
    const previousResourceToken = imagePreview.value.resourceToken
    imagePreview.value = createImagePreviewState()
    imagePreviewDragState = null
    await cleanupMediaPreviewTempFile(previousTempPath, previousResourceToken)
  }

  async function closeMediaPreview() {
    const previousTempPath = mediaPreview.value.tempPath
    const previousResourceToken = mediaPreview.value.resourceToken
    mediaPreview.value = createMediaPreviewState()
    syncMediaPreviewLoadingCursor(false)
    await cleanupMediaPreviewTempFile(previousTempPath, previousResourceToken)
  }

  function toggleMediaPreviewPlayback() {
    const player = mediaPreviewPlayerRef.value
    if (!player || mediaPreview.value.status !== 'ready') return
    if (player.paused) {
      const playResult = player.play?.()
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => {})
      }
      return
    }
    player.pause?.()
  }

  function seekMediaPreview(deltaSeconds) {
    const player = mediaPreviewPlayerRef.value
    if (!player || mediaPreview.value.status !== 'ready' || typeof player.currentTime !== 'number') return
    const duration = Number.isFinite(player.duration) ? player.duration : null
    const nextTime = Math.max(0, player.currentTime + Number(deltaSeconds || 0))
    player.currentTime = duration === null ? nextTime : Math.min(duration, nextTime)
  }

  function handleMediaPreviewShortcut(event) {
    if (!mediaPreview.value.open) return false
    const key = String(event.key || '')

    if (key === 'Escape') {
      event.preventDefault()
      closeMediaPreview()
      return true
    }

    if (mediaPreview.value.kind !== 'video' && mediaPreview.value.kind !== 'audio') return false

    if (key === ' ' || key === 'Spacebar') {
      event.preventDefault()
      toggleMediaPreviewPlayback()
      return true
    }

    if (key === 'ArrowLeft') {
      event.preventDefault()
      seekMediaPreview(-10)
      return true
    }

    if (key === 'ArrowRight') {
      event.preventDefault()
      seekMediaPreview(10)
      return true
    }

    return false
  }

  function handleMediaPreviewCanPlay() {
    if (!mediaPreview.value.open) return
    setMediaPreviewState({
      loading: false,
      status: 'ready',
      statusText: ''
    })
  }

  function handleMediaPreviewError() {
    const mediaError = mediaPreviewPlayerRef.value?.error
    let status = 'error'
    let statusText = '媒体加载失败，请稍后重试。'

    if (mediaError?.code === 4) {
      status = 'unsupported'
      statusText = '当前媒体编码或封装格式不受内置播放器支持，请下载后使用系统播放器打开。'
    } else if (mediaError?.code === 3) {
      status = 'unsupported'
      statusText = '媒体解码失败，可能是编码不支持或文件已损坏。'
    } else if (mediaError?.code === 2) {
      statusText = '媒体文件读取中断，请重新打开预览。'
    }

    setMediaPreviewState({
      loading: false,
      status,
      statusText
    })
    message.value = statusText
  }

  function zoomImagePreview(delta) {
    imagePreview.value = {
      ...imagePreview.value,
      scale: clampImagePreviewScale(imagePreview.value.scale + delta)
    }
  }

  function rotateImagePreview(delta) {
    imagePreview.value = {
      ...imagePreview.value,
      rotation: imagePreview.value.rotation + Number(delta || 0)
    }
  }

  function handleImagePreviewWheel(event) {
    if (!imagePreview.value.open) return
    zoomImagePreview(event.deltaY < 0 ? 0.2 : -0.2)
  }

  function startImagePreviewDrag(event) {
    if (!imagePreview.value.open || event.button !== 0) return
    imagePreviewDragState = {
      startX: event.clientX,
      startY: event.clientY,
      originX: imagePreview.value.offsetX,
      originY: imagePreview.value.offsetY
    }
    imagePreview.value = {
      ...imagePreview.value,
      dragging: true
    }
  }

  function handleImagePreviewPointerMove(event) {
    if (!imagePreviewDragState || !imagePreview.value.open) return
    imagePreview.value = {
      ...imagePreview.value,
      offsetX: imagePreviewDragState.originX + (event.clientX - imagePreviewDragState.startX),
      offsetY: imagePreviewDragState.originY + (event.clientY - imagePreviewDragState.startY),
      dragging: true
    }
  }

  function stopImagePreviewDrag() {
    if (!imagePreviewDragState && !imagePreview.value.dragging) return
    imagePreviewDragState = null
    if (!imagePreview.value.open) return
    imagePreview.value = {
      ...imagePreview.value,
      dragging: false
    }
  }

  async function openImagePreview(file, scope = 'local') {
    try {
      if (mediaPreview.value.open) {
        await closeMediaPreview()
      }
      if (imagePreview.value.open) await closeImagePreview()
      const result = scope === 'remote'
        ? await window.whSSH.prepareRemoteImagePreview({ sessionId: sessionId.value, path: file.path })
        : await window.whSSH.readLocalImage({ path: file.path })
      imagePreview.value = {
        ...createImagePreviewState(),
        open: true,
        name: file.name || file.path,
        path: file.path,
        src: result.fileUrl || result.dataUrl || '',
        size: Number(result.size || 0),
        tempPath: result.tempPath || '',
        resourceToken: result.resourceToken || ''
      }
    } catch (error) {
      message.value = `图片预览失败：${error.message}`
    }
  }

  async function openRemoteMediaPreview(file) {
    try {
      if (mediaPreview.value.open) {
        await closeMediaPreview()
      }
      await closeImagePreview()
      mediaPreview.value = {
        ...createMediaPreviewState(),
        open: true,
        loading: true,
        status: 'loading',
        statusText: '正在建立远程媒体流…',
        kind: isPreviewableVideoFile(file.name) ? 'video' : 'audio',
        name: file.name || file.path,
        path: file.path
      }
      syncMediaPreviewLoadingCursor(true)
      const result = await window.whSSH.prepareRemoteMediaPreview({ sessionId: sessionId.value, path: file.path })
      setMediaPreviewState({
        kind: result.kind,
        src: result.fileUrl,
        size: Number(result.size || 0),
        mimeType: result.mimeType || '',
        tempPath: result.tempPath || '',
        resourceToken: result.resourceToken || '',
        loading: true,
        status: 'loading',
        statusText: result.streaming ? '已连接远程媒体流，正在加载可播放片段…' : '正在读取媒体文件…'
      })
      await nextTick()
      const player = mediaPreviewPlayerRef.value
      if (player?.load) player.load()
      const playResult = player?.play?.()
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => {})
      }
    } catch (error) {
      setMediaPreviewState({
        open: true,
        loading: false,
        status: 'error',
        statusText: error.message || '媒体加载失败，请稍后重试。'
      })
      message.value = `媒体预览失败：${error.message}`
    }
  }

  onMounted(() => {
    window.addEventListener('mousemove', handleImagePreviewPointerMove)
    window.addEventListener('mouseup', stopImagePreviewDrag)
  })

  onBeforeUnmount(() => {
    syncMediaPreviewLoadingCursor(false)
    if (mediaPreview.value.tempPath || mediaPreview.value.resourceToken) {
      cleanupMediaPreviewTempFile(mediaPreview.value.tempPath, mediaPreview.value.resourceToken)
    }
    if (imagePreview.value.tempPath || imagePreview.value.resourceToken) {
      cleanupMediaPreviewTempFile(imagePreview.value.tempPath, imagePreview.value.resourceToken)
    }
    window.removeEventListener('mousemove', handleImagePreviewPointerMove)
    window.removeEventListener('mouseup', stopImagePreviewDrag)
  })

  return {
    imagePreview,
    mediaPreview,
    imagePreviewTransformStyle,
    mediaPreviewStatusTitle,
    setMediaPreviewPlayerRef,
    normalizeImagePreviewRotation,
    resetImagePreviewTransform,
    closeImagePreview,
    closeMediaPreview,
    handleMediaPreviewShortcut,
    handleMediaPreviewCanPlay,
    handleMediaPreviewError,
    zoomImagePreview,
    rotateImagePreview,
    handleImagePreviewWheel,
    startImagePreviewDrag,
    openImagePreview,
    openRemoteMediaPreview
  }
}
