import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: process.env.VITE_APP_BASE_URL ?? '/',
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
        // Vendored shadcn boilerplate — state machine / DOM wiring, covered by E2E
        'src/hooks/use-toast.ts',
        'src/components/ui/toaster.tsx',
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
  // Dev proxy targets the portal gateway on :8090 (not the registry directly),
  // so that OAuth2 login / TokenRelay / session cookie flows work end-to-end.
  // cookieDomainRewrite makes the session cookie valid across the Vite dev host.
  server: {
    port: 5173,
    proxy: {
      '/rest': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      '/auth': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      '/login': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      '/oauth2': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      '/logout': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      // Forwards /portal/info (footer pre-login) and /portal/links (authenticated
      // config) to the Spring gateway. Also fixes the pre-existing AppFooter
      // "no version" dev-mode degradation.
      '/portal': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
  build: {
    outDir: 'dist',
    // No sourcemaps in the production bundle: dist/assets is served permitAll
    // by the Spring gateway (SecurityConfig), so a .js.map there would hand the
    // full frontend source to unauthenticated callers. 'hidden' would not help —
    // the map file still lands in dist/assets under a guessable name. Dev
    // builds are unaffected (esbuild serves sources directly).
    sourcemap: false,
  },
})
