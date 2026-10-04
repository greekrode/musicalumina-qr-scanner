/** @type {import('tailwindcss').Config} */
// Mirrors the musicalumina-web palette; values come from src/styles/tokens.css.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        offWhite: '#FFFBEF',
        marigold: { DEFAULT: '#E2A225', 50: '#fdf5e3', 100: '#f9e5b8', 600: '#c48716', 700: '#9b6a0f' },
        burgundy: { DEFAULT: '#491822', 50: '#f7eeef', 100: '#e7c9ce', 600: '#3a131b', 700: '#2e040e' },
        surface: { canvas: 'var(--surface-canvas)', warm: 'var(--surface-canvas-warm)', mist: 'var(--surface-canvas-mist)', elevated: 'var(--surface-elevated)', inverse: 'var(--surface-inverse)' },
        ink: { primary: 'var(--ink-primary)', body: 'var(--ink-body)', muted: 'var(--ink-muted)', subtle: 'var(--ink-subtle)', accent: 'var(--ink-accent)' },
        rule: { hairline: 'var(--rule-hairline)', subtle: 'var(--rule-subtle)', strong: 'var(--rule-strong)' },
        status: {
          'open-fg': 'var(--status-open)', 'open-bg': 'var(--status-open-bg)',
          'upcoming-fg': 'var(--status-upcoming)', 'upcoming-bg': 'var(--status-upcoming-bg)',
          'error-fg': 'var(--status-error)', 'error-bg': 'var(--status-error-bg)',
        },
      },
      fontFamily: {
        serif: ['Noto Serif', 'Georgia', 'serif'],
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: { 'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)' },
    },
  },
  plugins: [],
};
