import { NextResponse } from "next/server";

import { getAuthSession } from "@/src/lib/auth/session";
import { isDatabaseConfigured, prisma } from "@/src/lib/db/prisma";

const ticketStatuses = ["open", "in_progress", "resolved", "cancelled"] as const;
const maxCommentLength = 5000;

type TicketStatus = (typeof ticketStatuses)[number];

function isRootAdmin(role: string) {
  return role === "root_admin";
}

function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === "string" && ticketStatuses.includes(value as TicketStatus)
  );
}

function asId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function requireRootAdmin() {
  const session = await getAuthSession();
  return session && isRootAdmin(session.role) ? session : null;
}

export async function GET() {
  const session = await requireRootAdmin();
  if (!session) {
    return NextResponse.json(
      { error: "Root admin access required." },
      { status: 403 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Feedback is unavailable until the database is configured." },
      { status: 503 },
    );
  }

  const tickets = await prisma.feedbackSubmission.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ticketNumber: true,
      userName: true,
      userEmail: true,
      title: true,
      description: true,
      pagePath: true,
      category: true,
      attachmentName: true,
      attachmentMimeType: true,
      attachmentSizeBytes: true,
      attachmentStatus: true,
      status: true,
      createdAt: true,
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          authorId: true,
          authorName: true,
          authorEmail: true,
          body: true,
          kind: true,
          previousStatus: true,
          newStatus: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    tickets: tickets.map((ticket) => ({
      ...ticket,
      createdAt: ticket.createdAt.toISOString(),
      comments: ticket.comments.map((comment) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      })),
    })),
  });
}

export async function PATCH(request: Request) {
  const session = await requireRootAdmin();
  if (!session) {
    return NextResponse.json(
      { error: "Root admin access required." },
      { status: 403 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Feedback is unavailable until the database is configured." },
      { status: 503 },
    );
  }

  const parsedBody: unknown = await request.json().catch(() => ({}));
  const body =
    parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
      ? (parsedBody as { id?: unknown; status?: unknown })
      : {};
  const id = asId(body.id);

  if (!id || !isTicketStatus(body.status)) {
    return NextResponse.json(
      { error: "A ticket and valid status are required." },
      { status: 400 },
    );
  }
  const nextStatus = body.status;

  try {
    const currentTicket = await prisma.feedbackSubmission.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!currentTicket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const updatedTicket = await transaction.feedbackSubmission.update({
        where: { id },
        data: { status: nextStatus },
        select: { id: true, status: true },
      });

      const comment =
        currentTicket.status !== nextStatus
          ? await transaction.feedbackComment.create({
              data: {
                feedbackSubmissionId: id,
                authorId: session.id,
                authorName: session.name,
                authorEmail: session.email,
                body: "Status updated.",
                kind: "status_change",
                previousStatus: currentTicket.status,
                newStatus: nextStatus,
              },
              select: {
                id: true,
                authorId: true,
                authorName: true,
                authorEmail: true,
                body: true,
                kind: true,
                previousStatus: true,
                newStatus: true,
                createdAt: true,
              },
            })
          : null;

      return { ticket: updatedTicket, comment };
    });
    return NextResponse.json({
      ticket: result.ticket,
      comment: result.comment && {
        ...result.comment,
        createdAt: result.comment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Ticket status update failed", error);
    return NextResponse.json(
      { error: "We could not update this ticket. Please try again." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireRootAdmin();
  if (!session) {
    return NextResponse.json(
      { error: "Root admin access required." },
      { status: 403 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Feedback is unavailable until the database is configured." },
      { status: 503 },
    );
  }

  const parsedBody: unknown = await request.json().catch(() => ({}));
  const body =
    parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
      ? (parsedBody as { id?: unknown; body?: unknown })
      : {};
  const id = asId(body.id);
  const commentBody = asText(body.body);

  if (!id || !commentBody || commentBody.length > maxCommentLength) {
    return NextResponse.json(
      { error: "Enter an update of up to 5,000 characters." },
      { status: 400 },
    );
  }

  try {
    const ticket = await prisma.feedbackSubmission.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const comment = await prisma.feedbackComment.create({
      data: {
        feedbackSubmissionId: id,
        authorId: session.id,
        authorName: session.name,
        authorEmail: session.email,
        body: commentBody,
      },
      select: {
        id: true,
        authorId: true,
        authorName: true,
        authorEmail: true,
        body: true,
        kind: true,
        previousStatus: true,
        newStatus: true,
        createdAt: true,
      },
    });
    return NextResponse.json(
      { comment: { ...comment, createdAt: comment.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Ticket comment creation failed", error);
    return NextResponse.json(
      { error: "We could not post this update. Please try again." },
      { status: 500 },
    );
  }
}
