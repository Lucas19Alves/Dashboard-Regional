<script setup>
import { computed, onMounted, ref } from 'vue'
import { exportSessionsAsJson, importSessionsFromJson, listSessions } from '../lib/database'

const sessions = ref([])
const importInput = ref(null)
const statusText = ref('')
const pageSize = 5
const currentPage = ref(1)

const sortedSessions = computed(() => {
  return [...(sessions.value || [])].sort((a, b) => new Date(b.uploadedAt || b.createdAt || 0) - new Date(a.uploadedAt || a.createdAt || 0))
})

const totalPages = computed(() => Math.max(1, Math.ceil((sortedSessions.value.length || 0) / pageSize)))

const paginatedSessions = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return sortedSessions.value.slice(start, start + pageSize)
})

function getAuditTypeLabel(session) {
  const dayKey = session.dayKey || session.day || ''
  const lookup = {
    monday: 'Etiqueta',
    tuesday: 'Presença',
    wednesday: 'Ruptura',
    thursday: 'Etiqueta',
  }

  const label = lookup[dayKey] || session.dayLabel || 'Auditoria'
  const date = session.isoDate || session.date || session.dayLabel || ''
  const formattedDate = date && !Number.isNaN(new Date(`${date}T00:00:00`).getTime())
    ? new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : ''

  return { label, date: formattedDate }
}

function changePage(nextPage) {
  currentPage.value = Math.min(Math.max(nextPage, 1), totalPages.value)
}

async function loadSessions() {
  sessions.value = await listSessions()
  currentPage.value = 1
}

async function exportBackup() {
  const payload = await exportSessionsAsJson()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `regional-sp6-backup-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  statusText.value = 'Backup exportado com sucesso.'
}

async function importBackup(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const payload = JSON.parse(await file.text())
    const count = await importSessionsFromJson(payload)
    await loadSessions()
    statusText.value = `${count} sessões importadas com sucesso.`
  } catch (error) {
    statusText.value = 'Arquivo inválido. Verifique o backup exportado pelo sistema.'
  }

  event.target.value = ''
}

onMounted(async () => {
  await loadSessions()
})
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Backup</p>
      <h1 class="mt-2 text-3xl font-bold text-slate-900">Exportação e importação do histórico</h1>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 class="text-xl font-semibold text-slate-900">Exportar backup</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600">Crie um arquivo JSON com o histórico completo do sistema para preservar os registros locais.</p>
        <button class="mt-5 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700" @click="exportBackup">
          Exportar arquivo JSON
        </button>
      </div>

      <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 class="text-xl font-semibold text-slate-900">Importar backup</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600">Recupere um histórico previamente exportado e reaproveite os registros salvos no IndexedDB.</p>
        <label class="mt-5 inline-flex cursor-pointer rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
          Importar JSON
          <input ref="importInput" type="file" accept="application/json" class="hidden" @change="importBackup" />
        </label>
      </div>
    </div>

    <div v-if="statusText" class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {{ statusText }}
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Histórico</p>
        <span class="text-xs font-medium text-slate-500">{{ sortedSessions.length }} registros</span>
      </div>

      <div class="mt-4 space-y-2">
        <div v-for="session in paginatedSessions" :key="session.id" class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-base font-semibold text-slate-900">
              {{ getAuditTypeLabel(session).label }}
            </p>
            <p class="mt-1 text-sm text-slate-600">
              {{ getAuditTypeLabel(session).date || session.dayLabel || 'Data indisponível' }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1 text-right">
            <span class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Arquivo</span>
            <span class="max-w-[180px] truncate text-sm text-slate-600" :title="session.sourceFile || 'Arquivo importado'">
              {{ session.sourceFile || 'Arquivo importado' }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="totalPages > 1" class="mt-5 flex items-center justify-between gap-3">
        <button
          class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="currentPage === 1"
          @click="changePage(currentPage - 1)"
        >
          Anterior
        </button>

        <span class="text-sm font-medium text-slate-600">Página {{ currentPage }} de {{ totalPages }}</span>

        <button
          class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="currentPage === totalPages"
          @click="changePage(currentPage + 1)"
        >
          Próxima
        </button>
      </div>
    </div>
  </div>
</template>
