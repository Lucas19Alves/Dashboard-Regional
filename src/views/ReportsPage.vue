<script setup>
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import { formatLimit, getAttention, getMetaTone, settings } from '../lib/settings'
import { notify } from '../composables/feedback'
import { computed, nextTick, onMounted, ref } from 'vue'
import { toPng } from 'html-to-image'
import { listSessions } from '../lib/database'
import { summarizeStores, formatStoreLabel, isCancelledStore } from '../lib/metrics'
import { exportCardAsPng } from '../lib/exportImage'
import { REPORT_TYPES, STATUS_OPTIONS, buildReport, formatDateBR } from '../lib/reportData'
import ReportSnapshot from '../components/ReportSnapshot.vue'
import { useRoute } from 'vue-router'
import { getRegion } from '../lib/regions'
import StoreTowerChart from '../components/StoreTowerChart.vue'

const route = useRoute()
const region = computed(() => getRegion(route.params.region))
const storeCodes = computed(() => region.value.storeCodes)

const sessions = ref([])
const startDate = ref('')
const endDate = ref('')
const selectedStores = ref([])
const sortMode = ref('pending')
const selectedAuditType = ref('Geral')
const selectedStatus = ref('todas')
const auditTypes = REPORT_TYPES
const metaThreshold = computed(() => settings.meta)
const attentionLimit = computed(() => getAttention())
const isExportingExcel = ref(false)
const quickRanges = [7, 15, 30, 60]

function toIsoDateLocal(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const allDateValues = computed(() => {
  const values = (sessions.value || [])
    .map((session) => session.isoDate)
    .filter(Boolean)
    .sort()
  return values
})

function reportFor(type) {
  return buildReport({
    sessions: sessions.value,
    type,
    startDate: startDate.value,
    endDate: endDate.value,
    status: selectedStatus.value,
    selectedStores: selectedStores.value,
    storeCodes: storeCodes.value,
    regionName: region.value.name,
    sortMode: sortMode.value,
  })
}

const report = computed(() => reportFor(selectedAuditType.value))
const reportLabels = computed(() => report.value.labels)
const filteredSessions = computed(() => report.value.sessions)
const chartStoreRows = computed(() => report.value.chartRows)
const regionalSummary = computed(() => report.value.totals)
const rankedStores = computed(() => report.value.ranking)
const comparison = computed(() => report.value.previous)

const chartPalette = ['#2F6FB3', '#7A4FB0', '#0F8B8D', '#C25E9E', '#4E7D2E', '#B5651D', '#5B6CC9', '#8C6D1F', '#2A9DBA', '#A1465B', '#3F8F6B', '#6E5A9E', '#D07A3A']

const trendDates = computed(() => {
  return filteredSessions.value.map((session) => ({
    isoDate: session.isoDate,
    label: session.isoDate ? new Date(`${session.isoDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—',
  }))
})

const regionalTrendSeries = computed(() => {
  return filteredSessions.value.map((session) => {
    const selected = (session.stores || []).filter((store) => selectedStores.value.includes(store.code) && !isCancelledStore(store))
    const summary = summarizeStores(selected, storeCodes.value)
    return {
      isoDate: session.isoDate,
      label: session.isoDate ? new Date(`${session.isoDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—',
      value: Number(summary.readPct || 0),
      pendingPct: Number(summary.pendingPct || 0),
      accuracyPct: Number(summary.accuracyPct || 0),
      totalSku: Number(summary.totalSku || 0),
      pendingItems: Number(summary.pendingItems || 0),
    }
  }).filter((item) => item.isoDate)
})

const storeTrendSeries = computed(() => {
  const codes = selectedStores.value.length ? selectedStores.value : storeCodes.value
  return codes.map((code, index) => {
    const matchStore = (filteredSessions.value || [])
      .flatMap((session) => session.stores || [])
      .find((store) => store.code === code && !isCancelledStore(store))

    return {
      code,
      name: matchStore?.name || '',
      color: chartPalette[index % chartPalette.length],
      points: filteredSessions.value.map((session) => {
        const match = (session.stores || []).find((store) => store.code === code && !isCancelledStore(store))
        const summary = match ? summarizeStores([match], storeCodes.value) : { readPct: 0, pendingPct: 0, accuracyPct: 0, totalSku: 0, pendingItems: 0 }
        return {
          isoDate: session.isoDate,
          label: session.isoDate ? new Date(`${session.isoDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—',
          value: Number(summary.readPct || 0),
          pendingPct: Number(summary.pendingPct || 0),
          accuracyPct: Number(summary.accuracyPct || 0),
          totalSku: Number(summary.totalSku || 0),
          pendingItems: Number(summary.pendingItems || 0),
        }
      }).filter((item) => item.isoDate),
    }
  }).filter((series) => series.points.some((point) => point.totalSku > 0))
})

const chartSeries = computed(() => [{
  code: 'Regional',
  color: 'rgb(var(--c-ink))',
  isRegional: true,
  points: regionalTrendSeries.value,
}, ...storeTrendSeries.value.map((series) => ({ ...series, isRegional: false }))])

const chartWidth = 640
const chartHeight = 230
const chartPadding = 36
const chartPlotWidth = chartWidth - chartPadding * 2
const chartPlotHeight = chartHeight - chartPadding * 2

const maxTrendValue = computed(() => {
  const values = chartSeries.value.flatMap((series) => series.points.map((point) => point.value))
  return Math.max(100, ...values)
})

const chartPoints = computed(() => {
  if (!trendDates.value.length) return []

  const slot = trendDates.value.length > 1 ? chartPlotWidth / (trendDates.value.length - 1) : 0

  return chartSeries.value.map((series) => ({
    ...series,
    points: series.points.map((point, index) => {
      const x = chartPadding + index * slot
      const y = chartHeight - chartPadding - ((point.value / maxTrendValue.value) * chartPlotHeight)
      return { ...point, x, y }
    }),
  }))
})

function getLinePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function getAreaPath(points) {
  if (!points.length) return ''
  return `${getLinePath(points)} L ${points[points.length - 1].x} ${chartHeight - chartPadding} L ${points[0].x} ${chartHeight - chartPadding} Z`
}

const hoveredTrendIndex = ref(null)
const currentHoverDate = computed(() => {
  if (hoveredTrendIndex.value === null) return null
  return trendDates.value[hoveredTrendIndex.value] || null
})

const hoverRows = computed(() => {
  if (hoveredTrendIndex.value === null) return []

  return chartSeries.value
    .map((series) => ({
      code: series.code,
    displayName: formatStoreLabel(series.code, series.name, region.value.name),
    color: series.color,
    value: series.points[hoveredTrendIndex.value]?.value ?? null,
    pendingPct: series.points[hoveredTrendIndex.value]?.pendingPct ?? 0,
    accuracyPct: series.points[hoveredTrendIndex.value]?.accuracyPct ?? 0,
    isRegional: series.isRegional,
  }))
    .filter((row) => row.value !== null)
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
})

function handleChartMove(event) {
  if (!trendDates.value.length) return

  const bounds = event.currentTarget.getBoundingClientRect()
  const relativeX = ((event.clientX - bounds.left) / bounds.width) * chartWidth
  const span = Math.max(1, trendDates.value.length - 1)
  const index = Math.min(trendDates.value.length - 1, Math.max(0, Math.round((relativeX - chartPadding) / (chartPlotWidth / span))))
  hoveredTrendIndex.value = index
}

function clearTrendHover() {
  hoveredTrendIndex.value = null
}

const trendChartCard = ref(null)

async function exportTrendChart() {
  if (!trendChartCard.value) return
  await exportCardAsPng(trendChartCard.value, 'leitura-ao-longo-do-periodo', { scale: 2.5, bottomPadding: 24 })
}

const insights = computed(() => {
  if (!regionalTrendSeries.value.length) {
    return [{ title: 'Sem dados', tone: 'neutral', body: 'Ainda não há evidências suficientes para análise no período selecionado.' }]
  }

  const first = regionalTrendSeries.value[0]
  const last = regionalTrendSeries.value[regionalTrendSeries.value.length - 1]
  const delta = Number((last.value - first.value).toFixed(2))

  const bestStore = [...storeTrendSeries.value].sort((a, b) => {
    const lastA = a.points[a.points.length - 1]?.value || 0
    const lastB = b.points[b.points.length - 1]?.value || 0
    return lastB - lastA
  })[0]

  const biggestRise = [...storeTrendSeries.value].sort((a, b) => {
    const finalA = a.points[a.points.length - 1]?.value || 0
    const initialA = a.points[0]?.value || 0
    const finalB = b.points[b.points.length - 1]?.value || 0
    const initialB = b.points[0]?.value || 0
    return (finalB - initialB) - (finalA - initialA)
  })[0]

  const withinMetaStores = storeTrendSeries.value.filter((store) => (store.points[store.points.length - 1]?.pendingPct ?? 0) <= metaThreshold.value).length
  const riskStores = storeTrendSeries.value.filter((store) => (store.points[store.points.length - 1]?.pendingPct ?? 0) > metaThreshold.value).length
  const recoveryRate = storeTrendSeries.value.length ? (withinMetaStores / storeTrendSeries.value.length) * 100 : 0

  return [
    {
      title: 'Regional',
      tone: delta >= 0 ? 'positive' : 'negative',
      body: delta >= 0
        ? `${formatStoreLabel('Regional', '', region.value.name)} avançou ${delta.toFixed(2)} p.p. no período, mostrando aceleração consistente na leitura.`
        : `${formatStoreLabel('Regional', '', region.value.name)} recuou ${Math.abs(delta).toFixed(2)} p.p. e precisa reforço operacional para recuperar ritmo.`,
    },
    {
      title: 'Maior desempenho',
      tone: 'positive',
      body: bestStore
        ? `${formatStoreLabel(bestStore.code, bestStore.name, region.value.name)} lidera o comparativo com ${(bestStore.points[bestStore.points.length - 1]?.value ?? 0).toFixed(2)}% de leitura e ${(bestStore.points[bestStore.points.length - 1]?.pendingPct ?? 0).toFixed(2)}% de pendência.`
        : 'Ainda não há loja com volume suficiente para comparar.',
    },
    {
      title: 'Recuperação',
      tone: biggestRise ? 'positive' : 'neutral',
      body: biggestRise
        ? `${formatStoreLabel(biggestRise.code, biggestRise.name, region.value.name)} foi a loja com melhor recuperação, ganhando ${(((biggestRise.points[biggestRise.points.length - 1]?.value ?? 0) - (biggestRise.points[0]?.value ?? 0))).toFixed(2)} p.p. no período.`
        : 'Não há recuperação relevante entre as lojas selecionadas.',
    },
    {
      title: 'Cobertura da meta',
      tone: recoveryRate >= 60 ? 'positive' : 'warning',
      body: `${withinMetaStores} de ${storeTrendSeries.value.length || 0} lojas estão dentro da meta de ${formatLimit(metaThreshold.value)}%. ${riskStores} ${riskStores === 1 ? 'loja ainda exige' : 'lojas ainda exigem'} atenção.`,
    },
  ]
})

const auditCount = computed(() => regionalSummary.value.auditCount)
const headerChips = computed(() => [
  { label: 'Período', value: startDate.value || endDate.value ? `${formatDateBR(startDate.value)} a ${formatDateBR(endDate.value)}` : 'Todo o histórico' },
  { label: 'Status', value: STATUS_OPTIONS.find((option) => option.value === selectedStatus.value)?.label || 'Todas' },
  { label: 'Lojas', value: selectedStores.value.length === storeCodes.value.length ? `Todas (${storeCodes.value.length})` : `${selectedStores.value.length} de ${storeCodes.value.length}` },
  { label: 'Auditorias', value: `${report.value.sessions.length} (${report.value.statusCounts.fechada} fechadas, ${report.value.statusCounts.aberta} abertas)` },
])
const cancellationCount = computed(() => regionalSummary.value.cancellations)
const selectedStoresLabel = computed(() => selectedStores.value.length === storeCodes.value.length ? 'Todas' : selectedStores.value.join(', '))

function formatMetric(value, format) {
  return format === 'pct' ? `${Number(value || 0).toFixed(2)}%` : Number(value || 0).toLocaleString('pt-BR')
}

function deltaClass(metric) {
  if (!metric.hasPrevious || metric.delta === 0 || metric.better === 'neutral') return 'text-steel'
  const improved = metric.better === 'up' ? metric.delta > 0 : metric.delta < 0
  return improved ? 'text-good' : 'text-bad'
}

function formatDelta(metric) {
  if (!metric.hasPrevious) return '—'
  const sign = metric.delta > 0 ? '+' : ''
  return metric.format === 'pct' ? `${sign}${metric.delta.toFixed(2)} p.p.` : `${sign}${metric.delta.toLocaleString('pt-BR')}`
}

// ---------- Mini gráfico de evolução por loja (pendência/ruptura em cada auditoria do período) ----------
const SPARK_W = 96
const SPARK_H = 26

const sparklines = computed(() => {
  const result = {}
  const stores = report.value.trend?.stores || []
  const allValues = stores.flatMap((series) => series.points.filter(Boolean).map((point) => point.pendingPct))
  const top = Math.max(metaThreshold.value * 2, ...allValues, 1)
  const yOf = (value) => SPARK_H - 2 - (Math.min(value, top) / top) * (SPARK_H - 4)
  for (const series of stores) {
    const values = series.points.filter(Boolean).map((point) => point.pendingPct)
    if (values.length < 2) continue
    const step = SPARK_W / (values.length - 1)
    const coords = values.map((value, index) => ({ x: Number((index * step).toFixed(1)), y: Number(yOf(value).toFixed(1)) }))
    const lastValue = values[values.length - 1]
    result[series.code] = {
      points: coords.map((point) => `${point.x},${point.y}`).join(' '),
      last: coords[coords.length - 1],
      metaY: Number(yOf(metaThreshold.value).toFixed(1)),
      tone: getMetaTone(lastValue),
      label: `${reportLabels.value.pending} em ${values.length} auditorias: de ${values[0].toFixed(2)}% para ${lastValue.toFixed(2)}%`,
    }
  }
  return result
})

// ---------- Excel do ranking ----------
async function exportRankingExcel() {
  if (!rankedStores.value.length || isExportingExcel.value) return
  isExportingExcel.value = true
  try {
    const XLSX = await import('xlsx')
    const labels = reportLabels.value
    const rows = rankedStores.value.map((row, index) => ({
      Posição: row.hasData ? index + 1 : '',
      Loja: row.code,
      Nome: row.name || '',
      SKU: row.hasData ? row.totalSku : '',
      [labels.read]: row.hasData ? Number(row.readPct.toFixed(2)) : '',
      [labels.pending]: row.hasData ? Number(row.pendingPct.toFixed(2)) : '',
      [labels.accuracy]: row.hasData ? Number(row.thirdPct.toFixed(2)) : '',
      [labels.moved]: row.hasData ? row.movedItems : '',
      Cancelamentos: row.cancellationCount,
      Situação: row.hasData ? { green: 'Na meta', orange: 'Atenção', red: 'Fora da meta' }[getMetaTone(row.pendingPct)] : 'Sem auditoria válida',
    }))
    rows.push({
      Posição: '',
      Loja: 'Regional',
      Nome: region.value.name,
      SKU: regionalSummary.value.totalSku,
      [labels.read]: Number(regionalSummary.value.readPct.toFixed(2)),
      [labels.pending]: Number(regionalSummary.value.pendingPct.toFixed(2)),
      [labels.accuracy]: Number(regionalSummary.value.thirdPct.toFixed(2)),
      [labels.moved]: '',
      Cancelamentos: cancellationCount.value,
      Situação: { green: 'Na meta', orange: 'Atenção', red: 'Fora da meta' }[getMetaTone(regionalSummary.value.pendingPct)],
    })
    const sheet = XLSX.utils.json_to_sheet(rows)
    sheet['!cols'] = [{ wch: 8 }, { wch: 7 }, { wch: 34 }, { wch: 9 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 13 }, { wch: 14 }, { wch: 20 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, selectedAuditType.value.slice(0, 31))
    const period = startDate.value || endDate.value ? `${startDate.value || 'inicio'}-a-${endDate.value || 'fim'}` : 'historico'
    XLSX.writeFile(workbook, `ranking-${slug(region.value.code)}-${slug(selectedAuditType.value)}-${period}.xlsx`)
    notify('Planilha do ranking baixada.')
  } catch (error) {
    console.error(error)
    notify('Não foi possível gerar a planilha. Tente de novo.', 'error')
  } finally {
    isExportingExcel.value = false
  }
}

// ---------- Imagens em alta resolução (1920×1080, exportadas em 2x = 3840×2160) ----------
const snapshotType = ref(null)
const snapshotRef = ref(null)
const exportingType = ref(null)
const snapshotReport = computed(() => (snapshotType.value ? reportFor(snapshotType.value) : null))
const statusLabel = computed(() => STATUS_OPTIONS.find((option) => option.value === selectedStatus.value)?.label || 'Todas')
const sortLabel = computed(() => ({ pending: reportLabels.value.pending, read: reportLabels.value.read, accuracy: reportLabels.value.accuracy, cancellations: 'Cancelamentos', name: 'Loja' })[sortMode.value])
const generatedAt = ref('')
const snapshotFilters = computed(() => [
  { label: 'Período', value: startDate.value || endDate.value ? `${formatDateBR(startDate.value)} a ${formatDateBR(endDate.value)}` : 'Todo o histórico' },
  { label: 'Tipo', value: snapshotType.value || selectedAuditType.value },
  { label: 'Status', value: statusLabel.value },
  { label: 'Lojas', value: selectedStores.value.length === storeCodes.value.length ? `Todas (${storeCodes.value.length})` : `${selectedStores.value.length} de ${storeCodes.value.length}` },
  { label: 'Auditorias', value: `${snapshotReport.value?.sessions.length ?? 0} (${snapshotReport.value?.statusCounts.fechada ?? 0} fechadas, ${snapshotReport.value?.statusCounts.aberta ?? 0} abertas)` },
])

function slug(value) {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function exportSnapshot(type) {
  exportingType.value = type
  generatedAt.value = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  snapshotType.value = type
  try {
    await nextTick()
    if (document.fonts?.ready) await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const node = snapshotRef.value?.$el
    if (!node) return
    let url = ''
    // Navegadores com limite de canvas menor caem para escalas menores.
    for (const pixelRatio of [2, 1.5, 1]) {
      try {
        url = await toPng(node, { pixelRatio, width: 1920, height: 1080, backgroundColor: '#ECEEF1', cacheBust: true })
      } catch {
        url = ''
      }
      if (url.length > 100) break
    }
    if (!url) return
    const period = startDate.value || endDate.value ? `${startDate.value || 'inicio'}-a-${endDate.value || 'fim'}` : 'historico'
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio-${slug(region.value.code)}-${slug(type)}-${period}.png`
    link.click()
  } finally {
    snapshotType.value = null
    exportingType.value = null
  }
}

async function exportAllSnapshots() {
  for (const type of auditTypes) {
    await exportSnapshot(type)
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

function applyQuickPeriod(days) {
  if (!allDateValues.value.length) {
    startDate.value = ''
    endDate.value = ''
    return
  }

  const latest = new Date(`${allDateValues.value[allDateValues.value.length - 1]}T00:00:00`)
  const earliest = new Date(latest)
  earliest.setDate(latest.getDate() - (days - 1))

  startDate.value = toIsoDateLocal(earliest)
  endDate.value = toIsoDateLocal(latest)
}

function selectAllStores() {
  selectedStores.value = [...storeCodes.value]
}

function clearStoreSelection() {
  selectedStores.value = []
}

function toggleStore(code) {
  if (selectedStores.value.includes(code)) {
    selectedStores.value = selectedStores.value.filter((item) => item !== code)
    return
  }
  selectedStores.value = [...selectedStores.value, code]
}

function resetPeriod() {
  if (allDateValues.value.length) {
    startDate.value = allDateValues.value[0]
    endDate.value = allDateValues.value[allDateValues.value.length - 1]
    return
  }
  startDate.value = ''
  endDate.value = ''
}

async function loadSessions() {
  const all = await listSessions(region.value.id)
  sessions.value = [...all].sort((a, b) => new Date(a.isoDate || a.uploadedAt) - new Date(b.isoDate || b.uploadedAt))

  if (allDateValues.value.length) {
    startDate.value = allDateValues.value[0]
    endDate.value = allDateValues.value[allDateValues.value.length - 1]
  }
}

onMounted(async () => {
  selectedStores.value = [...storeCodes.value]
  await loadSessions()
})
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      :eyebrow="`${region.name}, relatórios`"
      :title="selectedAuditType === 'Geral' ? 'Visão geral' : `Auditoria de ${selectedAuditType}`"
      :chips="headerChips"
    />

    <div class="ui-card p-5">
      <div class="mb-5 flex flex-wrap gap-6">
       <div>
        <p class="ui-eyebrow">Tipo de auditoria</p>
        <div class="mt-2 ui-seg">
          <button
            v-for="type in auditTypes"
            :key="type"
            type="button"
            class="ui-seg-item"
            :class="{ 'ui-seg-item-active': selectedAuditType === type }"
            @click="selectedAuditType = type"
          >
            {{ type }}
          </button>
        </div>
       </div>
       <div>
        <p class="ui-eyebrow">Situação</p>
        <div class="mt-2 ui-seg">
          <button
            v-for="option in STATUS_OPTIONS"
            :key="option.value"
            type="button"
            class="ui-seg-item"
            :class="{ 'ui-seg-item-active': selectedStatus === option.value }"
            :title="option.value === 'aberta' ? 'Arquivo enviado no próprio dia (parcial)' : option.value === 'fechada' ? 'Arquivo enviado após o dia da auditoria (final)' : ''"
            @click="selectedStatus = option.value"
          >
            {{ option.label }}
          </button>
        </div>
       </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-[1.2fr_1.2fr_1fr]">
        <label class="block space-y-1.5">
          <span class="ui-eyebrow block">De</span>
          <input v-model="startDate" type="date" class="ui-input" />
        </label>

        <label class="block space-y-1.5">
          <span class="ui-eyebrow block">Até</span>
          <input v-model="endDate" type="date" class="ui-input" />
        </label>

        <div class="flex items-end">
          <button type="button" class="ui-btn-secondary w-full" @click="resetPeriod">
            Usar todo o histórico
          </button>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-1.5">
        <span class="mr-1 text-[14px] text-steel">Atalhos:</span>
        <button
          v-for="days in quickRanges"
          :key="days"
          type="button"
          class="ui-pill !font-sans !text-[14px]"
          @click="applyQuickPeriod(days)"
        >
          Últimos {{ days }} dias
        </button>
      </div>

      <div class="mt-5 border-t border-line pt-4">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <p class="ui-eyebrow">Lojas no relatório</p>
          <div class="flex gap-3 text-[14px] font-semibold">
            <button type="button" class="text-ink underline-offset-4 hover:underline" @click="selectAllStores">Marcar todas</button>
            <button type="button" class="text-steel underline-offset-4 hover:text-ink hover:underline" @click="clearStoreSelection">Desmarcar todas</button>
          </div>
        </div>

        <div class="mt-2 flex flex-wrap gap-1.5">
          <button
            v-for="code in storeCodes"
            :key="code"
            type="button"
            class="ui-pill"
            :class="{ 'ui-pill-on': selectedStores.includes(code) }"
            :aria-pressed="selectedStores.includes(code)"
            @click="toggleStore(code)"
          >
            {{ code }}
          </button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <MetricCard label="Auditorias" :value="auditCount" />
      <MetricCard :label="reportLabels.read" :value="`${regionalSummary.readPct.toFixed(2)}%`" />
      <MetricCard :label="reportLabels.pending" :value="`${regionalSummary.pendingPct.toFixed(2)}%`" :subtext="`Meta: até ${formatLimit(metaThreshold)}%`" :tone="getMetaTone(regionalSummary.pendingPct)" />
      <MetricCard :label="reportLabels.accuracy" :value="`${regionalSummary.thirdPct.toFixed(2)}%`" />
      <MetricCard label="Lojas canceladas" :value="cancellationCount" :tone="cancellationCount ? 'red' : 'default'" subtext="Somadas no período" />
    </div>

    <div class="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div class="ui-card p-5">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <h2 class="ui-title !mt-0">Comparado ao mês anterior</h2>
          <p class="text-[14px] text-steel">{{ comparison.rangeLabel }}</p>
        </div>
        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="ui-table-head">
              <tr>
                <th class="px-4 py-2.5">Indicador</th>
                <th class="px-4 py-2.5 text-right">Atual</th>
                <th class="px-4 py-2.5 text-right">Mês anterior</th>
                <th class="px-4 py-2.5 text-right">Variação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              <tr v-for="metric in comparison.metrics" :key="metric.key">
                <td class="px-4 py-2.5 font-medium text-ink">{{ metric.label }}</td>
                <td class="px-4 py-2.5 text-right font-display text-[18px] font-semibold text-ink">{{ formatMetric(metric.current, metric.format) }}</td>
                <td class="px-4 py-2.5 text-right text-steel">{{ metric.hasPrevious ? formatMetric(metric.previous, metric.format) : '—' }}</td>
                <td class="px-4 py-2.5 text-right font-semibold" :class="deltaClass(metric)">{{ formatDelta(metric) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="ui-card p-5">
        <h2 class="ui-title !mt-0">Baixar relatório em imagem</h2>
        <p class="mt-1 text-[14px] text-steel">Imagem 3840×2160 com indicadores, gráficos, comparativo e ranking, usando os filtros acima.</p>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            v-for="type in auditTypes"
            :key="type"
            type="button"
            class="ui-btn-soft"
            :disabled="Boolean(exportingType)"
            @click="exportSnapshot(type)"
          >
            <i :class="exportingType === type ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-image'"></i>
            {{ type }}
          </button>
        </div>
        <button
          type="button"
          class="ui-btn-primary mt-2 w-full"
          :disabled="Boolean(exportingType)"
          @click="exportAllSnapshots"
        >
          <i class="fa-solid fa-download"></i>
          Baixar as quatro imagens
        </button>
      </div>
    </div>

    <div class="ui-card p-5">
      <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 class="ui-title !mt-0">Destaques do período</h2>
        <p class="text-[14px] text-steel">Lojas: {{ selectedStoresLabel || 'nenhuma selecionada' }}</p>
      </div>

      <div v-if="insights.length" class="grid gap-3 lg:grid-cols-4">
        <div
          v-for="insight in insights"
          :key="insight.title"
          class="border-l-[3px] py-1 pl-4"
          :class="{
            'border-good': insight.tone === 'positive',
            'border-warn': insight.tone === 'warning',
            'border-bad': insight.tone === 'negative',
            'border-line-strong': insight.tone === 'neutral',
          }"
        >
          <p class="text-[16px] font-semibold text-ink">{{ insight.title }}</p>
          <p class="mt-1 text-[15px] leading-6 text-steel">{{ insight.body }}</p>
        </div>
      </div>
    </div>

    <div ref="trendChartCard" class="ui-card p-5">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 class="ui-title !mt-0">{{ reportLabels.read }} ao longo do período</h2>
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-export-control
            class="ui-btn-soft"
            @click="exportTrendChart"
          >
            <i class="fa-solid fa-download"></i>
            Salvar imagem
          </button>
          <span class="ui-badge ui-badge-mute">Meta: {{ formatLimit(metaThreshold) }}%</span>
        </div>
      </div>

      <div v-if="chartPoints.length" class="space-y-4">
        <div class="relative overflow-hidden rounded-md border border-line p-3">
          <svg viewBox="0 0 640 230" class="h-[420px] w-full cursor-crosshair" role="img" aria-label="Comparativo de leitura por loja e regional" @mousemove="handleChartMove" @mouseleave="clearTrendHover">
            <defs>
              <linearGradient id="regionalArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#1B2430" stop-opacity="0.12" />
                <stop offset="100%" stop-color="#1B2430" stop-opacity="0" />
              </linearGradient>
              <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.14" />
              </filter>
            </defs>
            <g>
              <line x1="36" y1="194" x2="604" y2="194" class="stroke-line-strong" stroke-width="1" />
              <line x1="36" y1="36" x2="604" y2="36" class="stroke-line" stroke-width="1" />
              <line x1="36" y1="115" x2="604" y2="115" class="stroke-line" stroke-width="1" />
              <line x1="36" y1="194" x2="36" y2="36" class="stroke-line-strong" stroke-width="1" />
            </g>

            <g>
              <text x="16" y="198" class="fill-steel" font-size="13">0%</text>
              <text x="6" y="40" class="fill-steel" font-size="13">100%</text>
            </g>

            <g v-if="hoveredTrendIndex !== null && currentHoverDate">
              <line :x1="chartPadding + (hoveredTrendIndex * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y1="36" :x2="chartPadding + (hoveredTrendIndex * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y2="194" class="stroke-steel" stroke-dasharray="4 6" stroke-width="1" />
            </g>

            <path v-if="chartPoints[0]?.points?.length" :d="getAreaPath(chartPoints[0].points)" fill="url(#regionalArea)" />

            <path
              v-for="series in chartPoints"
              :key="`${series.code}-line`"
              :d="getLinePath(series.points)"
              fill="none"
              :style="{ stroke: series.color }"
              :stroke-width="series.isRegional ? 3 : 2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <g v-if="trendDates.length <= 15">
              <template v-for="series in chartPoints" :key="`${series.code}-dots`">
                <circle v-for="(point, index) in series.points" :key="index" :cx="point.x" :cy="point.y" :r="series.isRegional ? 3.5 : 2.5" :style="{ fill: series.color }" />
              </template>
            </g>

            <g v-if="hoveredTrendIndex !== null && currentHoverDate">
              <circle
                v-for="series in chartPoints"
                :key="`${series.code}-focus`"
                :cx="series.points[hoveredTrendIndex]?.x ?? 0"
                :cy="series.points[hoveredTrendIndex]?.y ?? 0"
                r="4.5"
                :style="{ fill: series.color }"
                class="stroke-paper"
                stroke-width="2"
              />
            </g>

            <g>
              <text v-for="date in trendDates" :key="`${date.isoDate}-label`" :x="36 + (trendDates.indexOf(date) * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y="216" class="fill-steel" font-size="12" font-weight="600" text-anchor="middle">
                {{ date.label }}
              </text>
            </g>
          </svg>

          <div v-if="hoveredTrendIndex !== null && currentHoverDate" class="pointer-events-none absolute right-3 top-3 max-w-xs rounded-md bg-ink p-3 text-white shadow-lg">
            <p class="font-display text-[18px] font-semibold">{{ currentHoverDate.label }}</p>
            <div class="mt-2 space-y-1.5">
              <div v-for="row in hoverRows" :key="row.code" class="flex items-center justify-between gap-3 text-[13px] text-white/80">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full" :style="{ background: row.color }" />
                <span :class="row.isRegional ? 'font-bold text-white' : ''">{{ row.displayName }}</span>
                </div>
                <span class="font-semibold text-white">{{ (row.value ?? 0).toFixed(2) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <div v-for="series in chartPoints" :key="series.code" class="flex items-center gap-1.5 text-[14px] font-medium text-steel">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ background: series.color }" />
            {{ series.code }}
          </div>
        </div>
      </div>

      <div v-else class="rounded-md border border-dashed border-line-strong px-4 py-6 text-[15px] text-steel">
        Nenhuma auditoria no período escolhido. Amplie as datas ou marque mais lojas.
      </div>
    </div>

    <StoreTowerChart
      :stores="chartStoreRows"
      :regional-summary="regionalSummary"
      :selected-codes="selectedStores"
      :store-codes="storeCodes"
      :regional-name="region.name"
      :metric-title="reportLabels.chart"
      :primary-label="reportLabels.pending"
      :secondary-label="reportLabels.secondary"
      :export-context="`${selectedAuditType === 'Geral' ? 'visão geral' : selectedAuditType}, ${startDate || endDate ? `${formatDateBR(startDate)} a ${formatDateBR(endDate)}` : 'todo o histórico'}`"
      @update:selected-codes="selectedStores = $event"
    />

    <div class="ui-card p-5">
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 class="ui-title !mt-0">Ranking por loja</h2>
        <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="ui-btn-soft" :disabled="!rankedStores.length || isExportingExcel" @click="exportRankingExcel">
          <i :class="isExportingExcel ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-excel'" aria-hidden="true"></i>
          Baixar Excel
        </button>
        <label class="flex items-center gap-2 text-[14px] font-medium text-steel">
          Ordenar por
          <select v-model="sortMode" class="ui-input !w-auto !py-0">
            <option value="pending">{{ reportLabels.pending }}</option>
            <option value="read">{{ reportLabels.read }}</option>
            <option value="accuracy">{{ reportLabels.accuracy }}</option>
            <option value="cancellations">Cancelamentos</option>
            <option value="name">Loja</option>
          </select>
        </label>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-left">
          <thead class="ui-table-head">
            <tr>
              <th class="px-4 py-3">Loja</th>
              <th class="px-4 py-3">SKU</th>
              <th class="px-4 py-3">{{ reportLabels.read }}</th>
              <th class="px-4 py-3">{{ reportLabels.pending }}</th>
              <th class="px-4 py-3">Evolução</th>
              <th class="px-4 py-3">{{ reportLabels.accuracy }}</th>
              <th class="px-4 py-3">{{ reportLabels.moved }}</th>
              <th class="px-4 py-3">Cancelamentos</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line text-[15px] text-ink">
            <tr v-for="row in rankedStores" :key="row.code" class="hover:bg-floor/50" :class="row.hasData ? '' : 'text-steel'">
              <td class="whitespace-nowrap px-4 py-3 font-semibold">
                <span class="store-name-cell" :title="row.name">{{ row.displayName }}</span>
              </td>
              <template v-if="row.hasData">
                <td class="px-4 py-3">{{ row.totalSku.toLocaleString('pt-BR') }}</td>
                <td class="px-4 py-3">{{ row.readPct.toFixed(2) }}%</td>
                <td class="px-4 py-3 font-semibold" :class="{ green: 'text-good', orange: 'text-warn', red: 'text-bad' }[getMetaTone(row.pendingPct)]">{{ row.pendingPct.toFixed(2) }}%</td>
                <td class="px-4 py-2">
                  <svg v-if="sparklines[row.code]" :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`" :width="SPARK_W" :height="SPARK_H" class="block overflow-visible" role="img" :aria-label="sparklines[row.code].label">
                    <line x1="0" :x2="SPARK_W" :y1="sparklines[row.code].metaY" :y2="sparklines[row.code].metaY" class="stroke-line-strong" stroke-dasharray="2 3" />
                    <polyline :points="sparklines[row.code].points" fill="none" class="stroke-steel" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
                    <circle :cx="sparklines[row.code].last.x" :cy="sparklines[row.code].last.y" r="3" :class="{ green: 'fill-good', orange: 'fill-warn', red: 'fill-bad' }[sparklines[row.code].tone]" />
                  </svg>
                  <span v-else class="text-[13px] text-steel">—</span>
                </td>
                <td class="px-4 py-3">{{ row.thirdPct.toFixed(2) }}%</td>
                <td class="px-4 py-3">{{ row.movedItems.toLocaleString('pt-BR') }}</td>
              </template>
              <td v-else colspan="6" class="px-4 py-3 text-[14px] text-steel">Sem auditoria válida no período</td>
              <td class="px-4 py-3"><span class="ui-badge" :class="row.cancellationCount ? 'ui-badge-bad' : 'ui-badge-mute'">{{ row.cancellationCount }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Painel da imagem (fora da tela, só durante a exportação) -->
    <div v-if="snapshotReport" class="pointer-events-none fixed top-0" style="left: -100000px" aria-hidden="true">
      <ReportSnapshot
        ref="snapshotRef"
        :report="snapshotReport"
        :region-name="region.name"
        :region-code="region.code"
        :filters="snapshotFilters"
        :generated-at="generatedAt"
      />
    </div>
  </div>
</template>

<style scoped>
.store-name-cell {
  display: inline-block;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
</style>
