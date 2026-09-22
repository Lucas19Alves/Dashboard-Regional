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
  { name: 'Backup', to: `/regional/${regionId.value}/backup`, icon: 'fa-solid fa-floppy-disk' },
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
    <RouterLink v-if="isRegionalArea" to="/" class="region-switcher" title="Trocar regional">
      <i class="fa-solid fa-arrow-left"></i>
      <span>Regionais</span>
      <strong>{{ activeRegion.code }}</strong>
    </RouterLink>
    <main class="content-panel">
      <RouterView />
    </main>

    <nav v-if="isRegionalArea" class="bottom-navbar" aria-label="Navegação principal">
      <template v-for="item in menuItems" :key="item.name">
        <RouterLink :to="item.to" class="nav-pill" active-class="nav-pill-active" :title="item.name">
          <i :class="item.icon" aria-hidden="true"></i>
          <span>{{ item.name }}</span>
        </RouterLink>
      </template>
    </nav>

    <button type="button" class="info-fab" aria-label="Informações do projeto" title="Informações" @click="openInfo()">
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
    </button>
    <button v-if="canInstall" type="button" class="install-fab" title="Instalar aplicativo" @click="installApp">
      <i class="fa-solid fa-download" aria-hidden="true"></i>
      <span>Instalar</span>
    </button>
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
