/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        stage: {
          bg: '#0A0E17',
          surface: '#121826',
          raised: '#1B2333',
          line: '#2F3B52',
          text: '#F4F7FB',
          muted: '#B4BFD0',
        },
        neon: {
          DEFAULT: '#22C55E',
          strong: '#10B981',
        },
        signal: '#06B6D4',
        warn: '#FBBF24',
        danger: '#F87171',
      },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
