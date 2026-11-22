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
console.log('LOGS:', logs.slice(-25).join('\n'));
ws.close();
