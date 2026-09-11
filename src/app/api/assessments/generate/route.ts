import { NextResponse } from "next/server";

import { generateFinalAssessment } from "@/src/lib/assessments/generator";
import { saveFinalAssessment } from "@/src/lib/assessments/storage";
import type { GenerateAssessmentInput } from "@/src/lib/assessments/types";
import { getAuthSession } from "@/src/lib/auth/session";
import { canUserAccessRolePlay } from "@/src/lib/roleplays/access";
import { getRolePlayConfigById } from "@/src/lib/roleplays/serverStorage";
import { getTranscriptSessionById } from "@/src/lib/transcripts/storage";

type GenerateAssessmentBody = {
  transcriptSessionId?: unknown;
  scenarioId?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    const body = (await request.json().catch(() => ({}))) as GenerateAssessmentBody;

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const transcriptSessionId = asString(body.transcriptSessionId);
    const scenarioId = asString(body.scenarioId);
    const [roleplay, transcriptSession] = await Promise.all([
      getRolePlayConfigById(scenarioId),
      getTranscriptSessionById(transcriptSessionId),
    ]);

    if (!roleplay || !canUserAccessRolePlay(session, roleplay)) {
      return NextResponse.json({ error: "Roleplay access denied." }, { status: 403 });
    }

    if (!transcriptSession || transcriptSession.scenarioId !== roleplay.id) {
      return NextResponse.json({ error: "Saved transcript session not found." }, { status: 404 });
    }

    const input: GenerateAssessmentInput = {
      transcriptSessionId: transcriptSession.id,
      scenarioId: roleplay.id,
      scenarioTitle: roleplay.settings.meetingTitle,
      learnerId: session.id,
      learnerName: session.name,
      learnerEmail: session.email,
      learnerRole: roleplay.plan.learnerRole,
      objectives: roleplay.settings.learnerGoals,
      transcript: transcriptSession.transcript,
    };

    if (!input.transcriptSessionId || !input.scenarioId || !input.scenarioTitle) {
      return NextResponse.json(
        { error: "transcriptSessionId, scenarioId, and scenarioTitle are required." },
        { status: 400 },
      );
    }

    const assessment = await saveFinalAssessment(await generateFinalAssessment(input));

    return NextResponse.json({
      assessmentId: assessment.id,
      createdAt: assessment.createdAt,
      overallScore: assessment.overallScore,
      outcome: assessment.outcome,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to generate final assessment.",
        details: error instanceof Error ? error.message : "Unknown final assessment error.",
      },
      { status: 500 },
    );
  }
}
