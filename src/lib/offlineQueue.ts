import { GuestMessageInput } from './supabaseMessages';

const DB_NAME = 'guestbook_queue_db';
const STORE_NAME = 'message_queue';
const DB_VERSION = 1;

// Offline queue configuration
const MAX_RETRIES = 5;
const MAX_QUEUE_SIZE = 100;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface QueuedMessage extends GuestMessageInput {
  queueId: string;
  createdAt: number;
  failedAttempts: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'queueId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addToQueue(message: GuestMessageInput): Promise<string> {
  try {
    const db = await openDB();
    const queueId = `${Date.now()}-${Math.random()}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const queued: QueuedMessage = {
        ...message,
        queueId,
        createdAt: Date.now(),
        failedAttempts: 0,
      };

      const request = store.put(queued);

      request.onsuccess = () => resolve(queueId);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to add message to queue:', err);
    // Fallback: return generated ID even if queue fails
    return `${Date.now()}-${Math.random()}`;
  }
}

export async function getQueue(): Promise<QueuedMessage[]> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const messages = request.result as QueuedMessage[];
        // Sort by creation time (oldest first)
        resolve(messages.sort((a, b) => a.createdAt - b.createdAt));
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to get queue:', err);
    return [];
  }
}

export async function removeFromQueue(queueId: string): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(queueId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to remove from queue:', err);
  }
}

export async function incrementFailedAttempts(queueId: string): Promise<number | null> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(queueId);

      getRequest.onsuccess = () => {
        const item = getRequest.result as QueuedMessage | undefined;
        if (!item) {
          resolve(null);
          return;
        }

        const updated = {
          ...item,
          failedAttempts: (item.failedAttempts || 0) + 1,
        };
        const putRequest = store.put(updated);

        putRequest.onsuccess = () => resolve(updated.failedAttempts);
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (err) {
    console.warn('Failed to increment failed attempts:', err);
    return null;
  }
}

export async function updateQueueItem(
  queueId: string,
  updates: Partial<QueuedMessage>
): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(queueId);

      getRequest.onsuccess = () => {
        const item = getRequest.result as QueuedMessage;
        if (!item) {
          resolve();
          return;
        }

        const updated = { ...item, ...updates };
        const putRequest = store.put(updated);

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (err) {
    console.warn('Failed to update queue item:', err);
  }
}

export async function clearQueue(): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to clear queue:', err);
  }
}

export async function cleanupQueue(): Promise<void> {
  try {
    const db = await openDB();
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const allItems = getAllRequest.result as QueuedMessage[];
        let deleteCount = 0;

        // 1. Delete items that have exceeded max retries
        const failedItems = allItems.filter(item => item.failedAttempts >= MAX_RETRIES);
        failedItems.forEach(item => {
          store.delete(item.queueId);
          deleteCount++;
        });

        // 2. Delete items older than 24 hours
        const expiredItems = allItems.filter(item => now - item.createdAt > TTL_MS);
        expiredItems.forEach(item => {
          store.delete(item.queueId);
          deleteCount++;
        });

        // 3. If queue is still too large, delete oldest items
        const remaining = allItems.filter(
          item => item.failedAttempts < MAX_RETRIES && now - item.createdAt <= TTL_MS
        );

        if (remaining.length > MAX_QUEUE_SIZE) {
          const toDelete = remaining
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(0, remaining.length - MAX_QUEUE_SIZE);

          toDelete.forEach(item => {
            store.delete(item.queueId);
            deleteCount++;
          });
        }

        if (deleteCount > 0) {
          console.log(`[Offline Queue] Cleaned up ${deleteCount} items`);
        }

        resolve();
      };

      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  } catch (err) {
    console.warn('Failed to cleanup queue:', err);
  }
}

export async function getQueueSize(): Promise<number> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to get queue size:', err);
    return 0;
  }
}

export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

export function subscribeToOnlineStatus(
  callback: (isOnline: boolean) => void
): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
