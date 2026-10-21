import { DAY_CONFIG, buildForecast, filterAllowedStoreRows, isCancelledStore, normalizeStoreMetrics, parseNumeric, summarizeStores, toIsoDate } from './metrics'

// Leitura das planilhas de consolidado. O xlsx só é baixado quando alguém importa um arquivo.
let xlsxModule = null
async function loadXlsx() {
  if (!xlsxModule) xlsxModule = await import('xlsx')
  return xlsxModule
}

export const EXPECTED_COLUMNS = {
  Etiqueta: 'Árvore, Itens com Estoque, Não Lidas com Estoque, Atualizadas com Estoque e Desatualizadas',
  Presença: 'Árvore, Auditado em, Itens com Estoque e Ruptura 1ª (colunas C e D)',
  Ruptura: 'Árvore, Auditado em, Itens com Estoque, Ruptura 1ª e Ruptura Final (colunas C, D e E)',
}

const normalizeHeader = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const findHeaderIndex = (headerRow, matchers) => {
  for (const matcher of matchers) {
    const index = headerRow.findIndex((name) => matcher(name))
    if (index >= 0) return index
  }
  return -1
}

export async function readSpreadsheet(file) {
  const XLSX = await loadXlsx()
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return {
    matrix: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }),
    rawMatrix: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }),
  }
}

// Linhas das lojas permitidas, no formato do tipo de auditoria.
export function parseRows(matrix, auditType, storeCodes) {
  if (!matrix?.length) return []

  const headerRow = matrix[0].map((value) => normalizeHeader(value))
  const columnMap = {
    tree: findHeaderIndex(headerRow, [(name) => name.includes('arvore') || name.includes('tree')]),
    audit: findHeaderIndex(headerRow, [(name) => name.includes('auditado') || name.includes('audit')]),
    total: findHeaderIndex(headerRow, [
      (name) => name.includes('itenscomestoque') || (name.includes('itens') && name.includes('estoque')),
      (name) => name.includes('itens com estoque'),
    ]),
    pending: findHeaderIndex(headerRow, [
      (name) => name.includes('naolidascomestoque') || (name.includes('nao') && name.includes('lidas') && name.includes('estoque')),
      (name) => name.includes('nao lidas com estoque') || name.includes('nao lidas'),
    ]),
    updated: findHeaderIndex(headerRow, [
      (name) => name.includes('atualizadascomestoque') || (name.includes('atualizadas') && name.includes('estoque')),
      (name) => name.includes('atualizadas com estoque') || name.includes('atualizadas'),
    ]),
    outdated: findHeaderIndex(headerRow, [
      (name) => name.includes('desatualizadascomestoque') || name.includes('desatualizadas'),
      (name) => name.includes('desatualizadas com estoque'),
    ]),
  }

  const rows = matrix
    .slice(1)
    .map((row) => {
      if (!Array.isArray(row) || row.length < 5) return null

      const treeCell = row[columnMap.tree] ?? ''
      const nameCell = row[columnMap.audit] ?? row[1] ?? ''
      const totalSku = parseNumeric(row[columnMap.total] ?? row[2])
      const pendingItems = parseNumeric(row[columnMap.pending] ?? row[3])
      const updatedItems = parseNumeric(row[columnMap.updated] ?? row[4])
      const outdatedItems = parseNumeric(row[columnMap.outdated] ?? row[5])
      const presenceItems = parseNumeric(row[3])
      const ruptureItems = parseNumeric(row[4])

      const codeFromTree = String(treeCell).match(/\b\d{3}\b/)
      const codeFromName = String(nameCell).match(/\b\d{3}\b/)
      const rawCode = codeFromTree ? codeFromTree[0] : codeFromName?.[0] ?? ''
      const code = /^\d{3}$/.test(rawCode) ? rawCode : ''
      const label = String(nameCell).trim()
      const isAggregate = /regional|regiao|macro|sub-regiao|macro regional|regiao de venda/i.test(label)

      if (!storeCodes.includes(code) || isAggregate) return null

      if (auditType !== 'Etiqueta') {
        return {
          code,
          name: label || undefined,
          totalSku,
          presenceItems,
          ruptureItems: auditType === 'Presença' ? presenceItems : ruptureItems,
        }
      }

      return { code, name: label || undefined, totalSku, pendingItems, updatedItems, outdatedItems }
    })
    .filter(Boolean)
    .filter((row) => row.totalSku > 0 || row.pendingItems > 0 || row.updatedItems > 0 || row.outdatedItems > 0 || row.presenceItems > 0 || row.ruptureItems > 0)

  return filterAllowedStoreRows(rows, storeCodes)
}

export function buildStores(rows, auditType) {
  return rows.map((row) => {
    if (auditType !== 'Etiqueta') {
      const totalSku = Math.max(Number(row.totalSku || 0), 0)
      const presenceItems = Math.min(Math.max(Number(row.presenceItems || 0), 0), totalSku)
      const ruptureItems = Math.min(Math.max(Number(row.ruptureItems || 0), 0), totalSku)
      const recoveredItems = Math.max(presenceItems - ruptureItems, 0)
      const presentItems = Math.max(totalSku - ruptureItems, 0)
      const presencePct = totalSku > 0 ? Number((((totalSku - presenceItems) / totalSku) * 100).toFixed(2)) : 0
      const rupturePct = totalSku > 0 ? Number(((ruptureItems / totalSku) * 100).toFixed(2)) : 0
      const recoveryPct = presenceItems > 0 ? Number(((recoveredItems / presenceItems) * 100).toFixed(2)) : 0

      return {
        code: row.code,
        name: row.name,
        totalSku,
        pendingItems: ruptureItems,
        updatedItems: presentItems,
        outdatedItems: 0,
        readPct: Number((100 - rupturePct).toFixed(2)),
        pendingPct: rupturePct,
        accuracyPct: auditType === 'Ruptura' ? recoveryPct : presencePct,
        presenceItems,
        ruptureItems,
        recoveredItems,
        presencePct,
        rupturePct,
        recoveryPct,
      }
    }

    const metrics = normalizeStoreMetrics(row)
    return {
      code: row.code,
      name: row.name,
      totalSku: Number(metrics.totalSku || 0),
      pendingItems: Number(metrics.pendingItems || 0),
      updatedItems: Number(metrics.updatedItems || 0),
      outdatedItems: Number(metrics.outdatedItems || 0),
      readPct: Number(metrics.readPct || 0),
      pendingPct: Number(metrics.pendingPct || 0),
      accuracyPct: Number(metrics.accuracyPct || 0),
    }
  })
}

// Dia de auditoria (segunda a quinta) de uma data, com o tipo previsto no calendário.
export function getAuditDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null
  const date = new Date(`${iso}T00:00:00`)
  const weekday = date.getDay()
  if (weekday < 1 || weekday > DAY_CONFIG.length) return null
  const monday = new Date(date)
  monday.setDate(date.getDate() - (weekday - 1))
  return { ...DAY_CONFIG[weekday - 1], iso, weekStart: toIsoDate(monday) }
}

export function buildSessionPayload({ region, storeCodes, day, rows, fileName, previousSession = null }) {
  const auditType = day.activity || 'Etiqueta'
  const cancelled = new Set((previousSession?.stores || []).filter((store) => isCancelledStore(store)).map((store) => store.code))
  const stores = buildStores(rows, auditType).map((store) => (
    cancelled.has(store.code) ? { ...store, cancelled: true, isCancelled: true, status: 'cancelada' } : store
  ))
  const summary = summarizeStores(stores, storeCodes)

  return {
    id: `${region.id}-${day.iso}-${day.key}`,
    regionId: region.id,
    region: region.name,
    weekStart: day.weekStart,
    dayKey: day.key,
    dayLabel: day.label,
    auditType,
    isoDate: day.iso,
    uploadedAt: new Date().toISOString(),
    sourceFile: fileName,
    stores,
    summary,
    forecast: buildForecast(summary),
  }
}

// ---------- Data da planilha (para importação em lote) ----------
function validIso(year, month, day) {
  const y = Number(year < 100 ? 2000 + Number(year) : year)
  const date = new Date(y, Number(month) - 1, Number(day))
  if (date.getFullYear() !== y || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return ''
  return toIsoDate(date)
}

function isoFromText(text) {
  const value = String(text || '')
  let match = value.match(/(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})/)
  if (match) return validIso(match[1], match[2], match[3])
  match = value.match(/(\d{1,2})[/\-_.](\d{1,2})[/\-_.](\d{2,4})/)
  if (match) return validIso(match[3], match[2], match[1])
  return ''
}

export function detectDateFromFileName(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '')
  const direct = isoFromText(base)
  if (direct) return direct
  const compact = base.match(/(?:^|\D)(\d{2})(\d{2})(\d{4})(?:\D|$)/)
  if (compact) return validIso(compact[3], compact[2], compact[1])
  const short = base.match(/(?:^|\D)(\d{1,2})[-_.](\d{1,2})(?:\D|$)/)
  if (short) return validIso(new Date().getFullYear(), short[2], short[1])
  return ''
}

// Data mais frequente nas células da planilha (ex.: coluna "Auditado em").
export function detectDateFromContent(rawMatrix) {
  const counts = {}
  for (const row of (rawMatrix || []).slice(0, 200)) {
    for (const cell of row || []) {
      let iso = ''
      if (cell instanceof Date && !Number.isNaN(cell.getTime())) iso = toIsoDate(cell)
      else if (typeof cell === 'string' && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cell)) iso = isoFromText(cell)
      if (iso) counts[iso] = (counts[iso] || 0) + 1
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}
