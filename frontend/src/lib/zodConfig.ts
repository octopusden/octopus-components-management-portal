import { z } from 'zod'

// Zod probes `new Function('')` to enable its JIT object parser. Under the portal's CSP
// (no 'unsafe-eval', see SecurityConfig.CONTENT_SECURITY_POLICY) the probe is blocked
// and the browser logs a CSP violation even though Zod swallows the error. Opting out
// skips the probe. Imported first in main.tsx so it runs before any schema is built.
z.config({ jitless: true })
