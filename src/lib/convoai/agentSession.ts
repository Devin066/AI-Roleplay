import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const convoAiAgentCookieName = "cse-convoai-agent";

type ConvoAiAgentSession = {
  userId: string;
  agentId: string;
  expiresAt: number;
};

const maxAgeSeconds = 60 * 60;

function signingSecret() {
  const configuredSecret =
    process.env.CONVOAI_AGENT_SESSION_SECRET?.trim() ||
    process.env.AUTH_SESSION_SECRET?.trim();

  // Development remains usable without local configuration. Production must supply a secret.
  if (!configuredSecret && process.env.NODE_ENV === "production") {
    throw new Error("CONVOAI_AGENT_SESSION_SECRET or AUTH_SESSION_SECRET is required.");
  }

  return configuredSecret || "cse-convoai-agent-session-dev-secret";
}

export function hasConvoAiAgentSessionSigningSecret() {
  return (
    process.env.NODE_ENV !== "production" ||
    Boolean(
      process.env.CONVOAI_AGENT_SESSION_SECRET?.trim() ||
        process.env.AUTH_SESSION_SECRET?.trim(),
    )
  );
}

function encryptionKey() {
  return createHash("sha256").update(signingSecret()).digest();
}

export function isValidConvoAiAgentId(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function createConvoAiAgentSessionToken(userId: string, agentId: string) {
  const payload: ConvoAiAgentSession = {
    userId,
    agentId,
    expiresAt: Date.now() + maxAgeSeconds * 1000,
  };
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), initializationVector);
  const encryptedPayload = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);

  // This opaque value is safe to put in an HttpOnly cookie: its contents are unreadable client-side.
  return [
    initializationVector.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encryptedPayload.toString("base64url"),
  ].join(".");
}

export function readConvoAiAgentSessionToken(
  token: string | undefined,
  userId: string,
) {
  if (!token) {
    return null;
  }

  const [encodedInitializationVector, encodedAuthTag, encodedPayload] = token.split(".");
  if (!encodedInitializationVector || !encodedAuthTag || !encodedPayload) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(encodedInitializationVector, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
    const decryptedPayload = Buffer.concat([
      decipher.update(Buffer.from(encodedPayload, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(
      decryptedPayload,
    ) as Partial<ConvoAiAgentSession>;

    if (
      payload.userId !== userId ||
      typeof payload.agentId !== "string" ||
      !isValidConvoAiAgentId(payload.agentId) ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }

    return payload.agentId;
  } catch {
    return null;
  }
}

export function convoAiAgentCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/convoai",
    maxAge: maxAgeSeconds,
  };
}
