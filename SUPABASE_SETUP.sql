-- ============================================================================
-- SUPABASE SETUP: Digital Guestbook Cloud Storage
-- ============================================================================
-- Run this SQL in your Supabase dashboard > SQL Editor
-- Steps:
-- 1. Go to https://app.supabase.com/project/[YOUR_PROJECT]/sql
-- 2. Create new query
-- 3. Paste this entire file
-- 4. Click "Run" (or Ctrl+Enter)
-- ============================================================================

-- Drop existing tables if they exist (optional - for fresh setup)
DROP TABLE IF EXISTS message_queue CASCADE;
DROP TABLE IF EXISTS guest_messages CASCADE;

-- ============================================================================
-- TABLE 1: guest_messages (Main storage for guest messages)
-- ============================================================================

CREATE TABLE guest_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  guest_name text DEFAULT NULL,
  message text DEFAULT NULL,
  drawing_data jsonb DEFAULT NULL,  -- {strokes: [{x, y}], colors: [], sizes: []}
  frame_url text DEFAULT NULL,
  image_url text NOT NULL,          -- Cloudinary URL or data URL
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz DEFAULT NULL,  -- Soft delete support
  device_id text DEFAULT NULL,      -- Track device for online status
  metadata jsonb DEFAULT NULL       -- Extra fields: {userAgent, resolution, etc}
);

-- Create indexes for performance
CREATE INDEX idx_guest_messages_event_id ON guest_messages(event_id);
CREATE INDEX idx_guest_messages_created_at ON guest_messages(created_at DESC);
CREATE INDEX idx_guest_messages_deleted_at ON guest_messages(deleted_at);

-- Enable Row Level Security
ALTER TABLE guest_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy 1: Allow public INSERT (guests submit messages)
CREATE POLICY allow_public_insert ON guest_messages
  FOR INSERT
  WITH CHECK (true);

-- RLS Policy 2: Allow public SELECT (display & admin view)
CREATE POLICY allow_public_read ON guest_messages
  FOR SELECT
  USING (true);

-- RLS Policy 3: Allow public UPDATE (for metadata like device_id update)
CREATE POLICY allow_public_update ON guest_messages
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- RLS Policy 4: Allow public DELETE (soft delete via admin)
CREATE POLICY allow_public_delete ON guest_messages
  FOR DELETE
  USING (true);

-- ============================================================================
-- TABLE 2: message_queue (Offline fallback queue)
-- ============================================================================

CREATE TABLE message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  event_id text NOT NULL,
  guest_name text DEFAULT NULL,
  message text DEFAULT NULL,
  drawing_data jsonb DEFAULT NULL,
  frame_url text DEFAULT NULL,
  image_url text NOT NULL,          -- Base64 or temp data URL
  created_at timestamptz DEFAULT now(),
  synced_at timestamptz DEFAULT NULL,
  failed_attempts integer DEFAULT 0,
  last_error text DEFAULT NULL
);

-- Create indexes for queue management
CREATE INDEX idx_message_queue_synced_at ON message_queue(synced_at);
CREATE INDEX idx_message_queue_device_id ON message_queue(device_id);

-- Enable RLS
ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow public access (for offline sync)
CREATE POLICY allow_public_queue ON message_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE 3: device_sessions (Optional - track active devices)
-- ============================================================================

CREATE TABLE device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  event_id text NOT NULL,
  user_agent text,
  last_activity timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT NULL
);

CREATE INDEX idx_device_sessions_event_id ON device_sessions(event_id);
CREATE INDEX idx_device_sessions_last_activity ON device_sessions(last_activity DESC);

-- Enable RLS
ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_public_sessions ON device_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- REALTIME SUBSCRIPTIONS SETUP
-- ============================================================================
-- To enable realtime:
-- 1. Go to Supabase Dashboard > Database > Replication
-- 2. Toggle ON for tables: guest_messages, message_queue, device_sessions
--
-- Or use Supabase CLI:
-- supabase realtime update --db-schema public --db-name guest_messages --enable-all

-- ============================================================================
-- STORAGE SETUP (for Cloudinary URLs - optional)
-- ============================================================================
-- We'll store Cloudinary URLs directly, not files
-- But if needed, create bucket for fallback:
-- INSERT INTO storage.buckets (id, name)
-- VALUES ('guest-messages', 'guest-messages')
-- ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify setup:

-- Check table structures
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('guest_messages', 'message_queue', 'device_sessions');

-- Check RLS policies
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('guest_messages', 'message_queue', 'device_sessions');

-- ============================================================================
-- COMPLETE ✓
-- ============================================================================
-- Your Supabase is ready!
-- Next step: Run the migration script to populate initial data
-- See: MIGRATION.md
