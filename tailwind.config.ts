import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './actions/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        // Florida Sun & Sea palette
        ink: {
          DEFAULT: '#0F1F1C',
          muted: '#475A56',
          subtle: '#8A9A95',
        },
        surface: {
          DEFAULT: '#F8FAF9',
          card: '#FFFFFF',
          raised: '#FFFFFF',
        },
        primary: {
          DEFAULT: '#0B7A6B',
          hover: '#095E54',
          foreground: '#FFFFFF',
          50: '#E6F4F1',
          100: '#C7E5DE',
          200: '#92CAC0',
          300: '#5DAFA1',
          400: '#2E9485',
          500: '#0B7A6B',
          600: '#095E54',
          700: '#07473F',
          800: '#04332D',
          900: '#021D19',
        },
        accent: {
          DEFAULT: '#F4A261',
          hover: '#E8924A',
          foreground: '#0F1F1C',
          50: '#FEF6EE',
          100: '#FDE9D2',
          200: '#FAD3A4',
          300: '#F7BB75',
          400: '#F4A261',
          500: '#E8924A',
          600: '#C97732',
          700: '#9C5A23',
          800: '#6E3F18',
          900: '#42250D',
        },
        gold: {
          DEFAULT: '#D4AF37',
          dark: '#B8860B',
        },
        border: '#E5EBEA',
        input: '#E5EBEA',
        ring: '#0B7A6B',
        background: '#F8FAF9',
        foreground: '#0F1F1C',
        muted: {
          DEFAULT: '#EEF2F1',
          foreground: '#475A56',
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
        success: {
          DEFAULT: '#10B981',
          foreground: '#FFFFFF',
          subtle: '#D1FAE5',
        },
        warn: {
          DEFAULT: '#F59E0B',
          foreground: '#FFFFFF',
          subtle: '#FEF3C7',
        },
        secondary: {
          DEFAULT: '#EEF2F1',
          foreground: '#0F1F1C',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#0F1F1C',
        },
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#0F1F1C',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: '14px',
        md: '10px',
        sm: '6px',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgba(15, 31, 28, 0.04), 0 4px 16px -2px rgba(15, 31, 28, 0.06)',
        card: '0 1px 3px 0 rgba(15, 31, 28, 0.05), 0 8px 24px -4px rgba(15, 31, 28, 0.08)',
        glow: '0 0 0 1px rgba(11, 122, 107, 0.1), 0 8px 32px -8px rgba(11, 122, 107, 0.3)',
      },
      backgroundImage: {
        'gradient-mesh':
          'radial-gradient(at 20% 0%, rgba(11, 122, 107, 0.08) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(244, 162, 97, 0.06) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(11, 122, 107, 0.04) 0px, transparent 50%)',
        'gradient-hero':
          'linear-gradient(180deg, rgba(248, 250, 249, 0) 0%, rgba(11, 122, 107, 0.03) 100%)',
        'gradient-gold': 'linear-gradient(135deg, #D4AF37 0%, #B8860B 100%)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'fade-in-down': 'fade-in-down 0.4s ease-out',
        'slide-in': 'slide-in 0.4s ease-out',
        shimmer: 'shimmer 2s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
