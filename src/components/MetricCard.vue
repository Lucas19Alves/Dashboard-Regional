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

const tones = {
  default: 'border-slate-200 bg-white text-slate-900',
  blue: 'border-sky-200 bg-sky-50 text-sky-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  orange: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-rose-200 bg-rose-50 text-rose-800',
}
</script>

<template>
  <div :class="['rounded-2xl border p-4 shadow-sm', tones[tone] || tones.default]">
    <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{{ label }}</p>
    <p class="mt-3 text-3xl font-bold leading-none">{{ value }}</p>
    <p v-if="subtext" class="mt-2 text-sm text-slate-600">{{ subtext }}</p>
  </div>
</template>
