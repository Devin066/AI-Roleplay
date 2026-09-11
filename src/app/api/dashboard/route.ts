import { NextResponse } from "next/server";

import { listFinalAssessments } from "@/src/lib/assessments/storage";
import { getAuthSession } from "@/src/lib/auth/session";
import { listAuthUsers } from "@/src/lib/auth/userStore";
import { isDatabaseConfigured, prisma } from "@/src/lib/db/prisma";
import {
  getFinalAssessmentLlmConfig,
  getObjectiveEvaluatorLlmConfig,
} from "@/src/lib/llm/jsonCompletion";
import { canUserTakeRolePlay } from "@/src/lib/roleplays/access";
import { maxTraineeRolePlayAttempts } from "@/src/lib/roleplays/attempts";
import { listRolePlayConfigs } from "@/src/lib/roleplays/serverStorage";
import type { RolePlayConfig } from "@/src/lib/roleplays/types";

function roleLabel(role: string) {
  if (role === "root_admin") return "Root Admin";
  if (role === "course_admin") return "Course Admin";
  return "Trainee";
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function isConfigured(values: Array<string | undefined>) {
  return values.every((value) => Boolean(value?.trim()));
}

function safeLlmHealth(name: string, config: ReturnType<typeof getFinalAssessmentLlmConfig>) {
  const ready = Boolean(config.apiKey && config.model && config.baseUrl);

  return {
    id: name.toLowerCase().replaceAll(" ", "-"),
    label: name,
    status: ready ? "operational" : "attention",
    detail: ready
      ? `${config.provider.toUpperCase()} / ${config.model}`
      : "Missing provider model, base URL, or API key.",
    meta: config.wireApi,
  };
}

async function databaseHealth() {
  if (!isDatabaseConfigured()) {
    return {
      id: "database",
      label: "Database Connection",
      status: "attention",
      detail: "DATABASE_URL is not configured.",
      meta: "not configured",
    };
  }

  await prisma.$queryRaw`SELECT 1`;
  return {
    id: "database",
    label: "Database Connection",
    status: "operational",
    detail: "Prisma query succeeded.",
    meta: "connected",
  };
}

function convoAiHealth() {
  const ready = isConfigured([
    process.env.AGORA_APP_ID ?? process.env.NEXT_PUBLIC_AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    process.env.AGORA_CUSTOMER_ID,
    process.env.AGORA_CUSTOMER_SECRET,
  ]);
  const managedModel = process.env.CONVOAI_MANAGED_LLM_MODEL?.trim() || "gpt-4o-mini";

  return {
    id: "convoai",
    label: "ConvoAI Config",
    status: ready ? "operational" : "attention",
    detail: ready
      ? `Agora app and customer credentials are configured for the managed ${managedModel} roleplay LLM.`
      : "Missing Agora app or customer credentials.",
    meta: "managed LLM",
  };
}

function summarizeRoleplay(roleplay: RolePlayConfig) {
  return {
    id: roleplay.id,
    title: roleplay.settings.meetingTitle,
    status: roleplay.status,
    characterName: roleplay.character.name,
    durationMinutes: roleplay.settings.durationMinutes,
    assignedCount: roleplay.settings.assignedTraineeIds?.length ?? 0,
    ownerName: roleplay.createdBy?.name ?? "Unknown",
    updatedAt: roleplay.updatedAt ?? roleplay.createdAt,
    scenario: roleplay.plan.scenario,
  };
}

export async function GET() {
  const session = await getAuthSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const [roleplays, assessments, users] = await Promise.all([
      listRolePlayConfigs(),
      listFinalAssessments(),
      session.role === "root_admin" ? listAuthUsers() : Promise.resolve([]),
    ]);

    if (session.role === "root_admin") {
      const [database, attemptsCount] = await Promise.all([
        databaseHealth(),
        isDatabaseConfigured() ? prisma.rolePlayAttempt.count() : Promise.resolve(0),
      ]);
      const activeUsers = users.filter((user) => user.isActive).length;
      const published = roleplays.filter((roleplay) => roleplay.status === "published").length;
      const scores = assessments.map((assessment) => assessment.overallScore);
      const passed = assessments.filter((assessment) => assessment.outcome === "passed").length;
      const courseAdmins = users.filter((user) => user.role === "course_admin").length;
      const trainees = users.filter((user) => user.role === "trainee").length;

      return NextResponse.json({
        kind: "root_admin",
        user: session,
        metrics: {
          totalUsers: users.length,
          activeUsers,
          inactiveUsers: users.length - activeUsers,
          courseAdmins,
          trainees,
          totalCourses: roleplays.length,
          publishedCourses: published,
          draftCourses: roleplays.length - published,
          assessments: assessments.length,
          averageScore: average(scores),
          passRate: assessments.length === 0 ? null : Math.round((passed / assessments.length) * 100),
          attempts: attemptsCount,
        },
        health: [
          database,
          convoAiHealth(),
          safeLlmHealth("Objective Evaluator LLM", getObjectiveEvaluatorLlmConfig()),
          safeLlmHealth("Final Assessment LLM", getFinalAssessmentLlmConfig()),
        ],
        recentCourses: roleplays.slice(0, 5).map(summarizeRoleplay),
        recentAssessments: assessments.slice(0, 5).map((assessment) => ({
          id: assessment.id,
          title: assessment.scenarioTitle,
          learnerName: assessment.learnerName ?? "Unknown learner",
          learnerEmail: assessment.learnerEmail ?? "Not recorded",
          score: assessment.overallScore,
          outcome: assessment.outcome,
          createdAt: assessment.createdAt,
        })),
        roleBreakdown: [
          { label: "Root Admins", value: users.filter((user) => user.role === "root_admin").length },
          { label: "Course Admins", value: courseAdmins },
          { label: "Trainees", value: trainees },
        ],
      });
    }

    const assignedRoleplays = roleplays.filter((roleplay) => canUserTakeRolePlay(session, roleplay));
    const learnerAssessments = assessments.filter((assessment) => assessment.learnerId === session.id);
    const createdRoleplays =
      session.role === "course_admin"
        ? roleplays.filter((roleplay) => roleplay.createdBy?.id === session.id)
        : [];
    const completedScenarioIds = new Set(learnerAssessments.map((assessment) => assessment.scenarioId));
    const passed = learnerAssessments.filter((assessment) => assessment.outcome === "passed").length;

    return NextResponse.json({
      kind: "learner",
      user: session,
      metrics: {
        assignedCourses: assignedRoleplays.length,
        completedCourses: completedScenarioIds.size,
        remainingCourses: Math.max(0, assignedRoleplays.length - completedScenarioIds.size),
        assessments: learnerAssessments.length,
        averageScore: average(learnerAssessments.map((assessment) => assessment.overallScore)),
        passed,
        createdCourses: createdRoleplays.length,
        publishedCreatedCourses: createdRoleplays.filter((roleplay) => roleplay.status === "published").length,
      },
      assignedCourses: assignedRoleplays.slice(0, 6).map((roleplay) => ({
        ...summarizeRoleplay(roleplay),
        completed: completedScenarioIds.has(roleplay.id),
        maxAttempts: maxTraineeRolePlayAttempts,
      })),
      createdCourses: createdRoleplays.slice(0, 4).map(summarizeRoleplay),
      recentAssessments: learnerAssessments.slice(0, 5).map((assessment) => ({
        id: assessment.id,
        title: assessment.scenarioTitle,
        score: assessment.overallScore,
        outcome: assessment.outcome,
        summary: assessment.summary,
        createdAt: assessment.createdAt,
      })),
      roleLabel: roleLabel(session.role),
    });
  } catch (error) {
    console.error("Dashboard data query failed", error);
    return NextResponse.json(
      {
        error: "Dashboard is temporarily unavailable.",
        message: "We could not load dashboard data right now. Please try again later.",
      },
      { status: 500 },
    );
  }
}
