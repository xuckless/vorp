// The slot registry: one table from each slot to its implementations, and which one is chosen.
// Choosing an implementation is a data change (DEFAULT_SLOTS) or, at runtime, `chooseSlot`.
// App code renders the slot components below and never imports an implementation directly.

import { useSyncExternalStore, type ComponentType } from 'react';

import { createStore } from '@/core/store';
import { BeamMessageSurface, botAvatar, orbIndicator, VoiceRingVisualiser, WaveCaptionTransition } from '@/ui/effects';

import type { SlotName, SlotProps } from './contracts';
import { PlainAgentAvatar, PlainCaptionTransition, PlainMessageSurface, PlainThinkingIndicator, PlainVoiceVisualiser } from './standins';

type Implementations = { [S in SlotName]: Record<string, ComponentType<SlotProps[S]>> };

export const SLOT_REGISTRY = {
  thinkingIndicator: {
    plain: PlainThinkingIndicator,
    orbWeaving: orbIndicator('weaving'),
    orbComposing: orbIndicator('composing'),
    orbBreathing: orbIndicator('breathing'),
    orbConnecting: orbIndicator('connecting'),
  },
  voiceVisualiser: {
    plain: PlainVoiceVisualiser,
    voiceRing: VoiceRingVisualiser,
  },
  agentAvatar: {
    plain: PlainAgentAvatar,
    botClover: botAvatar('clover'),
    botFlower: botAvatar('flower'),
    botStar: botAvatar('star'),
    botGhost: botAvatar('ghost'),
  },
  messageSurface: {
    plain: PlainMessageSurface,
    borderBeam: BeamMessageSurface,
  },
  captionTransition: {
    plain: PlainCaptionTransition,
    distortionWave: WaveCaptionTransition,
  },
} as const satisfies Implementations;

export type ImplementationId<S extends SlotName> = keyof (typeof SLOT_REGISTRY)[S] & string;
export type SlotChoices = { [S in SlotName]: ImplementationId<S> };

/** PROVISIONAL picks, until the design prototype chooses. */
export const DEFAULT_SLOTS: SlotChoices = {
  thinkingIndicator: 'orbWeaving',
  voiceVisualiser: 'voiceRing',
  agentAvatar: 'botClover',
  messageSurface: 'borderBeam',
  captionTransition: 'distortionWave',
};

/** The chosen implementation per slot. Settings (phase 5) will persist it. */
export const slotChoices = createStore<SlotChoices>(DEFAULT_SLOTS);

export function chooseSlot<S extends SlotName>(slot: S, id: ImplementationId<S>) {
  slotChoices.set({ ...slotChoices.get(), [slot]: id });
}

export function useSlotChoices(): SlotChoices {
  return useSyncExternalStore(slotChoices.subscribe, slotChoices.get, slotChoices.get);
}

export function implementationIds<S extends SlotName>(slot: S): ImplementationId<S>[] {
  return Object.keys(SLOT_REGISTRY[slot]) as ImplementationId<S>[];
}

/** The implementation registered under `id` for `slot`. */
export function implementation<S extends SlotName>(slot: S, id: ImplementationId<S>): ComponentType<SlotProps[S]> {
  return (SLOT_REGISTRY as Implementations)[slot][id];
}

function slotComponent<S extends SlotName>(slot: S) {
  function Slot(props: SlotProps[S]) {
    const Impl = implementation(slot, useSlotChoices()[slot]);
    // eslint-disable-next-line react-hooks/static-components -- the registry table is static; the choice picks a row
    return <Impl {...props} />;
  }
  Slot.displayName = slot;
  return Slot;
}

export const ThinkingIndicator = slotComponent('thinkingIndicator');
export const VoiceVisualiser = slotComponent('voiceVisualiser');
export const AgentAvatar = slotComponent('agentAvatar');
export const MessageSurface = slotComponent('messageSurface');
export const CaptionTransition = slotComponent('captionTransition');
