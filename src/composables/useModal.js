import { onBeforeUnmount, onMounted, watch } from 'vue'

let lockCount = 0

function lockScroll() {
  lockCount += 1
  document.body.style.overflow = 'hidden'
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (!lockCount) document.body.style.overflow = ''
}

// Fecha com Esc e trava o scroll da página enquanto o modal estiver aberto.
// Sem `isOpen`, o modal é considerado aberto enquanto o componente estiver montado.
export function useModal(onClose, isOpen = null) {
  let locked = false

  function sync(open) {
    if (open && !locked) { lockScroll(); locked = true }
    if (!open && locked) { unlockScroll(); locked = false }
  }

  function handleKey(event) {
    if (event.key !== 'Escape') return
    if (isOpen && !isOpen()) return
    onClose()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKey)
    sync(isOpen ? isOpen() : true)
  })

  if (isOpen) watch(isOpen, sync)

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKey)
    sync(false)
  })
}
