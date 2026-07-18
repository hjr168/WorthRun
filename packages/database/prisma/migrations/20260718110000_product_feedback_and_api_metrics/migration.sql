CREATE TYPE "FeedbackScope" AS ENUM ('event_correction', 'product_feedback');

ALTER TABLE "feedback"
ADD COLUMN "scope" "FeedbackScope" NOT NULL DEFAULT 'event_correction',
ADD COLUMN "context_page" TEXT,
ADD COLUMN "app_version" TEXT,
ADD COLUMN "related_request_id" TEXT;

CREATE INDEX "feedback_scope_status_created_at_idx"
ON "feedback"("scope", "status", "created_at");

CREATE INDEX "feedback_context_page_idx" ON "feedback"("context_page");

CREATE TABLE "api_error_metrics" (
  "bucket_start" TIMESTAMP(3) NOT NULL,
  "route_group" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "api_error_metrics_pkey"
  PRIMARY KEY ("bucket_start", "route_group", "category")
);

CREATE INDEX "api_error_metrics_bucket_start_idx"
ON "api_error_metrics"("bucket_start");
