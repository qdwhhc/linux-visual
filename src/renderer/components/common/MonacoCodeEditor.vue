<template>
  <div ref="containerRef" class="monaco-code-editor"></div>
</template>

<script setup>
  import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

  const props = defineProps({
    modelValue: { type: String, default: '' },
    path: { type: String, default: 'untitled.txt' },
    theme: { type: String, default: 'whssh-dark' },
    readOnly: { type: Boolean, default: false },
    focusOnContentChange: { type: Boolean, default: false }
  })

  const emit = defineEmits(['update:modelValue', 'cursor-change', 'ready'])

  const containerRef = ref(null)
  let session = null
  let applyingExternalValue = false

  async function ensureSession() {
    if (session || !containerRef.value) return session
    const { createMonacoEditorSession } = await import('../../monacoEditor')
    session = await createMonacoEditorSession(containerRef.value, {
      theme: props.theme,
      readOnly: props.readOnly,
      onChange: value => {
        if (applyingExternalValue) return
        emit('update:modelValue', value)
      },
      onCursorChange: position => emit('cursor-change', position)
    })
    session.setFileContent(props.path, props.modelValue)
    session.setReadOnly(props.readOnly)
    emit('ready', session)
    return session
  }

  watch(containerRef, async () => {
    await nextTick()
    await ensureSession()
  }, { immediate: true })

  watch(() => props.theme, value => {
    session?.setTheme(value)
  })

  watch(() => props.readOnly, value => {
    session?.setReadOnly(value)
  })

  watch(() => [props.path, props.modelValue], async () => {
    const currentSession = await ensureSession()
    if (!currentSession) return
    const currentModel = currentSession.editor?.getModel?.()
    const currentPath = currentModel?.uri?.path || ''
    const currentValue = currentModel?.getValue?.() || ''
    const nextPath = String(props.path || '')
    const nextValue = String(props.modelValue || '')
    if (currentValue === nextValue && currentPath.endsWith(nextPath)) {
      currentSession.setReadOnly(props.readOnly)
      return
    }
    applyingExternalValue = true
    currentSession.setFileContent(props.path, props.modelValue)
    currentSession.setReadOnly(props.readOnly)
    if (props.focusOnContentChange) currentSession.focusStart()
    applyingExternalValue = false
  })

  onBeforeUnmount(() => {
    session?.dispose()
    session = null
  })
</script>
