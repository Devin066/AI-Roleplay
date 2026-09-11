"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Header } from "@/components/layout/header";
import { FeedbackDrawer } from "@/components/feedback/feedback-drawer";
import { Sidebar } from "@/components/layout/sidebar";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { AuthSessionUser } from "@/src/lib/auth/session";

const SIDEBAR_STORAGE_KEY = "airp-sidebar-collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Collapsed state persists so the layout doesn't reset on every navigation.
  useEffect(() => {
    try {
      setIsSidebarCollapsed(
        window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true",
      );
    } catch {
      /* storage unavailable — fall back to expanded */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });

        if (!response.ok) {
          router.replace("/login");
          return;
        }

        const payload = (await response.json()) as { user?: AuthSessionUser };
        setUser(payload.user ?? null);
      } finally {
        setIsLoadingSession(false);
      }
    })();
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  if (isLoadingSession || !user) {
    return (
      <div className="min-h-dvh bg-background px-4 py-6 sm:px-6 lg:px-8">
        <span className="sr-only" role="status" aria-live="polite">
          Loading your workspace
        </span>
        {/* Skeleton in the shape of the real page so nothing jumps on load. */}
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <SkeletonCard className="h-24" />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh bg-background lg:flex"
      style={
        {
          // Fixed elements inside the content column offset by this so they
          // do not paint across the sidebar rail.
          "--app-sidebar-width": isSidebarCollapsed ? "5.5rem" : "17rem",
        } as CSSProperties
      }
    >
      <Sidebar
        collapsed={isSidebarCollapsed}
        role={user.role}
        mobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        onOpenFeedback={() => setIsFeedbackOpen(true)}
      />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <Header
          user={user}
          onLogout={() => void logout()}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          onOpenFeedback={() => setIsFeedbackOpen(true)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8"
        >
          {/* Caps line length on ultrawide displays instead of stretching edge to edge. */}
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
      <FeedbackDrawer
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </div>
  );
}
