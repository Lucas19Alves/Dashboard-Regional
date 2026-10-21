<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useRoute } from 'vue-router'
import { getRegion } from './lib/regions'

const isInfoModalOpen = ref(false)
const installPrompt = ref(null)
const canInstall = ref(false)

const route = useRoute()
const regionId = computed(() => String(route.params.region || ''))
const activeRegion = computed(() => getRegion(regionId.value))
const isRegionalArea = computed(() => Boolean(route.params.region))
const menuItems = computed(() => [
  { name: 'Auditorias', to: `/regional/${regionId.value}/auditorias`, icon: 'fa-solid fa-calendar-days' },
  { name: 'Relatórios', to: `/regional/${regionId.value}/relatorios`, icon: 'fa-solid fa-chart-column' },
  { name: 'Backup', to: `/regional/${regionId.value}/backup`, icon: 'fa-solid fa-box-archive' },
])

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

function captureInstallPrompt(event) {
  event.preventDefault()
  installPrompt.value = event
  canInstall.value = true
}

async function installApp() {
  if (!installPrompt.value) return
  await installPrompt.value.prompt()
  await installPrompt.value.userChoice
  installPrompt.value = null
  canInstall.value = false
}

onMounted(() => window.addEventListener('beforeinstallprompt', captureInstallPrompt))
onBeforeUnmount(() => window.removeEventListener('beforeinstallprompt', captureInstallPrompt))
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <RouterLink to="/" class="wordmark" aria-label="Auditorias regionais, escolher regional">
          <span class="wordmark-tag" aria-hidden="true"></span>
          Auditorias
        </RouterLink>

        <RouterLink v-if="isRegionalArea" to="/" class="region-switch" title="Trocar regional">
          <span>Regional</span>
          <strong>{{ activeRegion.code }}</strong>
          <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true"></i>
        </RouterLink>

        <nav v-if="isRegionalArea" class="topnav" aria-label="Navegação principal">
          <RouterLink v-for="item in menuItems" :key="item.name" :to="item.to" class="topnav-link" active-class="topnav-link-active">
            {{ item.name }}
          </RouterLink>
        </nav>

        <div class="topbar-actions">
          <button v-if="canInstall" type="button" class="install-btn" title="Instalar aplicativo" @click="installApp">
            <i class="fa-solid fa-download" aria-hidden="true"></i>
            <span>Instalar app</span>
          </button>
          <button type="button" class="icon-btn" aria-label="Sobre o projeto" title="Sobre o projeto" @click="openInfo()">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </header>

    <main class="content-panel">
      <RouterView />
    </main>

    <nav v-if="isRegionalArea" class="bottom-navbar" aria-label="Navegação principal">
      <RouterLink v-for="item in menuItems" :key="item.name" :to="item.to" class="nav-pill" active-class="nav-pill-active">
        <i :class="item.icon" aria-hidden="true"></i>
        <span>{{ item.name }}</span>
      </RouterLink>
    </nav>
  </div>

  <div v-if="isInfoModalOpen" class="modal-backdrop" @click.self="closeInfo()" @keydown.esc="closeInfo()">
    <div class="about-card" role="dialog" aria-modal="true" aria-labelledby="project-info-title">
      <div class="about-head">
        <h3 id="project-info-title">Sobre o projeto</h3>
        <button type="button" class="close-btn" aria-label="Fechar" @click="closeInfo()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      <div class="about-body">
        <p>
          Importa os consolidados de auditoria das lojas de cada regional, acompanha o andamento ao longo da semana e
          gera relatórios e backups a partir desses dados.
        </p>
        <p class="about-author">Criado por <strong>Lucas Alves</strong></p>
        <div class="about-links">
          <a v-for="link in projectLinks" :key="link.label" :href="link.href" target="_blank" rel="noreferrer" class="about-link">
            <i :class="link.icon" aria-hidden="true"></i>
            {{ link.label }}
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
