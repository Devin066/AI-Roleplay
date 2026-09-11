import { NextResponse } from "next/server";

import { findAuthUserByCredentials } from "@/src/lib/auth/userStore";
import { sessionCookieName } from "@/src/lib/auth/constants";
import { createSessionToken, sessionCookieOptions } from "@/src/lib/auth/session";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;
  let user = null;

  try {
    user = await findAuthUserByCredentials(asString(body.email), asString(body.password));
  } catch (error) {
    console.error("Login user lookup failed", error);
    return NextResponse.json(
      { error: "User database is not configured or is temporarily unavailable." },
      { status: 503 },
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const response = NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    },
  );

  response.cookies.set(sessionCookieName, createSessionToken(user.id), sessionCookieOptions());
  return response;
}
