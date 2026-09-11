import {
  GET as handleGetAssessment,
  PATCH as handleUpdateAssessment,
} from "@/src/app/api/assessments/[id]/route";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleGetAssessment(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleUpdateAssessment(request, context);
}
