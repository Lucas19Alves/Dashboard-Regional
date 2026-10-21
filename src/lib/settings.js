import { reactive, watch } from 'vue'

// Preferências do usuário salvas no navegador: tema, metas e lojas de cada regional.
const STORAGE_KEY = 'dashboard-regional-settings-v1'

export const DEFAULT_META = 3
export const DEFAULT_ATTENTION = 7

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const stored = readStored()

export const settings = reactive({
  theme: ['light', 'dark', 'system'].includes(stored.theme) ? stored.theme : 'light',
  meta: Number.isFinite(stored.meta) ? stored.meta : DEFAULT_META,
  attention: Number.isFinite(stored.attention) ? stored.attention : DEFAULT_ATTENTION,
  // { [regionId]: ['008', '015', ...] } — só existe quando o usuário alterou a lista padrão.
  storeOverrides: stored.storeOverrides && typeof stored.storeOverrides === 'object' ? stored.storeOverrides : {},
})

watch(settings, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Armazenamento indisponível: as preferências valem só nesta sessão.
  }
}, { deep: true })

export function getMeta() {
  return settings.meta
}

export function getAttention() {
  return Math.max(settings.attention, settings.meta)
}

// 'green' dentro da meta, 'orange' até o limite de atenção, 'red' acima.
export function getMetaTone(pct) {
  const value = Number(pct || 0)
  if (value <= settings.meta) return 'green'
  if (value <= getAttention()) return 'orange'
  return 'red'
}

export function formatLimit(value) {
  return String(Number(value)).replace('.', ',')
}

// ---------- Tema ----------
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function isDarkActive() {
  return settings.theme === 'dark' || (settings.theme === 'system' && Boolean(media?.matches))
}

export function applyTheme() {
  if (typeof document === 'undefined') return
  const dark = isDarkActive()
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1217' : '#1B2430')
}

watch(() => settings.theme, applyTheme)
media?.addEventListener?.('change', applyTheme)
