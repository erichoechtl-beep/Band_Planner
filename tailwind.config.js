/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        stage: {
          bg: '#0A0E17',
          surface: '#0F1520',
          raised: '#161D2B',
          hover: '#1C2536',
          line: '#222B3B',
          strong: '#334058',
          text: '#F1F5F9',
          muted: '#9DA8BA',
          subtle: '#6E7A8F',
        },
        neon: {
          DEFAULT: '#22C55E',
          strong: '#10B981',
        },
        signal: '#06B6D4',
        warn: '#F5B83D',
        danger: '#F87171',
      },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        pop: '0 24px 64px -16px rgba(0,0,0,0.75)',
      },
    },
  },
  plugins: [],
};
