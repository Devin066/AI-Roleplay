import { POST as handlePasswordChange } from "@/src/app/api/auth/password/route";

export async function POST(request: Request) {
  return handlePasswordChange(request);
}
