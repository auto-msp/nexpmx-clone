import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "BizMemory Terms of Service — the agreement governing your use of the BizMemory workspace.",
};

const SECTIONS: Array<{ heading: string; body: string[] }> = [
  {
    heading: "1. Agreement to these terms",
    body: [
      "These Terms of Service (\"Terms\") are a binding agreement between you and the operator of BizMemory (\"BizMemory\", \"we\", \"us\") governing your access to and use of the BizMemory website, workspace application, client portal, and related services (collectively, the \"Service\").",
      "By creating an account, accepting an invitation to a workspace, or otherwise using the Service, you agree to these Terms. If you are accepting on behalf of a company or other legal entity, you represent that you have authority to bind that entity, and \"you\" refers to that entity.",
      "If you do not agree to these Terms, do not use the Service.",
    ],
  },
  {
    heading: "2. Your account and workspace",
    body: [
      "You sign in with a Google account (single sign-on). You are responsible for safeguarding your Google credentials and for all activity that occurs under your account.",
      "Each account is tied to a workspace (\"Organization\"). You may be a member of a workspace as an Owner, Admin, Manager, or Member. Owners control billing, invitations, and workspace settings. You must be at least 18 years old, or the age of digital consent in your jurisdiction, to use the Service.",
      "You must notify us promptly of any unauthorized use of your account.",
    ],
  },
  {
    heading: "3. Subscriptions, trials, and billing",
    body: [
      "The Service is offered on a per-user, per-month subscription basis in the plans described on the pricing page. New workspaces begin with a free trial (currently 14 days). When the trial ends, the workspace is locked to read-only until a paid plan is activated; your data is retained and is restored to full access upon activation.",
      "Seat counts: subscriptions are purchased per user (\"seats\"). The number of members you may invite is limited by your purchased seats (or, before activation, by your plan's seat cap).",
      "Payments are processed by our payment processor (currently Razorpay). Prices are stated in Indian Rupees and are exclusive of applicable taxes unless stated otherwise. Subscriptions renew monthly until canceled. If a renewal payment fails, the workspace may move to a past-due state and, ultimately, be locked; we will attempt to notify you.",
      "You may cancel at any time from the billing page; cancellation takes effect at the end of the current billing period. Except as required by law, fees already paid are non-refundable.",
    ],
  },
  {
    heading: "4. Your content",
    body: [
      "\"Your Content\" means the clients, projects, tasks, invoices, decisions, documents, and other materials you or your workspace members upload to or create in the Service.",
      "You retain all ownership of Your Content. You grant us a limited, worldwide, non-exclusive license to host, store, reproduce, and process Your Content solely as necessary to provide and secure the Service for you — for example, indexing your content so your workspace's AI assistant can answer questions about it.",
      "You are responsible for Your Content and for having the rights to upload it. You may not upload content that is unlawful, infringing, malicious (e.g. malware), or that violates the rights of others.",
      "Workspaces are isolated: only members of your workspace can access Your Content, subject to the Security section below.",
    ],
  },
  {
    heading: "5. Acceptable use",
    body: [
      "You agree not to: (a) violate any applicable law or regulation; (b) probe, scan, or test the vulnerability of the Service without written permission; (c) circumvent usage limits, seat caps, or access controls; (d) access the Service to build a competing product; (e) upload content that infringes intellectual property or privacy rights; or (f) misuse the Service in a way that impairs other customers.",
      "We may suspend or terminate access for violations of this section, with notice where practicable.",
    ],
  },
  {
    heading: "6. AI features",
    body: [
      "The Service includes an AI assistant that answers questions grounded in your workspace's content and meters usage with monthly credits per plan.",
      "AI answers are generated from your data and may be incomplete or wrong. Do not treat AI output as legal, financial, or tax advice. You remain responsible for decisions made using AI-assisted answers.",
      "With the default configuration, AI features run on infrastructure we control and your content is not sent to third-party model providers. If that configuration changes, this section and the Privacy Policy will be updated, and any data sent externally will be disclosed there.",
    ],
  },
  {
    heading: "7. Intellectual property",
    body: [
      "The Service itself — software, design, branding, and documentation — is owned by us or our licensors and is protected by applicable intellectual-property laws. Except for the license to use the Service, no rights are granted to you.",
      "You keep all rights in Your Content (Section 4).",
    ],
  },
  {
    heading: "8. Service availability and support",
    body: [
      "We aim for high availability but do not guarantee uninterrupted or error-free service. Planned maintenance is intended to occur outside typical business hours. Features in beta may change or be withdrawn.",
      "Support is provided via email at the address published on the site. Response times depend on plan and severity.",
    ],
  },
  {
    heading: "9. Security and data protection",
    body: [
      "We implement technical and organizational measures described in our Security documentation, including encryption in transit, tenant isolation, audited administrative actions, and least-privilege access to production systems.",
      "No service is perfectly secure. You are responsible for configuring your workspace sensibly (e.g., who you invite and with what roles) and for keeping your own copies of important data; we do not provide a backup service for Your Content.",
    ],
  },
  {
    heading: "10. Termination",
    body: [
      "You may stop using the Service and close your workspace at any time. We may suspend or terminate accounts that violate these Terms or pose a security or legal risk.",
      "On termination by you, you should export the data you need before closing the workspace; after closure, Your Content is deleted from production systems within a commercially reasonable period, subject to backups and legal retention requirements.",
    ],
  },
  {
    heading: "11. Disclaimers and limitation of liability",
    body: [
      "The Service is provided \"as is\" and \"as available,\" without warranties of any kind, whether express, implied, or statutory, including merchantability, fitness for a particular purpose, and non-infringement.",
      "To the maximum extent permitted by law, our aggregate liability arising out of or relating to the Service is limited to the amounts you paid us in the twelve (12) months preceding the event giving rise to the claim. We are not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, or data, even if advised of the possibility.",
      "Some jurisdictions do not allow certain limitations; in that case these limits apply to the fullest extent permitted.",
    ],
  },
  {
    heading: "12. Changes to the Service or these Terms",
    body: [
      "We may modify the Service and these Terms. If a change is material and reduces your rights, we will give reasonable advance notice (e.g., by email or in-app notice). Continuing to use the Service after changes take effect means you accept the updated Terms.",
    ],
  },
  {
    heading: "13. Governing law and disputes",
    body: [
      "These Terms are governed by the laws of India, without regard to conflict-of-law rules. The courts located in Bengaluru, Karnataka, India have exclusive jurisdiction over disputes arising out of these Terms, unless mandatory local consumer law gives you the right to bring proceedings elsewhere.",
      "Before filing suit, the parties agree to attempt good-faith resolution for thirty (30) days after written notice of a dispute.",
    ],
  },
  {
    heading: "14. Contact",
    body: [
      "Questions about these Terms can be sent to the contact address published on our website.",
      "These Terms are effective as of the date published below and replace any earlier terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
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
        This document is provided as the operating terms for BizMemory and is
        reviewed periodically. It is not legal advice; consult qualified counsel
        in your jurisdiction before relying on it for your own deployment.
      </p>
    </div>
  );
}
