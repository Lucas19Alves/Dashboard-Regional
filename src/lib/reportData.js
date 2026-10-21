import { formatStoreLabel, isCancelledStore, summarizeStores } from './metrics'

export const META_THRESHOLD = 3
export const AUDIT_TYPES = ['Etiqueta', 'Presença', 'Ruptura']
export const REPORT_TYPES = ['Geral', ...AUDIT_TYPES]
export const STATUS_OPTIONS = [
  { value: 'todas', label: 'Todas' },
  { value: 'aberta', label: 'Abertas' },
  { value: 'fechada', label: 'Fechadas' },
]
export const CHART_PALETTE = ['#2F6FB3', '#7A4FB0', '#0F8B8D', '#C25E9E', '#4E7D2E', '#B5651D', '#5B6CC9', '#8C6D1F', '#2A9DBA', '#A1465B', '#3F8F6B', '#6E5A9E', '#D07A3A']

export function getSessionAuditType(session) {
  if (session?.auditType) return session.auditType
  if (session?.dayKey === 'tuesday') return 'Presença'
  if (session?.dayKey === 'wednesday') return 'Ruptura'
  return 'Etiqueta'
}

function toLocalIso(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Auditoria fechada: arquivo enviado depois do dia da auditoria (dados finais).
// Enviado no próprio dia (ou sem data de envio) = aberta, com dados parciais.
export function getSessionStatus(session) {
  const explicit = String(session?.auditStatus || session?.status || '').toLowerCase()
  if (['fechada', 'aberta'].includes(explicit)) return explicit
  if (!session?.isoDate || !session?.uploadedAt) return 'aberta'
  return toLocalIso(session.uploadedAt) > session.isoDate ? 'fechada' : 'aberta'
}

export function getReportLabels(type) {
  if (type === 'Geral') {
    return { read: 'Leitura geral', pending: 'Pendência', accuracy: 'Acertabilidade (Etiqueta)', chart: 'Pendência por loja e regional', secondary: 'Acertabilidade', moved: 'Lidos' }
  }
  if (type === 'Etiqueta') {
    return { read: 'Leitura regional', pending: 'Pendência', accuracy: 'Acertabilidade', chart: 'Pendência por loja e regional', secondary: 'Acertabilidade', moved: 'Atualizados' }
  }
  return {
    read: 'Presença final',
    pending: 'Ruptura final',
    accuracy: type === 'Ruptura' ? 'Recuperação' : 'Presença inicial',
    chart: 'Ruptura por loja e regional',
    secondary: type === 'Ruptura' ? 'Recuperação' : 'Presença',
    moved: 'Recuperados',
  }
}

export function formatDateBR(iso) {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR')
}

function shortDate(iso) {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'
}

// Mesmo dia no mês anterior (dia 31 vira o último dia do mês anterior).
export function shiftIsoMonth(iso, months = -1) {
  if (!iso) return ''
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return toLocalIso(target)
}

export function shiftIsoDay(iso, days) {
  const [year, month, day] = iso.split('-').map(Number)
  return toLocalIso(new Date(year, month - 1, day + days))
}

// Nome de cada loja a partir de todas as sessões (inclusive canceladas),
// para a loja aparecer identificada mesmo sem auditoria válida no período.
export function buildStoreNameMap(sessions = []) {
  const names = {}
  for (const session of sessions) {
    for (const store of session.stores || []) {
      if (store?.code && store.name && !names[store.code]) names[store.code] = store.name
    }
  }
  return names
}

export function filterSessions(sessions, { type, startDate, endDate, status = 'todas' }) {
  return [...(sessions || [])]
    .filter((session) => {
      if (type && type !== 'Geral' && getSessionAuditType(session) !== type) return false
      if (status !== 'todas' && getSessionStatus(session) !== status) return false
      if (!session.isoDate) return true
      if (startDate && session.isoDate < startDate) return false
      if (endDate && session.isoDate > endDate) return false
      return true
    })
    .sort((a, b) => new Date(a.isoDate || a.uploadedAt) - new Date(b.isoDate || b.uploadedAt))
}

function thirdMetric(type, summary, accuracyOverride) {
  if (type === 'Ruptura') return Number(summary.recoveryPct || 0)
  if (type === 'Presença') return Number(summary.presencePct || 0)
  if (type === 'Geral') return Number(accuracyOverride ?? summary.accuracyPct ?? 0)
  return Number(summary.accuracyPct || 0)
}

export function aggregateStoreRows(sessions, { selectedStores, storeCodes, nameMap = {}, type }) {
  const totals = Object.fromEntries(storeCodes.map((code) => [code, {
    code,
    name: nameMap[code] || '',
    totalSku: 0,
    pendingItems: 0,
    updatedItems: 0,
    outdatedItems: 0,
    presenceItems: 0,
    ruptureItems: 0,
    recoveredItems: 0,
    cancellationCount: 0,
    auditCount: 0,
    labelRows: [],
  }]))

  for (const session of sessions) {
    for (const store of session.stores || []) {
      if (!selectedStores.includes(store.code)) continue
      const target = totals[store.code]
      if (!target) continue
      if (!target.name && store.name) target.name = store.name
      if (isCancelledStore(store)) {
        target.cancellationCount += 1
        continue
      }
      target.auditCount += 1
      target.totalSku += Number(store.totalSku || 0)
      target.pendingItems += Number(store.pendingItems || 0)
      target.updatedItems += Number(store.updatedItems || 0)
      target.outdatedItems += Number(store.outdatedItems || 0)
      target.presenceItems += Number(store.presenceItems || 0)
      target.ruptureItems += Number(store.ruptureItems || 0)
      target.recoveredItems += Number(store.recoveredItems || 0)
      if (getSessionAuditType(session) === 'Etiqueta') target.labelRows.push(store)
    }
  }

  return Object.values(totals)
    .filter((store) => selectedStores.includes(store.code) && (store.totalSku > 0 || store.cancellationCount > 0))
    .map(({ labelRows, ...store }) => {
      const summary = summarizeStores([store], storeCodes)
      const labelAccuracy = labelRows.length ? summarizeStores(labelRows, storeCodes).accuracyPct : null
      return {
        ...store,
        ...summary,
        hasData: store.totalSku > 0,
        thirdPct: thirdMetric(type, summary, labelAccuracy ?? 0),
        movedItems: type === 'Etiqueta' ? store.updatedItems : type === 'Geral' ? store.updatedItems + store.outdatedItems : store.recoveredItems,
      }
    })
}

export function rankStores(rows, sortMode = 'pending') {
  const withData = rows.filter((row) => row.hasData)
  const withoutData = rows.filter((row) => !row.hasData).sort((a, b) => a.code.localeCompare(b.code))
  const sorters = {
    pending: (a, b) => a.pendingPct - b.pendingPct,
    read: (a, b) => b.readPct - a.readPct,
    accuracy: (a, b) => b.thirdPct - a.thirdPct,
    cancellations: (a, b) => b.cancellationCount - a.cancellationCount,
    name: (a, b) => a.code.localeCompare(b.code),
  }
  const sorter = sorters[sortMode] || sorters.pending
  if (sortMode === 'cancellations' || sortMode === 'name') return [...rows].sort(sorter)
  // Lojas sem auditoria válida no período ficam no fim, identificadas.
  return [...withData.sort(sorter), ...withoutData]
}

function summarizeSessions(sessions, { type, selectedStores, storeCodes }) {
  const rows = sessions.flatMap((session) => (session.stores || []).filter((store) => selectedStores.includes(store.code)))
  const summary = summarizeStores(rows, storeCodes)
  const labelRows = type === 'Geral'
    ? sessions.filter((session) => getSessionAuditType(session) === 'Etiqueta').flatMap((session) => (session.stores || []).filter((store) => selectedStores.includes(store.code)))
    : null
  const labelAccuracy = labelRows ? summarizeStores(labelRows, storeCodes).accuracyPct : null
  const cancellations = rows.filter((store) => isCancelledStore(store)).length
  return {
    ...summary,
    thirdPct: thirdMetric(type, summary, labelAccuracy),
    auditCount: sessions.length,
    cancellations,
  }
}

export function buildReport({ sessions = [], type = 'Etiqueta', startDate = '', endDate = '', status = 'todas', selectedStores = [], storeCodes = [], regionName = '', sortMode = 'pending' }) {
  const labels = getReportLabels(type)
  const nameMap = buildStoreNameMap(sessions)
  const filtered = filterSessions(sessions, { type, startDate, endDate, status })
  const storeRows = aggregateStoreRows(filtered, { selectedStores, storeCodes, nameMap, type })
  const totals = summarizeSessions(filtered, { type, selectedStores, storeCodes })

  // Comparativo: mesmo intervalo no mês anterior, com os mesmos filtros.
  const datedValues = (sessions || []).map((session) => session.isoDate).filter(Boolean).sort()
  const baseStart = startDate || datedValues[0] || ''
  const baseEnd = endDate || datedValues[datedValues.length - 1] || ''
  const previousStart = shiftIsoMonth(baseStart)
  // Sem sobreposição com o período atual quando ele passa de um mês.
  const dayBeforeStart = baseStart ? shiftIsoDay(baseStart, -1) : ''
  const shiftedEnd = shiftIsoMonth(baseEnd)
  const previousEnd = shiftedEnd && dayBeforeStart && shiftedEnd > dayBeforeStart ? dayBeforeStart : shiftedEnd
  const previousSessions = previousStart && previousEnd ? filterSessions(sessions, { type, startDate: previousStart, endDate: previousEnd, status }) : []
  const previous = summarizeSessions(previousSessions, { type, selectedStores, storeCodes })

  const metrics = [
    { key: 'auditCount', label: 'Auditorias', format: 'int', current: totals.auditCount, previous: previous.auditCount, better: 'neutral' },
    { key: 'readPct', label: labels.read, format: 'pct', current: totals.readPct, previous: previous.readPct, better: 'up' },
    { key: 'pendingPct', label: labels.pending, format: 'pct', current: totals.pendingPct, previous: previous.pendingPct, better: 'down' },
    { key: 'thirdPct', label: labels.accuracy, format: 'pct', current: totals.thirdPct, previous: previous.thirdPct, better: 'up' },
    { key: 'cancellations', label: 'Cancelamentos', format: 'int', current: totals.cancellations, previous: previous.cancellations, better: 'down' },
  ].map((metric) => ({ ...metric, delta: Number((metric.current - metric.previous).toFixed(2)), hasPrevious: previousSessions.length > 0 }))

  const trendDates = filtered.filter((session) => session.isoDate).map((session) => ({ isoDate: session.isoDate, label: shortDate(session.isoDate), type: getSessionAuditType(session), status: getSessionStatus(session) }))
  const datedSessions = filtered.filter((session) => session.isoDate)
  const regionalTrend = datedSessions.map((session) => {
    const active = (session.stores || []).filter((store) => selectedStores.includes(store.code) && !isCancelledStore(store))
    if (!active.length) return null
    const summary = summarizeStores(active, storeCodes)
    return { readPct: summary.readPct, pendingPct: summary.pendingPct }
  })
  const storeTrend = selectedStores.filter((code) => storeCodes.includes(code)).map((code, index) => ({
    code,
    name: nameMap[code] || '',
    color: CHART_PALETTE[storeCodes.indexOf(code) % CHART_PALETTE.length] || CHART_PALETTE[index % CHART_PALETTE.length],
    points: datedSessions.map((session) => {
      const match = (session.stores || []).find((store) => store.code === code && !isCancelledStore(store))
      if (!match) return null
      const summary = summarizeStores([match], storeCodes)
      return { readPct: summary.readPct, pendingPct: summary.pendingPct }
    }),
  }))

  return {
    type,
    labels,
    sessions: filtered,
    storeRows,
    chartRows: storeRows.filter((row) => row.hasData).map((row) => ({ ...row, displayName: formatStoreLabel(row.code, row.name, regionName) })),
    totals,
    ranking: rankStores(storeRows, sortMode).map((row) => ({ ...row, displayName: formatStoreLabel(row.code, row.name, regionName) })),
    previous: {
      startDate: previousStart,
      endDate: previousEnd,
      auditCount: previousSessions.length,
      rangeLabel: previousStart ? `${formatDateBR(previousStart)} a ${formatDateBR(previousEnd)}, ${previousSessions.length} auditoria${previousSessions.length === 1 ? '' : 's'}` : 'Sem período definido',
      metrics,
    },
    trend: { dates: trendDates, regional: regionalTrend, stores: storeTrend },
    statusCounts: {
      aberta: filtered.filter((session) => getSessionStatus(session) === 'aberta').length,
      fechada: filtered.filter((session) => getSessionStatus(session) === 'fechada').length,
    },
  }
}
