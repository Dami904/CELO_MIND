/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cy: 'var(--cy)',
        cg: 'var(--cg)',
        dark: 'var(--dark)',
        surface: 'var(--surface)',
        forest: 'var(--forest)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        error: 'var(--error)',
        border: 'var(--border)',
        border2: 'var(--border2)',
      },
      fontFamily: {
        syne: ['var(--font-syne)', 'Syne', 'sans-serif'],
        mono: ['var(--font-mono)', 'DM Mono', 'monospace'],
        sans: ['var(--font-sans)', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
