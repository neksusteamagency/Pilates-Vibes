/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        beige:        '#F5F0E8',
        'beige-dark': '#EDE6D6',
        'beige-mid':  '#E0D5C1',
        brown:        '#3D2314',
        'brown-mid':  '#6B3D25',
        'brown-light':'#A0673A',
        olive:        '#7C8C5E',
        'olive-light':'#A3B07E',
        cream:        '#FAF7F2',
        taupe:        '#C4AE8F',
        'text-dark':  '#2A1A0E',
        'text-mid':   '#6B5744',
        'text-light': '#9C8470',
      },
      fontFamily: {
        serif: ['"Cormorant Garant"', 'serif'],
        sans:  ['"DM Sans"', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        sm:   '8px',
      },
      boxShadow: {
        card: '0 2px 16px rgba(61,35,20,0.10)',
        lg:   '0 8px 32px rgba(61,35,20,0.14)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(.4,0,.2,1)',
      },
      width: {
        sidebar: '230px',
      },
    },
  },
  plugins: [],
};