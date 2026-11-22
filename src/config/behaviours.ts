// What the interpreter does beyond interpreting, as tables. A row contributes prompt text and,
// where it needs one, a tool declaration. Turning a row off removes its contribution; no feature
// code branches on it.

/** How the interpretation should sound. One row is chosen per conversation. */
export const TONES = [
  { id: 'neutral', label: 'Neutral', prompt: '' },
  { id: 'casual', label: 'Casual', prompt: 'Use a casual, friendly register in every interpretation, as between friends.' },
  { id: 'formal', label: 'Formal', prompt: 'Use a formal, polite register in every interpretation, with the polite form of address.' },
] as const;

export type ToneId = (typeof TONES)[number]['id'];
export const DEFAULT_TONE: ToneId = 'neutral';

/** The function the interpreter calls to attach a written note to a caption. */
export const NOTE_TOOL = 'add_note';

type ToolDeclaration = { name: string; description: string; parametersJsonSchema: object };

export type Behaviour = {
  id: string;
  label: string;
  help: string;
  /** On for a new user. */
  default: boolean;
  /** Not proven reliable yet; shown as such in settings. */
  experimental?: boolean;
  /** Added to the interpreter's rules while the row is on. */
  prompt: string;
  tool?: ToolDeclaration;
  /** Runs in the app, not in the interpreter's prompt. */
  appOnly?: boolean;
};

export const BEHAVIOURS: readonly Behaviour[] = [
  {
    id: 'culturalNotes',
    label: 'Cultural notes',
    help: 'Idioms and references get a short written note, never spoken',
    default: true,
    prompt: `When the speaker uses an idiom, a proverb or a cultural reference that does not carry over literally, call ${NOTE_TOOL} with one short sentence, in the language you are interpreting into, that explains it. Call it before you speak, and never say the note aloud. Most utterances need no note.`,
    tool: {
      name: NOTE_TOOL,
      description: 'Attach a short written note to the caption of the utterance being interpreted. It is shown, never spoken.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          note: {
            type: 'string',
            description: 'One short sentence written strictly in the target language (the language you are interpreting into, not the source language), explaining the idiom or cultural reference and quoting the original phrase if helpful.',
          },
        },
        required: ['note'],
      },
    },
  },
  {
    id: 'askWhenUnsure',
    label: 'Ask when unsure',
    help: 'Asks the speaker to repeat instead of guessing',
    default: false,
    experimental: true,
    prompt: 'If you could not make out what the speaker said, do not guess: ask them, in their own language and in one short sentence, to repeat it. This is the only time you speak for yourself.',
  },
  {
    id: 'recap',
    label: 'Recap',
    help: 'A summary in every language when the conversation ends',
    default: true,
    prompt: '',
    appOnly: true,
  },
];

export const DEFAULT_BEHAVIOURS: string[] = BEHAVIOURS.filter((b) => b.default).map((b) => b.id);

const chosen = (ids: readonly string[]) => BEHAVIOURS.filter((b) => ids.includes(b.id));

/** The rules the chosen tone and behaviours add to the interpreter's prompt. */
export function behaviourRules(tone: string, ids: readonly string[]): string[] {
  const toneRule = TONES.find((t) => t.id === tone)?.prompt ?? '';
  return [toneRule, ...chosen(ids).map((b) => b.prompt)].filter((rule) => rule !== '');
}

export function behaviourTools(ids: readonly string[]): ToolDeclaration[] {
  return chosen(ids).flatMap((b) => (b.tool ? [b.tool] : []));
}
