import { NextResponse } from "next/server";

import {
  deleteFinalAssessment,
  getFinalAssessmentById,
  listFinalAssessments,
} from "@/src/lib/assessments/storage";
import { getAuthSession } from "@/src/lib/auth/session";
import { findAuthUserById } from "@/src/lib/auth/userStore";
import { resetServerRolePlayAttempt } from "@/src/lib/roleplays/serverAttempts";
import {
  getRolePlayConfigById,
  listRolePlayConfigs,
  saveRolePlayConfig,
} from "@/src/lib/roleplays/serverStorage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DeleteLearningRecordBody = {
  action?: unknown;
  assessmentId?: unknown;
  rolePlayId?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

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

async function requireRootAdmin() {
  const session = await getAuthSession();
  return session?.role === "root_admin" ? session : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireRootAdmin();
  const { id } = await context.params;

  if (!session) {
    return NextResponse.json({ error: "Root admin access required." }, { status: 403 });
  }

  const user = await findAuthUserById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const [roleplays, assessments] = await Promise.all([
    listRolePlayConfigs(),
    listFinalAssessments(),
  ]);

  return NextResponse.json({
    user,
    courses: roleplays
      .filter((roleplay) => roleplay.settings.assignedTraineeIds?.includes(user.id))
      .map((roleplay) => ({
        id: roleplay.id,
        title: roleplay.settings.meetingTitle,
        status: roleplay.status,
        deadlineAt: roleplay.settings.deadlineAt,
        deadlineTimezone: roleplay.settings.deadlineTimezone,
        createdByName: roleplay.createdBy?.name,
      })),
    assessments: assessments
      .filter((assessment) => assessmentBelongsToUser(assessment, user))
      .map((assessment) => ({
        id: assessment.id,
        scenarioId: assessment.scenarioId,
        scenarioTitle: assessment.scenarioTitle,
        createdAt: assessment.createdAt,
        overallScore: assessment.overallScore,
        outcome: assessment.outcome,
        summary: assessment.summary,
        scoreOverride: assessment.scoreOverride,
      })),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await requireRootAdmin();
  const { id } = await context.params;

  if (!session) {
    return NextResponse.json({ error: "Root admin access required." }, { status: 403 });
  }

  const user = await findAuthUserById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as DeleteLearningRecordBody;
  const action = asString(body.action);

  if (action === "remove_course_assignment") {
    const rolePlayId = asString(body.rolePlayId);
    const roleplay = await getRolePlayConfigById(rolePlayId);

    if (!roleplay || !roleplay.settings.assignedTraineeIds?.includes(user.id)) {
      return NextResponse.json({ error: "Assigned course not found." }, { status: 404 });
    }

    const { [user.id]: _removedOverride, ...attemptOverrides } =
      roleplay.settings.attemptOverrides ?? {};
    const nextRoleplay = await saveRolePlayConfig({
      ...roleplay,
      settings: {
        ...roleplay.settings,
        assignedTraineeIds: roleplay.settings.assignedTraineeIds.filter(
          (assignedUserId) => assignedUserId !== user.id,
        ),
        attemptOverrides:
          Object.keys(attemptOverrides).length > 0 ? attemptOverrides : undefined,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: {
        id: session.id,
        name: session.name,
        email: session.email,
        role: session.role,
      },
    });

    await resetServerRolePlayAttempt(user.id, rolePlayId, nextRoleplay);
    return NextResponse.json({ removed: true });
  }

  if (action === "delete_assessment") {
    const assessmentId = asString(body.assessmentId);
    const assessment = await getFinalAssessmentById(assessmentId);

    if (!assessment || !assessmentBelongsToUser(assessment, user)) {
      return NextResponse.json({ error: "Assessment not found for this user." }, { status: 404 });
    }

    const deleted = await deleteFinalAssessment(assessmentId);
    if (!deleted) {
      return NextResponse.json({ error: "Unable to delete the assessment." }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  }

  return NextResponse.json({ error: "Valid learning-record action is required." }, { status: 400 });
}
