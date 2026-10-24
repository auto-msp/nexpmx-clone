import { prisma } from "@/lib/db";
import {
  AI_EMPLOYEES,
  AI_EMPLOYEE_SUMMARY,
  AI_EMPLOYEE_TINT,
  CUSTOM_EMPLOYEE_TINT,
} from "@/lib/ai-team";

/** One AI teammate as the UI needs it (built-in or custom). */
export interface TeamMember {
  key: string;
  name: string;
  role: string;
  summary: string;
  instructions: string;
  custom: boolean;
  enabled: boolean;
  creditPrice: number;
  tint: string;
  owns: string[];
}

/** Built-in employees (with any saved overrides) plus the org's custom ones. */
export async function loadTeam(orgId: string): Promise<TeamMember[]> {
  const rows = await prisma.aiEmployee.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const builtIn: TeamMember[] = AI_EMPLOYEES.map((e) => {
    const r = byKey.get(e.key);
    return {
      key: e.key,
      name: e.name,
      role: e.role,
      summary: r?.summary?.trim() || AI_EMPLOYEE_SUMMARY[e.key] || e.owns[0],
      instructions: r?.instructions ?? "",
      custom: false,
      enabled: r?.enabled ?? false,
      creditPrice: e.creditPrice,
      tint: AI_EMPLOYEE_TINT[e.key] ?? CUSTOM_EMPLOYEE_TINT,
      owns: e.owns,
    };
  });
  const custom: TeamMember[] = rows
    .filter((r) => r.custom)
    .map((r) => ({
      key: r.key,
      name: r.name?.trim() || "Teammate",
      role: r.roleTitle?.trim() || "Specialist",
      summary: r.summary?.trim() || "A teammate you set up yourself.",
      instructions: r.instructions ?? "",
      custom: true,
      enabled: r.enabled,
      creditPrice: 0,
      tint: CUSTOM_EMPLOYEE_TINT,
      owns: [],
    }));
  return [...builtIn, ...custom];
}
