/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-active': 'var(--color-primary-active)',
        'primary-soft': 'var(--color-primary-soft)',
        'primary-border': 'var(--color-primary-border)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-active': 'var(--color-accent-active)',
        'accent-soft': 'var(--color-accent-soft)',
        'accent-border': 'var(--color-accent-border)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-muted': 'var(--color-surface-muted)',
        'surface-subtle': 'var(--color-surface-subtle)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        'border-subtle': 'var(--color-border-subtle)',
        success: 'var(--color-success)',
        'success-soft': 'var(--color-success-soft)',
        warning: 'var(--color-warning)',
        'warning-soft': 'var(--color-warning-soft)',
        danger: 'var(--color-danger)',
        'danger-soft': 'var(--color-danger-soft)',
        info: 'var(--color-info)',
        'info-soft': 'var(--color-info-soft)',
      },
      boxShadow: {
        'soft': '0 2px 10px -1px rgba(15, 23, 42, 0.05), 0 1px 3px -1px rgba(15, 23, 42, 0.04)',
        'soft-md': '0 4px 16px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -2px rgba(15, 23, 42, 0.04)',
        'soft-lg': '0 10px 25px -3px rgba(15, 23, 42, 0.08), 0 4px 10px -4px rgba(15, 23, 42, 0.04)',
      }
    },
  },
  plugins: [],
}
