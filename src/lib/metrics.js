export const REGIONAL_NAME = 'Regional SP6'
export const STORE_CODES = ['008', '009', '015', '093', '096', '112', '127', '149', '151', '233', '270', '280', '282', '350']
export const ALLOWED_STORE_CODES = [...STORE_CODES]

export function formatStoreLabel(code, storeName = '') {
  if (!code && !storeName) return REGIONAL_NAME
  if (String(code).toLowerCase() === 'regional') return REGIONAL_NAME

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

export function filterAllowedStoreRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const code = normalizeStoreCode(row?.code ?? row?.storeCode ?? row?.loja ?? '')
    return STORE_CODES.includes(code)
  })
}

export const DAY_CONFIG = [
  { key: 'monday', label: 'Segunda', activity: 'Etiqueta' },
  { key: 'tuesday', label: 'Terça', activity: 'Presença' },
  { key: 'wednesday', label: 'Quarta', activity: 'Ruptura' },
  { key: 'thursday', label: 'Quinta', activity: 'Etiqueta' },
]

export function getCurrentWeekDays(referenceDate = new Date()) {
  const date = new Date(referenceDate)
  const currentDay = date.getDay()
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay
  const monday = new Date(date)
  monday.setDate(date.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)

  return DAY_CONFIG.map((day, index) => {
    const value = new Date(monday)
    value.setDate(monday.getDate() + index)
    return {
      ...day,
      date: value,
      iso: value.toISOString().slice(0, 10),
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
    const readRate = 0.82 + (index % 7) * 0.015
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
  const normalizeNumber = (value) => {
    if (value === null || value === undefined || value === '') return 0
    const cleaned = String(value).replace(/\./g, '').replace(',', '.')
    const numeric = Number.parseFloat(cleaned)
    return Number.isFinite(numeric) ? numeric : 0
  }

  const totalSku = Math.max(0, normalizeNumber(row.totalSku ?? row.C ?? row.total ?? row['SKU Total']))
  const pendingItems = Math.max(0, normalizeNumber(row.pendingItems ?? row.D ?? row.pending ?? row['Não lidos']))
  const updatedItems = Math.max(0, normalizeNumber(row.updatedItems ?? row.E ?? row.updated ?? row['Lidos atualizados']))
  const outdatedItems = Math.max(0, normalizeNumber(row.outdatedItems ?? row.F ?? row.outdated ?? row['Lidos desatualizados']))

  const readItems = updatedItems + outdatedItems
  const readPct = totalSku > 0 ? Number(((readItems / totalSku) * 100).toFixed(2)) : 0
  const pendingPct = totalSku > 0 ? Number(((pendingItems / totalSku) * 100).toFixed(2)) : 0
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

export function summarizeStores(storeRows) {
  const validRows = filterAllowedStoreRows(storeRows || [])
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
  const readPct = totals.totalSku > 0 ? (readItems / totals.totalSku) * 100 : 0
  const pendingPct = totals.totalSku > 0 ? (totals.pendingItems / totals.totalSku) * 100 : 0
  const accuracyPct = readItems > 0 ? (totals.updatedItems / readItems) * 100 : 0

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
