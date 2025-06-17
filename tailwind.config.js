/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'musica': {
          'cream': '#FFFBEF',
          'burgundy': '#491822',
          'gold': '#E2A225',
        }
      },
    },
  },
  plugins: [],
};