import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        activity: {
          klus: {
            DEFAULT: '#10b981',
            light: '#ecfdf5',
            dark: '#047857',
          },
          longrun: {
            DEFAULT: '#10b981',
            light: '#ecfdf5',
            dark: '#047857',
          },
          tempo: {
            DEFAULT: '#f59e0b',
            light: '#fffbeb',
            dark: '#b45309',
          },
          intervals: {
            DEFAULT: '#f59e0b',
            light: '#fffbeb',
            dark: '#b45309',
          },
          strength: {
            DEFAULT: '#0ea5e9',
            light: '#f0f9ff',
            dark: '#0369a1',
          },
          mobility: {
            DEFAULT: '#a855f7',
            light: '#faf5ff',
            dark: '#7e22ce',
          },
          rest: {
            DEFAULT: '#64748b',
            light: '#f8fafc',
            dark: '#334155',
          },
          race: {
            DEFAULT: '#f43f5e',
            light: '#fff1f2',
            dark: '#be123c',
          },
        },
        match: {
          good: '#22c55e',
          partial: '#eab308',
          miss: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};

export default config;
