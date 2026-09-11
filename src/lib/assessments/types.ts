import type { Objective } from "@/src/lib/objectives/types";
import type { TranscriptEntry } from "@/src/lib/transcripts/types";

export type AssessmentDimension = {
  label: string;
  weight: number;
  score: number;
  summary: string;
  evidence: string[];
};

export type AssessmentScoreOverride = {
  score: number;
  outcome: "passed" | "needs_review";
  reason: string;
  overriddenAt: string;
  overriddenBy: {
    id: string;
    name: string;
    email: string;
  };
};

export type TranscriptTurn = {
  id: string;
  speaker_type: "engineer" | "customer_ai";
  speaker_id: string;
  text: string;
  startedAt: string;
  endedAt: string;
  entryIds: string[];
};

export type CoachTurnFeedback = {
  turnId: string;
  whatWorked: string;
  whatToImprove: string;
  suggestedBetterResponse: string;
};

export type SavedFinalAssessment = {
  id: string;
  transcriptSessionId: string;
  scenarioId: string;
  scenarioTitle: string;
  learnerId?: string;
  learnerName?: string;
  learnerEmail?: string;
  learnerRole?: string;
  createdAt: string;
  overallScore: number;
  outcome: "passed" | "needs_review";
  summary: string;
  strengths: string[];
  improvements: string[];
  completedObjectives: Objective[];
  missedObjectives: Objective[];
  dimensions: AssessmentDimension[];
  criticalRisks: string[];
  scoreOverride?: AssessmentScoreOverride;
  transcript: TranscriptEntry[];
};

export function effectiveAssessmentScore(assessment: SavedFinalAssessment) {
  return assessment.scoreOverride?.score ?? assessment.overallScore;
}

export function effectiveAssessmentOutcome(assessment: SavedFinalAssessment) {
  return assessment.scoreOverride?.outcome ?? assessment.outcome;
}

export type GenerateAssessmentInput = {
  transcriptSessionId: string;
  scenarioId: string;
  scenarioTitle: string;
  learnerId?: string;
  learnerName?: string;
  learnerEmail?: string;
  learnerRole?: string;
  objectives: Objective[];
  transcript: TranscriptEntry[];
};
