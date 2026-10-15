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
  storeCodes: {
    type: Array,
    default: () => STORE_CODES,
  },
  regionalName: {
    type: String,
    default: 'Regional SP6',
  },
  metricTitle: {
    type: String,
    default: '% pendente por loja e regional',
  },
  primaryLabel: {
    type: String,
    default: 'Pendência',
  },
  secondaryLabel: {
    type: String,
    default: 'Acertabilidade',
  },
})

const emit = defineEmits(['update:selectedCodes'])
const sortMode = ref('pending')
const metaThreshold = 3
const hoveredCode = ref(null)

const activeCodes = computed({
  get: () => (props.selectedCodes?.length ? props.selectedCodes : props.storeCodes),
  set: (value) => emit('update:selectedCodes', value),
})

const filteredStores = computed(() => {
  const list = (props.stores || []).filter((store) => props.storeCodes.includes(store.code) && !isCancelledStore(store))
  if (!activeCodes.value.length) return []
  return [...list].filter((store) => activeCodes.value.includes(store.code))
})

const chartRows = computed(() => {
  const rows = [...filteredStores.value].map((store) => ({
    ...store,
    code: String(store.code),
    displayName: formatStoreLabel(store.code, store.name, props.regionalName),
    pendingPct: Number(store.pendingPct || 0),
    readPct: Number(store.readPct || 0),
    accuracyPct: Number(store.accuracyPct || 0),
    isRegional: false,
  }))

  if (props.regionalSummary) {
    rows.push({
      code: 'Regional',
      displayName: formatStoreLabel('Regional', '', props.regionalName),
      pendingPct: Number(props.regionalSummary.pendingPct || 0),
      readPct: Number(props.regionalSummary.readPct || 0),
      accuracyPct: Number(props.regionalSummary.accuracyPct || 0),
      recoveryPct: Number(props.regionalSummary.recoveryPct || 0),
      presencePct: Number(props.regionalSummary.presencePct || 0),
      isRegional: true,
    })
  }

  const sorted = [...rows]
  if (sortMode.value === 'pending') {
    sorted.sort((a, b) => (a.isRegional === b.isRegional ? b.pendingPct - a.pendingPct : a.isRegional ? 1 : -1))
  } else if (sortMode.value === 'read') {
    sorted.sort((a, b) => (a.isRegional === b.isRegional ? b.readPct - a.readPct : a.isRegional ? 1 : -1))
  } else if (sortMode.value === 'accuracy') {
    sorted.sort((a, b) => (a.isRegional === b.isRegional ? getSecondaryValue(b) - getSecondaryValue(a) : a.isRegional ? 1 : -1))
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

const chartScale = computed(() => {
  const highest = Math.max(metaThreshold, ...chartRows.value.map((row) => Number(row.pendingPct || 0)))
  return Math.max(10, Math.ceil(highest / 5) * 5)
})
const targetPercent = computed(() => (metaThreshold / chartScale.value) * 100)
const yTicks = computed(() => [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
  ratio,
  label: `${Number((chartScale.value * ratio).toFixed(1))}%`,
})))

function toggleCode(code) {
  const next = [...activeCodes.value]
  if (next.includes(code)) {
    emit('update:selectedCodes', next.filter((item) => item !== code))
    return
  }
  emit('update:selectedCodes', [...next, code])
}

function selectAll() {
  emit('update:selectedCodes', [...props.storeCodes])
}

function getBarClass(row) {
  if (row.isRegional) return 'bar-regional'
  if (row.pendingPct <= metaThreshold) return 'bar-good'
  if (row.pendingPct <= 7) return 'bar-warning'
  return 'bar-danger'
}

function getBarHeight(row) {
  const pendingPct = Number(row.pendingPct || 0)
  return Math.min((Math.max(pendingPct, 0) / chartScale.value) * 100, 100)
}

function setHover(code) {
  hoveredCode.value = code
}

function clearHover() {
  hoveredCode.value = null
}

function getSecondaryValue(row) {
  if (props.secondaryLabel === 'Recuperação') return Number(row.recoveryPct || 0)
  if (props.secondaryLabel === 'Presença') return Number(row.readPct || 0)
  return Number(row.accuracyPct || 0)
}

const chartCard = ref(null)

async function exportChart() {
  if (!chartCard.value) return
  await exportCardAsPng(chartCard.value, 'pendencia-por-loja-e-regional', { scale: 2.5 })
}
</script>

<template>
  <div ref="chartCard" class="ui-card p-5">
    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="ui-eyebrow">Indicador principal</p>
        <h3 class="ui-title">{{ metricTitle }}</h3>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          data-export-control
          class="ui-btn-soft text-xs"
          @click="exportChart"
        >
          <i class="fa-solid fa-download"></i>
          Salvar imagem
        </button>
        <label class="text-sm font-medium text-slate-700">Ordenar</label>
        <select v-model="sortMode" class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200">
          <option value="pending">Pendência</option>
          <option value="read">{{ primaryLabel === 'Pendência' ? 'Leitura' : 'Presença final' }}</option>
          <option value="accuracy">{{ secondaryLabel }}</option>
          <option value="name">Loja</option>
        </select>
      </div>
    </div>

    <div class="mb-5 flex flex-wrap gap-2">
      <button
        v-for="code in storeCodes"
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

    <div class="chart-panel">
      <div class="chart-header">
        <div class="chart-legend">
          <span><i class="legend-dot legend-good"></i> Até 3%</span>
          <span><i class="legend-dot legend-warning"></i> 3% a 7%</span>
          <span><i class="legend-dot legend-danger"></i> Acima de 7%</span>
        </div>
        <span class="chart-scale">Escala máxima: {{ chartScale }}%</span>
      </div>

      <div class="chart-scroll">
        <div class="chart-layout">
          <div class="y-axis" aria-hidden="true">
            <span v-for="tick in yTicks" :key="tick.ratio" :style="{ bottom: `${tick.ratio * 100}%` }">{{ tick.label }}</span>
          </div>

          <div class="plot-area">
            <div v-for="tick in yTicks" :key="`grid-${tick.ratio}`" class="grid-line" :style="{ bottom: `${tick.ratio * 100}%` }" />
            <div class="target-line" :style="{ bottom: `${targetPercent}%` }">
              <span>Meta 3%</span>
            </div>

            <div class="bars-grid" :style="{ gridTemplateColumns: `repeat(${chartRows.length}, minmax(52px, 1fr))` }">
              <div
                v-for="row in chartRows"
                :key="row.code"
                class="chart-column"
                :class="{ 'chart-column-regional': row.isRegional }"
                @mouseenter="setHover(row.code)"
                @mouseleave="clearHover()"
              >
                <div class="bar-stage">
                  <div v-if="hoveredCode === row.code" class="bar-tooltip">
                    <div class="bar-tooltip-header">{{ row.displayName }}</div>
                    <div class="bar-tooltip-body"><span>{{ primaryLabel }}</span><strong>{{ row.pendingPct.toFixed(2) }}%</strong></div>
                    <div class="bar-tooltip-body"><span>Presença final</span><strong>{{ row.readPct.toFixed(2) }}%</strong></div>
                    <div class="bar-tooltip-body"><span>{{ secondaryLabel }}</span><strong>{{ getSecondaryValue(row).toFixed(2) }}%</strong></div>
                  </div>
                  <span class="bar-value" :style="{ bottom: `calc(${getBarHeight(row)}% + 8px)` }">{{ row.pendingPct.toFixed(1) }}%</span>
                  <div class="bar-fill" :class="getBarClass(row)" :style="{ height: `${getBarHeight(row)}%` }" />
                </div>

                <div class="chart-label">
                  <strong>{{ row.isRegional ? 'Regional' : row.code }}</strong>
                  <span>{{ row.isRegional ? regionName : 'Loja' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-panel {
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #fff;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.chart-legend { display: flex; flex-wrap: wrap; gap: 16px; }
.chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }
.legend-good { background: #10b981; }
.legend-warning { background: #f59e0b; }
.legend-danger { background: #ef4444; }
.chart-scale { white-space: nowrap; }

.chart-scroll {
  overflow-x: auto;
  padding: 28px 20px 18px;
}

.chart-layout {
  display: grid;
  grid-template-columns: 42px minmax(960px, 1fr);
  min-width: 1010px;
  height: 660px;
}

.y-axis {
  position: relative;
  height: 580px;
  margin-top: 12px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
}

.y-axis span {
  position: absolute;
  right: 10px;
  transform: translateY(50%);
}

.plot-area {
  position: relative;
  height: 592px;
  border-bottom: 1px solid #cbd5e1;
}

.grid-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed #e2e8f0;
}

.bars-grid {
  position: absolute;
  top: 0;
  right: 0;
  bottom: -56px;
  left: 0;
  display: grid;
  gap: 10px;
  align-items: end;
}

.chart-column {
  display: grid;
  grid-template-rows: 580px 56px;
  min-width: 52px;
  text-align: center;
}

.chart-column-regional {
  margin-left: 8px;
  padding-left: 14px;
  border-left: 1px solid #cbd5e1;
}

.bar-stage {
  position: relative;
  height: 580px;
}

.bar-tooltip {
  position: absolute;
  left: 50%;
  top: 12px;
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
  font-size: 12px;
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
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.bar-tooltip-body + .bar-tooltip-body {
  margin-top: 6px;
}

.bar-tooltip-body strong {
  color: white;
  font-weight: 700;
}

.bar-fill {
  position: absolute;
  right: 12%;
  bottom: 0;
  left: 12%;
  min-height: 2px;
  border-radius: 8px 8px 2px 2px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 4px 10px rgba(15,23,42,.1);
  transition: height 0.45s cubic-bezier(.2,.8,.2,1), filter 0.2s ease;
}

.chart-column:hover .bar-fill {
  filter: saturate(1.15) brightness(1.04);
}

.bar-value {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  font-size: 20px;
  font-weight: 800;
  color: #334155;
  white-space: nowrap;
}

.bar-good {
  background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
}

.bar-warning {
  background: linear-gradient(180deg, #f59e0b 0%, #f97316 100%);
}

.bar-danger {
  background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
}

.bar-regional {
  background: linear-gradient(180deg, #334155 0%, #0f172a 100%);
}

.target-line {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 3;
  border-top: 2px dashed #059669;
}

.target-line span {
  position: absolute;
  top: -22px;
  left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  font-size: 12px;
  font-weight: 800;
}

.chart-label {
  padding-top: 10px;
  line-height: 1.15;
}

.chart-label strong { display: block; color: #0f172a; font-size: 15px; }
.chart-label span { display: block; margin-top: 4px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }

@media (max-width: 640px) {
  .chart-header { align-items: flex-start; flex-direction: column; gap: 8px; }
  .chart-scroll { padding-right: 12px; padding-left: 12px; }
}
</style>
