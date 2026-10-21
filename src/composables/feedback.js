import { reactive } from 'vue'

let nextToastId = 1

export const toasts = reactive([])

export function notify(message, tone = 'success', timeout = 4000) {
  const id = nextToastId++
  toasts.push({ id, message, tone })
  if (timeout > 0) setTimeout(() => dismissToast(id), timeout)
  return id
}

export function dismissToast(id) {
  const index = toasts.findIndex((toast) => toast.id === id)
  if (index >= 0) toasts.splice(index, 1)
}

export const confirmState = reactive({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmar',
  tone: 'danger',
  resolve: null,
})

// Abre o diálogo de confirmação e resolve com true/false.
export function confirmAction({ title, message = '', confirmLabel = 'Confirmar', tone = 'danger' }) {
  confirmState.resolve?.(false)
  return new Promise((resolve) => {
    Object.assign(confirmState, { open: true, title, message, confirmLabel, tone, resolve })
  })
}

export function settleConfirm(value) {
  const resolve = confirmState.resolve
  Object.assign(confirmState, { open: false, resolve: null })
  resolve?.(value)
}
