"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { navigationItems } from "@/lib/navigation";
import { canAccessNavItem } from "@/lib/authz";
import { cn } from "@/lib/utils";
import type { AppRole, NavItem } from "@/lib/types";
import {
  AiRolePlayIcon,
  AssessmentIcon,
  BuilderIcon,
  ChevronRightIcon,
  ControlPanelIcon,
  CoursesIcon,
  DashboardIcon,
  LabIcon,
  MessageSquareIcon,
  ProfileIcon,
  SimulationIcon,
} from "@/components/ui/icons";

function iconFor(item: NavItem["icon"], className = "h-5 w-5") {
  const iconProps = { className };

  switch (item) {
    case "dashboard":
      return <DashboardIcon {...iconProps} />;
    case "courses":
      return <CoursesIcon {...iconProps} />;
    case "simulation":
      return <SimulationIcon {...iconProps} />;
    case "assessment":
      return <AssessmentIcon {...iconProps} />;
    case "lab":
      return <LabIcon {...iconProps} />;
    case "builder":
      return <BuilderIcon {...iconProps} />;
    case "control":
      return <ControlPanelIcon {...iconProps} />;
    default:
      return <ProfileIcon {...iconProps} />;
  }
}

export function Sidebar({
  collapsed = false,
  role,
  mobileOpen = false,
  onCloseMobile,
  onOpenFeedback,
}: {
  collapsed?: boolean;
  role: AppRole;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenFeedback: () => void;
}) {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});
  const visibleNavigationItems = navigationItems.filter((item) =>
    canAccessNavItem(role, item),
  );

  // The drawer is a modal surface on mobile: Escape closes it and the page
  // behind it must not scroll while it is open.
  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile?.();
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, onCloseMobile]);

  // Navigating always dismisses the drawer.
  useEffect(() => {
    onCloseMobile?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Scrim: opaque enough to isolate the drawer from page content. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-drawer bg-scrim/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        aria-label="Main navigation"
        className={cn(
          "flex shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
          "border-r border-sidebar-border",
          // Mobile: off-canvas drawer. Desktop: sticky full-height rail.
          "fixed inset-y-0 left-0 z-drawer w-[17rem] max-w-[85vw] transition-transform duration-slow ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:sticky lg:top-0 lg:h-dvh lg:max-w-none lg:translate-x-0 lg:transition-[width,padding] lg:duration-slow",
          collapsed ? "lg:w-[5.5rem] lg:px-3" : "lg:w-[17rem] lg:px-4",
          "px-4 py-6",
        )}
      >
        <div
          className={cn("shrink-0", collapsed && "lg:flex lg:justify-center")}
        >
          <Link
            href="/"
            className={cn(
              "flex items-center gap-3 rounded-xl p-2 transition-colors duration-fast",
              "hover:bg-sidebar-accent focus-visible:ring-offset-sidebar",
              collapsed && "lg:justify-center lg:p-2",
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <AiRolePlayIcon className="h-5 w-5" />
            </span>
            <span className={cn("min-w-0", collapsed && "lg:hidden")}>
              <span className="block truncate text-sm font-semibold leading-5">
                AI RolePlay Academy
              </span>
              <span className="block truncate text-xs text-sidebar-muted-foreground">
                Training &amp; Assessment
              </span>
            </span>
          </Link>
        </div>

        <nav
          aria-label="Sections"
          className="surface-scrollbar mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1"
        >
          {visibleNavigationItems.map((item) => {
            const visibleChildren =
              item.children?.filter((child) => canAccessNavItem(role, child)) ??
              [];
            const hasActiveChild = visibleChildren.some((child) =>
              child.href === "/"
                ? pathname === child.href
                : pathname.startsWith(child.href),
            );
            const isActive =
              item.href === "/"
                ? pathname === item.href
                : pathname.startsWith(item.href) || hasActiveChild;
            const hasChildren = !collapsed && visibleChildren.length > 0;
            const isExpanded =
              hasChildren && (expandedSections[item.href] ?? isActive);

            return (
              <div key={item.href}>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSections((current) => ({
                        ...current,
                        [item.href]: !(current[item.href] ?? isActive),
                      }))
                    }
                    aria-expanded={isExpanded}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium",
                      "transition-colors duration-fast ease-out focus-visible:ring-offset-sidebar",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    )}
                  >
                    {iconFor(item.icon, "h-5 w-5 shrink-0")}
                    <span className="min-w-0 flex-1 truncate">
                      {item.title}
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-fast",
                        isExpanded && "rotate-90",
                      )}
                    />
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    // Announces the current page to screen readers, not just colour.
                    aria-current={isActive ? "page" : undefined}
                    title={collapsed ? item.title : undefined}
                    className={cn(
                      "flex min-h-11 items-center rounded-xl text-sm font-medium",
                      "transition-colors duration-fast ease-out focus-visible:ring-offset-sidebar",
                      collapsed ? "lg:justify-center lg:px-3" : "",
                      "gap-3 px-3",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    )}
                  >
                    {iconFor(item.icon, "h-5 w-5 shrink-0")}
                    <span className={cn("truncate", collapsed && "lg:hidden")}>
                      {item.title}
                    </span>
                  </Link>
                )}

                {hasChildren && isExpanded && (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                    {visibleChildren.map((child) => {
                      const isChildActive = pathname === child.href;

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          aria-current={isChildActive ? "page" : undefined}
                          className={cn(
                            "flex min-h-10 items-center rounded-lg px-3 text-sm",
                            "transition-colors duration-fast focus-visible:ring-offset-sidebar",
                            isChildActive
                              ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                              : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          )}
                        >
                          <span className="truncate">{child.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div
          className={cn(
            "mt-4 shrink-0 border-t border-sidebar-border pt-4",
            collapsed && "lg:border-t-0 lg:pt-0",
          )}
        >
          <button
            type="button"
            title={collapsed ? "Send feedback" : undefined}
            onClick={() => {
              // Keep the mobile drawer open under feedback so closing feedback
              // returns focus to a visible control rather than an off-screen one.
              onOpenFeedback();
            }}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium",
              "text-sidebar-muted-foreground transition-colors duration-fast ease-out",
              "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-offset-sidebar",
              collapsed && "lg:justify-center",
            )}
          >
            <MessageSquareIcon className="h-5 w-5 shrink-0" />
            <span className={cn("truncate", collapsed && "lg:hidden")}>
              Send feedback
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
