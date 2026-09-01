const DB_NAME = 'regional-audit-store'
const STORE_NAME = 'audit-sessions'

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
  await runStoreRequest(STORE_NAME, 'readwrite', (store) => store.put(session))
  return session
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
