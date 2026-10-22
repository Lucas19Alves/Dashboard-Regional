<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

// Evolução no período: regional em destaque, lojas em cinza como contexto,
// e até 3 lojas destacadas em cor pelo usuário.
const props = defineProps({
  dates: { type: Array, default: () => [] }, // [{ isoDate, label, type }]
  regional: { type: Array, default: () => [] }, // [{ readPct } | null]
  stores: { type: Array, default: () => [] }, // [{ code, name, points: [{ readPct } | null] }]
  valueLabel: { type: String, default: 'Leitura' },
  regionCode: { type: String, default: 'Regional' },
  showTypes: { type: Boolean, default: false },
})

const HIGHLIGHT_SLOTS = 3
const TYPE_INITIAL = { Etiqueta: 'E', Presença: 'P', Ruptura: 'R' }

// ---------- Tamanho real (SVG sem esticar, texto sempre no mesmo tamanho) ----------
const wrapper = ref(null)
const width = ref(800)
let observer = null

onMounted(() => {
  if (!wrapper.value) return
  width.value = wrapper.value.clientWidth || 800
  observer = new ResizeObserver(([entry]) => { width.value = Math.max(280, Math.round(entry.contentRect.width)) })
  observer.observe(wrapper.value)
})
onBeforeUnmount(() => observer?.disconnect())

const compact = computed(() => width.value < 640)
const height = computed(() => (compact.value ? 260 : 340))
const pad = computed(() => ({
  left: 44,
  right: compact.value ? 58 : 92,
  top: 16,
  bottom: props.showTypes ? 46 : 32,
}))
const plotW = computed(() => Math.max(40, width.value - pad.value.left - pad.value.right))
const plotH = computed(() => height.value - pad.value.top - pad.value.bottom)

// ---------- Escala Y ajustada aos dados ----------
const allValues = computed(() => [
  ...props.regional.filter(Boolean).map((point) => point.readPct),
  ...props.stores.flatMap((series) => series.points.filter(Boolean).map((point) => point.readPct)),
])

const domain = computed(() => {
  const values = allValues.value
  if (!values.length) return { min: 0, max: 100, step: 25 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(hi - lo, 4)
  const step = span <= 8 ? 2 : span <= 20 ? 5 : span <= 50 ? 10 : 25
  let min = Math.max(0, Math.floor((lo - span * 0.08) / step) * step)
  let max = Math.min(100, Math.ceil((hi + span * 0.08) / step) * step)
  if (max - min < step * 2) min = Math.max(0, max - step * 2)
  if (max <= min) max = min + step
  return { min, max, step }
})

const yTicks = computed(() => {
  const { min, max, step } = domain.value
  const ticks = []
  for (let value = min; value <= max + 0.001; value += step) ticks.push(Number(value.toFixed(2)))
  return ticks
})

const xAt = (index) => {
  const count = props.dates.length
  if (count <= 1) return pad.value.left + plotW.value / 2
  return pad.value.left + (index * plotW.value) / (count - 1)
}
const yAt = (value) => {
  const { min, max } = domain.value
  return pad.value.top + plotH.value - ((Math.min(Math.max(value, min), max) - min) / (max - min)) * plotH.value
}

function pathOf(points) {
  let path = ''
  let open = false
  points.forEach((point, index) => {
    if (!point) { open = false; return }
    path += `${open ? 'L' : 'M'}${xAt(index).toFixed(1)} ${yAt(point.readPct).toFixed(1)} `
    open = true
  })
  return path.trim()
}

const pct = (value, digits = 2) => `${Number(value || 0).toFixed(digits).replace('.', ',')}%`
const lastPoint = (points) => {
  for (let index = points.length - 1; index >= 0; index -= 1) if (points[index]) return { index, point: points[index] }
  return null
}
const firstPoint = (points) => {
  const index = points.findIndex(Boolean)
  return index >= 0 ? { index, point: points[index] } : null
}

// ---------- Destaque de lojas (a cor segue a loja, não a ordem) ----------
const slots = reactive({}) // code -> 1..3
const previewCode = ref(null)
const selectionFull = computed(() => Object.keys(slots).length >= HIGHLIGHT_SLOTS)

function toggleStore(code) {
  if (slots[code]) {
    delete slots[code]
    return
  }
  const used = new Set(Object.values(slots))
  const free = [1, 2, 3].find((slot) => !used.has(slot))
  if (free) slots[code] = free
}

function clearHighlights() {
  Object.keys(slots).forEach((code) => delete slots[code])
}

const contextLines = computed(() => props.stores
  .filter((series) => !slots[series.code] && series.code !== previewCode.value)
  .map((series) => ({ code: series.code, d: pathOf(series.points) })))

const highlighted = computed(() => props.stores
  .filter((series) => slots[series.code] || series.code === previewCode.value)
  .map((series) => ({
    ...series,
    color: slots[series.code] ? `var(--hl-${slots[series.code]})` : 'var(--steel)',
    isPreview: !slots[series.code],
    d: pathOf(series.points),
  })))

const regionalPath = computed(() => pathOf(props.regional))
const showDots = computed(() => props.dates.length <= 24)

// Rótulos no fim das linhas, afastados para não encostar.
const endLabels = computed(() => {
  const items = []
  const regionalLast = lastPoint(props.regional)
  if (regionalLast) items.push({ key: 'regional', text: props.regionCode, value: pct(regionalLast.point.readPct, 1), y: yAt(regionalLast.point.readPct), x: xAt(regionalLast.index), color: 'var(--ink)', strong: true })
  for (const series of highlighted.value) {
    if (series.isPreview) continue
    const last = lastPoint(series.points)
    if (last) items.push({ key: series.code, text: series.code, value: pct(last.point.readPct, 1), y: yAt(last.point.readPct), x: xAt(last.index), color: series.color, strong: false })
  }
  const gap = 15
  items.sort((a, b) => a.y - b.y)
  for (let index = 1; index < items.length; index += 1) {
    if (items[index].y - items[index - 1].y < gap) items[index].y = items[index - 1].y + gap
  }
  const overflow = items.length ? items[items.length - 1].y - (pad.value.top + plotH.value + 4) : 0
  if (overflow > 0) items.forEach((item) => { item.y -= overflow })
  return items
})

// ---------- Rótulos do eixo X sem sobrepor ----------
const labelEvery = computed(() => Math.max(1, Math.ceil(props.dates.length / Math.max(1, Math.floor(plotW.value / 52)))))
function showDateLabel(index) {
  const last = props.dates.length - 1
  if (index === last || index === 0) return true
  if (last - index < labelEvery.value) return false
  return index % labelEvery.value === 0
}

// ---------- Resumo do período ----------
const summary = computed(() => {
  const first = firstPoint(props.regional)
  const last = lastPoint(props.regional)
  if (!first || !last) return null
  const delta = last.point.readPct - first.point.readPct
  return {
    from: pct(first.point.readPct),
    to: pct(last.point.readPct),
    delta: `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(2).replace('.', ',')} p.p.`,
    tone: delta > 0.005 ? 'text-good' : delta < -0.005 ? 'text-bad' : 'text-steel',
    single: first.index === last.index,
  }
})

// ---------- Cursor e leitura por data ----------
const activeIndex = ref(null)
const svgRef = ref(null)

function indexFromEvent(event) {
  const bounds = svgRef.value.getBoundingClientRect()
  const x = event.clientX - bounds.left
  const count = props.dates.length
  if (count <= 1) return 0
  const raw = Math.round(((x - pad.value.left) / plotW.value) * (count - 1))
  return Math.min(count - 1, Math.max(0, raw))
}

function onPointerMove(event) {
  if (!props.dates.length) return
  activeIndex.value = indexFromEvent(event)
}

function onKey(event) {
  const count = props.dates.length
  if (!count) return
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    const current = activeIndex.value ?? (step > 0 ? -1 : count)
    activeIndex.value = Math.min(count - 1, Math.max(0, current + step))
  } else if (event.key === 'Escape') {
    activeIndex.value = null
  }
}

const readout = computed(() => {
  const index = activeIndex.value
  if (index === null || !props.dates[index]) return null
  const date = props.dates[index]
  const storeValues = props.stores
    .map((series) => ({ code: series.code, value: series.points[index]?.readPct }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value)
  const chosen = highlighted.value
    .filter((series) => !series.isPreview && series.points[index])
    .map((series) => ({ code: series.code, color: series.color, value: pct(series.points[index].readPct) }))
  const x = xAt(index)
  return {
    x,
    style: tooltipStyle(x),
    title: `${date.label}${props.showTypes && date.type ? `, ${date.type}` : ''}`,
    regional: props.regional[index] ? pct(props.regional[index].readPct) : '—',
    chosen,
    best: storeValues[0] ? { code: storeValues[0].code, value: pct(storeValues[0].value) } : null,
    worst: storeValues.length > 1 ? { code: storeValues[storeValues.length - 1].code, value: pct(storeValues[storeValues.length - 1].value) } : null,
    count: storeValues.length,
  }
})

// Leitura ao lado do cursor, sem sair do gráfico.
const TOOLTIP_W = 210
function tooltipStyle(x) {
  if (x + 12 + TOOLTIP_W <= width.value) return { left: `${x + 12}px` }
  if (x - 12 - TOOLTIP_W >= 0) return { left: `${x - 12 - TOOLTIP_W}px` }
  return { left: `${Math.max(0, Math.min(width.value - TOOLTIP_W, x - TOOLTIP_W / 2))}px`, top: `${height.value - 8}px`, transform: 'translateY(-100%)' }
}

const ariaLabel = computed(() => {
  if (!summary.value) return `${props.valueLabel} sem dados no período`
  return `${props.valueLabel} da regional ${props.regionCode} em ${props.dates.length} auditorias, de ${summary.value.from} para ${summary.value.to}. Use as setas para ler cada data.`
})
</script>

<template>
  <div class="trend">
    <p v-if="summary" class="mb-3 text-[15px] text-steel">
      <template v-if="summary.single">Regional em {{ summary.to }} na única auditoria do período.</template>
      <template v-else>
        Regional foi de <strong class="font-semibold text-ink">{{ summary.from }}</strong> para
        <strong class="font-semibold text-ink">{{ summary.to }}</strong>
        <span class="ml-1 font-semibold" :class="summary.tone">({{ summary.delta }})</span>
      </template>
    </p>

    <div ref="wrapper" class="relative">
      <svg
        ref="svgRef"
        :width="width"
        :height="height"
        :viewBox="`0 0 ${width} ${height}`"
        class="block touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-ink"
        role="img"
        tabindex="0"
        :aria-label="ariaLabel"
        @pointermove="onPointerMove"
        @pointerdown="onPointerMove"
        @pointerleave="activeIndex = null"
        @keydown="onKey"
        @blur="activeIndex = null"
      >
        <!-- Grade e eixo Y -->
        <g>
          <template v-for="tick in yTicks" :key="`t-${tick}`">
            <line :x1="pad.left" :x2="pad.left + plotW" :y1="yAt(tick)" :y2="yAt(tick)" :style="{ stroke: tick === domain.min ? 'var(--line-strong)' : 'var(--line)' }" stroke-width="1" />
            <text :x="pad.left - 8" :y="yAt(tick) + 4" text-anchor="end" :style="{ fill: 'var(--steel)' }" font-size="12">{{ pct(tick, 0) }}</text>
          </template>
        </g>

        <!-- Eixo X -->
        <g>
          <template v-for="(date, index) in dates" :key="`d-${index}`">
            <text v-if="showDateLabel(index)" :x="xAt(index)" :y="pad.top + plotH + 20" text-anchor="middle" :style="{ fill: 'var(--steel)' }" font-size="12" font-weight="600">{{ date.label }}</text>
            <text v-if="showTypes && showDateLabel(index)" :x="xAt(index)" :y="pad.top + plotH + 36" text-anchor="middle" :style="{ fill: 'var(--steel)' }" font-size="11" opacity="0.8">{{ TYPE_INITIAL[date.type] || '' }}</text>
          </template>
        </g>

        <!-- Cursor -->
        <line v-if="readout" :x1="readout.x" :x2="readout.x" :y1="pad.top" :y2="pad.top + plotH" :style="{ stroke: 'var(--steel)' }" stroke-width="1" stroke-dasharray="3 4" />

        <!-- Lojas como contexto -->
        <g fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path v-for="line in contextLines" :key="`c-${line.code}`" :d="line.d" :style="{ stroke: 'var(--steel)' }" stroke-width="1.25" stroke-opacity="0.28" />
        </g>

        <!-- Lojas destacadas -->
        <g v-for="series in highlighted" :key="`h-${series.code}`">
          <path :d="series.d" fill="none" :style="{ stroke: series.color }" :stroke-width="series.isPreview ? 1.75 : 2" :stroke-dasharray="series.isPreview ? '4 3' : null" stroke-linecap="round" stroke-linejoin="round" />
          <template v-if="showDots && !series.isPreview">
            <circle v-for="(point, index) in series.points" v-show="point" :key="index" :cx="xAt(index)" :cy="point ? yAt(point.readPct) : 0" r="3" :style="{ fill: series.color, stroke: 'var(--paper)' }" stroke-width="2" />
          </template>
        </g>

        <!-- Regional -->
        <path :d="regionalPath" fill="none" :style="{ stroke: 'var(--ink)' }" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" />
        <template v-if="showDots">
          <circle v-for="(point, index) in regional" v-show="point" :key="`r-${index}`" :cx="xAt(index)" :cy="point ? yAt(point.readPct) : 0" :r="activeIndex === index ? 5 : 3.5" :style="{ fill: 'var(--ink)', stroke: 'var(--paper)' }" stroke-width="2" />
        </template>

        <!-- Rótulos no fim das linhas -->
        <g>
          <text v-for="label in endLabels" :key="`l-${label.key}`" :x="pad.left + plotW + 10" :y="label.y + 4" font-size="13" :font-weight="label.strong ? 700 : 600" :style="{ fill: 'var(--ink)' }">
            <tspan :style="{ fill: label.color }">{{ label.text }}</tspan>
            <tspan v-if="!compact" dx="5" :style="{ fill: 'var(--steel)' }" font-weight="500">{{ label.value }}</tspan>
          </text>
        </g>
      </svg>

      <!-- Leitura da data sob o cursor -->
      <div
        v-if="readout"
        class="pointer-events-none absolute top-2 z-10 w-[210px] max-w-full rounded-md bg-ink px-3 py-2.5 text-paper shadow-lg"
        :style="readout.style"
      >
        <p class="text-[13px] font-semibold opacity-80">{{ readout.title }}</p>
        <p class="mt-1 flex items-baseline justify-between gap-3">
          <span class="text-[13px] opacity-80">Regional</span>
          <span class="font-display text-[22px] font-semibold leading-none">{{ readout.regional }}</span>
        </p>
        <p v-for="item in readout.chosen" :key="item.code" class="mt-1 flex items-center justify-between gap-3 text-[13px]">
          <span class="flex items-center gap-1.5"><i class="inline-block h-[3px] w-3 rounded-full" :style="{ background: item.color }"></i>Loja {{ item.code }}</span>
          <span class="font-semibold">{{ item.value }}</span>
        </p>
        <div v-if="readout.best" class="mt-2 border-t border-paper/20 pt-1.5 text-[12px] opacity-80">
          <p class="flex justify-between gap-3"><span>Maior: {{ readout.best.code }}</span><span>{{ readout.best.value }}</span></p>
          <p v-if="readout.worst" class="flex justify-between gap-3"><span>Menor: {{ readout.worst.code }}</span><span>{{ readout.worst.value }}</span></p>
        </div>
      </div>
    </div>

    <!-- Legenda que também escolhe as lojas destacadas -->
    <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
        <i class="inline-block h-[3px] w-4 rounded-full bg-ink" aria-hidden="true"></i>{{ regionCode }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-[14px] text-steel">
        <i class="inline-block h-[2px] w-4 rounded-full bg-steel/40" aria-hidden="true"></i>Lojas
      </span>
      <span class="mx-1 hidden h-4 w-px bg-line sm:inline-block" aria-hidden="true"></span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Destacar lojas no gráfico">
        <button
          v-for="series in stores"
          :key="`b-${series.code}`"
          type="button"
          class="inline-flex min-h-[30px] items-center gap-1.5 rounded-[4px] border px-2 font-display text-[15px] font-semibold transition-colors"
          :class="slots[series.code] ? 'border-ink text-ink' : 'border-line-strong text-steel hover:border-ink hover:text-ink'"
          :aria-pressed="Boolean(slots[series.code])"
          :disabled="!slots[series.code] && selectionFull"
          :title="!slots[series.code] && selectionFull ? 'Até 3 lojas destacadas. Desmarque uma para trocar.' : series.name || `Loja ${series.code}`"
          @click="toggleStore(series.code)"
          @pointerenter="previewCode = slots[series.code] || selectionFull ? null : series.code"
          @pointerleave="previewCode = null"
          @focus="previewCode = slots[series.code] || selectionFull ? null : series.code"
          @blur="previewCode = null"
        >
          <i v-if="slots[series.code]" class="inline-block h-[3px] w-3 rounded-full" :style="{ background: `var(--hl-${slots[series.code]})` }" aria-hidden="true"></i>
          {{ series.code }}
        </button>
      </div>
      <button v-if="Object.keys(slots).length" type="button" class="text-[14px] font-semibold text-steel underline-offset-4 hover:text-ink hover:underline" @click="clearHighlights">
        Limpar destaque
      </button>
    </div>
    <p class="mt-1.5 text-[13px] text-steel" data-export-control>Toque numa loja para destacar a linha dela (até 3). Passe o cursor ou use as setas para ler cada data.</p>
  </div>
</template>
