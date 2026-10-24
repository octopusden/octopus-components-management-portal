## Why

- The Create-Component wizard rejects `_` in the Component Key outright
  (`BASE_KEY_REGEX = /^[a-z][a-z0-9-]*$/`). Client-specific components are conventionally
  keyed by their Client Code, and a Client Code may contain `_` (`[A-Z_0-9]+`) — so the
  convention people actually follow is not expressible through the wizard. 42 existing
  components are shaped that way; every one of them had to be created around the form.
- The rule also lived only in the browser. CRS validated no key characters at all, so any
  API client could write any key while the Portal's own users were the only ones held to
  the convention. CRS [SYS-095](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/requirements-common.md)
  and [ADR-020](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/adr/020-component-key-format.md)
  put the rule on the server; this change makes the Portal agree with it and say so
  before the user submits.

## What Changes

- **Create wizard**: a Component Key may contain `_` when it starts with the lowercased
  Client Code of the component being created (its underscores included), followed by the
  end of the key or `-` and the usual kebab tail. Everything else is unchanged — plain
  keys still must be lowercase kebab starting with a letter, and uppercase stays rejected.
- **Error message**: when a Client Code is present, an offending key gets a message that
  names the prefix that would make it legal instead of the generic charset message.
- **Rename** (component editor, General tab): the same rule now applies to a rename
  target. This is the first client-side format check on that field — today it has none —
  and it mirrors what CRS will reject anyway.
- **Re-validation**: editing the Client Code re-validates the Component Key in both
  places, so a key stops (or starts) being flagged as soon as the code it depends on
  changes.

## Capabilities

### New Capabilities

- `component-key-format`: what the Portal accepts as a Component Key when creating or
  renaming a component, and how that depends on the component's Client Code.

## Out of scope

- **Changing or clearing a Client Code on an existing component.** It does not
  re-validate the key and cannot fail — a key may outlive the code that justified its
  underscore. Tracked as a separate "change client code" feature.
- Validating the Client Code's own `[A-Z_0-9]+` format in the browser. CRS rejects a
  malformed code with a 400 that is already mapped inline.
- The 92 existing components whose keys contain `_` but have no Client Code. They keep
  working; they are simply not creatable through the wizard, and no escape hatch is added.
- Uppercase or dotted keys. 214 existing keys have them; the rule constrains new names
  only, and CRS never re-validates an existing key.

## Impact

**Portal only, once CRS's `feat/component-key-client-code-underscore` reaches CRS `main`.**
CRS merges first: it is the side that enforces the rule, and the Portal check is a
pre-submit mirror of it. No OpenAPI change is involved (validation only), so no
`npm run vendor-spec` re-vendor is needed.
