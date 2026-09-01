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

export async function listSessions() {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export async function upsertSession(session) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const request = transaction.objectStore(STORE_NAME).put(session)

    request.onsuccess = () => resolve(session)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteSession(sessionId) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const request = transaction.objectStore(STORE_NAME).delete(sessionId)

    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(request.error)
  })
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
