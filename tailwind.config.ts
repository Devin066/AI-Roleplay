import type { Config } from "tailwindcss";

/** Maps a semantic CSS variable to a Tailwind colour that supports opacity. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        surface: {
          DEFAULT: token("surface"),
          raised: token("surface-raised"),
          sunken: token("surface-sunken"),
        },
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },
        "card-foreground": token("card-foreground"),
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
        },
        border: {
          DEFAULT: token("border"),
          strong: token("border-strong"),
        },
        input: token("input"),
        ring: token("ring"),
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
          hover: token("primary-hover"),
          subtle: token("primary-subtle"),
          "subtle-foreground": token("primary-subtle-foreground"),
        },
        "primary-foreground": token("primary-foreground"),
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        "secondary-foreground": token("secondary-foreground"),
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        "muted-foreground": token("muted-foreground"),
        subtle: {
          foreground: token("subtle-foreground"),
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
        },
        "accent-foreground": token("accent-foreground"),
        success: {
          DEFAULT: token("success"),
          foreground: token("success-foreground"),
          subtle: token("success-subtle"),
          "subtle-foreground": token("success-subtle-foreground"),
        },
        warning: {
          DEFAULT: token("warning"),
          foreground: token("warning-foreground"),
          subtle: token("warning-subtle"),
          "subtle-foreground": token("warning-subtle-foreground"),
        },
        danger: {
          DEFAULT: token("danger"),
          foreground: token("danger-foreground"),
          subtle: token("danger-subtle"),
          "subtle-foreground": token("danger-subtle-foreground"),
        },
        info: {
          DEFAULT: token("info"),
          foreground: token("info-foreground"),
          subtle: token("info-subtle"),
          "subtle-foreground": token("info-subtle-foreground"),
        },
        sidebar: {
          DEFAULT: token("sidebar"),
          foreground: token("sidebar-foreground"),
          "muted-foreground": token("sidebar-muted-foreground"),
          border: token("sidebar-border"),
          accent: token("sidebar-accent"),
        },
        panel: {
          DEFAULT: token("panel"),
          foreground: token("panel-foreground"),
          "muted-foreground": token("panel-muted-foreground"),
          border: token("panel-border"),
        },
        scrim: token("scrim"),
      },
      /* Type scale: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 with paired leading. */
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        xl: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.014em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.019em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.021em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.024em" }],
      },
      spacing: {
        /* Control heights — 44px is the minimum comfortable touch target. */
        "control-sm": "2.25rem",
        control: "2.75rem",
        "control-lg": "3rem",
      },
      borderRadius: {
        lg: "calc(var(--radius) - 2px)",
        xl: "var(--radius)",
        "2xl": "calc(var(--radius) + 0.25rem)",
        "3xl": "calc(var(--radius) + 0.75rem)",
      },
      /* One elevation ladder; components pick a rung, never an ad-hoc shadow. */
      boxShadow: {
        xs: "0 1px 2px 0 hsl(var(--scrim) / 0.06)",
        soft: "0 1px 2px 0 hsl(var(--scrim) / 0.06), 0 1px 3px 0 hsl(var(--scrim) / 0.08)",
        raised:
          "0 2px 4px -2px hsl(var(--scrim) / 0.08), 0 4px 12px -2px hsl(var(--scrim) / 0.10)",
        overlay:
          "0 8px 16px -6px hsl(var(--scrim) / 0.14), 0 16px 40px -12px hsl(var(--scrim) / 0.20)",
        none: "none",
      },
      transitionDuration: {
        fast: "150ms",
        DEFAULT: "200ms",
        slow: "300ms",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        "drawer-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "drawer-in": "drawer-in 260ms cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 1.6s infinite",
      },
      zIndex: {
        base: "0",
        raised: "10",
        sticky: "20",
        drawer: "40",
        overlay: "50",
        "overlay-top": "60",
        toast: "70",
      },
    },
  },
  plugins: [],
};

export default config;
