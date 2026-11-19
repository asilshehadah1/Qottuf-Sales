import { describe, expect, it } from "vitest";
import { assertRedacted, redact, scanPii, type PiiKind } from "../src/gates/pii.ts";

// Synthetic golden set: every value is invented. Each case lists the spans that must be caught.
const GOLDEN: Array<{ text: string; expect: Array<[PiiKind, string]> }> = [
  { text: "Call me on 0551234567 tomorrow.", expect: [["phone", "0551234567"]] },
  { text: "His mobile is +966 55 123 4567.", expect: [["phone", "+966 55 123 4567"]] },
  { text: "رقم الجوال ٠٥٥١٢٣٤٥٦٧", expect: [["phone", "٠٥٥١٢٣٤٥٦٧"]] },
  { text: "Office line 011 456 7890", expect: [["phone", "011 456 7890"]] },
  { text: "Email fahad.example@client-example.com for the file.", expect: [["email", "fahad.example@client-example.com"]] },
  { text: "National ID 1012345678 on the form.", expect: [["national_id", "1012345678"]] },
  { text: "رقم الإقامة ٢٣٤٥٦٧٨٩٠١", expect: [["national_id", "٢٣٤٥٦٧٨٩٠١"]] },
  { text: "Pay to SA44 2000 0001 2345 6789 1234.", expect: [["iban", "SA44 2000 0001 2345 6789 1234"]] },
  { text: "The villa sits on plot no. 1452 in Al Malqa.", expect: [["plot", "plot no. 1452"]] },
  { text: "قطعة رقم ٧٧٨ في حي النرجس", expect: [["plot", "قطعة رقم ٧٧٨"]] },
  { text: "Short address RRRD2929.", expect: [["short_address", "RRRD2929"]] },
  { text: "Met Eng. Khalid Al-Harbi at the site.", expect: [["person", "Khalid Al-Harbi"]] },
  { text: "اجتمعنا مع المهندس خالد الحربي في الموقع", expect: [["person", "خالد الحربي في الموقع"]] },
  { text: "Dr. Sara Example approved the layout.", expect: [["person", "Sara Example"]] },
];

describe("PII guard: measured recall on the golden set", () => {
  it("catches every labelled item", () => {
    let expected = 0;
    let caught = 0;
    const misses: string[] = [];
    for (const c of GOLDEN) {
      const hits = scanPii(c.text);
      for (const [kind, value] of c.expect) {
        expected++;
        if (hits.some((h) => h.kind === kind && c.text.slice(h.start, h.end).includes(value.split(" ")[0]!))) caught++;
        else misses.push(`${kind}: ${value}`);
      }
    }
    expect(misses).toEqual([]);
    expect(caught / expected).toBe(1);
  });

  it("does not flag the company's public number when it is allow-listed", () => {
    expect(scanPii("Call the office on +966 11 217 7750.", { publicNumbers: ["112177750"] })).toEqual([]);
  });

  it("replaces known contacts with their pseudonymous id, in either script", () => {
    const r = redact("Asked Eng. Fahad Example and فهد المثال to review.", {
      people: [{ contactId: "CNT-0007", names: ["Fahad Example", "فهد المثال"] }],
    });
    expect(r.text).toBe("Asked Eng. [CNT-0007] and [CNT-0007] to review.");
  });

  it("uses one placeholder per distinct value and keeps the originals out of the text", () => {
    const r = redact("Call 0551234567, then 0551234567 again, then 0559876543.");
    expect(r.text).toBe("Call [PHONE-1], then [PHONE-1] again, then [PHONE-2].");
    expect(r.vault.get("[PHONE-2]")).toBe("0559876543");
  });

  it("refuses unredacted text at the model boundary", () => {
    expect(() => assertRedacted("Reach him at 0551234567")).toThrow(/personal data/);
    expect(() => assertRedacted("No personal data here.")).not.toThrow();
  });
});

describe("PII guard: known limits (documented, not hidden)", () => {
  it("does not catch a bare name with no title and no registry entry", () => {
    expect(scanPii("Fahad will send the drawings.")).toEqual([]);
  });
});
