<script setup>
import { computed, nextTick, ref } from 'vue'
import { toPng } from 'html-to-image'
import { STORE_CODES, formatStoreLabel, isCancelledStore } from '../lib/metrics'
import { formatLimit, getAttention, settings } from '../lib/settings'

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
  // Linha de contexto da imagem salva (ex.: "Ruptura de quarta, 07/10/2026").
  exportContext: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:selectedCodes'])
const sortMode = ref('pending')
const metaThreshold = computed(() => settings.meta)
const attention = computed(() => getAttention())
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
  const highest = Math.max(metaThreshold.value, ...chartRows.value.map((row) => Number(row.pendingPct || 0)))
  return Math.max(10, Math.ceil(highest / 5) * 5)
})
const targetPercent = computed(() => (metaThreshold.value / chartScale.value) * 100)
const yTicks = computed(() => [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
  ratio,
  label: `${String(Number((chartScale.value * ratio).toFixed(1))).replace('.', ',')}%`,
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
  if (row.pendingPct <= metaThreshold.value) return 'bar-good'
  if (row.pendingPct <= attention.value) return 'bar-warning'
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

// ---------- Imagem salva: moldura própria de 1600×900, sempre clara e com todas as colunas ----------
const EXPORT_W = 1600
const EXPORT_H = 900
const exportFrame = ref(null)
const isExporting = ref(false)
const generatedAt = ref('')
const regionalShort = computed(() => props.regionalName.replace(/^Regional\s+/i, '') || 'Regional')

function slug(value) {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function exportChart() {
  if (isExporting.value || !chartRows.value.length) return
  isExporting.value = true
  generatedAt.value = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  try {
    await nextTick()
    if (document.fonts?.ready) await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    if (!exportFrame.value) return
    let url = ''
    for (const pixelRatio of [2, 1.5, 1]) {
      try {
        url = await toPng(exportFrame.value, { pixelRatio, width: EXPORT_W, height: EXPORT_H, backgroundColor: '#ECEEF1', cacheBust: true })
      } catch {
        url = ''
      }
      if (url.length > 100) break
    }
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug(props.metricTitle)}-${slug(regionalShort.value)}-${slug(props.exportContext || new Date().toISOString().slice(0, 10))}.png`
    link.click()
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div ref="chartCard" class="ui-card p-5">
    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h3 class="ui-title !mt-0">{{ metricTitle }}</h3>
        <p class="text-[14px] text-steel">A linha marca a meta de {{ formatLimit(metaThreshold) }}%. A última coluna é a regional.</p>
      </div>

      <div class="flex flex-wrap items-center gap-2" data-export-control>
        <button
          type="button"
          data-export-control
          class="ui-btn-soft"
          :disabled="isExporting"
          @click="exportChart"
        >
          <i :class="isExporting ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-download'" aria-hidden="true"></i>
          Salvar imagem
        </button>
        <label class="text-[14px] font-medium text-steel" :for="`ordem-${metricTitle}`">Ordenar por</label>
        <select :id="`ordem-${metricTitle}`" v-model="sortMode" class="ui-input !w-auto !py-0">
          <option value="pending">Pendência</option>
          <option value="read">{{ primaryLabel === 'Pendência' ? 'Leitura' : 'Presença final' }}</option>
          <option value="accuracy">{{ secondaryLabel }}</option>
          <option value="name">Loja</option>
        </select>
      </div>
    </div>

    <div class="mb-5 flex flex-wrap gap-1.5" data-export-control>
      <button
        v-for="code in storeCodes"
        :key="code"
        type="button"
        class="ui-pill"
        :class="{ 'ui-pill-on': activeCodes.includes(code) }"
        :aria-pressed="activeCodes.includes(code)"
        @click="toggleCode(code)"
      >
        {{ code }}
      </button>
      <button type="button" class="ui-pill !font-sans !text-[14px]" @click="selectAll">
        Todas
      </button>
    </div>

    <div class="chart-panel">
      <div class="chart-header">
        <div class="chart-legend">
          <span><i class="legend-dot legend-good"></i> Até {{ formatLimit(metaThreshold) }}%</span>
          <span><i class="legend-dot legend-warning"></i> {{ formatLimit(metaThreshold) }}% a {{ formatLimit(attention) }}%</span>
          <span><i class="legend-dot legend-danger"></i> Acima de {{ formatLimit(attention) }}%</span>
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
              <span>Meta {{ formatLimit(metaThreshold) }}%</span>
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
                    <div class="bar-tooltip-body"><span>{{ primaryLabel }}</span><strong>{{ row.pendingPct.toFixed(2).replace('.', ',') }}%</strong></div>
                    <div class="bar-tooltip-body"><span>{{ primaryLabel === 'Pendência' ? 'Leitura' : 'Presença final' }}</span><strong>{{ row.readPct.toFixed(2).replace('.', ',') }}%</strong></div>
                    <div class="bar-tooltip-body"><span>{{ secondaryLabel }}</span><strong>{{ getSecondaryValue(row).toFixed(2).replace('.', ',') }}%</strong></div>
                  </div>
                  <span class="bar-value" :style="{ bottom: `calc(${getBarHeight(row)}% + 8px)` }">{{ row.pendingPct.toFixed(1).replace('.', ',') }}%</span>
                  <div class="bar-fill" :class="getBarClass(row)" :style="{ height: `${getBarHeight(row)}%` }" />
                </div>

                <div class="chart-label">
                  <strong>{{ row.isRegional ? 'Regional' : row.code }}</strong>
                  <span>{{ row.isRegional ? regionalName.replace(/^Regional\s+/i, '') : 'Loja' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Moldura da imagem salva (fora da tela, só durante a exportação) -->
    <div v-if="isExporting" class="export-host" aria-hidden="true">
      <div ref="exportFrame" class="xf" :style="{ width: `${EXPORT_W}px`, height: `${EXPORT_H}px` }">
        <header class="xf-head">
          <div>
            <p class="xf-context">{{ regionalName }}<template v-if="exportContext">, {{ exportContext }}</template></p>
            <h2 class="xf-title">{{ metricTitle }}</h2>
          </div>
          <div class="xf-legend">
            <span><i class="xf-dot xf-good"></i>Até {{ formatLimit(metaThreshold) }}%</span>
            <span><i class="xf-dot xf-warn"></i>{{ formatLimit(metaThreshold) }}% a {{ formatLimit(attention) }}%</span>
            <span><i class="xf-dot xf-bad"></i>Acima de {{ formatLimit(attention) }}%</span>
          </div>
        </header>

        <div class="xf-chart">
          <div class="xf-axis">
            <span v-for="tick in yTicks" :key="tick.ratio" :style="{ bottom: `${tick.ratio * 100}%` }">{{ tick.label }}</span>
          </div>
          <div class="xf-plot">
            <div v-for="tick in yTicks" :key="`xg-${tick.ratio}`" class="xf-grid" :style="{ bottom: `${tick.ratio * 100}%` }" />
            <div class="xf-target" :style="{ bottom: `${targetPercent}%` }"><span>Meta {{ formatLimit(metaThreshold) }}%</span></div>
            <div class="xf-bars" :style="{ gridTemplateColumns: `repeat(${chartRows.length}, minmax(0, 1fr))` }">
              <div v-for="row in chartRows" :key="`x-${row.code}`" class="xf-col" :class="{ 'xf-col-regional': row.isRegional }">
                <span class="xf-value" :style="{ bottom: `calc(${getBarHeight(row)}% + 6px)` }">{{ row.pendingPct.toFixed(1).replace('.', ',') }}%</span>
                <div class="xf-bar" :class="`xf-${getBarClass(row)}`" :style="{ height: `${getBarHeight(row)}%` }" />
                <div class="xf-label">
                  <strong>{{ row.isRegional ? 'Regional' : row.code }}</strong>
                  <span>{{ row.isRegional ? regionalShort : 'Loja' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer class="xf-foot">
          <span>{{ chartRows.filter((row) => !row.isRegional).length }} lojas. Gerado em {{ generatedAt }}.</span>
          <span class="xf-brand"><i class="xf-tag"></i>Auditorias</span>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-panel {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--paper);
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--paper);
  font-size: 13px;
  font-weight: 600;
  color: var(--steel);
}

.chart-legend { display: flex; flex-wrap: wrap; gap: 16px; }
.chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }
.legend-good { background: var(--good); }
.legend-warning { background: #E39A1F; }
.legend-danger { background: var(--bad); }
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
  color: var(--steel);
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
  border-bottom: 1px solid var(--line-strong);
}

.grid-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--line);
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
  border-left: 1px solid var(--line-strong);
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
  background: #1B2430;
  color: #fff;
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
  letter-spacing: 0;
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
  border-radius: 3px 3px 0 0;
  box-shadow: none;
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
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 20px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}

.bar-good {
  background: var(--good);
}

.bar-warning {
  background: #E39A1F;
}

.bar-danger {
  background: var(--bad);
}

.bar-regional {
  background: var(--ink);
}

.target-line {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 3;
  border-top: 2px solid var(--ink);
}

.target-line span {
  position: absolute;
  top: -22px;
  left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #FFD60A;
  color: #1B2430;
  font-size: 12px;
  font-weight: 800;
}

.chart-label {
  padding-top: 10px;
  line-height: 1.15;
}

.chart-label strong { display: block; color: var(--ink); font-family: 'Barlow Condensed', sans-serif; font-size: 18px; font-weight: 600; }
.chart-label span { display: block; margin-top: 2px; color: var(--steel); font-size: 12px; }

@media (max-width: 640px) {
  .chart-header { align-items: flex-start; flex-direction: column; gap: 8px; }
  .chart-scroll { padding-right: 12px; padding-left: 12px; }
}

/* Moldura da imagem salva: cores fixas do tema claro */
.export-host { position: fixed; top: 0; left: -100000px; pointer-events: none; }
.xf {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 44px 52px 36px;
  background: #ECEEF1;
  color: #1B2430;
  font-family: 'Barlow', system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
}
.xf * { box-sizing: border-box; }
.xf-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; }
.xf-context { margin: 0; color: #5B6573; font-size: 20px; font-weight: 600; }
.xf-title { margin: 2px 0 0; font-family: 'Barlow Condensed', sans-serif; font-size: 54px; font-weight: 600; line-height: 1; }
.xf-legend { display: flex; gap: 22px; color: #5B6573; font-size: 18px; font-weight: 600; white-space: nowrap; }
.xf-legend span { display: inline-flex; align-items: center; gap: 8px; }
.xf-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }
.xf-good { background: #18864B; }
.xf-warn { background: #E39A1F; }
.xf-bad { background: #C8233A; }
.xf-chart {
  display: grid;
  grid-template-columns: 56px 1fr;
  flex: 1;
  min-height: 0;
  margin-top: 30px;
  padding: 40px 28px 72px 16px;
  border: 1px solid #D9DDE2;
  border-radius: 10px;
  background: #fff;
}
.xf-axis { position: relative; color: #5B6573; font-size: 16px; font-weight: 600; }
.xf-axis span { position: absolute; right: 12px; transform: translateY(50%); }
.xf-plot { position: relative; border-bottom: 1px solid #C3C9D0; }
.xf-grid { position: absolute; left: 0; right: 0; border-top: 1px dashed #D9DDE2; }
.xf-target { position: absolute; left: 0; right: 0; z-index: 3; border-top: 2px solid #1B2430; }
.xf-target span { position: absolute; top: -28px; left: 6px; padding: 2px 9px; border-radius: 3px; background: #FFD60A; color: #1B2430; font-size: 16px; font-weight: 700; }
.xf-bars { position: absolute; inset: 0; display: grid; gap: 14px; }
.xf-col { position: relative; }
.xf-col-regional { margin-left: 10px; padding-left: 16px; border-left: 1px solid #C3C9D0; }
.xf-bar { position: absolute; right: 10%; bottom: 0; left: 10%; min-height: 2px; border-radius: 3px 3px 0 0; }
.xf-col-regional .xf-bar { left: calc(10% + 16px); }
.xf-bar-good { background: #18864B; }
.xf-bar-warning { background: #E39A1F; }
.xf-bar-danger { background: #C8233A; }
.xf-bar-regional { background: #1B2430; }
.xf-value { position: absolute; left: 50%; z-index: 4; transform: translateX(-50%); color: #1B2430; font-family: 'Barlow Condensed', sans-serif; font-size: 24px; font-weight: 600; white-space: nowrap; }
.xf-col-regional .xf-value { left: calc(50% + 8px); }
.xf-label { position: absolute; top: 100%; left: 0; right: 0; padding-top: 10px; text-align: center; line-height: 1.1; }
.xf-col-regional .xf-label { left: 16px; }
.xf-label strong { display: block; color: #1B2430; font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 600; }
.xf-label span { display: block; margin-top: 2px; color: #5B6573; font-size: 14px; }
.xf-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; color: #5B6573; font-size: 16px; font-weight: 500; }
.xf-brand { display: inline-flex; align-items: center; gap: 8px; color: #1B2430; font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 700; }
.xf-tag { position: relative; display: inline-block; width: 22px; height: 15px; border-radius: 2px; background: #FFD60A; }
.xf-tag::after { content: ''; position: absolute; top: 50%; left: 4px; width: 4px; height: 4px; margin-top: -2px; border-radius: 50%; background: #1B2430; }
</style>
