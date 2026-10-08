# Global search

## What it does

Global search (header field **Global search…** next to **Go to…**, full page `/search`) searches the as-code text of **every** component at once — the
replacement for grepping the old Groovy DSL files. Anything the component's **As Code** tab shows
is searchable: artifact and group patterns, version ranges, VCS URLs, Jira keys, docker images,
people.

- **Query box** — debounced (300 ms); nothing is sent below 2 characters (the server minimum),
  so typing never produces a 400.
- **Text / Regex** — Text is a case-insensitive substring match with regex metacharacters taken
  literally; Regex sends the query as a case-insensitive (Java) regular expression. Matched text
  is highlighted in both modes from the `ranges` the server returns per line — the pattern is
  never re-run in the browser, whose JS `RegExp` would not reproduce Java regex semantics.
- **Active / Archived / All** — defaults to **Active** (no `archived` param in the URL);
  `archived=true` is archived only, `archived=all` both.
- **Results** — grouped by component (sorted by key, archived ones badged). Each line shows its
  line number, its text and the enclosing block path minus the component block itself (e.g.
  `"[2.0,)" › distribution`), so a hit inside a version range is identifiable without opening the
  component. A component with more matching lines than shown gets a "+N more" link.
- **Truncation** — the server returns the first 100 components; when more match, a banner offers
  "Show up to 1000" (`limit=1000`).
- **Errors** — the server's 400 message (invalid regex, too expensive, too complex) is shown
  inline.

State lives in the URL, so a search is shareable: `?q=…&regex=true&archived=true|all&limit=…`.
Changing the query, mode or scope drops a raised `limit`.

### Deep link into the As Code tab

Every line links to `/components/<uuid>?tab=as-code&line=<n>`. The detail page opens on the
**As Code** tab (Full view — search line numbers come from it) with line `n` marked and scrolled
into view. Only `tab=as-code` is honoured; any other `tab` value opens on General as before. The
link uses the component **UUID** returned with each hit, not the key: the editor's write calls
(PATCH, field-overrides) are addressed by the route id, and CRS accepts only a UUID there.

### Entry points

- Header field **Global search…** (shown with `ACCESS_COMPONENTS`, like the list; hidden on `/search`
  itself). Typing ≥ 2 characters opens a quick-results panel — up to 6 **active** components, the
  first matching line each (`limit=6&maxMatchesPerComponent=1&archived=false`); a result opens that
  line in the As Code tab. **Enter** or **See all** opens `/search?q=…` (regex, Archived/All, every
  result). ↑/↓ pick a result, Esc closes; **/** focuses the field from anywhere.
- **Go to…** palette (⌘K): **Go to › Global search**, and **Action › Global search for "…"**
  which hands the typed text to `/search?q=…`.
- Component list: while the key/name filter holds ≥ 2 characters, a "Global search →" link
  offers the same text to `/search`.
- What's new entry `as-code-search-2026-10`, with a spotlight on the header **Global search…** field.

## Source

- [`frontend/src/pages/AsCodeSearchPage.tsx`](../../frontend/src/pages/AsCodeSearchPage.tsx)
- [`frontend/src/components/AsCodeSearchResults.tsx`](../../frontend/src/components/AsCodeSearchResults.tsx)
- [`frontend/src/hooks/useAsCodeSearch.ts`](../../frontend/src/hooks/useAsCodeSearch.ts)
- [`frontend/src/lib/asCodeSearch.tsx`](../../frontend/src/lib/asCodeSearch.tsx) — deep-link href, highlighting from server-reported ranges.
- [`frontend/src/components/ui/CodeBlock.tsx`](../../frontend/src/components/ui/CodeBlock.tsx) — `highlightLine`.
- [`frontend/src/components/editor/AsCodeTab.tsx`](../../frontend/src/components/editor/AsCodeTab.tsx) — `highlightLine` (Full mode only).

## Backend contract

| Method | Path | Auth | Source |
|---|---|---|---|
| `GET` | `/rest/api/4/components/as-code/search` | `ACCESS_COMPONENTS` | CRS `ComponentControllerV4.searchAsCode`. Contract: CRS [SYS-100](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/requirements-common.md). |

Params: `q` (2–200 chars), `regex`, `archived`, `limit` (1–1000, default 100),
`maxMatchesPerComponent` (1–1000, default 20). Response `AsCodeSearchResponse`
`{query, regex, totalComponents, truncated, results: [{id, componentKey, archived, matchCount, matches: [{line, text, path, ranges: [{start, end}]}]}]}`.
Results reflect an edit on the next search; edits that bypass both the component rows and the
audit log (TeamCity version-line sync) show up within 5 minutes.
