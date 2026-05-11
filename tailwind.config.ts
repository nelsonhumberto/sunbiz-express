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
        // LaunchForma brand palette
        ink: {
          DEFAULT: '#1A1F2B',
          muted: '#4A5568',
          subtle: '#A0AEC0',
        },
        surface: {
          DEFAULT: '#F2F4F7',
          card: '#FFFFFF',
          raised: '#FFFFFF',
        },
        primary: {
          DEFAULT: '#1565FF',
          hover: '#0d4fd6',
          foreground: '#FFFFFF',
          50: '#EBF1FF',
          100: '#C8D9FF',
          200: '#95B4FF',
          300: '#628FFF',
          400: '#3570FF',
          500: '#1565FF',
          600: '#0d4fd6',
          700: '#0a3daa',
          800: '#072c7e',
          900: '#041a52',
        },
        accent: {
          DEFAULT: '#4CAF50',
          hover: '#3d9140',
          foreground: '#FFFFFF',
          50: '#E8F5E9',
          100: '#C8E6C9',
          200: '#A5D6A7',
          300: '#81C784',
          400: '#66BB6A',
          500: '#4CAF50',
          600: '#3d9140',
          700: '#2e7330',
          800: '#1e5520',
          900: '#0f3710',
        },
        navy: {
          DEFAULT: '#0D1B2A',
          light: '#1a2d42',
        },
        gold: {
          DEFAULT: '#D4AF37',
          dark: '#B8860B',
        },
        border: '#E2E8F0',
        input: '#E2E8F0',
        ring: '#1565FF',
        background: '#F2F4F7',
        foreground: '#1A1F2B',
        muted: {
          DEFAULT: '#EDF2F7',
          foreground: '#4A5568',
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
        success: {
          DEFAULT: '#4CAF50',
          foreground: '#FFFFFF',
          subtle: '#E8F5E9',
        },
        warn: {
          DEFAULT: '#F59E0B',
          foreground: '#FFFFFF',
          subtle: '#FEF3C7',
        },
        secondary: {
          DEFAULT: '#EDF2F7',
          foreground: '#1A1F2B',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#1A1F2B',
        },
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#1A1F2B',
        },
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-poppins)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '14px',
        md: '10px',
        sm: '6px',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgba(26, 31, 43, 0.04), 0 4px 16px -2px rgba(26, 31, 43, 0.06)',
        card: '0 1px 3px 0 rgba(26, 31, 43, 0.05), 0 8px 24px -4px rgba(26, 31, 43, 0.08)',
        glow: '0 0 0 1px rgba(21, 101, 255, 0.12), 0 8px 32px -8px rgba(21, 101, 255, 0.28)',
      },
      backgroundImage: {
        'gradient-mesh':
          'radial-gradient(at 20% 0%, rgba(21, 101, 255, 0.08) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(76, 175, 80, 0.06) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(21, 101, 255, 0.04) 0px, transparent 50%)',
        'gradient-hero':
          'linear-gradient(180deg, rgba(242, 244, 247, 0) 0%, rgba(21, 101, 255, 0.03) 100%)',
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
