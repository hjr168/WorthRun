ALTER TABLE "event_source_runs"
ADD COLUMN "skipped_expired" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "skipped_outside_region" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "EventInteractionAction" AS ENUM ('event_detail_view', 'official_link_copy');

CREATE TABLE "event_interactions" (
    "id" TEXT NOT NULL,
    "user_key_hash" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "action" "EventInteractionAction" NOT NULL,
    "occurred_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_interactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_interactions_user_key_hash_event_id_action_occurred_date_key"
ON "event_interactions"("user_key_hash", "event_id", "action", "occurred_date");

CREATE INDEX "event_interactions_event_id_action_occurred_date_idx"
ON "event_interactions"("event_id", "action", "occurred_date");

CREATE INDEX "event_interactions_action_occurred_date_idx"
ON "event_interactions"("action", "occurred_date");

ALTER TABLE "event_interactions"
ADD CONSTRAINT "event_interactions_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
