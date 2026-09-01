<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import UploadModal from '../components/UploadModal.vue'
import WeekCalendar from '../components/WeekCalendar.vue'
import MetricCard from '../components/MetricCard.vue'
import StoreBarChart from '../components/StoreBarChart.vue'
import { getCurrentWeekDays, REGIONAL_NAME, summarizeStores, normalizeStoreMetrics, buildForecast, STORE_CODES, filterAllowedStoreRows, parseNumeric, isCancelledStore } from '../lib/metrics'
import { deleteSession, listSessions, upsertSession } from '../lib/database'
import StoreTowerChart from '../components/StoreTowerChart.vue'
import * as XLSX from 'xlsx'

const sessions = ref([])
const weekCursor = ref(new Date())
const currentWeek = computed(() => getCurrentWeekDays(weekCursor.value))
const isModalOpen = ref(false)
const isStoreCancellationModalOpen = ref(false)
const selectedDay = ref(null)
const selectedChartCodes = ref([...STORE_CODES])

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

const summary = computed(() => {
  const stores = activeSession.value?.stores || []
  return stores.length ? summarizeStores(stores) : { totalSku: 0, pendingItems: 0, updatedItems: 0, outdatedItems: 0, readPct: 0, pendingPct: 0, accuracyPct: 0 }
})

const forecast = computed(() => buildForecast(summary.value))

const selectedChartStores = computed(() => {
  const stores = filterAllowedStoreRows(activeSession.value?.stores || [])
  return stores.filter((store) => selectedChartCodes.value.includes(store.code))
})

const selectedChartSummary = computed(() => summarizeStores(selectedChartStores.value))

const storeStatusRows = computed(() => {
  const rows = (activeSession.value?.stores || [])
    .filter((store) => STORE_CODES.includes(store.code))
    .sort((a, b) => a.code.localeCompare(b.code))

  return rows.map((store) => ({
    ...store,
    isCancelled: isCancelledStore(store),
  }))
})

const cancelledStoreCount = computed(() => storeStatusRows.value.filter((store) => store.isCancelled).length)

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
  const entries = await listSessions()
  const demoItems = entries.filter(
    (session) => session.sourceFile === 'demo-regional-sp6.xlsx' || session.id?.startsWith('demo-'),
  )

  for (const item of demoItems) {
    await deleteSession(item.id)
  }
}

async function loadSessions() {
  await cleanupDemoAudit()
  sessions.value = await listSessions()

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

function parseSpreadSheetRows(file) {
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

      const codeFromTree = String(treeCell).match(/\b\d{3}\b/)
      const codeFromName = String(nameCell).match(/\b\d{3}\b/)
      const rawCode = codeFromTree ? codeFromTree[0] : codeFromName?.[0] ?? ''
      const code = /^\d{3}$/.test(rawCode) ? rawCode : ''
      const label = String(nameCell).trim()
      const isAggregate = /regional|regiao|macro|sub-regiao|macro regional|regiao de venda/i.test(label)

      if (!STORE_CODES.includes(code) || isAggregate) {
        return null
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
    .filter((row) => row.totalSku > 0 || row.pendingItems > 0 || row.updatedItems > 0 || row.outdatedItems > 0)
}

async function handleUpload(file) {
  if (!selectedDay.value) return

  const rows = filterAllowedStoreRows(parseSpreadSheetRows(await file.arrayBuffer()))

  if (!rows.length) {
    window.alert('Nenhuma loja foi identificada. Verifique se a planilha contém os campos: Árvore, Itens com Estoque, Não Lidas com Estoque, Atualizadas com Estoque e Desatualizadas.')
    return
  }

  const normalizedStores = rows.map((row) => {
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

  const payload = {
    id: `${selectedDay.value.iso}-${selectedDay.value.key}`,
    region: REGIONAL_NAME,
    weekStart: currentWeek.value[0]?.iso,
    dayKey: selectedDay.value.key,
    dayLabel: selectedDay.value.label,
    isoDate: selectedDay.value.iso,
    uploadedAt: new Date().toISOString(),
    sourceFile: file.name,
    stores: normalizedStores,
    summary: summarizeStores(normalizedStores),
    forecast: buildForecast(summarizeStores(normalizedStores)),
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

async function toggleStoreCancellation(code, nextValue) {
  const session = activeSession.value
  if (!session) return

  const updatedStores = (session.stores || []).map((store) => {
    if (store.code !== code) return store
    const cancelled = Boolean(nextValue)
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
    summary: summarizeStores(updatedStores),
    forecast: buildForecast(summarizeStores(updatedStores)),
  }

  sessions.value = sessions.value.map((item) => (item.id === updatedSession.id ? updatedSession : item))
  await upsertSession(updatedSession)
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
    const allowed = filterAllowedStoreRows(activeSession.value?.stores || []).map((store) => store.code)
    selectedChartCodes.value = allowed.length ? allowed : [...STORE_CODES]
  },
  { immediate: true },
)

onMounted(async () => {
  await loadSessions()
})
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Auditorias</p>
          <h1 class="mt-2 text-3xl font-bold tracking-tight text-slate-900">Regional SP6</h1>
          <p class="mt-2 text-sm text-slate-600">
            Acompanhamento consolidado das lojas 008, 009, 015, 093, 096, 112, 127, 149, 151, 233, 270, 280, 282 e 350.
          </p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {{ sessions.length }} auditoria(s) criada(s)
        </div>
      </div>
    </div>

    <WeekCalendar
      :days="currentWeek"
      :sessions="sessions"
      :selected-iso="selectedDay?.iso"
      :week-label="weekLabel"
      @select-day="openDay"
      @move-week="moveWeek"
    />

    <div v-if="selectedSession" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Auditoria ativa</p>
          <h2 class="mt-2 text-xl font-semibold text-slate-900">{{ selectedSession.dayLabel }} · {{ selectedSession.isoDate }}</h2>
        </div>
        <div class="flex gap-2">
          <button class="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200" @click="openUpdateForSelectedDay">
            Atualizar auditoria
          </button>
          <button class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100" @click="deleteSelectedAudit">
            Excluir auditoria
          </button>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Leitura total" :value="`${summary.readPct.toFixed(2)}%`" subtext="Itens lidos / total SKU" tone="blue" />
        <MetricCard label="Pendentes" :value="`${summary.pendingPct.toFixed(2)}%`" subtext="Itens ainda não lidos" :tone="summary.pendingPct <= 3 ? 'green' : summary.pendingPct <= 7 ? 'orange' : 'red'" />
        <MetricCard label="Acertabilidade" :value="`${summary.accuracyPct.toFixed(2)}%`" subtext="Atualizados dentre lidos" tone="green" />
        <MetricCard label="Itens lidos" :value="`${(summary.updatedItems + summary.outdatedItems).toLocaleString('pt-BR')}`" subtext="Total de itens lidos" tone="slate" />
      </div>

      <div class="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resumo</p>
              <h2 class="mt-2 text-xl font-semibold text-slate-900">{{ selectedSession.dayLabel }}</h2>
            </div>
            <div class="flex items-center gap-2 text-sm text-slate-600">
              <span class="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {{ new Date(selectedSession.uploadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
            </div>
          </div>

          <div class="mt-5 grid grid-cols-2 gap-4">
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="flex items-center gap-2 text-slate-500">
                <i class="fa-solid fa-boxes-stacked text-sm"></i>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em]">SKU total</p>
              </div>
              <p class="mt-2 text-2xl font-bold text-slate-900">{{ summary.totalSku.toLocaleString('pt-BR') }}</p>
            </div>
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="flex items-center gap-2 text-slate-500">
                <i class="fa-solid fa-book-open-reader text-sm"></i>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em]">Itens lidos</p>
              </div>
              <p class="mt-2 text-2xl font-bold text-slate-900">{{ (summary.updatedItems + summary.outdatedItems).toLocaleString('pt-BR') }}</p>
            </div>
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="flex items-center gap-2 text-slate-500">
                <i class="fa-solid fa-circle-check text-sm"></i>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em]">Atualizados</p>
              </div>
              <p class="mt-2 text-2xl font-bold text-slate-900">{{ summary.updatedItems.toLocaleString('pt-BR') }}</p>
            </div>
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="flex items-center gap-2 text-slate-500">
                <i class="fa-solid fa-clock-rotate-left text-sm"></i>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em]">Desatualizados</p>
              </div>
              <p class="mt-2 text-2xl font-bold text-slate-900">{{ summary.outdatedItems.toLocaleString('pt-BR') }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-5 flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Execução</p>
              <h3 class="mt-2 text-xl font-semibold text-slate-900">Performance da semana</h3>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Lojas</div>
              <div class="mt-1 text-2xl font-bold tracking-tight text-slate-900">{{ STORE_CODES.length }}</div>
            </div>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Leitura</p>
              <p class="mt-2 text-xl font-bold text-slate-900">{{ summary.readPct.toFixed(2) }}%</p>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div class="h-full rounded-full bg-sky-500" :style="{ width: `${Math.min(summary.readPct, 100)}%` }" />
              </div>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Acertabilidade</p>
              <p class="mt-2 text-xl font-bold text-slate-900">{{ summary.accuracyPct.toFixed(2) }}%</p>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div class="h-full rounded-full bg-violet-500" :style="{ width: `${Math.min(summary.accuracyPct, 100)}%` }" />
              </div>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pendência</p>
              <p class="mt-2 text-xl font-bold text-slate-900">{{ summary.pendingPct.toFixed(2) }}%</p>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div class="h-full rounded-full bg-amber-500" :style="{ width: `${Math.min(summary.pendingPct, 100)}%` }" />
              </div>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Lidos</p>
              <p class="mt-2 text-xl font-bold text-slate-900">{{ (summary.updatedItems + summary.outdatedItems).toLocaleString('pt-BR') }}</p>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div class="h-full rounded-full bg-emerald-500" :style="{ width: `${Math.min(summary.readPct, 100)}%` }" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-100"
          @click="isStoreCancellationModalOpen = true"
        >
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lojas</p>
            <h3 class="mt-2 text-xl font-semibold text-slate-900">Cancelar loja na auditoria</h3>
          </div>

          <div class="flex items-center gap-3">
            <span class="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {{ cancelledStoreCount }} fora do resultado
            </span>
            <span class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
              <i class="fa-solid fa-pen-to-square text-sm"></i>
            </span>
          </div>
        </button>
      </div>

      <StoreTowerChart
        :stores="selectedChartStores"
        :regional-summary="selectedChartSummary"
        :selected-codes="selectedChartCodes"
        @update:selected-codes="selectedChartCodes = $event"
      />
    </div>

    <div v-else class="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600 shadow-sm">
      Selecione um dia do calendário para visualizar ou criar uma auditoria.
    </div>

    <div v-if="isModalOpen && selectedDay" class="relative">
      <UploadModal @close="isModalOpen = false" @upload="handleUpload" />
    </div>

    <div v-if="isStoreCancellationModalOpen" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div class="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lojas</p>
            <h3 class="mt-2 text-2xl font-semibold text-slate-900">Cancelar loja na auditoria</h3>
          </div>
          <button type="button" class="text-lg text-slate-500 hover:text-slate-900" @click="isStoreCancellationModalOpen = false">×</button>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
          <div
            v-for="store in storeStatusRows"
            :key="store.code"
            class="flex min-h-[112px] flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            :class="store.isCancelled ? 'border-rose-200 bg-rose-50' : ''"
          >
            <div>
              <p class="font-semibold text-slate-900">Loja {{ store.code }}</p>
              <p class="mt-1 text-xs text-slate-500">
                {{ store.isCancelled ? 'Cancelada e fora do resultado' : 'Contabilizada no resultado' }}
              </p>
            </div>

            <button
              type="button"
              class="w-full rounded-xl px-3 py-2 text-sm font-medium transition"
              :class="store.isCancelled ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'"
              @click="toggleStoreCancellation(store.code, !store.isCancelled); isStoreCancellationModalOpen = false"
            >
              {{ store.isCancelled ? 'Reativar' : 'Cancelar' }}
            </button>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            @click="isStoreCancellationModalOpen = false"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
