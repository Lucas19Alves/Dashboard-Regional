import { reactive, ref, watch } from 'vue'
import { exportSessionsAsJson } from './database'

// Controle de lembretes de backup por regional, salvo no navegador.
const STORAGE_KEY = 'dashboard-regional-backup-v1'
// Peso acumulado de alterações a partir do qual o lembrete aparece.
export const REMINDER_THRESHOLD = 3

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// { [regionId]: { pending, snoozedAt, lastBackupAt } }
export const backupState = reactive(readStored())

watch(backupState, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Sem armazenamento: os lembretes valem só nesta sessão.
  }
}, { deep: true })

// Muda quando os dados são restaurados por fora da página (ex.: backup importado no aviso inicial).
export const dataVersion = ref(0)

function entry(regionId) {
  if (!backupState[regionId]) backupState[regionId] = { pending: 0, snoozedAt: 0, lastBackupAt: '' }
  return backupState[regionId]
}

// Pequena alteração = 1 (importar ou atualizar um dia). Grande = 3 (lote, exclusão).
export function markChange(regionId, weight = 1) {
  if (!regionId) return
  entry(regionId).pending += weight
}

export function markBackedUp(regionId) {
  const item = entry(regionId)
  item.pending = 0
  item.snoozedAt = 0
  item.lastBackupAt = new Date().toISOString()
}

export function snoozeReminder(regionId) {
  const item = entry(regionId)
  item.snoozedAt = item.pending
}

export function shouldRemind(regionId) {
  const item = backupState[regionId]
  if (!item) return false
  return item.pending - (item.snoozedAt || 0) >= REMINDER_THRESHOLD
}

export function lastBackupLabel(regionId) {
  const iso = backupState[regionId]?.lastBackupAt
  if (!iso) return 'Nenhum backup exportado ainda.'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Último backup: hoje.'
  if (days === 1) return 'Último backup: ontem.'
  return `Último backup: há ${days} dias.`
}

export async function downloadBackup(region) {
  const payload = await exportSessionsAsJson(region.id)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  link.download = `regional-${region.id}-backup-${stamp}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  markBackedUp(region.id)
  return payload.sessions.length
}
