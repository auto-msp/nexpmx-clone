import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "BizMemory Privacy Policy — what we collect, why, and the controls you have.",
};

const SECTIONS: Array<{ heading: string; body: string[] }> = [
  {
    heading: "1. Scope",
    body: [
      "This Privacy Policy explains how BizMemory (\"we\", \"us\") collects, uses, and protects personal data when you use the BizMemory website, workspace application, client portal, and related services (the \"Service\").",
      "For workspace content, you may also be acting as a data controller for your organization's members and clients. This policy covers our processing as the service provider; your own privacy obligations to the people whose data you upload are yours to manage.",
    ],
  },
  {
    heading: "2. Data we collect",
    body: [
      "Account data: when you sign in with Google, we receive your name, email address, and profile picture URL. We also store your Google account identifier to link your sign-ins.",
      "Workspace data: the clients, projects, tasks, invoices, decisions, and documents you upload, and the metadata needed to organize them (timestamps, who created what).",
      "Usage data: feature interactions needed to run and secure the Service — sign-in events, audit records of important actions (who changed what, from which IP), AI credit usage, and rate-limiting data.",
      "Billing data: your organization's plan, seat count, subscription state, and payment event references. Card and UPI credentials are handled entirely by our payment processor (Razorpay); they never reach our servers. We store payment identifiers (e.g. order and payment IDs), not payment instruments.",
      "Cookies: a single login session cookie (HttpOnly) keeps you signed in. We do not use advertising or cross-site tracking cookies.",
    ],
  },
  {
    heading: "3. How we use data",
    body: [
      "To provide the Service: authenticate you, show your workspace, keep tenant isolation (your data is visible only to your workspace), serve documents, and process subscription lifecycle events.",
      "To secure the Service: detect abuse, enforce rate limits, keep audit trails for security investigations, and respond to incidents.",
      "To operate the AI assistant: when you ask a question, we search your workspace's content and ground the answer in it. With the default configuration this runs on infrastructure we control; your workspace content is not sent to third-party model providers. See Section 7.",
      "We do not sell personal data, and we do not use your workspace content to advertise to you or to train models for other customers.",
    ],
  },
  {
    heading: "4. Legal bases (where applicable)",
    body: [
      "Depending on your jurisdiction, we process personal data on these bases: to perform our contract with you (running your workspace, billing); for our legitimate interests (security, abuse prevention, product improvement in aggregate); and to comply with legal obligations (tax and accounting records).",
    ],
  },
  {
    heading: "5. Sharing and processors",
    body: [
      "We share data only with the processors needed to run the Service, bound by contract:",
      "• Hosting provider — runs the application and PostgreSQL database (currently Oracle Cloud).",
      "• Payment processor — Razorpay handles checkout and sends us signed payment lifecycle events.",
      "• Identity provider — Google, for sign-in only.",
      "We also share data when required by law or to protect rights and safety, and in the context of a merger or acquisition, with notice in the Terms.",
      "A current list with regions is maintained in our Security documentation.",
    ],
  },
  {
    heading: "6. Retention",
    body: [
      "Account and workspace data are retained while your workspace is active, and for a limited period after closure so you can reactivate or export (currently up to 30 days in production storage, after which deletion runs; backups purge on their own schedule, up to 30 additional days).",
      "Audit logs are retained up to 24 months for security purposes. Billing records are retained as long as tax law requires (typically 8 years in India).",
    ],
  },
  {
    heading: "7. AI processing",
    body: [
      "The AI assistant answers questions using your workspace's content. Credit usage is metered per plan; we store usage counts and which features were used, not the content of your questions.",
      "Default configuration: AI runs on our own infrastructure (a deterministic, locally-grounded implementation). If we later enable external model providers, we will update this section and the Terms before doing so, and we will disclose what content leaves our systems.",
    ],
  },
  {
    heading: "8. Security",
    body: [
      "We protect personal data with encryption in transit (TLS), tenant-scoped access checks at every database query, hashed storage for API keys and portal tokens, signed expiring links for document downloads, constant-time verification for payment webhooks, and audit logging of sensitive actions.",
      "Administrative access to production is limited, logged, and covered by an incident response process including a dedicated secret-compromise runbook.",
    ],
  },
  {
    heading: "9. Your rights and choices",
    body: [
      "You can access and correct your profile data in workspace settings, export what you need from the workspace UI, and close your workspace (which triggers deletion per Section 6).",
      "Depending on your jurisdiction (for example, under the EU/UK GDPR, or India's DPDP Act) you may have rights to access, correct, delete, port, or object to processing of your personal data. Contact us at the address published on the site and we will respond within the timelines required by applicable law.",
      "If you are a member of a workspace (not its owner), contact your workspace owner first for content-related requests; account-level requests can come to us directly.",
    ],
  },
  {
    heading: "10. Children",
    body: [
      "The Service is not directed at children under 18 (or the local age of digital consent), and we do not knowingly collect their data. If you believe a minor's data was provided, contact us and we will delete it.",
    ],
  },
  {
    heading: "11. International transfers",
    body: [
      "Our hosting is currently in India (Oracle Cloud, Mumbai region). If data is transferred across borders, we do so under applicable transfer mechanisms and with safeguards described in our Security documentation.",
    ],
  },
  {
    heading: "12. Changes to this policy",
    body: [
      "We update this policy when our processing changes. Material reductions in your privacy protections will be announced in advance (in-app or by email). The effective date below shows the current version.",
    ],
  },
  {
    heading: "13. Contact",
    body: [
      "Privacy questions, requests, and complaints: use the contact address published on our website. You may also have the right to complain to your local data protection authority.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">
        Effective date: October 2, 2026
      </p>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.heading} aria-label={section.heading}>
            <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
            <div className="mt-3 space-y-3">
              {section.body.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-text">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted">
        This policy describes the controls implemented in this codebase
        (encryption, tenant isolation, audit logging, no-ad tracking) and the
        processors the Service actually uses. It is not legal advice; consult
        qualified counsel in your jurisdiction before relying on it for your own
        deployment.
      </p>
    </div>
  );
}
