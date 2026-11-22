// The heavy half of the web app, as one async chunk: the owner's app, the paired conversation view
// (the ring and its engines) and the translator (the Gemini Live SDK). Metro puts a module that two
// async chunks share into the common chunk every page loads up front, so everything heavy is
// reached only through this one module: the owner's route loads it for the app, and the guest's
// page loads it once they tap Join (the dev gallery too). The guest's language page stays light.

export { Vorp } from '@/features/conversation/Vorp';
export { PairTalk } from '@/features/pair/dom/PairTalk';
export { createTranslator } from '@/services';
export { GalleryScreen } from '@/features/gallery/GalleryScreen';
