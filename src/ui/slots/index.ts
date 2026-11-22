// The only way app code reaches a visual effect.

export * from './contracts';
export {
  AgentAvatar,
  CaptionTransition,
  chooseSlot,
  DEFAULT_SLOTS,
  implementation,
  implementationIds,
  MessageSurface,
  SLOT_REGISTRY,
  ThinkingIndicator,
  useSlotChoices,
  VoiceVisualiser,
  type ImplementationId,
  type SlotChoices,
} from './registry';
