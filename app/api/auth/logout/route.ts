import { POST as handleLogout } from "@/src/app/api/auth/logout/route";

export async function POST() {
  return handleLogout();
}
