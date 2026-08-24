import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { getAppSettings, updateAppSettings } from '../../lib/supabase';
import {
  getGuestMessages,
  insertGuestMessage,
  softDeleteMessage,
  clearEventMessages,
  permanentDeleteAllEventMessages,
  GuestMessage as SupabaseMessage,
  GuestMessageInput,
} from '../../lib/supabaseMessages';
import {
  addToQueue,
  clearQueue,
  getQueue,
  isOnline,
  subscribeToOnlineStatus,
} from '../../lib/offlineQueue';
import { uploadToCloudinary } from '../../lib/cloudinary';

export type SyncStatus = 'queued' | 'syncing' | 'synced' | 'failed';
export type EventType = 'wedding' | 'graduation' | 'corporate';

const DEVICE_ID_KEY = 'guestbook_device_id';
const EVENT_ID = 'default-event';

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function getLogoType(url: string | null): 'image' | 'video' {
  if (!url) return 'image';
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? 'video' : 'image';
}

interface GuestMessageDisplay {
  id: string;
  waktu: string;
  pesanImageUrl: string;
}

function mapSupabaseToDisplay(msg: SupabaseMessage): GuestMessageDisplay {
  return {
    id: msg.id,
    waktu: msg.createdAt,
    pesanImageUrl: msg.imageUrl,
  };
}

export interface EventSettings {
  name: string;
  subtitle: string;
  date: string;
  venue: string;
  eventType: EventType;
  themeColor: string;
  frameUrl: string | null;
  logoUrl: string | null;
  logoType: 'image' | 'video';
  frameSlotX: number;
  frameSlotY: number;
  frameSlotWidth: number;
  frameSlotHeight: number;
  frameWidth: number;
  frameHeight: number;
  isEnded: boolean;
  adminPassword: string;
}

export interface GuestMessage {
  id: string;
  waktu: string;
  pesanImageUrl: string;
}

interface GuestbookStore {
  settings: EventSettings;
  settingsLoading: boolean;
  settingsError: string | null;
  storageError: string | null;
  isOnline: boolean;
  queueSize: number;
  syncStatus: Map<string, SyncStatus>;
  saveSettings: (s: EventSettings) => Promise<void>;
  messages: GuestMessage[];
  addMessage: (imageData: string, guestName?: string) => Promise<GuestMessage>;
  deleteMessage: (id: string) => Promise<void>;
  clearMessages: () => Promise<void>;
}

const DEFAULT_SETTINGS: EventSettings = {
  name: 'Intan & Ari',
  subtitle: 'Pernikahan Suci',
  date: '16 Mei 2026',
  venue: "Masjid Raya KH. Hasyim Asy'ari",
  eventType: 'wedding',
  themeColor: '#D4AF37',
  frameUrl: null,
  logoUrl: null,
  logoType: 'image',
  frameSlotX: 0,
  frameSlotY: 0,
  frameSlotWidth: 0,
  frameSlotHeight: 0,
  frameWidth: 0,
  frameHeight: 0,
  isEnded: false,
  adminPassword: 'admin123',
};

const GuestbookContext = createContext<GuestbookStore | null>(null);

export function GuestbookProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<EventSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [online, setOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [syncStatus, setSyncStatus] = useState<Map<string, SyncStatus>>(new Map());

  const deviceId = getOrCreateDeviceId();

  // Load initial data
  useEffect(() => {
    let mounted = true;

    const loadInitialData = async () => {
      setSettingsLoading(true);
      setSettingsError(null);

      try {
        // Load settings
        const remoteSettings = await getAppSettings();
        if (!mounted) return;

        setSettings(prev => ({
          ...prev,
          frameUrl: remoteSettings.frameUrl ?? prev.frameUrl,
          logoUrl: remoteSettings.bannerUrl ?? prev.logoUrl,
          logoType: getLogoType(remoteSettings.bannerUrl ?? prev.logoUrl),
          frameWidth: remoteSettings.frameWidth ?? prev.frameWidth,
          frameHeight: remoteSettings.frameHeight ?? prev.frameHeight,
          frameSlotX: remoteSettings.frameSlotX ?? prev.frameSlotX,
          frameSlotY: remoteSettings.frameSlotY ?? prev.frameSlotY,
          frameSlotWidth: remoteSettings.frameSlotWidth ?? prev.frameSlotWidth,
          frameSlotHeight: remoteSettings.frameSlotHeight ?? prev.frameSlotHeight,
        }));

        // Load messages from Supabase
        const remoteMessages = await getGuestMessages(EVENT_ID);
        if (!mounted) return;

        const displayMessages = remoteMessages.map(mapSupabaseToDisplay);
        setMessages(displayMessages);

        // Load pending queue
        const pendingQueue = await getQueue();
        if (!mounted) return;
        setQueueSize(pendingQueue.length);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Gagal memuat data';
        setSettingsError(message);
        setStorageError(message);
      } finally {
        if (!mounted) return;
        setSettingsLoading(false);
      }
    };

    loadInitialData();
    return () => { mounted = false; };
  }, []);

  // Listen for online/offline status
  useEffect(() => {
    setOnline(isOnline());
    return subscribeToOnlineStatus(setOnline);
  }, []);

  const saveSettings = useCallback(async (s: EventSettings) => {
    setSettings(s);
    setSettingsError(null);

    try {
      // If event is being ended (transitioned from active to ended),
      // permanently delete all messages from database
      if (s.isEnded && !settings.isEnded) {
        console.log('[Event End Trigger] Cleaning up all messages from database...');
        try {
          const deletedCount = await permanentDeleteAllEventMessages(EVENT_ID);
          console.log(`[Event End] Successfully deleted ${deletedCount} messages`);
        } catch (cleanupErr) {
          console.error('[Event End] Cleanup failed, but continuing with settings save:', cleanupErr);
          // Don't throw - let the event end even if cleanup fails
        }
      }

      await updateAppSettings({
        frameUrl: s.frameUrl,
        bannerUrl: s.logoUrl,
        frameWidth: s.frameWidth,
        frameHeight: s.frameHeight,
        frameSlotX: s.frameSlotX,
        frameSlotY: s.frameSlotY,
        frameSlotWidth: s.frameSlotWidth,
        frameSlotHeight: s.frameSlotHeight,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi';
      setSettingsError(message);
      throw err;
    }
  }, []);

  const addMessage = useCallback(async (imageData: string, guestName?: string): Promise<GuestMessage> => {
    try {
      // Upload to Cloudinary
      let imageUrl = imageData;
      try {
        const blob = await (await fetch(imageData)).blob();
        const file = new File([blob], 'drawing.png', { type: 'image/png' });
        imageUrl = await uploadToCloudinary(file);
      } catch (uploadErr) {
        console.warn('Cloudinary upload failed, using data URL:', uploadErr);
        // Fall back to data URL if Cloudinary fails
      }

      const messageInput: GuestMessageInput = {
        eventId: EVENT_ID,
        guestName,
        imageUrl,
        deviceId,
        metadata: {
          userAgent: navigator.userAgent,
        },
      };

      if (isOnline()) {
        // Try direct Supabase
        try {
          const result = await insertGuestMessage(messageInput);
          const display = mapSupabaseToDisplay(result);
          setMessages(prev => [...prev, display]);
          setStorageError(null);
          return display;
        } catch (err) {
          console.error('Supabase insert failed:', err);
          // Fall back to queue
          await addToQueue(messageInput);
          setQueueSize(prev => prev + 1);
          const qMsg: GuestMessage = {
            id: `temp-${Date.now()}`,
            waktu: new Date().toISOString(),
            pesanImageUrl: imageUrl,
          };
          setMessages(prev => [...prev, qMsg]);
          setStorageError('Pesan akan disimpan setelah koneksi diperbaiki');
          return qMsg;
        }
      } else {
        // Offline: queue directly
        await addToQueue(messageInput);
        setQueueSize(prev => prev + 1);
        const qMsg: GuestMessage = {
          id: `temp-${Date.now()}`,
          waktu: new Date().toISOString(),
          pesanImageUrl: imageUrl,
        };
        setMessages(prev => [...prev, qMsg]);
        setStorageError(null);
        return qMsg;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan pesan';
      setStorageError(message);
      throw err;
    }
  }, [deviceId]);

  const deleteMessage = useCallback(async (id: string) => {
    try {
      if (id.startsWith('temp-')) {
        // Local temp message, just remove from state
        setMessages(prev => prev.filter(m => m.id !== id));
        return;
      }

      await softDeleteMessage(id);
      setMessages(prev => prev.filter(m => m.id !== id));
      setStorageError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus pesan';
      setStorageError(message);
      throw err;
    }
  }, []);

  const clearMessages = useCallback(async () => {
    try {
      await clearEventMessages(EVENT_ID);
      await clearQueue();
      setMessages([]);
      setQueueSize(0);
      setStorageError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus semua pesan';
      setStorageError(message);
      throw err;
    }
  }, []);

  return (
    <GuestbookContext.Provider value={{
      settings,
      settingsLoading,
      settingsError,
      storageError,
      isOnline: online,
      queueSize,
      syncStatus,
      saveSettings,
      messages,
      addMessage,
      deleteMessage,
      clearMessages,
    }}>
      {children}
    </GuestbookContext.Provider>
  );
}

export function useGuestbook(): GuestbookStore {
  const ctx = useContext(GuestbookContext);
  if (!ctx) throw new Error('useGuestbook must be inside GuestbookProvider');
  return ctx;
}
