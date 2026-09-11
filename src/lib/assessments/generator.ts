import type { Objective } from "@/src/lib/objectives/types";
import type {
  AssessmentDimension,
  GenerateAssessmentInput,
  SavedFinalAssessment,
} from "@/src/lib/assessments/types";
import {
  generateJsonCompletion,
  getFinalAssessmentLlmConfig,
} from "@/src/lib/llm/jsonCompletion";

type AiAssessmentPayload = {
  overallScore?: unknown;
  outcome?: unknown;
  summary?: unknown;
  overallSummary?: unknown;
  feedback?: unknown;
  strengths?: unknown;
  improvements?: unknown;
  dimensions?: unknown;
  rubric?: unknown;
  scores?: unknown;
  dimensionScores?: unknown;
  objectiveResults?: unknown;
  criticalRisks?: unknown;
};

type NormalizedAiAssessment = {
  overallScore: number;
  outcome: "passed" | "needs_review";
  summary: string;
  strengths: string[];
  improvements: string[];
  dimensions: AssessmentDimension[];
  objectiveResults: Objective[];
  criticalRisks: string[];
};

const ASSESSMENT_RUBRIC = [
  {
    label: "Objective Evidence & Coverage",
    weight: 30,
    description: "Required objectives are substantively satisfied with trainee-side evidence.",
  },
  {
    label: "Discovery & Situation Framing",
    weight: 15,
    description: "Relevant questions, active listening, and accurate framing of the customer's context.",
  },
  {
    label: "Empathy, Ownership & Trust",
    weight: 15,
    description: "Role-appropriate empathy, accountability, and confidence without overpromising.",
  },
  {
    label: "Technical / Business Accuracy",
    weight: 15,
    description: "Accurate, relevant explanations and recommendations grounded in the scenario.",
  },
  {
    label: "Resolution Plan & Expectations",
    weight: 15,
    description: "Specific next steps, ownership, timeline, and confirmation of expectations.",
  },
  {
    label: "Communication & Conversation Control",
    weight: 10,
    description: "Clear, concise, professional dialogue that adapts and closes naturally.",
  },
] as const;

const ASSESSMENT_DIMENSION_LABELS = ASSESSMENT_RUBRIC.map(
  (dimension) => dimension.label,
);

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampScore(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace("%", "").trim())
        : Number.NaN;

  if (Number.isNaN(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const firstLineBreak = trimmed.indexOf("\n");
  const lastFence = trimmed.lastIndexOf("```");
  if (firstLineBreak < 0 || lastFence <= firstLineBreak) {
    return trimmed;
  }
  return trimmed.slice(firstLineBreak + 1, lastFence).trim();
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (typeof value === "string") {
    const items = value
      .split(/\n|;/)
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 6);

    return items.length > 0 ? items : fallback;
  }

  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => asString(item).trim())
    .filter(Boolean)
    .slice(0, 6);

  return items.length > 0 ? items : fallback;
}

function dimensionSummaryFallback(label: string, score: number) {
  return `${label} is scored at ${score}. The model did not provide enough evidence for a fuller dimension explanation.`;
}

function normalizeEvidence(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item).trim())
    .filter(Boolean)
    .slice(0, 3);
}

function dimensionWeight(label: string) {
  return ASSESSMENT_RUBRIC.find((dimension) => dimension.label === label)?.weight ?? 0;
}

function normalizeDimensionItem(item: unknown, fallbackLabel?: string): AssessmentDimension | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const label = (
    asString(record.label) ||
    asString(record.name) ||
    asString(record.dimension) ||
    fallbackLabel ||
    ""
  ).trim();
  const rawSummary =
    asString(record.summary) ||
    asString(record.feedback) ||
    asString(record.reasoning) ||
    asString(record.comment);

  if (!label) {
    return null;
  }

  const score = clampScore(record.score ?? record.value ?? record.rating);
  return {
    label,
    weight: dimensionWeight(label),
    score,
    summary: rawSummary.trim() || dimensionSummaryFallback(label, score),
    evidence: normalizeEvidence(record.evidence ?? record.excerpts),
  };
}

function normalizeDimensions(value: unknown): AssessmentDimension[] {
  const dimensions = Array.isArray(value)
    ? value
      .map((item) => normalizeDimensionItem(item))
      .filter((item): item is AssessmentDimension => Boolean(item))
    : Object.entries(asRecord(value) ?? {})
        .map(([label, item]) => normalizeDimensionItem(item, label))
        .filter((item): item is AssessmentDimension => Boolean(item));

  const byLabel = new Map(dimensions.map((dimension) => [dimension.label, dimension]));
  return ASSESSMENT_RUBRIC.map((rubric) => {
    const dimension = byLabel.get(rubric.label);
    return dimension
      ? { ...dimension, weight: rubric.weight }
      : {
          label: rubric.label,
          weight: rubric.weight,
          score: 0,
          summary: dimensionSummaryFallback(rubric.label, 0),
          evidence: [],
        };
  });
}

function fallbackDimensions(overallScore: number): AssessmentDimension[] {
  return ASSESSMENT_RUBRIC.map(({ label, weight }) => ({
    label,
    weight,
    score: overallScore,
    summary: dimensionSummaryFallback(label, overallScore),
    evidence: [],
  }));
}

function normalizeObjectiveResults(value: unknown, objectives: Objective[]): Objective[] {
  if (!Array.isArray(value)) {
    return objectives.map((objective) => ({
      ...objective,
      completed: false,
      completedAt: undefined,
      evidence: undefined,
      confidence: undefined,
    }));
  }

  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const normalizedById = new Map<string, Objective>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const id = asString((item as { id?: unknown }).id).trim();
    const objective = objectiveById.get(id);
    if (!objective) {
      continue;
    }

    const completed = Boolean((item as { completed?: unknown }).completed);
    const confidence = (item as { confidence?: unknown }).confidence;
    const evidence = asString((item as { evidence?: unknown }).evidence).trim();

    normalizedById.set(id, {
      ...objective,
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
      confidence:
        typeof confidence === "number" && !Number.isNaN(confidence)
          ? Math.max(0, Math.min(1, confidence))
          : undefined,
      evidence: completed && evidence ? evidence : undefined,
    });
  }

  return objectives.map(
    (objective) =>
      normalizedById.get(objective.id) ?? {
        ...objective,
        completed: false,
        completedAt: undefined,
        evidence: undefined,
        confidence: undefined,
      },
  );
}

function parseAiAssessment(content: string, objectives: Objective[]): NormalizedAiAssessment {
  const parsed = JSON.parse(stripCodeFence(content)) as AiAssessmentPayload;
  const objectiveResults = normalizeObjectiveResults(parsed.objectiveResults, objectives);
  const overallScore = clampScore(parsed.overallScore);
  const outcome = parsed.outcome === "passed" ? "passed" : "needs_review";
  const dimensions =
    normalizeDimensions(parsed.dimensions).length > 0
      ? normalizeDimensions(parsed.dimensions)
      : normalizeDimensions(parsed.rubric).length > 0
        ? normalizeDimensions(parsed.rubric)
        : normalizeDimensions(parsed.dimensionScores).length > 0
          ? normalizeDimensions(parsed.dimensionScores)
          : normalizeDimensions(parsed.scores);
  const summary = (
    asString(parsed.summary) ||
    asString(parsed.overallSummary) ||
    asString(parsed.feedback) ||
    `Final assessment completed with an overall score of ${overallScore}%. Review objective coverage and coaching notes for specific next steps.`
  ).trim();
  const strengths = normalizeStringArray(parsed.strengths, [
    "Completed a roleplay attempt for review.",
  ]);
  const improvements = normalizeStringArray(parsed.improvements, [
    "Continue practicing concise summaries and customer confirmation checks.",
  ]);
  const criticalRisks = normalizeStringArray(parsed.criticalRisks, []);

  return {
    overallScore,
    outcome,
    summary,
    strengths,
    improvements,
    dimensions: dimensions.length > 0 ? dimensions : fallbackDimensions(overallScore),
    objectiveResults,
    criticalRisks,
  };
}

function completedObjectives(objectives: Objective[]) {
  return objectives.filter((objective) => objective.completed);
}

function missedRequiredObjectives(objectives: Objective[]) {
  return objectives.filter((objective) => objective.required && !objective.completed);
}

function evidenceFirstScore(
  dimensions: AssessmentDimension[],
  missedObjectives: Objective[],
  criticalRisks: string[],
) {
  const weightedScore = Math.round(
    dimensions.reduce(
      (total, dimension) => total + dimension.score * (dimension.weight / 100),
      0,
    ),
  );

  // Passing requires complete required-objective coverage. These gates keep a polished
  // conversation from passing when key customer needs were not actually addressed.
  if (criticalRisks.length > 0) {
    return Math.min(weightedScore, 59);
  }

  if (missedObjectives.length > 0) {
    return Math.min(weightedScore, 74);
  }

  return weightedScore;
}

function assessmentSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "overallScore",
      "outcome",
      "summary",
      "strengths",
      "improvements",
      "dimensions",
      "objectiveResults",
      "criticalRisks",
    ],
    properties: {
      overallScore: {
        type: "number",
        minimum: 0,
        maximum: 100,
      },
      outcome: {
        type: "string",
        enum: ["passed", "needs_review"],
      },
      summary: {
        type: "string",
      },
      strengths: {
        type: "array",
        items: { type: "string" },
      },
      improvements: {
        type: "array",
        items: { type: "string" },
      },
      criticalRisks: {
        type: "array",
        items: { type: "string" },
      },
      dimensions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "score", "summary", "evidence"],
          properties: {
            label: {
              type: "string",
              enum: ASSESSMENT_DIMENSION_LABELS,
            },
            score: {
              type: "number",
              minimum: 0,
              maximum: 100,
            },
            summary: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
      objectiveResults: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "completed", "confidence", "evidence"],
          properties: {
            id: { type: "string" },
            completed: { type: "boolean" },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
            },
            evidence: { type: "string" },
          },
        },
      },
    },
  };
}

export async function generateFinalAssessment(
  input: GenerateAssessmentInput,
): Promise<SavedFinalAssessment> {
  const llmConfig = getFinalAssessmentLlmConfig();

  const assessmentPrompt = [
    "You are a strict but constructive final assessor for a customer-facing roleplay training simulation.",
    "Your job is to evaluate only the trainee's performance using the provided scenario, learner role, objectives, rubric, completed objective tracker results, and transcript.",
    "The trainee may be acting in different customer-facing roles, including but not limited to: technical support engineer, customer success manager, sales representative, onboarding specialist, solutions consultant, account manager, or escalation manager.",
    "Do not assume the scenario is always technical support. Evaluate the trainee based on the configured scenario, learner role, objectives, and transcript evidence.",
    "Customer_ai messages are context only. Do not score, praise, penalize, or give credit for customer_ai messages.",
    "Only evaluate messages where speaker_type is 'engineer' or the configured trainee speaker label.",
    "Use trainee-side evidence from the transcript. If evidence is not present in the trainee's text, do not award credit.",
    "If the trainee explains a required concept across multiple turns, evaluate the combined trainee transcript instead of only one utterance.",
    "Treat live objective tracker results as helpful signals, not absolute truth. You may disagree if the transcript does not support the tracker evidence.",
    "You are the final source of truth for objective completion. Re-evaluate every objective from the full trainee transcript and return objectiveResults for every objective id provided.",
    "For each objectiveResult, completed must be true only when the trainee's own transcript clearly satisfies the objective. Evidence must be an exact trainee-side quote or concise exact excerpt. If not completed, evidence must be an empty string and confidence should be low.",
    "A high score requires strong performance against the configured objectives and roleplay context. Depending on the scenario, this may include required objective coverage, empathy or rapport-building, ownership and accountability, relevant discovery questions, clear explanation or value framing, appropriate handling of objections, concerns, or escalation, concise and professional communication, clear next steps, confirmation of customer needs, expectations, or success criteria, and good conversation control without sounding dismissive or overly scripted.",
    "For product explanation, comparison, or difference scenarios, score whether the trainee explained both sides, contrasted them clearly, and recommended the best fit for the customer's use case.",
    "A low or mid score is appropriate when the trainee is polite but misses required objectives, gives vague or incomplete next steps, fails to take ownership, does not confirm key details, does not ask enough discovery questions, does not address the customer's stated concern, overpromises, sounds defensive or dismissive, focuses on the wrong topic, or fails to adapt to the scenario context.",
    "Do not inflate scores because the conversation ended, all objectives were marked complete by the tracker, the customer_ai appeared satisfied, the trainee used polite language without substance, or the trainee mentioned keywords without meaningfully addressing the objective.",
    "Use specific, actionable coaching language. Strengths and improvements should help the trainee understand what they did well, what they missed, and how to improve in a future simulation.",
    "When giving suggested better answers, write realistic responses the trainee could have said in the scenario. Make them concise, professional, and aligned with the learner role.",
    "Return exactly six rubric dimensions with these exact labels: Objective Evidence & Coverage, Discovery & Situation Framing, Empathy, Ownership & Trust, Technical / Business Accuracy, Resolution Plan & Expectations, Communication & Conversation Control.",
    "Each rubric dimension must include one to three exact trainee-side excerpts in evidence when credit is awarded. Do not invent excerpts. Use an empty evidence array when no transcript support exists.",
    "Each rubric dimension summary must explain why that dimension received its score using evidence or a specific missing behavior.",
    "List criticalRisks only for material trainee-side issues such as an unsupported commitment, inaccurate product claim, unsafe advice, or seriously unprofessional conduct. Use an empty array when none exists.",
    "Dimension scores are weighted by the supplied rubric. Do not inflate the overallScore; the application independently calculates the final score from the weighted dimensions and objective gates.",
    "Scoring guidance: 90-100 Excellent. Objectives were covered with strong evidence, communication was clear, and the trainee handled the scenario with confidence and appropriate next steps.",
    "Scoring guidance: 75-89 Good. Most objectives were covered, but there are some gaps in clarity, depth, ownership, discovery, or delivery.",
    "Scoring guidance: 60-74 Mixed. The trainee showed some useful behaviors but missed important objectives or gave incomplete responses.",
    "Scoring guidance: 40-59 Weak. Several required objectives were missed or handled vaguely.",
    "Scoring guidance: 0-39 Poor. The trainee failed to address the scenario effectively or provided little usable response.",
    "Return JSON only that matches the required schema. Do not include markdown, prose outside JSON, comments, or extra fields.",
  ].join("\n");

  const assessmentInput = {
    scenarioId: input.scenarioId,
    scenarioTitle: input.scenarioTitle,
    learnerRole: input.learnerRole ?? "Trainee",
    traineeSpeakerLabel: "engineer",
    objectives: input.objectives.map((objective) => ({
      id: objective.id,
      label: objective.label,
      required: objective.required,
      guideOnly: true,
    })),
    transcript: input.transcript.map((entry) => ({
      speaker_type: entry.speaker_type,
      text: entry.text,
      timestamp: entry.timestamp,
    })),
    rubric: ASSESSMENT_RUBRIC,
    scoringGuidance: {
      passed:
        "Use passed only when the trainee covered all or nearly all required objectives and the overall score is at least 75.",
      needs_review:
        "Use needs_review when required objectives were missed, evidence is weak, the trainee did not adapt to the learner role, or the overall score is below 75.",
      evidenceRule:
        "Base all scoring claims on trainee transcript lines. Do not infer actions that were not said by the trainee.",
      comparisonRule:
        "For difference/comparison objectives, the trainee can satisfy the objective across multiple turns when their own transcript explains both concepts and connects the recommendation to the customer use case.",
    },
  };

  const content = await generateJsonCompletion({
    config: llmConfig,
    systemPrompt: assessmentPrompt,
    userPayload: assessmentInput,
    temperature: 0.2,
    responseFormat: {
      type: "json_schema",
      name: "final_roleplay_assessment",
      strict: true,
      schema: assessmentSchema(),
    },
    errorLabel: "AI final assessment",
  });

  const aiAssessment = parseAiAssessment(content, input.objectives);
  const completed = completedObjectives(aiAssessment.objectiveResults);
  const missed = missedRequiredObjectives(aiAssessment.objectiveResults);
  const overallScore = evidenceFirstScore(
    aiAssessment.dimensions,
    missed,
    aiAssessment.criticalRisks,
  );
  const outcome =
    overallScore >= 75 && missed.length === 0 && aiAssessment.criticalRisks.length === 0
      ? "passed"
      : "needs_review";

  return {
    id: `assessment-${input.transcriptSessionId}`,
    transcriptSessionId: input.transcriptSessionId,
    scenarioId: input.scenarioId,
    scenarioTitle: input.scenarioTitle,
    learnerId: input.learnerId,
    learnerName: input.learnerName,
    learnerEmail: input.learnerEmail,
    learnerRole: input.learnerRole,
    createdAt: new Date().toISOString(),
    overallScore,
    outcome,
    summary: aiAssessment.summary,
    strengths: aiAssessment.strengths,
    improvements: aiAssessment.improvements,
    completedObjectives: completed,
    missedObjectives: missed,
    dimensions: aiAssessment.dimensions,
    criticalRisks: aiAssessment.criticalRisks,
    transcript: input.transcript,
  };
}
