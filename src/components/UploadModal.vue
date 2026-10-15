<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close', 'upload'])
defineProps({
  regionalName: { type: String, default: 'regional' },
  auditType: { type: String, default: 'Etiqueta' },
  isUpdate: { type: Boolean, default: false },
})
const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)

function setFile(file) {
  if (!file) return
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(extension)) return
  selectedFile.value = file
}

function handleFileChange(event) {
  const file = event.target.files?.[0]
  setFile(file)
}

function handleDrop(event) {
  isDragging.value = false
  setFile(event.dataTransfer?.files?.[0])
}

function submitUpload() {
  if (!selectedFile.value) return
  emit('upload', selectedFile.value)
}
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
    <div class="w-full max-w-lg ui-modal">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="ui-eyebrow">Consolidado</p>
          <h3 class="ui-title">{{ isUpdate ? 'Atualizar auditoria' : 'Enviar planilha' }}</h3>
          <p v-if="isUpdate" class="mt-2 text-sm text-slate-500">A planilha atual será substituída integralmente.</p>
        </div>
        <button class="text-lg text-slate-500 hover:text-slate-900" @click="emit('close')">×</button>
      </div>

      <div
        class="mt-6 rounded-2xl border-2 border-dashed p-5 transition"
        :class="isDragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-slate-50'"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <label class="flex cursor-pointer flex-col items-center justify-center gap-3 text-center">
          <span class="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Arquivo</span>
          <span class="text-sm text-slate-600">Selecione o consolidado de {{ auditType }} da {{ regionalName }}</span>
          <span v-if="auditType !== 'Etiqueta'" class="max-w-sm text-xs leading-5 text-slate-500">
            Coluna C: SKU · Coluna D: Presença · Coluna E: Ruptura
          </span>
          <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleFileChange" />
          <i class="fa-solid fa-cloud-arrow-up text-3xl" :class="isDragging ? 'text-sky-600' : 'text-slate-400'"></i>
          <span class="text-sm font-semibold text-slate-700">Arraste a planilha aqui</span>
          <span class="text-xs text-slate-400">ou clique para escolher o arquivo</span>
          <span class="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
            {{ selectedFile ? selectedFile.name : 'Escolher planilha' }}
          </span>
        </label>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button class="ui-btn-secondary" @click="emit('close')">
          Cancelar
        </button>
        <button
          class="ui-btn-primary"
          :disabled="!selectedFile"
          @click="submitUpload"
        >
          {{ isUpdate ? 'Substituir auditoria' : 'Salvar dados' }}
        </button>
      </div>
    </div>
  </div>
</template>
