import { POST as handleLogin } from "@/src/app/api/auth/login/route";

// Keep the handler explicit so Next registers this App Router endpoint reliably.
export async function POST(request: Request) {
  return handleLogin(request);
}
