// The one place that picks implementations. Metro resolves the .web / .native files.

import { createAudioInput } from './audio-input';
import { createAudioOutput } from './audio-output';
import { createRecap } from './recap';
import { createTranslator } from './translator';
import type { Services } from './types';

export { createDemoServices } from './demo';
export { createStorage } from './storage';
export type { KeyValueStorage, Services } from './types';

export function createServices(): Services {
  return { input: createAudioInput(), output: createAudioOutput(), translator: createTranslator(), recap: createRecap() };
}
