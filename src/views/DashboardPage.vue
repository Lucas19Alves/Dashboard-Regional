<script setup>
import { computed, onMounted, ref } from 'vue'
import MetricCard from '../components/MetricCard.vue'
import StoreBarChart from '../components/StoreBarChart.vue'
import InsightPanel from '../components/InsightPanel.vue'
import { STORE_CODES, summarizeStores, buildForecast, getStoreStatusLabel } from '../lib/metrics'
import { listSessions } from '../lib/database'

const sessions = ref([])
const sortMode = ref('read')
const selectedCodes = ref([...STORE_CODES])

const activeSession = computed(() => {
  const sorted = [...sessions.value].sort((a, b) => new Date(b.uploadedAt || b.createdAt || 0) - new Date(a.uploadedAt || a.createdAt || 0))
  return sorted[0] || null
})

const filteredStores = computed(() => {
  const raw = (activeSession.value?.stores || [])
    .filter((store) => selectedCodes.value.includes(store.code))
    .map((store) => ({
      ...store,
      readPct: Number(store.readPct || 0),
      pendingPct: Number(store.pendingPct || 0),
      accuracyPct: Number(store.accuracyPct || 0),
    }))

  if (sortMode.value === 'read') {
    return [...raw].sort((a, b) => b.readPct - a.readPct)
  }

  if (sortMode.value === 'pending') {
    return [...raw].sort((a, b) => a.pendingPct - b.pendingPct)
  }

  if (sortMode.value === 'name') {
    return [...raw].sort((a, b) => a.code.localeCompare(b.code))
  }

  return [...raw].sort((a, b) => b.accuracyPct - a.accuracyPct)
})

const summary = computed(() => summarizeStores(filteredStores.value))
const forecast = computed(() => buildForecast(summary.value))

function toggleStore(code) {
  if (selectedCodes.value.includes(code)) {
    selectedCodes.value = selectedCodes.value.filter((item) => item !== code)
    return
  }
  selectedCodes.value = [...selectedCodes.value, code]
}

function applyAllStores() {
  selectedCodes.value = [...STORE_CODES]
}

async function loadSessions() {
sessions.value = await listSessions()
}

onMounted(async () => {
  await loadSessions()
})
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dashboard</p>
          <h1 class="mt-2 text-3xl font-bold text-slate-900">Visão consolidada da regional</h1>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-slate-700">Ordenar</label>
          <select v-model="sortMode" class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200">
            <option value="read">Leitura</option>
            <option value="pending">Pendência</option>
            <option value="accuracy">Acertabilidade</option>
            <option value="name">Loja</option>
          </select>
        </div>
      </div>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Filtro por lojas</p>
          <h2 class="mt-2 text-xl font-semibold text-slate-900">Seleção da base</h2>
        </div>
        <button class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700" @click="applyAllStores">
          Selecionar todas
        </button>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-for="code in STORE_CODES"
          :key="code"
          class="rounded-full border px-3 py-1.5 text-sm font-medium transition"
          :class="selectedCodes.includes(code) ? 'border-sky-500 bg-sky-100 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'"
          @click="toggleStore(code)"
        >
          {{ code }}
        </button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <MetricCard label="Leitura regional" :value="`${summary.readPct.toFixed(2)}%`" subtext="Base no total de SKU" tone="blue" />
      <MetricCard label="Pendência" :value="`${summary.pendingPct.toFixed(2)}%`" subtext="Itens ainda não lidos" :tone="summary.pendingPct <= 3 ? 'green' : summary.pendingPct <= 7 ? 'orange' : 'red'" />
      <MetricCard label="Acertabilidade" :value="`${summary.accuracyPct.toFixed(2)}%`" subtext="Itens atualizados" tone="green" />
      <MetricCard label="Projeção" :value="`${forecast.projected.toFixed(2)}%`" subtext="Até o fechamento" tone="orange" />
    </div>

    <div class="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
      <StoreBarChart :stores="activeSession?.stores || []" :selected-codes="selectedCodes" />
      <InsightPanel :summary="summary" :forecast="forecast" />
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ranking</p>
          <h3 class="mt-2 text-xl font-semibold text-slate-900">Lojas por desempenho</h3>
        </div>
      </div>

      <div class="overflow-hidden rounded-2xl border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-left">
          <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th class="px-4 py-3">Loja</th>
              <th class="px-4 py-3">SKU</th>
              <th class="px-4 py-3">Leitura</th>
              <th class="px-4 py-3">Pendência</th>
              <th class="px-4 py-3">Acertabilidade</th>
              <th class="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 bg-white text-sm text-slate-700">
            <tr v-for="store in filteredStores" :key="store.code">
              <td class="px-4 py-3 font-semibold text-slate-900">{{ store.code }}</td>
              <td class="px-4 py-3">{{ store.totalSku.toLocaleString('pt-BR') }}</td>
              <td class="px-4 py-3">{{ store.readPct.toFixed(2) }}%</td>
              <td class="px-4 py-3">{{ store.pendingPct.toFixed(2) }}%</td>
              <td class="px-4 py-3">{{ store.accuracyPct.toFixed(2) }}%</td>
              <td class="px-4 py-3">
                <span
                  class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  :class="store.pendingPct <= 3 ? 'bg-emerald-100 text-emerald-700' : store.pendingPct <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'"
                >
                  {{ getStoreStatusLabel(store.pendingPct) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
