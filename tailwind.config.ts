import type { Config } from 'tailwindcss';

/**
 * Dark, quiet, legible. Near-black page, slightly lifted cards, one hairline
 * colour, and a small set of accents that each mean exactly one thing.
 *
 * Gain/loss own green and red. Tiers deliberately do NOT use green or red —
 * they run cool → warm → hot (blue, amber, pink), so "this holding is risky"
 * can never be misread as "this holding is losing money".
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0A0B0D',
        surface: '#14161A',
        'surface-2': '#1C1F26',
        line: '#262A31',
        'line-soft': '#1B1F25',
        ink: '#F2F4F7',
        muted: '#98A1AE',
        dim: '#5F6773',

        up: '#00C805',
        down: '#FF5A47',

        tier: {
          low: '#4DABF7',
          med: '#FFB020',
          high: '#F06595',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Inter',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        label: '0.04em',
      },
    },
  },
  plugins: [],
};

export default config;
