/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,ts,js}',
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: 'rgba(20, 20, 30, 0.92)',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.06)',
        },
        accent: {
          green: '#4ade80',
          yellow: '#facc15',
          red: '#ef4444',
        },
      },
      backdropBlur: {
        glass: '20px',
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'PingFang SC', 'Microsoft YaHei', 'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
