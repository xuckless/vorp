// A small Chrome DevTools Protocol client for the by-hand end-to-end scripts: launch a headless
// Chrome with a fake microphone playing a file, open pages, evaluate, click, take screenshots.
// No dependencies. CHROME names the browser binary (default: chromium on PATH, else Playwright's
// headless shell on macOS).

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findChrome(): string {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
    const hit = Bun.which(name);
    if (hit) return hit;
  }
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const arch of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64']) {
        const bin = join(cache, dir, arch, 'chrome-headless-shell');
        if (existsSync(bin)) return bin;
      }
    }
  }
  throw new Error('No Chrome found: set CHROME to a Chromium binary');
}

export type Page = {
  send: (method: string, params?: object) => Promise<any>;
  evaluate: <T = unknown>(expression: string) => Promise<T>;
  /** Click the first element whose text or aria-label matches, as a real mouse would. */
  click: (match: RegExp, selector?: string) => Promise<boolean>;
  screenshot: (path: string) => Promise<void>;
  text: () => Promise<string>;
  logs: string[];
  close: () => void;
};

export type Browser = { open: (url: string, init?: string, viewport?: { width: number; height: number }) => Promise<Page>; close: () => void };

export async function launch({ port, microphone, languages = 'en-US' }: { port: number; microphone?: string; languages?: string }): Promise<Browser> {
  const dir = mkdtempSync(join(tmpdir(), 'vorp-e2e-'));
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${dir}`,
    `--remote-debugging-port=${port}`,
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    `--lang=${languages.split(',')[0]}`,
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    ...(microphone ? [`--use-file-for-fake-audio-capture=${microphone}%noloop`] : []),
    'about:blank',
  ];
  const proc: ChildProcess = spawn(findChrome(), args, { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch {
      await wait(250);
    }
  }
  return {
    async open(url, init, viewport = { width: 390, height: 844 }) {
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      let id = 0;
      const pending = new Map<number, (v: any) => void>();
      const logs: string[] = [];
      ws.onmessage = (m) => {
        const msg = JSON.parse(String(m.data));
        if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg.result ?? { error: msg.error });
        if (msg.method === 'Runtime.consoleAPICalled')
          logs.push(`${new Date().toISOString().slice(11, 23)} ${msg.params.type}: ${msg.params.args.map((a: any) => a.value ?? a.description).join(' ').slice(0, 400)}`);
        if (msg.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
      };
      await new Promise((r) => (ws.onopen = r));
      const send = (method: string, params: object = {}) =>
        new Promise<any>((r) => {
          const i = ++id;
          pending.set(i, r);
          ws.send(JSON.stringify({ id: i, method, params }));
        });
      await send('Runtime.enable');
      await send('Page.enable');
      await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 2, mobile: true });
      await send('Emulation.setLocaleOverride', { locale: languages.split(',')[0] });
      // Emulation, not Network: an enabled Network domain streams every socket frame (all the audio) to this client.
      await send('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
        acceptLanguage: languages,
      });
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `Object.defineProperty(navigator, 'languages', { get: () => ${JSON.stringify(languages.split(','))} });`,
      });
      if (init) await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
      await send('Page.navigate', { url });
      const evaluate = async <T,>(expression: string): Promise<T> =>
        (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })).result?.value as T;
      return {
        send,
        evaluate,
        logs,
        async click(match, selector = 'button,[role=button],[role=option]') {
          const at = await evaluate<{ x: number; y: number } | null>(`(() => {
            const re = new RegExp(${JSON.stringify(match.source)}, ${JSON.stringify(match.flags)});
            const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => re.test((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '')) && b.getBoundingClientRect().width > 0);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          })()`);
          if (!at) return false;
          for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
          return true;
        },
        async screenshot(path) {
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          await Bun.write(path, Buffer.from(shot.data, 'base64'));
        },
        text: () => evaluate<string>('document.body.innerText'),
        close: () => ws.close(),
      };
    },
    close() {
      proc.kill();
    },
  };
}
