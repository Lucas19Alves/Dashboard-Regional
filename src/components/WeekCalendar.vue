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
  <div class="ui-card p-4">
    <div class="mb-4 flex items-center justify-between gap-3">
      <button class="ui-btn-secondary" @click="previousWeek">
        ← Semana anterior
      </button>
      <p class="ui-eyebrow">{{ weekLabel || 'Semana' }}</p>
      <button class="ui-btn-secondary" @click="nextWeek">
        Próxima semana →
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <button
        v-for="day in days"
        :key="day.iso"
        class="rounded-[22px] border p-5 text-left shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-md"
        :class="selectedIso === day.iso ? 'border-sky-300 bg-sky-50 ring-2 ring-sky-100' : sessionByDay[day.iso] ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'"
        @click="selectDay(day)"
      >
        <div class="flex items-center justify-between">
          <span class="ui-eyebrow">{{ day.label }}</span>
          <span class="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]" :class="sessionByDay[day.iso] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'">
            {{ sessionByDay[day.iso] ? 'Carregado' : 'Disponível' }}
          </span>
        </div>
        <div class="mt-5 flex items-center justify-between gap-3">
          <div class="text-left">
            <p class="text-[30px] font-black leading-none tracking-tight text-slate-900">{{ day.iso.slice(8, 10) }}/{{ day.iso.slice(5, 7) }}</p>
            <p class="mt-1 text-sm font-semibold text-slate-500">{{ day.activity }}</p>
          </div>
          <div class="text-right text-xs text-slate-500">
            <p v-if="sessionByDay[day.iso]" class="mt-1 text-lg font-black text-emerald-600">
              {{ (sessionByDay[day.iso].summary?.readPct || 0).toFixed(2) }}%
            </p>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
