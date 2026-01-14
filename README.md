# @plasius/entity-manager

[![npm version](https://img.shields.io/npm/v/@plasius/entity-manager.svg)](https://www.npmjs.com/package/@plasius/entity-manager)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/entity-manager/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/entity-manager/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Plasius-LTD/entity-manager.svg)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Entity definitions and validation schemas for the Plasius ecosystem.

This package is part of the **Plasius LTD** selective open-source strategy. For more on our approach, see [ADR-0013: Selective Open Source](https://github.com/Plasius-LTD/plasius-ltd-site/blob/main/docs/adrs/adr-0013%3A%20Open%20Source%20Strategy.md). This package is maintained as open source to foster community trust and enable integration, while the core Plasius platform remains proprietary.

Apache-2.0. ESM + CJS builds. TypeScript types included.

---

## Installation

```bash
npm install @plasius/entity-manager
```

---

## Usage

```ts
import {
  userEntitySchema,
  PreferredDisplayOrder,
} from "@plasius/entity-manager";

const user = {
  type: "userEntity",
  version: "1.0",
  email: "alice@example.com",
  name: {
    firstName: "Alice",
    lastName: "Lovelace",
    displayName: "Alice L.",
    preferredDisplayOrder: PreferredDisplayOrder.DISPLAY_NAME,
  },
};

const result = userEntitySchema.validate(user);
if (!result.valid) {
  console.error(result.errors);
}
```

---

## Export Overview

### Base entity
- `baseEntitySchema`, `baseEntityShape`, `BaseEntity`
- Required fields include `partitionKey`, `id`, `entityType`, `createdAt`, `createdBy`, and `isDeleted` (plus system `type` and `version`).

### User and permissions
- `userEntitySchema`, `userNameSchema`, `userAvatarSchema`
- `settingsEntitySchema`, `permissionsEntitySchema`, `featureFlagEntitySchema`, `roleEntitySchema`
- Enums: `PreferredDisplayOrder`, `UserEmailPreferences`, `UserNotificationPreferences`, `Role`, `Scope`

### Assets
- `assetEntitySchema`, `imageAssetEntitySchema`, `audioAssetEntitySchema`, `modelAssetEntitySchema`, `objectAssetEntitySchema`
- Enums: `AudioChannel`, `ModelAssetFormat`

### Components
- `baseComponentSchema`, `physicsComponentSchema`, `animationComponentSchema`, `shadowComponentSchema`, `levelOfDetailComponentSchema`
- Enum: `ComponentTypes`

### Auth and translations
- `authenticatedUserSchema`, `AuthProvider`
- `translatableSchema`, `supportedLanguagesSchema`

### Validators and utilities
- `isValidAzureTableKey`, `isValidEntityType`, `validateAssetSchema`
- `validateFeatureFlagValue`, `validateSettingValue`

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
