# AUTHORIZATION

Model: **RBAC**, org-scoped. Roles are stored per-membership; every mutation
route calls `requirePermission()` server-side. UI hiding is a convenience,
never the enforcement point.

## Matrix

| Permission | OWNER | ADMIN | MANAGER | MEMBER |
| --- | :-: | :-: | :-: | :-: |
| org:manage (settings, plan) | ✅ | — | — | — |
| org:invite / mint API keys | ✅ | ✅ | — | — |
| client:write | ✅ | ✅ | ✅ | — |
| client:delete (archive) | ✅ | ✅ | — | — |
| project:write / task:write | ✅ | ✅ | ✅ | ✅ |
| project:delete | ✅ | ✅ | — | — |
| invoice:write | ✅ | ✅ | ✅ | — |
| decision:write | ✅ | ✅ | ✅ | ✅ |
| document:write | ✅ | ✅ | ✅ | ✅ |
| automation:write | ✅ | ✅ | — | — |
| read (all org data) | ✅ | ✅ | ✅ | ✅ |

`CLIENT` and `GUEST` roles exist in the enum but carry no permissions: the
client portal authenticates via portal **capability token**, not roles.

## IDOR / tenant isolation rules

1. Every query is scoped `where: { orgId }` from the server-derived context —
   the orgId is never read from client input.
2. Any client-supplied FK (clientId, projectId, invoiceId…) is re-verified to
   belong to the caller's org before use — see `createProject`, `createTask`,
   `createInvoice`, `transitionInvoice`.
3. API keys resolve to an org, then the same scoping applies.

## Entitlements (plan gating)

Enforced in the action layer, server-side:

- Active-client cap (Starter: 10) → error with upgrade hint.
- AI credits per cycle → HTTP 402 when exhausted.
- Seat/storage caps → enforced at invite/upload time (seats at invite time is
  pending — see KNOWN_LIMITATIONS.md).

See BUSINESS_RULES.md for rule IDs and evidence.
