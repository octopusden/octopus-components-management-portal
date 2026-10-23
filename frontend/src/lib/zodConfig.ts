import { z } from 'zod'

// Zod's JIT probe (new Function) trips the CSP (no 'unsafe-eval'); imported first in main.tsx.
z.config({ jitless: true })
