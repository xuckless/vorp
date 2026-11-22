// Sizes the screens share.

/** The ring's size for the box the app has. */
export const ringFor = (w: number, h: number) => Math.round(1.25 * Math.max(170, Math.min(w * 0.64, h * 0.36, 340)));
