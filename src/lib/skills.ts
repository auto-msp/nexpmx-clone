/**
 * AI Skills Library catalog.
 *
 * PROVENANCE (screenshot evidence): a two-tab library — "Ready-made skills"
 * and "Your skills" — with category chips (Client management, Delivery,
 * Finance, Operations, Writing, Sales), skill cards carrying title, one-line
 * description, a "Taught to <employees>" line and a "Preview instructions"
 * expander. Structural facts mirrored; every instruction body is original.
 */

import { AI_EMPLOYEES } from "./ai-team";

export type SkillCategory =
  | "CLIENT_MANAGEMENT"
  | "DELIVERY"
  | "FINANCE"
  | "OPERATIONS"
  | "WRITING"
  | "SALES";

export interface SkillDefinition {
  id: string;
  category: SkillCategory;
  title: string;
  description: string;
  /** Employee keys the skill is taught to by default. */
  taughtTo: string[];
  /** Original instruction body shown in "Preview instructions". */
  instructions: string;
}

export const SKILL_CATEGORIES: Array<{
  id: SkillCategory;
  label: string;
}> = [
  { id: "CLIENT_MANAGEMENT", label: "Client management" },
  { id: "DELIVERY", label: "Delivery" },
  { id: "FINANCE", label: "Finance" },
  { id: "OPERATIONS", label: "Operations" },
  { id: "WRITING", label: "Writing" },
  { id: "SALES", label: "Sales" },
];

export function categoryLabel(id: string): string {
  return SKILL_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const READY_SKILLS: SkillDefinition[] = [
  // ── Client management ──────────────────────────────────────────────────
  {
    id: "client-onboarding",
    category: "CLIENT_MANAGEMENT",
    title: "Client onboarding checklist",
    description: "The standard sequence for taking on a new client.",
    taughtTo: ["maya", "leo"],
    instructions: [
      "1. Confirm the signed proposal and collect contacts.",
      "2. Send the welcome note with access requests.",
      "3. Book the kick-off call and share the agenda.",
      "4. Open the project with a kick-off checklist task.",
      "5. Log the onboarding decision in the memory.",
    ].join("\n"),
  },
  {
    id: "weekly-client-update",
    category: "CLIENT_MANAGEMENT",
    title: "Weekly client update format",
    description: "How every weekly written update should be structured.",
    taughtTo: ["leo", "aria"],
    instructions: [
      "Subject: <Client> — week of <date>",
      "1) Shipped this week (bullets).",
      "2) Up next (bullets).",
      "3) Risks or blockers, each with an owner.",
      "4) Anything we need from the client.",
      "Keep it under 200 words; link documents, never paste contents.",
    ].join("\n"),
  },
  {
    id: "raising-a-problem",
    category: "CLIENT_MANAGEMENT",
    title: "Raising a problem with a client",
    description: "How to deliver bad news — a delay, an overrun, a mistake.",
    taughtTo: ["leo", "aria"],
    instructions: [
      "Lead with the impact, then the cause, then the plan.",
      "State the new date or number plainly — no hedging.",
      "Name the owner of the fix.",
      "Offer the compensation or gesture if policy allows.",
      "Log the decision so the memory reflects reality.",
    ].join("\n"),
  },
  {
    id: "qbr-prep",
    category: "CLIENT_MANAGEMENT",
    title: "Quarterly business review prep",
    description: "What goes into a QBR and in what order.",
    taughtTo: ["leo"],
    instructions: [
      "1. Wins and shipped work since last QBR.",
      "2. Numbers: spend, utilisation, NPS or CSAT.",
      "3. Risks and open decisions.",
      "4. Roadmap for the next quarter.",
      "Draft the deck from the memory, not from recollection.",
    ].join("\n"),
  },
  {
    id: "client-offboarding",
    category: "CLIENT_MANAGEMENT",
    title: "Client offboarding",
    description: "Closing a relationship cleanly.",
    taughtTo: ["maya", "leo"],
    instructions: [
      "Confirm final invoice is paid before the handover.",
      "Deliver the handover pack: files, credentials, contacts.",
      "Archive the client and log the end date.",
      "Send a short closing note and ask for a reference.",
    ].join("\n"),
  },

  // ── Delivery ───────────────────────────────────────────────────────────
  {
    id: "breaking-scope-into-tasks",
    category: "DELIVERY",
    title: "Breaking scope into tasks",
    description: "How to turn a signed scope into a real task list.",
    taughtTo: ["aria"],
    instructions: [
      "Start from the deliverables, not the meetings.",
      "Split until a task is under two days of work.",
      "Each task gets one owner and one definition of done.",
      "Attach the milestone the task closes.",
    ].join("\n"),
  },
  {
    id: "project-status-report",
    category: "DELIVERY",
    title: "Project status report",
    description: "The internal weekly project health write-up.",
    taughtTo: ["aria"],
    instructions: [
      "RAG status with one line of justification.",
      "Milestones: done / next / at-risk.",
      "Budget: burn vs plan, flag over 80%.",
      "Blockers with owners and due dates.",
    ].join("\n"),
  },
  {
    id: "estimating-work",
    category: "DELIVERY",
    title: "Estimating work",
    description: "How to size a piece of work honestly.",
    taughtTo: ["aria", "maya"],
    instructions: [
      "Estimate from the task list, never from the budget.",
      "Give a range: best case, expected, worst case.",
      "State the assumptions the range depends on.",
      "Flag anything outside your control as a risk, not padding.",
    ].join("\n"),
  },
  {
    id: "risk-register",
    category: "DELIVERY",
    title: "Keeping a risk register",
    description: "Identifying and tracking what could go wrong.",
    taughtTo: ["aria"],
    instructions: [
      "One line per risk: what could happen, likelihood, impact.",
      "Every risk gets an owner and a next review date.",
      "Closed risks stay in the register with their outcome.",
    ].join("\n"),
  },
  {
    id: "writing-a-handover",
    category: "DELIVERY",
    title: "Writing a handover",
    description: "Passing work to someone else without losing context.",
    taughtTo: ["aria", "maya"],
    instructions: [
      "State the goal in one sentence.",
      "List what is done, what is open, and where things live.",
      "Name the contacts and the decision history to read.",
      "End with the immediate next action.",
    ].join("\n"),
  },
  {
    id: "running-a-retro",
    category: "DELIVERY",
    title: "Running a retrospective",
    description: "Capturing lessons at the end of a phase.",
    taughtTo: ["aria", "maya"],
    instructions: [
      "Three lists: keep doing, stop doing, start doing.",
      "Every item gets an owner or is explicitly dropped.",
      "Log the lessons as memory facts so the next phase sees them.",
    ].join("\n"),
  },

  // ── Finance ────────────────────────────────────────────────────────────
  {
    id: "drafting-an-invoice",
    category: "FINANCE",
    title: "Drafting an invoice",
    description: "House rules for invoice line items and wording.",
    taughtTo: ["vikram"],
    instructions: [
      "One line per deliverable, never per hour worked unless agreed.",
      "Reference the milestone or proposal clause in the description.",
      "Check tax fields against the org GST settings before sending.",
      "Set the due date by policy: 15 days unless the client is net-30.",
    ].join("\n"),
  },
  {
    id: "chasing-overdue",
    category: "FINANCE",
    title: "Chasing an overdue payment",
    description: "The escalation ladder for late invoices.",
    taughtTo: ["vikram"],
    instructions: [
      "Day 1 overdue: polite reminder to the billing contact.",
      "Day 7: founder-to-founder nudge with the invoice attached.",
      "Day 14: pause new work notice, in writing.",
      "Day 30: escalate to formal collection.",
      "Log every touch in Comms.",
    ].join("\n"),
  },
  {
    id: "receivables-summary",
    category: "FINANCE",
    title: "Receivables summary",
    description: "How to summarise what is owed.",
    taughtTo: ["vikram"],
    instructions: [
      "Group by client: current, 1–15, 16–30, 30+ days.",
      "Flag the three largest exposures by name.",
      "End with the actions already taken and the next escalation date.",
    ].join("\n"),
  },
  {
    id: "expense-approval-rules",
    category: "FINANCE",
    title: "Expense approval rules",
    description: "What can be expensed and what needs sign-off.",
    taughtTo: ["vikram", "maya"],
    instructions: [
      "Under the per-item limit: auto-approve with a receipt.",
      "Above it, or recurring: founder sign-off first.",
      "Client-billable costs need the client's written okay before spend.",
    ].join("\n"),
  },
  {
    id: "project-margin",
    category: "FINANCE",
    title: "Checking project margin",
    description: "Working out whether a project is actually profitable.",
    taughtTo: ["vikram"],
    instructions: [
      "Margin = (invoiced − direct costs − labour at loaded rate) / invoiced.",
      "Recompute at every milestone, not at the end.",
      "Below the floor: raise it the same week, in writing.",
    ].join("\n"),
  },

  // ── Operations ─────────────────────────────────────────────────────────
  {
    id: "writing-an-sop",
    category: "OPERATIONS",
    title: "Writing an SOP",
    description: "The house format for process documents.",
    taughtTo: ["maya"],
    instructions: [
      "Title as a verb phrase. Purpose in one line.",
      "Numbered steps, one action per step.",
      "Call out decision points explicitly.",
      "End with the failure modes and who to ask.",
    ].join("\n"),
  },
  {
    id: "resourcing-decisions",
    category: "OPERATIONS",
    title: "Resourcing decisions",
    description: "How to allocate people across projects.",
    taughtTo: ["maya", "aria"],
    instructions: [
      "Capacity first: commitments before new work.",
      "Protect one focus block per person per day.",
      "Every allocation decision is logged with its reason.",
    ].join("\n"),
  },
  {
    id: "meeting-notes-format",
    category: "OPERATIONS",
    title: "Meeting notes format",
    description: "What to capture and what to leave out.",
    taughtTo: ["maya", "sage"],
    instructions: [
      "Decisions first, owners next, open questions last.",
      "No transcript — capture what changes the future.",
      "Post notes within one working day.",
    ].join("\n"),
  },
  {
    id: "evaluating-a-tool",
    category: "OPERATIONS",
    title: "Evaluating a new tool",
    description: "Before buying software.",
    taughtTo: ["maya"],
    instructions: [
      "Write the problem before the shortlist.",
      "Trial the top two with real work.",
      "Total cost includes migration and training.",
      "Decide in writing; log it in the memory.",
    ].join("\n"),
  },
  {
    id: "role-brief",
    category: "OPERATIONS",
    title: "Writing a role brief",
    description: "Defining a role before recruiting.",
    taughtTo: ["maya"],
    instructions: [
      "Start from outcomes for the first 90 days.",
      "Skills are the minimum; behaviours are the differentiators.",
      "Get founder sign-off before the posting goes out.",
    ].join("\n"),
  },

  // ── Writing ────────────────────────────────────────────────────────────
  {
    id: "house-writing-style",
    category: "WRITING",
    title: "House writing style",
    description: "How everything we write should sound.",
    taughtTo: ["aria", "vikram", "maya", "leo", "sage"],
    instructions: [
      "Plain sentences. Active voice. No filler openers.",
      "Lead with the point; context follows.",
      "Numbers get units and a comparison when useful.",
    ].join("\n"),
  },
  {
    id: "proposal-introductions",
    category: "WRITING",
    title: "Proposal introductions",
    description: "How to open a proposal.",
    taughtTo: ["sage", "leo"],
    instructions: [
      "Open with the client's outcome, not our bio.",
      "Restate the problem in their words.",
      "Keep the intro under 120 words.",
    ].join("\n"),
  },
  {
    id: "replying-to-client-email",
    category: "WRITING",
    title: "Replying to client email",
    description: "Response standards.",
    taughtTo: ["leo"],
    instructions: [
      "Acknowledge within one working day, even if the answer is later.",
      "Answer the question asked, then add the next step.",
      "If a date is involved, repeat it back explicitly.",
    ].join("\n"),
  },
  {
    id: "writing-a-case-study",
    category: "WRITING",
    title: "Writing a case study",
    description: "Turning a project into a credible story.",
    taughtTo: ["sage"],
    instructions: [
      "Structure: situation, approach, measurable outcome.",
      "One number beats three adjectives.",
      "Client approval before publishing, always.",
    ].join("\n"),
  },
  {
    id: "summarising-a-thread",
    category: "WRITING",
    title: "Summarising a long thread",
    description: "Condensing a discussion to what matters.",
    taughtTo: ["sage"],
    instructions: [
      "One-paragraph summary, then decisions, then open items.",
      "Quote dates and owners verbatim.",
      "Link, never restate, the source thread.",
    ].join("\n"),
  },

  // ── Sales ──────────────────────────────────────────────────────────────
  {
    id: "discovery-call-structure",
    category: "SALES",
    title: "Discovery call structure",
    description: "What to ask on a first call.",
    taughtTo: ["leo", "sage"],
    instructions: [
      "5 min context, 20 min problem, 10 min outcomes, 10 min next step.",
      "Ask for numbers: budget range, deadline, who decides.",
      "Never pitch before the problem is confirmed.",
    ].join("\n"),
  },
  {
    id: "presenting-price",
    category: "SALES",
    title: "Presenting price",
    description: "How to frame cost in a proposal.",
    taughtTo: ["sage", "vikram"],
    instructions: [
      "Tie the number to the outcome, state it plainly, then stop talking.",
      "Give one recommended option and at most two alternatives.",
      "Payment terms match the milestone plan.",
    ].join("\n"),
  },
  {
    id: "handling-objections",
    category: "SALES",
    title: "Handling common objections",
    description: "Responding to price, timing and trust concerns.",
    taughtTo: ["leo"],
    instructions: [
      "Price: return to the outcome and the cost of the problem.",
      "Timing: offer a smaller first milestone with a hard date.",
      "Trust: references, case studies, and a trial scope.",
    ].join("\n"),
  },
  {
    id: "follow-up-after-pitch",
    category: "SALES",
    title: "Follow-up after a pitch",
    description: "Staying in touch without pestering.",
    taughtTo: ["leo"],
    instructions: [
      "Same day: thanks + what was agreed.",
      "Day 3: answer open questions.",
      "Day 7: a decision nudge with a clean yes/no ask.",
      "Close the loop either way; log the outcome.",
    ].join("\n"),
  },
];

export function skillOf(id: string): SkillDefinition | null {
  return READY_SKILLS.find((s) => s.id === id) ?? null;
}

/** "Taught to Aria, Leo" line from employee keys. */
export function taughtToLine(keys: string[]): string {
  const names = keys
    .map((k) => AI_EMPLOYEES.find((e) => e.key === k)?.name ?? k)
    .map((n) => n.charAt(0).toUpperCase() + n.slice(1));
  return names.length ? `Taught to ${names.join(", ")}` : "Taught to nobody yet";
}
