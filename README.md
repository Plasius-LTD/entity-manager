# @plasius/entity-manager

[![npm version](https://img.shields.io/npm/v/@plasius/entity-manager.svg)](https://www.npmjs.com/package/@plasius/entity-manager)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/entity-manager/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/entity-manager/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Plasius-LTD/entity-manager.svg)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Entity definition & validation helpers for the Plasius ecosystem.

This package is part of the **Plasius LTD** selective open-source strategy. For more on our approach, see [ADR-0013: Selective Open Source](https://github.com/Plasius-LTD/plasius-ltd-site/blob/main/docs/adrs/adr-0013%3A%20Open%20Source%20Strategy.md). This package is maintained as open source to foster community trust and enable integration, while the core Plasius platform remains proprietary.

Apache-2.0. ESM + CJS builds. TypeScript types included.

---

## Installation

```bash
npm install @plasius/entity-manager
```

---

## Usage Example

```ts
import {
  baseEntitySchema,
  ensureValid,
  bumpVersion,
} from "@plasius/entity-manager";
import { field, createSchema } from "@plasius/schema";

// Build your entity schema with @plasius/schema field builders.
// baseEntitySchema already includes type/version/createdAt/updatedAt requirements.
const productSchema = createSchema(
  {
    id: field.string().required(),
    name: field.generalText().required(),
    price: field.number().min(0).required(),
    createdAt: field.dateTimeISO().required(),
    updatedAt: field.dateTimeISO().required(),
  },
  "product",
);

const entity = {
  id: "abc123",
  type: "product",
  version: "1.0.0",
  name: "Sample",
  price: 10,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Validate shape, semver, and timestamp ordering
const validEntity = ensureValid(productSchema, entity);

// Bump version and updatedAt without mutating the original
const next = bumpVersion(validEntity);
console.log(next.version); // 1.0.1
console.log(next.updatedAt); // ISO8601 string for "now"
```

### API

- `baseEntitySchema`: Runtime schema for `BaseEntity` objects (`id`, `type`, `version`, `createdAt`, `updatedAt`).
- `ensureValid(schema, value)`: Asserts that `value` matches the schema; returns the value on success and throws on validation failure.
- `bumpVersion(entity, now?)`: Returns a copy of the entity with `version + 1` and `updatedAt` set to the later of `createdAt` or the provided/current time.
- `wrapExternalSchema(schema)`: Adapts an external validator (for example, from `@plasius/schema`) to the `Schema<T>` interface so it can be used with `ensureValid`.

Validation rules include non-empty strings for `id`, SemVer `version`, ISO8601-parseable timestamps (milliseconds optional), and `updatedAt` not preceding `createdAt`. `bumpVersion` is immutable, bumps the SemVer patch, and guards against clock skew by never moving `updatedAt` behind `createdAt`.

### Integrating with `@plasius/schema`

Prefer passing the native `@plasius/schema` schemas directly to `ensureValid`. If you only have a throwing validator, adapt it with `wrapExternalSchema`:

```ts
import { wrapExternalSchema, ensureValid } from "@plasius/entity-manager";
import { productSchema } from "@plasius/schema"; // example schema export

const schema = wrapExternalSchema(productSchema);
const product = ensureValid(schema, someUnknownData);
```

---

## Key Documentation

- [Plasius Pillars](https://github.com/plasius/plasius/blob/main/docs/pillars.md)
- [Investor Brief](https://github.com/plasius/plasius/blob/main/docs/investor-brief.md)
- [Competition](https://github.com/plasius/plasius/blob/main/docs/competition.md)
- [Architecture Decision Records (ADRs)](https://github.com/plasius/plasius/tree/main/docs/architecture/adr)

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Contributor License Agreement](./CLA.md)

---

## License

Licensed under the [Apache-2.0 License](./LICENSE).
