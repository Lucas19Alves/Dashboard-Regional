<script setup>
import PageHeader from '../components/PageHeader.vue'
import { computed, onMounted, ref } from 'vue'
import { importSessionsFromJson, listSessions } from '../lib/database'
import { downloadBackup, lastBackupLabel } from '../lib/backup'
import { useRoute } from 'vue-router'
import { getRegion } from '../lib/regions'

const route = useRoute()
const region = computed(() => getRegion(route.params.region))

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

const sessionMetadata = computed(() => {
  return Object.fromEntries(
    (sessions.value || []).map((session) => [session.id, getAuditTypeLabel(session)]),
  )
})

function changePage(nextPage) {
  currentPage.value = Math.min(Math.max(nextPage, 1), totalPages.value)
}

async function loadSessions() {
  sessions.value = await listSessions(region.value.id)
  currentPage.value = 1
}

async function exportBackup() {
  const count = await downloadBackup(region.value)
  statusText.value = `Backup exportado com ${count} ${count === 1 ? 'auditoria' : 'auditorias'}.`
}

async function importBackup(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const payload = JSON.parse(await file.text())
    const count = await importSessionsFromJson(payload)
    await loadSessions()
    statusText.value = `${count} ${count === 1 ? 'auditoria importada' : 'auditorias importadas'}.`
  } catch (error) {
    statusText.value = 'Arquivo inválido. Use um backup .json exportado por este sistema.'
  }

  event.target.value = ''
}

onMounted(async () => {
  await loadSessions()
})
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      :eyebrow="region.name"
      title="Backup"
      description="Os dados ficam só neste navegador. Exporte um arquivo de vez em quando para não perder o histórico ou para levá-lo a outro computador."
      :chips="[{ label: 'Auditorias salvas', value: sortedSessions.length }]"
    />

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="ui-card flex flex-col p-6">
        <h2 class="ui-title !mt-0">Exportar</h2>
        <p class="mt-2 flex-1 text-[15px] leading-6 text-steel">Baixa um arquivo .json com todas as auditorias da {{ region.name }}. {{ lastBackupLabel(region.id) }}</p>
        <div class="mt-5">
          <button type="button" class="ui-btn-primary" @click="exportBackup">
            <i class="fa-solid fa-download text-sm" aria-hidden="true"></i>
            Exportar backup
          </button>
        </div>
      </section>

      <section class="ui-card flex flex-col p-6">
        <h2 class="ui-title !mt-0">Importar</h2>
        <p class="mt-2 flex-1 text-[15px] leading-6 text-steel">Restaura um arquivo exportado antes. Auditorias da mesma data são substituídas pelas do arquivo.</p>
        <div class="mt-5">
          <label class="ui-btn-secondary cursor-pointer">
            <i class="fa-solid fa-upload text-sm" aria-hidden="true"></i>
            Importar backup
            <input ref="importInput" type="file" accept="application/json" class="hidden" @change="importBackup" />
          </label>
        </div>
      </section>
    </div>

    <p
      v-if="statusText"
      class="rounded-md border px-4 py-3 text-[15px] font-medium"
      :class="statusText.startsWith('Arquivo inválido') ? 'border-bad/30 bg-bad/5 text-bad' : 'border-good/30 bg-good/5 text-good'"
      role="status"
    >
      {{ statusText }}
    </p>

    <section class="ui-card p-5">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="ui-title !mt-0">Histórico</h2>
        <span class="text-[14px] text-steel">{{ sortedSessions.length }} {{ sortedSessions.length === 1 ? 'registro' : 'registros' }}</span>
      </div>

      <p v-if="!sortedSessions.length" class="mt-4 rounded-md border border-dashed border-line-strong px-4 py-6 text-[15px] text-steel">
        Nenhuma auditoria salva nesta regional.
      </p>

      <ul v-else class="mt-3 divide-y divide-line">
        <li v-for="session in paginatedSessions" :key="session.id" class="flex items-center justify-between gap-4 py-3">
          <div class="flex min-w-0 items-baseline gap-3">
            <span class="w-[52px] shrink-0 font-display text-[22px] font-semibold leading-none text-ink">
              {{ sessionMetadata[session.id]?.date || '—' }}
            </span>
            <span class="truncate text-[16px] font-semibold text-ink">{{ sessionMetadata[session.id]?.label || 'Auditoria' }}</span>
          </div>
          <span class="max-w-[45%] truncate text-right text-[14px] text-steel" :title="session.sourceFile || 'Arquivo importado'">
            {{ session.sourceFile || 'Arquivo importado' }}
          </span>
        </li>
      </ul>

      <div v-if="totalPages > 1" class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
        <button type="button" class="ui-btn-secondary" :disabled="currentPage === 1" @click="changePage(currentPage - 1)">
          <i class="fa-solid fa-chevron-left text-xs" aria-hidden="true"></i>
          Anterior
        </button>
        <span class="text-[14px] text-steel">Página {{ currentPage }} de {{ totalPages }}</span>
        <button type="button" class="ui-btn-secondary" :disabled="currentPage === totalPages" @click="changePage(currentPage + 1)">
          Próxima
          <i class="fa-solid fa-chevron-right text-xs" aria-hidden="true"></i>
        </button>
      </div>
    </section>
  </div>
</template>
