<script setup>
import { computed } from 'vue'
import { getRegionList } from '../lib/regions'

const regions = computed(() => getRegionList())
</script>

<template>
  <div class="region-select-page">
    <section class="region-intro">
      <h1>Qual regional você vai acompanhar?</h1>
      <p>Cada regional tem o próprio calendário de auditorias, relatórios e backup.</p>
    </section>

    <section class="region-list" aria-label="Regionais">
      <RouterLink
        v-for="region in regions"
        :key="region.id"
        :to="`/regional/${region.id}/auditorias`"
        class="region-card"
      >
        <span class="region-tag" aria-hidden="true">{{ region.code }}</span>
        <div class="min-w-0">
          <h2>{{ region.name }}</h2>
          <p>{{ region.storeCodes.length || 'Sem' }} {{ region.storeCodes.length === 1 ? 'loja' : 'lojas' }}</p>
        </div>
        <i class="fa-solid fa-arrow-right region-go" aria-hidden="true"></i>
      </RouterLink>
    </section>

    <p class="region-footnote">Os dados ficam salvos neste navegador, separados por regional.</p>
  </div>
</template>
