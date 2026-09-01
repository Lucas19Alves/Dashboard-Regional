const DB_NAME = 'regional-audit-store'
const STORE_NAME = 'audit-sessions'

function sanitizeSerializableValue(value) {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => sanitizeSerializableValue(item))

  if (value && typeof value === 'object') {
    if (value instanceof File || value instanceof Blob) return null
    if (value instanceof Map || value instanceof Set) return Array.from(value.entries?.() ?? value.values?.() ?? [])

    const safeObject = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === '__v_isRef' || key === '__v_isReactive' || key === '__v_isShallow' || key === '_isMock') continue
      const sanitized = sanitizeSerializableValue(item)
      if (sanitized !== undefined) {
        safeObject[key] = sanitized
      }
    }
    return safeObject
  }

  return value
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runStoreRequest(storeName, mode, requestBuilder) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDatabase()
      const transaction = db.transaction(storeName, mode)
      const request = requestBuilder(transaction.objectStore(storeName))

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    } catch (error) {
      reject(error)
    }
  })
}

export async function listSessions() {
  const result = await runStoreRequest(STORE_NAME, 'readonly', (store) => store.getAll())
  return Array.isArray(result) ? result : []
}

export async function upsertSession(session) {
  const safeSession = sanitizeSerializableValue(session)
  await runStoreRequest(STORE_NAME, 'readwrite', (store) => store.put(safeSession))
  return safeSession
}

export async function deleteSession(sessionId) {
  await runStoreRequest(STORE_NAME, 'readwrite', (store) => store.delete(sessionId))
  return true
}

export async function exportSessionsAsJson() {
  const sessions = await listSessions()
  return {
    exportedAt: new Date().toISOString(),
    sessions,
  }
}

export async function importSessionsFromJson(payload) {
  const entries = Array.isArray(payload?.sessions) ? payload.sessions : []
  for (const session of entries) {
    if (session && session.id) {
      await upsertSession(session)
    }
  }
  return entries.length
}
