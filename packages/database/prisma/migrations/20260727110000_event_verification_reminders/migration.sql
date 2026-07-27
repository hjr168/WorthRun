-- Add precise event start times without inventing values for existing events.
ALTER TABLE "events" ADD COLUMN "event_start_at" TIMESTAMP(3);

-- Add lightweight, daily reminder funnel flags.
ALTER TABLE "user_activity_daily"
  ADD COLUMN "viewed_reminder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requested_reminder_permission" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accepted_reminder_permission" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "ReminderDeliveryRunMode" AS ENUM ('dry_run', 'apply', 'test');
CREATE TYPE "ReminderDeliveryRunStatus" AS ENUM ('running', 'succeeded', 'partial', 'failed');

CREATE TABLE "reminder_delivery_runs" (
  "id" TEXT NOT NULL,
  "mode" "ReminderDeliveryRunMode" NOT NULL,
  "status" "ReminderDeliveryRunStatus" NOT NULL DEFAULT 'running',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "due_count" INTEGER NOT NULL DEFAULT 0,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "error_category" TEXT,
  "release" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_delivery_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reminder_delivery_runs_started_at_idx"
  ON "reminder_delivery_runs"("started_at");
CREATE INDEX "reminder_delivery_runs_status_started_at_idx"
  ON "reminder_delivery_runs"("status", "started_at");
