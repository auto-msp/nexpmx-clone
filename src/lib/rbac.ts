/**
 * Authorization matrix (AUTHORIZATION.md).
 *
 * Roles: OWNER > ADMIN > MANAGER > MEMBER. CLIENT/GUEST exist in the enum for
 * the portal but the portal authenticates via portal token, not roles.
 *
 * Every mutation route checks `can()` server-side; the UI hides controls the
 * role cannot use, but UI hiding is never the enforcement point.
 */

export type Role = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";

export type Permission =
  | "org:manage"
  | "org:invite"
  | "client:read"
  | "client:write"
  | "client:delete"
  | "project:read"
  | "project:write"
  | "project:delete"
  | "invoice:read"
  | "invoice:write"
  | "decision:read"
  | "decision:write"
  | "document:read"
  | "document:write"
  | "task:write"
  | "automation:write"
  | "memory:write"
  | "comms:write";

const MATRIX: Record<Role, Permission[]> = {
  OWNER: [
    "org:manage",
    "org:invite",
    "client:write",
    "client:delete",
    "project:write",
    "project:delete",
    "invoice:write",
    "decision:write",
    "document:write",
    "task:write",
    "automation:write",
    "memory:write",
    "comms:write",
  ],
  ADMIN: [
    "org:invite",
    "client:write",
    "client:delete",
    "project:write",
    "project:delete",
    "invoice:write",
    "decision:write",
    "document:write",
    "task:write",
    "automation:write",
    "memory:write",
    "comms:write",
  ],
  MANAGER: [
    "client:write",
    "project:write",
    "invoice:write",
    "decision:write",
    "document:write",
    "task:write",
    "memory:write",
    "comms:write",
  ],
  MEMBER: ["project:write", "decision:write", "document:write", "task:write", "memory:write", "comms:write"],
};

export function can(role: string, permission: Permission): boolean {
  const list = MATRIX[role as Role];
  return Boolean(list?.includes(permission));
}

/** All read permissions are granted to any org member. */
export function canRead(role: string): boolean {
  return ["OWNER", "ADMIN", "MANAGER", "MEMBER"].includes(role);
}

export function requirePermission(role: string, permission: Permission): void {
  if (!can(role, permission)) {
    const err = new Error(`Role ${role} lacks ${permission}`) as Error & {
      status?: number;
    };
    err.status = 403;
    throw err;
  }
}
