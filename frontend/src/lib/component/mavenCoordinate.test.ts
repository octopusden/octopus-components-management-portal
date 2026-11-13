import { describe, it, expect } from 'vitest'
import { mavenCoordinate } from './mavenCoordinate'

describe('mavenCoordinate', () => {
  it.each([
    [{ groupPattern: 'org.acme', artifactPattern: 'svc' }, 'org.acme:svc'],
    [{ groupPattern: 'org.acme', artifactPattern: 'svc', extension: 'tgz' }, 'org.acme:svc:tgz'],
    [{ groupPattern: 'org.acme', artifactPattern: 'svc', extension: 'tgz', classifier: 'dist' }, 'org.acme:svc:tgz:dist'],
    [{ groupPattern: 'org.acme', artifactPattern: 'svc', classifier: 'dist' }, 'org.acme:svc::dist'],
    [{ groupPattern: ' org.acme ', artifactPattern: ' svc ', extension: '  ', classifier: '' }, 'org.acme:svc'],
  ])('%o → %s', (row, expected) => {
    expect(mavenCoordinate(row)).toBe(expected)
  })
})
