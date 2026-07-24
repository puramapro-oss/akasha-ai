/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        void: '#03040a',
        cyan: '#00d4ff',
        pink: '#ff6b9d',
        neon: '#39ff14',
        gold: '#ffd700',
        purple: '#a855f7',
        orange: '#ff6b35',
      },
      fontFamily: {
        display: ['SpaceGrotesk_700Bold'],
        body: ['DMSans_400Regular'],
        'body-medium': ['DMSans_500Medium'],
        'body-bold': ['DMSans_700Bold'],
        mono: ['JetBrainsMono_400Regular'],
      },
    },
  },
  plugins: [],
}
