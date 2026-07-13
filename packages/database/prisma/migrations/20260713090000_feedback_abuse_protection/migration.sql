ALTER TABLE "feedback"
ADD COLUMN "request_id" TEXT,
ADD COLUMN "fingerprint" TEXT;

CREATE UNIQUE INDEX "feedback_request_id_key" ON "feedback"("request_id");
CREATE INDEX "feedback_fingerprint_idx" ON "feedback"("fingerprint");

CREATE TABLE "feedback_fingerprints" (
    "fingerprint" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_fingerprints_pkey" PRIMARY KEY ("fingerprint")
);

CREATE UNIQUE INDEX "feedback_fingerprints_feedback_id_key" ON "feedback_fingerprints"("feedback_id");
CREATE INDEX "feedback_fingerprints_expires_at_idx" ON "feedback_fingerprints"("expires_at");

CREATE TABLE "feedback_rate_limits" (
    "scope" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_rate_limits_pkey" PRIMARY KEY ("scope", "key_hash", "window_start")
);

CREATE INDEX "feedback_rate_limits_window_start_idx" ON "feedback_rate_limits"("window_start");

ALTER TABLE "feedback_fingerprints"
ADD CONSTRAINT "feedback_fingerprints_feedback_id_fkey"
FOREIGN KEY ("feedback_id") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
