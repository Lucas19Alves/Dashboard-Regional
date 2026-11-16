import { reactive } from 'vue'
import { backupState, buildBackupFile, markBackedUp, onChange } from './backup'
import { REGIONS } from './regions'

// Backup automático numa pasta escolhida pelo usuário (Chrome/Edge, File System Access API).
// Grava um arquivo por regional (regional-sp6-backup.json), substituindo o anterior.
// O arquivo fica no computador (ex.: OneDrive ou rede da empresa); nada passa por servidor.
const DB_NAME = 'regional-backup-folder'
const KEY = 'folder'
const WAIT_MS = 5000 // junta alterações seguidas num só backup
const DAY_MS = 86400000

export const folderSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window

export const folderState = reactive({
  supported: folderSupported,
  configured: false,
  name: '',
  permission: 'prompt', // granted | prompt | denied
  saving: false,
  lastSavedAt: null,
  error: '',
})

export const autoBackupActive = () => folderState.configured && folderState.permission === 'granted'

let handle = null

// O handle da pasta não cabe no localStorage: fica num IndexedDB próprio.
function kv(mode, run) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => open.result.createObjectStore('kv')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const request = run(open.result.transaction('kv', mode).objectStore('kv'))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }
  })
}

const saveRecord = () => kv('readwrite', (s) => s.put({ handle, lastSavedAt: folderState.lastSavedAt?.toISOString() || null }, KEY))

async function checkPermission() {
  try {
    folderState.permission = handle ? await handle.queryPermission({ mode: 'readwrite' }) : 'prompt'
  } catch {
    folderState.permission = 'prompt'
  }
  return folderState.permission
}

async function loadFolder() {
  try {
    const record = await kv('readonly', (s) => s.get(KEY))
    handle = record?.handle || null
    folderState.configured = Boolean(handle)
    folderState.name = handle?.name || ''
    folderState.lastSavedAt = record?.lastSavedAt ? new Date(record.lastSavedAt) : null
    if (handle) await checkPermission()
  } catch (error) {
    folderState.error = error?.message || String(error)
  }
}

// Precisa de um clique do usuário (o navegador pede confirmação).
export async function chooseFolder() {
  if (!folderSupported) return false
  try {
    handle = await window.showDirectoryPicker({ id: 'dashboard-regional-backup', mode: 'readwrite' })
  } catch {
    return false // cancelado
  }
  Object.assign(folderState, { configured: true, name: handle.name, permission: 'granted', error: '' })
  await saveRecord()
  await saveAllToFolder()
  return true
}

// Após reabrir o navegador, a permissão volta a "perguntar": também precisa de um clique.
export async function allowFolder() {
  if (!handle) return false
  try {
    folderState.permission = await handle.requestPermission({ mode: 'readwrite' })
  } catch {
    folderState.permission = 'denied'
  }
  if (folderState.permission === 'granted') await saveAllToFolder()
  return folderState.permission === 'granted'
}

export async function disableFolder() {
  handle = null
  await kv('readwrite', (s) => s.delete(KEY)).catch(() => {})
  Object.assign(folderState, { configured: false, name: '', permission: 'prompt', error: '' })
}

async function writeRegion(regionId) {
  const { blob, name, count } = await buildBackupFile(regionId)
  // Sem auditorias neste navegador: não apaga um backup bom que já esteja na pasta.
  if (!count) return
  const file = await handle.getFileHandle(name, { create: true })
  // createWritable grava num temporário e só substitui ao fechar: se falhar, o backup anterior fica.
  const writable = await file.createWritable()
  await writable.write(blob)
  await writable.close()
  markBackedUp(regionId)
}

async function saveToFolder(regionIds) {
  if (!handle || folderState.saving || !regionIds.length) return false
  if ((await checkPermission()) !== 'granted') return false
  folderState.saving = true
  try {
    for (const id of regionIds) await writeRegion(id)
    folderState.lastSavedAt = new Date()
    folderState.error = ''
    await saveRecord()
    return true
  } catch (error) {
    folderState.error = error?.message || String(error)
    return false
  } finally {
    folderState.saving = false
  }
}

export const saveAllToFolder = () => saveToFolder(Object.keys(REGIONS))

// Regionais com alteração pendente ou sem backup há mais de um dia.
const dueRegions = () => Object.keys(REGIONS).filter((id) => {
  const item = backupState[id]
  if (!item) return false
  const last = item.lastBackupAt ? new Date(item.lastBackupAt).getTime() : 0
  return item.pending > 0 || Date.now() - last >= DAY_MS
})

// Liga o automático: salva ao abrir (mudanças pendentes ou um dia sem backup) e após cada alteração.
let timer = null
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => (folderState.saving ? schedule() : saveToFolder(dueRegions())), WAIT_MS)
}

export async function startAutoBackup() {
  if (!folderSupported) return
  onChange(() => folderState.configured && schedule())
  await loadFolder()
  if (autoBackupActive()) await saveToFolder(dueRegions())
}
