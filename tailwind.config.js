/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#22C55E",
          hover: "#16A34A",
          light: "#4ADE80",
        },
        secondary: {
          DEFAULT: "#0EA5E9",
          hover: "#0284C7",
        },
        surface: {
          light: "rgba(255,255,255,0.7)",
          dark: "rgba(30,41,59,0.7)",
        },
        bg: {
          light: "#f0f4ff",
          "light-end": "#e8f5e9",
          dark: "#0F172A",
        },
        fg: {
          DEFAULT: "#1E293B",
          muted: "#64748B",
          dark: "#F8FAFC",
          "dark-muted": "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["Fira Code", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.08)",
        "glass-hover": "0 12px 40px rgba(0,0,0,0.12)",
        btn: "0 2px 8px rgba(34,197,94,0.3)",
        "btn-hover": "0 4px 12px rgba(34,197,94,0.4)",
      },
      backdropBlur: {
        glass: "16px",
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "slide-in-right": "slideInRight 250ms ease-out",
        "slide-out-right": "slideOutRight 200ms ease-in",
        "scale-in": "scaleIn 150ms ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideInRight: {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        slideOutRight: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
