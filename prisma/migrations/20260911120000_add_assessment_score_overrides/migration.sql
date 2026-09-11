ALTER TABLE "FinalAssessment" ADD COLUMN "criticalRisks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "FinalAssessment" ADD COLUMN "scoreOverride" JSONB;
