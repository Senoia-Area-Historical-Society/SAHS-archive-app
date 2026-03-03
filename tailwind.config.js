/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: '#fcfaf6',
        beige: '#f1ede4',
        tan: {
          light: '#e1d7c6',
          DEFAULT: '#8b7355',
          dark: '#68543f'
        },
        charcoal: {
          DEFAULT: '#3a2d1d',
          light: '#746048'
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
