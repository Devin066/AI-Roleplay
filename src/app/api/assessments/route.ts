import { NextResponse } from "next/server";

import { listFinalAssessments } from "@/src/lib/assessments/storage";
import { getAuthSession } from "@/src/lib/auth/session";
import { canUserAccessRolePlay, canUserManageRolePlay } from "@/src/lib/roleplays/access";
import { listRolePlayConfigs } from "@/src/lib/roleplays/serverStorage";

type AssessmentScope = "accessible" | "mine" | "learners";

function assessmentBelongsToUser(
  assessment: { learnerId?: string; learnerEmail?: string },
  user: { id: string; email: string },
) {
  return (
    assessment.learnerId === user.id ||
    (!assessment.learnerId &&
      assessment.learnerEmail?.toLowerCase() === user.email.toLowerCase())
  );
}

function requestedScope(request: Request): AssessmentScope | null {
  const scope = new URL(request.url).searchParams.get("scope");

  if (!scope || scope === "accessible") return "accessible";
  if (scope === "mine" || scope === "learners") return scope;
  return null;
}

export async function GET(request: Request) {
  try {
    const session = await getAuthSession();

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const scope = requestedScope(request);
    if (!scope) {
      return NextResponse.json(
        { error: "Assessment scope must be mine or learners." },
        { status: 400 },
      );
    }

    const assessments = await listFinalAssessments();
    const roleplays = await listRolePlayConfigs();
    const accessibleScenarioIds = new Set(
      roleplays
        .filter((roleplay) => canUserAccessRolePlay(session, roleplay))
        .map((roleplay) => roleplay.id),
    );
    const manageableScenarioIds = new Set(
      roleplays
        .filter((roleplay) => canUserManageRolePlay(session, roleplay))
        .map((roleplay) => roleplay.id),
    );
    const canReviewLearners = session.role === "root_admin" || manageableScenarioIds.size > 0;

    if (scope === "mine") {
      return NextResponse.json({
        assessments: assessments.filter(
          (assessment) =>
            (session.role === "root_admin" ||
              accessibleScenarioIds.has(assessment.scenarioId)) &&
            assessmentBelongsToUser(assessment, session),
        ),
        canReviewLearners,
      });
    }

    if (scope === "learners") {
      if (!canReviewLearners) {
        return NextResponse.json(
          { error: "Learner review is available only to course admins and root admins." },
          { status: 403 },
        );
      }

      return NextResponse.json({
        assessments: assessments.filter(
          (assessment) =>
            (session.role === "root_admin" ||
              manageableScenarioIds.has(assessment.scenarioId)) &&
            !assessmentBelongsToUser(assessment, session),
        ),
        canReviewLearners,
      });
    }

    if (session.role === "root_admin") {
      return NextResponse.json({ assessments, canReviewLearners });
    }

    return NextResponse.json({
      assessments: assessments.filter(
        (assessment) =>
          accessibleScenarioIds.has(assessment.scenarioId) &&
          (manageableScenarioIds.has(assessment.scenarioId) ||
            assessmentBelongsToUser(assessment, session)),
      ),
      canReviewLearners,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load assessment history.",
        details: error instanceof Error ? error.message : "Unknown assessment history error.",
      },
      { status: 500 },
    );
  }
}
