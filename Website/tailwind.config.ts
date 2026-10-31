import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        eamcet: {
          primary: "#1e40af", // Deep Royal Blue
          secondary: "#0284c7",
          accent: "#f59e0b",
          dark: "#0f172a",
          card: "#1e293b",
        },
        // CBT official palette colors
        cbt: {
          answered: "#22c55e", // Green
          notAnswered: "#ef4444", // Red
          notVisited: "#9ca3af", // Grey
          review: "#a855f7", // Purple
          reviewAnswered: "#7e22ce", // Purple with green dot indicator
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        telugu: ["Noto Sans Telugu", "sans-serif"],
      }
    },
  },
  plugins: [],
};
export default config;
