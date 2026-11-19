// Workflows for the Proof & Demand writers (#29 Web Page Writer, #30 LinkedIn, #34 Elevator Ad). Pure: the caller
// supplies the approved evidence and, for a web page, what the live page shows today. All three run through
// workflows/content.ts: the same gates, the same independent claim extraction, one revision round.

import { z } from "zod";
import * as M from "../agents/marketing.ts";
import type { Finding } from "../gates/findings.ts";
import type { Lang } from "../gates/text.ts";
import type { EvidenceRecord } from "../ledger/schemas.ts";
import { contentWorkflow, type ContentSpec } from "./content.ts";
import type { WorkflowEnv, WorkflowResult } from "./types.ts";

type Check = Finding & { lang: Lang };
const signal = (rule: string, quote: string, why: string, lang: Lang = "en"): Check => ({ gate: "claims", severity: "signal", rule, quote, why, lang });
const fail = (rule: string, quote: string, why: string, lang: Lang = "en"): Check => ({ gate: "claims", severity: "fail", rule, quote, why, lang });
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// ---------------------------------------------------------------- #30 LinkedIn

export const LinkedinInput = z.object({
  voice: z.enum(["company", "asil"]),
  project_ref: z.string().regex(/^PRJ-\d+$/).optional(),
  topic: z.string().min(3).max(1500).optional(),
}).refine((v) => Boolean(v.project_ref || v.topic), { message: "Give a project, a topic, or both." });
export type LinkedinInput = z.infer<typeof LinkedinInput>;

export async function linkedinWorkflow(env: WorkflowEnv, raw: unknown, records: EvidenceRecord[]): Promise<WorkflowResult> {
  const input = LinkedinInput.parse(raw);
  const spec: ContentSpec<M.LinkedinPost> = {
    artifactType: "linkedin_post", agent: M.LINKEDIN_AGENT, promptVersion: M.LINKEDIN_PROMPT_VERSION, audience: "public", evidenceTierMax: "public",
    write: (m, text) => M.writeLinkedinPost(m, env.brand, text),
    texts: (o) => ({ en: o.en, ar: o.ar }),
    render: (o) => ({ en: o.en, ar: o.ar }),
    title: (o) => `LinkedIn, ${input.voice === "asil" ? "Asil's account" : "company page"}: ${o.angle}`,
    content: (o) => ({ voice: input.voice, angle: o.angle, project_ref: input.project_ref ?? null }),
    checks: (o) => words(o.en) > 220 ? [signal("linkedin.length", `${words(o.en)} words`, "Long for LinkedIn: posts over about 200 words are cut off behind 'see more'.")] : [],
  };
  return contentWorkflow(env, spec, { task: "linkedin_post", voice: input.voice, project_ref: input.project_ref ?? null, topic: input.topic ?? null }, records);
}

// ---------------------------------------------------------------- #34 Elevator ad and content

export const ElevatorAdInput = z.object({
  format: z.enum(["post", "reel_script"]),
  channel: z.enum(["instagram", "x", "snapchat", "tiktok", "whatsapp"]),
  register: z.enum(["saudi_conversational", "formal_msa"]).default("saudi_conversational"),
  focus: z.string().min(3).max(500).optional(),
});
export type ElevatorAdInput = z.infer<typeof ElevatorAdInput>;

export async function elevatorAdWorkflow(env: WorkflowEnv, raw: unknown, records: EvidenceRecord[]): Promise<WorkflowResult> {
  const input = ElevatorAdInput.parse(raw);
  const spec: ContentSpec<M.ElevatorAd> = {
    artifactType: "elevator_ad", agent: M.ELEVATOR_AGENT, promptVersion: M.ELEVATOR_PROMPT_VERSION, audience: "public", evidenceTierMax: "public",
    write: (m, text) => M.writeElevatorAd(m, env.brand, text),
    texts: (o) => ({ en: `${o.headline_en}\n${o.en}`, ar: [o.headline_ar, o.ar, ...o.shot_list.map((s) => s.on_screen_text_ar)].filter(Boolean).join("\n") }),
    // On-screen captions are Arabic only; the English and Arabic voice-overs carry the same figures.
    parity: (o) => ({ en: `${o.headline_en}\n${o.en}`, ar: `${o.headline_ar}\n${o.ar}` }),
    render: (o) => ({
      en: [`# ${o.headline_en}`, o.en, ...(o.shot_list.length ? ["## Shots (real footage only)", ...o.shot_list.map((s, i) => `- ${i + 1}. ${s.shot}`)] : [])].join("\n\n"),
      ar: [`# ${o.headline_ar}`, o.ar, ...(o.shot_list.length ? ["## النص على الشاشة", ...o.shot_list.map((s, i) => `- ${i + 1}. ${s.on_screen_text_ar}`)] : [])].join("\n\n"),
    }),
    title: (o) => `Elevator ${input.format === "post" ? "post" : "reel"}, ${input.channel}: ${o.headline_en}`,
    content: (o) => ({ format: input.format, channel: input.channel, register: input.register, headline_en: o.headline_en, headline_ar: o.headline_ar, shot_list: o.shot_list }),
    checks: (o) => {
      const out: Check[] = [];
      if (input.format === "reel_script" && o.shot_list.length < 3) out.push(fail("elevator.reel_shots", `${o.shot_list.length} shots`, "A reel script needs at least three shots, each from real footage."));
      if (input.format === "post" && o.shot_list.length) out.push(signal("elevator.post_shots", `${o.shot_list.length} shots`, "A post has no shot list; the shots were ignored."));
      return out;
    },
  };
  return contentWorkflow(env, spec, { task: "elevator_ad", ...input, focus: input.focus ?? null }, records);
}

// ---------------------------------------------------------------- #29 Web page

export const WebPageInput = z.object({
  page_url: z.string().url(),
  instructions: z.string().max(1500).optional(),
});
export type WebPageInput = z.infer<typeof WebPageInput>;

/** What the live page shows today, from the site check's own reading of it. */
export interface PageSnapshot {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  hasForm: boolean;
  failures: Array<{ rule: string; quote: string; why: string }>;
}

const MAX_PAGE_TEXT = 14_000;

export async function webPageWorkflow(env: WorkflowEnv, raw: unknown, page: PageSnapshot, records: EvidenceRecord[]): Promise<WorkflowResult> {
  const input = WebPageInput.parse(raw);
  const path = new URL(page.url).pathname || "/";
  const spec: ContentSpec<M.WebPage> = {
    artifactType: "web_page", agent: M.WEB_AGENT, promptVersion: M.WEB_PROMPT_VERSION, audience: "public", evidenceTierMax: "public",
    write: (m, text) => M.writeWebPage(m, env.brand, text),
    texts: (o) => ({
      en: [o.title_en, o.description_en, o.en, o.form_consent_en].filter(Boolean).join("\n\n"),
      ar: [o.title_ar, o.description_ar, o.ar, o.form_consent_ar].filter(Boolean).join("\n\n"),
    }),
    render: (o) => ({
      en: [`Title: ${o.title_en}`, `Description: ${o.description_en}`, o.en, ...(o.form_consent_en ? [`## Consent sentence for the form\n${o.form_consent_en}`] : [])].join("\n\n"),
      ar: [`العنوان: ${o.title_ar}`, `الوصف: ${o.description_ar}`, o.ar, ...(o.form_consent_ar ? [`## جملة الموافقة في النموذج\n${o.form_consent_ar}`] : [])].join("\n\n"),
    }),
    title: () => `Web page: ${path}`,
    content: (o) => ({ page_url: page.url, title_en: o.title_en, title_ar: o.title_ar, description_en: o.description_en, description_ar: o.description_ar,
      changes: o.changes, form_consent_en: o.form_consent_en, form_consent_ar: o.form_consent_ar, failures_fixed: page.failures.length }),
    checks: (o) => {
      const out: Check[] = [];
      if (o.title_en.length > 60) out.push(signal("web.title_length", o.title_en, `The title is ${o.title_en.length} characters; search results show about 60.`));
      if (o.title_ar.length > 60) out.push(signal("web.title_length", o.title_ar, `The Arabic title is ${o.title_ar.length} characters; search results show about 60.`, "ar"));
      if (o.description_en.length > 160) out.push(signal("web.description_length", o.description_en, `The description is ${o.description_en.length} characters; search results show about 160.`));
      if (page.hasForm && (!o.form_consent_en.trim() || !o.form_consent_ar.trim())) {
        out.push(fail("web.form_consent", "enquiry form", "The page has an enquiry form, so it needs the consent sentence in both languages (the G0 bar)."));
      }
      return out;
    },
    note: (o) => `${o.changes.length} change(s) to the live copy${o.for_asil_to_check.length ? `; ${o.for_asil_to_check.length} point(s) for Asil to check` : ""}.`,
  };
  const request = {
    task: "web_page",
    page_url: page.url,
    current_title: page.title,
    current_description: page.description,
    has_enquiry_form: page.hasForm,
    current_text: page.text.length > MAX_PAGE_TEXT ? `${page.text.slice(0, MAX_PAGE_TEXT)}\n[the rest of the page is cut]` : page.text,
    failures: page.failures,
    instructions: input.instructions ?? null,
  };
  return contentWorkflow(env, spec, request, records);
}
