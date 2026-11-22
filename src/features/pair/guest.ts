// The guest's pairing: a paired runtime on services that stay light until they are needed (see
// services/guest.ts). The guest keeps nothing: no history, no settings, no learnt voice.

import { DEFAULT_SETTINGS } from '@/config/policies';
import { GUEST_VOICE, GUEST_VOICE_FILTER, pairedSettings } from '@/config/pairing';
import { INTERPRETER_VOICE } from '@/config/voices';
import { createGuestPairServices } from '@/services/guest';

import { createPairRuntime, type PairRuntime } from './runtime';

export function createGuestPairing(code: string, language: string, onLeave: (language: string) => void): PairRuntime {
  return createPairRuntime(
    createGuestPairServices(GUEST_VOICE_FILTER),
    'guest',
    // The host's interpreter voice is the host's choice, unknown here; the guest learns it afresh.
    { language, voice: GUEST_VOICE, peerVoice: INTERPRETER_VOICE, settings: pairedSettings(DEFAULT_SETTINGS) },
    code,
    { onLeave },
  );
}
