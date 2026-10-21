<script setup>
import PageHeader from '../components/PageHeader.vue'
import { computed, onMounted, ref, watch } from 'vue'
import UploadModal from '../components/UploadModal.vue'
import WeekCalendar from '../components/WeekCalendar.vue'
import MetricCard from '../components/MetricCard.vue'
import { getCurrentWeekDays, summarizeStores, normalizeStoreMetrics, buildForecast, filterAllowedStoreRows, parseNumeric, isCancelledStore } from '../lib/metrics'
import { deleteSession, listSessions, upsertSession } from '../lib/database'
import StoreTowerChart from '../components/StoreTowerChart.vue'
import * as XLSX from 'xlsx'
import { useRoute } from 'vue-router'
import { getRegion } from '../lib/regions'

const route = useRoute()
const region = computed(() => getRegion(route.params.region))
const storeCodes = computed(() => region.value.storeCodes)

const sessions = ref([])
const weekCursor = ref(new Date())
const currentWeek = computed(() => getCurrentWeekDays(weekCursor.value))
const isModalOpen = ref(false)
const isStoreCancellationModalOpen = ref(false)
const cancellationDraftCodes = ref([])
const selectedDay = ref(null)
const selectedChartCodes = ref([])

const weekLabel = computed(() => {
  if (!currentWeek.value.length) return 'Semana'
  const start = currentWeek.value[0].date
  const end = currentWeek.value[currentWeek.value.length - 1].date
  const formatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
  return `Semana de ${formatter.format(start)} a ${formatter.format(end)}`
})

const selectedSession = computed(() => {
  if (!selectedDay.value) return null
  return sessions.value.find((session) => session.isoDate === selectedDay.value.iso) || null
})

const activeSession = computed(() => {
  if (selectedSession.value) return selectedSession.value
  const sorted = [...sessions.value].sort((a, b) => new Date(b.uploadedAt || b.createdAt || 0) - new Date(a.uploadedAt || a.createdAt || 0))
  return sorted[0] || null
})

const auditType = computed(() => activeSession.value?.auditType || selectedDay.value?.activity || 'Etiqueta')

const summary = computed(() => {
  const stores = activeSession.value?.stores || []
  return stores.length ? summarizeStores(stores, storeCodes.value) : {
    totalSku: 0, pendingItems: 0, updatedItems: 0, outdatedItems: 0, readPct: 0, pendingPct: 0, accuracyPct: 0,
    presenceItems: 0, ruptureItems: 0, recoveredItems: 0, presencePct: 0, rupturePct: 0, recoveryPct: 0,
  }
})

const operationalCards = computed(() => {
  if (auditType.value === 'Presença') {
    return [
      { label: 'Presença', value: `${summary.value.readPct.toFixed(2)}%`, subtext: 'Itens presentes sobre o SKU', tone: 'blue' },
      { label: 'Ruptura identificada', value: `${summary.value.pendingPct.toFixed(2)}%`, subtext: 'Itens sem presença', tone: summary.value.pendingPct <= 3 ? 'green' : summary.value.pendingPct <= 7 ? 'orange' : 'red' },
      { label: 'Itens presentes', value: summary.value.updatedItems.toLocaleString('pt-BR'), subtext: 'SKU com presença confirmada', tone: 'slate' },
      { label: 'Itens em ruptura', value: summary.value.ruptureItems.toLocaleString('pt-BR'), subtext: 'Base para a auditoria de ruptura', tone: 'slate' },
    ]
  }

  return [
    { label: 'Presença após auditoria', value: `${summary.value.readPct.toFixed(2)}%`, subtext: 'Presença após a verificação', tone: 'blue' },
    { label: 'Ruptura final', value: `${summary.value.rupturePct.toFixed(2)}%`, subtext: 'Ruptura confirmada no fechamento', tone: summary.value.rupturePct <= 3 ? 'green' : summary.value.rupturePct <= 7 ? 'orange' : 'red' },
    { label: 'Recuperação', value: `${summary.value.recoveryPct.toFixed(2)}%`, subtext: 'Redução sobre a ruptura inicial', tone: 'green' },
    { label: 'Itens recuperados', value: summary.value.recoveredItems.toLocaleString('pt-BR'), subtext: 'Diferença entre Presença e Ruptura', tone: 'slate' },
  ]
})

const operationalSummaryTiles = computed(() => auditType.value === 'Presença'
  ? [
      { label: 'SKU total', value: summary.value.totalSku, icon: 'fa-solid fa-boxes-stacked' },
      { label: 'Itens presentes', value: summary.value.updatedItems, icon: 'fa-solid fa-circle-check' },
      { label: 'Ruptura inicial', value: summary.value.presenceItems, icon: 'fa-solid fa-magnifying-glass' },
      { label: 'Ruptura registrada', value: summary.value.ruptureItems, icon: 'fa-solid fa-triangle-exclamation' },
    ]
  : [
      { label: 'SKU total', value: summary.value.totalSku, icon: 'fa-solid fa-boxes-stacked' },
      { label: 'Ruptura da presença', value: summary.value.presenceItems, icon: 'fa-solid fa-clock-rotate-left' },
      { label: 'Ruptura final', value: summary.value.ruptureItems, icon: 'fa-solid fa-triangle-exclamation' },
      { label: 'Itens recuperados', value: summary.value.recoveredItems, icon: 'fa-solid fa-arrow-trend-down' },
    ])

const operationalExecution = computed(() => auditType.value === 'Presença'
  ? [
      { label: 'Presença', value: summary.value.readPct, color: 'bg-ink' },
      { label: 'Ruptura', value: summary.value.pendingPct, color: 'bg-warn' },
      { label: 'Cobertura', value: summary.value.readPct, color: 'bg-good' },
      { label: 'Lojas', value: null, count: storeCodes.value.length, color: 'bg-steel' },
    ]
  : [
      { label: 'Presença final', value: summary.value.readPct, color: 'bg-ink' },
      { label: 'Ruptura final', value: summary.value.rupturePct, color: 'bg-warn' },
      { label: 'Recuperação', value: summary.value.recoveryPct, color: 'bg-good' },
      { label: 'Lojas', value: null, count: storeCodes.value.length, color: 'bg-steel' },
    ])

const forecast = computed(() => buildForecast(summary.value))

const selectedChartStores = computed(() => {
  const stores = filterAllowedStoreRows(activeSession.value?.stores || [], storeCodes.value)
  return stores.filter((store) => selectedChartCodes.value.includes(store.code))
})

const selectedChartSummary = computed(() => summarizeStores(selectedChartStores.value, storeCodes.value))

const storeStatusRows = computed(() => {
  const rows = (activeSession.value?.stores || [])
    .filter((store) => storeCodes.value.includes(store.code))
    .sort((a, b) => a.code.localeCompare(b.code))

  return rows.map((store) => ({
    ...store,
    isCancelled: isCancelledStore(store),
  }))
})

const cancelledStoreCount = computed(() => storeStatusRows.value.filter((store) => store.isCancelled).length)
const draftCancelledStoreCount = computed(() => cancellationDraftCodes.value.length)

const normalizeHeader = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const findHeaderIndex = (headerRow, matchers) => {
  for (const matcher of matchers) {
    const index = headerRow.findIndex((name) => matcher(name))
    if (index >= 0) return index
  }
  return -1
}

function getDayByIso(dateIso) {
  return currentWeek.value.find((day) => day.iso === dateIso) || currentWeek.value[0]
}

async function cleanupDemoAudit() {
  const entries = await listSessions(region.value.id)
  const demoItems = entries.filter(
    (session) => session.sourceFile === 'demo-regional-sp6.xlsx' || session.id?.startsWith('demo-'),
  )

  for (const item of demoItems) {
    await deleteSession(item.id)
  }
}

async function loadSessions() {
  await cleanupDemoAudit()
  sessions.value = await listSessions(region.value.id)

  if (!selectedDay.value && currentWeek.value.length) {
    const todayIso = new Date().toISOString().slice(0, 10)
    const matchingDay = currentWeek.value.find((day) => day.iso === todayIso) || currentWeek.value[0]
    selectedDay.value = matchingDay
  }

  if (selectedDay.value && sessions.value.length) {
    const existingSession = sessions.value.find((session) => session.isoDate === selectedDay.value.iso)
    if (existingSession) {
      selectedDay.value = getDayByIso(existingSession.isoDate)
    }
  }
}

function parseSpreadSheetRows(file, selectedAuditType = 'Etiqueta') {
  const workbook = XLSX.read(file, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  if (!matrix.length) return []

  const headerRow = matrix[0].map((value) => normalizeHeader(value))
  const columnMap = {
    tree: findHeaderIndex(headerRow, [(name) => name.includes('arvore') || name.includes('tree')]),
    audit: findHeaderIndex(headerRow, [(name) => name.includes('auditado') || name.includes('audit')]),
    total: findHeaderIndex(headerRow, [
      (name) => name.includes('itenscomestoque') || (name.includes('itens') && name.includes('estoque')),
      (name) => name.includes('itens com estoque'),
    ]),
    pending: findHeaderIndex(headerRow, [
      (name) => name.includes('naolidascomestoque') || (name.includes('nao') && name.includes('lidas') && name.includes('estoque')),
      (name) => name.includes('nao lidas com estoque') || name.includes('nao lidas'),
    ]),
    updated: findHeaderIndex(headerRow, [
      (name) => name.includes('atualizadascomestoque') || (name.includes('atualizadas') && name.includes('estoque')),
      (name) => name.includes('atualizadas com estoque') || name.includes('atualizadas'),
    ]),
    outdated: findHeaderIndex(headerRow, [
      (name) => name.includes('desatualizadascomestoque') || name.includes('desatualizadas'),
      (name) => name.includes('desatualizadas com estoque'),
    ]),
  }

  return matrix
    .slice(1)
    .map((row) => {
      if (!Array.isArray(row) || row.length < 5) return null

      const treeCell = row[columnMap.tree] ?? ''
      const nameCell = row[columnMap.audit] ?? row[1] ?? ''
      const totalSku = parseNumeric(row[columnMap.total] ?? row[2])
      const pendingItems = parseNumeric(row[columnMap.pending] ?? row[3])
      const updatedItems = parseNumeric(row[columnMap.updated] ?? row[4])
      const outdatedItems = parseNumeric(row[columnMap.outdated] ?? row[5])
      const presenceItems = parseNumeric(row[3])
      const ruptureItems = parseNumeric(row[4])

      const codeFromTree = String(treeCell).match(/\b\d{3}\b/)
      const codeFromName = String(nameCell).match(/\b\d{3}\b/)
      const rawCode = codeFromTree ? codeFromTree[0] : codeFromName?.[0] ?? ''
      const code = /^\d{3}$/.test(rawCode) ? rawCode : ''
      const label = String(nameCell).trim()
      const isAggregate = /regional|regiao|macro|sub-regiao|macro regional|regiao de venda/i.test(label)

      if (!storeCodes.value.includes(code) || isAggregate) {
        return null
      }

      if (selectedAuditType !== 'Etiqueta') {
        return {
          code,
          name: label || undefined,
          totalSku,
          presenceItems,
          ruptureItems: selectedAuditType === 'Presença' ? presenceItems : ruptureItems,
        }
      }

      return {
        code,
        name: label || undefined,
        totalSku,
        pendingItems,
        updatedItems,
        outdatedItems,
      }
    })
    .filter(Boolean)
    .filter((row) => row.totalSku > 0 || row.pendingItems > 0 || row.updatedItems > 0 || row.outdatedItems > 0 || row.presenceItems > 0 || row.ruptureItems > 0)
}

async function handleUpload(file) {
  if (!selectedDay.value) return

  const selectedAuditType = selectedDay.value.activity || 'Etiqueta'
  const rows = filterAllowedStoreRows(parseSpreadSheetRows(await file.arrayBuffer(), selectedAuditType), storeCodes.value)

  if (!rows.length) {
    const expectedColumns = selectedAuditType === 'Etiqueta'
      ? 'Árvore, Itens com Estoque, Não Lidas com Estoque, Atualizadas com Estoque e Desatualizadas.'
      : 'Árvore, Auditado em, Itens com Estoque, Ruptura 1ª e Ruptura Final.'
    window.alert(`Nenhuma loja foi identificada. Verifique se a planilha contém os campos: ${expectedColumns}`)
    return
  }

  const importedStores = rows.map((row) => {
    if (selectedAuditType !== 'Etiqueta') {
      const totalSku = Math.max(Number(row.totalSku || 0), 0)
      const presenceItems = Math.min(Math.max(Number(row.presenceItems || 0), 0), totalSku)
      const ruptureItems = Math.min(Math.max(Number(row.ruptureItems || 0), 0), totalSku)
      const recoveredItems = Math.max(presenceItems - ruptureItems, 0)
      const presentItems = Math.max(totalSku - ruptureItems, 0)
      const presencePct = totalSku > 0 ? Number((((totalSku - presenceItems) / totalSku) * 100).toFixed(2)) : 0
      const rupturePct = totalSku > 0 ? Number(((ruptureItems / totalSku) * 100).toFixed(2)) : 0
      const recoveryPct = presenceItems > 0 ? Number(((recoveredItems / presenceItems) * 100).toFixed(2)) : 0

      return {
        code: row.code,
        name: row.name,
        totalSku,
        pendingItems: ruptureItems,
        updatedItems: presentItems,
        outdatedItems: 0,
        readPct: Number((100 - rupturePct).toFixed(2)),
        pendingPct: rupturePct,
        accuracyPct: selectedAuditType === 'Ruptura' ? recoveryPct : presencePct,
        presenceItems,
        ruptureItems,
        recoveredItems,
        presencePct,
        rupturePct,
        recoveryPct,
      }
    }

    const metrics = normalizeStoreMetrics({
      totalSku: row.totalSku,
      pendingItems: row.pendingItems,
      updatedItems: row.updatedItems,
      outdatedItems: row.outdatedItems,
    })

    return {
      code: row.code,
      name: row.name,
      totalSku: Number(metrics.totalSku || 0),
      pendingItems: Number(metrics.pendingItems || 0),
      updatedItems: Number(metrics.updatedItems || 0),
      outdatedItems: Number(metrics.outdatedItems || 0),
      readPct: Number(metrics.readPct || 0),
      pendingPct: Number(metrics.pendingPct || 0),
      accuracyPct: Number(metrics.accuracyPct || 0),
    }
  })

  const previousSession = sessions.value.find((session) => session.isoDate === selectedDay.value.iso)
  const previouslyCancelledCodes = new Set(
    (previousSession?.stores || []).filter((store) => isCancelledStore(store)).map((store) => store.code),
  )
  const normalizedStores = importedStores.map((store) => {
    if (!previouslyCancelledCodes.has(store.code)) return store
    return {
      ...store,
      cancelled: true,
      isCancelled: true,
      status: 'cancelada',
    }
  })

  const payload = {
    id: `${region.value.id}-${selectedDay.value.iso}-${selectedDay.value.key}`,
    regionId: region.value.id,
    region: region.value.name,
    weekStart: currentWeek.value[0]?.iso,
    dayKey: selectedDay.value.key,
    dayLabel: selectedDay.value.label,
    auditType: selectedAuditType,
    isoDate: selectedDay.value.iso,
    uploadedAt: new Date().toISOString(),
    sourceFile: file.name,
    stores: normalizedStores,
    summary: summarizeStores(normalizedStores, storeCodes.value),
    forecast: buildForecast(summarizeStores(normalizedStores, storeCodes.value)),
  }

  if (previousSession) {
    await deleteSession(previousSession.id)
  }
  await upsertSession(payload)
  isModalOpen.value = false
  await loadSessions()
}

function openDay(day) {
  selectedDay.value = day
  const session = sessions.value.find((item) => item.isoDate === day.iso)
  if (!session) {
    isModalOpen.value = true
  }
}

function openUpdateForSelectedDay() {
  if (!selectedDay.value) return
  isModalOpen.value = true
}

function openStoreCancellationModal() {
  cancellationDraftCodes.value = storeStatusRows.value.filter((store) => store.isCancelled).map((store) => store.code)
  isStoreCancellationModalOpen.value = true
}

function toggleCancellationDraft(code) {
  if (cancellationDraftCodes.value.includes(code)) {
    cancellationDraftCodes.value = cancellationDraftCodes.value.filter((item) => item !== code)
    return
  }
  cancellationDraftCodes.value = [...cancellationDraftCodes.value, code]
}

async function saveStoreCancellations() {
  const session = activeSession.value
  if (!session) return

  const updatedStores = (session.stores || []).map((store) => {
    if (!storeCodes.value.includes(store.code)) return store
    const cancelled = cancellationDraftCodes.value.includes(store.code)
    return {
      ...store,
      cancelled,
      isCancelled: cancelled,
      status: cancelled ? 'cancelada' : 'ativa',
    }
  })

  const updatedSession = {
    ...session,
    stores: updatedStores,
    summary: summarizeStores(updatedStores, storeCodes.value),
    forecast: buildForecast(summarizeStores(updatedStores, storeCodes.value)),
  }

  sessions.value = sessions.value.map((item) => (item.id === updatedSession.id ? updatedSession : item))
  await upsertSession(updatedSession)
  isStoreCancellationModalOpen.value = false
}

async function deleteSelectedAudit() {
  if (!selectedDay.value) return
  const session = sessions.value.find((item) => item.isoDate === selectedDay.value.iso)
  if (!session) return

  await deleteSession(session.id)
  selectedDay.value = currentWeek.value.find((day) => day.iso === session.isoDate) || currentWeek.value[0]
  await loadSessions()
}

function moveWeek(delta) {
  const newDate = new Date(weekCursor.value)
  newDate.setDate(newDate.getDate() + delta * 7)
  weekCursor.value = newDate
  const todayIso = new Date().toISOString().slice(0, 10)
  const dayInWeek = currentWeek.value.find((day) => day.iso === todayIso) || currentWeek.value[0]
  selectedDay.value = dayInWeek
}

watch(
  () => selectedDay.value,
  (value) => {
    if (!value) return
    const targetSession = sessions.value.find((session) => session.isoDate === value.iso)
    if (targetSession) {
      isModalOpen.value = false
    }
  },
)

watch(
  () => activeSession.value?.stores,
  () => {
    const allowed = filterAllowedStoreRows(activeSession.value?.stores || [], storeCodes.value).map((store) => store.code)
    selectedChartCodes.value = allowed.length ? allowed : [...storeCodes.value]
  },
  { immediate: true },
)

onMounted(async () => {
  await loadSessions()
})
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      :eyebrow="region.name"
      title="Auditorias da semana"
      :description="storeCodes.length ? `Lojas acompanhadas: ${storeCodes.join(', ')}.` : 'A regional ainda não tem lojas cadastradas.'"
      :chips="[{ label: 'Lojas', value: storeCodes.length }, { label: 'Auditorias salvas', value: sessions.length }]"
    />

    <div v-if="!storeCodes.length" class="setup-empty-state">
      <div class="setup-empty-icon"><i class="fa-solid fa-store" aria-hidden="true"></i></div>
      <div>
        <h2 class="font-display text-[28px] font-semibold leading-tight text-ink">{{ region.code }} ainda sem lojas</h2>
        <p class="mt-2 max-w-[60ch] text-[15px] leading-6 text-steel">Quando os códigos das lojas forem cadastrados, esta regional passa a ter calendário, importação, indicadores, relatórios e backup próprios.</p>
      </div>
    </div>

    <template v-else>
    <WeekCalendar
      :days="currentWeek"
      :sessions="sessions"
      :selected-iso="selectedDay?.iso"
      :week-label="weekLabel"
      @select-day="openDay"
      @move-week="moveWeek"
    />

    <div v-if="selectedSession" class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div class="min-w-0">
          <h2 class="font-display text-[32px] font-semibold leading-tight text-ink">
            {{ selectedSession.auditType || selectedDay?.activity || 'Etiqueta' }} de {{ selectedSession.dayLabel.toLowerCase() }}, {{ selectedSession.isoDate.split('-').reverse().slice(0, 2).join('/') }}
          </h2>
          <p class="mt-0.5 truncate text-[14px] text-steel">
            <template v-if="selectedSession.sourceFile">Planilha {{ selectedSession.sourceFile }}, </template>importada às {{ new Date(selectedSession.uploadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="ui-btn-secondary" @click="openUpdateForSelectedDay">
            <i class="fa-solid fa-arrows-rotate text-sm" aria-hidden="true"></i>
            Substituir planilha
          </button>
          <button type="button" class="ui-btn-danger" @click="deleteSelectedAudit">
            Excluir
          </button>
        </div>
      </div>

      <div v-if="auditType === 'Etiqueta'" class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Leitura" :value="`${summary.readPct.toFixed(2)}%`" subtext="Itens lidos sobre o SKU total" />
        <MetricCard label="Pendência" :value="`${summary.pendingPct.toFixed(2)}%`" subtext="Itens não lidos. Meta: até 3%" :tone="summary.pendingPct <= 3 ? 'green' : summary.pendingPct <= 7 ? 'orange' : 'red'" />
        <MetricCard label="Acertabilidade" :value="`${summary.accuracyPct.toFixed(2)}%`" subtext="Atualizados entre os lidos" />
        <MetricCard label="Itens lidos" :value="`${(summary.updatedItems + summary.outdatedItems).toLocaleString('pt-BR')}`" :subtext="`de ${summary.totalSku.toLocaleString('pt-BR')} no SKU`" />
      </div>
      <div v-else class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          v-for="card in operationalCards"
          :key="card.label"
          :label="card.label"
          :value="card.value"
          :subtext="card.subtext"
          :tone="card.tone"
        />
      </div>

      <div class="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <section class="ui-card p-5">
          <h3 class="ui-title !mt-0">Itens</h3>
          <dl v-if="auditType === 'Etiqueta'" class="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line">
            <div class="bg-white p-4">
              <dt class="text-[14px] text-steel">SKU total</dt>
              <dd class="mt-1 font-display text-[30px] font-semibold leading-none">{{ summary.totalSku.toLocaleString('pt-BR') }}</dd>
            </div>
            <div class="bg-white p-4">
              <dt class="text-[14px] text-steel">Lidos</dt>
              <dd class="mt-1 font-display text-[30px] font-semibold leading-none">{{ (summary.updatedItems + summary.outdatedItems).toLocaleString('pt-BR') }}</dd>
            </div>
            <div class="bg-white p-4">
              <dt class="text-[14px] text-steel">Atualizados</dt>
              <dd class="mt-1 font-display text-[30px] font-semibold leading-none">{{ summary.updatedItems.toLocaleString('pt-BR') }}</dd>
            </div>
            <div class="bg-white p-4">
              <dt class="text-[14px] text-steel">Desatualizados</dt>
              <dd class="mt-1 font-display text-[30px] font-semibold leading-none">{{ summary.outdatedItems.toLocaleString('pt-BR') }}</dd>
            </div>
          </dl>
          <dl v-else class="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line">
            <div v-for="tile in operationalSummaryTiles" :key="tile.label" class="bg-white p-4">
              <dt class="text-[14px] text-steel">{{ tile.label }}</dt>
              <dd class="mt-1 font-display text-[30px] font-semibold leading-none">{{ Number(tile.value || 0).toLocaleString('pt-BR') }}</dd>
            </div>
          </dl>
        </section>

        <section class="ui-card p-5">
          <h3 class="ui-title !mt-0">Andamento do dia</h3>
          <div v-if="auditType === 'Etiqueta'" class="mt-4 space-y-4">
            <div v-for="bar in [
              { label: 'Leitura', value: summary.readPct, color: 'bg-ink' },
              { label: 'Acertabilidade', value: summary.accuracyPct, color: 'bg-steel' },
              { label: 'Pendência', value: summary.pendingPct, color: summary.pendingPct <= 3 ? 'bg-good' : summary.pendingPct <= 7 ? 'bg-warn' : 'bg-bad' },
            ]" :key="bar.label">
              <div class="flex items-baseline justify-between text-[15px]">
                <span class="font-medium text-steel">{{ bar.label }}</span>
                <span class="font-display text-[22px] font-semibold">{{ bar.value.toFixed(2).replace('.', ',') }}%</span>
              </div>
              <div class="mt-1 h-2 overflow-hidden rounded-sm bg-floor">
                <div class="h-full" :class="bar.color" :style="{ width: `${Math.min(bar.value, 100)}%` }" />
              </div>
            </div>
          </div>
          <div v-else class="mt-4 space-y-4">
            <div v-for="item in operationalExecution.filter((entry) => entry.value !== null)" :key="item.label">
              <div class="flex items-baseline justify-between text-[15px]">
                <span class="font-medium text-steel">{{ item.label }}</span>
                <span class="font-display text-[22px] font-semibold">{{ item.value.toFixed(2).replace('.', ',') }}%</span>
              </div>
              <div class="mt-1 h-2 overflow-hidden rounded-sm bg-floor">
                <div class="h-full" :class="item.color" :style="{ width: `${Math.min(item.value, 100)}%` }" />
              </div>
            </div>
          </div>
        </section>
      </div>

      <button
        type="button"
        class="ui-card flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:border-ink"
        @click="openStoreCancellationModal"
      >
        <span>
          <span class="block text-[16px] font-semibold text-ink">Lojas fora do resultado</span>
          <span class="block text-[14px] text-steel">Marque as lojas com auditoria cancelada para não entrarem no cálculo.</span>
        </span>
        <span class="flex shrink-0 items-center gap-3">
          <span class="ui-badge" :class="cancelledStoreCount ? 'ui-badge-bad' : 'ui-badge-mute'">{{ cancelledStoreCount }} {{ cancelledStoreCount === 1 ? 'loja' : 'lojas' }}</span>
          <i class="fa-solid fa-chevron-right text-xs text-steel" aria-hidden="true"></i>
        </span>
      </button>

      <StoreTowerChart
        :stores="selectedChartStores"
        :regional-summary="selectedChartSummary"
        :selected-codes="selectedChartCodes"
        :store-codes="storeCodes"
        :regional-name="region.name"
        :metric-title="auditType === 'Etiqueta' ? 'Pendência por loja' : 'Ruptura por loja'"
        :primary-label="auditType === 'Etiqueta' ? 'Pendência' : 'Ruptura'"
        :secondary-label="auditType === 'Ruptura' ? 'Recuperação' : auditType === 'Presença' ? 'Presença' : 'Acertabilidade'"
        @update:selected-codes="selectedChartCodes = $event"
      />
    </div>

    <div v-else class="flex flex-col items-start gap-3 rounded-[10px] border border-dashed border-line-strong bg-white px-6 py-8">
      <template v-if="selectedDay">
        <h2 class="font-display text-[28px] font-semibold leading-tight text-ink">Nada importado em {{ selectedDay.label.toLowerCase() }}, {{ selectedDay.short }}</h2>
        <p class="max-w-[60ch] text-[15px] text-steel">Importe o consolidado de {{ selectedDay.activity }} para ver os indicadores e o gráfico por loja.</p>
        <button type="button" class="ui-btn-primary mt-1" @click="openUpdateForSelectedDay">
          <i class="fa-solid fa-file-arrow-up text-sm" aria-hidden="true"></i>
          Importar planilha
        </button>
      </template>
      <p v-else class="text-[15px] text-steel">Escolha um dia no calendário para ver ou importar uma auditoria.</p>
    </div>

    <div v-if="isModalOpen && selectedDay" class="relative">
      <UploadModal :regional-name="region.name" :audit-type="selectedDay.activity" :is-update="Boolean(selectedSession)" @close="isModalOpen = false" @upload="handleUpload" />
    </div>

    <div v-if="isStoreCancellationModalOpen" class="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-3 sm:items-center sm:p-4" @click.self="isStoreCancellationModalOpen = false">
      <div class="ui-modal max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 id="cancel-title" class="font-display text-[28px] font-semibold leading-tight text-ink">Lojas fora do resultado</h3>
            <p class="mt-1 text-[15px] text-steel">Marque as lojas com auditoria cancelada e aplique no final.</p>
          </div>
          <button type="button" class="close-btn" aria-label="Fechar" @click="isStoreCancellationModalOpen = false">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div class="mt-5 grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          <label
            v-for="store in storeStatusRows"
            :key="store.code"
            class="flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors"
            :class="cancellationDraftCodes.includes(store.code) ? 'border-bad/40 bg-bad/5' : 'border-line hover:border-line-strong'"
          >
            <input
              type="checkbox"
              class="h-4 w-4 accent-[#C8233A]"
              :checked="cancellationDraftCodes.includes(store.code)"
              @change="toggleCancellationDraft(store.code)"
            />
            <span class="min-w-0 flex-1">
              <span class="block font-display text-[19px] font-semibold leading-tight text-ink">Loja {{ store.code }}</span>
              <span class="block text-[13px]" :class="cancellationDraftCodes.includes(store.code) ? 'text-bad' : 'text-steel'">
                {{ cancellationDraftCodes.includes(store.code) ? 'Fica fora do resultado' : 'Entra no resultado' }}
              </span>
            </span>
          </label>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span class="text-[15px] text-steel">{{ draftCancelledStoreCount }} {{ draftCancelledStoreCount === 1 ? 'loja marcada' : 'lojas marcadas' }}</span>
          <div class="flex gap-2">
            <button type="button" class="ui-btn-secondary" @click="isStoreCancellationModalOpen = false">Cancelar</button>
            <button type="button" class="ui-btn-primary" @click="saveStoreCancellations">Aplicar</button>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>
