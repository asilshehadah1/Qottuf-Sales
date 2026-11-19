// Everything the browser console uses, compiled into one script (console/qottuf-console.js) by
// scripts/build-console.mjs. Only pure modules: no database, no file system, no SDK.

export { BrandRulesSchema, brandCheck } from "../gates/brand.ts";
export { checkClaims, rulebookFigures } from "../gates/claims.ts";
export { findNumericMentions } from "../gates/numbers.ts";
export { redact, scanPii } from "../gates/pii.ts";
export { checkParity, glossarySignals } from "../gates/parity.ts";
export { runTextGates, isStrict } from "../gates/runGates.ts";
export { BusinessRulesSchema } from "../config/schema.ts";
export { AccountInput, NextStep, EvidenceInput, TIER_RANK } from "../ledger/schemas.ts";
export { projectProof } from "../ledger/proof.ts";
export { figuresFromEvidence, riyadhDate } from "../ledger/figures.ts";
export { allowedNext, isOpen, initialStages, LOSS_REASONS, CONTRACTING_STAGES, ELEVATOR_STAGES } from "../pipeline/stages.ts";
export { scoreOpportunity } from "../pipeline/scorecard.ts";
export { dueItems, addYears, MaintenanceContract } from "../installedBase/due.ts";
export { EntityFields, compareToEntity, checkAgainstRulebook, phoneKey } from "../entity/compare.ts";
export { auditHtml, siteVerdict } from "../site/siteChecker.ts";
export { caseStudyWorkflow, CaseStudyInput } from "../workflows/caseStudy.ts";
export { meetingBriefWorkflow, meetingDebriefWorkflow, BriefInput, DebriefInput } from "../workflows/meetings.ts";
export { bilingualWorkflow, BilingualInput } from "../workflows/bilingual.ts";
export { SampleModelClient } from "./sampleClient.ts";
export {
  newOpportunity, setNextStep, moveOpportunity, screenOpportunity, decideBid, consoleAlerts, registryGaps, renewalCandidates, RuleError,
} from "./engine.ts";
export {
  ModelCancelledError, ModelOutputError, ModelRefusalError, ModelTransientError, ModelTruncatedError, ModelUnavailableError,
} from "../model/core.ts";
