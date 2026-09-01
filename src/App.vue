<script setup>
import { ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

const isSidebarCollapsed = ref(false)
const isInfoModalOpen = ref(false)

const menuItems = [
  { name: 'Auditorias', to: '/', icon: 'fa-solid fa-calendar-days' },
  { name: 'Relatórios', to: '/reports', icon: 'fa-solid fa-chart-column' },
  { name: 'Backup', to: '/backup', icon: 'fa-solid fa-floppy-disk' },
]

const projectLinks = [
  { label: 'GitHub', icon: 'fab fa-github', href: 'https://github.com/Lucas19Alves' },
  { label: 'LinkedIn', icon: 'fab fa-linkedin-in', href: 'https://www.linkedin.com/in/lucaas19alves/' },
  { label: 'Portfólio', icon: 'fas fa-globe', href: 'https://portfolio-lucasalves.vercel.app/' },
]

function openInfo() {
  isInfoModalOpen.value = true
}

function closeInfo() {
  isInfoModalOpen.value = false
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell-collapsed': isSidebarCollapsed }">
    <aside class="sidebar" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
      <div class="brand-wrap">
        <button class="collapse-toggle" @click="isSidebarCollapsed = !isSidebarCollapsed"
          aria-label="Alternar menu lateral">
          <i class="fa-solid fa-bars"></i>
        </button>

        <div v-if="!isSidebarCollapsed" class="brand-copy">
          <p class="brand-overline">Auditorias</p>
          <h2 class="brand-title">Regional SP6</h2>
        </div>

        <div v-else class="brand-badge">SP6</div>
      </div>

      <nav class="nav-list" :class="{ 'nav-list-collapsed': isSidebarCollapsed }">
        <template v-for="item in menuItems" :key="item.name">
          <RouterLink :to="item.to" class="nav-item" :class="{ 'nav-item-collapsed': isSidebarCollapsed }"
            active-class="nav-item-active" :title="item.name">
            <i :class="item.icon" aria-hidden="true"></i>
            <span class="nav-item-text">&nbsp;&nbsp;&nbsp; {{ item.name }}</span>
          </RouterLink>
        </template>
      </nav>

      <div class="sidebar-footer">
        <button type="button" class="nav-item nav-item-action" :class="{ 'nav-item-collapsed': isSidebarCollapsed }"
          title="Info" @click="openInfo()">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          <span class="nav-item-text">&nbsp;&nbsp;&nbsp;Info</span>
        </button>
      </div>
    </aside>

    <main class="content-panel">
      <RouterView />
    </main>
  </div>

  <div v-if="isInfoModalOpen" class="modal-backdrop" @click.self="closeInfo()">
    <div class="project-info-card project-info-modal" role="dialog" aria-modal="true"
      aria-labelledby="project-info-title">
      <div class="project-header">
        <div class="project-icon">
          <i class="fa-solid fa-circle-info"></i>
        </div>
        <div>
          <h3 id="project-info-title">Sobre o projeto</h3>
          <p>Informações sobre o desenvolvedor</p>
        </div>
        <button type="button" class="project-close" @click="closeInfo()" aria-label="Fechar informações">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="project-body">
        <p>
          Sistema projetado para importar e tratar os consolidados de auditorias de lojas a nível Regional, acompanhar o
          progresso por período e gerar análises, relatórios e backups com os dados fornecidos.
        </p>

        <div class="project-signature">
          <span>Criado por</span>
          <strong>Lucas Alves</strong>
        </div>

        <div class="project-links">
          <a v-for="link in projectLinks" :key="link.label" :href="link.href" target="_blank" rel="noreferrer"
            class="project-link">
            <i :class="link.icon"></i>
            <span>{{ link.label }}</span>
          </a>
        </div>
      </div>

      <div class="project-footer">
        <button type="button" class="project-close-button" @click="closeInfo()">Fechar</button>
      </div>
    </div>
  </div>
</template>
