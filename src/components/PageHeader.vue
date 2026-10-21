<script setup>
// Cabeçalho das páginas: título à esquerda e fatos de contexto à direita.
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  chips: { type: Array, default: () => [] }, // [{ label, value }]
})
</script>

<template>
  <header class="flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
    <div class="min-w-0">
      <p v-if="eyebrow" class="text-[15px] font-semibold text-steel">{{ eyebrow }}</p>
      <h1 class="ui-page-title mt-1">{{ title }}</h1>
      <p v-if="description" class="mt-2 max-w-[68ch] text-[15px] text-steel">{{ description }}</p>
    </div>
    <div v-if="chips.length || $slots.default" class="flex flex-wrap items-end gap-y-3 lg:justify-end">
      <div v-for="chip in chips" :key="chip.label" class="ui-chip">
        <span>{{ chip.label }}</span>
        <strong>{{ chip.value }}</strong>
      </div>
      <slot />
    </div>
  </header>
</template>
