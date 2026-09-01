<script setup>
import { computed, onMounted, ref } from 'vue'
import { listSessions } from '../lib/database'
import { STORE_CODES, summarizeStores, formatStoreLabel } from '../lib/metrics'

const sessions = ref([])
const startDate = ref('')
const endDate = ref('')
const selectedStores = ref([...STORE_CODES])
const sortMode = ref('pending')
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

const filteredSessions = computed(() => {
  return [...(sessions.value || [])]
    .filter((session) => {
      if (!session.isoDate) return true
      if (startDate.value && session.isoDate < startDate.value) return false
      if (endDate.value && session.isoDate > endDate.value) return false
      return true
    })
    .sort((a, b) => new Date(a.isoDate || a.uploadedAt) - new Date(b.isoDate || b.uploadedAt))
})

const filteredStoreRows = computed(() => {
  const totals = Object.fromEntries(STORE_CODES.map((code) => [code, {
    code,
    name: '',
    totalSku: 0,
    pendingItems: 0,
    updatedItems: 0,
    outdatedItems: 0,
  }]))

  for (const session of filteredSessions.value) {
    for (const store of session.stores || []) {
      if (!selectedStores.value.includes(store.code)) continue
      const target = totals[store.code]
      if (!target) continue
      if (!target.name && store.name) target.name = store.name
      target.totalSku += Number(store.totalSku || 0)
      target.pendingItems += Number(store.pendingItems || 0)
      target.updatedItems += Number(store.updatedItems || 0)
      target.outdatedItems += Number(store.outdatedItems || 0)
    }
  }

  return Object.values(totals)
    .filter((store) => store.totalSku > 0 || store.pendingItems > 0 || store.updatedItems > 0 || store.outdatedItems > 0)
    .map((store) => ({
      ...store,
      ...summarizeStores([store]),
    }))
})

const regionalSummary = computed(() => summarizeStores(filteredStoreRows.value))

const rankedStores = computed(() => {
  const base = [...filteredStoreRows.value].map((store) => ({
    code: store.code,
    name: store.name,
    totalSku: Number(store.totalSku || 0),
    pendingItems: Number(store.pendingItems || 0),
    updatedItems: Number(store.updatedItems || 0),
    outdatedItems: Number(store.outdatedItems || 0),
    readPct: Number(store.readPct || 0),
    pendingPct: Number(store.pendingPct || 0),
    accuracyPct: Number(store.accuracyPct || 0),
  }))

  if (sortMode.value === 'pending') {
    return [...base].sort((a, b) => a.pendingPct - b.pendingPct)
  }
  if (sortMode.value === 'read') {
    return [...base].sort((a, b) => b.readPct - a.readPct)
  }
  if (sortMode.value === 'accuracy') {
    return [...base].sort((a, b) => b.accuracyPct - a.accuracyPct)
  }
  return [...base].sort((a, b) => a.code.localeCompare(b.code))
})

const comparisonRows = computed(() => {
  const regional = {
    code: 'Regional',
    pendingPct: Number(regionalSummary.value.pendingPct || 0),
    readPct: Number(regionalSummary.value.readPct || 0),
    accuracyPct: Number(regionalSummary.value.accuracyPct || 0),
    isRegional: true,
  }

  const rows = rankedStores.value.map((store) => ({
    ...store,
    displayName: formatStoreLabel(store.code, store.name),
    isRegional: false,
  }))

  return [{
    ...regional,
    displayName: formatStoreLabel('Regional'),
  }, ...rows]
})

const chartPalette = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#fb7185', '#f97316', '#6366f1']

const trendDates = computed(() => {
  return filteredSessions.value.map((session) => ({
    isoDate: session.isoDate,
    label: session.isoDate ? new Date(`${session.isoDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—',
  }))
})

const regionalTrendSeries = computed(() => {
  return filteredSessions.value.map((session) => {
    const selected = (session.stores || []).filter((store) => selectedStores.value.includes(store.code))
    const summary = summarizeStores(selected)
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
  const codes = selectedStores.value.length ? selectedStores.value : STORE_CODES
  return codes.map((code, index) => {
    const matchStore = (filteredSessions.value || []).flatMap((session) => session.stores || []).find((store) => store.code === code)

    return {
      code,
      name: matchStore?.name || '',
      color: chartPalette[index % chartPalette.length],
      points: filteredSessions.value.map((session) => {
        const match = (session.stores || []).find((store) => store.code === code)
        const summary = match ? summarizeStores([match]) : { readPct: 0, pendingPct: 0, accuracyPct: 0, totalSku: 0, pendingItems: 0 }
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

const hoveredTrendIndex = ref(null)
const hoveredComparisonCode = ref(null)
const comparisonMetaPosition = computed(() => {
  const values = comparisonRows.value.map((row) => Number(row.pendingPct || 0))
  const maxPending = Math.max(10, ...values)
  return Math.min((metaThreshold / maxPending) * 100, 100)
})
const currentHoverDate = computed(() => {
  if (hoveredTrendIndex.value === null) return null
  return trendDates.value[hoveredTrendIndex.value] || null
})

const hoverRows = computed(() => {
  if (hoveredTrendIndex.value === null) return []

  return chartSeries.value
    .map((series) => ({
      code: series.code,
    displayName: formatStoreLabel(series.code, series.name),
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

function setComparisonHover(code) {
  hoveredComparisonCode.value = code
}

function clearComparisonHover() {
  hoveredComparisonCode.value = null
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
        ? `${formatStoreLabel('Regional')} avançou ${delta.toFixed(2)} p.p. no período, mostrando aceleração consistente na leitura.`
        : `${formatStoreLabel('Regional')} recuou ${Math.abs(delta).toFixed(2)} p.p. e precisa reforço operacional para recuperar ritmo.`,
    },
    {
      title: 'Maior desempenho',
      tone: 'positive',
      body: bestStore
        ? `${formatStoreLabel(bestStore.code)} lidera o comparativo com ${(bestStore.points[bestStore.points.length - 1]?.value ?? 0).toFixed(2)}% de leitura e ${(bestStore.points[bestStore.points.length - 1]?.pendingPct ?? 0).toFixed(2)}% de pendência.`
        : 'Ainda não há loja com volume suficiente para comparar.',
    },
    {
      title: 'Recuperação',
      tone: biggestRise ? 'positive' : 'neutral',
      body: biggestRise
        ? `${formatStoreLabel(biggestRise.code)} foi a loja com melhor recuperação, ganhando ${(((biggestRise.points[biggestRise.points.length - 1]?.value ?? 0) - (biggestRise.points[0]?.value ?? 0))).toFixed(2)} p.p. no período.`
        : 'Não há recuperação relevante entre as lojas selecionadas.',
    },
    {
      title: 'Cobertura da meta',
      tone: recoveryRate >= 60 ? 'positive' : 'warning',
      body: `${withinMetaStores} de ${storeTrendSeries.value.length || 0} lojas estão dentro da meta de 3% pendente. ${riskStores} lojas ainda exigem atenção para evitar perda de ritmo.`,
    },
  ]
})

const auditCount = computed(() => filteredSessions.value.length)
const selectedStoresLabel = computed(() => selectedStores.value.length === STORE_CODES.length ? 'Todas' : selectedStores.value.join(', '))

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
  selectedStores.value = [...STORE_CODES]
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
  const all = await listSessions()
  sessions.value = [...all].sort((a, b) => new Date(a.isoDate || a.uploadedAt) - new Date(b.isoDate || b.uploadedAt))

  if (allDateValues.value.length) {
    startDate.value = allDateValues.value[0]
    endDate.value = allDateValues.value[allDateValues.value.length - 1]
  }
}

onMounted(async () => {
  await loadSessions()
})
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relatórios</p>
      <h1 class="mt-2 text-3xl font-bold text-slate-900">Comparativo por período</h1>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="grid gap-4 xl:grid-cols-[1.2fr_1.2fr_1fr]">
        <label class="space-y-2">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Data inicial</span>
          <input v-model="startDate" type="date" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
        </label>

        <label class="space-y-2">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Data final</span>
          <input v-model="endDate" type="date" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
        </label>

        <div class="space-y-2">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ações</span>
          <div class="flex gap-2">
            <button class="flex-1 rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200" @click="resetPeriod">
              Reset
            </button>
          </div>
        </div>
      </div>

      <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Filtros rápidos</p>
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
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lojas</p>
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
            v-for="code in STORE_CODES"
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

    <div class="grid gap-4 md:grid-cols-4">
      <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Auditorias</p>
        <p class="mt-3 text-3xl font-bold text-slate-900">{{ auditCount }}</p>
      </div>
      <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Leitura regional</p>
        <p class="mt-3 text-3xl font-bold text-slate-900">{{ regionalSummary.readPct.toFixed(2) }}%</p>
      </div>
      <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pendência</p>
        <p class="mt-3 text-3xl font-bold" :class="regionalSummary.pendingPct <= metaThreshold ? 'text-emerald-600' : regionalSummary.pendingPct <= 7 ? 'text-amber-600' : 'text-rose-600'">
          {{ regionalSummary.pendingPct.toFixed(2) }}%
        </p>
      </div>
      <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Acertabilidade</p>
        <p class="mt-3 text-3xl font-bold text-slate-900">{{ regionalSummary.accuracyPct.toFixed(2) }}%</p>
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Insights</p>
          <h2 class="mt-2 text-xl font-semibold text-slate-900">O que está acontecendo</h2>
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
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{{ insight.title }}</p>
          <p class="mt-3 text-sm leading-6 text-slate-700">{{ insight.body }}</p>
        </div>
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Evolução</p>
          <h2 class="mt-2 text-xl font-semibold text-slate-900">Leitura ao longo do período</h2>
        </div>
        <div class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          Meta de pendência: {{ metaThreshold }}%
        </div>
      </div>

      <div v-if="chartPoints.length" class="space-y-4">
        <div class="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-inner">
          <svg viewBox="0 0 640 230" class="h-[420px] w-full cursor-crosshair" role="img" aria-label="Comparativo de leitura por loja e regional" @mousemove="handleChartMove" @mouseleave="clearTrendHover">
            <g>
              <line x1="36" y1="194" x2="604" y2="194" stroke="#cbd5e1" stroke-width="1" />
              <line x1="36" y1="36" x2="604" y2="36" stroke="#e2e8f0" stroke-width="1" />
              <line x1="36" y1="115" x2="604" y2="115" stroke="#e2e8f0" stroke-width="1" />
              <line x1="36" y1="194" x2="36" y2="36" stroke="#cbd5e1" stroke-width="1" />
            </g>

            <g>
              <text x="16" y="198" fill="#64748b" font-size="10">0%</text>
              <text x="10" y="40" fill="#64748b" font-size="10">100%</text>
            </g>

            <g v-if="hoveredTrendIndex !== null && currentHoverDate">
              <line :x1="chartPadding + (hoveredTrendIndex * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y1="36" :x2="chartPadding + (hoveredTrendIndex * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y2="194" stroke="#64748b" stroke-dasharray="4 6" stroke-width="1" />
            </g>

            <path
              v-for="series in chartPoints"
              :key="`${series.code}-line`"
              :d="getLinePath(series.points)"
              fill="none"
              :stroke="series.color"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
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
              <text v-for="date in trendDates" :key="`${date.isoDate}-label`" :x="36 + (trendDates.indexOf(date) * (chartPlotWidth / Math.max(trendDates.length - 1, 1)))" y="214" fill="#64748b" font-size="10" text-anchor="middle">
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

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Comparativo</p>
          <h2 class="mt-2 text-xl font-semibold text-slate-900">Pendência por loja</h2>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-slate-700">Ordenar</label>
          <select v-model="sortMode" class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200">
            <option value="pending">Pendência</option>
            <option value="read">Leitura</option>
            <option value="accuracy">Acertabilidade</option>
            <option value="name">Loja</option>
          </select>
        </div>
      </div>

      <div class="space-y-4">
        <div
          v-for="row in comparisonRows"
          :key="row.code"
          class="chart-line"
          :class="{ 'chart-line-regional': row.isRegional }"
          @mouseenter="setComparisonHover(row.code)"
          @mouseleave="clearComparisonHover()"
        >
          <div class="chart-meta">
            <span>{{ row.displayName }}</span>
            <strong>{{ Number(row.pendingPct || 0).toFixed(2) }}%</strong>
          </div>

          <div class="chart-track">
            <div v-if="hoveredComparisonCode === row.code" class="comparison-tooltip">
              <div class="comparison-tooltip-header">{{ row.displayName }}</div>
              <div class="comparison-tooltip-body">
                <span>Pendência</span>
                <strong>{{ Number(row.pendingPct || 0).toFixed(2) }}%</strong>
              </div>
              <div class="comparison-tooltip-body">
                <span>Leitura</span>
                <strong>{{ Number(row.readPct || 0).toFixed(2) }}%</strong>
              </div>
              <div class="comparison-tooltip-body">
                <span>Acertabilidade</span>
                <strong>{{ Number(row.accuracyPct || 0).toFixed(2) }}%</strong>
              </div>
            </div>
            <div class="chart-meta-line" :style="{ left: `${comparisonMetaPosition}%` }" />
            <div
              class="chart-fill"
              :class="row.isRegional ? 'regional' : row.pendingPct <= metaThreshold ? 'good' : row.pendingPct <= 7 ? 'warning' : 'danger'"
              :style="{ width: `${Math.min(Number(row.pendingPct || 0), 100)}%` }"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Detalhamento</p>
        <h2 class="mt-2 text-xl font-semibold text-slate-900">Ranking por loja</h2>
      </div>

      <div class="overflow-hidden rounded-2xl border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-left">
          <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th class="px-4 py-3">Loja</th>
              <th class="px-4 py-3">SKU</th>
              <th class="px-4 py-3">Leitura</th>
              <th class="px-4 py-3">Pendência</th>
              <th class="px-4 py-3">Acertabilidade</th>
              <th class="px-4 py-3">Atualizados</th>
              <th class="px-4 py-3">Desatualizados</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 bg-white text-sm text-slate-700">
            <tr v-for="row in rankedStores" :key="row.code">
              <td class="px-4 py-3 font-semibold text-slate-900">
                <span class="store-name-cell">{{ formatStoreLabel(row.code, row.name) }}</span>
              </td>
              <td class="px-4 py-3">{{ row.totalSku.toLocaleString('pt-BR') }}</td>
              <td class="px-4 py-3">{{ row.readPct.toFixed(2) }}%</td>
              <td class="px-4 py-3">{{ row.pendingPct.toFixed(2) }}%</td>
              <td class="px-4 py-3">{{ row.accuracyPct.toFixed(2) }}%</td>
              <td class="px-4 py-3">{{ row.updatedItems.toLocaleString('pt-BR') }}</td>
              <td class="px-4 py-3">{{ row.outdatedItems.toLocaleString('pt-BR') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-line {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  position: relative;
  overflow: visible;
}

.chart-line-regional {
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.5);
  margin-top: 8px;
}

.comparison-tooltip {
  position: absolute;
  left: 50%;
  top: -82px;
  transform: translateX(-50%);
  min-width: 180px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: 0 18px 35px rgba(15, 23, 42, 0.28);
  z-index: 20;
  pointer-events: none;
}

.comparison-tooltip-header {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
}

.comparison-tooltip-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.comparison-tooltip-body + .comparison-tooltip-body {
  margin-top: 6px;
}

.comparison-tooltip-body strong {
  color: white;
  font-weight: 700;
}

.chart-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: #0f172a;
  min-width: 0;
}

.chart-meta span {
  display: inline-block;
  max-width: 100%;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chart-meta strong {
  color: #475569;
}

.chart-track {
  position: relative;
  width: 100%;
  height: 18px;
  border-radius: 999px;
  overflow: visible;
  border: 1px solid rgba(148, 163, 184, 0.5);
  background: linear-gradient(90deg, #e2e8f0, #f8fafc);
}

.chart-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: 999px;
}

.chart-fill.good {
  background: linear-gradient(90deg, #22c55e, #16a34a);
}

.chart-fill.warning {
  background: linear-gradient(90deg, #f59e0b, #f97316);
}

.chart-fill.danger {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}

.chart-fill.regional {
  background: linear-gradient(90deg, #0f172a, #1e293b);
}

.chart-meta-line {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 3px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.9);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
  z-index: 2;
}

.store-name-cell {
  display: inline-block;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
</style>
