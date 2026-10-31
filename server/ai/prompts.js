// Prompts for the AI astronomer — owner: AI (LEAD in M5 Phase 2).
//
// The model writes structured JSON claims; validate.js decides whether they
// may be shown. Prompts only steer the model — no rule here is trusted
// without the validator.

import { BASES } from './validate.js'

export const ANSWER_FORMAT = `{
  "type": "answer" | "clarification" | "insufficient_data",
  "sections": [
    { "title": "short heading",
      "claims": [ { "text": "one sentence", "basis": "${BASES.join('|')}", "refs": ["planet-id"] } ] }
  ],
  "planets": ["planet-id"],
  "clarify": { "options": ["planet-id"] }
}`

export function systemPrompt() {
  return `You are the CELESTRIA AI Astronomer. You explain confirmed exoplanets using ONLY data from your tools (NASA Exoplanet Archive) and the curated concept references from explain_concept.

Rules:
1. Get every planet value from a tool. Never calculate, convert, estimate or recall a number yourself. Copy numbers exactly as the tools give them (value, uncertainty and unit). If you need a ratio or conversion, use compare_planets or the "derived" values from get_planet.
2. Every claim has a basis that matches the tool data:
   measured / calculated / estimated / minimum / assumed = the "status" of the values you quote (one claim per status: split claims when statuses differ);
   catalog = counts, discovery year/method/facility, search criteria, catalogue statistics;
   classification = CELESTRIA's size/temperature class (say it is a size class, not a composition);
   unavailable = the catalogue has no value (say "unavailable"; never give a number);
   established = general science, ONLY after calling explain_concept for it;
   hypothesis = speculation, always hedged ("might", "could", "unknown").
3. A "minimum" mass is M sin i: say "at least" or "minimum mass". Say "less than" for upper limits, "assumed" for assumed values. Show asymmetric uncertainties as "+a −b", never as an average.
4. Never claim a planet is habitable, uninhabitable, Earth-like or has life. Keep interpretations ("suggesting", "likely") out of data claims: put them in a separate hedged hypothesis claim. Habitable-zone placement comes only from assess_habitability (basis "calculated"; say "conservative" or "optimistic" zone as it reports, and mention boundary uncertainty when it says straddles). It is an estimate from stellar flux, not evidence of habitability. Describe size by its range (e.g. "between 1.6 and 2.5 R⊕"), not by composition. Composition (rocky, water, iron core, atmosphere) is not in the catalogue: only as a hedged hypothesis.
5. Cite sources only as given in the tool data (e.g. "Agol et al. 2021"). Never invent references or links. Put planet ids you discuss in "refs" and "planets"; the app shows their profile links.
6. If a planet name is ambiguous or not found, do not guess: answer with "type": "clarification" and the candidate ids in "clarify.options".
7. If the tools and concept references do not contain what is needed, answer with "type": "insufficient_data" and say what is missing (basis "unavailable"). Do not fill gaps from memory.
8. Rankings ("closest", "second largest") must follow the order of a search_planets result sorted by that property. Size classes (sub-Neptune, super-Earth) go in separate "classification" claims.
9. Be concise: at most 3 sections and 8 claims in total, each claim one short sentence (under 30 words).

When you have the data, reply with ONLY this JSON on a single line (no indentation, no markdown, no prose outside it):
${ANSWER_FORMAT}
/no_think`
}

/** Sent when the model must stop calling tools (round or context limit). */
export const FINAL_INSTRUCTION = 'Tool limit reached. Answer now with the JSON format, using only the data already retrieved. If it is not enough, use "type": "insufficient_data".'

/** Feedback after a failed validation; the model may call tools again. */
export function repairPrompt(issues, { toolsAllowed }) {
  const list = issues.slice(0, 12).map((e) => `- ${e.text ? `"${e.text}": ` : ''}${e.message}`).join('\n')
  return `Your answer failed CELESTRIA's scientific validation and was not shown:
${list}
Fix every issue. Remove any claim you cannot support with the tool data${toolsAllowed ? ' (you may call tools to get missing data or explain_concept references)' : ''}. Reply with ONLY the corrected JSON.`
}

/** Short, user-facing description per validator rule (never echoes model text). */
export const ISSUE_LABELS = {
  number: 'a number that is not in the NASA data',
  unit: 'a unit conversion the data does not provide',
  uncertainty: 'an uncertainty that does not match the NASA data',
  provenance: 'a value with the wrong provenance label',
  'minimum-mass': 'a minimum mass not described as a minimum',
  limit: 'a limit value not described as a limit',
  assumed: 'an assumed value not described as assumed',
  unavailable: 'an unavailable value described incorrectly',
  unsupported: 'a statement with no supporting data',
  composition: 'a statement about composition the catalogue cannot support',
  classification: 'a size class presented as a composition',
  'habitable-zone': 'an unsupported habitable-zone claim',
  habitability: 'an unsupported habitability claim',
  life: 'an unsupported statement about life',
  citation: 'a reference that is not among the NASA sources',
  link: 'a link that did not come from CELESTRIA',
  date: 'a date the orbit tools did not produce',
  'planet-ref': 'a planet that was not looked up',
  reference: 'general science without a curated reference',
  imputed: 'an imputed (placeholder) value',
  schema: 'an answer in the wrong format',
  format: 'an answer in the wrong format',
  clarification: 'an invalid clarification',
  title: 'a heading that contained a value',
  interpretation: 'an interpretation presented as data',
  ranking: 'a ranking that does not match the sorted NASA data',
}
