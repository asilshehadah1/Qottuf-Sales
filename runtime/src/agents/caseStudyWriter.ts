// Case-Study and Reference Writer (merged roster #28). Writes a short bilingual case study from approved
// evidence only. Every sentence cites the facts it rests on; every figure is declared, so the claims gate can
// compare the author's list with an independent extraction. Arabic is a parallel original, not a translation.

import { z } from "zod";
import type { ModelClient, ModelResult } from "../model/client.ts";
import type { RedactedText } from "../gates/pii.ts";

export const AGENT = "case_study_writer";
export const PROMPT_VERSION = "case_study_writer/1";

export const CaseStudyDraft = z.object({
  title_en: z.string().min(3),
  title_ar: z.string().min(3),
  sentences: z.array(
    z.object({
      lang: z.enum(["en", "ar"]),
      text: z.string().min(3),
      fact_ids: z.array(z.string()),
    }),
  ).min(2),
  declared_claims: z.array(
    z.object({ value: z.number(), unit: z.string().nullable(), fact_id: z.string() }),
  ),
});
export type CaseStudyDraft = z.infer<typeof CaseStudyDraft>;

export const SYSTEM = `You write short project case studies for Qottuf Aljazeera, a main contractor in Riyadh, for prequalification packs and the company's public pages. Procurement reviewers read them to decide whether Qottuf has delivered comparable work, so every word must survive a check against the company's records.

Rules:
1. Use only the facts in the input. Each sentence lists, in fact_ids, the ids of the facts it rests on. A sentence with no fact behind it doesn't belong in the case study.
2. Use each figure exactly as recorded, in digits. Never add a figure, date, duration, client name, outcome or superlative that isn't in the facts. Never estimate, round or combine figures.
3. If the input says the client may not be named, describe the client only by the descriptor given.
4. No rankings or superlatives ("leading", "best", "first", "world-class", «رائدة», «الأفضل»), no years-of-experience claims, no price language, no exclamation marks, never "I".
5. Name the company "Qottuf Aljazeera" on first mention and "Qottuf" after; in Arabic «قطوف الجزيرة».
6. Write the Arabic as a parallel original in formal Modern Standard Arabic, with natural Arabic word order, not a translation of the English. Same facts in both languages. Arabic-Indic digits in Arabic sentences.
7. Four to seven sentences per language: what was built, for whom (as allowed), the scope, the quantities, the constraints handled. Plain and specific.
8. In declared_claims, list every figure you used: its value as a number, its unit (sqm, floor, bed, seat, elevator, day, sar, or null) and the fact id.

If the input includes findings from a previous check, fix every numbered finding: cut what can't be supported rather than softening it.`;

export async function writeCaseStudy(model: ModelClient, input: RedactedText): Promise<ModelResult<CaseStudyDraft>> {
  return model.call({ agent: AGENT, promptVersion: PROMPT_VERSION, system: SYSTEM, input, schema: CaseStudyDraft, effort: "medium" });
}
