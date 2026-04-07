import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'build/test-results/test/TEST-vitest.xml',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: 'build/reports/coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/vite-env.d.ts',
        // Editor form tabs and admin forms are complex UI with no pure logic — covered by E2E
        'src/components/editor/**',
        'src/components/admin/**',
        // Pages render composed components — covered by E2E smoke tests
        'src/pages/**',
        // Entry point, not business logic
        'src/main.tsx',
        // Pure TypeScript type declarations — no runtime code
        'src/lib/types.ts',
      ],
      thresholds: {
        lines: 55,
        functions: 40,
        branches: 80,
        statements: 55,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/rest': {
        target: 'http://localhost:4567',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
