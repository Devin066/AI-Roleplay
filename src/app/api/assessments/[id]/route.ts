import { NextResponse } from "next/server";

import {
  getFinalAssessmentById,
  saveAssessmentScoreOverride,
} from "@/src/lib/assessments/storage";
import { getAuthSession } from "@/src/lib/auth/session";
import { canUserAccessRolePlay, canUserManageRolePlay } from "@/src/lib/roleplays/access";
import { getRolePlayConfigById } from "@/src/lib/roleplays/serverStorage";
import type { AssessmentScoreOverride } from "@/src/lib/assessments/types";

type ScoreOverrideBody = {
  score?: unknown;
  reason?: unknown;
  clear?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCourseReviewer(
  session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>,
  roleplay: Awaited<ReturnType<typeof getRolePlayConfigById>>,
) {
  return session.role === "root_admin" || Boolean(roleplay && canUserManageRolePlay(session, roleplay));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAuthSession();
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const assessment = await getFinalAssessmentById(id);

    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
    }

    const roleplay = await getRolePlayConfigById(assessment.scenarioId);
    const canAccess =
      session.role === "root_admin" ||
      (session.role === "course_admin" && roleplay && canUserManageRolePlay(session, roleplay)) ||
      (assessment.learnerId === session.id && (!roleplay || canUserAccessRolePlay(session, roleplay)));

    if (!canAccess) {
      return NextResponse.json({ error: "Assessment access denied." }, { status: 403 });
    }

    return NextResponse.json(assessment);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load assessment.",
        details: error instanceof Error ? error.message : "Unknown assessment error.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAuthSession();
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const assessment = await getFinalAssessmentById(id);
    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
    }

    const roleplay = await getRolePlayConfigById(assessment.scenarioId);
    if (!isCourseReviewer(session, roleplay)) {
      return NextResponse.json(
        { error: "Only the course owner or root admin can override this score." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as ScoreOverrideBody;
    if (body.clear === true) {
      const saved = await saveAssessmentScoreOverride(id, undefined);
      return NextResponse.json(saved);
    }

    const score = typeof body.score === "number" ? body.score : Number(asString(body.score));
    const reason = asString(body.reason);

    if (!Number.isInteger(score) || score < 0 || score > 100) {
      return NextResponse.json({ error: "Override score must be a whole number from 0 to 100." }, { status: 400 });
    }

    if (reason.length < 10 || reason.length > 1000) {
      return NextResponse.json(
        { error: "Provide a review reason between 10 and 1,000 characters." },
        { status: 400 },
      );
    }

    const scoreOverride: AssessmentScoreOverride = {
      score,
      outcome: score >= 75 ? "passed" : "needs_review",
      reason,
      overriddenAt: new Date().toISOString(),
      overriddenBy: {
        id: session.id,
        name: session.name,
        email: session.email,
      },
    };
    const saved = await saveAssessmentScoreOverride(id, scoreOverride);
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ error: "Unable to save the score override." }, { status: 500 });
  }
}
