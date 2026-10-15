<script setup>
import PageHeader from '../components/PageHeader.vue'
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
const selectedAuditType = ref('Etiqueta')
const selectedStatus = ref('todas')
const auditTypes = REPORT_TYPES
const metaThreshold = 3
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

const chartPalette = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#fb7185', '#f97316', '#6366f1']

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
  })
})

const chartSeries = computed(() => [{
  code: 'Regional',
  color: '#0f172a',
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

  const withinMetaStores = storeTrendSeries.value.filter((store) => (store.points[store.points.length - 1]?.pendingPct ?? 0) <= metaThreshold).length
  const riskStores = storeTrendSeries.value.filter((store) => (store.points[store.points.length - 1]?.pendingPct ?? 0) > metaThreshold).length
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
      body: `${withinMetaStores} de ${storeTrendSeries.value.length || 0} lojas estão dentro da meta de 3% pendente. ${riskStores} lojas ainda exigem atenção para evitar perda de ritmo.`,
    },
  ]
})

const auditCount = computed(() => regionalSummary.value.auditCount)
const headerChips = computed(() => [
  { label: 'Período', value: startDate.value || endDate.value ? `${formatDateBR(startDate.value)} a ${formatDateBR(endDate.value)}` : 'Todo o histórico' },
  { label: 'Status', value: STATUS_OPTIONS.find((option) => option.value === selectedStatus.value)?.label || 'Todas' },
  { label: 'Lojas', value: selectedStores.value.length === storeCodes.value.length ? `Todas (${storeCodes.value.length})` : `${selectedStores.value.length} de ${storeCodes.value.length}` },
  { label: 'Auditorias', value: `${report.value.sessions.length} (${report.value.statusCounts.fechada} fechadas · ${report.value.statusCounts.aberta} abertas)` },
])
const cancellationCount = computed(() => regionalSummary.value.cancellations)
const selectedStoresLabel = computed(() => selectedStores.value.length === storeCodes.value.length ? 'Todas' : selectedStores.value.join(', '))

function formatMetric(value, format) {
  return format === 'pct' ? `${Number(value || 0).toFixed(2)}%` : Number(value || 0).toLocaleString('pt-BR')
}

function deltaClass(metric) {
  if (!metric.hasPrevious || metric.delta === 0 || metric.better === 'neutral') return 'text-slate-500'
  const improved = metric.better === 'up' ? metric.delta > 0 : metric.delta < 0
  return improved ? 'text-emerald-600' : 'text-rose-600'
}

function formatDelta(metric) {
  if (!metric.hasPrevious) return '—'
  const sign = metric.delta > 0 ? '+' : ''
  return metric.format === 'pct' ? `${sign}${metric.delta.toFixed(2)} p.p.` : `${sign}${metric.delta.toLocaleString('pt-BR')}`
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
  { label: 'Auditorias', value: `${snapshotReport.value?.sessions.length ?? 0} (${snapshotReport.value?.statusCounts.fechada ?? 0} fechadas · ${snapshotReport.value?.statusCounts.aberta ?? 0} abertas)` },
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
        url = await toPng(node, { pixelRatio, width: 1920, height: 1080, backgroundColor: '#f1f5f9', cacheBust: true })
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
      :eyebrow="`${region.name} · Relatórios`"
      :title="selectedAuditType === 'Geral' ? 'Visão geral' : `Auditoria de ${selectedAuditType}`"
      :chips="headerChips"
    />

    <div class="ui-card p-5">
      <div class="mb-5 flex flex-wrap gap-6">
       <div>
        <p class="ui-eyebrow">Tipo de auditoria</p>
        <div class="mt-3 ui-seg">
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
        <p class="ui-eyebrow">Situação da auditoria</p>
        <div class="mt-3 ui-seg">
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
        <label class="space-y-2">
          <span class="ui-eyebrow">Data inicial</span>
          <input v-model="startDate" type="date" class="ui-input" />
        </label>

        <label class="space-y-2">
          <span class="ui-eyebrow">Data final</span>
          <input v-model="endDate" type="date" class="ui-input" />
        </label>

        <div class="space-y-2">
          <span class="ui-eyebrow">Ações</span>
          <div class="flex gap-2">
            <button class="ui-btn-secondary flex-1" @click="resetPeriod">
              Reset
            </button>
          </div>
        </div>
      </div>

      <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="ui-eyebrow">Filtros rápidos</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="days in quickRanges"
            :key="days"
            type="button"
            class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
            @click="applyQuickPeriod(days)"
          >
            Últimos {{ days }} dias
          </button>
        </div>
      </div>

      <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="ui-eyebrow">Lojas</p>
            <p class="mt-2 text-sm text-slate-700">{{ selectedStoresLabel }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" @click="selectAllStores">
              Todas
            </button>
            <button class="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" @click="clearStoreSelection">
              Limpar
            </button>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="code in storeCodes"
            :key="code"
            class="rounded-full border px-2.5 py-1.5 text-xs font-semibold transition"
            :class="selectedStores.includes(code) ? 'border-sky-500 bg-sky-100 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'"
            @click="toggleStore(code)"
          >
            {{ code }}
          </button>
        </div>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <div class="ui-card p-5">
        <p class="ui-kpi-label">Auditorias</p>
        <p class="mt-2 text-[34px] font-black leading-none tracking-tight text-slate-900">{{ auditCount }}</p>
      </div>
      <div class="ui-card p-5">
        <p class="ui-kpi-label">{{ reportLabels.read }}</p>
        <p class="mt-2 text-[34px] font-black leading-none tracking-tight text-slate-900">{{ regionalSummary.readPct.toFixed(2) }}%</p>
      </div>
      <div class="ui-card p-5">
        <p class="ui-kpi-label">{{ reportLabels.pending }}</p>
        <p class="mt-2 text-[34px] font-black leading-none tracking-tight" :class="regionalSummary.pendingPct <= metaThreshold ? 'text-emerald-600' : regionalSummary.pendingPct <= 7 ? 'text-amber-600' : 'text-rose-600'">
          {{ regionalSummary.pendingPct.toFixed(2) }}%
        </p>
      </div>
      <div class="ui-card p-5">
        <p class="ui-kpi-label">{{ reportLabels.accuracy }}</p>
        <p class="mt-2 text-[34px] font-black leading-none tracking-tight text-slate-900">{{ regionalSummary.thirdPct.toFixed(2) }}%</p>
      </div>
      <div class="ui-card-alert p-5">
        <p class="ui-kpi-label !text-rose-600">Cancelamentos</p>
        <p class="mt-2 text-[34px] font-black leading-none tracking-tight text-rose-700">{{ cancellationCount }}</p>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div class="ui-card p-5">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p class="ui-eyebrow">Comparativo</p>
            <h2 class="ui-title">Mês anterior</h2>
          </div>
          <p class="text-xs font-medium text-slate-500">{{ comparison.rangeLabel }}</p>
        </div>
        <div class="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table class="min-w-full text-left text-sm">
            <thead class="ui-table-head">
              <tr>
                <th class="px-4 py-2.5">Indicador</th>
                <th class="px-4 py-2.5 text-right">Atual</th>
                <th class="px-4 py-2.5 text-right">Mês anterior</th>
                <th class="px-4 py-2.5 text-right">Variação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="metric in comparison.metrics" :key="metric.key">
                <td class="px-4 py-2.5 font-medium text-slate-700">{{ metric.label }}</td>
                <td class="px-4 py-2.5 text-right font-semibold text-slate-900">{{ formatMetric(metric.current, metric.format) }}</td>
                <td class="px-4 py-2.5 text-right text-slate-600">{{ metric.hasPrevious ? formatMetric(metric.previous, metric.format) : '—' }}</td>
                <td class="px-4 py-2.5 text-right font-semibold" :class="deltaClass(metric)">{{ formatDelta(metric) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="ui-card p-5">
        <p class="ui-eyebrow">Exportar</p>
        <h2 class="ui-title">Imagens em alta resolução</h2>
        <p class="mt-1 text-sm text-slate-500">3840×2160 (16:9) com cards, colunas por loja, evolução, comparativo, ranking e filtros aplicados.</p>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            v-for="type in auditTypes"
            :key="type"
            type="button"
            class="ui-btn-soft py-2.5"
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
          Baixar as 4 imagens
        </button>
      </div>
    </div>

    <div class="ui-card p-5">
      <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="ui-eyebrow">Insights</p>
          <h2 class="ui-title">O que está acontecendo</h2>
        </div>
        <div class="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
          Seleção ativa: {{ selectedStoresLabel || 'Nenhuma loja' }}
        </div>
      </div>

      <div v-if="insights.length" class="grid gap-3 lg:grid-cols-4">
        <div
          v-for="insight in insights"
          :key="insight.title"
          class="rounded-2xl border p-4 shadow-sm"
          :class="{
            'border-emerald-200 bg-emerald-50': insight.tone === 'positive',
            'border-amber-200 bg-amber-50': insight.tone === 'warning',
            'border-rose-200 bg-rose-50': insight.tone === 'negative',
            'border-slate-200 bg-slate-50': insight.tone === 'neutral',
          }"
        >
          <p class="ui-kpi-label">{{ insight.title }}</p>
          <p class="mt-3 text-sm leading-6 text-slate-700">{{ insight.body }}</p>
        </div>
      </div>
    </div>

    <div ref="trendChartCard" class="ui-card p-5">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="ui-eyebrow">Evolução</p>
          <h2 class="ui-title">{{ reportLabels.read }} ao longo do período</h2>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-export-control
            class="ui-btn-soft text-xs"
            @click="exportTrendChart"
          >
            <i class="fa-solid fa-download"></i>
            Salvar imagem
          </button>
          <div class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            Meta de pendência: {{ metaThreshold }}%
          </div>
        </div>
      </div>

      <div v-if="chartPoints.length" class="space-y-4">
        <div class="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-inner">
          <svg viewBox="0 0 640 230" class="h-[420px] w-full cursor-crosshair" role="img" aria-label="Comparativo de leitura por loja e regional" @mousemove="handleChartMove" @mouseleave="clearTrendHover">
            <defs>
              <linearGradient id="regionalArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.24" />
                <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.01" />
              </linearGradient>
              <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.14" />
              </filter>
            </defs>
            <g>
              <line x1="36" y1="194" x2="604" y2="194" stroke="#cbd5e1" stroke-width="1" />
              <line x1="36" y1="36" x2="604" y2="36" stroke="#e2e8f0" stroke-width="1" />
              <line x1="36" y1="115" x2="604" y2="115" stroke="#e2e8f0" stroke-width="1" />
              <line x1="36" y1="194" x2="36" y2="36" stroke="#cbd5e1" stroke-width="1" />
            </g>

            <g>
              <text x="16" y="198" fill="#64748b" font-size="13">0%</text>
              <text x="6" y="40" fill="#64748b" font-size="13">100%</text>
            </g>

            <g v-if="hoveredTrendIndex !== null && currentHoverDate">
              <line :x1="chartPadding + (hoveredTrendIndex * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y1="36" :x2="chartPadding + (hoveredTrendIndex * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y2="194" stroke="#64748b" stroke-dasharray="4 6" stroke-width="1" />
            </g>

            <path v-if="chartPoints[0]?.points?.length" :d="getAreaPath(chartPoints[0].points)" fill="url(#regionalArea)" />

            <path
              v-for="series in chartPoints"
              :key="`${series.code}-line`"
              :d="getLinePath(series.points)"
              fill="none"
              :stroke="series.color"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              filter="url(#lineGlow)"
            />

            <g v-if="hoveredTrendIndex !== null && currentHoverDate">
              <circle
                v-for="series in chartPoints"
                :key="`${series.code}-focus`"
                :cx="series.points[hoveredTrendIndex]?.x ?? 0"
                :cy="series.points[hoveredTrendIndex]?.y ?? 0"
                r="4.5"
                :fill="series.color"
                stroke="#ffffff"
                stroke-width="2"
              />
            </g>

            <g>
              <text v-for="date in trendDates" :key="`${date.isoDate}-label`" :x="36 + (trendDates.indexOf(date) * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y="216" fill="#64748b" font-size="13" font-weight="600" text-anchor="middle">
                {{ date.label }}
              </text>
            </g>
          </svg>

          <div v-if="hoveredTrendIndex !== null && currentHoverDate" class="absolute right-3 top-3 max-w-xs rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm transition-all">
            <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{{ currentHoverDate.label }}</p>
            <div class="mt-2 space-y-1.5">
              <div v-for="row in hoverRows" :key="row.code" class="flex items-center justify-between gap-3 text-xs text-slate-700">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full" :style="{ background: row.color }" />
                <span :class="row.isRegional ? 'font-bold text-slate-900' : ''">{{ row.displayName }}</span>
                </div>
                <span class="font-semibold text-slate-900">{{ (row.value ?? 0).toFixed(2) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <div v-for="series in chartPoints" :key="series.code" class="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ background: series.color }" />
            {{ series.code }}
          </div>
        </div>
      </div>

      <div v-else class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        Sem dados disponíveis para o período selecionado.
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
      @update:selected-codes="selectedStores = $event"
    />

    <div class="ui-card p-5">
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="ui-eyebrow">Detalhamento</p>
          <h2 class="ui-title">Ranking por loja</h2>
        </div>
        <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
          Ordenar por
          <select v-model="sortMode" class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200">
            <option value="pending">{{ reportLabels.pending }}</option>
            <option value="read">{{ reportLabels.read }}</option>
            <option value="accuracy">{{ reportLabels.accuracy }}</option>
            <option value="cancellations">Cancelamentos</option>
            <option value="name">Loja</option>
          </select>
        </label>
      </div>

      <div class="overflow-hidden rounded-2xl border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-left">
          <thead class="ui-table-head">
            <tr>
              <th class="px-4 py-3">Loja</th>
              <th class="px-4 py-3">SKU</th>
              <th class="px-4 py-3">{{ reportLabels.read }}</th>
              <th class="px-4 py-3">{{ reportLabels.pending }}</th>
              <th class="px-4 py-3">{{ reportLabels.accuracy }}</th>
              <th class="px-4 py-3">{{ reportLabels.moved }}</th>
              <th class="px-4 py-3">Cancelamentos</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 bg-white text-sm text-slate-700">
            <tr v-for="row in rankedStores" :key="row.code" :class="row.hasData ? '' : 'bg-slate-50'">
              <td class="px-4 py-3 font-semibold text-slate-900">
                <span class="store-name-cell" :title="row.name">{{ row.displayName }}</span>
              </td>
              <template v-if="row.hasData">
                <td class="px-4 py-3">{{ row.totalSku.toLocaleString('pt-BR') }}</td>
                <td class="px-4 py-3">{{ row.readPct.toFixed(2) }}%</td>
                <td class="px-4 py-3">{{ row.pendingPct.toFixed(2) }}%</td>
                <td class="px-4 py-3">{{ row.thirdPct.toFixed(2) }}%</td>
                <td class="px-4 py-3">{{ row.movedItems.toLocaleString('pt-BR') }}</td>
              </template>
              <td v-else colspan="5" class="px-4 py-3 text-center text-xs font-medium italic text-slate-400">Sem auditoria válida no período</td>
              <td class="px-4 py-3"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="row.cancellationCount ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'">{{ row.cancellationCount }}</span></td>
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
