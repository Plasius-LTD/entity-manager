import { createSchema, field } from "@plasius/schema";
import {
  isCanonicalUtcTimestamp,
  isChronologicallyAfter,
  isChronologicallyAtOrAfter,
  isOpaqueIdentifier,
  isPresentString,
} from "../family/validation.js";
import {
  accountIdentifierField,
  descriptionField,
  displayNameField,
  governanceIdentifierField,
  governanceKeyField,
  internalAccountIdentifierField,
  internalReasonField,
  mutationIdentifierField,
  optionalGovernanceIdentifierField,
  optionalInternalAccountIdentifierField,
  optionalTimestampField,
  revisionField,
  timestampField,
} from "./fields.js";
import { isProfessionalInterfaceKey } from "./validation.js";

/**
 * Product-neutral seed metadata. Runtime services add identifiers and audit
 * provenance when materializing these categories.
 */
export const BUILT_IN_PROFESSIONAL_ROLE_CATEGORIES = [
  {
    key: "guilds",
    displayName: "Guilds",
    description: "Guild offices, leadership, and professional standing.",
  },
  {
    key: "education",
    displayName: "Education",
    description: "Teachers, educators, scholars, and academic offices.",
  },
  {
    key: "nobility",
    displayName: "Nobility",
    description: "Noble titles, courts, and civic offices.",
  },
  {
    key: "divinity",
    displayName: "Divinity",
    description: "Clergy, religious offices, and divine standing.",
  },
] as const;

/** Seed keys; the category catalogue remains open to additional definitions. */
export const BUILT_IN_PROFESSIONAL_ROLE_CATEGORY_KEYS =
  BUILT_IN_PROFESSIONAL_ROLE_CATEGORIES.map((category) => category.key);

export type BuiltInProfessionalRoleCategoryKey =
  (typeof BUILT_IN_PROFESSIONAL_ROLE_CATEGORIES)[number]["key"];

export enum ProfessionalRoleLifecycleStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
}

export enum ProfessionalRoleAssignmentStatus {
  ACTIVE = "active",
  ENDED = "ended",
}

export enum ProfessionalRoleAssignmentSource {
  MANUAL_ADMIN = "manual-admin",
  GROUP_OWNER = "group-owner",
  INSTITUTION_AUTHORITY = "institution-authority",
  MIGRATION = "migration",
}

const lifecycleFields = {
  status: field
    .string()
    .required()
    .version("1.0")
    .description("Definition lifecycle state.")
    .enum([...Object.values(ProfessionalRoleLifecycleStatus)]),
  revision: revisionField(
    "Positive optimistic-concurrency revision for the definition.",
  ),
  lastMutationId: mutationIdentifierField(
    "Idempotency identifier for the latest accepted mutation.",
  ),
  createdAt: timestampField("Time at which the definition was created."),
  createdByAccountId: internalAccountIdentifierField(
    "Authenticated account that created the definition.",
  ),
  updatedAt: optionalTimestampField("Time of the latest non-archive update."),
  updatedByAccountId: optionalInternalAccountIdentifierField(
    "Authenticated account that performed the latest update.",
  ),
  archivedAt: optionalTimestampField("Time at which the definition was archived."),
  archivedByAccountId: optionalInternalAccountIdentifierField(
    "Authenticated account that archived the definition.",
  ),
  archiveReason: internalReasonField(
    "Protected operator reason for archiving the definition.",
    false,
  ),
};

interface ProfessionalLifecycleRecord {
  status: ProfessionalRoleLifecycleStatus;
  createdAt: string;
  updatedAt?: string;
  updatedByAccountId?: string;
  archivedAt?: string;
  archivedByAccountId?: string;
  archiveReason?: string;
}

function validateProfessionalDefinitionLifecycle(
  definition: ProfessionalLifecycleRecord,
): boolean {
  const hasUpdate =
    definition.updatedAt !== undefined ||
    definition.updatedByAccountId !== undefined;
  if (
    hasUpdate &&
    (!isCanonicalUtcTimestamp(definition.updatedAt) ||
      !isOpaqueIdentifier(definition.updatedByAccountId) ||
      !isChronologicallyAtOrAfter(
        definition.updatedAt,
        definition.createdAt,
      ))
  ) {
    return false;
  }

  if (definition.status === ProfessionalRoleLifecycleStatus.ACTIVE) {
    return (
      definition.archivedAt === undefined &&
      definition.archivedByAccountId === undefined &&
      definition.archiveReason === undefined
    );
  }

  return (
    isCanonicalUtcTimestamp(definition.archivedAt) &&
    isOpaqueIdentifier(definition.archivedByAccountId) &&
    isPresentString(definition.archiveReason) &&
    isChronologicallyAtOrAfter(
      definition.archivedAt,
      definition.updatedAt ?? definition.createdAt,
    )
  );
}

export const professionalRoleCategoryShape = {
  categoryId: governanceIdentifierField(
    "Stable professional-role category identifier.",
  ),
  key: governanceKeyField("Stable professional-role category key."),
  displayName: displayNameField("Human-readable category name."),
  description: descriptionField("Operator-facing category description."),
  ...lifecycleFields,
};

export interface ProfessionalRoleCategory extends ProfessionalLifecycleRecord {
  categoryId: string;
  key: string;
  displayName: string;
  description: string;
  revision: number;
  lastMutationId: string;
  createdByAccountId: string;
}

export const professionalRoleCategorySchema = createSchema(
  professionalRoleCategoryShape,
  "professionalRoleCategory",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateProfessionalDefinitionLifecycle,
  },
);

export const professionalRoleDefinitionShape = {
  definitionId: governanceIdentifierField(
    "Stable professional-role definition identifier.",
  ),
  categoryId: governanceIdentifierField(
    "Category containing the professional role.",
  ),
  key: governanceKeyField("Stable professional-role definition key."),
  displayName: displayNameField("Human-readable professional-role name."),
  description: descriptionField("Operator-facing professional-role description."),
  interfaceKeys: field
    .array(
      field
        .string()
        .required()
        .validator(isProfessionalInterfaceKey),
    )
    .optional()
    .min(1)
    .max(32)
    .version("1.0")
    .description(
      "Future non-security interfaces exposed by this professional role.",
    ),
  ...lifecycleFields,
};

export interface ProfessionalRoleDefinition
  extends ProfessionalLifecycleRecord {
  definitionId: string;
  categoryId: string;
  key: string;
  displayName: string;
  description: string;
  interfaceKeys?: string[];
  revision: number;
  lastMutationId: string;
  createdByAccountId: string;
}

function validateProfessionalRoleDefinition(
  definition: ProfessionalRoleDefinition,
): boolean {
  if (!validateProfessionalDefinitionLifecycle(definition)) {
    return false;
  }

  return (
    definition.interfaceKeys === undefined ||
    new Set(definition.interfaceKeys).size === definition.interfaceKeys.length
  );
}

export const professionalRoleDefinitionSchema = createSchema(
  professionalRoleDefinitionShape,
  "professionalRoleDefinition",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateProfessionalRoleDefinition,
  },
);

export const professionalRoleAssignmentShape = {
  assignmentId: governanceIdentifierField(
    "Stable professional-role assignment identifier.",
  ),
  definitionId: governanceIdentifierField(
    "Professional-role definition being assigned.",
  ),
  worldId: governanceIdentifierField("World containing the assignment."),
  characterId: accountIdentifierField(
    "Character receiving the professional role.",
  ).internal(),
  institutionId: governanceIdentifierField(
    "Institution governing the assignment.",
  ),
  groupId: optionalGovernanceIdentifierField(
    "Group governing the assignment when no institution exists.",
  ),

  authorityNamespace: field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description(
      "Non-security authority namespace owned by the professional domain.",
    )
    .validator(isProfessionalInterfaceKey),

  status: field
    .string()
    .required()
    .version("1.0")
    .description("Professional-role assignment lifecycle state.")
    .enum([...Object.values(ProfessionalRoleAssignmentStatus)]),

  source: field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description("Governed source that established the assignment.")
    .enum([...Object.values(ProfessionalRoleAssignmentSource)]),

  revision: revisionField(
    "Positive optimistic-concurrency revision for the assignment.",
  ),
  lastMutationId: mutationIdentifierField(
    "Idempotency identifier for the latest accepted assignment mutation.",
  ),
  effectiveFrom: timestampField("Time from which the role is effective."),
  effectiveUntil: optionalTimestampField(
    "Optional scheduled time after which the role is no longer effective.",
  ),
  assignedAt: timestampField("Time at which the assignment was recorded."),
  assignedByAccountId: internalAccountIdentifierField(
    "Authenticated account that recorded the assignment.",
  ),
  endedAt: optionalTimestampField("Time at which the assignment ended."),
  endedByAccountId: optionalInternalAccountIdentifierField(
    "Authenticated account that ended the assignment.",
  ),
  endReason: internalReasonField(
    "Protected operator reason for ending the assignment.",
    false,
  ),
};

export interface ProfessionalRoleAssignment {
  assignmentId: string;
  definitionId: string;
  worldId: string;
  characterId: string;
  institutionId: string;
  groupId?: string;
  authorityNamespace: string;
  status: ProfessionalRoleAssignmentStatus;
  source: ProfessionalRoleAssignmentSource;
  revision: number;
  lastMutationId: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  assignedAt: string;
  assignedByAccountId: string;
  endedAt?: string;
  endedByAccountId?: string;
  endReason?: string;
}

function validateProfessionalRoleAssignment(
  assignment: ProfessionalRoleAssignment,
): boolean {
  if (
    !isChronologicallyAtOrAfter(
      assignment.effectiveFrom,
      assignment.assignedAt,
    ) ||
    (assignment.effectiveUntil !== undefined &&
      !isChronologicallyAfter(
        assignment.effectiveUntil,
        assignment.effectiveFrom,
      ))
  ) {
    return false;
  }

  if (assignment.status === ProfessionalRoleAssignmentStatus.ACTIVE) {
    return (
      assignment.endedAt === undefined &&
      assignment.endedByAccountId === undefined &&
      assignment.endReason === undefined
    );
  }

  return (
    isCanonicalUtcTimestamp(assignment.endedAt) &&
    isOpaqueIdentifier(assignment.endedByAccountId) &&
    isPresentString(assignment.endReason) &&
    isChronologicallyAtOrAfter(
      assignment.endedAt,
      assignment.effectiveFrom,
    )
  );
}

export const professionalRoleAssignmentSchema = createSchema(
  professionalRoleAssignmentShape,
  "professionalRoleAssignment",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateProfessionalRoleAssignment,
  },
);
