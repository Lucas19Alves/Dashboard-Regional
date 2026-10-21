<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import { DEFAULT_ATTENTION, DEFAULT_META, formatLimit, settings } from '../lib/settings'
import { getDefaultStoreCodes, getRegionList } from '../lib/regions'
import { notify, confirmAction } from '../composables/feedback'

const themeOptions = [
  { value: 'light', label: 'Claro', icon: 'fa-solid fa-sun' },
  { value: 'dark', label: 'Escuro', icon: 'fa-solid fa-moon' },
  { value: 'system', label: 'Igual ao sistema', icon: 'fa-solid fa-desktop' },
]

const regions = computed(() => getRegionList())

// ---------- Metas ----------
const metaDraft = ref(String(settings.meta).replace('.', ','))
const attentionDraft = ref(String(settings.attention).replace('.', ','))
const metaError = ref('')

function parseLimit(value) {
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : NaN
}

function saveLimits() {
  const meta = parseLimit(metaDraft.value)
  const attention = parseLimit(attentionDraft.value)
  if (!(meta > 0 && meta < 100)) {
    metaError.value = 'A meta precisa ser um número entre 0 e 100.'
    return
  }
  if (!(attention >= meta && attention <= 100)) {
    metaError.value = 'O limite de atenção precisa ser maior ou igual à meta e no máximo 100.'
    return
  }
  metaError.value = ''
  settings.meta = meta
  settings.attention = attention
  notify(`Meta salva: até ${formatLimit(meta)}% fica verde, até ${formatLimit(attention)}% fica laranja.`)
}

function resetLimits() {
  settings.meta = DEFAULT_META
  settings.attention = DEFAULT_ATTENTION
  metaDraft.value = String(DEFAULT_META)
  attentionDraft.value = String(DEFAULT_ATTENTION)
  metaError.value = ''
  notify('Metas voltaram ao padrão: 3% e 7%.')
}

const limitsChanged = computed(() => parseLimit(metaDraft.value) !== settings.meta || parseLimit(attentionDraft.value) !== settings.attention)

// ---------- Lojas ----------
const storeDrafts = ref({})
const storeErrors = ref({})

function isCustomized(regionId) {
  return Array.isArray(settings.storeOverrides[regionId])
}

function setStores(regionId, codes) {
  const unique = [...new Set(codes)].sort()
  const defaults = getDefaultStoreCodes(regionId).sort()
  if (unique.length === defaults.length && unique.every((code, index) => code === defaults[index])) {
    delete settings.storeOverrides[regionId]
    return
  }
  settings.storeOverrides[regionId] = unique
}

function addStores(region) {
  const raw = String(storeDrafts.value[region.id] || '')
  const parts = raw.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return
  const invalid = parts.filter((part) => !/^\d{1,3}$/.test(part))
  if (invalid.length) {
    storeErrors.value[region.id] = `Código inválido: ${invalid.join(', ')}. Use o número da loja com até 3 dígitos.`
    return
  }
  const codes = parts.map((part) => part.padStart(3, '0'))
  const owners = getRegionList().filter((other) => other.id !== region.id)
  const taken = codes.filter((code) => owners.some((other) => other.storeCodes.includes(code)))
  if (taken.length) {
    storeErrors.value[region.id] = `A loja ${taken.join(', ')} já está em outra regional. Remova de lá primeiro.`
    return
  }
  const fresh = codes.filter((code) => !region.storeCodes.includes(code))
  storeErrors.value[region.id] = ''
  storeDrafts.value[region.id] = ''
  if (!fresh.length) return
  setStores(region.id, [...region.storeCodes, ...fresh])
  notify(`${fresh.length === 1 ? 'Loja adicionada' : 'Lojas adicionadas'} à ${region.name}: ${fresh.join(', ')}.`)
}

async function removeStore(region, code) {
  const confirmed = await confirmAction({
    title: `Tirar a loja ${code} da ${region.name}?`,
    message: 'As auditorias já salvas continuam guardadas. A loja só deixa de aparecer nos indicadores, gráficos e relatórios.',
    confirmLabel: 'Tirar loja',
  })
  if (!confirmed) return
  setStores(region.id, region.storeCodes.filter((item) => item !== code))
  notify(`Loja ${code} removida da ${region.name}.`)
}

async function resetStores(region) {
  const confirmed = await confirmAction({
    title: `Voltar à lista padrão da ${region.name}?`,
    message: `A regional volta a ter as ${getDefaultStoreCodes(region.id).length} lojas originais.`,
    confirmLabel: 'Voltar ao padrão',
    tone: 'primary',
  })
  if (!confirmed) return
  delete settings.storeOverrides[region.id]
  notify(`Lista de lojas da ${region.name} restaurada.`)
}
</script>

<template>
  <div class="mx-auto max-w-[980px] space-y-6">
    <PageHeader title="Configurações" description="As preferências ficam salvas neste navegador." />

    <section class="ui-card p-5 sm:p-6" aria-labelledby="cfg-theme">
      <h2 id="cfg-theme" class="ui-title !mt-0">Aparência</h2>
      <div class="mt-3 ui-seg" role="radiogroup" aria-label="Tema">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          role="radio"
          class="ui-seg-item inline-flex items-center gap-2"
          :class="{ 'ui-seg-item-active': settings.theme === option.value }"
          :aria-checked="settings.theme === option.value"
          @click="settings.theme = option.value"
        >
          <i :class="option.icon" class="text-[13px]" aria-hidden="true"></i>
          {{ option.label }}
        </button>
      </div>
    </section>

    <section class="ui-card p-5 sm:p-6" aria-labelledby="cfg-meta">
      <h2 id="cfg-meta" class="ui-title !mt-0">Meta de pendência e ruptura</h2>
      <p class="mt-1 max-w-[68ch] text-[15px] text-steel">
        Vale para todas as regionais. Até a meta a loja fica verde, entre a meta e o limite de atenção fica laranja, e acima disso fica vermelha.
      </p>

      <form class="mt-4 flex flex-wrap items-end gap-4" @submit.prevent="saveLimits">
        <label class="block">
          <span class="ui-eyebrow block">Meta (%)</span>
          <input v-model="metaDraft" inputmode="decimal" class="ui-input mt-1 !w-[120px] font-display text-[20px]" aria-describedby="meta-help" />
        </label>
        <label class="block">
          <span class="ui-eyebrow block">Limite de atenção (%)</span>
          <input v-model="attentionDraft" inputmode="decimal" class="ui-input mt-1 !w-[120px] font-display text-[20px]" />
        </label>
        <div class="flex gap-2">
          <button type="submit" class="ui-btn-primary" :disabled="!limitsChanged">Salvar metas</button>
          <button type="button" class="ui-btn-secondary" @click="resetLimits">Voltar ao padrão</button>
        </div>
      </form>

      <div id="meta-help" class="mt-4 flex h-3 max-w-[460px] overflow-hidden rounded-sm" aria-hidden="true">
        <span class="bg-good" :style="{ flex: settings.meta }"></span>
        <span class="bg-warn" :style="{ flex: Math.max(settings.attention - settings.meta, 0.4) }"></span>
        <span class="bg-bad" :style="{ flex: Math.max(settings.attention, 3) }"></span>
      </div>
      <p class="mt-1.5 flex max-w-[460px] justify-between text-[13px] text-steel">
        <span>0%</span><span>{{ formatLimit(settings.meta) }}%</span><span>{{ formatLimit(settings.attention) }}%</span><span>mais</span>
      </p>
      <p v-if="metaError" class="mt-3 text-[14px] font-medium text-bad" role="alert">{{ metaError }}</p>
    </section>

    <section class="ui-card p-5 sm:p-6" aria-labelledby="cfg-stores">
      <h2 id="cfg-stores" class="ui-title !mt-0">Lojas de cada regional</h2>
      <p class="mt-1 max-w-[68ch] text-[15px] text-steel">
        Só as lojas desta lista entram na importação, nos indicadores e nos relatórios. Tirar uma loja não apaga as auditorias já salvas.
      </p>

      <div class="mt-5 divide-y divide-line">
        <div v-for="region in regions" :key="region.id" class="py-5 first:pt-0 last:pb-0">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="text-[17px] font-bold text-ink">
              {{ region.name }}
              <span class="ml-1 text-[15px] font-medium text-steel">{{ region.storeCodes.length }} {{ region.storeCodes.length === 1 ? 'loja' : 'lojas' }}</span>
            </h3>
            <button v-if="isCustomized(region.id)" type="button" class="text-[14px] font-semibold text-steel underline-offset-4 hover:text-ink hover:underline" @click="resetStores(region)">
              Voltar à lista padrão
            </button>
          </div>

          <ul class="mt-3 flex flex-wrap gap-1.5" :aria-label="`Lojas da ${region.name}`">
            <li v-for="code in region.storeCodes" :key="code" class="inline-flex items-center rounded-[4px] border border-line-strong bg-white pl-2.5 font-display text-[17px] font-semibold text-ink">
              {{ code }}
              <button type="button" class="ml-1 grid h-8 w-7 place-items-center text-steel hover:text-bad" :aria-label="`Tirar loja ${code}`" @click="removeStore(region, code)">
                <i class="fa-solid fa-xmark text-[11px]" aria-hidden="true"></i>
              </button>
            </li>
            <li v-if="!region.storeCodes.length" class="text-[15px] text-steel">Nenhuma loja cadastrada.</li>
          </ul>

          <form class="mt-3 flex max-w-[460px] gap-2" @submit.prevent="addStores(region)">
            <label class="sr-only" :for="`add-${region.id}`">Adicionar lojas à {{ region.name }}</label>
            <input
              :id="`add-${region.id}`"
              v-model="storeDrafts[region.id]"
              class="ui-input"
              inputmode="numeric"
              placeholder="Código da loja, ex.: 145 ou 145, 210"
            />
            <button type="submit" class="ui-btn-secondary shrink-0">Adicionar</button>
          </form>
          <p v-if="storeErrors[region.id]" class="mt-2 text-[14px] font-medium text-bad" role="alert">{{ storeErrors[region.id] }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
