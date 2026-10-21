<script setup>
import { computed } from 'vue'
import { getTodayIso } from '../lib/metrics'

const props = defineProps({
  days: Array,
  sessions: Array,
  selectedIso: String,
  weekLabel: String,
})

const emit = defineEmits(['select-day', 'move-week', 'go-today'])

const todayIso = getTodayIso()

// Semana de segunda a domingo que contém hoje?
const showsToday = computed(() => {
  const first = props.days?.[0]?.iso
  if (!first) return true
  const sunday = new Date(`${first}T00:00:00`)
  sunday.setDate(sunday.getDate() + 6)
  const end = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
  return todayIso >= first && todayIso <= end
})

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
  <section class="ui-card p-4 sm:p-5" aria-label="Semana de auditorias">
    <div class="mb-4 flex items-center justify-between gap-3">
      <button type="button" class="ui-btn-secondary !px-3" aria-label="Semana anterior" @click="previousWeek">
        <i class="fa-solid fa-chevron-left text-xs" aria-hidden="true"></i>
        <span class="hidden sm:inline">Anterior</span>
      </button>
      <div class="flex min-w-0 flex-col items-center sm:flex-row sm:gap-3">
        <p class="truncate font-display text-[20px] font-semibold text-ink">{{ weekLabel || 'Semana' }}</p>
        <button v-if="!showsToday" type="button" class="text-[14px] font-semibold text-ink underline underline-offset-4 hover:no-underline" @click="emit('go-today')">
          Ir para hoje
        </button>
      </div>
      <button type="button" class="ui-btn-secondary !px-3" aria-label="Próxima semana" @click="nextWeek">
        <span class="hidden sm:inline">Próxima</span>
        <i class="fa-solid fa-chevron-right text-xs" aria-hidden="true"></i>
      </button>
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <button
        v-for="day in days"
        :key="day.iso"
        type="button"
        class="day-tag"
        :class="{ 'day-tag-selected': selectedIso === day.iso, 'day-tag-loaded': sessionByDay[day.iso] }"
        :aria-pressed="selectedIso === day.iso"
        @click="selectDay(day)"
      >
        <span class="flex items-baseline justify-between gap-2">
          <span class="text-[15px] font-semibold">{{ day.label }}</span>
          <span class="truncate text-[13px] font-medium opacity-75">{{ day.activity }}</span>
        </span>
        <span class="mt-3 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          <span class="font-display text-[30px] font-semibold leading-none sm:text-[38px]">
            {{ day.iso.slice(8, 10) }}/{{ day.iso.slice(5, 7) }}
            <span v-if="day.iso === todayIso" class="day-today">hoje</span>
          </span>
          <span v-if="sessionByDay[day.iso]" class="text-right leading-tight">
            <span class="hidden text-[12px] font-medium opacity-75 sm:block">{{ (sessionByDay[day.iso].auditType || day.activity) === 'Etiqueta' ? 'Leitura' : 'Presença' }}</span>
            <span class="font-display text-[19px] font-semibold sm:text-[22px]">{{ (sessionByDay[day.iso].summary?.readPct || 0).toFixed(1).replace('.', ',') }}%</span>
          </span>
          <span v-else class="text-[13px] font-semibold opacity-70">
            <i class="fa-solid fa-plus text-[10px]" aria-hidden="true"></i><span class="hidden sm:inline"> Importar</span>
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.day-tag {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 112px;
  padding: 14px 14px 14px 24px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--paper);
  color: var(--steel);
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}

/* Furo da etiqueta */
.day-tag::before {
  content: '';
  position: absolute;
  top: 20px;
  left: 10px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: var(--floor);
}

.day-tag:hover { border-color: var(--ink); }

.day-tag-loaded { color: var(--ink); }
.day-tag-loaded::after {
  content: '';
  position: absolute;
  top: 14px;
  bottom: 14px;
  left: 0;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--good);
}

.day-tag-selected,
.day-tag-selected:hover {
  border-color: #E0B800;
  background: var(--tag);
  color: var(--tag-ink);
}

.day-tag-selected::before { border-color: rgba(27, 36, 48, 0.35); }
.day-tag-selected::after { background: var(--tag-ink); }
.day-today {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--ink);
  color: var(--paper);
  font-family: 'Barlow', sans-serif;
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

.day-tag-selected .day-today { background: var(--tag-ink); color: #fff; }
</style>
