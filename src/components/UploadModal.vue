<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close', 'upload'])
const fileInput = ref(null)
const selectedFile = ref(null)

function handleFileChange(event) {
  const file = event.target.files?.[0]
  selectedFile.value = file || null
}

function submitUpload() {
  if (!selectedFile.value) return
  emit('upload', selectedFile.value)
}
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
    <div class="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Consolidado</p>
          <h3 class="mt-2 text-2xl font-semibold text-slate-900">Enviar planilha</h3>
        </div>
        <button class="text-lg text-slate-500 hover:text-slate-900" @click="emit('close')">×</button>
      </div>

      <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <label class="flex cursor-pointer flex-col items-center justify-center gap-3 text-center">
          <span class="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Arquivo</span>
          <span class="text-sm text-slate-600">Selecione o consolidado geral da regional SP6</span>
          <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleFileChange" />
          <span class="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
            {{ selectedFile ? selectedFile.name : 'Escolher planilha' }}
          </span>
        </label>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button class="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200" @click="emit('close')">
          Cancelar
        </button>
        <button
          class="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          :disabled="!selectedFile"
          @click="submitUpload"
        >
          Salvar dados
        </button>
      </div>
    </div>
  </div>
</template>
