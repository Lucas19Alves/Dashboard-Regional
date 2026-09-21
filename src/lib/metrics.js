export const REGIONAL_NAME = 'Regional SP6'
export const STORE_CODES = ['008', '015', '093', '096', '112', '127', '149', '151', '233', '270', '280', '282', '337']
export const ALLOWED_STORE_CODES = [...STORE_CODES]

export function parseNumeric(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback

  const cleaned = String(value).trim()
  if (!cleaned) return fallback

  const normalized = cleaned
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '')

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function toPercent(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0
  return Number(((value / total) * 100).toFixed(2))
}

export function formatStoreLabel(code, storeName = '', regionalName = REGIONAL_NAME) {
  if (!code && !storeName) return regionalName
  if (String(code).toLowerCase() === 'regional') return regionalName

  const normalizedCode = String(code ?? '').trim()
  const cleanedName = String(storeName ?? '').trim()
  const baseCode = normalizedCode ? String(normalizedCode).padStart(3, '0') : '000'

  if (cleanedName) {
    let normalizedText = cleanedName
      .replace(new RegExp(`^\\s*(?:\\d{3}\\s*[-–—]\\s*){1,2}`, 'i'), '')
      .replace(new RegExp(`\\s*[-–—]\\s*(SP|S[ãa]o Paulo|SP6)\\s*$`, 'i'), '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (!normalizedText) {
      normalizedText = 'Loja'
    }

    const shortName = normalizedText.length > 22 ? `${normalizedText.slice(0, 22).trimEnd()}…` : normalizedText
    return `${baseCode} • ${shortName}`
  }

  return `${baseCode} • Loja`
}

export function normalizeStoreCode(value) {
  if (value === null || value === undefined) return ''
  const match = String(value).match(/\b\d{3}\b/)
  return match ? match[0] : ''
}

export function isCancelledStore(row) {
  if (!row) return false
  const values = [row.isCancelled, row.cancelled, row.status, row.auditStatus]
  return values.some((value) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') return ['cancelada', 'cancelado', 'cancelled', 'canceled', 'inativa', 'inativo'].includes(value.trim().toLowerCase())
    return false
  })
}

export function filterAllowedStoreRows(rows = [], allowedStoreCodes = STORE_CODES) {
  const list = Array.isArray(rows) ? rows : []
  return list.filter((row) => {
    const code = normalizeStoreCode(row?.code ?? row?.storeCode ?? row?.loja ?? '')
    return allowedStoreCodes.includes(code) && !isCancelledStore(row)
  })
}

export const DAY_CONFIG = [
  { key: 'monday', label: 'Segunda', activity: 'Etiqueta' },
  { key: 'tuesday', label: 'Terça', activity: 'Presença' },
  { key: 'wednesday', label: 'Quarta', activity: 'Ruptura' },
  { key: 'thursday', label: 'Quinta', activity: 'Etiqueta' },
]

function toIsoDate(date) {
  const offsetInMinutes = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offsetInMinutes * 60 * 1000)
  return localDate.toISOString().slice(0, 10)
}

export function getCurrentWeekDays(referenceDate = new Date()) {
  const date = new Date(referenceDate)
  const currentDay = date.getDay() || 7
  const monday = new Date(date)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(date.getDate() - (currentDay - 1))

  return DAY_CONFIG.map((day, index) => {
    const value = new Date(monday)
    value.setDate(monday.getDate() + index)
    return {
      ...day,
      date: value,
      iso: toIsoDate(value),
      short: `${value.getDate()}/${value.getMonth() + 1}`,
    }
  })
}

function toneFromIndex(index) {
  const factors = [0.83, 0.77, 0.71, 0.89, 0.82, 0.75, 0.67, 0.84, 0.79, 0.73, 0.78, 0.68, 0.8, 0.74]
  return factors[index % factors.length]
}

export function buildDemoStoreMetrics() {
  return STORE_CODES.map((code, index) => {
    const total = 340 + index * 52 + (index % 3) * 38
    const pendingRate = 0.018 + ((index + 2) % 5) * 0.006
    const pending = Math.round(total * pendingRate)
    const readableTotal = total - pending
    const updatedShare = 0.7 + ((index % 4) * 0.04)
    const updated = Math.round(readableTotal * updatedShare)
    const outdated = readableTotal - updated

    return {
      code,
      totalSku: total,
      pendingItems: pending,
      updatedItems: updated,
      outdatedItems: outdated,
      readPct: Number(((total - pending) / total * 100).toFixed(2)),
      pendingPct: Number((pending / total * 100).toFixed(2)),
      accuracyPct: Number((updated / Math.max(readableTotal, 1) * 100).toFixed(2)),
      status: pendingRate <= 0.03 ? 'meta' : 'alerta',
      score: Number((0.6 + toneFromIndex(index) * 0.4).toFixed(2)),
    }
  })
}

export function normalizeStoreMetrics(row) {
  const totalSku = Math.max(0, parseNumeric(row.totalSku ?? row.C ?? row.total ?? row['SKU Total']))
  const pendingItems = Math.max(0, parseNumeric(row.pendingItems ?? row.D ?? row.pending ?? row['Não lidos']))
  const updatedItems = Math.max(0, parseNumeric(row.updatedItems ?? row.E ?? row.updated ?? row['Lidos atualizados']))
  const outdatedItems = Math.max(0, parseNumeric(row.outdatedItems ?? row.F ?? row.outdated ?? row['Lidos desatualizados']))

  const readItems = updatedItems + outdatedItems
  const readPct = toPercent(readItems, totalSku)
  const pendingPct = toPercent(pendingItems, totalSku)
  const accuracyPct = readItems > 0 ? Number(((updatedItems / readItems) * 100).toFixed(2)) : 0

  return {
    totalSku,
    pendingItems,
    updatedItems,
    outdatedItems,
    readPct,
    pendingPct,
    accuracyPct,
    readItems,
    status: pendingPct <= 3 ? 'meta' : pendingPct <= 7 ? 'atenção' : 'alerta',
  }
}

export function summarizeStores(storeRows, allowedStoreCodes = STORE_CODES) {
  const validRows = filterAllowedStoreRows(storeRows || [], allowedStoreCodes)
  const totals = validRows.reduce(
    (acc, store) => {
      acc.totalSku += Number(store.totalSku || 0)
      acc.pendingItems += Number(store.pendingItems || 0)
      acc.updatedItems += Number(store.updatedItems || 0)
      acc.outdatedItems += Number(store.outdatedItems || 0)
      return acc
    },
    { totalSku: 0, pendingItems: 0, updatedItems: 0, outdatedItems: 0 },
  )

  const readItems = totals.updatedItems + totals.outdatedItems
  const readPct = toPercent(readItems, totals.totalSku)
  const pendingPct = toPercent(totals.pendingItems, totals.totalSku)
  const accuracyPct = readItems > 0 ? Number(((totals.updatedItems / readItems) * 100).toFixed(2)) : 0

  return {
    totalSku: totals.totalSku,
    pendingItems: totals.pendingItems,
    updatedItems: totals.updatedItems,
    outdatedItems: totals.outdatedItems,
    readPct: Number(readPct.toFixed(2)),
    pendingPct: Number(pendingPct.toFixed(2)),
    accuracyPct: Number(accuracyPct.toFixed(2)),
  }
}

export function buildForecast(summary) {
  const currentHour = new Date().getHours()
  const currentProgress = summary.readPct || 0
  const pace = currentProgress > 0 ? currentProgress / Math.max(currentHour - 7, 1) : 0
  const projected = Math.min(100, Number((currentProgress + pace * 2).toFixed(2)))
  const remaining = Math.max(0, 100 - currentProgress)
  const hoursRemaining = pace > 0 ? (remaining / pace).toFixed(1) : '—'

  return {
    pace: Number((pace || 0).toFixed(2)),
    projected,
    remaining,
    hoursRemaining,
    trend: currentProgress >= 85 ? 'fechando bem' : currentProgress >= 70 ? 'em ritmo adequado' : 'ainda em aceleração',
  }
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

export function getStoreStatusLabel(pendingPct) {
  if (pendingPct <= 3) return 'Dentro da meta'
  if (pendingPct <= 7) return 'Atenção'
  return 'Fora da meta'
}
