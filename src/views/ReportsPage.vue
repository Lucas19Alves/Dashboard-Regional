<script setup>
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import { formatLimit, getAttention, getMetaTone, settings } from '../lib/settings'
import { notify } from '../composables/feedback'
import { computed, nextTick, onMounted, ref } from 'vue'
import { toPng } from 'html-to-image'
import { listSessions } from '../lib/database'
import { formatStoreLabel } from '../lib/metrics'
import { exportCardAsPng } from '../lib/exportImage'
import { REPORT_TYPES, STATUS_OPTIONS, buildReport, formatDateBR } from '../lib/reportData'
import ReportSnapshot from '../components/ReportSnapshot.vue'
import { useRoute } from 'vue-router'
import { getRegion } from '../lib/regions'
import StoreTowerChart from '../components/StoreTowerChart.vue'
import TrendChart from '../components/TrendChart.vue'

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


const trendChartCard = ref(null)

async function exportTrendChart() {
  if (!trendChartCard.value) return
  await exportCardAsPng(trendChartCard.value, `evolucao-${slug(region.value.code)}-${slug(selectedAuditType.value)}-${startDate.value || 'inicio'}-a-${endDate.value || 'fim'}`, { scale: 2.5 })
}

// Destaques do período, sempre pela pendência (indicador da meta: cair é bom).
const insights = computed(() => {
  const trend = report.value.trend
  const pendingWord = reportLabels.value.pending.toLowerCase()
  const firstOf = (points) => points.find(Boolean)
  const lastOf = (points) => [...points].reverse().find(Boolean)
  const regionalFirst = firstOf(trend.regional)
  const regionalLast = lastOf(trend.regional)
  if (!regionalFirst || !regionalLast) {
    return [{ title: 'Sem dados', tone: 'neutral', body: 'Nenhuma auditoria no período e nas lojas escolhidas.' }]
  }

  const regionalName = formatStoreLabel('Regional', '', region.value.name)
  const delta = Number((regionalLast.pendingPct - regionalFirst.pendingPct).toFixed(2))
  const stores = trend.stores
    .map((series) => ({ ...series, first: firstOf(series.points), last: lastOf(series.points) }))
    .filter((series) => series.last)
  const label = (series) => formatStoreLabel(series.code, series.name, region.value.name)
  const pctText = (value) => `${Number(value).toFixed(2).replace('.', ',')}%`

  const best = [...stores].sort((a, b) => a.last.pendingPct - b.last.pendingPct)[0]
  const drops = stores
    .filter((series) => series.first !== series.last)
    .map((series) => ({ ...series, change: series.last.pendingPct - series.first.pendingPct }))
    .sort((a, b) => a.change - b.change)
  const biggestDrop = drops[0] && drops[0].change < 0 ? drops[0] : null
  const within = stores.filter((series) => series.last.pendingPct <= metaThreshold.value)
  const worst = [...stores].sort((a, b) => b.last.pendingPct - a.last.pendingPct)[0]

  return [
    {
      title: 'Regional',
      tone: delta <= 0 ? 'positive' : 'negative',
      body: delta === 0
        ? `${regionalName} manteve ${pctText(regionalLast.pendingPct)} de ${pendingWord} no período.`
        : delta < 0
          ? `${regionalName} reduziu a ${pendingWord} em ${Math.abs(delta).toFixed(2).replace('.', ',')} p.p., de ${pctText(regionalFirst.pendingPct)} para ${pctText(regionalLast.pendingPct)}.`
          : `${regionalName} aumentou a ${pendingWord} em ${delta.toFixed(2).replace('.', ',')} p.p., de ${pctText(regionalFirst.pendingPct)} para ${pctText(regionalLast.pendingPct)}.`,
    },
    {
      title: 'Menor pendência',
      tone: 'positive',
      body: best
        ? `${label(best)} terminou o período com ${pctText(best.last.pendingPct)} de ${pendingWord}, a menor da regional.`
        : 'Ainda não há loja com dados para comparar.',
    },
    {
      title: 'Maior queda',
      tone: biggestDrop ? 'positive' : 'neutral',
      body: biggestDrop
        ? `${label(biggestDrop)} caiu ${Math.abs(biggestDrop.change).toFixed(2).replace('.', ',')} p.p., de ${pctText(biggestDrop.first.pendingPct)} para ${pctText(biggestDrop.last.pendingPct)}.`
        : `Nenhuma loja reduziu a ${pendingWord} no período.`,
    },
    {
      title: 'Meta',
      tone: within.length === stores.length ? 'positive' : within.length >= stores.length * 0.6 ? 'warning' : 'negative',
      body: `${within.length} de ${stores.length} lojas dentro da meta de ${formatLimit(metaThreshold.value)}%.${worst && worst.last.pendingPct > metaThreshold.value ? ` Pior: ${label(worst)} com ${pctText(worst.last.pendingPct)}.` : ''}`,
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
      [labels.pending]: row.hasData ? Number(row.pendingPct.toFixed(2)) : '',
      SKU: row.hasData ? row.totalSku : '',
      [labels.read]: row.hasData ? Number(row.readPct.toFixed(2)) : '',
      [labels.accuracy]: row.hasData ? Number(row.thirdPct.toFixed(2)) : '',
      [labels.moved]: row.hasData ? row.movedItems : '',
      Cancelamentos: row.cancellationCount,
      Situação: row.hasData ? { green: 'Na meta', orange: 'Atenção', red: 'Fora da meta' }[getMetaTone(row.pendingPct)] : 'Sem auditoria válida',
    }))
    rows.push({
      Posição: '',
      Loja: 'Regional',
      Nome: region.value.name,
      [labels.pending]: Number(regionalSummary.value.pendingPct.toFixed(2)),
      SKU: regionalSummary.value.totalSku,
      [labels.read]: Number(regionalSummary.value.readPct.toFixed(2)),
      [labels.accuracy]: Number(regionalSummary.value.thirdPct.toFixed(2)),
      [labels.moved]: '',
      Cancelamentos: cancellationCount.value,
      Situação: { green: 'Na meta', orange: 'Atenção', red: 'Fora da meta' }[getMetaTone(regionalSummary.value.pendingPct)],
    })
    const sheet = XLSX.utils.json_to_sheet(rows)
    sheet['!cols'] = [{ wch: 8 }, { wch: 7 }, { wch: 34 }, { wch: 14 }, { wch: 9 }, { wch: 16 }, { wch: 18 }, { wch: 13 }, { wch: 14 }, { wch: 20 }]
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
      <MetricCard :label="reportLabels.pending" :value="`${regionalSummary.pendingPct.toFixed(2)}%`" :subtext="`Indicador da meta: até ${formatLimit(metaThreshold)}%`" :tone="getMetaTone(regionalSummary.pendingPct)" />
      <MetricCard :label="reportLabels.read" :value="`${regionalSummary.readPct.toFixed(2)}%`" />
      <MetricCard :label="reportLabels.accuracy" :value="`${regionalSummary.thirdPct.toFixed(2)}%`" />
      <MetricCard label="Auditorias" :value="auditCount" />
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

    <section ref="trendChartCard" class="ui-card p-5" aria-labelledby="trend-title">
      <div class="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h2 id="trend-title" class="ui-title !mt-0">{{ reportLabels.pending }} ao longo do período</h2>
        <button type="button" data-export-control class="ui-btn-soft" :disabled="!report.trend.dates.length" @click="exportTrendChart">
          <i class="fa-solid fa-download" aria-hidden="true"></i>
          Salvar imagem
        </button>
      </div>

      <TrendChart
        v-if="report.trend.dates.length"
        :dates="report.trend.dates"
        :regional="report.trend.regional"
        :stores="report.trend.stores.filter((series) => series.points.some(Boolean))"
        :value-label="reportLabels.pending"
        :region-code="region.code"
        :show-types="selectedAuditType === 'Geral'"
        :meta="metaThreshold"
        :attention="attentionLimit"
      />

      <div v-else class="mt-3 rounded-md border border-dashed border-line-strong px-4 py-6 text-[15px] text-steel">
        Nenhuma auditoria no período escolhido. Amplie as datas ou marque mais lojas.
      </div>
    </section>

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
              <th class="px-4 py-3">{{ reportLabels.pending }}</th>
              <th class="px-4 py-3">Evolução</th>
              <th class="px-4 py-3">SKU</th>
              <th class="px-4 py-3">{{ reportLabels.read }}</th>
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
                <td class="px-4 py-3 font-semibold" :class="{ green: 'text-good', orange: 'text-warn', red: 'text-bad' }[getMetaTone(row.pendingPct)]">{{ row.pendingPct.toFixed(2) }}%</td>
                <td class="px-4 py-2">
                  <svg v-if="sparklines[row.code]" :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`" :width="SPARK_W" :height="SPARK_H" class="block overflow-visible" role="img" :aria-label="sparklines[row.code].label">
                    <line x1="0" :x2="SPARK_W" :y1="sparklines[row.code].metaY" :y2="sparklines[row.code].metaY" class="stroke-line-strong" stroke-dasharray="2 3" />
                    <polyline :points="sparklines[row.code].points" fill="none" class="stroke-steel" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
                    <circle :cx="sparklines[row.code].last.x" :cy="sparklines[row.code].last.y" r="3" :class="{ green: 'fill-good', orange: 'fill-warn', red: 'fill-bad' }[sparklines[row.code].tone]" />
                  </svg>
                  <span v-else class="text-[13px] text-steel">—</span>
                </td>
                <td class="px-4 py-3">{{ row.totalSku.toLocaleString('pt-BR') }}</td>
                <td class="px-4 py-3">{{ row.readPct.toFixed(2) }}%</td>
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
