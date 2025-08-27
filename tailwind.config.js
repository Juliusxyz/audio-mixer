/**** Tailwind config ****/
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          500: '#6EE7B7',
          600: '#34D399',
          700: '#10B981'
        }
      }
    },
  },
  plugins: [],
}
