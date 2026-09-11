import type { SVGProps } from "react";

export function AgoraMarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M8.715 13.81a4.81 4.81 0 1 1 0-9.62 4.81 4.81 0 0 1 0 9.62Zm5.602-11.818-.074.098-.073.097-.097-.073-.093-.073a8.722 8.722 0 1 0-5.265 15.68 8.63 8.63 0 0 0 5.265-1.772l.093-.068.097-.078.073.102.074.098a4.16 4.16 0 0 0 2.798 1.68l.322.044V.273l-.322.044a4.165 4.165 0 0 0-2.798 1.675Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M3 13h8V3H3z" />
      <path d="M13 21h8v-6h-8z" />
      <path d="M13 11h8V3h-8z" />
      <path d="M3 21h8v-4H3z" />
    </BaseIcon>
  );
}

export function CoursesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v15.5a.5.5 0 0 1-.8.4L16 17.5l-3.2 2.4a.5.5 0 0 1-.6 0L9 17.5l-3.2 2.4a.5.5 0 0 1-.8-.4z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
    </BaseIcon>
  );
}

export function SimulationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m10 9 5 3-5 3z" />
    </BaseIcon>
  );
}

export function AiRolePlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="6" width="16" height="12" rx="4" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M9.5 14h5" />
      <path d="M12 3v3" />
      <path d="M7 18v2" />
      <path d="M17 18v2" />
      <path d="M20 10h1.5v4H20" />
      <path d="M4 10H2.5v4H4" />
      <path d="m18.5 3 .6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
    </BaseIcon>
  );
}

export function AssessmentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M7 3h10l4 4v14H7z" />
      <path d="M17 3v5h5" />
      <path d="M10 13h8" />
      <path d="M10 17h6" />
    </BaseIcon>
  );
}

export function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </BaseIcon>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </BaseIcon>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </BaseIcon>
  );
}

export function SparklesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      <path d="m5 3 .7 1.8 1.8.7-1.8.7L5 8l-.7-1.8-1.8-.7 1.8-.7z" />
    </BaseIcon>
  );
}

export function CogIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.6.75 1 1.4 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </BaseIcon>
  );
}

export function KeyRoundIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9" />
      <path d="m17 6 2 2" />
      <path d="m14 9 2 2" />
    </BaseIcon>
  );
}

export function MessageSquareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M21 11.5a8.4 8.4 0 0 1-8.8 8.4 9.6 9.6 0 0 1-4.1-.9L3 21l1.6-4.4A8.4 8.4 0 0 1 3 11.5 8.4 8.4 0 0 1 11.8 3 8.4 8.4 0 0 1 21 11.5Z" />
      <path d="M8 11h.01" />
      <path d="M12 11h.01" />
      <path d="M16 11h.01" />
    </BaseIcon>
  );
}

export function PaperclipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="m21.4 11.6-8.8 8.8a6 6 0 1 1-8.5-8.5l8.8-8.8a4 4 0 0 1 5.7 5.7l-8.8 8.8a2 2 0 1 1-2.8-2.8l8.1-8.1" />
    </BaseIcon>
  );
}

export function ImageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </BaseIcon>
  );
}

export function VideoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </BaseIcon>
  );
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </BaseIcon>
  );
}

export function LogOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </BaseIcon>
  );
}

export function PanelLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m14 10 3 2-3 2" />
    </BaseIcon>
  );
}

export function LabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M9 3v4l-4.5 8.2A3 3 0 0 0 7.1 20h9.8a3 3 0 0 0 2.6-4.8L15 7V3" />
      <path d="M8 3h8" />
      <path d="M9 12h6" />
      <path d="M8 16h8" />
    </BaseIcon>
  );
}

export function BuilderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18a2 2 0 0 1 2 2v14.5a.5.5 0 0 1-.8.4L16 17.5l-3.2 2.4a.5.5 0 0 1-.6 0L9 17.5l-3.2 2.4a.5.5 0 0 1-.8-.4z" />
      <path d="M8 8h6" />
      <path d="M8 12h8" />
      <path d="M16.5 6.5 18 8l-4.5 4.5H12v-1.5z" />
    </BaseIcon>
  );
}

export function ControlPanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
      <circle cx="8" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="10" cy="18" r="2" />
    </BaseIcon>
  );
}

export function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </BaseIcon>
  );
}

export function FileQuestionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M10 13a2 2 0 1 1 3.4 1.4c-.9.7-1.4 1.1-1.4 2.1" />
      <path d="M12 19h.01" />
    </BaseIcon>
  );
}

export function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </BaseIcon>
  );
}

export function BarChart3Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </BaseIcon>
  );
}

export function EditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
    </BaseIcon>
  );
}

export function Trash2Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </BaseIcon>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </BaseIcon>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </BaseIcon>
  );
}

export function MonitorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </BaseIcon>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="m9 6 6 6-6 6" />
    </BaseIcon>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="m4 12 5 5L20 6" />
    </BaseIcon>
  );
}

export function AlertCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" />
    </BaseIcon>
  );
}

export function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </BaseIcon>
  );
}

export function SpinnerIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={["animate-spin", className].filter(Boolean).join(" ")}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </BaseIcon>
  );
}
