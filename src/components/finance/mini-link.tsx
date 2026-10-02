import Link from "next/link";
import { Icon } from "@/components/kit-icons";

/** Compact icon+label link for table/card row actions. */
export function MiniLink({ href, icon, label, onlyIcon }: { href: string; icon?: string; label: string; onlyIcon?: boolean }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
      {onlyIcon ? null : label}
    </Link>
  );
}
