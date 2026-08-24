import { supabase } from './supabase';

export interface GuestMessage {
  id: string;
  eventId: string;
  guestName?: string;
  message?: string;
  drawingData?: {
    strokes?: Array<{ x: number; y: number }>;
    colors?: string[];
    sizes?: number[];
  };
  frameUrl?: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deviceId?: string;
  metadata?: Record<string, any>;
}

export interface GuestMessageInput {
  eventId: string;
  guestName?: string;
  message?: string;
  drawingData?: GuestMessage['drawingData'];
  frameUrl?: string;
  imageUrl: string;
  deviceId?: string;
  metadata?: Record<string, any>;
}

interface MessageRow {
  id: string;
  event_id: string;
  guest_name?: string;
  message?: string;
  drawing_data?: GuestMessage['drawingData'];
  frame_url?: string;
  image_url: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  device_id?: string;
  metadata?: Record<string, any>;
}

function mapRowToMessage(row: MessageRow): GuestMessage {
  return {
    id: row.id,
    eventId: row.event_id,
    guestName: row.guest_name,
    message: row.message,
    drawingData: row.drawing_data,
    frameUrl: row.frame_url,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deviceId: row.device_id,
    metadata: row.metadata,
  };
}

function mapMessageToRow(msg: GuestMessageInput) {
  return {
    event_id: msg.eventId,
    guest_name: msg.guestName,
    message: msg.message,
    drawing_data: msg.drawingData,
    frame_url: msg.frameUrl,
    image_url: msg.imageUrl,
    device_id: msg.deviceId,
    metadata: msg.metadata,
  };
}

export async function insertGuestMessage(
  message: GuestMessageInput
): Promise<GuestMessage> {
  const { data, error } = await supabase
    .from('guest_messages')
    .insert(mapMessageToRow(message))
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert message: ${error.message}`);
  }

  return mapRowToMessage(data as MessageRow);
}

function isDeletedAtMissingError(error: any): boolean {
  const message = typeof error?.message === 'string' ? error.message : '';
  const details = typeof error?.details === 'string' ? error.details : '';
  return /deleted_at/.test(message) || /deleted_at/.test(details);
}

const EVENT_COLUMN_NAMES = ['event_id', 'eventid'] as const;

type EventColumnName = (typeof EVENT_COLUMN_NAMES)[number];

function buildGuestMessagesQuery(eventId: string, eventColumnName: EventColumnName | null) {
  const query = supabase
    .from('guest_messages')
    .select('*')
    .order('created_at', { ascending: false });

  return eventColumnName ? query.eq(eventColumnName, eventId) : query;
}

function isEventColumnMissingError(error: any): boolean {
  const message = typeof error?.message === 'string' ? error.message : '';
  return /column .*event(_?id)? does not exist/i.test(message);
}

async function tryFetchGuestMessages(eventId: string, eventColumnName: EventColumnName | null) {
  let result = await buildGuestMessagesQuery(eventId, eventColumnName).is('deleted_at', null);
  if (result.error && isDeletedAtMissingError(result.error)) {
    result = await buildGuestMessagesQuery(eventId, eventColumnName);
  }
  return result;
}

export async function getGuestMessages(eventId: string): Promise<GuestMessage[]> {
  let result: any;

  for (const columnName of EVENT_COLUMN_NAMES) {
    result = await tryFetchGuestMessages(eventId, columnName);
    if (!result.error) {
      return (result.data as MessageRow[]).map(mapRowToMessage);
    }
    if (!isEventColumnMissingError(result.error)) {
      throw new Error(`Failed to fetch messages: ${result.error.message}`);
    }
  }

  result = await tryFetchGuestMessages(eventId, null);
  if (result.error) {
    throw new Error(`Failed to fetch messages: ${result.error.message}`);
  }

  return (result.data as MessageRow[]).map(mapRowToMessage);
}

export async function getGuestMessage(id: string): Promise<GuestMessage | null> {
  const { data, error } = await supabase
    .from('guest_messages')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch message: ${error.message}`);
  }

  return data ? mapRowToMessage(data as MessageRow) : null;
}

function matchesEventId(row: any, eventId: string): boolean {
  return row?.event_id === eventId || row?.eventid === eventId || row?.eventId === eventId;
}

export function subscribeToMessages(
  eventId: string,
  callback: (message: GuestMessage) => void
): () => void {
  const channel = supabase
    .channel(`messages:${eventId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'guest_messages',
      },
      (payload) => {
        const row = payload.new as any;
        if (!row || row.deleted_at) return;
        if (!matchesEventId(row, eventId)) return;
        callback(mapRowToMessage(row as MessageRow));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToMessageDeletions(
  eventId: string,
  callback: (deletedMessageId: string) => void
): () => void {
  const channel = supabase
    .channel(`deletions:${eventId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'guest_messages',
      },
      (payload) => {
        const row = payload.new as any;
        if (!row || !row.deleted_at) return;
        if (!matchesEventId(row, eventId)) return;
        callback(row.id);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function softDeleteMessage(id: string): Promise<void> {
  const deleteTime = new Date().toISOString();
  const result = await supabase
    .from('guest_messages')
    .update({ deleted_at: deleteTime })
    .eq('id', id);

  if (result.error && isDeletedAtMissingError(result.error)) {
    const fallback = await supabase
      .from('guest_messages')
      .delete()
      .eq('id', id);

    if (fallback.error) {
      throw new Error(`Failed to delete message: ${fallback.error.message}`);
    }

    return;
  }

  if (result.error) {
    throw new Error(`Failed to delete message: ${result.error.message}`);
  }
}

export async function hardDeleteMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('guest_messages')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to permanently delete message: ${error.message}`);
  }
}

export async function clearEventMessages(eventId: string): Promise<number> {
  const now = new Date().toISOString();
  const updateResult = await supabase
    .from('guest_messages')
    .update({ deleted_at: now })
    .eq('event_id', eventId)
    .is('deleted_at', null);

  if (updateResult.error && isDeletedAtMissingError(updateResult.error)) {
    const deleteResult = await supabase
      .from('guest_messages')
      .delete()
      .eq('event_id', eventId);

    if (deleteResult.error) {
      throw new Error(`Failed to clear messages: ${deleteResult.error.message}`);
    }

    return deleteResult.count || 0;
  }

  if (updateResult.error) {
    throw new Error(`Failed to clear messages: ${updateResult.error.message}`);
  }

  return updateResult.count || 0;
}

/**
 * Permanently delete all event messages when event ends
 * Called when admin clicks "Akhiri Event" button
 * This is a hard delete from database (not soft delete)
 */
export async function permanentDeleteAllEventMessages(eventId: string): Promise<number> {
  console.log(`[Event End] Permanently deleting all messages for event: ${eventId}`);
  
  const result = await supabase
    .from('guest_messages')
    .delete()
    .eq('event_id', eventId);

  if (result.error) {
    throw new Error(`Failed to permanently delete event messages: ${result.error.message}`);
  }

  const count = result.count || 0;
  console.log(`[Event End] Successfully deleted ${count} messages`);
  return count;
}

function buildGuestMessagesCountQuery(eventId: string, eventColumnName: EventColumnName | null) {
  const query = supabase
    .from('guest_messages')
    .select('*', { count: 'exact', head: true });

  return eventColumnName ? query.eq(eventColumnName, eventId) : query;
}

export async function getEventMessageCount(eventId: string): Promise<number> {
  let result: any;

  for (const columnName of EVENT_COLUMN_NAMES) {
    result = await buildGuestMessagesCountQuery(eventId, columnName).is('deleted_at', null);
    if (!result.error) {
      return result.count || 0;
    }
    if (!isEventColumnMissingError(result.error)) {
      throw new Error(`Failed to count messages: ${result.error.message}`);
    }
  }

  result = await buildGuestMessagesCountQuery(eventId, null).is('deleted_at', null);
  if (result.error) {
    if (isDeletedAtMissingError(result.error)) {
      result = await buildGuestMessagesCountQuery(eventId, null);
    } else {
      throw new Error(`Failed to count messages: ${result.error.message}`);
    }
  }

  if (result.error) {
    throw new Error(`Failed to count messages: ${result.error.message}`);
  }

  return result.count || 0;
}

export async function updateDeviceActivity(deviceId: string): Promise<void> {
  // Update device_sessions table to track last activity
  const { data: existing } = await supabase
    .from('device_sessions')
    .select('id')
    .eq('device_id', deviceId)
    .single();

  if (existing) {
    await supabase
      .from('device_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('device_id', deviceId);
  }
}

export async function getActiveDeviceCount(eventId: string): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('device_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .gt('last_activity', fiveMinutesAgo);

  if (error) {
    console.error('Failed to count active devices:', error);
    return 0;
  }

  return count || 0;
}

export function subscribeToMessagesRealtimeAdmin(
  eventId: string,
  onInsert?: (message: GuestMessage) => void,
  onDelete?: (deletedMessageId: string) => void
): () => void {
  const subscriptions: Array<() => void> = [];

  // Subscribe to new messages (INSERT)
  if (onInsert) {
    const insertChannel = supabase
      .channel(`admin_messages_insert:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guest_messages',
        },
        (payload) => {
          const row = payload.new as any;
          if (!row || row.deleted_at) return;
          if (!matchesEventId(row, eventId)) return;
          console.log('[Admin Realtime] New message:', row.id);
          onInsert(mapRowToMessage(row as MessageRow));
        }
      )
      .subscribe();

    subscriptions.push(() => {
      supabase.removeChannel(insertChannel);
    });
  }

  // Subscribe to deletions (UPDATE with deleted_at)
  if (onDelete) {
    const deleteChannel = supabase
      .channel(`admin_messages_delete:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'guest_messages',
        },
        (payload) => {
          const row = payload.new as any;
          if (!row || !row.deleted_at) return;
          if (!matchesEventId(row, eventId)) return;
          console.log('[Admin Realtime] Message deleted:', row.id);
          onDelete(row.id);
        }
      )
      .subscribe();

    subscriptions.push(() => {
      supabase.removeChannel(deleteChannel);
    });
  }

  // Return cleanup function
  return () => {
    subscriptions.forEach(cleanup => cleanup());
  };
}
