<script setup>
import { computed } from 'vue'

const props = defineProps({
  summary: Object,
  forecast: Object,
})

const insightText = computed(() => {
  if (!props.summary) return 'Sem dados para análise.'

  if (props.summary.pendingPct <= 3) {
    return 'A regional está dentro da meta de pendência e o ciclo está saudável para o fechamento da auditoria.'
  }

  if (props.summary.pendingPct <= 7) {
    return 'A regional está em atenção. Há espaço para acelerar a leitura e reduzir o percentual pendente.'
  }

  return 'A regional está acima da meta. O foco deve ser na leitura de itens ainda não revisados e no contingenciamento de lojas com pior desempenho.'
})
</script>

<template>
  <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Insights</p>
        <h3 class="mt-2 text-xl font-semibold text-slate-900">Resumo da operação</h3>
      </div>
      <span class="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">{{ forecast?.trend || 'em análise' }}</span>
    </div>

    <p class="mt-4 text-sm leading-6 text-slate-700">{{ insightText }}</p>

    <div class="mt-5 grid gap-3 md:grid-cols-3">
      <div class="rounded-2xl bg-slate-50 p-3">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pace atual</p>
        <p class="mt-2 text-lg font-bold text-slate-900">{{ forecast?.pace ?? 0 }}%/h</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-3">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Projeção</p>
        <p class="mt-2 text-lg font-bold text-slate-900">{{ forecast?.projected ?? 0 }}%</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-3">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pendência</p>
        <p class="mt-2 text-lg font-bold text-slate-900">{{ summary?.pendingPct ?? 0 }}%</p>
      </div>
    </div>
  </div>
</template>
