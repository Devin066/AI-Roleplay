import type { NavItem } from "@/lib/types";

export const navigationItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: "dashboard" },
  { title: "Simulation Courses", href: "/courses", icon: "simulation" },
  {
    title: "Course Builder",
    href: "/course-builder",
    icon: "builder",
    allowedRoles: ["root_admin", "course_admin"],
    children: [
      {
        title: "Managed Courses",
        href: "/course-builder",
        allowedRoles: ["root_admin", "course_admin"],
      },
      {
        title: "Role Play Builder",
        href: "/course-builder/new",
        allowedRoles: ["root_admin", "course_admin"],
      },
    ],
  },
  {
    title: "Assessment Results",
    href: "/assessment",
    icon: "assessment",
    children: [
      {
        title: "My Results",
        href: "/assessment",
      },
      {
        title: "My Learners' Results",
        href: "/assessment/learners",
        allowedRoles: ["root_admin", "course_admin"],
      },
    ],
  },
  {
    title: "Control Panel",
    href: "/control-panel",
    icon: "control",
    allowedRoles: ["root_admin"],
    children: [
      {
        title: "User Management",
        href: "/control-panel/users",
        allowedRoles: ["root_admin"],
      },
      {
        title: "Course List",
        href: "/control-panel/courses",
        allowedRoles: ["root_admin"],
      },
      {
        title: "Activity Log",
        href: "/control-panel/activity",
        allowedRoles: ["root_admin"],
      },
      {
        title: "Feedbacks & Issues",
        href: "/control-panel/feedback",
        allowedRoles: ["root_admin"],
      },
    ],
  },
  { title: "Profile", href: "/profile", icon: "profile" },
];
