/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md}'],
  theme: {
    extend: {
      colors: {
        // Core palette
        bg: {
          DEFAULT: '#FFFFFF',
          alt: '#FAFAF9',
        },
        text: {
          DEFAULT: '#1A1A1A',
          secondary: '#6B7280',
          tertiary: '#9CA3AF',
        },
        accent: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          light: 'rgba(79,70,229,0.08)',
          border: 'rgba(79,70,229,0.3)',
        },
        surface: {
          DEFAULT: '#F5F5F4',
          border: '#E7E5E4',
        },
        success: '#0D9488',
        // Complexity badge colors
        beginner: { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' },
        intermediate: { bg: '#FEF9C3', text: '#854D0E', border: '#FDE047' },
        advanced: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
      },
      fontFamily: {
        display: ['Satoshi', 'General Sans', 'system-ui', 'sans-serif'],
        body: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        display: '-0.02em',
        tight: '-0.01em',
      },
      lineHeight: {
        body: '1.75',
        heading: '1.2',
      },
      maxWidth: {
        prose: '720px',
        diagram: '1080px',
        landing: '1280px',
      },
      width: {
        sidebar: '240px',
        toc: '200px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)',
        'node': '0 2px 8px rgba(0,0,0,0.08)',
        'node-hover': '0 4px 16px rgba(0,0,0,0.12)',
      },
      animation: {
        'fade-up': 'fadeUp 300ms ease forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'flow': 'flow 1.5s linear infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.8' },
          '50%': { opacity: '1' },
        },
        flow: {
          '0%': { strokeDashoffset: '20' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      transitionTimingFunction: {
        'ease-out-soft': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
};
