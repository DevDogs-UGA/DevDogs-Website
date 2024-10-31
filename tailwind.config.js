/** @type {import('tailwindcss').Config} */

const plugin = require("tailwindcss/plugin");

const CustomStyle = plugin(function ({ addUtilities }) {
  addUtilities({
    ".rotate-y-180": {
      transform: "rotateY(180deg)",
    },
    ".preserve-3d": {
      transformStyle: "preserve-3d",
    },
    ".perspective-1000": {
      perspective: "1000px",
    },
    ".backface-hidden": {
      backfaceVisibility: "hidden",
    },
  });
});

module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}", // For src directory support
  ],
  theme: {
    extend: {
      keyframes: {
        fadeInOut: {
          "0%, 100%": { opacity: 0 },
          "20%, 50%, 80%": { opacity: 1 },
          
        },
        "caret-blink": {
          "0%, 70%, 100%": { opacity: "1" },
          "20%, 50%": { opacity: "0" },
        },
      },
      animation: {
        fadeInOut: "fadeInOut 10s ease-out infinite",
      },
      colors: {
        BulldogRed: "#ba0c2f",
        DevDogBlue: "#33334d",
        BarelyPink: "#fff7f9",
        NearlyBlack: "#23221f",
        MidnightBlue: "#222233",
        GloryGloryRed: "#e4002b",
        PureWhite: "#ffffff",
        SolidBlack: "#000000",
        MudGray: "#64575a",
        GroutGray: "#8a7d7d",
        PebbleGray: "#aa999d",
        Limestone: "#d4ccc8",
        DustyPink: "#f2d9df",
        BabyBlue: "#d9ecec",
        LakeHerrick: "#00a3ad",
        Gold: "#f9bd9b",
        Peach: "#e37c7c",
        Wave: "#71ccd2",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [CustomStyle, require("tailwindcss-animate")],
};