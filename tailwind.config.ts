import type { Config } from 'tailwindcss';

/**
 * Marine chart aesthetic.
 * Chart-paper ground, navy ink, hairline rules. No gradients, no shadows,
 * nothing rounder than 2px. Monospace for every number and label; a clean
 * sans for prose only.
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
        chart: {
          paper: '#E9EDE9',
          ink: '#12313C',
          rule: '#C3CFC9',
        },
        tier: {
          low: '#2E7159', // preservation
          med: '#B87A22', // diversified
          high: '#A72F6E', // speculative
        },
      },
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        none: '0',
        DEFAULT: '2px',
        sm: '2px',
        md: '2px',
        lg: '2px',
      },
      letterSpacing: {
        label: '0.08em',
        annotation: '0.12em',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};

export default config;
