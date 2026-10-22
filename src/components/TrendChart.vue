<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Evolução da pendência (indicador da meta) no período.
// Regional em destaque; cada loja tem cor fixa (a mesma em todo o sistema) e pode ser ligada ou desligada.
const props = defineProps({
  dates: { type: Array, default: () => [] }, // [{ isoDate, label, type }]
  regional: { type: Array, default: () => [] }, // [{ pendingPct } | null]
  stores: { type: Array, default: () => [] }, // [{ code, name, color, points: [{ pendingPct } | null] }]
  valueLabel: { type: String, default: 'Pendência' },
  regionCode: { type: String, default: 'Regional' },
  showTypes: { type: Boolean, default: false },
  meta: { type: Number, default: 3 },
  attention: { type: Number, default: 7 },
})

const TYPE_INITIAL = { Etiqueta: 'E', Presença: 'P', Ruptura: 'R' }
const valueOf = (point) => Number(point?.pendingPct ?? 0)

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
const height = computed(() => (compact.value ? 280 : 360))
const pad = computed(() => ({
  left: 44,
  right: compact.value ? 52 : 92,
  top: 16,
  bottom: props.showTypes ? 46 : 32,
}))
const plotW = computed(() => Math.max(40, width.value - pad.value.left - pad.value.right))
const plotH = computed(() => height.value - pad.value.top - pad.value.bottom)

// ---------- Lojas ligadas (todas por padrão) ----------
const selected = ref(new Set(props.stores.map((series) => series.code)))
const known = new Set(props.stores.map((series) => series.code))

// Loja que aparece depois (filtro mudou) entra ligada; as já conhecidas mantêm a escolha.
watch(() => props.stores.map((series) => series.code), (codes) => {
  const next = new Set(selected.value)
  for (const code of codes) {
    if (!known.has(code)) { known.add(code); next.add(code) }
  }
  selected.value = next
})

const isOn = (code) => selected.value.has(code)
function toggleStore(code) {
  const next = new Set(selected.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  selected.value = next
}
function selectAll() { selected.value = new Set(props.stores.map((series) => series.code)) }
function selectNone() { selected.value = new Set() }

const visibleStores = computed(() => props.stores.filter((series) => isOn(series.code)))
const allOn = computed(() => visibleStores.value.length === props.stores.length)
const hoverCode = ref(null)

// ---------- Escala Y: de 0 até acima do maior valor e da meta ----------
const domain = computed(() => {
  const values = [
    ...props.regional.filter(Boolean).map(valueOf),
    ...visibleStores.value.flatMap((series) => series.points.filter(Boolean).map(valueOf)),
  ]
  const hi = Math.max(props.meta * 1.6, ...(values.length ? values : [0]))
  const step = hi <= 6 ? 1 : hi <= 12 ? 2 : hi <= 30 ? 5 : 10
  return { min: 0, max: Math.ceil((hi * 1.08) / step) * step, step }
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
    path += `${open ? 'L' : 'M'}${xAt(index).toFixed(1)} ${yAt(valueOf(point)).toFixed(1)} `
    open = true
  })
  return path.trim()
}

const pct = (value, digits = 2) => `${Number(value || 0).toFixed(digits).replace('.', ',')}%`
const tick = (value) => `${String(Number(value.toFixed(1))).replace('.', ',')}%`
const lastPoint = (points) => {
  for (let index = points.length - 1; index >= 0; index -= 1) if (points[index]) return { index, point: points[index] }
  return null
}
const firstPoint = (points) => {
  const index = points.findIndex(Boolean)
  return index >= 0 ? { index, point: points[index] } : null
}

const storeLines = computed(() => visibleStores.value.map((series) => ({
  ...series,
  d: pathOf(series.points),
  dim: hoverCode.value !== null && hoverCode.value !== series.code,
})))

const regionalPath = computed(() => pathOf(props.regional))
const showDots = computed(() => props.dates.length <= 24)
const showStoreDots = computed(() => showDots.value && visibleStores.value.length <= 6)

// Rótulos no fim das linhas: regional sempre; lojas só quando poucas (senão viram ruído).
const endLabels = computed(() => {
  const items = []
  const regionalLast = lastPoint(props.regional)
  if (regionalLast) items.push({ key: 'regional', text: props.regionCode, value: pct(valueOf(regionalLast.point), 1), y: yAt(valueOf(regionalLast.point)), color: 'var(--ink)', strong: true })
  if (visibleStores.value.length <= 5) {
    for (const series of visibleStores.value) {
      const last = lastPoint(series.points)
      if (last) items.push({ key: series.code, text: series.code, value: pct(valueOf(last.point), 1), y: yAt(valueOf(last.point)), color: series.color, strong: false })
    }
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

// ---------- Resumo do período (pendência: cair é bom) ----------
const summary = computed(() => {
  const first = firstPoint(props.regional)
  const last = lastPoint(props.regional)
  if (!first || !last) return null
  const delta = valueOf(last.point) - valueOf(first.point)
  const current = valueOf(last.point)
  return {
    from: pct(valueOf(first.point)),
    to: pct(current),
    delta: `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(2).replace('.', ',')} p.p.`,
    tone: delta < -0.005 ? 'text-good' : delta > 0.005 ? 'text-bad' : 'text-steel',
    single: first.index === last.index,
    onTarget: current <= props.meta,
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

const TOOLTIP_W = 220
function tooltipStyle(x) {
  if (x + 12 + TOOLTIP_W <= width.value) return { left: `${x + 12}px` }
  if (x - 12 - TOOLTIP_W >= 0) return { left: `${x - 12 - TOOLTIP_W}px` }
  return { left: `${Math.max(0, Math.min(width.value - TOOLTIP_W, x - TOOLTIP_W / 2))}px` }
}

function toneOf(value) {
  if (value <= props.meta) return 'good'
  if (value <= props.attention) return 'warn'
  return 'bad'
}

const readout = computed(() => {
  const index = activeIndex.value
  if (index === null || !props.dates[index]) return null
  const date = props.dates[index]
  // Pior primeiro: maior pendência no topo.
  const rows = visibleStores.value
    .filter((series) => series.points[index])
    .map((series) => ({ code: series.code, color: series.color, raw: valueOf(series.points[index]) }))
    .sort((a, b) => b.raw - a.raw)
    .map((row) => ({ ...row, value: pct(row.raw), tone: toneOf(row.raw) }))
  const regionalValue = props.regional[index] ? valueOf(props.regional[index]) : null
  return {
    x: xAt(index),
    style: tooltipStyle(xAt(index)),
    title: `${date.label}${props.showTypes && date.type ? `, ${date.type}` : ''}`,
    regional: regionalValue === null ? '—' : pct(regionalValue),
    rows: compact.value ? rows.slice(0, 5) : rows,
    hidden: compact.value ? Math.max(0, rows.length - 5) : 0,
    total: rows.length,
    outOfTarget: rows.filter((row) => row.raw > props.meta).length,
  }
})

const ariaLabel = computed(() => {
  if (!summary.value) return `${props.valueLabel} sem dados no período`
  return `${props.valueLabel} da regional ${props.regionCode} em ${props.dates.length} auditorias, de ${summary.value.from} para ${summary.value.to}. Meta: até ${tick(props.meta)}. Use as setas para ler cada data.`
})
</script>

<template>
  <div class="trend">
    <p v-if="summary" class="mb-3 text-[15px] text-steel">
      <template v-if="summary.single">Regional em <strong class="font-semibold text-ink">{{ summary.to }}</strong> na única auditoria do período.</template>
      <template v-else>
        Regional foi de <strong class="font-semibold text-ink">{{ summary.from }}</strong> para
        <strong class="font-semibold text-ink">{{ summary.to }}</strong>
        <span class="ml-1 font-semibold" :class="summary.tone">({{ summary.delta }})</span>.
      </template>
      {{ summary.onTarget ? 'Dentro da meta.' : 'Acima da meta.' }}
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
        <!-- Área acima da meta, bem leve -->
        <rect :x="pad.left" :y="pad.top" :width="plotW" :height="Math.max(0, yAt(meta) - pad.top)" :style="{ fill: 'var(--bad)' }" fill-opacity="0.04" />

        <!-- Grade e eixo Y -->
        <g>
          <template v-for="value in yTicks" :key="`t-${value}`">
            <line :x1="pad.left" :x2="pad.left + plotW" :y1="yAt(value)" :y2="yAt(value)" :style="{ stroke: value === 0 ? 'var(--line-strong)' : 'var(--line)' }" stroke-width="1" />
            <text :x="pad.left - 8" :y="yAt(value) + 4" text-anchor="end" :style="{ fill: 'var(--steel)' }" font-size="12">{{ tick(value) }}</text>
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

        <!-- Lojas -->
        <g v-for="series in storeLines" :key="`s-${series.code}`" :opacity="series.dim ? 0.12 : 0.8">
          <path :d="series.d" fill="none" :style="{ stroke: series.color }" :stroke-width="hoverCode === series.code ? 2.75 : 1.5" stroke-linecap="round" stroke-linejoin="round" />
          <template v-if="showStoreDots || hoverCode === series.code">
            <circle v-for="(point, index) in series.points" v-show="point" :key="index" :cx="xAt(index)" :cy="point ? yAt(valueOf(point)) : 0" r="2.5" :style="{ fill: series.color, stroke: 'var(--paper)' }" stroke-width="1.5" />
          </template>
        </g>

        <!-- Meta -->
        <line :x1="pad.left" :x2="pad.left + plotW" :y1="yAt(meta)" :y2="yAt(meta)" :style="{ stroke: 'var(--ink)' }" stroke-width="1.5" stroke-dasharray="6 4" />
        <g :transform="`translate(${pad.left + 6}, ${yAt(meta) - 22})`">
          <rect width="70" height="18" rx="3" fill="#FFD60A" />
          <text x="35" y="13" text-anchor="middle" fill="#1B2430" font-size="12" font-weight="700">Meta {{ tick(meta) }}</text>
        </g>

        <!-- Regional, com contorno do fundo para se destacar das lojas -->
        <path :d="regionalPath" fill="none" :style="{ stroke: 'var(--paper)' }" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
        <path :d="regionalPath" fill="none" :style="{ stroke: 'var(--ink)' }" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <template v-if="showDots">
          <circle v-for="(point, index) in regional" v-show="point" :key="`r-${index}`" :cx="xAt(index)" :cy="point ? yAt(valueOf(point)) : 0" :r="activeIndex === index ? 5 : 3.5" :style="{ fill: 'var(--ink)', stroke: 'var(--paper)' }" stroke-width="2" />
        </template>

        <!-- Rótulos no fim das linhas -->
        <g>
          <text v-for="label in endLabels" :key="`l-${label.key}`" :x="pad.left + plotW + 10" :y="label.y + 4" font-size="13" :font-weight="label.strong ? 700 : 600" :style="{ fill: 'var(--ink)' }">
            <tspan :style="{ fill: label.strong ? 'var(--ink)' : label.color }">{{ label.text }}</tspan>
            <tspan v-if="!compact" dx="5" :style="{ fill: 'var(--steel)' }" font-weight="500">{{ label.value }}</tspan>
          </text>
        </g>
      </svg>

      <!-- Leitura da data sob o cursor -->
      <div
        v-if="readout"
        class="pointer-events-none absolute top-2 z-10 w-[220px] max-w-full rounded-md bg-ink px-3 py-2.5 text-paper shadow-lg"
        :style="readout.style"
      >
        <p class="text-[13px] font-semibold opacity-80">{{ readout.title }}</p>
        <p class="mt-1 flex items-baseline justify-between gap-3">
          <span class="text-[13px] opacity-80">Regional</span>
          <span class="font-display text-[22px] font-semibold leading-none">{{ readout.regional }}</span>
        </p>
        <template v-if="readout.rows.length">
          <p class="mt-1 text-[12px] opacity-80">
            {{ readout.outOfTarget }} de {{ readout.total }} {{ readout.total === 1 ? 'loja' : 'lojas' }} acima da meta
          </p>
          <div class="mt-1.5 space-y-0.5 border-t border-paper/20 pt-1.5">
            <p v-for="row in readout.rows" :key="row.code" class="flex items-center justify-between gap-3 text-[13px] leading-[18px]">
              <span class="flex items-center gap-1.5"><i class="inline-block h-[3px] w-3 rounded-full" :style="{ background: row.color }"></i>{{ row.code }}</span>
              <span class="font-semibold" :class="{ 'opacity-70': row.tone === 'good' }">{{ row.value }}</span>
            </p>
            <p v-if="readout.hidden" class="text-[12px] opacity-70">e mais {{ readout.hidden }} {{ readout.hidden === 1 ? 'loja' : 'lojas' }}</p>
          </div>
        </template>
      </div>
    </div>

    <!-- Legenda que também liga e desliga as lojas -->
    <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
        <i class="inline-block h-[3px] w-4 rounded-full bg-ink" aria-hidden="true"></i>{{ regionCode }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-[14px] text-steel">
        <i class="inline-block w-4 border-t-[1.5px] border-dashed border-ink" aria-hidden="true"></i>Meta
      </span>
      <span class="mx-1 hidden h-4 w-px bg-line sm:inline-block" aria-hidden="true"></span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Lojas no gráfico">
        <button
          v-for="series in stores"
          :key="`b-${series.code}`"
          type="button"
          class="inline-flex min-h-[30px] items-center gap-1.5 rounded-[4px] border px-2 font-display text-[15px] font-semibold transition-colors"
          :class="isOn(series.code) ? 'border-line-strong text-ink hover:border-ink' : 'border-dashed border-line-strong text-steel hover:text-ink'"
          :aria-pressed="isOn(series.code)"
          :title="series.name || `Loja ${series.code}`"
          @click="toggleStore(series.code)"
          @pointerenter="hoverCode = isOn(series.code) ? series.code : null"
          @pointerleave="hoverCode = null"
          @focus="hoverCode = isOn(series.code) ? series.code : null"
          @blur="hoverCode = null"
        >
          <i class="inline-block h-[3px] w-3 rounded-full" :style="{ background: isOn(series.code) ? series.color : 'var(--line-strong)' }" aria-hidden="true"></i>
          {{ series.code }}
        </button>
      </div>
      <span class="flex gap-3 text-[14px] font-semibold" data-export-control>
        <button v-if="!allOn" type="button" class="text-ink underline-offset-4 hover:underline" @click="selectAll">Mostrar todas</button>
        <button v-if="visibleStores.length" type="button" class="text-steel underline-offset-4 hover:text-ink hover:underline" @click="selectNone">Só a regional</button>
      </span>
    </div>
    <p class="mt-1.5 text-[13px] text-steel" data-export-control>Toque numa loja para ligar ou desligar a linha dela. Passe o cursor numa loja para destacá-la, ou no gráfico para ler cada data.</p>
  </div>
</template>
