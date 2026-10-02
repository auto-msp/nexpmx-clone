import { Badge } from "@/components/ui";
import { ActionButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { fmtDateTime, relTime } from "@/lib/format";
import { cx } from "@/components/ui";
import { deleteComms } from "@/app/actions/comms";

export const CHANNELS = [
  { value: "EMAIL", label: "Email", icon: "mail" },
  { value: "CALL", label: "Call", icon: "phone" },
  { value: "MEETING", label: "Meeting", icon: "calendar" },
  { value: "NOTE", label: "Note", icon: "edit" },
] as const;

export function channelMeta(channel: string) {
  return CHANNELS.find((c) => c.value === channel) ?? { value: channel, label: channel, icon: "mail" };
}

export type CommsRow = {
  id: string;
  channel: string;
  direction: string;
  subject: string;
  body: string | null;
  sentAt: Date;
  clientId: string | null;
  clientName: string | null;
};

const channelTone: Record<string, string> = {
  EMAIL: "bg-brand/15 text-brand",
  CALL: "bg-warn/15 text-warn",
  MEETING: "bg-success/15 text-success",
  NOTE: "bg-surface-2 text-muted",
};

/** One row of the conversations log (list mode). */
export function CommsListItem({ m, canWrite, showClient }: { m: CommsRow; canWrite: boolean; showClient: boolean }) {
  const ch = channelMeta(m.channel);
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className={cx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", channelTone[m.channel] ?? channelTone.NOTE)}>
        <Icon name={ch.icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{m.subject}</span>
          <Badge tone={m.direction === "OUT" ? "brand" : "neutral"}>{m.direction === "OUT" ? "Sent" : "Received"}</Badge>
          <span className="text-xs text-muted">{ch.label}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {showClient ? `${m.clientName ?? "General"} · ` : ""}
          <time dateTime={m.sentAt.toISOString()} title={fmtDateTime(m.sentAt)}>
            {relTime(m.sentAt)}
          </time>
        </p>
        {m.body ? (
          <details className="group mt-1.5">
            <summary className="cursor-pointer list-none text-sm text-muted">
              <span className="line-clamp-2 group-open:hidden">{m.body}</span>
              <span className="hidden text-xs text-brand group-open:inline">Hide details</span>
            </summary>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{m.body}</p>
          </details>
        ) : null}
      </div>
      {canWrite ? (
        <ActionButton action={deleteComms} fields={{ id: m.id }} label={`Remove ${m.subject}`} icon="trash" onlyIcon confirm="Remove this entry from the log?" />
      ) : null}
    </li>
  );
}

/** One bubble of the per-client thread (thread mode). Outgoing aligns right. */
export function CommsBubble({ m, canWrite }: { m: CommsRow; canWrite: boolean }) {
  const ch = channelMeta(m.channel);
  const out = m.direction === "OUT";
  return (
    <li className={cx("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-[var(--radius-card)] border p-3 sm:max-w-[70%]",
          out ? "border-brand/40 bg-brand/10" : "border-border bg-surface",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Icon name={ch.icon} className="h-3.5 w-3.5" />
          <span>{ch.label}</span>
          <span>·</span>
          <span>{out ? "We sent" : "They sent"}</span>
          <span>·</span>
          <time dateTime={m.sentAt.toISOString()}>{fmtDateTime(m.sentAt)}</time>
          {canWrite ? (
            <span className="ml-auto">
              <ActionButton action={deleteComms} fields={{ id: m.id }} label={`Remove ${m.subject}`} icon="trash" onlyIcon confirm="Remove this entry from the thread?" />
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm font-medium">{m.subject}</p>
        {m.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{m.body}</p> : null}
      </div>
    </li>
  );
}
