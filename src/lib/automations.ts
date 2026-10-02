/**
 * Automation catalog + pure dispatcher.
 *
 * PROVENANCE (screenshot evidence): a ready-to-use library of trigger→action
 * recipes grouped Money / Delivery / Client care / Team, each expressed as
 * "event → effects" (notify founders, notify client, create a task), plus a
 * custom builder with trigger select, action checkboxes, message/task title
 * and a watch scope (Everything / One client / One project). All copy here is
 * original; only the structural facts (trigger types, effect types, scopes)
 * are mirrored.
 *
 * Dispatch is PURE here (matchAutomations) so it is unit-testable; the
 * side-effectful runner lives in src/app/actions/automations.ts.
 */

export type AutomationTrigger =
  | "invoice.paid"
  | "proposal.signed"
  | "project.created"
  | "milestone.completed"
  | "task.completed";

export type AutomationEffect =
  | "notify_founders"
  | "notify_client"
  | "create_task";

export interface AutomationRecipe {
  id: string;
  group: "MONEY" | "DELIVERY" | "CLIENT_CARE" | "TEAM";
  title: string;
  description: string;
  trigger: AutomationTrigger;
  effects: AutomationEffect[];
  taskTitle?: string;
}

export const AUTOMATION_RECIPES: AutomationRecipe[] = [
  // ── Money ──────────────────────────────────────────────────────────────
  {
    id: "money-notify-payment",
    group: "MONEY",
    title: "Tell the team when a payment lands",
    description: "Founders get a notification the moment an invoice is marked paid.",
    trigger: "invoice.paid",
    effects: ["notify_founders"],
  },
  {
    id: "money-thank-client",
    group: "MONEY",
    title: "Thank the client for paying",
    description: "Sends the client a short acknowledgement as soon as their payment is recorded.",
    trigger: "invoice.paid",
    effects: ["notify_client"],
  },
  {
    id: "money-bookkeeping-task",
    group: "MONEY",
    title: "Log a bookkeeping task on payment",
    description: "Creates a reconcile-this-payment task so it reaches your books.",
    trigger: "invoice.paid",
    effects: ["create_task"],
    taskTitle: "Reconcile payment",
  },
  {
    id: "money-full-payment-routine",
    group: "MONEY",
    title: "Full payment routine",
    description: "Notifies the team, thanks the client, and creates the reconciliation task.",
    trigger: "invoice.paid",
    effects: ["notify_founders", "notify_client", "create_task"],
    taskTitle: "Reconcile payment",
  },
  {
    id: "money-upsell-prompt",
    group: "MONEY",
    title: "Prompt an upsell conversation after payment",
    description: "A paid invoice is a good moment to talk about what's next — this creates that reminder.",
    trigger: "invoice.paid",
    effects: ["create_task"],
    taskTitle: "Upsell conversation",
  },
  {
    id: "money-first-invoice-on-sign",
    group: "MONEY",
    title: "Raise the first invoice when a proposal is signed",
    description: "Creates a task to issue the deposit or first invoice as soon as the ink is dry.",
    trigger: "proposal.signed",
    effects: ["create_task"],
    taskTitle: "Raise the first invoice",
  },

  // ── Delivery ───────────────────────────────────────────────────────────
  {
    id: "delivery-kickoff-checklist",
    group: "DELIVERY",
    title: "Kick-off checklist on a new project",
    description: "Creates the kick-off task whenever a project is created, so nothing starts cold.",
    trigger: "project.created",
    effects: ["create_task"],
    taskTitle: "Run the kick-off checklist",
  },
  {
    id: "delivery-announce-project",
    group: "DELIVERY",
    title: "Announce new projects to founders",
    description: "Founders are notified whenever a project is opened.",
    trigger: "project.created",
    effects: ["notify_founders"],
  },
  {
    id: "delivery-schedule-plan",
    group: "DELIVERY",
    title: "Schedule the plan for a new project",
    description: "Creates a task to lay out milestones and dates before work begins.",
    trigger: "project.created",
    effects: ["create_task"],
    taskTitle: "Draft the delivery plan",
  },
  {
    id: "delivery-celebrate-milestone",
    group: "DELIVERY",
    title: "Celebrate milestones internally",
    description: "Founders hear about every milestone that completes.",
    trigger: "milestone.completed",
    effects: ["notify_founders"],
  },
  {
    id: "delivery-client-milestone-note",
    group: "DELIVERY",
    title: "Tell the client when a milestone completes",
    description: "Keeps clients informed of progress without anyone remembering to write in.",
    trigger: "milestone.completed",
    effects: ["notify_client"],
  },
  {
    id: "delivery-next-phase",
    group: "DELIVERY",
    title: "Open the next phase after a milestone",
    description: "Creates a task to plan what follows, so momentum isn't lost between phases.",
    trigger: "milestone.completed",
    effects: ["create_task"],
    taskTitle: "Plan the next phase",
  },
  {
    id: "delivery-invoice-milestone",
    group: "DELIVERY",
    title: "Invoice on milestone completion",
    description: "For milestone-billed projects: creates the task to raise that stage's invoice.",
    trigger: "milestone.completed",
    effects: ["create_task"],
    taskTitle: "Raise the stage invoice",
  },
  {
    id: "delivery-full-milestone-routine",
    group: "DELIVERY",
    title: "Full milestone routine",
    description: "Notifies the team, updates the client, and queues the next phase.",
    trigger: "milestone.completed",
    effects: ["notify_founders", "notify_client", "create_task"],
    taskTitle: "Plan the next phase",
  },
  {
    id: "delivery-qa-pass",
    group: "DELIVERY",
    title: "QA pass on completed work",
    description: "Every completed task spawns a review task, so nothing ships unchecked.",
    trigger: "task.completed",
    effects: ["create_task"],
    taskTitle: "QA review",
  },
  {
    id: "delivery-notify-task-done",
    group: "DELIVERY",
    title: "Notify founders on task completion",
    description: "Useful on small teams where founders want to see work land in real time.",
    trigger: "task.completed",
    effects: ["notify_founders"],
  },
  {
    id: "delivery-log-time-nudge",
    group: "DELIVERY",
    title: "Remind to log time when a task closes",
    description: "Creates a nudge to record hours while the work is still fresh.",
    trigger: "task.completed",
    effects: ["create_task"],
    taskTitle: "Log time for this task",
  },

  // ── Client care ────────────────────────────────────────────────────────
  {
    id: "care-welcome-after-sign",
    group: "CLIENT_CARE",
    title: "Welcome the client after signing",
    description: "Sends a welcome note the moment a proposal is signed.",
    trigger: "proposal.signed",
    effects: ["notify_client"],
  },
  {
    id: "care-start-onboarding",
    group: "CLIENT_CARE",
    title: "Start onboarding when a proposal is signed",
    description: "Creates the onboarding task: access, contacts, kick-off call.",
    trigger: "proposal.signed",
    effects: ["create_task"],
    taskTitle: "Start onboarding",
  },
  {
    id: "care-sign-announce",
    group: "CLIENT_CARE",
    title: "Tell founders a proposal was signed",
    description: "The win reaches founders immediately.",
    trigger: "proposal.signed",
    effects: ["notify_founders"],
  },
  {
    id: "care-full-signing-routine",
    group: "CLIENT_CARE",
    title: "Full signing routine",
    description: "Notifies founders, welcomes the client, opens onboarding, and queues the first invoice.",
    trigger: "proposal.signed",
    effects: ["notify_founders", "notify_client", "create_task"],
    taskTitle: "Start onboarding",
  },
  {
    id: "care-introduce-project",
    group: "CLIENT_CARE",
    title: "Introduce the project to the client",
    description: "Lets the client know their project is open and who is on it.",
    trigger: "project.created",
    effects: ["notify_client"],
  },
  {
    id: "care-checkin-after-payment",
    group: "CLIENT_CARE",
    title: "Schedule a check-in after payment",
    description: "Creates a task to check in a little after the invoice clears.",
    trigger: "invoice.paid",
    effects: ["create_task"],
    taskTitle: "Client check-in",
  },

  // ── Team ───────────────────────────────────────────────────────────────
  {
    id: "team-resource-project",
    group: "TEAM",
    title: "Resource a new project",
    description: "Creates a task to assign owners and check capacity before work starts.",
    trigger: "project.created",
    effects: ["create_task"],
    taskTitle: "Resource the project",
  },
  {
    id: "team-milestone-retro",
    group: "TEAM",
    title: "Short retro after each milestone",
    description: "Creates a retro task so lessons get captured while they're fresh.",
    trigger: "milestone.completed",
    effects: ["create_task"],
    taskTitle: "Milestone retro",
  },
  {
    id: "team-handover-note",
    group: "TEAM",
    title: "Handover note on completion",
    description: "Prompts a short handover so the next person isn't guessing.",
    trigger: "task.completed",
    effects: ["create_task"],
    taskTitle: "Write the handover note",
  },
];

export const AUTOMATION_GROUPS = [
  "MONEY",
  "DELIVERY",
  "CLIENT_CARE",
  "TEAM",
] as const;

export function recipeOf(id: string): AutomationRecipe | null {
  return AUTOMATION_RECIPES.find((r) => r.id === id) ?? null;
}

// ── Pure dispatch core ───────────────────────────────────────────────────────

export interface AutomationRecord {
  id: string;
  enabled: boolean;
  trigger: string;
  notifyFounders: boolean;
  notifyClient: boolean;
  createTask: boolean;
  taskTitle: string | null;
  watchScope: string; // ALL | CLIENT | PROJECT
  watchClientId: string | null;
  watchProjectId: string | null;
}

export interface AutomationEvent {
  trigger: AutomationTrigger;
  orgId: string;
  clientId?: string | null;
  projectId?: string | null;
  /** Snapshot of the subject entity used for message/task context. */
  subjectTitle: string;
}

export interface AutomationEffectPlan {
  automationId: string;
  effects: AutomationEffect[];
  taskTitle: string | null;
  event: AutomationEvent;
}

/**
 * Decide which enabled automations fire for an event and what they do.
 * Pure: no I/O, no Date.now, fully deterministic — unit-tested.
 */
export function matchAutomations(
  automations: AutomationRecord[],
  event: AutomationEvent,
): AutomationEffectPlan[] {
  return automations
    .filter((a) => a.enabled && a.trigger === event.trigger)
    .filter((a) => {
      if (a.watchScope === "CLIENT") return a.watchClientId && a.watchClientId === event.clientId;
      if (a.watchScope === "PROJECT") return a.watchProjectId && a.watchProjectId === event.projectId;
      return true; // ALL
    })
    .map((a) => {
      const effects: AutomationEffect[] = [];
      if (a.notifyFounders) effects.push("notify_founders");
      if (a.notifyClient) effects.push("notify_client");
      if (a.createTask) effects.push("create_task");
      return {
        automationId: a.id,
        effects,
        taskTitle: a.taskTitle,
        event,
      };
    })
    .filter((plan) => plan.effects.length > 0);
}

export const TRIGGER_OPTIONS: Array<{ value: AutomationTrigger; label: string }> = [
  { value: "invoice.paid", label: "When an invoice is paid" },
  { value: "proposal.signed", label: "When a proposal is signed" },
  { value: "project.created", label: "When a project is created" },
  { value: "milestone.completed", label: "When a milestone completes" },
  { value: "task.completed", label: "When a task completes" },
];
