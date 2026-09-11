import { GET as handleSession } from "@/src/app/api/auth/session/route";

export async function GET() {
  return handleSession();
}
