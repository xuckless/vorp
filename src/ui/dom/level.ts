// A voice level for a DOM component: a getter on web (read every frame, no React renders), sampled
// numbers on native (props cross the web view's bridge). Kept apart from ./index.ts so React Native
// code can import it without the DOM design system.

export { useLevelProp } from '../effects/level';
