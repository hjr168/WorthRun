-- CreateTable
CREATE TABLE "share_records" (
    "id" TEXT NOT NULL,
    "user_key" TEXT,
    "event_id" TEXT,
    "share_type" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "share_records_event_id_idx" ON "share_records"("event_id");

-- CreateIndex
CREATE INDEX "share_records_created_at_idx" ON "share_records"("created_at");

-- AddForeignKey
ALTER TABLE "share_records" ADD CONSTRAINT "share_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
