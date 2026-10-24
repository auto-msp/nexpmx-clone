"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/action";
import { Icon } from "@/components/kit-icons";
import { Button, cx } from "@/components/ui";

/* ── Modal ──────────────────────────────────────────────────────────────── */

const ModalCtx = createContext<{ close: () => void } | null>(null);
export function useModalClose(): (() => void) | null {
  return useContext(ModalCtx)?.close ?? null;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    // Remember the trigger so focus returns to it on close; move focus into the dialog.
    const trigger = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    const raf = requestAnimationFrame(() => (focusables()[1] ?? focusables()[0] ?? panelRef.current)?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      trigger?.focus?.();
    };
  }, [open, onClose]);
  if (!open || !mounted) return null;
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/50 sm:items-start sm:p-4 sm:py-12"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          "max-h-[92dvh] w-full overflow-y-auto rounded-t-[var(--radius-card)] bg-surface shadow-[var(--shadow-modal)] outline-none sm:max-h-none sm:rounded-[var(--radius-card)]",
          w,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-surface-2 hover:text-text max-md:min-w-11">
            <Icon name="x" />
          </button>
        </div>
        <ModalCtx.Provider value={{ close: onClose }}>
          <div className="px-4 py-4 sm:px-5">{children}</div>
        </ModalCtx.Provider>
      </div>
    </div>,
    document.body,
  );
}

/** Button that opens a modal containing `children` (typically an <ActionForm>). */
export function ModalButton({
  label,
  title,
  description,
  icon,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  label: string;
  title?: string;
  description?: string;
  icon?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        {icon ? <Icon name={icon} /> : null}
        {label}
      </Button>
      <Modal open={open} onClose={close} title={title ?? label} description={description} size={size}>
        {children}
      </Modal>
    </>
  );
}

/* ── ActionForm ─────────────────────────────────────────────────────────── */

function newIk(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Form bound to a server action that RETURNS an ActionResult (see lib/action.ts).
 * Adds an idempotency key `ik`, shows errors inline, refreshes the page on
 * success, closes a surrounding <Modal>, and optionally navigates.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  pendingLabel,
  cancelLabel,
  className,
  footerClassName,
  resetOnSuccess = true,
  hideSubmit = false,
  successMessage,
  onSuccess,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  className?: string;
  footerClassName?: string;
  resetOnSuccess?: boolean;
  hideSubmit?: boolean;
  successMessage?: string;
  onSuccess?: (r: Extract<ActionResult, { ok: true }>) => void;
}) {
  const router = useRouter();
  const closeModal = useModalClose();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const ikRef = useRef<string>("");
  useEffect(() => {
    ikRef.current = newIk();
  }, []);

  return (
    <form
      className={cx("flex flex-col gap-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        if (!ikRef.current) ikRef.current = newIk();
        fd.set("ik", ikRef.current);
        setError(null);
        setDone(null);
        start(async () => {
          let r: ActionResult;
          try {
            r = await action(fd);
          } catch {
            r = { ok: false, error: "Could not reach the server. Check your connection and retry." };
          }
          if (!r.ok) {
            setError(r.error);
            return;
          }
          ikRef.current = newIk();
          if (resetOnSuccess) form.reset();
          setDone(successMessage ?? r.message ?? null);
          onSuccess?.(r);
          closeModal?.();
          if (r.redirect) router.push(r.redirect);
          else router.refresh();
        });
      }}
    >
      {children}
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] border border-danger/50 bg-danger-soft px-3 py-2 text-sm text-danger">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {done && !closeModal ? (
        <p role="status" className="flex items-start gap-2 rounded-[var(--radius-control)] border border-success/50 bg-success-soft px-3 py-2 text-sm text-success">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{done}</span>
        </p>
      ) : null}
      {!hideSubmit ? (
        <div className={cx("flex flex-wrap items-center justify-end gap-2", footerClassName)}>
          {closeModal && cancelLabel !== "" ? (
            <Button type="button" variant="ghost" onClick={closeModal}>
              {cancelLabel ?? "Cancel"}
            </Button>
          ) : null}
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? (pendingLabel ?? "Saving…") : submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/**
 * One-click action (mark done, archive, delete…). `fields` are posted as
 * form data. `confirm` shows a browser confirm before running.
 */
export function ActionButton({
  action,
  fields,
  label,
  icon,
  variant = "ghost",
  confirm,
  className,
  title,
  onlyIcon,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  label: string;
  icon?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirm?: string;
  className?: string;
  title?: string;
  onlyIcon?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        title={title ?? label}
        aria-label={label}
        className={cx("min-h-8 px-2.5", className)}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          const fd = new FormData();
          for (const [k, v] of Object.entries(fields)) fd.set(k, v);
          fd.set("ik", newIk());
          setError(null);
          start(async () => {
            const r = await action(fd).catch(() => ({ ok: false as const, error: "Request failed" }));
            if (!r.ok) setError(r.error);
            else if (r.redirect) router.push(r.redirect);
            else router.refresh();
          });
        }}
      >
        {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
        {onlyIcon ? null : pending ? "…" : label}
      </Button>
      {error ? <span role="alert" className="mt-1 text-xs text-danger">{error}</span> : null}
    </span>
  );
}

/* ── URL-param filters (server pages read searchParams) ─────────────────── */

function useParamSetter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

export function SearchInput({ param = "q", placeholder = "Search…", className }: { param?: string; placeholder?: string; className?: string }) {
  const params = useSearchParams();
  const setParam = useParamSetter();
  const [value, setValue] = useState(params.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div className={cx("relative", className)}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setParam(param, v.trim()), 300);
        }}
        className="min-h-9 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface py-1.5 pl-9 pr-3 text-sm text-text hover:border-text-2 focus:border-brand"
      />
    </div>
  );
}

export function ParamSelect({
  param,
  options,
  allLabel = "All",
  className,
}: {
  param: string;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
  className?: string;
}) {
  const params = useSearchParams();
  const setParam = useParamSetter();
  return (
    <select
      aria-label={allLabel}
      value={params.get(param) ?? ""}
      onChange={(e) => setParam(param, e.target.value)}
      className={cx(
        "min-h-9 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-1.5 text-sm text-text hover:border-text-2 focus:border-brand",
        className,
      )}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ViewToggle({ param = "view", fallback = "grid" }: { param?: string; fallback?: "grid" | "table" }) {
  const params = useSearchParams();
  const setParam = useParamSetter();
  const cur = params.get(param) ?? fallback;
  return (
    <div className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-border-strong" role="group" aria-label="View">
      {(["grid", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={cur === v}
          aria-label={v === "grid" ? "Card view" : "Table view"}
          onClick={() => setParam(param, v === fallback ? "" : v)}
          className={cx("flex h-9 w-10 items-center justify-center max-md:min-w-11", cur === v ? "bg-surface-2 text-text" : "bg-surface text-muted hover:bg-surface-2 hover:text-text")}
        >
          <Icon name={v === "grid" ? "grid" : "list"} />
        </button>
      ))}
    </div>
  );
}

/* ── Collapsible ────────────────────────────────────────────────────────── */

export function Collapsible({
  title,
  defaultOpen = true,
  right,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-2.5 text-left sm:px-5"
      >
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-3 text-muted">
          {right}
          <Icon name={open ? "chevronDown" : "chevronRight"} />
        </span>
      </button>
      {open ? <div className="border-t border-border p-4 sm:p-5">{children}</div> : null}
    </section>
  );
}

/* ── Rich text editor ───────────────────────────────────────────────────── */

/** Minimal contentEditable editor. Posts sanitised-on-the-server HTML in a hidden input `name`. */
export function RichTextEditor({
  name,
  defaultValue = "",
  placeholder = "Write here…",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = defaultValue;
      if (hidden.current) hidden.current.value = defaultValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sync = () => {
    if (hidden.current && ref.current) hidden.current.value = ref.current.innerHTML;
  };
  const cmd = (c: string, v?: string) => {
    ref.current?.focus();
    document.execCommand(c, false, v);
    sync();
  };
  const tools: Array<[string, string, () => void]> = [
    ["bold", "Bold", () => cmd("bold")],
    ["italic", "Italic", () => cmd("italic")],
    ["underline", "Underline", () => cmd("underline")],
    ["heading", "Heading", () => cmd("formatBlock", "h2")],
    ["listBullets", "Bulleted list", () => cmd("insertUnorderedList")],
    ["listNumbers", "Numbered list", () => cmd("insertOrderedList")],
    ["quote", "Quote", () => cmd("formatBlock", "blockquote")],
    ["link", "Link", () => {
      const url = window.prompt("Link URL (https://…)");
      if (url) cmd("createLink", url);
    }],
  ];
  return (
    <div className="rounded-[var(--radius-control)] border border-border-strong bg-surface focus-within:border-brand">
      <div className="flex flex-wrap gap-0.5 border-b border-border p-1.5">
        {tools.map(([icon, label, fn]) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={fn}
            className="flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text max-md:h-11 max-md:w-11"
          >
            <Icon name={icon} />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        onInput={sync}
        onBlur={sync}
        className="rte px-3 py-2.5 text-sm text-text"
      />
      <input ref={hidden} type="hidden" name={name} defaultValue={defaultValue} />
    </div>
  );
}

/* ── Misc small client pieces ───────────────────────────────────────────── */

/** Copy-to-clipboard button. */
export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy this:", text);
        }
      }}
    >
      <Icon name="copy" className="h-3.5 w-3.5" />
      {copied ? "Copied" : label}
    </Button>
  );
}

/** Tiny client tab switcher for in-page panels (no URL change). */
export function PanelTabs({ tabs }: { tabs: Array<{ id: string; label: string; badge?: string | number; content: ReactNode }> }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={cx(
              "-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm max-md:min-h-11",
              active === t.id ? "border-brand font-medium text-text" : "border-transparent text-muted hover:border-border-strong hover:text-text",
            )}
          >
            {t.label}
            {t.badge !== undefined ? (
              <span className="num ml-1.5 rounded-[var(--radius-badge)] bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (active === t.id ? <div key={t.id}>{t.content}</div> : null))}
    </div>
  );
}
