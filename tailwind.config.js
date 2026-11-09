/** Farben kommen aus CSS-Variablen (src/index.css), damit Hell- und Dunkelmodus umschaltbar sind. */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        stage: {
          bg: v('bg'),
          surface: v('surface'),
          raised: v('raised'),
          hover: v('hover'),
          line: v('line'),
          strong: v('strong'),
          text: v('text'),
          muted: v('muted'),
          subtle: v('subtle'),
        },
        brand: {
          DEFAULT: v('brand'),
          strong: v('brand-strong'),
          soft: v('brand-soft'),
        },
        /** Schriftfarbe auf vollflächigen Brand-, Akzent- und Warnflächen */
        'on-fill': v('on-fill'),
        accent: v('accent'),
        /** Konzerte im Kalender */
        concert: v('concert'),
        ok: v('ok'),
        warn: v('warn'),
        danger: v('danger'),
        backdrop: v('backdrop'),
      },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
      fontFamily: {
        sans: ['"IBM Plex Sans Variable"', '"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
};
