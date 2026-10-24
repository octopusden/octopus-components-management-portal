# Components Management Portal

The browser experience for the components registry. CRS owns the data model and the
business rules; this repo owns how a person sees and edits them. The terms below are the
ones this repo keeps getting wrong in three different ways — they are fixed here.

## Language

**Component Key**:
The canonical identifier of a component — what every API lookup, release automation and
legacy client resolves a component by. Lowercase kebab for new components, with one
exception: it may carry a **client-code prefix** whose underscores are allowed.
_Avoid_: name, component name, key (unqualified). The API field is `name` and the
database column is `component_key`; neither is the term to use in prose or in a UI label.

**Display Name**:
The human-readable label of a component, shown wherever a person reads about it rather
than addresses it. Free text, unique, and never an identifier.
_Avoid_: title, label, name.

**Client Code**:
The code identifying the client a component is built for. Uppercase letters, digits and
underscores (`[A-Z_0-9]+`), enforced by CRS. Only present on external components, and a
field-config setting can hide it from view without removing it from the component.
_Avoid_: customer code, client id.

**Client-code prefix**:
The leading segment of a Component Key that equals the lowercased Client Code of that
same component. The only place a Component Key may contain an underscore — see
CRS [ADR-020](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/adr/020-component-key-format.md).
_Avoid_: client prefix, code prefix.

**Rename**:
Changing a component's Component Key. Gated by `RENAME_COMPONENTS`; old keys keep
resolving to the renamed component afterwards.
_Avoid_: edit the name.
