-- Keep the ticket discussion and status transitions together with the report.
CREATE TABLE "FeedbackComment" (
  "id" TEXT NOT NULL,
  "feedbackSubmissionId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "authorEmail" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'comment',
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedbackComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackComment_feedbackSubmissionId_createdAt_idx"
  ON "FeedbackComment"("feedbackSubmissionId", "createdAt");

ALTER TABLE "FeedbackComment"
  ADD CONSTRAINT "FeedbackComment_feedbackSubmissionId_fkey"
  FOREIGN KEY ("feedbackSubmissionId") REFERENCES "FeedbackSubmission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
