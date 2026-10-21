<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useRoute } from 'vue-router'
import { getRegion } from './lib/regions'
import { applyTheme } from './lib/settings'
import { dataVersion, downloadBackup, lastBackupLabel, shouldRemind, snoozeReminder } from './lib/backup'
import { importSessionsFromJson, listSessions } from './lib/database'
import { toasts, dismissToast, confirmState, settleConfirm, notify } from './composables/feedback'
import { useModal } from './composables/useModal'

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

useModal(closeInfo, () => isInfoModalOpen.value)

// ---------- Backup: aviso de sistema vazio e lembrete após alterações ----------
const EMPTY_PROMPT_KEY = 'dashboard-empty-prompt-dismissed'
const isEmptyPromptOpen = ref(false)
const isRestoring = ref(false)
const restoreError = ref('')
const restoreInput = ref(null)

function closeEmptyPrompt() {
  isEmptyPromptOpen.value = false
  try { sessionStorage.setItem(EMPTY_PROMPT_KEY, '1') } catch { /* sem armazenamento */ }
}

useModal(closeEmptyPrompt, () => isEmptyPromptOpen.value)

async function checkEmptyData() {
  try {
    if (sessionStorage.getItem(EMPTY_PROMPT_KEY)) return
  } catch { /* sem armazenamento */ }
  try {
    const all = await listSessions()
    if (!all.length) isEmptyPromptOpen.value = true
  } catch {
    // Banco indisponível: nada a sugerir.
  }
}

async function restoreFromFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  isRestoring.value = true
  restoreError.value = ''
  try {
    const payload = JSON.parse(await file.text())
    if (!Array.isArray(payload?.sessions)) throw new Error('backup inválido')
    const count = await importSessionsFromJson(payload)
    if (!count) throw new Error('backup vazio')
    dataVersion.value += 1
    closeEmptyPrompt()
    notify(`Backup restaurado: ${count} ${count === 1 ? 'auditoria' : 'auditorias'}.`)
  } catch {
    restoreError.value = 'Esse arquivo não é um backup válido. Use o .json exportado pela página Backup.'
  } finally {
    isRestoring.value = false
  }
}

const showBackupReminder = computed(() => isRegionalArea.value && shouldRemind(activeRegion.value.id))

async function exportFromReminder() {
  const count = await downloadBackup(activeRegion.value)
  notify(`Backup da ${activeRegion.value.code} exportado com ${count} ${count === 1 ? 'auditoria' : 'auditorias'}.`)
}
useModal(() => settleConfirm(false), () => confirmState.open)
applyTheme()

const toastIcons = {
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-exclamation',
  info: 'fa-solid fa-circle-info',
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

onMounted(() => {
  window.addEventListener('beforeinstallprompt', captureInstallPrompt)
  checkEmptyData()
})
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
          <RouterLink to="/configuracoes" class="icon-btn" aria-label="Configurações" title="Configurações" active-class="icon-btn-active">
            <i class="fa-solid fa-gear" aria-hidden="true"></i>
          </RouterLink>
          <button type="button" class="icon-btn" aria-label="Sobre o projeto" title="Sobre o projeto" @click="openInfo()">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </header>

    <div v-if="showBackupReminder" class="backup-reminder" role="status">
      <div class="backup-reminder-inner">
        <i class="fa-solid fa-box-archive text-[18px]" aria-hidden="true"></i>
        <p>
          <strong>Exporte um backup da {{ activeRegion.code }}.</strong>
          Você fez alterações importantes e os dados ficam só neste navegador. {{ lastBackupLabel(activeRegion.id) }}
        </p>
        <div class="backup-reminder-actions">
          <button type="button" class="ui-btn-primary" @click="exportFromReminder">Exportar backup</button>
          <button type="button" class="ui-btn-secondary" @click="snoozeReminder(activeRegion.id)">Agora não</button>
        </div>
      </div>
    </div>

    <main class="content-panel">
      <RouterView :key="`${String(route.params.region || '')}-${dataVersion}`" />
    </main>

    <nav v-if="isRegionalArea" class="bottom-navbar" aria-label="Navegação principal">
      <RouterLink v-for="item in menuItems" :key="item.name" :to="item.to" class="nav-pill" active-class="nav-pill-active">
        <i :class="item.icon" aria-hidden="true"></i>
        <span>{{ item.name }}</span>
      </RouterLink>
    </nav>
  </div>

  <div class="toast-stack" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="toast in toasts" :key="toast.id" class="toast" :class="`toast-${toast.tone}`" role="status">
        <i :class="toastIcons[toast.tone] || toastIcons.info" aria-hidden="true"></i>
        <span>{{ toast.message }}</span>
        <button type="button" aria-label="Fechar aviso" @click="dismissToast(toast.id)">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    </TransitionGroup>
  </div>

  <div v-if="confirmState.open" class="modal-backdrop" @click.self="settleConfirm(false)">
    <div class="ui-modal max-w-[420px]" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <h3 id="confirm-title" class="font-display text-[26px] font-semibold leading-tight text-ink">{{ confirmState.title }}</h3>
      <p v-if="confirmState.message" id="confirm-message" class="mt-2 text-[15px] leading-6 text-steel">{{ confirmState.message }}</p>
      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="ui-btn-secondary" @click="settleConfirm(false)">Cancelar</button>
        <button type="button" :class="confirmState.tone === 'danger' ? 'ui-btn-danger-solid' : 'ui-btn-primary'" autofocus @click="settleConfirm(true)">
          {{ confirmState.confirmLabel }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="isEmptyPromptOpen" class="modal-backdrop" @click.self="closeEmptyPrompt">
    <div class="ui-modal max-w-[460px]" role="dialog" aria-modal="true" aria-labelledby="empty-title">
      <h3 id="empty-title" class="font-display text-[28px] font-semibold leading-tight text-ink">Nenhuma auditoria neste navegador</h3>
      <p class="mt-2 text-[15px] leading-6 text-steel">
        Se você já usou o sistema em outro computador ou limpou o navegador, importe o arquivo de backup (.json) para recuperar o histórico.
      </p>
      <p v-if="restoreError" class="mt-3 text-[14px] font-medium text-bad" role="alert">{{ restoreError }}</p>
      <input ref="restoreInput" type="file" accept="application/json,.json" class="hidden" @change="restoreFromFile" />
      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="ui-btn-secondary" :disabled="isRestoring" @click="closeEmptyPrompt">Começar sem backup</button>
        <button type="button" class="ui-btn-primary" :disabled="isRestoring" @click="restoreInput?.click()">
          <i :class="isRestoring ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-upload'" aria-hidden="true"></i>
          Importar backup
        </button>
      </div>
    </div>
  </div>

  <div v-if="isInfoModalOpen" class="modal-backdrop" @click.self="closeInfo()">
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
