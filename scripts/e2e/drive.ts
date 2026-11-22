// Drives headless Chromium over CDP: load the app, click Start, print the page text every few seconds.
const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = targets.find((t: any) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map<number, (v: any) => void>();
const logs: string[] = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(String(m.data));
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg.result);
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(msg.params.type + ': ' + msg.params.args.map((a: any) => a.value ?? a.description).join(' ').slice(0, 300));
  if (msg.method === 'Runtime.exceptionThrown') logs.push('exception: ' + msg.params.exceptionDetails.exception?.description);
};
await new Promise((r) => (ws.onopen = r));
const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression: string) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })).result.value;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
await send('Runtime.enable');
// Summarise the Live socket's traffic in the console: what was sent, and each server message.
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c) => gum(c).then((st) => (console.log('MIC opened:', st.getAudioTracks()[0]?.label), st), (e) => { console.log('MIC failed:', String(e)); throw e; });
    const add = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function (...a) { return add.apply(this, a).then((v) => (console.log('WORKLET module loaded'), v), (e) => { console.log('WORKLET module failed:', String(e)); throw e; }); };
    const Node = AudioWorkletNode;
    window.AudioWorkletNode = class extends Node {
      constructor(...a) {
        super(...a);
        let chunks = 0;
        this.port.addEventListener('message', () => { chunks++; });
        setInterval(() => { console.log('MIC chunks in last 5s:', chunks, 'context', this.context.state); chunks = 0; }, 5000);
      }
    };
    const Native = WebSocket;
    const brief = (v) => JSON.stringify(v, (k, x) => (typeof x === 'string' && x.length > 80 ? x.slice(0, 20) + '…(' + x.length + ')' : x)).slice(0, 280);
    window.WebSocket = class extends Native {
      constructor(...a) {
        super(...a);
        let sent = 0, audioIn = 0;
        const send = this.send.bind(this);
        this.send = (d) => {
          sent++;
          if (typeof d === 'string' && !d.includes('"audio"')) console.log('WS>', brief(JSON.parse(d)));
          else if (typeof d === 'string') (window.__sentAudio ??= []).push(JSON.parse(d).realtimeInput.audio.data);
          return send(d);
        };
        setInterval(() => { if (sent) { console.log('WS> sent', sent, 'messages'); sent = 0; } }, 5000);
        this.addEventListener('message', async (m) => {
          const text = typeof m.data === 'string' ? m.data : await new Response(m.data).text();
          const msg = JSON.parse(text);
          const parts = msg.serverContent?.modelTurn?.parts;
          if (parts?.some((p) => p.inlineData)) { audioIn++; if (audioIn % 20 !== 1) return; }
          console.log('WS<', brief(msg));
        });
        this.addEventListener('close', (e) => console.log('WS closed', e.code, e.reason));
      }
    };
  })()`,
});
await send('Page.navigate', { url: 'http://localhost:8787/' });
await wait(4000);
await evaluate(`[...document.querySelectorAll('[role=button]')].find(b => /start/i.test(b.innerText)).click()`);
let last = '';
for (let i = 0; i < Number(process.argv[2] ?? 14); i++) {
  await wait(3000);
  const text = await evaluate('document.body.innerText');
  if (text !== last) console.log(`t+${(i + 1) * 3}s:`, JSON.stringify(text));
  last = text;
}
// E2E_DUMP=<file>: save the microphone audio the app sent (raw 16 kHz 16-bit mono PCM).
if (process.env.E2E_DUMP) {
  const chunks: string[] = (await evaluate('window.__sentAudio ?? []')) ?? [];
  await Bun.write(process.env.E2E_DUMP, Buffer.concat(chunks.map((c) => Buffer.from(c, 'base64'))));
  console.log('dumped', chunks.length, 'chunks to', process.env.E2E_DUMP);
}
console.log('LOGS:\n' + logs.slice(-Number(process.argv[3] ?? 60)).join('\n'));
ws.close();
