/**
 * Tiny, dependency-free tokenizer for the CRS "as-code" Groovy-style output.
 * We control the rendered format (see the backend ComponentCodeRenderer), so a
 * small line-oriented tokenizer is enough to syntax-highlight it without pulling
 * in a full grammar library. Pure function — unit-tested directly.
 */

export type TokenType = 'header' | 'property' | 'string' | 'enum' | 'keyword' | 'number' | 'plain'

export interface Token {
  text: string
  type: TokenType
}

// Order matters: strings first (so braces/words inside quotes aren't re-tokenized),
// then literals, ALL_CAPS enum tokens (MAVEN, GIT, DEB…), then numbers.
const VALUE_SCANNER =
  /('(?:\\.|[^'\\])*')|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|\b([A-Z][A-Z0-9_]+)\b|\b(\d+(?:\.\d+)*)\b/g

/** Tokenize the value part of a `name = value` line (or any free text). */
function tokenizeValue(value: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  for (const m of value.matchAll(VALUE_SCANNER)) {
    const index = m.index ?? 0
    if (index > last) tokens.push({ text: value.slice(last, index), type: 'plain' })
    const type: TokenType = m[1] || m[2] ? 'string' : m[3] ? 'keyword' : m[4] ? 'enum' : 'number'
    tokens.push({ text: m[0], type })
    last = index + m[0].length
  }
  if (last < value.length) tokens.push({ text: value.slice(last), type: 'plain' })
  return tokens
}

/**
 * Tokenize a single line into colored spans. Recognizes:
 *  - block headers (`name {` / `"range" {`),
 *  - `name = value` assignments (name → property, value → tokenized),
 *  - everything else (closing braces, blanks) as plain.
 */
export function tokenizeLine(line: string): Token[] {
  const indent = line.match(/^\s*/)?.[0] ?? ''
  const rest = line.slice(indent.length)
  const tokens: Token[] = []
  if (indent) tokens.push({ text: indent, type: 'plain' })
  if (rest.length === 0) return tokens

  if (rest.endsWith('{')) {
    const header = rest.slice(0, rest.length - 1).trimEnd()
    tokens.push({ text: header, type: header.startsWith('"') ? 'string' : 'header' })
    tokens.push({ text: rest.slice(header.length), type: 'plain' }) // the " {" tail
    return tokens
  }

  const eq = rest.indexOf(' = ')
  if (eq >= 0) {
    tokens.push({ text: rest.slice(0, eq), type: 'property' })
    tokens.push({ text: ' = ', type: 'plain' })
    tokens.push(...tokenizeValue(rest.slice(eq + 3)))
    return tokens
  }

  tokens.push({ text: rest, type: 'plain' })
  return tokens
}
