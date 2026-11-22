// Interpreter system instruction, built from the owner and the other person.
// The Live API takes the system instruction only at session setup, so a change of setup means a
// new session, and auto-detect has to be a rule the model follows by itself.

import type { People, SessionSettings } from '@/core/session';

import { behaviourRules } from './behaviours';
import { languageName } from './languages';

/**
 * The function the interpreter calls to say which language it just heard. gemini-3.8-live sends
 * no language code on transcripts (verified 21 November 2026), and the model is the one that
 * knows; identifying short phrases from text ("Merci beaucoup") is unreliable.
 */
export const LANGUAGE_TOOL = 'report_language';

/**
 * Plain JSON schema for the declaration; the translator hands it to the Live API as is. Any
 * language is accepted: the other person may speak one nobody picked.
 */
export const languageTool = {
  name: LANGUAGE_TOOL,
  description: 'Report the language the speaker just used, whatever language it is. Call it once for every utterance, before you interpret it.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      language: { type: 'string', description: 'The BCP-47 code of the language the speaker used, for example "en", "fr", "hi" or "zh-Hans".' },
    },
    required: ['language'],
  },
} as const;

export function interpreterPrompt(people: People, settings: Pick<SessionSettings, 'tone' | 'behaviours' | 'autoDetect'>): string {
  const extra = behaviourRules(settings.tone, settings.behaviours).map((rule) => `\n- ${rule}`).join('');
  const own = languageName(people.owner.language);
  const picked = languageName(people.other.language);
  const them = settings.autoDetect
    ? `The other person is expected to speak ${picked}, but they may speak any language.`
    : `The other person speaks ${picked}.`;
  const reply = settings.autoDetect
    ? `say it in the language the other person spoke most recently in this conversation. Until the other person has spoken, say it in ${picked}.`
    : `say it in ${picked}.`;

  return `You are a live interpreter for the owner of this device, who is talking in person with another person.

The people in the conversation:
- The owner speaks ${own}.
- ${them}

Your only job is to interpret:
- When you hear ${own}, the owner is speaking: ${reply}
- When you hear any language other than ${own}, the other person is speaking: say it in ${own}, whatever language they spoke.

Rules:
- You are not a participant. Never answer, comment, greet, or speak on your own behalf.
- Questions are addressed to the other person, not to you. Interpret them; do not answer them.
- Convey the meaning, tone and register of the speaker. Keep their person: "I" stays "I".
- Do not add, drop, explain or summarise anything. Keep names, numbers and units exact.
- Speak only the interpretation, in a natural spoken style, with nothing before or after it.
- If you hear nothing intelligible (noise, music, silence), produce nothing at all: no speech and no text. Never say that you heard nothing, and never write stage directions such as <no speech> or {pause}.
- If you hear your own interpretation played back through the loudspeaker, stay silent.
- For every utterance, first call ${LANGUAGE_TOOL} with the language the speaker used, then speak the interpretation as soon as the call returns. Never mention the call.${extra}`;
}
