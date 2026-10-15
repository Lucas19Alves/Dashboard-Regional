<script setup>
// Cabeçalho das páginas: eyebrow, título e chips de contexto à direita.
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  chips: { type: Array, default: () => [] }, // [{ label, value }]
})
</script>

<template>
  <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div class="min-w-0">
      <p class="ui-eyebrow">{{ eyebrow }}</p>
      <h1 class="ui-page-title">{{ title }}</h1>
      <p v-if="description" class="mt-2 max-w-3xl text-sm font-medium text-slate-500">{{ description }}</p>
    </div>
    <div v-if="chips.length || $slots.default" class="flex flex-wrap items-end gap-2 lg:justify-end">
      <div v-for="chip in chips" :key="chip.label" class="ui-chip">
        <span>{{ chip.label }}</span>
        <strong>{{ chip.value }}</strong>
      </div>
      <slot />
    </div>
  </header>
</template>
