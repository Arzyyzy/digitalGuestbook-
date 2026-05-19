import { useEffect, useCallback, useState } from 'react';
import {
  subscribeToMessages,
  subscribeToMessageDeletions,
  GuestMessage,
} from '../../lib/supabaseMessages';

export function useRealtimeMessages(
  eventId: string
): {
  unsubscribe: () => void;
  isSubscribed: boolean;
} {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [unsubscribeFns, setUnsubscribeFns] = useState<Array<() => void>>([]);

  const subscribe = useCallback((onMessage: (msg: GuestMessage) => void, onDelete: (id: string) => void) => {
    const unsub1 = subscribeToMessages(eventId, onMessage);
    const unsub2 = subscribeToMessageDeletions(eventId, onDelete);

    setUnsubscribeFns([unsub1, unsub2]);
    setIsSubscribed(true);

    return () => {
      unsub1();
      unsub2();
      setIsSubscribed(false);
    };
  }, [eventId]);

  const unsubscribe = useCallback(() => {
    unsubscribeFns.forEach(fn => fn());
    setUnsubscribeFns([]);
    setIsSubscribed(false);
  }, [unsubscribeFns]);

  return { subscribe, unsubscribe, isSubscribed };
}

export function useRealtimeSubscription(
  eventId: string,
  onMessage?: (msg: GuestMessage) => void,
  onDelete?: (id: string) => void
): { isSubscribed: boolean } {
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!eventId || !onMessage) return;

    const unsubscribeFns: Array<() => void> = [];

    try {
      const unsub1 = subscribeToMessages(eventId, onMessage);
      unsubscribeFns.push(unsub1);

      if (onDelete) {
        const unsub2 = subscribeToMessageDeletions(eventId, onDelete);
        unsubscribeFns.push(unsub2);
      }

      setIsSubscribed(true);
    } catch (err) {
      console.error('Failed to subscribe to messages:', err);
    }

    return () => {
      unsubscribeFns.forEach(fn => fn());
      setIsSubscribed(false);
    };
  }, [eventId, onMessage, onDelete]);

  return { isSubscribed };
}
