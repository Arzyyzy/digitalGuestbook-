import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY');

console.log('[Supabase Init] Connecting to:', SUPABASE_URL?.split('//')[1]);

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test connection on initialization
supabase.auth.getSession().then(({ data }) => {
  console.log('[Supabase] Connection established. Session:', data?.session ? 'exists' : 'none');
}).catch(err => {
  console.error('[Supabase] Connection failed:', err);
});

export interface AppSettings {
  frameUrl: string | null;
  bannerUrl: string | null;
  frameWidth: number | null;
  frameHeight: number | null;
  frameSlotX: number | null;
  frameSlotY: number | null;
  frameSlotWidth: number | null;
  frameSlotHeight: number | null;
}

interface AppSettingsRow {
  id?: number;
  frame_url: string | null;
  banner_url: string | null;
  frame_width: number | null;
  frame_height: number | null;
  frame_slot_x: number | null;
  frame_slot_y: number | null;
  frame_slot_width: number | null;
  frame_slot_height: number | null;
}

interface AppSettingsUpdate {
  frameUrl?: string | null;
  bannerUrl?: string | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  frameSlotX?: number | null;
  frameSlotY?: number | null;
  frameSlotWidth?: number | null;
  frameSlotHeight?: number | null;
}

function getEnvVar(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set ${name} in your Vite environment (for example, in .env).`
    );
  }
  return value as string;
}

function mapRowToSettings(row: AppSettingsRow): AppSettings {
  return {
    frameUrl: row.frame_url,
    bannerUrl: row.banner_url,
    frameWidth: row.frame_width,
    frameHeight: row.frame_height,
    frameSlotX: row.frame_slot_x,
    frameSlotY: row.frame_slot_y,
    frameSlotWidth: row.frame_slot_width,
    frameSlotHeight: row.frame_slot_height,
  };
}

function mapSettingsToRow(settings: AppSettingsUpdate): Partial<AppSettingsRow> {
  return {
    frame_url: settings.frameUrl ?? null,
    banner_url: settings.bannerUrl ?? null,
    frame_width: settings.frameWidth ?? null,
    frame_height: settings.frameHeight ?? null,
    frame_slot_x: settings.frameSlotX ?? null,
    frame_slot_y: settings.frameSlotY ?? null,
    frame_slot_width: settings.frameSlotWidth ?? null,
    frame_slot_height: settings.frameSlotHeight ?? null,
  };
}

export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await (supabase.from('app_settings') as any)
    .select('frame_url, banner_url, frame_width, frame_height, frame_slot_x, frame_slot_y, frame_slot_width, frame_slot_height')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load app settings: ${error.message}`);
  }

  if (!data) {
    return {
      frameUrl: null,
      bannerUrl: null,
      frameWidth: null,
      frameHeight: null,
      frameSlotX: null,
      frameSlotY: null,
      frameSlotWidth: null,
      frameSlotHeight: null,
    };
  }

  return mapRowToSettings(data);
}

export async function updateAppSettings(
  settings: AppSettingsUpdate
): Promise<AppSettings> {
  const payload = mapSettingsToRow(settings);

  const { data: existing, error: selectError } = await (supabase.from('app_settings') as any)
    .select('id')
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to read app settings row: ${selectError.message}`);
  }

  const appSettingsTable = supabase.from('app_settings') as any;
  const query = existing && existing.id
    ? appSettingsTable.update(payload).eq('id', existing.id)
    : appSettingsTable.insert(payload);

  const { data, error } = await query
    .select('frame_url, banner_url, frame_width, frame_height, frame_slot_x, frame_slot_y, frame_slot_width, frame_slot_height')
    .single();

  if (error) {
    throw new Error(`Failed to update app settings: ${error.message}`);
  }

  return mapRowToSettings(data);
}

const PDF_STORAGE_BUCKET = 'guestbook-pdfs';

export async function uploadPdfToStorage(
  fileBytes: Uint8Array,
  filename: string
): Promise<string> {
  const path = `exports/${filename}`;
  const blob = new Blob([fileBytes], { type: 'application/pdf' });

  const { data, error } = await supabase.storage
    .from(PDF_STORAGE_BUCKET)
    .upload(path, blob, { upsert: true });

  if (error) {
    throw new Error(`Failed to upload PDF: ${error.message}`);
  }

  const { data: publicUrlData, error: urlError } = await supabase.storage
    .from(PDF_STORAGE_BUCKET)
    .getPublicUrl(path);

  if (urlError || !publicUrlData?.publicUrl) {
    throw new Error(`Failed to get public URL for PDF: ${urlError?.message ?? 'no url returned'}`);
  }

  return publicUrlData.publicUrl;
}
