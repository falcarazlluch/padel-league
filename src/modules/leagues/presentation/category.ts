// Re-export category UI helpers and constants for use by the app layer
// (client and server components). Importing from here — instead of
// `@/modules/leagues` — keeps Prisma/Node-only code out of the client bundle.
export {
  CATEGORY_VALUES,
  CATEGORY_LABEL,
  categoryBadgeClass,
} from '../domain/category';
