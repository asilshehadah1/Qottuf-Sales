export type GateName = "brand" | "claims" | "pii" | "consent" | "tier" | "naming_approval";

export interface Finding {
  gate: GateName;
  severity: "fail" | "signal";
  rule: string;
  quote: string;
  why: string;
  fix?: string;
  /** Offsets in the checked text. Absent means the finding is about the whole document. */
  start?: number;
  end?: number;
}

/** Collects findings, dropping exact duplicates (same rule family and quote), as the reference checker does. */
export class FindingList {
  readonly items: Finding[] = [];
  private readonly seen = new Set<string>();
  private readonly spans: Array<{ target: string; start: number; end: number }> = [];

  /** True if this phrase span is new; false if an earlier phrase finding in the same target already covers it. */
  claimSpan(target: string, start: number, end: number): boolean {
    if (this.spans.some((s) => s.target === target && start < s.end && s.start < end)) return false;
    this.spans.push({ target, start, end });
    return true;
  }

  add(f: Finding): void {
    const family = f.rule.includes(".") ? f.rule.split(".").slice(0, 2).join(".").split("_")[0]! : f.rule;
    const key = `${family}|${f.quote.trim()}|${f.start ?? ""}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.items.push({ ...f, quote: f.quote.trim().slice(0, 200) });
  }

  count(severity: Finding["severity"]): number {
    return this.items.filter((i) => i.severity === severity).length;
  }
}
