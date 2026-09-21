<script setup>
import { REGION_LIST } from '../lib/regions'
</script>

<template>
  <div class="region-select-page">
    <section class="region-hero">
      <div class="region-hero-copy">
        <p class="eyebrow">Dashboard regional</p>
        <h1>Selecione a regional</h1>
        <p class="hero-description">Acesse os indicadores e auditorias da sua operação.</p>
      </div>
      <div class="region-count">
        <strong>{{ REGION_LIST.length }}</strong>
        <span>regionais disponíveis</span>
      </div>
    </section>

    <section class="region-grid" aria-label="Regionais disponíveis">
      <RouterLink
        v-for="region in REGION_LIST"
        :key="region.id"
        :to="`/regional/${region.id}/auditorias`"
        class="region-card"
        :class="`region-card-${region.accent}`"
      >
        <div class="region-card-top">
          <span class="region-code">{{ region.code }}</span>
          <span class="region-status">
            <i class="fa-solid fa-circle-check"></i>
            Disponível
          </span>
        </div>

        <div class="region-card-body">
          <div class="region-icon"><i class="fa-solid fa-store"></i></div>
          <h2>{{ region.name }}</h2>
          <p>{{ region.description }}</p>
        </div>

        <div class="region-card-footer">
          <div>
            <strong>{{ region.storeCodes.length || '—' }}</strong>
            <span>{{ region.storeCodes.length === 1 ? 'loja' : 'lojas' }}</span>
          </div>
          <span class="region-enter">Acessar <i class="fa-solid fa-arrow-right"></i></span>
        </div>
      </RouterLink>
    </section>

    <p class="region-footnote"><i class="fa-solid fa-shield-halved"></i> Os dados de cada regional permanecem separados.</p>
  </div>
</template>
