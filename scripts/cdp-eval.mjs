// Dev aid: evaluate JavaScript in a running Peek window over the Chrome DevTools Protocol.
// Start Peek with `--remote-debugging-port=9333`, then:
//   node scripts/cdp-eval.mjs "document.querySelector('#hud').innerText"
const port = process.env.CDP_PORT || 9333;
const expr = process.argv[2];
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('file://'));
if (!page) { console.error('no Peek page found'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id !== 1) return;
  const r = msg.result?.result;
  console.log(r?.value !== undefined ? (typeof r.value === 'string' ? r.value : JSON.stringify(r.value)) : JSON.stringify(msg.result));
  ws.close();
});
