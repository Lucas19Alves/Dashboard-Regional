<script setup>
import { computed } from 'vue'

const props = defineProps({
  days: Array,
  sessions: Array,
  selectedIso: String,
  weekLabel: String,
})

const emit = defineEmits(['select-day', 'move-week'])

const sessionByDay = computed(() => {
  const map = {}
  for (const session of props.sessions || []) {
    if (session?.isoDate) {
      map[session.isoDate] = session
    }
  }
  return map
})

function selectDay(day) {
  emit('select-day', day)
}

function previousWeek() {
  emit('move-week', -1)
}

function nextWeek() {
  emit('move-week', 1)
}
</script>

<template>
  <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div class="mb-4 flex items-center justify-between gap-3">
      <button class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" @click="previousWeek">
        ← Semana anterior
      </button>
      <p class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{{ weekLabel || 'Semana' }}</p>
      <button class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" @click="nextWeek">
        Próxima semana →
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <button
        v-for="day in days"
        :key="day.iso"
        class="rounded-3xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :class="selectedIso === day.iso ? 'border-transparent bg-sky-50' : sessionByDay[day.iso] ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'"
        @click="selectDay(day)"
      >
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{{ day.label }}</span>
          <span class="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]" :class="sessionByDay[day.iso] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'">
            {{ sessionByDay[day.iso] ? 'Carregado' : 'Disponível' }}
          </span>
        </div>
        <div class="mt-5 flex items-center justify-between gap-3">
          <div class="text-left">
            <p class="text-2xl font-bold tracking-tight text-slate-900">{{ day.iso.slice(8, 10) }}/{{ day.iso.slice(5, 7) }}</p>
            <p class="text-xs text-slate-500">{{ day.activity }}</p>
          </div>
          <div class="text-right text-xs text-slate-500">
            <p v-if="sessionByDay[day.iso]" class="mt-1 font-semibold text-emerald-700">
              {{ (sessionByDay[day.iso].summary?.readPct || 0).toFixed(2) }}%
            </p>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
