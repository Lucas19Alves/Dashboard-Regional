/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#1B2430',
        steel: '#5B6573',
        line: { DEFAULT: '#D9DDE2', strong: '#C3C9D0' },
        floor: '#ECEEF1',
        tag: { DEFAULT: '#FFD60A', soft: '#FFF4B8', deep: '#E0B800' },
        good: '#18864B',
        warn: '#B86E00',
        bad: '#C8233A',
      },
    },
  },
  plugins: [],
}
