<script setup>
import { computed } from 'vue'
import { META_THRESHOLD } from '../lib/reportData'

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
const meta = META_THRESHOLD

const labels = computed(() => props.report.labels)
const totals = computed(() => props.report.totals)
const metrics = computed(() => props.report.previous.metrics)

function fmt(value, format) {
  if (format === 'pct') return `${Number(value || 0).toFixed(2)}%`
  return Number(value || 0).toLocaleString('pt-BR')
}

function deltaText(metric) {
  if (!metric.hasPrevious) return 'sem dados no mês anterior'
  const sign = metric.delta > 0 ? '+' : ''
  const unit = metric.format === 'pct' ? ' p.p.' : ''
  return `${sign}${metric.format === 'pct' ? metric.delta.toFixed(2) : metric.delta.toLocaleString('pt-BR')}${unit} vs mês anterior`
}

function deltaTone(metric) {
  if (!metric.hasPrevious || metric.delta === 0 || metric.better === 'neutral') return 'tone-neutral'
  const improved = metric.better === 'up' ? metric.delta > 0 : metric.delta < 0
  return improved ? 'tone-good' : 'tone-bad'
}

function pendingTone(value) {
  if (value <= meta) return 'tone-good'
  if (value <= 7) return 'tone-warn'
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
const barTicks = computed(() => [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({ ratio, label: `${Number((barScale.value * ratio).toFixed(1))}%` })))
function barClass(row) {
  if (row.isRegional) return 'bar-regional'
  if (row.pendingPct <= meta) return 'bar-good'
  if (row.pendingPct <= 7) return 'bar-warning'
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
const yAt = (value) => PAD.top + plotH - (Math.max(0, Math.min(100, value)) / 100) * plotH

function linePath(points) {
  let path = ''
  let open = false
  points.forEach((point, index) => {
    if (!point) { open = false; return }
    path += `${open ? 'L' : 'M'} ${xAt(index).toFixed(1)} ${yAt(point.readPct).toFixed(1)} `
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
        <p class="eyebrow">{{ regionName }} · Relatório de auditorias</p>
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
              <p class="eyebrow">Indicador principal · parciais por loja</p>
              <h2>{{ labels.chart }}</h2>
            </div>
            <div class="legend">
              <span><i class="dot dot-good"></i>Até 3%</span>
              <span><i class="dot dot-warn"></i>3% a 7%</span>
              <span><i class="dot dot-bad"></i>Acima de 7%</span>
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
              <div class="target-line" :style="{ bottom: `${(meta / barScale) * 100}%` }"><span>Meta {{ meta }}%</span></div>
              <div class="bars" :style="{ gridTemplateColumns: `repeat(${barRows.length}, 1fr)` }">
                <div v-for="row in barRows" :key="row.code" class="bar-col" :class="{ 'bar-col-regional': row.isRegional }">
                  <div class="bar-stage">
                    <span class="bar-value" :style="{ bottom: `calc(${barHeight(row)}% + 6px)` }">{{ row.pendingPct.toFixed(1) }}%</span>
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
                <p class="eyebrow">Evolução</p>
                <h2>{{ labels.read }} ao longo do período</h2>
              </div>
              <div class="legend"><span><i class="dot dot-regional"></i>Regional</span><span class="muted">linhas finas: lojas</span></div>
            </div>
            <p v-if="!dates.length" class="empty">Sem auditorias no período.</p>
            <svg v-else :viewBox="`0 0 ${LW} ${LH}`" class="trend-svg">
              <g v-for="tick in [0, 25, 50, 75, 100]" :key="tick">
                <line :x1="PAD.left" :x2="LW - PAD.right" :y1="yAt(tick)" :y2="yAt(tick)" :stroke="tick === 0 ? '#cbd5e1' : '#e2e8f0'" stroke-width="1" :stroke-dasharray="tick === 0 ? '' : '4 5'" />
                <text :x="PAD.left - 8" :y="yAt(tick) + 4" text-anchor="end" fill="#64748b" font-size="12" font-weight="600">{{ tick }}%</text>
              </g>
              <path v-for="series in storeLines" :key="series.code" :d="series.path" fill="none" :stroke="series.color" stroke-width="1.6" stroke-opacity="0.55" stroke-linecap="round" stroke-linejoin="round" />
              <path :d="regionalPath" fill="none" stroke="#0f172a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
              <g v-for="(point, index) in report.trend.regional" :key="`p-${index}`">
                <template v-if="point">
                  <circle :cx="xAt(index)" :cy="yAt(point.readPct)" r="4.5" fill="#0f172a" stroke="#fff" stroke-width="2" />
                  <text v-if="dates.length <= 16" :x="xAt(index)" :y="yAt(point.readPct) - 10" text-anchor="middle" fill="#0f172a" font-size="12" font-weight="800">{{ point.readPct.toFixed(1) }}%</text>
                </template>
              </g>
              <g v-for="(date, index) in dates" :key="`d-${index}`">
                <text v-if="index % labelStep === 0 || index === dates.length - 1" :x="xAt(index)" :y="LH - PAD.bottom + 18" text-anchor="middle" fill="#334155" font-size="12" font-weight="700">{{ date.label }}</text>
                <text v-if="report.type === 'Geral' && (index % labelStep === 0 || index === dates.length - 1)" :x="xAt(index)" :y="LH - PAD.bottom + 33" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="700">{{ typeInitial(date.type) }}</text>
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
                <p class="eyebrow">Comparativo</p>
                <h2>Mês anterior</h2>
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
                  <td class="num strong" :class="deltaTone(metric)">{{ metric.hasPrevious ? `${metric.delta > 0 ? '+' : ''}${metric.format === 'pct' ? metric.delta.toFixed(2) : metric.delta}` : '—' }}</td>
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
            <p class="eyebrow">Detalhamento</p>
            <h2>Ranking por loja</h2>
          </div>
          <span class="muted small">{{ report.ranking.filter((row) => row.hasData).length }} com auditoria · {{ report.ranking.filter((row) => !row.hasData).length }} sem</span>
        </div>
        <table class="ranking-table">
          <thead>
            <tr>
              <th class="pos">#</th>
              <th class="col-store">Loja</th>
              <th class="num">SKU</th>
              <th class="num">{{ labels.read }}</th>
              <th class="num">{{ labels.pending }}</th>
              <th class="num">{{ labels.accuracy.replace(' (Etiqueta)', '') }}</th>
              <th class="num col-canc">Canc.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in ranking" :key="row.code" :style="{ height: `${rowHeight}px` }" :class="{ 'row-empty': !row.hasData }">
              <td class="pos"><span class="pos-badge" :class="row.hasData && index < 3 ? 'pos-top' : ''">{{ row.hasData ? index + 1 : '—' }}</span></td>
              <td class="store">{{ row.displayName }}</td>
              <template v-if="row.hasData">
                <td class="num">{{ row.totalSku.toLocaleString('pt-BR') }}</td>
                <td class="num">{{ row.readPct.toFixed(2) }}%</td>
                <td class="num strong" :class="pendingTone(row.pendingPct)">{{ row.pendingPct.toFixed(2) }}%</td>
                <td class="num">{{ row.thirdPct.toFixed(2) }}%</td>
              </template>
              <td v-else colspan="4" class="no-audit">Sem auditoria válida no período</td>
              <td class="num"><span class="canc" :class="{ 'canc-on': row.cancellationCount }">{{ row.cancellationCount }}</span></td>
            </tr>
          </tbody>
        </table>
        <p class="footnote">Gerado em {{ generatedAt }} · meta de pendência {{ meta }}%</p>
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
  background: #f1f5f9;
  color: #0f172a;
  font-family: 'Inter', 'Segoe UI', sans-serif;
}
.snapshot * { box-sizing: border-box; }
.eyebrow { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; }
.muted { color: #94a3b8; }
.small { font-size: 13px; font-weight: 600; }
.tone-good { color: #059669; }
.tone-warn { color: #d97706; }
.tone-bad { color: #e11d48; }
.tone-neutral { color: #64748b; }

.snap-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; height: 76px; }
.title-block h1 { margin: 4px 0 0; font-size: 38px; font-weight: 900; letter-spacing: -0.02em; line-height: 1.05; }
.filters { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 1180px; }
.filter-chip { display: flex; flex-direction: column; padding: 7px 14px; border: 1px solid #cbd5e1; border-radius: 14px; background: #fff; }
.filter-chip span { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
.filter-chip strong { font-size: 15px; font-weight: 800; color: #0f172a; white-space: nowrap; }

.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; height: 120px; }
.kpi { display: flex; flex-direction: column; justify-content: center; padding: 0 24px; border: 1px solid #e2e8f0; border-radius: 22px; background: #fff; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05); }
.kpi-alert { border-color: #fecdd3; background: #fff1f2; }
.kpi-label { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; }
.kpi-alert .kpi-label { color: #e11d48; }
.kpi-value { margin: 4px 0 2px; font-size: 44px; font-weight: 900; line-height: 1; letter-spacing: -0.02em; }
.kpi-delta { margin: 0; font-size: 14px; font-weight: 700; }

.body { display: grid; grid-template-columns: 1fr 780px; gap: 18px; flex: 1; min-height: 0; }
.left { display: flex; flex-direction: column; gap: 18px; min-height: 0; }
.bottom-row { display: grid; grid-template-columns: 1fr 380px; gap: 18px; height: 380px; }
.card { display: flex; flex-direction: column; min-height: 0; padding: 18px 22px; border: 1px solid #e2e8f0; border-radius: 22px; background: #fff; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05); }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.card-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 800; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 13px; font-weight: 700; color: #475569; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
.dot-good { background: #10b981; }
.dot-warn { background: #f59e0b; }
.dot-bad { background: #ef4444; }
.dot-regional { background: #0f172a; }
.empty { margin: auto; font-size: 18px; color: #64748b; }

/* Colunas */
.bars-card { flex: 1; }
.bars-layout { display: grid; grid-template-columns: 46px 1fr; flex: 1; min-height: 0; margin-top: 14px; padding-bottom: 46px; }
.y-axis { position: relative; color: #94a3b8; font-size: 12px; font-weight: 700; }
.y-axis span { position: absolute; right: 10px; transform: translateY(50%); }
.plot { position: relative; border-bottom: 1px solid #cbd5e1; }
.grid-line { position: absolute; left: 0; right: 0; border-top: 1px dashed #e2e8f0; }
.target-line { position: absolute; left: 0; right: 0; z-index: 3; border-top: 2px dashed #059669; }
.target-line span { position: absolute; top: -22px; left: 6px; padding: 1px 8px; border-radius: 999px; background: #ecfdf5; color: #047857; font-size: 12px; font-weight: 800; }
.bars { position: absolute; inset: 0; display: grid; gap: 10px; }
.bar-col { position: relative; display: flex; flex-direction: column; }
.bar-col-regional { margin-left: 6px; padding-left: 12px; border-left: 1px solid #cbd5e1; }
.bar-stage { position: relative; flex: 1; }
.bar-fill { position: absolute; right: 14%; bottom: 0; left: 14%; min-height: 2px; border-radius: 8px 8px 2px 2px; }
.bar-value { position: absolute; left: 50%; z-index: 4; transform: translateX(-50%); font-size: 17px; font-weight: 800; color: #334155; white-space: nowrap; }
.bar-good { background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%); }
.bar-warning { background: linear-gradient(180deg, #f59e0b 0%, #f97316 100%); }
.bar-danger { background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%); }
.bar-regional { background: linear-gradient(180deg, #334155 0%, #0f172a 100%); }
.bar-label { position: absolute; top: 100%; left: 0; right: 0; padding-top: 8px; text-align: center; line-height: 1.1; }
.bar-label strong { display: block; font-size: 15px; }
.bar-label span { display: block; margin-top: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; }

/* Evolução */
.trend-svg { width: 100%; flex: 1; min-height: 0; margin-top: 6px; }
.store-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; font-weight: 700; color: #475569; }
.store-legend span { display: inline-flex; align-items: center; gap: 5px; }
.store-legend .dot { width: 8px; height: 8px; }

/* Comparativo */
.compare-range { margin: 4px 0 8px; font-size: 13px; font-weight: 600; color: #64748b; }
.compare-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.compare-table th { padding: 6px 4px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-align: right; text-transform: uppercase; color: #64748b; }
.compare-table th:first-child { text-align: left; }
.compare-table td { padding: 9px 4px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #334155; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.strong { font-weight: 800 !important; }

/* Ranking */
.ranking-table { width: 100%; margin-top: 12px; border-collapse: collapse; table-layout: fixed; font-size: 15px; }
.ranking-table th { padding: 8px 6px; border-bottom: 2px solid #e2e8f0; background: #f8fafc; font-size: 10px; font-weight: 800; letter-spacing: 0.04em; line-height: 1.2; text-align: left; text-transform: uppercase; color: #64748b; }
.ranking-table th.num { text-align: right; }
.ranking-table td { padding: 0 6px; border-bottom: 1px solid #f1f5f9; color: #334155; }
.ranking-table .store { overflow: hidden; font-weight: 800; color: #0f172a; text-overflow: ellipsis; white-space: nowrap; }
.pos { width: 44px; }
.col-store { width: 250px; }
.col-canc { width: 64px; }
.pos-badge { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 9px; background: #f1f5f9; font-size: 13px; font-weight: 800; color: #64748b; }
.pos-top { background: #0ea5e9; color: #fff; }
.row-empty { background: #f8fafc; }
.row-empty .store { color: #64748b; }
.no-audit { font-size: 13px; font-style: italic; font-weight: 600; text-align: center; color: #94a3b8; }
.canc { display: inline-block; min-width: 28px; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; font-size: 13px; font-weight: 800; text-align: center; color: #64748b; }
.canc-on { background: #ffe4e6; color: #be123c; }
.footnote { margin: auto 0 0; padding-top: 8px; font-size: 12px; font-weight: 600; color: #94a3b8; }
</style>
