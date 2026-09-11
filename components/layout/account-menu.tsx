"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  CogIcon,
  KeyRoundIcon,
  MessageSquareIcon,
} from "@/components/ui/icons";
import type { AuthSessionUser } from "@/src/lib/auth/session";

export function AccountMenu({
  user,
  onOpenFeedback,
}: {
  user: AuthSessionUser;
  onOpenFeedback: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial =
    user.name.trim().charAt(0).toUpperCase() ||
    user.email.charAt(0).toUpperCase();

  useEffect(() => {
    function closeWhenNeeded(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setIsOpen(false);
        return;
      }

      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeWhenNeeded);
    document.addEventListener("keydown", closeWhenNeeded);
    return () => {
      document.removeEventListener("mousedown", closeWhenNeeded);
      document.removeEventListener("keydown", closeWhenNeeded);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="account-settings-menu"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary-subtle-foreground"
        >
          {initial}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[12rem] truncate text-sm font-medium leading-4 text-foreground">
            {user.name}
          </span>
          <span className="block max-w-[12rem] truncate text-xs leading-4 text-muted-foreground">
            {user.email}
          </span>
        </span>
        <CogIcon
          aria-hidden
          className="hidden h-4 w-4 text-muted-foreground sm:block"
        />
        <span className="sr-only">Open account settings for {user.name}</span>
      </button>

      {isOpen && (
        <div
          id="account-settings-menu"
          aria-label="Account settings"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-dropdown w-72 overflow-hidden rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-overlay"
        >
          <div className="px-3 py-2.5">
            <p className="text-sm font-semibold text-foreground">Settings</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Manage your account or send product feedback.
            </p>
          </div>
          <div className="my-1 h-px bg-border" />
          <Link
            href="/profile/password"
            onClick={() => setIsOpen(false)}
            className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <KeyRoundIcon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-medium text-foreground">
                Change password
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Update the password you use to sign in.
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenFeedback();
            }}
            className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
              <MessageSquareIcon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-medium text-foreground">
                Send feedback
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Report an issue or share an idea with the team.
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
