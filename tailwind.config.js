/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Cores ligadas a variáveis CSS para o modo escuro trocar tudo de uma vez.
        white: token('paper'),
        paper: token('paper'),
        ink: token('ink'),
        steel: token('steel'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        floor: token('floor'),
        tag: { DEFAULT: '#FFD60A', soft: token('tag-soft'), deep: '#E0B800', ink: '#1B2430' },
        good: token('good'),
        warn: token('warn'),
        bad: token('bad'),
      },
    },
  },
  plugins: [],
}
