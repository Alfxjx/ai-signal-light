/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,ts,js}',
  ],
  theme: {
    extend: {
      colors: {
        // 暗色仪表盘底色阶
        ink: {
          950: '#07090c',
          900: '#0b0f14',
          800: '#11161d',
          700: '#182029',
          600: '#212b36',
          500: '#3a4550',
          400: '#5b6b7a',
        },
        // 状态 LED 色，贯穿全站
        led: {
          green: '#5ef08a',
          amber: '#ffc53d',
          red: '#ff5c5c',
          slate: '#3a4550',
          cyan: '#57c7ff',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif',
        ],
        mono: [
          'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas',
          'Liberation Mono', 'Courier New', 'monospace',
        ],
      },
      borderRadius: {
        panel: '6px',
      },
      // 仪表盘大量使用「几百分之几」的描边/底色，补齐细粒度透明度档位
      opacity: {
        3: '0.03',
        4: '0.04',
        5: '0.05',
        6: '0.06',
        7: '0.07',
        8: '0.08',
        9: '0.09',
        12: '0.12',
        15: '0.15',
        18: '0.18',
        22: '0.22',
        96: '0.96',
      },
      boxShadow: {
        panel: '0 18px 48px -24px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        floaty: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        marquee: 'marquee 42s linear infinite',
        'marquee-slow': 'marquee 70s linear infinite',
        floaty: 'floaty 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
