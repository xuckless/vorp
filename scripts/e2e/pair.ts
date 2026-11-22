// Pair by QR end to end, by hand (not part of `bun test`): two headless Chromes, a host and a guest,
// each with a fake microphone, against the running dev server and token server, with REAL Gemini
// sessions on both phones (it costs real usage: one short exchange each way).
//
// The host (English) pairs and its code is opened by the guest (French browser). The host says one
// sentence; the guest starts talking while that translation arrives, so it waits ("Waits until you
// finish") and plays when the guest stops; the guest's sentence plays on the host. Then the host
// ends it for both: the host's end card, History; the guest's ended card, goodbye, landing page.
// Screenshots of each moment go to E2E_OUT; a timeline with what was seen when is printed.
//
// Needs: the dev server (`bun run web`, :8081), the token server (`bun run token-server`, :8787,
// GEMINI_API_KEY), a Chromium (CHROME, or Playwright's headless shell). The microphones are Web
// Audio streams the script makes speak the fixtures on cue (E2E_GUEST_AFTER: seconds between).
// Run: bun run e2e:pair

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { launch, wait, type Page } from './cdp';

const APP = process.env.E2E_APP ?? 'http://localhost:8081';
const OUT = process.env.E2E_OUT ?? join(tmpdir(), 'vorp-pair');
const FX = join(import.meta.dir, 'fixtures');
mkdirSync(OUT, { recursive: true });

/**
 * In each page: remember the room socket's address, and log in the console what goes over the
 * sockets (Gemini's messages in brief, a count of audio sent, the room's text messages).
 */
const WATCH = `(() => {
  // The microphone: a Web Audio stream that is silent until the driver calls __speak(wav as base64).
  // (Chrome's --use-file-for-fake-audio-capture delivers silence in the headless shell.)
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    window.__speak = async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (x) => x.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.start();
      return buf.duration;
    };
    return dest.stream;
  };
  const W = WebSocket;
  const brief = (v) => JSON.stringify(v, (k, x) => (typeof x === 'string' && x.length > 60 ? x.slice(0, 16) + '…' : x)).slice(0, 220);
  window.WebSocket = class extends W {
    constructor(u, p) {
      super(u, p);
      const room = String(u).includes('/rooms/');
      if (!room && !String(u).includes('generativelanguage')) return;
      if (room) window.__room = String(u);
      let audio = 0;
      const send = this.send.bind(this);
      this.send = (d) => {
        if (typeof d !== 'string') { audio++; return send(d); }
        if (d.includes('realtimeInput') && d.includes('audio')) audio++;
        else console.log((room ? 'ROOM> ' : 'LIVE> ') + d.slice(0, 200));
        return send(d);
      };
      setInterval(() => { if (audio) console.log((room ? 'ROOM> ' : 'LIVE> ') + 'audio frames ' + audio); audio = 0; }, 3000);
      this.addEventListener('message', async (m) => {
        if (typeof m.data !== 'string' && room) return;
        if (typeof m.data !== 'string' && m.data.size > 4000) return;
        const text = typeof m.data === 'string' ? m.data : await new Response(m.data).text();
        if (text.includes('inlineData')) return;
        console.log((room ? 'ROOM< ' : 'LIVE< ') + brief(JSON.parse(text)));
      });
    }
  };
})()`;

const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
const log = (who: string, what: string) => console.log(`${at()}s ${who.padEnd(5)} ${what}`);
const shot = async (page: Page, name: string) => {
  await page.screenshot(join(OUT, `${name}.png`));
  log('shot', name);
};

/** Waits until the page's text matches, polling; returns when it did (seconds since start) or undefined. */
async function until(page: Page, re: RegExp, seconds: number): Promise<number | undefined> {
  for (let i = 0; i < seconds * 5; i++) {
    if (re.test(await page.text())) return (Date.now() - t0) / 1000;
    await wait(200);
  }
  return undefined;
}

const host = await launch({ port: 9311, languages: 'en-US,en' });
const guest = await launch({ port: 9312, languages: 'fr-FR,fr,en' });
const wav = async (name: string) => Buffer.from(await Bun.file(join(FX, name)).arrayBuffer()).toString('base64');
/** Make a phone's owner say a fixture; resolves with when the speech ends (seconds since start). */
const speak = async (page: Page, name: string) => {
  const seconds = await page.evaluate<number>(`window.__speak(${JSON.stringify(await wav(name))})`);
  return (Date.now() - t0) / 1000 + seconds;
};
/** The guest starts talking this long after the host does, so the host's translation arrives while the guest talks. */
const GUEST_AFTER = Number(process.env.E2E_GUEST_AFTER ?? 4);
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => {
  checks.push([name, ok]);
  log('check', `${ok ? 'ok  ' : 'FAIL'} ${name}`);
};

try {
  const h = await host.open(`${APP}/`, WATCH);
  await until(h, /Pair a phone/, 60);
  await shot(h, '01-host-start');

  await h.click(/Pair a phone/);
  log('host', 'Pair a phone (microphone opens)');
  await until(h, /Expires in/, 20);
  await wait(800);
  await shot(h, '02-host-waiting');
  const room = await h.evaluate<string>('window.__room');
  const code = decodeURIComponent(room.split('/rooms/')[1]);
  const url = `${APP}/join/${encodeURIComponent(code)}?host=en`;
  log('host', `code ${code.slice(0, 6)}…  QR ${url.replace(code, code.slice(0, 6) + '…')}`);

  const g = await guest.open(url, WATCH);
  const painted = await until(g, /Rejoindre|Join/, 30);
  log('guest', `language page painted`);
  await wait(1500);
  await shot(g, '03-guest-pick');
  check('guest page speaks French from the browser', /Quelqu’un|Rejoindre/.test(await g.text()));
  const chunks = await g.evaluate<string[]>(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\\.(js|bundle)/.test(n) || n.includes('bundle'))`);
  log('guest', `scripts before Join: ${chunks.length} (${chunks.map((c) => c.split('/').pop()?.split('?')[0]).join(', ').slice(0, 300)})`);
  const voiceprintBefore = await g.evaluate<boolean>(`performance.getEntriesByType('resource').some((e) => /voiceprint|models\\//.test(e.name))`);
  check('guest page loads no voiceprint model before the conversation', !voiceprintBefore);
  void painted;

  await g.click(/Rejoindre/);
  log('guest', 'Join (microphone and speaker open)');
  await wait(300);
  await shot(g, '04-guest-joining');
  const joined = await until(h, /They’re in/, 15);
  check('host sees "They’re in"', joined !== undefined);
  await shot(h, '05-host-joined');

  const hostLive = await until(h, /Their phone/, 15);
  log('host', 'conversation view');
  const guestLive = await until(g, /Son téléphone|Their phone/, 15);
  log('guest', 'conversation view');
  check('both phones reach the conversation', hostLive !== undefined && guestLive !== undefined);
  await until(h, /Listening/, 20);
  await wait(500);
  await shot(h, '06-host-live');
  await shot(g, '07-guest-live');

  // The host speaks, and the guest starts talking while the host's translation arrives.
  await until(g, /À l’écoute/, 20);
  await wait(1500);
  const hostSpeechEnd = await speak(h, 'en.wav');
  log('host', `says "Hello, where is the nearest bus stop? …" until ${hostSpeechEnd.toFixed(1)}s`);
  const plan = (async () => {
    await wait(GUEST_AFTER * 1000);
    const end = await speak(g, 'fr.wav');
    log('guest', `says "Bonjour. L’arrêt d’autobus est juste là …" until ${end.toFixed(1)}s`);
    return end;
  })();

  const seen: Record<string, number> = {};
  const moments: [Page, string, RegExp, string][] = [
    [h, 'host-hearing', /Hearing you/, '08-host-hearing-you'],
    [g, 'guest-theyre-talking', /L’autre personne parle|They’re talking/, '09-guest-theyre-talking'],
    [g, 'guest-queued', /Attend que vous ayez fini|Waits until you finish/, '10-guest-queued'],
    [h, 'host-waiting-them', /Waiting for them to finish/, '11-host-waiting-for-them'],
    [g, 'guest-playing', /Vous parle|Speaking to you/, '12-guest-playing'],
    [h, 'host-delivering', /Playing on their phone/, '13-host-delivering'],
    [h, 'host-heard', /Heard/, '14-host-heard'],
    [h, 'host-playing', /Speaking to you/, '15-host-playing-theirs'],
    [g, 'guest-delivering', /Joué sur son téléphone|sur son téléphone|Playing on their phone/, '16-guest-delivering'],
    [g, 'guest-heard', /Entendu|Heard/, '17-guest-heard'],
  ];
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline && Object.keys(seen).length < moments.length) {
    const [ht, gt] = await Promise.all([h.text(), g.text()]);
    for (const [page, name, re, file] of moments) {
      if (seen[name] !== undefined || !re.test(page === h ? ht : gt)) continue;
      seen[name] = (Date.now() - t0) / 1000;
      log(page === h ? 'host' : 'guest', name);
      await shot(page, file);
    }
    await wait(300);
  }
  const hostText = await h.text();
  const guestText = await g.text();
  console.log('\nHOST FEED:\n' + hostText + '\n\nGUEST FEED:\n' + guestText + '\n');
  for (const [, name] of moments) check(`seen: ${name}`, seen[name] !== undefined);
  if (seen['guest-playing']) log('measure', `host speech end → guest hears the translation: ${(seen['guest-playing'] - hostSpeechEnd).toFixed(1)} s (one run, polled every ~0.2 s; includes the hold while the guest talked)`);
  const guestSpeechEnd = await plan;
  if (seen['host-playing']) log('measure', `guest speech end → host hears the translation: ${(seen['host-playing'] - guestSpeechEnd).toFixed(1)} s (one run)`);
  check('captions on both sides', /Hello|bus/i.test(hostText) && /arrêt|autobus|bibliothèque/i.test(hostText) && /Bonjour|arrêt/i.test(guestText) && /arrêt de bus|autobus|Bonjour|collège/i.test(guestText));

  // The host ends it for both.
  await h.click(/End for both/);
  log('host', 'End for both');
  check('host end card', (await until(h, /Conversation saved|Conversation ended/, 10)) !== undefined);
  await shot(h, '18-host-end-card');
  check('guest sees it ended', (await until(g, /terminée|ended the conversation/, 10)) !== undefined);
  await shot(g, '19-guest-ended');
  await g.click(/Continuer|Continue/);
  await until(g, /Merci|Thanks/, 5);
  await wait(400);
  await shot(g, '20-guest-done');
  await wait(3500);
  const landed = await g.evaluate<string>('location.href');
  log('guest', `now at ${landed}`);
  check('guest goes to the landing page with its language', /\?from=session&lang=fr/.test(landed));

  // The same code again, from another phone: it was spent.
  const again = await guest.open(url, WATCH);
  await until(again, /Rejoindre/, 20);
  await again.click(/Rejoindre/);
  check('a used code says so', (await until(again, /déjà servi|already used/, 10)) !== undefined);
  await wait(400);
  await shot(again, '22-guest-code-used');

  await h.click(/Not now/);
  await until(h, /History/, 5);
  await h.click(/History/);
  await until(h, /French|Français/, 10);
  await wait(800);
  await shot(h, '21-host-history');
  check('host History has the conversation', /French/.test(await h.text()));

  console.log('\nHOST LOG:\n' + h.logs.filter((l) => !l.includes('DevTools')).slice(-60).join('\n'));
  console.log('\nGUEST LOG:\n' + g.logs.filter((l) => !l.includes('DevTools')).slice(-60).join('\n'));
} finally {
  host.close();
  guest.close();
}
const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
