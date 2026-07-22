CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "AvatarUploadGrantStatus" AS ENUM ('pending', 'consumed', 'completed', 'failed');
CREATE TYPE "EventReminderType" AS ENUM ('signup', 'race_week');
CREATE TYPE "EventReminderTrigger" AS ENUM ('signup_open', 'signup_deadline_3d', 'race_week_7d');
CREATE TYPE "EventReminderStatus" AS ENUM ('pending', 'sending', 'sent', 'cancelled', 'expired', 'failed', 'review_required');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "open_id_hash" TEXT NOT NULL,
  "open_id_ciphertext" TEXT NOT NULL,
  "open_id_iv" TEXT NOT NULL,
  "open_id_auth_tag" TEXT NOT NULL,
  "nickname" TEXT,
  "avatar_file_id" TEXT,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "profile_updated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_aliases" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "user_key_hash" TEXT NOT NULL,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_activity_daily" (
  "user_id" TEXT NOT NULL,
  "activity_date" DATE NOT NULL,
  "first_entry_page" TEXT,
  "first_channel" TEXT,
  "referral_share_token" TEXT,
  "viewed_detail" BOOLEAN NOT NULL DEFAULT false,
  "copied_official" BOOLEAN NOT NULL DEFAULT false,
  "added_favorite" BOOLEAN NOT NULL DEFAULT false,
  "set_choice" BOOLEAN NOT NULL DEFAULT false,
  "started_share" BOOLEAN NOT NULL DEFAULT false,
  "subscribed_reminder" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_activity_daily_pkey" PRIMARY KEY ("user_id", "activity_date")
);

CREATE TABLE "avatar_upload_grants" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" "AvatarUploadGrantStatus" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "avatar_upload_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_reminders" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "reminder_type" "EventReminderType" NOT NULL,
  "trigger" "EventReminderTrigger" NOT NULL,
  "status" "EventReminderStatus" NOT NULL DEFAULT 'pending',
  "scheduled_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT,
  "locked_at" TIMESTAMP(3),
  "lock_token" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_reminders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_preferences" ADD COLUMN "user_id" TEXT;
ALTER TABLE "user_favorites" ADD COLUMN "user_id" TEXT;
ALTER TABLE "user_event_choices" ADD COLUMN "user_id" TEXT;
ALTER TABLE "feedback" ADD COLUMN "user_id" TEXT;
ALTER TABLE "share_records"
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "user_key_hash" TEXT,
  ADD COLUMN "share_token" TEXT,
  ADD COLUMN "token_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_open_id_hash_key" ON "users"("open_id_hash");
CREATE INDEX "users_status_registered_at_idx" ON "users"("status", "registered_at");
CREATE INDEX "users_last_active_at_idx" ON "users"("last_active_at");
CREATE INDEX "users_nickname_idx" ON "users"("nickname");
CREATE UNIQUE INDEX "user_aliases_user_key_hash_key" ON "user_aliases"("user_key_hash");
CREATE INDEX "user_aliases_user_id_idx" ON "user_aliases"("user_id");
CREATE INDEX "user_activity_daily_activity_date_idx" ON "user_activity_daily"("activity_date");
CREATE INDEX "user_activity_daily_referral_share_token_idx" ON "user_activity_daily"("referral_share_token");
CREATE UNIQUE INDEX "avatar_upload_grants_token_hash_key" ON "avatar_upload_grants"("token_hash");
CREATE INDEX "avatar_upload_grants_expires_at_status_idx" ON "avatar_upload_grants"("expires_at", "status");
CREATE INDEX "avatar_upload_grants_user_id_created_at_idx" ON "avatar_upload_grants"("user_id", "created_at");
CREATE UNIQUE INDEX "event_reminders_user_id_event_id_reminder_type_key" ON "event_reminders"("user_id", "event_id", "reminder_type");
CREATE INDEX "event_reminders_status_scheduled_at_idx" ON "event_reminders"("status", "scheduled_at");
CREATE INDEX "event_reminders_event_id_status_idx" ON "event_reminders"("event_id", "status");
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");
CREATE INDEX "user_preferences_user_id_idx" ON "user_preferences"("user_id");
CREATE UNIQUE INDEX "user_favorites_user_id_event_id_key" ON "user_favorites"("user_id", "event_id");
CREATE INDEX "user_favorites_user_id_idx" ON "user_favorites"("user_id");
CREATE UNIQUE INDEX "user_event_choices_user_id_event_id_key" ON "user_event_choices"("user_id", "event_id");
CREATE INDEX "user_event_choices_user_id_idx" ON "user_event_choices"("user_id");
CREATE INDEX "feedback_user_id_idx" ON "feedback"("user_id");
CREATE UNIQUE INDEX "share_records_share_token_key" ON "share_records"("share_token");
CREATE INDEX "share_records_user_id_idx" ON "share_records"("user_id");
CREATE INDEX "share_records_user_key_hash_idx" ON "share_records"("user_key_hash");
CREATE INDEX "share_records_share_token_token_expires_at_idx" ON "share_records"("share_token", "token_expires_at");

ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_activity_daily" ADD CONSTRAINT "user_activity_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avatar_upload_grants" ADD CONSTRAINT "avatar_upload_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_event_choices" ADD CONSTRAINT "user_event_choices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "share_records" ADD CONSTRAINT "share_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
