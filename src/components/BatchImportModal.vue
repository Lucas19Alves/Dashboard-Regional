<script setup>
import { computed, ref } from 'vue'
import { useModal } from '../composables/useModal'
import { EXPECTED_COLUMNS, buildSessionPayload, detectDateFromContent, detectDateFromFileName, getAuditDay, parseRows, readSpreadsheet } from '../lib/importer'
import { deleteSession, upsertSession } from '../lib/database'

const props = defineProps({
  region: { type: Object, required: true },
  storeCodes: { type: Array, required: true },
  sessions: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'imported'])

// Cada arquivo: { id, file, matrix, iso, source, error }
const items = ref([])
const isDragging = ref(false)
const isReading = ref(false)
const isSaving = ref(false)
let nextId = 1

function close() {
  if (!isSaving.value) emit('close')
}

useModal(close)

async function addFiles(fileList) {
  const files = [...(fileList || [])].filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name))
  if (!files.length) return
  isReading.value = true
  for (const file of files) {
    const item = { id: nextId++, file, matrix: null, iso: '', source: '', error: '' }
    try {
      const { matrix, rawMatrix } = await readSpreadsheet(file)
      item.matrix = matrix
      const fromContent = detectDateFromContent(rawMatrix)
      const fromName = detectDateFromFileName(file.name)
      item.iso = fromContent || fromName
      item.source = fromContent ? 'conteúdo' : fromName ? 'nome do arquivo' : ''
    } catch {
      item.error = 'Não foi possível ler o arquivo.'
    }
    items.value.push(item)
  }
  isReading.value = false
}

function handleDrop(event) {
  isDragging.value = false
  addFiles(event.dataTransfer?.files)
}

function handlePick(event) {
  addFiles(event.target.files)
  event.target.value = ''
}

function removeItem(id) {
  items.value = items.value.filter((item) => item.id !== id)
}

// Situação de cada arquivo com a data atual (editável).
const rows = computed(() => {
  const seen = {}
  return items.value.map((item) => {
    const day = getAuditDay(item.iso)
    const parsed = item.matrix && day ? parseRows(item.matrix, day.activity, props.storeCodes) : []
    const existing = day ? props.sessions.find((session) => session.isoDate === day.iso) : null
    let problem = item.error
    if (!problem && !item.iso) problem = 'Informe a data da auditoria.'
    else if (!problem && !day) problem = 'A data cai fora de segunda a quinta.'
    else if (!problem && !parsed.length) problem = `Nenhuma loja encontrada. Colunas esperadas para ${day.activity}: ${EXPECTED_COLUMNS[day.activity]}.`
    if (!problem && seen[day.iso]) problem = 'Outro arquivo da lista já usa esta data.'
    if (day && !problem) seen[day.iso] = true
    return { item, day, parsed, existing, problem }
  })
})

const readyRows = computed(() => rows.value.filter((row) => !row.problem))

async function importAll() {
  if (!readyRows.value.length || isSaving.value) return
  isSaving.value = true
  const results = []
  try {
    for (const row of readyRows.value) {
      const payload = buildSessionPayload({
        region: props.region,
        storeCodes: props.storeCodes,
        day: row.day,
        rows: row.parsed,
        fileName: row.item.file.name,
        previousSession: row.existing,
      })
      if (row.existing && row.existing.id !== payload.id) await deleteSession(row.existing.id)
      await upsertSession(payload)
      results.push({ iso: row.day.iso, type: row.day.activity, stores: row.parsed.length, replaced: Boolean(row.existing) })
    }
    emit('imported', results)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-3 sm:items-center sm:p-4" @click.self="close">
    <div class="ui-modal flex max-h-[92vh] max-w-3xl flex-col" role="dialog" aria-modal="true" aria-labelledby="batch-title">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 id="batch-title" class="font-display text-[28px] font-semibold leading-tight text-ink">Importar várias planilhas</h3>
          <p class="mt-1 max-w-[60ch] text-[15px] text-steel">
            A data é lida da planilha ou do nome do arquivo, e o tipo segue o calendário: segunda e quinta Etiqueta, terça Presença, quarta Ruptura. Confira antes de importar.
          </p>
        </div>
        <button type="button" class="close-btn" aria-label="Fechar" :disabled="isSaving" @click="close">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <label
        class="mt-5 flex cursor-pointer items-center justify-center gap-3 rounded-md border-2 border-dashed px-5 py-5 text-center transition-colors"
        :class="isDragging ? 'border-ink bg-tag-soft' : 'border-line-strong bg-floor/50 hover:border-steel'"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <input type="file" accept=".xlsx,.xls,.csv" multiple class="hidden" @change="handlePick" />
        <i class="fa-solid fa-copy text-xl text-steel" aria-hidden="true"></i>
        <span class="text-[15px] font-semibold text-ink">
          {{ isReading ? 'Lendo arquivos…' : items.length ? 'Adicionar mais arquivos' : 'Arraste as planilhas ou clique para escolher' }}
        </span>
      </label>

      <div v-if="rows.length" class="mt-4 min-h-0 flex-1 overflow-y-auto">
        <ul class="divide-y divide-line">
          <li v-for="row in rows" :key="row.item.id" class="grid gap-x-4 gap-y-2 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div class="min-w-0">
              <p class="truncate text-[15px] font-semibold text-ink" :title="row.item.file.name">{{ row.item.file.name }}</p>
              <p v-if="row.problem" class="text-[13px] font-medium text-bad">{{ row.problem }}</p>
              <p v-else class="text-[13px] text-steel">
                {{ row.day.activity }} de {{ row.day.label.toLowerCase() }}, {{ row.parsed.length }} {{ row.parsed.length === 1 ? 'loja' : 'lojas' }}<template v-if="row.existing">. Substitui a planilha já salva nesse dia</template>
              </p>
            </div>
            <label class="flex items-center gap-2">
              <span class="sr-only">Data da auditoria de {{ row.item.file.name }}</span>
              <input v-model="row.item.iso" type="date" class="ui-input !w-[160px]" />
            </label>
            <button type="button" class="justify-self-start text-[14px] font-semibold text-steel hover:text-bad sm:justify-self-end" @click="removeItem(row.item.id)">
              Remover
            </button>
          </li>
        </ul>
      </div>

      <div class="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-[14px] text-steel">
          <template v-if="rows.length">{{ readyRows.length }} de {{ rows.length }} {{ rows.length === 1 ? 'arquivo pronto' : 'arquivos prontos' }}</template>
        </p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" class="ui-btn-secondary" :disabled="isSaving" @click="close">Cancelar</button>
          <button type="button" class="ui-btn-primary" :disabled="!readyRows.length || isSaving" @click="importAll">
            <i v-if="isSaving" class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
            {{ readyRows.length > 1 ? `Importar ${readyRows.length} planilhas` : 'Importar planilha' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
