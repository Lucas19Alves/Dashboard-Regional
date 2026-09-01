/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        adwaita: '0 10px 30px rgba(26, 28, 30, 0.12)',
      },
      colors: {
        adwaita: {
          bg: '#f6f5f4',
          panel: '#ffffff',
          border: '#d0d0d0',
          text: '#1d1d1d',
          muted: '#5e5c64',
          blue: '#3584e4',
          green: '#2ec27e',
          orange: '#ff7800',
          red: '#e01b24',
        },
      },
    },
  },
  plugins: [],
}
