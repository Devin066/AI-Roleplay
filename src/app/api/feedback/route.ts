import { NextResponse } from "next/server";

import { getAuthSession } from "@/src/lib/auth/session";
import { isDatabaseConfigured, prisma } from "@/src/lib/db/prisma";
import { notifyWeComOfNewFeedback } from "@/src/lib/notifications/wecom";

const maxAttachmentSizeBytes = 25 * 1024 * 1024;

type FeedbackBody = {
  title?: unknown;
  description?: unknown;
  pagePath?: unknown;
  category?: unknown;
  attachment?: {
    name?: unknown;
    type?: unknown;
    size?: unknown;
  } | null;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asCategory(value: unknown) {
  return value === "feedback" || value === "bug" ? value : null;
}

function readAttachment(value: FeedbackBody["attachment"]) {
  if (!value) return null;

  const name = asText(value.name);
  const type = asText(value.type);
  const size = value.size;

  if (!name || !type || typeof size !== "number" || !Number.isSafeInteger(size)) {
    return { error: "Attachment details are invalid." } as const;
  }

  if (!type.startsWith("image/") && !type.startsWith("video/")) {
    return { error: "Attachments must be an image or video." } as const;
  }

  if (size < 1 || size > maxAttachmentSizeBytes) {
    return { error: "Attachments must be 25 MB or smaller." } as const;
  }

  return { name, type, size } as const;
}

export async function POST(request: Request) {
  const session = await getAuthSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Feedback is unavailable until the database is configured." },
      { status: 503 },
    );
  }

  const parsedBody: unknown = await request.json().catch(() => ({}));
  const body: FeedbackBody =
    parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
      ? (parsedBody as FeedbackBody)
      : {};
  const title = asText(body.title);
  const description = asText(body.description);
  const pagePath = asText(body.pagePath) || "/feedback";
  const category = asCategory(body.category);
  const attachment = readAttachment(body.attachment);

  if (!title || title.length > 160) {
    return NextResponse.json(
      { error: "Enter a feedback title of up to 160 characters." },
      { status: 400 },
    );
  }

  if (!description || description.length > 5000) {
    return NextResponse.json(
      { error: "Enter a description of up to 5,000 characters." },
      { status: 400 },
    );
  }

  if (!category) {
    return NextResponse.json(
      { error: "Choose whether this is feedback or a bug." },
      { status: 400 },
    );
  }

  if (!pagePath.startsWith("/") || pagePath.length > 300) {
    return NextResponse.json(
      { error: "The feedback page context is invalid." },
      { status: 400 },
    );
  }

  if (attachment && "error" in attachment) {
    return NextResponse.json({ error: attachment.error }, { status: 400 });
  }

  try {
    const submission = await prisma.feedbackSubmission.create({
      data: {
        userId: session.id,
        userName: session.name,
        userEmail: session.email,
        title,
        description,
        pagePath,
        category,
        attachmentName: attachment?.name,
        attachmentMimeType: attachment?.type,
        attachmentSizeBytes: attachment?.size,
        // The binary is intentionally not accepted until S3 upload is wired in.
        attachmentStatus: attachment ? "metadata_only" : null,
      },
      select: { id: true, ticketNumber: true },
    });
    const ticketUrl = new URL("/control-panel/feedback", request.url);
    const ticketReference = `${category === "bug" ? "BUG" : "FB"}-${submission.ticketNumber.toString().padStart(5, "0")}`;
    ticketUrl.searchParams.set("ticket", ticketReference);

    // A notification failure must never make a successfully stored report look failed.
    await notifyWeComOfNewFeedback({
      ticketNumber: submission.ticketNumber,
      category,
      title,
      description,
      userName: session.name,
      userEmail: session.email,
      pagePath,
      attachmentName: attachment?.name,
      ticketUrl: ticketUrl.toString(),
    });

    return NextResponse.json({ ok: true, id: submission.id }, { status: 201 });
  } catch (error) {
    console.error("Feedback submission failed", error);
    return NextResponse.json(
      { error: "We could not save your feedback. Please try again." },
      { status: 500 },
    );
  }
}
