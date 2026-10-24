export type GuideCategoryId = "start" | "clients" | "projects" | "proposals" | "finance" | "ai" | "memory" | "settings";

export interface GuideArticle {
  id: string;
  category: GuideCategoryId;
  title: string;
  summary: string;
  steps: string[];
  tip?: string;
  link?: { href: string; label: string };
}

export const GUIDE_CATEGORIES: Array<{ id: GuideCategoryId; label: string; blurb: string; icon: string }> = [
  { id: "start", label: "Getting started", blurb: "Find your way around and build a daily rhythm.", icon: "sparkle" },
  { id: "clients", label: "Clients", blurb: "Keep every account, contact and follow-up in one place.", icon: "users" },
  { id: "projects", label: "Projects", blurb: "Scope work, break it down and keep delivery on track.", icon: "folder" },
  { id: "proposals", label: "Proposals", blurb: "Draft, send and follow up on what you are selling.", icon: "file" },
  { id: "finance", label: "Finance", blurb: "Invoices with GST, payments, expenses and reports.", icon: "rupee" },
  { id: "ai", label: "AI team", blurb: "Delegate to AI teammates and automate the routine.", icon: "zap" },
  { id: "memory", label: "Memory", blurb: "Teach the workspace how your business actually works.", icon: "brain" },
  { id: "settings", label: "Settings", blurb: "People, company details, plan and notifications.", icon: "panel" },
];

export const GUIDE_ARTICLES: GuideArticle[] = [
  /* ── Getting started ── */
  {
    id: "tour",
    category: "start",
    title: "A quick tour of the workspace",
    summary: "What the rail, the side panel, the top bar and the AI button are for.",
    steps: [
      "The narrow rail on the left lists the main areas: Home, Clients, Projects, Proposals, Finance, Comms, AI, CIO, Memory, Docs, Sheets and Setup. Click one to switch area.",
      "The panel beside the rail shows the pages inside the current area, plus short lists that matter right now, such as invoices awaiting payment or proposals out for signature.",
      "The top bar shows where you are, a search box (Ctrl K), a light / dark switch and your account menu.",
      "The round sparkle button at the bottom right opens the AI assistant from any page, so you can ask a question without leaving what you are doing.",
    ],
    tip: "The side panel can be collapsed when you need more room for tables and calendars.",
    link: { href: "/dashboard", label: "Open the command center" },
  },
  {
    id: "first-week",
    category: "start",
    title: "Set up your workspace in an afternoon",
    summary: "The shortest path from an empty account to something useful.",
    steps: [
      "Open Setup, then Settings, and fill in your company name, address and GST details so invoices carry the right information.",
      "Invite teammates from Team directory and give each person a role that matches what they should be able to change.",
      "Add your first real client, then a project for them. Two or three tasks are enough to make the dashboard come alive.",
      "Open Memory and answer a handful of questions. The more the workspace knows about how you decide and deliver, the better the AI answers become.",
    ],
    link: { href: "/settings", label: "Go to Settings" },
  },
  {
    id: "daily-rhythm",
    category: "start",
    title: "Run your day from the command center",
    summary: "A five-minute morning routine that keeps nothing from slipping.",
    steps: [
      "Start on Home. The greeting line tells you how many things need attention today.",
      "Work through the attention queue top to bottom: overdue invoices, proposals waiting for a signature, tasks with no owner or past their date, and open memory questions.",
      "Check the task tile for what is due this week and open Tasks to reorder your own list.",
      "Glance at Notifications for anything that changed overnight, then close the day by ticking off what you finished.",
    ],
    link: { href: "/tasks", label: "Open your tasks" },
  },
  {
    id: "goals-calendar",
    category: "start",
    title: "Plan the week with Goals and the Calendar",
    summary: "Turn intentions into numbers, and see every date that matters in one view.",
    steps: [
      "In Goals, pick a period (daily, weekly, monthly or quarterly) and add a goal with a target, for example “10 discovery calls”. Use the plus and minus buttons, or Set value, to record progress.",
      "In Calendar, add meetings, follow-ups and time off with New event. Switch between month, week, day, agenda and year views from the top right.",
      "Task due dates, invoice due dates and project deadlines are overlaid automatically. Use the legend above the grid to hide any of them.",
      "Click an event to see its details, edit it or delete it. Overlay items link to the page they come from.",
    ],
    link: { href: "/calendar", label: "Open the calendar" },
  },
  {
    id: "search-shortcuts",
    category: "start",
    title: "Jump anywhere with quick search",
    summary: "Press Ctrl K (Cmd K on a Mac) to go to any page without clicking through menus.",
    steps: [
      "Press Ctrl K from anywhere in the workspace.",
      "Type a few letters of the page you want, for example “invoices” or “memory import”.",
      "Press Enter to open the first result, or use the arrow keys to pick another. Press Ctrl K again or Escape to close the box.",
    ],
  },

  /* ── Clients ── */
  {
    id: "add-client",
    category: "clients",
    title: "Add a client",
    summary: "Capture the details you will need later for invoicing and follow-ups.",
    steps: [
      "Open Clients and choose New client.",
      "Enter a name and, if relevant, the company, email and phone. Add the GSTIN and billing address now if you will invoice them, so you do not have to come back.",
      "Set their payment terms in days. New invoices use this to suggest a due date.",
      "Save. The client page opens with tabs for overview, projects, financials, documents, messages and portal access.",
    ],
    link: { href: "/clients", label: "Go to Clients" },
  },
  {
    id: "client-health",
    category: "clients",
    title: "Track client health and follow-ups",
    summary: "Mark accounts as healthy, on watch or at risk, and never forget the next call.",
    steps: [
      "Open a client and edit the profile. Choose Healthy, Watch or At risk to reflect how the relationship feels right now.",
      "Set a next follow-up date. Accounts that need attention rise to the top of the side panel.",
      "Log calls, meetings and emails from Comms so the history is there when you or a teammate need it.",
      "Review at-risk clients weekly and decide on one concrete action for each.",
    ],
    tip: "Health is a judgement call by design. A short note on why you changed it is worth more than the label.",
  },
  {
    id: "client-portal",
    category: "clients",
    title: "Give a client portal access",
    summary: "Let clients see their proposals and invoices without an account on your team.",
    steps: [
      "Open the client and go to the Portal access tab.",
      "Invite the contact by email, or copy the private link and send it yourself.",
      "Clients see only their own proposals, invoices and shared documents, never other clients or internal notes.",
      "Revoke access from the same tab whenever an engagement ends.",
    ],
    tip: "Treat portal links like passwords: send them only to the person who should see the work.",
  },

  /* ── Projects ── */
  {
    id: "create-project",
    category: "projects",
    title: "Create a project",
    summary: "Give a piece of work a home, an owner and a finish line.",
    steps: [
      "Open Projects and choose New project.",
      "Name it, pick the client (or leave it internal), choose a type such as fixed price or retainer, and add the contract value and deadline if you know them.",
      "Optionally hide the client name from the assigned team if only founders should see who it is for.",
      "Save, then add tasks directly or use Task breakdown to plan the whole thing in one go.",
    ],
    link: { href: "/projects", label: "Go to Projects" },
  },
  {
    id: "task-breakdown",
    category: "projects",
    title: "Break a project into milestones and tasks",
    summary: "Plan delivery as a grid: milestones down the side, statuses across the top.",
    steps: [
      "Open Projects, then Task breakdown, and choose a project.",
      "Add milestone rows for the phases of the work, for example Discovery, Build and Launch.",
      "Add tasks to a cell, or drag a card between cells to change its milestone and status together.",
      "Use the AI option to propose a first draft from the project description, then edit it to match reality.",
    ],
    link: { href: "/projects/breakdown", label: "Open Task breakdown" },
  },
  {
    id: "tasks",
    category: "projects",
    title: "Work with tasks",
    summary: "Assigned to me, personal and everything — and how to keep each one tidy.",
    steps: [
      "Open Tasks. The tabs separate what is assigned to you, your private to-dos and every task in the workspace.",
      "Choose New task. Pick a project to make it part of that project, or leave the project empty to keep it as a personal task.",
      "Change a status straight from the list, or tick the check button to mark a task done. Overdue work is grouped at the top.",
      "Use the filters to narrow by status, priority or project, and the search box to find a task by words in its title.",
    ],
    link: { href: "/tasks", label: "Open Tasks" },
  },
  {
    id: "boards",
    category: "projects",
    title: "Sketch ideas on a board",
    summary: "Whiteboards and mind maps that can turn into tasks or a proposal.",
    steps: [
      "Open Boards and create a board, choosing Whiteboard or Mind map.",
      "Drop notes and shapes on the canvas, drag to arrange and double-click to edit text.",
      "When the idea is ready, convert it: send the items to a project as tasks, or turn the board into the outline of a proposal.",
    ],
    link: { href: "/boards", label: "Open Boards" },
  },

  /* ── Proposals ── */
  {
    id: "draft-proposal",
    category: "proposals",
    title: "Draft and send a proposal",
    summary: "From a blank page to a link your client can read and sign.",
    steps: [
      "Open Proposals and choose New proposal.",
      "Pick the client, give it a title and a one-line summary, then write the body: scope, approach, timeline and terms.",
      "Add line items with a description, quantity and rate. The subtotal updates as you type.",
      "Set the advance percentage and a validity date, save as a draft, review it with View, then Send.",
    ],
    tip: "Keep the first paragraph about the client's problem, not your company.",
    link: { href: "/proposals", label: "Go to Proposals" },
  },
  {
    id: "proposal-status",
    category: "proposals",
    title: "Follow a proposal through to a decision",
    summary: "What each status means and what to do next.",
    steps: [
      "Draft means only you can see it. Sent means the client has the link. Viewed means they opened it.",
      "Accepted and Rejected are final. A decided proposal cannot be edited, so duplicate it if terms need to change.",
      "Proposals out for signature appear in the side panel and the attention queue on Home, so a quiet one does not get forgotten.",
      "Viewed but not decided for several days is the cue for a short follow-up from Comms.",
    ],
  },
  {
    id: "proposal-invoice",
    category: "proposals",
    title: "Turn an accepted proposal into an invoice",
    summary: "Start billing without retyping the scope.",
    steps: [
      "Open the accepted proposal.",
      "Choose the option to create an invoice. When the proposal has an advance percentage, the draft covers that advance; otherwise it covers the full amount.",
      "Review the draft invoice, adjust the GST rate if needed and send it from the invoice page.",
    ],
    link: { href: "/invoices", label: "View invoices" },
  },

  /* ── Finance ── */
  {
    id: "create-invoice",
    category: "finance",
    title: "Create an invoice with GST",
    summary: "Line items, the right tax split and a due date that follows the client's terms.",
    steps: [
      "Open Finance, then New invoice, and choose the client.",
      "Add line items with quantity and rate, and choose the GST rate that applies (0, 5, 12, 18 or 28 percent).",
      "BizMemory compares your state with the place of supply: same state splits tax into CGST and SGST, different state uses IGST.",
      "Save as a draft, check the totals, and send. The invoice moves to Sent and counts towards what is outstanding.",
    ],
    link: { href: "/invoices/new", label: "Create an invoice" },
  },
  {
    id: "collect-payment",
    category: "finance",
    title: "Record a payment and chase overdue invoices",
    summary: "Keep receivables honest and follow up before they age.",
    steps: [
      "When money arrives, open the invoice and mark it paid. Collected revenue on Home and Reports updates immediately.",
      "Invoices past their due date appear in the attention queue and in Notifications.",
      "Ask the Finance AI teammate to draft a reminder, or log the call or email in Comms so everyone can see the history.",
    ],
    link: { href: "/finance", label: "Finance overview" },
  },
  {
    id: "log-expense",
    category: "finance",
    title: "Log an expense",
    summary: "Record spend against a category and, when relevant, a project.",
    steps: [
      "Open Finance, then Expenses, and choose Log expense.",
      "Pick a category, enter the amount and what it was for, and choose a project if the cost belongs to one.",
      "Add a receipt link and tick GST deductible if you can claim input credit.",
      "Filter the list by category and date range, and search by description to find old entries.",
    ],
    link: { href: "/expenses", label: "Go to Expenses" },
  },
  {
    id: "reports",
    category: "finance",
    title: "Read the Reports page",
    summary: "Revenue, expenses, status breakdowns and team performance for any period.",
    steps: [
      "Open Reports and pick a period: 7 days, 30 days, 90 days or 12 months.",
      "The tiles show revenue collected, invoiced, outstanding, expenses, net, new clients and completed work.",
      "The chart compares what you collected with what you spent in each slice of the period.",
      "Scroll to the leaderboards for your top clients and projects, and to team performance for tasks, overdue work and utilisation.",
      "Use Download CSV beside a table to take the numbers into a spreadsheet.",
    ],
    link: { href: "/reports", label: "Open Reports" },
  },

  /* ── AI team ── */
  {
    id: "ai-team",
    category: "ai",
    title: "Meet your AI team",
    summary: "Five teammates, each with a job: project manager, finance, operations, client success and sales.",
    steps: [
      "Open AI, then AI team, to see the five employees and what each one looks after.",
      "Switch an employee on to let them work. Some are included and some use credits; the card tells you which.",
      "Assign a task in plain language, or pick one of the suggested prompts.",
      "Anything an AI employee wants to do on your behalf waits for your approval before it takes effect.",
    ],
    link: { href: "/ai/team", label: "Meet the team" },
  },
  {
    id: "assistant",
    category: "ai",
    title: "Ask the assistant about your business",
    summary: "Questions answered from your own clients, projects, money and memory.",
    steps: [
      "Open the assistant from the sparkle button, or go to AI, then Assistant.",
      "Ask something specific: “Which invoices are overdue and by how much?” or “Which projects might slip this month?”",
      "Read the answer together with the sources it was based on, and follow the links to check the underlying records.",
    ],
    tip: "The more you teach Memory, the less generic these answers become.",
    link: { href: "/assistant", label: "Open the assistant" },
  },
  {
    id: "automations-skills",
    category: "ai",
    title: "Automate routines and teach skills",
    summary: "When something happens, do the busywork automatically; and give the AI your own procedures.",
    steps: [
      "Open AI, then Automations. Start from a ready-made recipe or build your own: choose a trigger such as invoice paid, then the actions, such as notify the founders or create a follow-up task.",
      "Scope an automation to everything, one client or one project, and switch it off any time from Your automations.",
      "Open Skills to add a written procedure, such as how you onboard a client, and choose which AI employees should follow it.",
    ],
    link: { href: "/ai/automations", label: "Browse automations" },
  },

  /* ── Memory ── */
  {
    id: "memory-basics",
    category: "memory",
    title: "How business memory works",
    summary: "The score, the eight areas and why explaining beats recording.",
    steps: [
      "Memory measures how much of your business has been explained, not how many records exist.",
      "Knowledge is grouped into eight areas, such as how you decide, operations, finance, clients and team. Each shows how much is known.",
      "The workspace points out the area it knows least about and suggests the next questions to answer.",
      "Everything you add is used by the assistant and the CIO briefing.",
    ],
    link: { href: "/memory", label: "Open Memory" },
  },
  {
    id: "answer-questions",
    category: "memory",
    title: "Answer questions to teach the workspace",
    summary: "Short, specific answers that capture how you really work.",
    steps: [
      "Open Memory, then Answer questions.",
      "Take one question at a time. Write the way you would explain it to a new hire: what you do, and why.",
      "Skip anything you cannot answer yet; it stays in the list for later.",
      "Check What we know to read, correct or delete anything that was captured.",
    ],
    link: { href: "/memory/questions", label: "Answer questions" },
  },
  {
    id: "import-memory",
    category: "memory",
    title: "Import what another assistant already knows",
    summary: "Bring context across from ChatGPT, Claude or Gemini, or upload a document.",
    steps: [
      "Open Memory, then Import. Choose the assistant you have been using.",
      "Follow the short instructions to export your data from that assistant, then choose the file here.",
      "Or upload a text document (.txt, .md, .csv or .json) and say which area it is about.",
      "Review the imported facts under What we know and remove anything that does not belong.",
    ],
    link: { href: "/memory/import", label: "Import memory" },
  },
  {
    id: "decisions",
    category: "memory",
    title: "Keep a decision log",
    summary: "Record the why behind choices so you do not relive the debate in six months.",
    steps: [
      "Open CIO, then Decision log, and add a decision with a clear title.",
      "Write the reasoning, the alternatives you rejected and who made the call. Link it to a client or project if it applies.",
      "The latest decisions appear on Home, and the assistant can quote them back when a similar question comes up.",
    ],
    link: { href: "/decisions", label: "Open the decision log" },
  },

  /* ── Settings ── */
  {
    id: "invite-team",
    category: "settings",
    title: "Invite teammates and choose roles",
    summary: "Who can see and change what.",
    steps: [
      "Open Setup, then Team directory, and invite someone by email.",
      "Choose a role. Owners and admins manage the workspace and billing, managers handle clients and finance, and members work on projects and tasks.",
      "The invitation arrives by email. Once accepted, the person appears in the directory and can be assigned work.",
      "Set each person's weekly capacity in hours so Reports can show how loaded they are.",
    ],
    link: { href: "/settings/team", label: "Open Team directory" },
  },
  {
    id: "company-gst",
    category: "settings",
    title: "Set your company and GST details",
    summary: "The information that appears on every invoice you send.",
    steps: [
      "Open Setup, then Settings, then Company & GST.",
      "Enter your legal name, address, state and GSTIN. The state decides whether tax is split into CGST and SGST or charged as IGST.",
      "Add bank or UPI details if you want them printed on invoices.",
      "Save. New invoices pick the details up straight away; invoices already issued keep the details they were issued with.",
    ],
    link: { href: "/settings/company", label: "Company & GST" },
  },
  {
    id: "plan-usage",
    category: "settings",
    title: "Understand your plan and AI credits",
    summary: "Seats, client limits and what uses credits.",
    steps: [
      "Open Setup, then Plan & usage to see your current plan, seats and renewal date.",
      "AI credits are used when AI employees or the assistant do work. The meter shows how many are left this month.",
      "When you approach a limit, upgrade from the same page. Changes apply immediately.",
    ],
    link: { href: "/settings/plan", label: "Plan & usage" },
  },
  {
    id: "notification-prefs",
    category: "settings",
    title: "Choose what reaches you",
    summary: "Notification preferences, the audit log and your data.",
    steps: [
      "Open Setup, then Settings, then Notifications to switch payment, proposal, milestone and weekly digest alerts on or off.",
      "Use the Audit log to see who changed what and when, which is handy for resolving “who edited this?” questions.",
      "Data & privacy lets you export or delete your data and review cookie settings.",
    ],
    link: { href: "/settings/notifications", label: "Notification settings" },
  },
];

export const KEYBOARD_SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ["Ctrl", "K"], action: "Open quick search (Cmd K on a Mac)" },
  { keys: ["Enter"], action: "Open the first search result" },
  { keys: ["Esc"], action: "Close a dialog or the search box" },
  { keys: ["Tab"], action: "Move to the next field in a form" },
  { keys: ["Shift", "Tab"], action: "Move to the previous field" },
  { keys: ["Space"], action: "Toggle the focused checkbox or button" },
];
