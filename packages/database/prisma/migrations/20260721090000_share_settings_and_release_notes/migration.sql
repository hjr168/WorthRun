CREATE TYPE "ReleaseNoteStatus" AS ENUM ('draft', 'published', 'offline');

CREATE TABLE "event_share_overrides" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "title_template" TEXT,
  "image_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_share_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "release_notes" (
  "id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "changes" JSONB NOT NULL,
  "status" "ReleaseNoteStatus" NOT NULL DEFAULT 'draft',
  "released_at" TIMESTAMP(3) NOT NULL,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "release_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_share_overrides_event_id_key"
ON "event_share_overrides"("event_id");

CREATE UNIQUE INDEX "release_notes_version_key" ON "release_notes"("version");
CREATE INDEX "release_notes_status_released_at_idx"
ON "release_notes"("status", "released_at");
CREATE INDEX "release_notes_status_published_at_idx"
ON "release_notes"("status", "published_at");

ALTER TABLE "event_share_overrides"
ADD CONSTRAINT "event_share_overrides_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
