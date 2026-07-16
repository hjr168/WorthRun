CREATE TABLE "feedback_abuse_metrics" (
    "day" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_abuse_metrics_pkey" PRIMARY KEY ("day", "reason")
);

CREATE INDEX "feedback_abuse_metrics_day_idx" ON "feedback_abuse_metrics"("day");
