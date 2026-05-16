import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { getAppSettings, updateAppSettings, supabase } from '../../lib/supabase';

export type EventType = 'wedding' | 'graduation' | 'corporate';

const MESSAGES_STORAGE_KEY = 'guestbook_messages';
const SESSION_MESSAGES_STORAGE_KEY = 'guestbook_messages_session';
const INDEXEDDB_NAME = 'guestbook_db';
const INDEXEDDB_STORE = 'messages';
const INDEXEDDB_VERSION = 1;

function getLogoType(url: string | null): 'image' | 'video' {
  if (!url) return 'image';
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? 'video' : 'image';
}

interface StorageSaveResult {
  success: boolean;
  fallbackUsed: boolean;
}

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak tersedia.'));
      return;
    }

    const request = window.indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INDEXEDDB_STORE)) {
        db.createObjectStore(INDEXEDDB_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadIndexedDBMessages(): Promise<GuestMessage[]> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(INDEXEDDB_STORE, 'readonly');
      const store = tx.objectStore(INDEXEDDB_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as GuestMessage[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

async function saveIndexedDBMessages(messages: GuestMessage[]): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(INDEXEDDB_STORE, 'readwrite');
      const store = tx.objectStore(INDEXEDDB_STORE);

      store.clear();
      for (const message of messages) {
        store.put(message);
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return false;
  }
}

function loadStoredMessages(): GuestMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MESSAGES_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as GuestMessage[];
  } catch {
    window.localStorage.removeItem(MESSAGES_STORAGE_KEY);
  }

  return [];
}

function saveStoredMessages(messages: GuestMessage[]): StorageSaveResult {
  if (typeof window === 'undefined') return { success: true, fallbackUsed: false };
  const payload = JSON.stringify(messages);

  try {
    window.localStorage.setItem(MESSAGES_STORAGE_KEY, payload);
    window.sessionStorage.removeItem(SESSION_MESSAGES_STORAGE_KEY);
    return { success: true, fallbackUsed: false };
  } catch {
    try {
      window.sessionStorage.setItem(SESSION_MESSAGES_STORAGE_KEY, payload);
      return { success: true, fallbackUsed: true };
    } catch {
      return { success: false, fallbackUsed: false };
    }
  }
}

async function loadRemoteMessages(): Promise<GuestMessage[]> {
  try {
    const { data, error } = await supabase
      .from('guest_messages')
      .select('id, waktu, pesan_image_url')
      .order('waktu', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((item: any) => ({
      id: item.id,
      waktu: item.waktu,
      pesanImageUrl: item.pesan_image_url,
    }));
  } catch {
    return [];
  }
}

async function insertRemoteMessage(message: GuestMessage): Promise<boolean> {
  try {
    const { error } = await supabase.from('guest_messages').insert({
      id: message.id,
      waktu: message.waktu,
      pesan_image_url: message.pesanImageUrl,
    });
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}

async function deleteRemoteMessage(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('guest_messages').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}

async function clearRemoteMessages(): Promise<boolean> {
  try {
    const { error } = await supabase.from('guest_messages').delete().not('id', 'is', null);
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
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
  saveSettings: (s: EventSettings) => Promise<void>;
  messages: GuestMessage[];
  addMessage: (imageData: string) => GuestMessage;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;
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

  useEffect(() => {
    let mounted = true;
    const loadRemoteConfig = async () => {
      setSettingsLoading(true);
      setSettingsError(null);

      try {
        const remoteSettings = await getAppSettings();
        const remoteMessages = await loadRemoteMessages();
        let storedMessages = remoteMessages.length > 0 ? remoteMessages : loadStoredMessages();

        if (storedMessages.length === 0) {
          storedMessages = await loadIndexedDBMessages();
        }

        if (!mounted) return;

        setSettings({
          ...DEFAULT_SETTINGS,
          frameUrl: remoteSettings.frameUrl ?? DEFAULT_SETTINGS.frameUrl,
          logoUrl: remoteSettings.bannerUrl ?? DEFAULT_SETTINGS.logoUrl,
          logoType: getLogoType(remoteSettings.bannerUrl ?? DEFAULT_SETTINGS.logoUrl),
          frameWidth: remoteSettings.frameWidth ?? DEFAULT_SETTINGS.frameWidth,
          frameHeight: remoteSettings.frameHeight ?? DEFAULT_SETTINGS.frameHeight,
          frameSlotX: remoteSettings.frameSlotX ?? DEFAULT_SETTINGS.frameSlotX,
          frameSlotY: remoteSettings.frameSlotY ?? DEFAULT_SETTINGS.frameSlotY,
          frameSlotWidth: remoteSettings.frameSlotWidth ?? DEFAULT_SETTINGS.frameSlotWidth,
          frameSlotHeight: remoteSettings.frameSlotHeight ?? DEFAULT_SETTINGS.frameSlotHeight,
        });
        setMessages(storedMessages);
        setStorageError(null);
      } catch (err) {
        if (!mounted) return;
        setSettingsError(err instanceof Error ? err.message : 'Gagal memuat data.');
      } finally {
        if (!mounted) return;
        setSettingsLoading(false);
      }
    };

    loadRemoteConfig();
    return () => { mounted = false; };
  }, []);

  const persistMessages = useCallback((next: GuestMessage[]) => {
    const result = saveStoredMessages(next);
    saveIndexedDBMessages(next).catch(() => {
      // IndexedDB hanya cache tambahan
    });

    if (!result.success) {
      setStorageError('Penyimpanan lokal penuh. Pesan disimpan di memori, tetapi akan hilang jika halaman dimuat ulang.');
    } else if (result.fallbackUsed) {
      setStorageError('Penyimpanan lokal penuh. Pesan disimpan sementara di sesi ini dan akan hilang ketika tab ditutup.');
    } else {
      setStorageError(null);
    }

    return next;
  }, []);

  const saveSettings = useCallback(async (s: EventSettings) => {
    setSettings(s);
    setSettingsError(null);

    try {
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
      const message = err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi.';
      setSettingsError(message);
      throw err;
    }
  }, []);

  const addMessage = useCallback((imageData: string): GuestMessage => {
    const msg: GuestMessage = {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      waktu: new Date().toISOString(),
      pesanImageUrl: imageData,
    };
    setMessages(prev => {
      const next = [...prev, msg];
      persistMessages(next);
      insertRemoteMessage(msg).then(success => {
        if (!success) {
          setStorageError('Gagal menyimpan pesan ke cloud. Pesan disimpan lokal terlebih dahulu.');
        }
      });
      return next;
    });

    return msg;
  }, [persistMessages]);

  const deleteMessage = useCallback((id: string) => {
    setMessages(prev => {
      const next = prev.filter(m => m.id !== id);
      persistMessages(next);
      deleteRemoteMessage(id).then(success => {
        if (!success) {
          setStorageError('Gagal menghapus pesan di cloud. Perubahan disimpan lokal terlebih dahulu.');
        }
      });
      return next;
    });
  }, [persistMessages]);

  const clearMessages = useCallback(() => {
    setMessages(() => {
      const next: GuestMessage[] = [];
      persistMessages(next);
      clearRemoteMessages().then(success => {
        if (!success) {
          setStorageError('Gagal menghapus semua pesan di cloud. Perubahan disimpan lokal terlebih dahulu.');
        }
      });
      return next;
    });
  }, [persistMessages]);

  return (
    <GuestbookContext.Provider value={{
      settings,
      settingsLoading,
      settingsError,
      storageError,
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
