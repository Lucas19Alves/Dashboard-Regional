<script setup>
defineProps({
  label: String,
  value: [String, Number],
  subtext: String,
  tone: {
    type: String,
    default: 'default',
  },
})

// Tom aplicado ao valor, como nos cards do relatório.
const tones = {
  default: 'text-slate-900',
  slate: 'text-slate-900',
  blue: 'text-sky-700',
  green: 'text-emerald-600',
  orange: 'text-amber-600',
  red: 'text-rose-600',
}
</script>

<template>
  <div :class="tone === 'red' ? 'ui-card-alert' : 'ui-card'" class="flex flex-col justify-center px-6 py-5">
    <p class="ui-kpi-label" :class="tone === 'red' ? '!text-rose-600' : ''">{{ label }}</p>
    <p class="ui-kpi-value" :class="tones[tone] || tones.default">{{ value }}</p>
    <p v-if="subtext" class="mt-1.5 text-sm font-semibold text-slate-500">{{ subtext }}</p>
  </div>
</template>
