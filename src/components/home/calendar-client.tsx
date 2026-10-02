"use client";

import { useCallback, useState } from "react";
import { ActionButton, ActionForm, Modal, ModalButton } from "@/components/kit-client";
import { Badge, Button, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { FormGrid } from "@/components/kit";
import { createEvent, deleteEvent, updateEvent } from "@/app/actions/calendar";
import { fmtKey } from "@/components/home/dates";
import { EVENT_KINDS, KIND_META, type CalItem, type EventData } from "@/components/home/calendar-types";

export interface ClientOption {
  id: string;
  name: string;
}

function EventForm({
  event,
  defaultDate,
  clients,
}: {
  event?: EventData;
  defaultDate?: string;
  clients: ClientOption[];
}) {
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  return (
    <ActionForm action={event ? updateEvent : createEvent} submitLabel={event ? "Save changes" : "Add event"} resetOnSuccess={!event}>
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      <Field label="Title">
        <Input name="title" required maxLength={160} defaultValue={event?.title ?? ""} placeholder="e.g. Kick-off call with the client" autoFocus />
      </Field>
      <FormGrid>
        <Field label="Type">
          <Select name="kind" defaultValue={event?.kind ?? "MEETING"}>
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Client (optional)">
          <Select name="clientId" defaultValue={event?.clientId ?? ""}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input name="date" type="date" required defaultValue={event?.date ?? defaultDate ?? ""} />
        </Field>
        <Field label="Ends on (optional)">
          <Input name="endDate" type="date" defaultValue={event && event.endDate !== event.date ? event.endDate : ""} />
        </Field>
      </FormGrid>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 rounded border-border" />
        All-day event
      </label>
      {!allDay ? (
        <FormGrid>
          <Field label="Starts">
            <Input name="startTime" type="time" defaultValue={event?.startTime || "10:00"} />
          </Field>
          <Field label="Ends">
            <Input name="endTime" type="time" defaultValue={event?.endTime ?? ""} />
          </Field>
        </FormGrid>
      ) : null}
      <Field label="Location (optional)">
        <Input name="location" maxLength={200} defaultValue={event?.location ?? ""} placeholder="Office, Google Meet link, address…" />
      </Field>
      <Field label="Notes (optional)">
        <Textarea name="notes" maxLength={4000} defaultValue={event?.notes ?? ""} placeholder="Agenda, prep, anything worth remembering" />
      </Field>
    </ActionForm>
  );
}

export function NewEventButton({ defaultDate, clients, label = "New event" }: { defaultDate: string; clients: ClientOption[]; label?: string }) {
  return (
    <ModalButton label={label} icon="plus" title="New event" description="Meetings, follow-ups and time off appear for everyone in the workspace.">
      <EventForm defaultDate={defaultDate} clients={clients} />
    </ModalButton>
  );
}

function whenLabel(e: EventData): string {
  const day = fmtKey(e.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const multi = e.endDate > e.date;
  if (e.allDay) return multi ? `${day} → ${fmtKey(e.endDate, { weekday: "short", day: "numeric", month: "short" })} · all day` : `${day} · all day`;
  const time = e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime;
  return multi ? `${day} ${e.startTime} → ${fmtKey(e.endDate, { day: "numeric", month: "short" })} ${e.endTime}` : `${day} · ${time}`;
}

/** A calendar entry for a stored event: opens a small detail modal with edit / delete. */
export function EventChip({
  item,
  variant = "chip",
  clients,
  canWrite,
}: {
  item: CalItem;
  variant?: "chip" | "row";
  clients: ClientOption[];
  canWrite: boolean;
}) {
  const event = item.event;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    setEditing(false);
  }, []);
  if (!event) return null;
  const meta = KIND_META[event.kind];
  const timed = !event.allDay && item.time !== "All day";

  return (
    <>
      {variant === "chip" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`${item.time ? `${item.time} · ` : ""}${event.title}`}
          className={cx("flex w-full min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight hover:brightness-125", meta.chip)}
        >
          {timed ? <span className="shrink-0 font-mono text-[10px] opacity-80">{event.startTime}</span> : null}
          <span className="truncate font-medium">{event.title}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-start gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-left hover:border-brand"
        >
          <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", meta.dot)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{event.title}</span>
            <span className="block truncate text-xs text-muted">
              {[item.time, meta.label, item.sub, event.location].filter(Boolean).join(" · ")}
            </span>
          </span>
        </button>
      )}
      <Modal open={open} onClose={close} title={editing ? "Edit event" : event.title} description={editing ? event.title : whenLabel(event)} size="md">
        {editing ? (
          <EventForm event={event} clients={clients} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={event.kind === "MEETING" ? "brand" : event.kind === "FOLLOW_UP" ? "warn" : "success"}>{meta.label}</Badge>
              {event.clientName ? <Badge>{event.clientName}</Badge> : null}
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-muted">When</dt>
                <dd>{whenLabel(event)}</dd>
              </div>
              {event.location ? (
                <div className="flex gap-3">
                  <dt className="w-20 shrink-0 text-muted">Where</dt>
                  <dd className="min-w-0 break-words">{event.location}</dd>
                </div>
              ) : null}
              {event.notes ? (
                <div className="flex gap-3">
                  <dt className="w-20 shrink-0 text-muted">Notes</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">{event.notes}</dd>
                </div>
              ) : null}
            </dl>
            {canWrite && event.canManage ? (
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <ActionButton action={deleteEvent} fields={{ id: event.id }} label="Delete" icon="trash" variant="danger" confirm={`Delete "${event.title}"?`} />
                <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                  Edit event
                </Button>
              </div>
            ) : (
              <div className="flex justify-end border-t border-border pt-3">
                <Button type="button" variant="ghost" onClick={close}>
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
