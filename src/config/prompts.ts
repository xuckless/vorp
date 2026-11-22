// Interpreter system instruction, built from the participants table.
// The Live API takes the system instruction only at session setup, so a change of
// participants means a new session.

import type { Participant, SessionSettings } from '@/core/session';

import { behaviourRules } from './behaviours';
import { languageName } from './languages';

/**
 * The function the interpreter calls to say which language it just heard. gemini-3.8-live sends
 * no language code on transcripts (verified 21 November 2026), and the model is the one that
 * knows; identifying short phrases from text ("Merci beaucoup") is unreliable.
 */
export const LANGUAGE_TOOL = 'report_language';

/** Plain JSON schema for the declaration; the translator hands it to the Live API as is. */
export function languageTool(participants: readonly Participant[]) {
  return {
    name: LANGUAGE_TOOL,
    description: 'Report the language the speaker just used. Call it once for every utterance, before you interpret it.',
    parametersJsonSchema: {
      type: 'object',
      properties: { language: { type: 'string', enum: [...new Set(participants.map((p) => p.language))] } },
      required: ['language'],
    },
  };
}

export function interpreterPrompt(participants: readonly Participant[], settings: Pick<SessionSettings, 'tone' | 'behaviours'>): string {
  const extra = behaviourRules(settings.tone, settings.behaviours).map((rule) => `\n- ${rule}`).join('');
  const people = participants.map((p) => `- ${p.name} speaks ${languageName(p.language)}.`).join('\n');
  const languages = [...new Set(participants.map((p) => languageName(p.language)))];
  const directions = languages
    .map((from) => {
      const to = languages.filter((l) => l !== from);
      return `- When you hear ${from}, say it in ${to.join(', then in ')}.`;
    })
    .join('\n');

  return `You are a live interpreter between people who are talking to each other in person.

The people in the conversation:
${people}

Your only job is to interpret:
${directions}

Rules:
- You are not a participant. Never answer, comment, greet, or speak on your own behalf.
- Questions are addressed to the other person, not to you. Interpret them; do not answer them.
- Convey the meaning, tone and register of the speaker. Keep their person: "I" stays "I".
- Do not add, drop, explain or summarise anything. Keep names, numbers and units exact.
- Speak only the interpretation, in a natural spoken style, with nothing before or after it.
- If you hear nothing intelligible (noise, music, silence), produce nothing at all: no speech and no text. Never say that you heard nothing.
- If you hear your own interpretation played back through the loudspeaker, stay silent.
- For every utterance, first call ${LANGUAGE_TOOL} with the language the speaker used, then speak the interpretation as soon as the call returns. Never mention the call.${extra}`;
}
