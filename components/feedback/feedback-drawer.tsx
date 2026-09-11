"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { usePathname } from "next/navigation";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { MessageSquareIcon, XIcon } from "@/components/ui/icons";

function pageLabel(pathname: string) {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/course-builder")) return "Course Builder";
  if (pathname.startsWith("/courses")) return "Courses";
  if (pathname.startsWith("/assessment")) return "Assessments";
  if (pathname.startsWith("/simulation")) return "Simulation";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/control-panel")) return "Control Panel";
  return "this page";
}

export function FeedbackDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [isOpen]);

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-overlay flex justify-end">
      <button
        type="button"
        aria-label="Close feedback panel"
        onClick={onClose}
        className="absolute inset-0 bg-scrim/35 motion-safe:animate-fade-in"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-drawer-title"
        onKeyDown={trapFocus}
        className="relative z-overlay-top flex h-full w-full max-w-[34rem] flex-col border-l border-border bg-surface shadow-overlay motion-safe:animate-drawer-in"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-subtle-foreground">
              <MessageSquareIcon className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="feedback-drawer-title"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                Send feedback
              </h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Report a problem or share an idea without leaving your work.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close feedback panel"
            onClick={onClose}
            className="flex h-control w-control shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto surface-scrollbar">
          <FeedbackForm
            reportedFrom={{ path: pathname, label: pageLabel(pathname) }}
          />
        </div>
      </aside>
    </div>
  );
}
