<script setup>
import { computed } from 'vue'
import { STORE_CODES, isCancelledStore } from '../lib/metrics'

const props = defineProps({
  stores: {
    type: Array,
    default: () => [],
  },
  selectedCodes: {
    type: Array,
    default: () => [],
  },
})

const chartStores = computed(() => {
  const allowedStores = (props.stores || []).filter((store) => STORE_CODES.includes(store.code) && !isCancelledStore(store))
  const active = (props.selectedCodes || []).filter((code) => STORE_CODES.includes(code))
  const selectedSet = active.length ? active : allowedStores.map((store) => store.code)

  return [...allowedStores]
    .filter((store) => selectedSet.includes(store.code))
    .sort((a, b) => b.readPct - a.readPct)
})
</script>

<template>
  <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Indicador principal</p>
        <h3 class="mt-2 text-xl font-semibold text-slate-900">% de itens lidos por loja</h3>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="store in chartStores" :key="store.code" class="space-y-1">
        <div class="flex items-center justify-between text-sm font-medium text-slate-700">
          <span>{{ store.code }}</span>
          <span>{{ store.readPct.toFixed(2) }}%</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            class="h-full rounded-full bg-gradient-to-r from-sky-500 via-emerald-500 to-emerald-600"
            :style="{ width: `${Math.min(store.readPct, 100)}%` }"
          />
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-500">
          <span>{{ store.pendingPct.toFixed(2) }}% pendente</span>
          <span>{{ store.accuracyPct.toFixed(2) }}% acertabilidade</span>
        </div>
      </div>
    </div>
  </div>
</template>
