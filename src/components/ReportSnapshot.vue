<script setup>
import { computed } from 'vue'
import { formatLimit, getAttention, settings } from '../lib/settings'

// Painel 1920×1080 (16:9) usado só para exportar a imagem em alta resolução.
const props = defineProps({
  report: { type: Object, required: true },
  regionName: { type: String, default: '' },
  regionCode: { type: String, default: '' },
  filters: { type: Array, default: () => [] }, // [{ label, value }]
  generatedAt: { type: String, default: '' },
})

const WIDTH = 1920
const HEIGHT = 1080
const meta = settings.meta
const attention = getAttention()

const labels = computed(() => props.report.labels)
const totals = computed(() => props.report.totals)
const metrics = computed(() => props.report.previous.metrics)

function fmt(value, format) {
  if (format === 'pct') return `${Number(value || 0).toFixed(2).replace('.', ',')}%`
  return Number(value || 0).toLocaleString('pt-BR')
}

function deltaText(metric) {
  if (!metric.hasPrevious) return 'sem dados no mês anterior'
  const sign = metric.delta > 0 ? '+' : ''
  const unit = metric.format === 'pct' ? ' p.p.' : ''
  return `${sign}${metric.format === 'pct' ? metric.delta.toFixed(2).replace('.', ',') : metric.delta.toLocaleString('pt-BR')}${unit} vs mês anterior`
}

function deltaTone(metric) {
  if (!metric.hasPrevious || metric.delta === 0 || metric.better === 'neutral') return 'tone-neutral'
  const improved = metric.better === 'up' ? metric.delta > 0 : metric.delta < 0
  return improved ? 'tone-good' : 'tone-bad'
}

function pendingTone(value) {
  if (value <= meta) return 'tone-good'
  if (value <= attention) return 'tone-warn'
  return 'tone-bad'
}

// ---------- Colunas: pendência por loja e regional ----------
const barRows = computed(() => {
  const rows = [...props.report.chartRows]
    .sort((a, b) => b.pendingPct - a.pendingPct)
    .map((row) => ({ code: row.code, pendingPct: Number(row.pendingPct || 0), isRegional: false }))
  if (rows.length) rows.push({ code: 'Regional', pendingPct: Number(totals.value.pendingPct || 0), isRegional: true })
  return rows
})
const barScale = computed(() => {
  const highest = Math.max(meta, ...barRows.value.map((row) => row.pendingPct))
  return Math.max(10, Math.ceil((highest * 1.12) / 5) * 5)
})
const barTicks = computed(() => [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({ ratio, label: `${String(Number((barScale.value * ratio).toFixed(1))).replace('.', ',')}%` })))
function barClass(row) {
  if (row.isRegional) return 'bar-regional'
  if (row.pendingPct <= meta) return 'bar-good'
  if (row.pendingPct <= attention) return 'bar-warning'
  return 'bar-danger'
}
const barHeight = (row) => Math.min((Math.max(row.pendingPct, 0) / barScale.value) * 100, 100)

// ---------- Linhas: evolução no período ----------
const LW = 760
const LH = 300
const PAD = { left: 46, right: 24, top: 22, bottom: 44 }
const plotW = LW - PAD.left - PAD.right
const plotH = LH - PAD.top - PAD.bottom
const dates = computed(() => props.report.trend.dates)
const xAt = (index) => PAD.left + (dates.value.length > 1 ? (index * plotW) / (dates.value.length - 1) : plotW / 2)
// Escala da pendência: de 0 até acima do maior valor e da meta.
const trendScale = computed(() => {
  const values = [
    ...props.report.trend.regional.filter(Boolean).map((point) => point.pendingPct),
    ...props.report.trend.stores.flatMap((series) => series.points.filter(Boolean).map((point) => point.pendingPct)),
  ]
  const hi = Math.max(meta * 1.6, ...(values.length ? values : [0]))
  const step = hi <= 6 ? 1 : hi <= 12 ? 2 : hi <= 30 ? 5 : 10
  const max = Math.ceil((hi * 1.08) / step) * step
  const ticks = []
  for (let value = 0; value <= max + 0.001; value += step) ticks.push(Number(value.toFixed(2)))
  return { max, ticks }
})
const yAt = (value) => PAD.top + plotH - (Math.max(0, Math.min(trendScale.value.max, value)) / trendScale.value.max) * plotH
const tickLabel = (value) => `${String(Number(value.toFixed(1))).replace('.', ',')}%`

function linePath(points) {
  let path = ''
  let open = false
  points.forEach((point, index) => {
    if (!point) { open = false; return }
    path += `${open ? 'L' : 'M'} ${xAt(index).toFixed(1)} ${yAt(point.pendingPct).toFixed(1)} `
    open = true
  })
  return path.trim()
}
const regionalPath = computed(() => linePath(props.report.trend.regional))
const storeLines = computed(() => props.report.trend.stores.map((series) => ({ ...series, path: linePath(series.points) })))
const labelStep = computed(() => Math.max(1, Math.ceil(dates.value.length / 14)))
const typeInitial = (type) => ({ Etiqueta: 'E', Presença: 'P', Ruptura: 'R' })[type] || ''

// ---------- Ranking ----------
const ranking = computed(() => props.report.ranking)
const rowHeight = computed(() => Math.max(30, Math.min(46, Math.floor(610 / Math.max(ranking.value.length, 1)))))
</script>

<template>
  <div class="snapshot" :style="{ width: `${WIDTH}px`, height: `${HEIGHT}px` }">
    <!-- Cabeçalho + filtros aplicados -->
    <header class="snap-header">
      <div class="title-block">
        <p class="eyebrow">{{ regionName }}, relatório de auditorias</p>
        <h1>{{ report.type === 'Geral' ? 'Visão geral' : `Auditoria de ${report.type}` }}</h1>
      </div>
      <div class="filters">
        <div v-for="filter in filters" :key="filter.label" class="filter-chip">
          <span>{{ filter.label }}</span>
          <strong>{{ filter.value }}</strong>
        </div>
      </div>
    </header>

    <!-- Cards do topo -->
    <section class="kpis">
      <div v-for="metric in metrics" :key="metric.key" class="kpi" :class="{ 'kpi-alert': metric.key === 'cancellations' }">
        <p class="kpi-label">{{ metric.label }}</p>
        <p class="kpi-value" :class="metric.key === 'pendingPct' ? pendingTone(metric.current) : metric.key === 'cancellations' ? 'tone-bad' : ''">{{ fmt(metric.current, metric.format) }}</p>
        <p class="kpi-delta" :class="deltaTone(metric)">{{ deltaText(metric) }}</p>
      </div>
    </section>

    <div class="body">
      <div class="left">
        <!-- Pendência por loja e regional -->
        <section class="card bars-card">
          <div class="card-head">
            <div>
              <h2>{{ labels.chart }}</h2>
            </div>
            <div class="legend">
              <span><i class="dot dot-good"></i>Até {{ formatLimit(meta) }}%</span>
              <span><i class="dot dot-warn"></i>{{ formatLimit(meta) }}% a {{ formatLimit(attention) }}%</span>
              <span><i class="dot dot-bad"></i>Acima de {{ formatLimit(attention) }}%</span>
              <span class="muted">Escala: {{ barScale }}%</span>
            </div>
          </div>
          <p v-if="!barRows.length" class="empty">Sem dados para os filtros aplicados.</p>
          <div v-else class="bars-layout">
            <div class="y-axis">
              <span v-for="tick in barTicks" :key="tick.ratio" :style="{ bottom: `${tick.ratio * 100}%` }">{{ tick.label }}</span>
            </div>
            <div class="plot">
              <div v-for="tick in barTicks" :key="`g-${tick.ratio}`" class="grid-line" :style="{ bottom: `${tick.ratio * 100}%` }" />
              <div class="target-line" :style="{ bottom: `${(meta / barScale) * 100}%` }"><span>Meta {{ formatLimit(meta) }}%</span></div>
              <div class="bars" :style="{ gridTemplateColumns: `repeat(${barRows.length}, 1fr)` }">
                <div v-for="row in barRows" :key="row.code" class="bar-col" :class="{ 'bar-col-regional': row.isRegional }">
                  <div class="bar-stage">
                    <span class="bar-value" :style="{ bottom: `calc(${barHeight(row)}% + 6px)` }">{{ row.pendingPct.toFixed(1).replace('.', ',') }}%</span>
                    <div class="bar-fill" :class="barClass(row)" :style="{ height: `${barHeight(row)}%` }" />
                  </div>
                  <div class="bar-label">
                    <strong>{{ row.isRegional ? 'Regional' : row.code }}</strong>
                    <span>{{ row.isRegional ? regionCode : 'Loja' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="bottom-row">
          <!-- Evolução no período -->
          <section class="card trend-card">
            <div class="card-head">
              <div>
                <h2>{{ labels.pending }} ao longo do período</h2>
              </div>
              <div class="legend"><span><i class="dot dot-regional"></i>Regional</span><span class="muted">tracejado: meta {{ formatLimit(meta) }}%</span></div>
            </div>
            <p v-if="!dates.length" class="empty">Sem auditorias no período.</p>
            <svg v-else :viewBox="`0 0 ${LW} ${LH}`" class="trend-svg">
              <rect :x="PAD.left" :y="PAD.top" :width="plotW" :height="Math.max(0, yAt(meta) - PAD.top)" fill="#C8233A" fill-opacity="0.04" />
              <g v-for="tick in trendScale.ticks" :key="tick">
                <line :x1="PAD.left" :x2="LW - PAD.right" :y1="yAt(tick)" :y2="yAt(tick)" :stroke="tick === 0 ? '#C3C9D0' : '#D9DDE2'" stroke-width="1" :stroke-dasharray="tick === 0 ? '' : '4 5'" />
                <text :x="PAD.left - 8" :y="yAt(tick) + 4" text-anchor="end" fill="#5B6573" font-size="12" font-weight="600">{{ tickLabel(tick) }}</text>
              </g>
              <path v-for="series in storeLines" :key="series.code" :d="series.path" fill="none" :stroke="series.color" stroke-width="1.6" stroke-opacity="0.55" stroke-linecap="round" stroke-linejoin="round" />
              <line :x1="PAD.left" :x2="LW - PAD.right" :y1="yAt(meta)" :y2="yAt(meta)" stroke="#1B2430" stroke-width="1.5" stroke-dasharray="6 4" />
              <path :d="regionalPath" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
              <path :d="regionalPath" fill="none" stroke="#1B2430" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
              <g v-for="(point, index) in report.trend.regional" :key="`p-${index}`">
                <template v-if="point">
                  <circle :cx="xAt(index)" :cy="yAt(point.pendingPct)" r="4.5" fill="#1B2430" stroke="#fff" stroke-width="2" />
                  <text v-if="dates.length <= 16" :x="xAt(index)" :y="yAt(point.pendingPct) - 10" text-anchor="middle" fill="#1B2430" font-size="12" font-weight="800">{{ point.pendingPct.toFixed(1).replace('.', ',') }}%</text>
                </template>
              </g>
              <g v-for="(date, index) in dates" :key="`d-${index}`">
                <text v-if="index % labelStep === 0 || index === dates.length - 1" :x="xAt(index)" :y="LH - PAD.bottom + 18" text-anchor="middle" fill="#1B2430" font-size="12" font-weight="700">{{ date.label }}</text>
                <text v-if="report.type === 'Geral' && (index % labelStep === 0 || index === dates.length - 1)" :x="xAt(index)" :y="LH - PAD.bottom + 33" text-anchor="middle" fill="#5B6573" font-size="10" font-weight="700">{{ typeInitial(date.type) }}</text>
              </g>
            </svg>
            <div class="store-legend">
              <span v-for="series in storeLines" :key="series.code"><i class="dot" :style="{ background: series.color }"></i>{{ series.code }}</span>
            </div>
          </section>

          <!-- Comparativo com o mês anterior -->
          <section class="card compare-card">
            <div class="card-head">
              <div>
                <h2>Comparado ao mês anterior</h2>
              </div>
            </div>
            <p class="compare-range">{{ report.previous.rangeLabel }}</p>
            <table class="compare-table">
              <thead>
                <tr><th>Indicador</th><th>Atual</th><th>Anterior</th><th>Var.</th></tr>
              </thead>
              <tbody>
                <tr v-for="metric in metrics" :key="metric.key">
                  <td>{{ metric.label }}</td>
                  <td class="num strong">{{ fmt(metric.current, metric.format) }}</td>
                  <td class="num">{{ metric.hasPrevious ? fmt(metric.previous, metric.format) : '—' }}</td>
                  <td class="num strong" :class="deltaTone(metric)">{{ metric.hasPrevious ? `${metric.delta > 0 ? '+' : ''}${metric.format === 'pct' ? metric.delta.toFixed(2).replace('.', ',') : metric.delta}` : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <!-- Ranking por loja -->
      <section class="card ranking-card">
        <div class="card-head">
          <div>
            <h2>Ranking por loja</h2>
          </div>
          <span class="muted small">{{ report.ranking.filter((row) => row.hasData).length }} com auditoria, {{ report.ranking.filter((row) => !row.hasData).length }} sem</span>
        </div>
        <table class="ranking-table">
          <thead>
            <tr>
              <th class="pos">#</th>
              <th class="col-store">Loja</th>
              <th class="num">{{ labels.pending }}</th>
              <th class="num">SKU</th>
              <th class="num">{{ labels.read }}</th>
              <th class="num">{{ labels.accuracy.replace(' (Etiqueta)', '') }}</th>
              <th class="num col-canc">Canc.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in ranking" :key="row.code" :style="{ height: `${rowHeight}px` }" :class="{ 'row-empty': !row.hasData }">
              <td class="pos"><span class="pos-badge" :class="row.hasData && index < 3 ? 'pos-top' : ''">{{ row.hasData ? index + 1 : '—' }}</span></td>
              <td class="store">{{ row.displayName }}</td>
              <template v-if="row.hasData">
                <td class="num strong" :class="pendingTone(row.pendingPct)">{{ row.pendingPct.toFixed(2).replace('.', ',') }}%</td>
                <td class="num">{{ row.totalSku.toLocaleString('pt-BR') }}</td>
                <td class="num">{{ row.readPct.toFixed(2).replace('.', ',') }}%</td>
                <td class="num">{{ row.thirdPct.toFixed(2).replace('.', ',') }}%</td>
              </template>
              <td v-else colspan="4" class="no-audit">Sem auditoria válida no período</td>
              <td class="num"><span class="canc" :class="{ 'canc-on': row.cancellationCount }">{{ row.cancellationCount }}</span></td>
            </tr>
          </tbody>
        </table>
        <p class="footnote">Gerado em {{ generatedAt }}. Meta: {{ formatLimit(meta) }}%.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.snapshot {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 32px 36px;
  background: #ECEEF1;
  color: #1B2430;
  font-family: 'Barlow', 'Segoe UI', sans-serif;
  font-variant-numeric: tabular-nums;
}
.snapshot * { box-sizing: border-box; }
.eyebrow { margin: 0; font-size: 15px; font-weight: 600; color: #5B6573; }
.muted { color: #5B6573; }
.small { font-size: 13px; font-weight: 600; }
.tone-good { color: #18864B; }
.tone-warn { color: #B86E00; }
.tone-bad { color: #C8233A; }
.tone-neutral { color: #5B6573; }

.snap-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; height: 76px; }
.title-block h1 { margin: 2px 0 0; font-family: 'Barlow Condensed', sans-serif; font-size: 46px; font-weight: 600; line-height: 1; }
.filters { display: flex; flex-wrap: nowrap; justify-content: flex-end; gap: 4px; max-width: 1440px; }
.filter-chip { display: flex; flex-direction: column; padding: 2px 16px 2px 12px; border-left: 1px solid #C3C9D0; }
.filter-chip span { font-size: 12px; font-weight: 500; color: #5B6573; }
.filter-chip strong { font-family: 'Barlow Condensed', sans-serif; font-size: 19px; font-weight: 600; color: #1B2430; white-space: nowrap; }

.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; height: 120px; }
.kpi { display: flex; flex-direction: column; justify-content: center; padding: 0 24px; border: 1px solid #D9DDE2; border-radius: 10px; background: #fff; }
.kpi-alert { box-shadow: inset 4px 0 0 #C8233A; }
.kpi-label { margin: 0; font-size: 15px; font-weight: 500; color: #5B6573; }

.kpi-value { margin: 2px 0 2px; font-family: 'Barlow Condensed', sans-serif; font-size: 50px; font-weight: 600; line-height: 1; }
.kpi-delta { margin: 0; font-size: 14px; font-weight: 600; }

.body { display: grid; grid-template-columns: 1fr 780px; gap: 18px; flex: 1; min-height: 0; }
.left { display: flex; flex-direction: column; gap: 18px; min-height: 0; }
.bottom-row { display: grid; grid-template-columns: 1fr 380px; gap: 18px; height: 380px; }
.card { display: flex; flex-direction: column; min-height: 0; padding: 18px 22px; border: 1px solid #D9DDE2; border-radius: 10px; background: #fff; }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.card-head h2 { margin: 0; font-family: 'Barlow Condensed', sans-serif; font-size: 26px; font-weight: 600; line-height: 1.1; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 13px; font-weight: 700; color: #5B6573; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
.dot-good { background: #18864B; }
.dot-warn { background: #E39A1F; }
.dot-bad { background: #C8233A; }
.dot-regional { background: #1B2430; }
.empty { margin: auto; font-size: 18px; color: #5B6573; }

/* Colunas */
.bars-card { flex: 1; }
.bars-layout { display: grid; grid-template-columns: 46px 1fr; flex: 1; min-height: 0; margin-top: 14px; padding-bottom: 46px; }
.y-axis { position: relative; color: #5B6573; font-size: 12px; font-weight: 700; }
.y-axis span { position: absolute; right: 10px; transform: translateY(50%); }
.plot { position: relative; border-bottom: 1px solid #C3C9D0; }
.grid-line { position: absolute; left: 0; right: 0; border-top: 1px dashed #D9DDE2; }
.target-line { position: absolute; left: 0; right: 0; z-index: 3; border-top: 2px solid #1B2430; }
.target-line span { position: absolute; top: -22px; left: 6px; padding: 1px 8px; border-radius: 3px; background: #FFD60A; color: #1B2430; font-size: 13px; font-weight: 700; }
.bars { position: absolute; inset: 0; display: grid; gap: 10px; }
.bar-col { position: relative; display: flex; flex-direction: column; }
.bar-col-regional { margin-left: 6px; padding-left: 12px; border-left: 1px solid #C3C9D0; }
.bar-stage { position: relative; flex: 1; }
.bar-fill { position: absolute; right: 14%; bottom: 0; left: 14%; min-height: 2px; border-radius: 3px 3px 0 0; }
.bar-value { position: absolute; left: 50%; z-index: 4; transform: translateX(-50%); font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 600; color: #1B2430; white-space: nowrap; }
.bar-good { background: #18864B; }
.bar-warning { background: #E39A1F; }
.bar-danger { background: #C8233A; }
.bar-regional { background: #1B2430; }
.bar-label { position: absolute; top: 100%; left: 0; right: 0; padding-top: 8px; text-align: center; line-height: 1.1; }
.bar-label strong { display: block; font-family: 'Barlow Condensed', sans-serif; font-size: 18px; font-weight: 600; }
.bar-label span { display: block; margin-top: 2px; font-size: 12px; font-weight: 500; color: #5B6573; }

/* Evolução */
.trend-svg { width: 100%; flex: 1; min-height: 0; margin-top: 6px; }
.store-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; font-weight: 700; color: #5B6573; }
.store-legend span { display: inline-flex; align-items: center; gap: 5px; }
.store-legend .dot { width: 8px; height: 8px; }

/* Comparativo */
.compare-range { margin: 4px 0 8px; font-size: 13px; font-weight: 600; color: #5B6573; }
.compare-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.compare-table th { padding: 6px 4px; border-bottom: 1px solid #D9DDE2; font-size: 13px; font-weight: 600; text-align: right; color: #5B6573; }
.compare-table th:first-child { text-align: left; }
.compare-table td { padding: 9px 4px; border-bottom: 1px solid #ECEEF1; font-weight: 600; color: #1B2430; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.strong { font-weight: 800 !important; }

/* Ranking */
.ranking-table { width: 100%; margin-top: 12px; border-collapse: collapse; table-layout: fixed; font-size: 15px; }
.ranking-table th { padding: 8px 6px; border-bottom: 1px solid #C3C9D0; font-size: 13px; font-weight: 600; line-height: 1.2; text-align: left; color: #5B6573; }
.ranking-table th.num { text-align: right; }
.ranking-table td { padding: 0 6px; border-bottom: 1px solid #ECEEF1; color: #1B2430; }
.ranking-table .store { overflow: hidden; font-weight: 800; color: #1B2430; text-overflow: ellipsis; white-space: nowrap; }
.pos { width: 44px; }
.col-store { width: 250px; }
.col-canc { width: 64px; }
.pos-badge { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px; border-radius: 3px; background: #ECEEF1; font-family: 'Barlow Condensed', sans-serif; font-size: 16px; font-weight: 600; color: #5B6573; }
.pos-top { background: #FFD60A; color: #1B2430; }
.row-empty { background: transparent; }
.row-empty .store { color: #5B6573; }
.no-audit { font-size: 13px; font-style: italic; font-weight: 600; text-align: center; color: #5B6573; }
.canc { display: inline-block; min-width: 28px; padding: 2px 8px; border-radius: 3px; background: #ECEEF1; font-size: 13px; font-weight: 700; text-align: center; color: #5B6573; }
.canc-on { background: rgba(200, 35, 58, 0.1); color: #C8233A; }
.footnote { margin: auto 0 0; padding-top: 8px; font-size: 12px; font-weight: 600; color: #5B6573; }
</style>
