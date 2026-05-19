import { useEffect, useCallback, useState, useRef } from 'react';
import {
  addToQueue,
  getQueue,
  removeFromQueue,
  clearQueue,
  subscribeToOnlineStatus,
  isOnline,
  incrementFailedAttempts,
  cleanupQueue,
} from '../../lib/offlineQueue';
import {
  insertGuestMessage,
  GuestMessageInput,
  GuestMessage,
} from '../../lib/supabaseMessages';

const MAX_RETRIES = 5;

export type SyncStatus = 'queued' | 'syncing' | 'synced' | 'failed';

interface UseOfflineQueueOptions {
  onSynced?: (message: GuestMessage) => void;
  onError?: (error: Error) => void;
  onQueueChanged?: (queueSize: number) => void;
  onStatusChanged?: (queueId: string, status: SyncStatus) => void;
}

export function useOfflineQueue(options: UseOfflineQueueOptions = {}) {
  const { onSynced, onError, onQueueChanged, onStatusChanged } = options;
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [messageStatus, setMessageStatus] = useState<Map<string, SyncStatus>>(new Map());
  const syncIntervalRef = useRef<number>();
  const onlineListenerRef = useRef<(() => void) | null>(null);

  const updateQueueSize = useCallback(async () => {
    const queue = await getQueue();
    setQueueSize(queue.length);
    onQueueChanged?.(queue.length);
    
    // Initialize status for new items
    const newStatus = new Map(messageStatus);
    queue.forEach(item => {
      if (!newStatus.has(item.queueId)) {
        newStatus.set(item.queueId, 'queued');
      }
    });
    setMessageStatus(newStatus);
  }, [onQueueChanged, messageStatus]);

  const syncQueue = useCallback(async () => {
    if (isSyncing || !isOnline()) return;

    setIsSyncing(true);

    try {
      const queue = await getQueue();

      for (const item of queue) {
        try {
          const { queueId, createdAt, failedAttempts, ...messageData } = item;

          const message = await insertGuestMessage(messageData);
          await removeFromQueue(queueId);
          onSynced?.(message);
        } catch (err) {
          console.error('Failed to sync message:', err);
          // Keep the item in queue for retry
        }
      }

      await updateQueueSize();
    } catch (err) {
      console.error('Failed to sync queue:', err);
      onError?.(err instanceof Error ? err : new Error('Queue sync failed'));
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, onSynced, onError, updateQueueSize]);

  // Initialize queue size on mount
  useEffect(() => {
    updateQueueSize();
  }, [updateQueueSize]);

  // Listen for online status changes
  useEffect(() => {
    onlineListenerRef.current = subscribeToOnlineStatus((online) => {
      if (online) {
        // Try to sync immediately when coming online
        syncQueue();
      }
    });

    return () => {
      onlineListenerRef.current?.();
    };
  }, [syncQueue]);

  // Periodically try to sync queue
  useEffect(() => {
    const SYNC_INTERVAL = 30000; // 30 seconds

    syncIntervalRef.current = window.setInterval(() => {
      if (isOnline()) {
        syncQueue();
      }
    }, SYNC_INTERVAL);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [syncQueue]);

  return {
    queueSize,
    isSyncing,
    syncQueue,
    isOnline: isOnline(),
    messageStatus,
  };
}

export async function submitMessageWithOfflineSupport(
  message: GuestMessageInput,
  onSuccess?: (msg: GuestMessage) => void,
  onError?: (error: Error) => void
): Promise<GuestMessage | null> {
  try {
    if (isOnline()) {
      // Try to submit directly
      const result = await insertGuestMessage(message);
      onSuccess?.(result);
      return result;
    } else {
      // Queue for later sync
      await addToQueue(message);
      // Return optimistic result
      const optimistic: GuestMessage = {
        id: `temp-${Date.now()}`,
        eventId: message.eventId,
        guestName: message.guestName,
        message: message.message,
        drawingData: message.drawingData,
        frameUrl: message.frameUrl,
        imageUrl: message.imageUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deviceId: message.deviceId,
      };
      onSuccess?.(optimistic);
      return optimistic;
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to submit message');
    onError?.(error);
    return null;
  }
}
