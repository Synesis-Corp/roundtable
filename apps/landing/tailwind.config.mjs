/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        rt: {
          bg: '#0d0e10',
          soft: '#141518',
          panel: '#1c1e22',
          border: 'rgba(255, 255, 255, 0.075)',
          'border-strong': 'rgba(255, 255, 255, 0.12)',
          'text-1': '#ededef',
          'text-2': '#9a9ea6',
          'text-3': '#686c74',
          accent: '#6f7bf2',
          'accent-hover': '#818cf6',
          'accent-quiet': 'rgba(111, 123, 242, 0.14)',
          'accent-line': 'rgba(111, 123, 242, 0.32)',
          'accent-text': '#aab2f9',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      borderRadius: {
        sm: '10px',
        md: '16px',
        lg: '24px',
      },
      maxWidth: {
        wrap: '1120px',
      },
      transitionTimingFunction: {
        rt: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'rt-spin': 'rt-spin 40s linear infinite',
        'rt-float': 'rt-float 6s ease-in-out infinite',
      },
      keyframes: {
        'rt-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        'rt-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};
