<script setup>
import PageHeader from '../components/PageHeader.vue'
import { computed, onMounted, ref, watch } from 'vue'
import UploadModal from '../components/UploadModal.vue'
import WeekCalendar from '../components/WeekCalendar.vue'
import MetricCard from '../components/MetricCard.vue'
import BatchImportModal from '../components/BatchImportModal.vue'
import { getCurrentWeekDays, summarizeStores, buildForecast, filterAllowedStoreRows, isCancelledStore, getTodayIso, formatIsoDate, formatStoreLabel, formatPct, toIsoDate } from '../lib/metrics'
import { deleteSession, listSessions, upsertSession } from '../lib/database'
import { EXPECTED_COLUMNS, buildSessionPayload, getAuditDay, parseRows, readSpreadsheet } from '../lib/importer'
import StoreTowerChart from '../components/StoreTowerChart.vue'
import { useRoute } from 'vue-router'
import { getRegion } from '../lib/regions'
import { formatLimit, getMetaTone, settings } from '../lib/settings'
import { notify, confirmAction } from '../composables/feedback'
import { markChange } from '../lib/backup'
import { useModal } from '../composables/useModal'

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
const isBatchOpen = ref(false)
const isUploading = ref(false)
const tableSort = ref({ key: 'pendingPct', dir: 'desc' })

useModal(() => { isStoreCancellationModalOpen.value = false }, () => isStoreCancellationModalOpen.value)

const toneClass = { green: 'text-good', orange: 'text-warn', red: 'text-bad' }
const toneBg = { green: 'bg-good', orange: 'bg-warn', red: 'bg-bad' }
const toneBadge = { green: 'ui-badge-good', orange: 'ui-badge-warn', red: 'ui-badge-bad' }
const toneLabel = { green: 'Na meta', orange: 'Atenção', red: 'Fora da meta' }

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
      { label: 'Ruptura identificada', value: `${summary.value.pendingPct.toFixed(2)}%`, subtext: 'Itens sem presença', tone: getMetaTone(summary.value.pendingPct) },
      { label: 'Itens presentes', value: summary.value.updatedItems.toLocaleString('pt-BR'), subtext: 'SKU com presença confirmada', tone: 'slate' },
      { label: 'Itens em ruptura', value: summary.value.ruptureItems.toLocaleString('pt-BR'), subtext: 'Base para a auditoria de ruptura', tone: 'slate' },
    ]
  }

  return [
    { label: 'Presença após auditoria', value: `${summary.value.readPct.toFixed(2)}%`, subtext: 'Presença após a verificação', tone: 'blue' },
    { label: 'Ruptura final', value: `${summary.value.rupturePct.toFixed(2)}%`, subtext: 'Ruptura confirmada no fechamento', tone: getMetaTone(summary.value.rupturePct) },
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
      { label: 'Ruptura', value: summary.value.pendingPct, color: toneBg[getMetaTone(summary.value.pendingPct)] },
      { label: 'Cobertura', value: summary.value.readPct, color: 'bg-good' },
      { label: 'Lojas', value: null, count: storeCodes.value.length, color: 'bg-steel' },
    ]
  : [
      { label: 'Presença final', value: summary.value.readPct, color: 'bg-ink' },
      { label: 'Ruptura final', value: summary.value.rupturePct, color: toneBg[getMetaTone(summary.value.rupturePct)] },
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
  sessions.value = await listSessions(region.value.id)

  if (!selectedDay.value && currentWeek.value.length) {
    selectedDay.value = pickDefaultDay()
  }

  if (selectedDay.value && sessions.value.length) {
    const existingSession = sessions.value.find((session) => session.isoDate === selectedDay.value.iso)
    if (existingSession) {
      selectedDay.value = getDayByIso(existingSession.isoDate)
    }
  }
}

// ---------- Tabela por loja ----------
const storeTableRows = computed(() => {
  const rows = storeStatusRows.value.map((store) => ({
    ...store,
    displayName: formatStoreLabel(store.code, store.name, region.value.name),
    totalSku: Number(store.totalSku || 0),
    readPct: Number(store.readPct || 0),
    pendingPct: Number(store.pendingPct || 0),
    thirdPct: Number((auditType.value === 'Etiqueta' ? store.accuracyPct : auditType.value === 'Ruptura' ? store.recoveryPct : store.presencePct) || 0),
  }))
  const { key, dir } = tableSort.value
  const factor = dir === 'asc' ? 1 : -1
  return rows.sort((a, b) => {
    if (a.isCancelled !== b.isCancelled) return a.isCancelled ? 1 : -1
    if (key === 'code') return a.code.localeCompare(b.code) * factor
    return (a[key] - b[key]) * factor
  })
})

const tableColumns = computed(() => auditType.value === 'Etiqueta'
  ? [
      { key: 'totalSku', label: 'SKU' },
      { key: 'readPct', label: 'Leitura' },
      { key: 'pendingPct', label: 'Pendência' },
      { key: 'thirdPct', label: 'Acertabilidade' },
    ]
  : [
      { key: 'totalSku', label: 'SKU' },
      { key: 'readPct', label: 'Presença' },
      { key: 'pendingPct', label: 'Ruptura' },
      { key: 'thirdPct', label: auditType.value === 'Ruptura' ? 'Recuperação' : 'Presença inicial' },
    ])

const missingStoreCodes = computed(() => {
  if (!activeSession.value) return []
  const present = new Set((activeSession.value.stores || []).map((store) => store.code))
  return storeCodes.value.filter((code) => !present.has(code))
})

function sortTable(key) {
  const current = tableSort.value
  tableSort.value = current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'code' ? 'asc' : 'desc' }
}

function sortIcon(key) {
  if (tableSort.value.key !== key) return 'fa-sort opacity-40'
  return tableSort.value.dir === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'
}

// ---------- Reincidência: lojas fora da meta em semanas seguidas ----------
function weekStartOf(iso) {
  const date = new Date(`${iso}T00:00:00`)
  const weekday = date.getDay() || 7
  date.setDate(date.getDate() - (weekday - 1))
  return toIsoDate(date)
}

const recurrence = computed(() => {
  const session = activeSession.value
  if (!session?.isoDate) return []
  const type = session.auditType || 'Etiqueta'
  // Última auditoria do mesmo tipo em cada semana, até a data da auditoria ativa.
  const byWeek = {}
  for (const item of sessions.value) {
    if ((item.auditType || 'Etiqueta') !== type || !item.isoDate || item.isoDate > session.isoDate) continue
    const week = weekStartOf(item.isoDate)
    if (!byWeek[week] || item.isoDate > byWeek[week].isoDate) byWeek[week] = item
  }
  const weeks = Object.keys(byWeek).sort().reverse()
  const result = []
  for (const code of storeCodes.value) {
    let streak = 0
    let expected = weekStartOf(session.isoDate)
    const values = []
    for (const week of weeks) {
      if (week !== expected) break
      const store = (byWeek[week].stores || []).find((item) => item.code === code)
      if (!store || isCancelledStore(store) || getMetaTone(store.pendingPct) === 'green') break
      streak += 1
      values.push(Number(store.pendingPct || 0))
      const previous = new Date(`${week}T00:00:00`)
      previous.setDate(previous.getDate() - 7)
      expected = toIsoDate(previous)
    }
    if (streak >= 2) {
      const name = (session.stores || []).find((item) => item.code === code)?.name
      result.push({ code, name: formatStoreLabel(code, name, region.value.name), streak, current: values[0], oldest: values[values.length - 1] })
    }
  }
  return result.sort((a, b) => b.streak - a.streak || b.current - a.current)
})

// ---------- Importação ----------
async function handleUpload(file) {
  if (!selectedDay.value || isUploading.value) return
  isUploading.value = true
  try {
    const day = getAuditDay(selectedDay.value.iso) || { ...selectedDay.value, weekStart: currentWeek.value[0]?.iso }
    const auditType = day.activity || 'Etiqueta'
    const { matrix } = await readSpreadsheet(file)
    const rows = parseRows(matrix, auditType, storeCodes.value)

    if (!rows.length) {
      notify(`Nenhuma loja da ${region.value.name} foi encontrada nesta planilha. Confira se ela tem as colunas ${EXPECTED_COLUMNS[auditType]}.`, 'error', 9000)
      return
    }

    const previousSession = sessions.value.find((session) => session.isoDate === day.iso)
    const payload = buildSessionPayload({ region: region.value, storeCodes: storeCodes.value, day, rows, fileName: file.name, previousSession })
    if (previousSession && previousSession.id !== payload.id) await deleteSession(previousSession.id)
    await upsertSession(payload)
    markChange(region.value.id, 1)
    isModalOpen.value = false
    await loadSessions()

    const missing = storeCodes.value.filter((code) => !rows.some((row) => row.code === code))
    const action = previousSession ? 'Dados atualizados' : 'Planilha importada'
    if (missing.length) {
      notify(`${action}: ${rows.length} lojas. Não vieram na planilha: ${missing.join(', ')}.`, 'info', 9000)
    } else {
      notify(`${action}: todas as ${rows.length} lojas.`)
    }
  } catch (error) {
    console.error(error)
    notify('Não foi possível ler a planilha. Confira se o arquivo abre no Excel e não tem senha.', 'error', 8000)
  } finally {
    isUploading.value = false
  }
}

async function handleBatchImported(results) {
  isBatchOpen.value = false
  markChange(region.value.id, Math.max(results.length, 3))
  await loadSessions()
  const latest = [...results].sort((a, b) => b.iso.localeCompare(a.iso))[0]
  if (latest) {
    weekCursor.value = new Date(`${latest.iso}T00:00:00`)
    selectedDay.value = currentWeek.value.find((day) => day.iso === latest.iso) || selectedDay.value
  }
  const replaced = results.filter((item) => item.replaced).length
  notify(`${results.length} ${results.length === 1 ? 'planilha importada' : 'planilhas importadas'}${replaced ? `, ${replaced} com dados atualizados` : ''}.`)
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
  markChange(region.value.id, 1)
  isStoreCancellationModalOpen.value = false
  const count = cancellationDraftCodes.value.length
  notify(count ? `${count} ${count === 1 ? 'loja fora' : 'lojas fora'} do resultado.` : 'Todas as lojas entram no resultado.')
}

async function deleteSelectedAudit() {
  if (!selectedDay.value) return
  const session = sessions.value.find((item) => item.isoDate === selectedDay.value.iso)
  if (!session) return

  const confirmed = await confirmAction({
    title: 'Excluir esta auditoria?',
    message: `${session.auditType || 'Etiqueta'} de ${String(session.dayLabel || '').toLowerCase()}, ${formatIsoDate(session.isoDate)}. Não dá para desfazer. Se precisar dos dados, exporte um backup antes.`,
    confirmLabel: 'Excluir auditoria',
  })
  if (!confirmed) return

  await deleteSession(session.id)
  markChange(region.value.id, 3)
  selectedDay.value = currentWeek.value.find((day) => day.iso === session.isoDate) || currentWeek.value[0]
  await loadSessions()
  notify('Auditoria excluída.')
}

function moveWeek(delta) {
  const newDate = new Date(weekCursor.value)
  newDate.setDate(newDate.getDate() + delta * 7)
  weekCursor.value = newDate
  selectedDay.value = pickDefaultDay()
}

function goToday() {
  weekCursor.value = new Date()
  selectedDay.value = pickDefaultDay()
}

// Hoje, quando é dia de auditoria; senão o último dia já passado da semana (com planilha, se houver).
function pickDefaultDay() {
  const todayIso = getTodayIso()
  const exact = currentWeek.value.find((day) => day.iso === todayIso)
  if (exact) return exact
  const past = currentWeek.value.filter((day) => day.iso <= todayIso)
  const loaded = [...past].reverse().find((day) => sessions.value.some((session) => session.isoDate === day.iso))
  return loaded || past[past.length - 1] || currentWeek.value[0]
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
  await cleanupDemoAudit()
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
    >
      <button v-if="storeCodes.length" type="button" class="ui-btn-secondary ml-1" @click="isBatchOpen = true">
        <i class="fa-solid fa-copy text-sm" aria-hidden="true"></i>
        Importar várias
      </button>
    </PageHeader>

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
      @go-today="goToday"
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
          <button type="button" class="ui-btn-update" @click="openUpdateForSelectedDay">
            <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
            Atualizar dados
          </button>
          <button type="button" class="ui-btn-danger" @click="deleteSelectedAudit">
            Excluir
          </button>
        </div>
      </div>

      <div v-if="auditType === 'Etiqueta'" class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Leitura" :value="`${summary.readPct.toFixed(2)}%`" subtext="Itens lidos sobre o SKU total" />
        <MetricCard label="Pendência" :value="`${summary.pendingPct.toFixed(2)}%`" :subtext="`Itens não lidos. Meta: até ${formatLimit(settings.meta)}%`" :tone="getMetaTone(summary.pendingPct)" />
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

      <section v-if="recurrence.length" class="ui-card-alert p-5" aria-labelledby="recurrence-title">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="recurrence-title" class="ui-title !mt-0">
            {{ recurrence.length === 1 ? 'Uma loja segue' : `${recurrence.length} lojas seguem` }} fora da meta há semanas
          </h3>
          <p class="text-[14px] text-steel">Auditorias de {{ auditType }} em semanas seguidas, até esta data</p>
        </div>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="item in recurrence" :key="item.code" class="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
            <span class="min-w-0">
              <span class="block truncate text-[15px] font-semibold text-ink" :title="item.name">{{ item.name }}</span>
              <span class="block text-[13px] text-steel">
                {{ item.streak }} semanas seguidas<template v-if="item.oldest !== item.current">, era {{ formatPct(item.oldest) }}</template>
              </span>
            </span>
            <span class="font-display text-[22px] font-semibold" :class="toneClass[getMetaTone(item.current)]">{{ formatPct(item.current) }}</span>
          </li>
        </ul>
      </section>

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
              { label: 'Pendência', value: summary.pendingPct, color: toneBg[getMetaTone(summary.pendingPct)] },
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

      <section class="ui-card p-5" aria-labelledby="store-table-title">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="store-table-title" class="ui-title !mt-0">Resultado por loja</h3>
          <p class="text-[14px] text-steel">Clique no nome da coluna para ordenar</p>
        </div>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full min-w-[620px] text-left">
            <thead class="ui-table-head">
              <tr>
                <th class="px-3 py-2.5" :aria-sort="tableSort.key === 'code' ? (tableSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'">
                  <button type="button" class="inline-flex items-center gap-1.5 hover:text-ink" @click="sortTable('code')">
                    Loja <i class="fa-solid text-[11px]" :class="sortIcon('code')" aria-hidden="true"></i>
                  </button>
                </th>
                <th v-for="column in tableColumns" :key="column.key" class="px-3 py-2.5 text-right" :aria-sort="tableSort.key === column.key ? (tableSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'">
                  <button type="button" class="inline-flex items-center gap-1.5 hover:text-ink" @click="sortTable(column.key)">
                    {{ column.label }} <i class="fa-solid text-[11px]" :class="sortIcon(column.key)" aria-hidden="true"></i>
                  </button>
                </th>
                <th class="px-3 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line text-[15px]">
              <tr v-for="row in storeTableRows" :key="row.code" class="hover:bg-floor/50" :class="{ 'text-steel': row.isCancelled }">
                <td class="max-w-[260px] truncate whitespace-nowrap px-3 py-2.5 font-semibold" :title="row.name">{{ row.displayName }}</td>
                <td class="px-3 py-2.5 text-right">{{ row.totalSku.toLocaleString('pt-BR') }}</td>
                <td class="px-3 py-2.5 text-right">{{ formatPct(row.readPct) }}</td>
                <td class="px-3 py-2.5 text-right font-semibold" :class="row.isCancelled ? '' : toneClass[getMetaTone(row.pendingPct)]">{{ formatPct(row.pendingPct) }}</td>
                <td class="px-3 py-2.5 text-right">{{ formatPct(row.thirdPct) }}</td>
                <td class="px-3 py-2.5">
                  <span v-if="row.isCancelled" class="ui-badge ui-badge-mute">Cancelada</span>
                  <span v-else class="ui-badge" :class="toneBadge[getMetaTone(row.pendingPct)]">{{ toneLabel[getMetaTone(row.pendingPct)] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="missingStoreCodes.length" class="mt-3 text-[14px] text-steel">
          Sem dados nesta planilha: {{ missingStoreCodes.join(', ') }}.
        </p>
      </section>

      <StoreTowerChart
        :stores="selectedChartStores"
        :regional-summary="selectedChartSummary"
        :selected-codes="selectedChartCodes"
        :store-codes="storeCodes"
        :regional-name="region.name"
        :metric-title="auditType === 'Etiqueta' ? 'Pendência por loja' : 'Ruptura por loja'"
        :primary-label="auditType === 'Etiqueta' ? 'Pendência' : 'Ruptura'"
        :secondary-label="auditType === 'Ruptura' ? 'Recuperação' : auditType === 'Presença' ? 'Presença' : 'Acertabilidade'"
        :export-context="`${auditType} de ${String(selectedSession.dayLabel || '').toLowerCase()}, ${formatIsoDate(selectedSession.isoDate)}`"
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
      <UploadModal :regional-name="region.name" :audit-type="selectedDay.activity" :is-update="Boolean(selectedSession)" :busy="isUploading" @close="isModalOpen = false" @upload="handleUpload" />
    </div>

    <BatchImportModal
      v-if="isBatchOpen"
      :region="region"
      :store-codes="storeCodes"
      :sessions="sessions"
      @close="isBatchOpen = false"
      @imported="handleBatchImported"
    />

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
