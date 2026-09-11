-- Persist feedback independently of the current account so it remains available
-- if an account is later changed or removed.
CREATE TABLE "FeedbackSubmission" (
  "id" TEXT NOT NULL,
  "ticketNumber" SERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "pagePath" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'feedback',
  "attachmentName" TEXT,
  "attachmentMimeType" TEXT,
  "attachmentSizeBytes" INTEGER,
  "attachmentStatus" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackSubmission_userId_idx" ON "FeedbackSubmission"("userId");
CREATE INDEX "FeedbackSubmission_status_createdAt_idx" ON "FeedbackSubmission"("status", "createdAt");
CREATE UNIQUE INDEX "FeedbackSubmission_ticketNumber_key" ON "FeedbackSubmission"("ticketNumber");
