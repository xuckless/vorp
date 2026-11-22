// The host's pairing: a paired runtime on the app's own services and owners. Made fresh from the
// setup each time the owner taps "Pair a phone"; the booth loop reuses it for the next visitor.

import { GUEST_VOICE, pairedSettings } from '@/config/pairing';
import type { People, Role, SessionSettings, Utterance } from '@/core/session';
import type { Embedding } from '@/core/voiceprint';
import type { InterpreterPrints } from '@/features/conversation/voice';
import { createHostPairServices } from '@/services';

import { createPairRuntime, type PairRuntime } from './runtime';

export function createHostPairing(
  /** The owner's setup on Start: their language, their interpreter voice, their settings. */
  setup: { people: People; settings: SessionSettings },
  owners: {
    keep: (languages: Record<Role, string>, utterances: Utterance[], settings: SessionSettings) => void;
    ownerPrint: () => Embedding | undefined;
    interpreterPrints: InterpreterPrints;
  },
): PairRuntime {
  const settings = pairedSettings(setup.settings);
  return createPairRuntime(
    createHostPairServices(),
    'host',
    { language: setup.people.owner.language, voice: setup.people.owner.voice, peerVoice: GUEST_VOICE, settings },
    undefined,
    {
      onArchive: (languages, utterances) => owners.keep(languages, utterances, settings),
      ownerPrint: owners.ownerPrint,
      // The guest's phone speaks in its default voice: learnt prints of it filter its echo here.
      interpreterPrints: owners.interpreterPrints,
    },
  );
}
