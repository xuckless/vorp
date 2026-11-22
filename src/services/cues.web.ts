// The join and live cues, synthesised with Web Audio, plus a tap of vibration where there is one.
// Ported from the owner's Vorp design (xuckless/the-wallpaper-project src/vorp/cues.ts):
//
//   joined  two sine notes rising a fifth, E5 then B5, 90 ms apart; 6 ms attack, 260 ms
//           exponential decay, about -20 dBFS; vibrate 12 ms.
//   live    the same two notes as one soft chord an octave lower, E4 + B4, 380 ms decay;
//           vibrate 8-40-8.
//
// iPhone Safari has no vibration: the sound and the visual ripple carry it there. Its audio needs
// a tap first, so `prime` makes the context inside one.

import type { Cues } from './types';

function note(ac: AudioContext, hz: number, at: number, decay: number, gain = 0.1) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = hz;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + decay + 0.02);
}

export function createCues(): Cues {
  let ctx: AudioContext | null = null;
  const context = () => {
    ctx ??= new AudioContext();
    void ctx.resume().catch(() => {});
    return ctx;
  };
  return {
    prime() {
      try {
        context();
      } catch {
        // No audio: the visual pulse still carries the moment.
      }
    },
    play(kind) {
      try {
        const ac = context();
        const t = ac.currentTime + 0.02;
        if (kind === 'joined') {
          note(ac, 659.25, t, 0.26);
          note(ac, 987.77, t + 0.09, 0.26);
        } else {
          note(ac, 329.63, t, 0.38, 0.08);
          note(ac, 493.88, t, 0.38, 0.07);
        }
      } catch {
        // No audio: the visual pulse still carries the moment.
      }
      navigator.vibrate?.(kind === 'joined' ? 12 : [8, 40, 8]);
    },
  };
}
