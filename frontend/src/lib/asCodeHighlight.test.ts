import { describe, it, expect } from 'vitest'
import { tokenizeLine, type Token } from './asCodeHighlight'

const typesOf = (tokens: Token[]) => tokens.map((t) => t.type)
const find = (tokens: Token[], text: string) => tokens.find((t) => t.text === text)

describe('tokenizeLine', () => {
  it('marks a bare block header', () => {
    const t = tokenizeLine('bcomponent {')
    expect(find(t, 'bcomponent')?.type).toBe('header')
    expect(t.map((x) => x.text).join('')).toBe('bcomponent {')
  })

  it('marks a quoted range header as a string', () => {
    const t = tokenizeLine('    "[1.5,)" {')
    expect(find(t, '"[1.5,)"')?.type).toBe('string')
    // indentation preserved as a plain token
    expect(t[0]).toEqual({ text: '    ', type: 'plain' })
  })

  it('splits name = value: property + string value', () => {
    const t = tokenizeLine('    componentOwner = "user1"')
    expect(find(t, 'componentOwner')?.type).toBe('property')
    expect(find(t, '"user1"')?.type).toBe('string')
  })

  it('classifies enum barewords', () => {
    const t = tokenizeLine('    buildSystem = MAVEN')
    expect(find(t, 'MAVEN')?.type).toBe('enum')
  })

  it('classifies booleans/null as keywords', () => {
    expect(find(tokenizeLine('deprecated = true'), 'true')?.type).toBe('keyword')
    expect(find(tokenizeLine('x = null'), 'null')?.type).toBe('keyword')
  })

  it('keeps a single-quoted $-placeholder string intact', () => {
    // `majorVersionFormat` here is intentional: it is the Groovy DSL key emitted
    // by the CRS as-code renderer (unchanged by the v4 minorVersionFormat rename),
    // not the v4 field name — this only exercises the tokenizer.
    const t = tokenizeLine("    majorVersionFormat = '$major.$minor'")
    expect(find(t, "'$major.$minor'")?.type).toBe('string')
  })

  it('tokenizes a list value into string elements + plain separators', () => {
    const t = tokenizeLine('releaseManager = ["alice", "bob"]')
    expect(typesOf(t)).toContain('string')
    expect(find(t, '"alice"')?.type).toBe('string')
    expect(find(t, '"bob"')?.type).toBe('string')
    // round-trips
    expect(t.map((x) => x.text).join('')).toBe('releaseManager = ["alice", "bob"]')
  })

  it('treats a lone closing brace as plain', () => {
    expect(tokenizeLine('}').every((x) => x.type === 'plain')).toBe(true)
  })

  it('returns an empty token list for a blank line', () => {
    expect(tokenizeLine('')).toEqual([])
  })

  it('renders field = null (null-clear) with a keyword null', () => {
    const t = tokenizeLine('        buildFilePath = null')
    expect(find(t, 'buildFilePath')?.type).toBe('property')
    expect(find(t, 'null')?.type).toBe('keyword')
  })
})
