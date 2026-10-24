"use client";

import { Button } from "@/components/ui";
import { Icon } from "@/components/kit-icons";

export function PrintButton({ label = "Print / save PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Icon name="download" />
      {label}
    </Button>
  );
}
