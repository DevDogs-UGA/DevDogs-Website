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
        /* Primaries */
        UGA: "#BA0C2F",
        UGASecondary: "#CD0029",
        NavBarColor: "#31304b",
        BulldogRed: "#ba0c2f",
        DevDogBlue: "#33334d",
        BarelyPink: "#fff7f9",
        NearlyBlack: "#23221f",
        MidnightBlue: "#222233",
        GloryGloryRed: "#e4002b",
        PureWhite: "#ffffff",
        SolidBlack: "#000000",
        /* Neutrals */
        MudGray: "#64575a",
        GroutGray: "#8a7d7d",
        PebbleGray: "#aa999d",
        Limestone: "#d4ccc8",
        DustyPink: "#f2d9df",
        BabyBlue: "#d9ecec",
        /* Complementaries */
        LakeHerrick: "#00a3ad",
        Gold: "#f9bd9b",
        Peach: "#e37c7c",
        Wave: "#71ccd2",
      }
    },
  },
  plugins: [CustomStyle],
}
