"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/field";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  FileQuestionIcon,
  ImageIcon,
  MessageSquareIcon,
  SearchIcon,
  VideoIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

type TicketCategory = "feedback" | "bug";
type TicketStatus = "open" | "in_progress" | "resolved" | "cancelled";
type TicketCommentKind = "comment" | "status_change";
type CategoryFilter = "all" | TicketCategory;
type StatusFilter = "all" | TicketStatus;
type TicketSortField = "ticketNumber" | "createdAt";
type SortDirection = "ascending" | "descending";

type TicketComment = {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  kind: TicketCommentKind;
  previousStatus?: TicketStatus | null;
  newStatus?: TicketStatus | null;
  createdAt: string;
};

type FeedbackTicket = {
  id: string;
  ticketNumber: number;
  userName: string;
  userEmail: string;
  title: string;
  description: string;
  pagePath: string;
  category: TicketCategory;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSizeBytes?: number | null;
  attachmentStatus?: string | null;
  status: TicketStatus;
  createdAt: string;
  comments: TicketComment[];
};

function ticketReference(ticket: FeedbackTicket) {
  return `${ticket.category === "bug" ? "BUG" : "FB"}-${ticket.ticketNumber.toString().padStart(5, "0")}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCreatedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "Unknown size";
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: TicketStatus) {
  return status === "in_progress"
    ? "In Progress"
    : status === "resolved"
      ? "Resolved"
      : status === "cancelled"
        ? "Cancelled"
      : "Open";
}

function statusVariant(status: TicketStatus) {
  return status === "resolved"
    ? ("success" as const)
    : status === "in_progress"
      ? ("warning" as const)
      : status === "cancelled"
        ? ("neutral" as const)
      : ("info" as const);
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "A"
  );
}

function ActivityAvatar({
  name,
  reporter = false,
}: {
  name: string;
  reporter?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-card text-xs font-bold",
        reporter
          ? "bg-secondary text-secondary-foreground"
          : "bg-primary text-primary-foreground",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function FeedbackTicketsPanel() {
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<TicketSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("descending");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const ticketDetailRef = useRef<HTMLDivElement>(null);

  async function loadTickets() {
    setErrorMessage(null);
    const response = await fetch("/api/admin/feedback", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      tickets?: FeedbackTicket[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(payload.error ?? "Unable to load feedback tickets.");
    setTickets(Array.isArray(payload.tickets) ? payload.tickets : []);
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadTickets();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load feedback tickets.",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const selectTicketFromUrl = () => {
      setSelectedTicketId(new URLSearchParams(window.location.search).get("ticket"));
    };

    selectTicketFromUrl();
    window.addEventListener("popstate", selectTicketFromUrl);
    return () => window.removeEventListener("popstate", selectTicketFromUrl);
  }, []);

  function selectTicket(ticket: FeedbackTicket) {
    setSelectedTicketId(ticket.id);
    setCommentDraft("");

    const url = new URL(window.location.href);
    url.searchParams.set("ticket", ticketReference(ticket));
    window.history.replaceState(window.history.state, "", url);
  }

  function toggleSort(field: TicketSortField) {
    if (sortField === field) {
      setSortDirection((direction) =>
        direction === "ascending" ? "descending" : "ascending",
      );
      return;
    }

    setSortField(field);
    setSortDirection("descending");
  }

  const counts = useMemo(
    () => ({
      all: tickets.length,
      feedback: tickets.filter((ticket) => ticket.category === "feedback")
        .length,
      bug: tickets.filter((ticket) => ticket.category === "bug").length,
    }),
    [tickets],
  );

  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matchingTickets = tickets.filter((ticket) => {
      if (categoryFilter !== "all" && ticket.category !== categoryFilter)
        return false;
      if (statusFilter !== "all" && ticket.status !== statusFilter)
        return false;
      return (
        !query ||
        [
          ticketReference(ticket),
          ticket.title,
          ticket.userName,
          ticket.userEmail,
          ticket.pagePath,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    });

    return matchingTickets.sort((first, second) => {
      const difference =
        sortField === "ticketNumber"
          ? first.ticketNumber - second.ticketNumber
          : new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
      return sortDirection === "ascending" ? difference : -difference;
    });
  }, [categoryFilter, searchQuery, sortDirection, sortField, statusFilter, tickets]);

  const selectedTicket =
    filteredTickets.find(
      (ticket) =>
        ticket.id === selectedTicketId ||
        ticketReference(ticket).toLowerCase() === selectedTicketId?.toLowerCase(),
    ) ??
    filteredTickets[0] ??
    null;

  useEffect(() => {
    if (!selectedTicketId || isLoading || !ticketDetailRef.current) return;
    if (!window.matchMedia("(max-width: 1535px)").matches) return;

    ticketDetailRef.current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }, [isLoading, selectedTicketId]);

  async function updateStatus(status: TicketStatus) {
    if (!selectedTicket || status === selectedTicket.status) return;
    setIsSavingStatus(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedTicket.id, status }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ticket?: { id: string; status: TicketStatus };
        comment?: TicketComment | null;
        error?: string;
      };
      if (!response.ok || !payload.ticket)
        throw new Error(payload.error ?? "Unable to update ticket status.");
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id !== selectedTicket.id
            ? ticket
            : {
                ...ticket,
                status: payload.ticket?.status ?? ticket.status,
                comments: payload.comment
                  ? [...ticket.comments, payload.comment]
                  : ticket.comments,
              },
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update ticket status.",
      );
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function postComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket || !commentDraft.trim()) return;
    setIsPostingComment(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedTicket.id, body: commentDraft }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        comment?: TicketComment;
        error?: string;
      };
      if (!response.ok || !payload.comment)
        throw new Error(payload.error ?? "Unable to post the ticket update.");
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === selectedTicket.id
            ? { ...ticket, comments: [...ticket.comments, payload.comment!] }
            : ticket,
        ),
      );
      setCommentDraft("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to post the ticket update.",
      );
    } finally {
      setIsPostingComment(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedbacks & Issues"
        description="Review reports, record progress, and keep a clear ticket history for the team."
      />

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-subtle p-4 text-sm text-danger-subtle-foreground"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="flex flex-wrap gap-2"
          aria-label="Ticket category filters"
        >
          {(
            [
              ["all", "All", counts.all],
              ["feedback", "Feedbacks", counts.feedback],
              ["bug", "Bugs", counts.bug],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={categoryFilter === value}
              onClick={() => setCategoryFilter(value)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                categoryFilter === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-muted",
              )}
            >
              {label}{" "}
              <span className="ml-1 tabular-nums opacity-75">{count}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] lg:w-[26rem]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search feedback tickets"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search tickets"
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Filter feedback tickets by status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(18rem,0.65fr)_minmax(0,1.35fr)]">
        <Card
          elevation="flat"
          className="overflow-hidden 2xl:max-h-[calc(100dvh-13rem)] 2xl:overflow-y-auto"
        >
          {isLoading ? (
            <div className="space-y-4 p-5 sm:p-6">
              <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              icon={<FileQuestionIcon className="h-6 w-6" />}
              title="No tickets match this view"
              description="New feedback and bug reports will appear here as users submit them."
              className="m-5 border-0 bg-surface-sunken sm:m-6"
            />
          ) : (
            <ul
              className="divide-y divide-border"
              aria-label="Feedback ticket list"
            >
              <li className="hidden items-center gap-3 border-b border-border bg-surface-sunken/55 px-5 py-2.5 sm:flex sm:px-6">
                <span aria-hidden className="h-9 w-9 shrink-0" />
                {(
                  [
                    ["ticketNumber", "Ticket", "flex-1 text-left"],
                    ["createdAt", "Created", "w-28 justify-end text-right"],
                  ] as const
                ).map(([field, label, width]) => {
                  const isActive = sortField === field;
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => toggleSort(field)}
                      aria-label={`Sort by ${label.toLowerCase()}, currently ${isActive ? sortDirection : "not selected"}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        width,
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span>{label}</span>
                      <ChevronRightIcon
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          isActive
                            ? sortDirection === "ascending"
                              ? "-rotate-90"
                              : "rotate-90"
                            : "rotate-90 opacity-40",
                        )}
                      />
                    </button>
                  );
                })}
                <span className="w-20 shrink-0 text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </span>
              </li>
              {filteredTickets.map((ticket) => {
                const isSelected = ticket.id === selectedTicket?.id;
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => selectTicket(ticket)}
                      className={cn(
                        "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6",
                        isSelected
                          ? "bg-primary-subtle/70"
                          : "hover:bg-secondary/65",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          ticket.category === "bug"
                            ? "bg-danger-subtle text-danger-subtle-foreground"
                            : "bg-info-subtle text-info-subtle-foreground",
                        )}
                      >
                        {ticket.category === "bug" ? (
                          <AlertCircleIcon className="h-4 w-4" />
                        ) : (
                          <MessageSquareIcon className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {ticketReference(ticket)}
                          </span>
                          <Badge
                            size="sm"
                            variant={
                              ticket.category === "bug" ? "danger" : "info"
                            }
                          >
                            {ticket.category === "bug" ? "Bug" : "Feedback"}
                          </Badge>
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold text-foreground">
                          {ticket.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {ticket.userName} - {ticket.comments.length} update
                          {ticket.comments.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="hidden w-28 shrink-0 text-right sm:block">
                        <span className="block text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                          Created
                        </span>
                        <time
                          dateTime={ticket.createdAt}
                          className="mt-1 block text-xs font-medium tabular-nums text-foreground"
                        >
                          {formatCreatedDate(ticket.createdAt)}
                        </time>
                      </span>
                      <span className="w-20 shrink-0 text-right">
                        <Badge
                          size="sm"
                          variant={statusVariant(ticket.status)}
                          dot
                        >
                          {statusLabel(ticket.status)}
                        </Badge>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div ref={ticketDetailRef} className="scroll-mt-6 2xl:scroll-mt-24">
        <Card className="overflow-hidden 2xl:sticky 2xl:top-24">
          {selectedTicket ? (
            <>
              <div className="border-b border-border px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          selectedTicket.category === "bug" ? "danger" : "info"
                        }
                      >
                        {selectedTicket.category === "bug" ? "Bug" : "Feedback"}
                      </Badge>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {ticketReference(selectedTicket)}
                      </span>
                    </div>
                    <h2 className="mt-3 max-w-3xl text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                      {selectedTicket.title}
                    </h2>
                  </div>
                  <div className="w-full sm:w-40">
                    <label htmlFor="ticket-status" className="sr-only">
                      Ticket status
                    </label>
                    <Select
                      id="ticket-status"
                      value={selectedTicket.status}
                      disabled={isSavingStatus}
                      onChange={(event) =>
                        void updateStatus(event.target.value as TicketStatus)
                      }
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="cancelled">Cancelled</option>
                    </Select>
                    {isSavingStatus && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Saving status...
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <CardContent className="space-y-7 pt-5 sm:pt-6">
                <section aria-labelledby="ticket-report-heading">
                  <h3
                    id="ticket-report-heading"
                    className="text-sm font-semibold text-foreground"
                  >
                    Reported issue
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {selectedTicket.description}
                  </p>
                </section>
                <section
                  className="grid gap-4 border-y border-border py-4 text-sm sm:grid-cols-3"
                  aria-label="Ticket context"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      Reported by
                    </p>
                    <p className="mt-1 truncate font-medium text-foreground">
                      {selectedTicket.userName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedTicket.userEmail}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      Reported from
                    </p>
                    <p className="mt-1 break-all text-foreground">
                      {selectedTicket.pagePath}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Submitted
                    </p>
                    <p className="mt-1 text-foreground">
                      {formatDate(selectedTicket.createdAt)}
                    </p>
                  </div>
                </section>
                {selectedTicket.attachmentName && (
                  <section
                    className="flex items-center gap-3 border-b border-border pb-5"
                    aria-label="Reported attachment"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-muted-foreground">
                      {selectedTicket.attachmentMimeType?.startsWith(
                        "image/",
                      ) ? (
                        <ImageIcon className="h-4 w-4" />
                      ) : (
                        <VideoIcon className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {selectedTicket.attachmentName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatFileSize(selectedTicket.attachmentSizeBytes)} -
                        file upload will be available with S3
                      </span>
                    </span>
                  </section>
                )}

                <section aria-labelledby="ticket-activity-heading">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3
                      id="ticket-activity-heading"
                      className="text-base font-semibold text-foreground"
                    >
                      Activity & updates
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {selectedTicket.comments.length} admin update
                      {selectedTicket.comments.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ol className="mt-5 space-y-5" aria-label="Ticket activity">
                    <li className="relative flex gap-3 before:absolute before:bottom-[-1.25rem] before:left-[1.1rem] before:top-9 before:w-px before:bg-border last:before:hidden">
                      <ActivityAvatar name={selectedTicket.userName} reporter />
                      <div className="min-w-0 flex-1 pb-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="text-sm font-semibold text-foreground">
                            {selectedTicket.userName}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            reported this ticket
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(selectedTicket.createdAt)}
                        </p>
                      </div>
                    </li>
                    {selectedTicket.comments.map((comment) => (
                      <li
                        key={comment.id}
                        className="relative flex gap-3 before:absolute before:bottom-[-1.25rem] before:left-[1.1rem] before:top-9 before:w-px before:bg-border last:before:hidden"
                      >
                        {comment.kind === "status_change" ? (
                          <span
                            aria-hidden
                            className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-card bg-success-subtle text-success-subtle-foreground"
                          >
                            <CheckIcon className="h-4 w-4" />
                          </span>
                        ) : (
                          <ActivityAvatar name={comment.authorName} />
                        )}
                        <div className="min-w-0 flex-1 pb-1">
                          {comment.kind === "status_change" ? (
                            <div className="rounded-xl bg-surface-sunken px-3 py-2.5 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {comment.authorName}
                              </span>{" "}
                              changed status from{" "}
                              <span className="font-medium text-foreground">
                                {comment.previousStatus
                                  ? statusLabel(comment.previousStatus)
                                  : "Unknown"}
                              </span>{" "}
                              to{" "}
                              <span className="font-medium text-foreground">
                                {comment.newStatus
                                  ? statusLabel(comment.newStatus)
                                  : "Unknown"}
                              </span>
                              .
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <p className="text-sm font-semibold text-foreground">
                                  {comment.authorName}
                                </p>
                                <Badge size="sm" variant="neutral">
                                  Root admin
                                </Badge>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                {comment.body}
                              </p>
                            </>
                          )}
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {formatDate(comment.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </CardContent>

              <form
                onSubmit={postComment}
                className="border-t border-border bg-surface-sunken/55 px-5 py-4 sm:px-6"
              >
                <label
                  htmlFor="ticket-comment"
                  className="text-sm font-semibold text-foreground"
                >
                  Post an internal update
                </label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Record progress, investigation notes, or a resolution for the
                  admin team.
                </p>
                <Textarea
                  id="ticket-comment"
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  maxLength={5000}
                  placeholder="Share an update on this ticket..."
                  className="mt-3 min-h-24 bg-surface"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {commentDraft.length}/5,000
                  </span>
                  <Button
                    type="submit"
                    size="sm"
                    loading={isPostingComment}
                    loadingText="Posting..."
                    disabled={!commentDraft.trim()}
                    leadingIcon={<MessageSquareIcon className="h-4 w-4" />}
                  >
                    Post update
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <EmptyState
              icon={<FileQuestionIcon className="h-6 w-6" />}
              title="Select a ticket"
              description="Choose a feedback item or bug report to review its details and activity."
              className="border-0"
            />
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}
