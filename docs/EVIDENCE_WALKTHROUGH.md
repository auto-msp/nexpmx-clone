# WALKTHROUGH — Capturing the authenticated surface (15–20 min)

You are the authorized trial account holder. This walkthrough turns your
session into structured evidence. **Rule of thumb: capture structure, never
credentials.** Do steps in order; skip nothing without saying so.

> Do this in a normal browser (Chrome/Edge/Firefox). Open DevTools (F12) only
> for step 6. Everything else is screenshots + copy-paste.

## Step 0 — Before you log in
- [ ] Note the exact login URL (e.g. `https://…/login`) and whether a
      "Continue with Google" button is the only option or there are others.

## Step 1 — Global navigation (the map)
- [ ] Log in; you should land on the dashboard/overview.
- [ ] Screenshot the full sidebar/menu with **every label visible** — do not
      crop. Mobile: open the hamburger once and screenshot it too.
- [ ] Type the label list as text in your notes, **in order**.

## Step 2 — Overview / dashboard
- [ ] Full-page screenshot, desktop (~1440px wide) and phone-width (~390px).
- [ ] Capture it **empty if possible** (new trial usually is) — note what the
      empty state shows.
- [ ] Copy the page URL from the address bar.

## Step 3 — Clients (or the first CRM-like module)
- [ ] List view screenshot (with URL).
- [ ] Open the "create" form: screenshot it **and** list every field label +
      which are required.
- [ ] Create one test client ("Test Client A") — this enables later steps.

## Step 4 — Projects / tasks
- [ ] Board or list screenshot (with URL).
- [ ] Create one project under Test Client A; note the fields offered.
- [ ] Add one task; note the status columns/labels.

## Step 5 — Invoices
- [ ] Create-invoice form screenshot (all fields, incl. any GST/UPI fields).
- [ ] List view; note the status labels shown (Draft/Sent/Paid/Overdue?).
- [ ] If there is a number-format pattern (e.g. INV-001), note it.

## Step 6 — One network capture (the API map)
- [ ] Open DevTools → **Network** tab → check "Preserve log".
- [ ] Perform **one** write action (create a client or task).
- [ ] Find the request that appeared (usually the last POST). Note:
      method, URL path, and the JSON request/response shapes (right-click →
      Copy → Copy response). **Do not copy any headers.**
- [ ] Optional but valuable: export the full HAR
      (⬇ icon → Export HAR). Then run our redactor before sharing:

      python3 scripts/redact_har.py capture.har capture.redacted.har

      Only share the `.redacted.har` file. It has all cookies/tokens stripped
      and verified.

## Step 7 — AI assistant
- [ ] Ask one question about the test client you created.
- [ ] Screenshot the answer layout **and** where the credit usage is shown.

## Step 8 — Client Portal (admin side)
- [ ] Screenshot the portal config/invite screen; how is the client link
      generated (button? copyable URL? email)?

## Step 9 — Settings / Billing / Team
- [ ] Every tab screenshot: profile, team/invites, billing, API keys.
- [ ] Note exactly how the **14-day trial** is displayed (banner? countdown?
      days-left chip?) and what happens on the billing page mid-trial.

## Step 10 — Anything else you notice
- [ ] Onboarding wizard, notifications, search bar, help/KB, mobile app
      prompts — screenshot whatever appears; we'll classify it.

## Delivery
Put everything in a folder (screenshots named `NN-page-state.png`, plus your
notes and the redacted HAR) and share it here. Captures stay **out of git**
(they contain product content) — they get recorded as structured findings in
the evidence register instead.
