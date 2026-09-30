"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import type { ButtonHTMLAttributes } from "react";

/**
 * Double-submit guard (resilience audit F5): while a server action is
 * in flight, the button is disabled and shows a pending state. Prevents
 * accidental duplicate creates from double-clicks and slow connections.
 *
 * Must be rendered inside a <form> that uses a server action
 * (useFormStatus reads the enclosing form's status).
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
