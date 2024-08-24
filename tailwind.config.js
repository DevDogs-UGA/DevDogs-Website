/** @type {import('tailwindcss').Config} */


const plugin = require('tailwindcss/plugin')
const CustomStyle = plugin(function ({ addUtilities })
{
  addUtilities({
    ".rotate-y-180": {
      transform: "rotateY(180deg)"
    },
    ".preserve-3d": {
      transformStyle: "preserve-3d"
    },
    ".perspective-1000": {
      perspective: "1000px"
    },
    ".backface-hidden": {
      backfaceVisibility: "hidden",
    }
  })
})

module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",

    // Or if using `src` directory:
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        UGA: "#BA0C2F",
        UGASecondary: "#CD0029",
        NavBarColor: "#31304b"
      }
    },
  },
  plugins: [CustomStyle],
}
