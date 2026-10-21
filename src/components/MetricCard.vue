<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: String,
  value: [String, Number],
  subtext: String,
  tone: {
    type: String,
    default: 'default',
  },
})

const tones = {
  default: 'text-ink',
  slate: 'text-ink',
  blue: 'text-ink',
  green: 'text-good',
  orange: 'text-warn',
  red: 'text-bad',
}

// Percentuais no formato de etiqueta de preço: inteiro grande, decimais menores.
const parts = computed(() => {
  const match = String(props.value ?? '').match(/^(-?\d+)[.,](\d+)%$/)
  return match ? { whole: match[1], cents: match[2] } : null
})
</script>

<template>
  <div :class="tone === 'red' ? 'ui-card-alert' : 'ui-card'" class="flex flex-col px-5 py-4">
    <p class="ui-kpi-label">{{ label }}</p>
    <p class="ui-kpi-value" :class="tones[tone] || tones.default">
      <template v-if="parts">{{ parts.whole }}<span class="align-top text-[0.5em] leading-none">,{{ parts.cents }}%</span></template>
      <template v-else>{{ value }}</template>
    </p>
    <p v-if="subtext" class="mt-2 text-[14px] text-steel">{{ subtext }}</p>
  </div>
</template>
