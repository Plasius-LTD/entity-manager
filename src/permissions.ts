/**
 * Permission scopes shared by entity schemas and authorization consumers.
 *
 * This module is intentionally registration-free. Consumers that only need
 * the scope contract should import it from `@plasius/entity-manager/permissions`
 * so they do not initialize the entity schema graph.
 */
export enum Scope {
  READ = "read",
  WRITE = "write",
  DELETE = "delete",
  CREATE = "create",
  UPDATE = "update",
  EXECUTE = "execute",
  MANAGE = "manage",
  ADMIN = "admin",
  VIEW = "view",
  EDIT = "edit",
  SHARE = "share",
  DOWNLOAD = "download",
  UPLOAD = "upload",
  PUBLISH = "publish",
  SUBSCRIBE = "subscribe",
  UNPUBLISH = "unpublish",
  UNSUBSCRIBE = "unsubscribe",
  APPROVE = "approve",
  REJECT = "reject",
  ARCHIVE = "archive",
  RESTORE = "restore",
  DELETE_PERMANENTLY = "delete_permanently",
  LIST = "list",
}
