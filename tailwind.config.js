/**
 * A theme colour backed by a CSS variable, which AppearanceContext overrides per
 * museum with a hex value at runtime.
 *
 * Tailwind 3 can't apply an opacity modifier (`bg-charcoal/20`) to a plain
 * `var(...)` string, and silently leaves those classes out of the build. As a
 * function, the colour receives the requested opacity and mixes the variable with
 * transparent, which works whatever format the variable holds.
 *
 * Bare classes (`bg-charcoal`) get `var(--tw-bg-opacity)` here; they keep the plain
 * variable, so they render exactly as before and don't depend on color-mix()
 * (Chrome 111, Safari 16.2, Firefox 113). A browser without it drops only the
 * `/NN` declarations, which is what every browser did before this change.
 */
const themeColor = (variable, fallback) => ({ opacityValue }) => {
  const color = `var(${variable}, ${fallback})`;
  if (opacityValue === undefined || String(opacityValue).startsWith('var(')) return color;
  // Fully transparent needs no mixing. Tailwind asks for this as the far end of a
  // bare `from-cream` gradient, which must keep working without color-mix() too;
  // this is the value it used there before.
  if (Number(opacityValue) === 0) return 'rgb(255 255 255 / 0)';
  return `color-mix(in srgb, ${color} calc(${opacityValue} * 100%), transparent)`;
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: themeColor('--color-cream', '#fcfaf6'),
        beige: themeColor('--color-beige', '#f1ede4'),
        tan: {
          light: themeColor('--color-tan-light', '#e1d7c6'),
          DEFAULT: themeColor('--color-tan', '#846d4d'),
          dark: themeColor('--color-tan-dark', '#68543f')
        },
        charcoal: {
          DEFAULT: themeColor('--color-charcoal', '#3a2d1d'),
          light: themeColor('--color-charcoal-light', '#746048')
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
