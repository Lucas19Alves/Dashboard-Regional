<script setup>
import { computed, ref } from 'vue'
import { STORE_CODES, formatStoreLabel, isCancelledStore } from '../lib/metrics'
import { exportCardAsPng } from '../lib/exportImage'

const props = defineProps({
  stores: {
    type: Array,
    default: () => [],
  },
  selectedCodes: {
    type: Array,
    default: () => [],
  },
  regionalSummary: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:selectedCodes'])
const sortMode = ref('pending')
const metaThreshold = 3
const chartScale = 100
const hoveredCode = ref(null)

const activeCodes = computed({
  get: () => (props.selectedCodes?.length ? props.selectedCodes : STORE_CODES),
  set: (value) => emit('update:selectedCodes', value),
})

const filteredStores = computed(() => {
  const list = (props.stores || []).filter((store) => STORE_CODES.includes(store.code) && !isCancelledStore(store))
  if (!activeCodes.value.length) return []
  return [...list].filter((store) => activeCodes.value.includes(store.code))
})

const chartRows = computed(() => {
  const rows = [...filteredStores.value].map((store) => ({
    ...store,
    code: String(store.code),
    displayName: formatStoreLabel(store.code, store.name),
    pendingPct: Number(store.pendingPct || 0),
    readPct: Number(store.readPct || 0),
    accuracyPct: Number(store.accuracyPct || 0),
    isRegional: false,
  }))

  if (props.regionalSummary) {
    rows.push({
      code: 'Regional',
      displayName: formatStoreLabel('Regional'),
      pendingPct: Number(props.regionalSummary.pendingPct || 0),
      readPct: Number(props.regionalSummary.readPct || 0),
      accuracyPct: Number(props.regionalSummary.accuracyPct || 0),
      isRegional: true,
    })
  }

  const sorted = [...rows]
  if (sortMode.value === 'pending') {
    sorted.sort((a, b) => (a.isRegional === b.isRegional ? b.pendingPct - a.pendingPct : a.isRegional ? 1 : -1))
  } else if (sortMode.value === 'read') {
    sorted.sort((a, b) => (a.isRegional === b.isRegional ? b.readPct - a.readPct : a.isRegional ? 1 : -1))
  } else if (sortMode.value === 'accuracy') {
    sorted.sort((a, b) => (a.isRegional === b.isRegional ? b.accuracyPct - a.accuracyPct : a.isRegional ? 1 : -1))
  } else {
    sorted.sort((a, b) => (a.isRegional === b.isRegional ? a.code.localeCompare(b.code) : a.isRegional ? 1 : -1))
  }

  const regional = sorted.find((row) => row.isRegional)
  if (regional) {
    const nonRegional = sorted.filter((row) => !row.isRegional)
    return [...nonRegional, regional]
  }

  return sorted
})

const targetPercent = computed(() => (metaThreshold / chartScale) * 100)

function toggleCode(code) {
  const next = [...activeCodes.value]
  if (next.includes(code)) {
    emit('update:selectedCodes', next.filter((item) => item !== code))
    return
  }
  emit('update:selectedCodes', [...next, code])
}

function selectAll() {
  emit('update:selectedCodes', [...STORE_CODES])
}

function getBarClass(row) {
  if (row.isRegional) return 'bar-regional'
  if (row.pendingPct <= metaThreshold) return 'bar-good'
  if (row.pendingPct <= 7) return 'bar-warning'
  return 'bar-danger'
}

function getBarWidth(row) {
  const pendingPct = Number(row.pendingPct || 0)
  return Math.min(Math.max(pendingPct, 0), chartScale)
}

function setHover(code) {
  hoveredCode.value = code
}

function clearHover() {
  hoveredCode.value = null
}

const chartCard = ref(null)

async function exportChart() {
  if (!chartCard.value) return
  await exportCardAsPng(chartCard.value, 'pendencia-por-loja-e-regional', { scale: 2.5 })
}
</script>

<template>
  <div ref="chartCard" class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Indicador principal</p>
        <h3 class="mt-2 text-xl font-semibold text-slate-900">% pendente por loja e regional</h3>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          data-export-control
          class="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
          @click="exportChart"
        >
          <i class="fa-solid fa-download"></i>
          Salvar imagem
        </button>
        <label class="text-sm font-medium text-slate-700">Ordenar</label>
        <select v-model="sortMode" class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200">
          <option value="pending">Pendência</option>
          <option value="read">Leitura</option>
          <option value="accuracy">Acertabilidade</option>
          <option value="name">Loja</option>
        </select>
      </div>
    </div>

    <div class="mb-5 flex flex-wrap gap-2">
      <button
        v-for="code in STORE_CODES"
        :key="code"
        class="rounded-full border px-2.5 py-1 text-xs font-semibold transition"
        :class="activeCodes.includes(code) ? 'border-sky-500 bg-sky-100 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'"
        @click="toggleCode(code)"
      >
        {{ code }}
      </button>
      <button class="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200" @click="selectAll">
        Todas
      </button>
    </div>

    <div class="chart-panel rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div class="chart-header">
        <span>Meta: 3%</span>
        <span>{{ chartRows.length }} itens</span>
      </div>

      <div class="chart-grid">
        <div
          v-for="row in chartRows"
          :key="row.code"
          class="chart-row"
          :class="{ 'chart-row-regional': row.isRegional }"
          @mouseenter="setHover(row.code)"
          @mouseleave="clearHover()"
        >
          <div class="chart-label">
            <span>{{ row.displayName }}</span>
            <strong>{{ Number(row.pendingPct || 0).toFixed(2) }}%</strong>
          </div>

          <div class="bar-area">
            <div v-if="hoveredCode === row.code" class="bar-tooltip">
              <div class="bar-tooltip-header">{{ row.displayName }}</div>
              <div class="bar-tooltip-body">
                <span>Pendência</span>
                <strong>{{ Number(row.pendingPct || 0).toFixed(2) }}%</strong>
              </div>
              <div class="bar-tooltip-body">
                <span>Leitura</span>
                <strong>{{ Number(row.readPct || 0).toFixed(2) }}%</strong>
              </div>
              <div class="bar-tooltip-body">
                <span>Acertabilidade</span>
                <strong>{{ Number(row.accuracyPct || 0).toFixed(2) }}%</strong>
              </div>
            </div>
            <div class="target-line" :style="{ left: `${targetPercent}%` }" />
            <div class="bar-track">
              <div class="bar-fill" :class="getBarClass(row)" :style="{ width: `${getBarWidth(row)}%` }" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-panel {
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #64748b;
}

.chart-grid {
  display: grid;
  gap: 12px;
}

.chart-row {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  position: relative;
}

.chart-row-regional {
  padding-top: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.45);
  margin-top: 4px;
}

.bar-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  min-width: 170px;
  background: rgba(15, 23, 42, 0.96);
  color: white;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 14px;
  padding: 10px 12px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.28);
  z-index: 20;
  pointer-events: none;
}

.bar-tooltip-header {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
}

.bar-tooltip-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.bar-tooltip-body + .bar-tooltip-body {
  margin-top: 6px;
}

.bar-tooltip-body strong {
  color: white;
  font-weight: 700;
}

.chart-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #0f172a;
  min-width: 0;
}

.chart-label span {
  display: block;
  max-width: 100%;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chart-label strong {
  font-size: 11px;
  color: #475569;
}

.bar-area {
  position: relative;
  height: 26px;
  display: flex;
  align-items: center;
}

.bar-track {
  position: relative;
  width: 100%;
  height: 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, #e2e8f0, #f8fafc);
  border: 1px solid rgba(148, 163, 184, 0.5);
  overflow: hidden;
}

.bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}

.bar-good {
  background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
}

.bar-warning {
  background: linear-gradient(90deg, #f59e0b 0%, #f97316 100%);
}

.bar-danger {
  background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
}

.bar-regional {
  background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
}

.target-line {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 3px;
  border-radius: 999px;
  background: #16a34a;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.18);
  z-index: 2;
}
</style>
