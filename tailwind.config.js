/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: 'var(--color-cream, #fcfaf6)',
        beige: 'var(--color-beige, #f1ede4)',
        tan: {
          light: 'var(--color-tan-light, #e1d7c6)',
          DEFAULT: 'var(--color-tan, #8b7355)',
          dark: 'var(--color-tan-dark, #68543f)'
        },
        charcoal: {
          DEFAULT: 'var(--color-charcoal, #3a2d1d)',
          light: 'var(--color-charcoal-light, #746048)'
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
