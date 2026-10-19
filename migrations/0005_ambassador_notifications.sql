-- AGN notifications v3: additive only. Existing users, attendance and ambassador records are untouched.
CREATE TABLE IF NOT EXISTS amb_notification_preferences (
  owner_type TEXT NOT NULL CHECK(owner_type IN ('ambassador','manager')),
  owner_id TEXT NOT NULL,
  daily_reminder INTEGER NOT NULL DEFAULT 0 CHECK(daily_reminder IN (0,1)),
  push_enabled INTEGER NOT NULL DEFAULT 0 CHECK(push_enabled IN (0,1)),
  sound_enabled INTEGER NOT NULL DEFAULT 0 CHECK(sound_enabled IN (0,1)),
  task_enabled INTEGER NOT NULL DEFAULT 1 CHECK(task_enabled IN (0,1)),
  deadline_enabled INTEGER NOT NULL DEFAULT 1 CHECK(deadline_enabled IN (0,1)),
  review_enabled INTEGER NOT NULL DEFAULT 1 CHECK(review_enabled IN (0,1)),
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_type,owner_id)
);
CREATE TABLE IF NOT EXISTS amb_notifications (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('ambassador','manager')),
  owner_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('task','deadline','review','daily')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_url TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  push_processed_at INTEGER,
  push_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_amb_notif_owner ON amb_notifications(owner_type,owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_amb_notif_delivery ON amb_notifications(push_processed_at,created_at);
CREATE TABLE IF NOT EXISTS amb_push_subscriptions (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('ambassador','manager')),
  owner_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_amb_push_owner ON amb_push_subscriptions(owner_type,owner_id);
CREATE TABLE IF NOT EXISTS amb_notification_deliveries (
  notification_id TEXT NOT NULL REFERENCES amb_notifications(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES amb_push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','retry','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(notification_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_amb_notification_delivery_due ON amb_notification_deliveries(status,next_attempt_at);
