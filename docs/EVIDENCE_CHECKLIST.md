# EVIDENCE INTAKE CHECKLIST (authorized account holder)

Purpose: close the Confidence-D areas (authenticated surface) using evidence
collected legitimately by the authorized trial account holder.

**Ground rules that never change:**

- The agent never logs in, never receives credentials, cookies, tokens, or
  session exports. Unredacted HARs containing `cookie` / `authorization` /
  `set-cookie` headers will be **rejected**, not used.
- Captures are used to extract **information architecture, flows, fields, and
  states**. Implemented screens carry original copy and original branding —
  structure is replicated, expression is not.
- Minimize traffic and captures: one pass, cached locally, no re-crawling.

## Capture list

- [ ] 1. Global navigation — sidebar/menu labels in exact order (desktop + mobile)
- [ ] 2. `/overview` — full-page screenshots, desktop (~1440px) and mobile (~390px), empty + populated states
- [ ] 3. Clients — list view and create/edit form (include URL bar)
- [ ] 4. Projects — board/list and create form (include URL bar)
- [ ] 5. Invoices — create form, list, status actions (include URL bar)
- [ ] 6. AI assistant — question + answer layout, credits meter (include URL bar)
- [ ] 7. Client Portal — admin-side config screen (include URL bar)
- [ ] 8. Settings / Billing / Team — all tabs, plan and trial status displays
- [ ] 9. Network evidence — DevTools → Network → export HAR for one create/invoice/AI action, then **delete cookie, authorization, set-cookie, and any token headers before sharing**
- [ ] 10. Transactional emails (trial welcome, invites, invoice notices) — body text with personal data redacted
- [ ] 11. Trial lifecycle — what the UI shows about the 14-day trial (banner, countdown, gate on expiry)

## How each item is used

| Item | Updates |
| --- | --- |
| 1 | `docs/SITEMAP.md` route inventory, app nav component |
| 2 | Dashboard page model, empty/populated states |
| 3–5 | Entity field lists (`docs/DATABASE.md`), form components, business rules (`docs/BUSINESS_RULES.md`) |
| 6 | AI context/answer contract, credit metering rules |
| 7 | Portal admin surface |
| 8 | Entitlement/trial model (`docs/ASSUMPTIONS.md` §8) |
| 9 | `docs/API.md` endpoint inventory with OBSERVED grades |
| 10 | Email/notification model |
| 11 | Subscription state machine (TRIALING state) |

## Processing protocol

1. Record capture → extract IA/fields/states → grade each finding
   A (observed) / B (inferred) / C (assumed) in the evidence register.
2. Implement equivalent screens (original copy/branding).
3. Re-run tests + smoke; update differential table.
4. Mark captured checklist items done; store captures outside git
   (they contain product content and must never be committed).
