<script setup>
import { ref } from 'vue'
import { useModal } from '../composables/useModal'

const emit = defineEmits(['close', 'upload'])
const props = defineProps({
  regionalName: { type: String, default: 'regional' },
  auditType: { type: String, default: 'Etiqueta' },
  isUpdate: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
const fileError = ref('')

function close() {
  if (!props.busy) emit('close')
}

useModal(close)

function setFile(file) {
  if (!file) return
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(extension)) {
    fileError.value = `${file.name} não é uma planilha. Use um arquivo .xlsx, .xls ou .csv.`
    return
  }
  fileError.value = ''
  selectedFile.value = file
}

function handleFileChange(event) {
  const file = event.target.files?.[0]
  setFile(file)
  event.target.value = ''
}

function handleDrop(event) {
  isDragging.value = false
  setFile(event.dataTransfer?.files?.[0])
}

function submitUpload() {
  if (!selectedFile.value || props.busy) return
  emit('upload', selectedFile.value)
}
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-3 sm:items-center sm:p-4" @click.self="close">
    <div class="ui-modal max-w-lg" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 id="upload-title" class="font-display text-[28px] font-semibold leading-tight text-ink">
            {{ isUpdate ? 'Substituir planilha' : 'Importar planilha' }}
          </h3>
          <p class="mt-1 text-[15px] text-steel">Consolidado de {{ auditType }} da {{ regionalName }}.</p>
        </div>
        <button type="button" class="close-btn" aria-label="Fechar" :disabled="busy" @click="close">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <p v-if="isUpdate" class="mt-4 rounded-md bg-tag-soft px-3 py-2 text-[14px] font-medium text-ink">
        A planilha atual deste dia será substituída por inteiro.
      </p>

      <label
        class="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-5 py-8 text-center transition-colors"
        :class="isDragging ? 'border-ink bg-tag-soft' : selectedFile ? 'border-good/50 bg-good/5' : 'border-line-strong bg-floor/50 hover:border-steel'"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleFileChange" />
        <i class="text-2xl" :class="selectedFile ? 'fa-solid fa-file-circle-check text-good' : 'fa-solid fa-file-arrow-up text-steel'" aria-hidden="true"></i>
        <span v-if="selectedFile" class="max-w-full truncate text-[15px] font-semibold text-ink">{{ selectedFile.name }}</span>
        <span v-else class="text-[15px] font-semibold text-ink">Arraste a planilha ou clique para escolher</span>
        <span class="text-[13px] text-steel">{{ selectedFile ? 'Clique para trocar o arquivo' : 'Arquivos .xlsx, .xls ou .csv' }}</span>
      </label>

      <p v-if="fileError" class="mt-3 text-[14px] font-medium text-bad" role="alert">{{ fileError }}</p>

      <p v-if="auditType !== 'Etiqueta'" class="mt-3 text-[13px] text-steel">
        Colunas usadas: C com o SKU, D com a presença e E com a ruptura.
      </p>

      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="ui-btn-secondary" :disabled="busy" @click="close">Cancelar</button>
        <button type="button" class="ui-btn-primary" :disabled="!selectedFile || busy" @click="submitUpload">
          <i v-if="busy" class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
          {{ busy ? 'Lendo planilha…' : isUpdate ? 'Substituir planilha' : 'Importar planilha' }}
        </button>
      </div>
    </div>
  </div>
</template>
