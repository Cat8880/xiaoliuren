// 快速截图：只看首页数据行 + 结果页属性行（改字体后对比用）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9336;
const PAGE = process.env.PAGE_URL || new URL('./index.html', import.meta.url).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.env.TEMP + '\\liuren-shot', '--disable-gpu', '--no-first-run',
  '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map();
const send = (m, p = {}) => { const mid = ++id; ws.send(JSON.stringify({ id: mid, method: m, params: p }));
  return new Promise((res, rej) => { pending.set(mid, { res, rej }); setTimeout(() => pending.has(mid) && (pending.delete(mid), rej(new Error('timeout ' + m))), 15000); }); };
const evalJS = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const shot = async (name, clip) => { const p = { format: 'png' };
  if (clip) p.clip = { ...clip, scale: 1 };
  const r = await send('Page.captureScreenshot', p); writeFileSync(new URL('./shots/' + name, import.meta.url), Buffer.from(r.data, 'base64')); console.log('shot →', name); };

try {
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); ok = true; } catch { await sleep(200); } }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Page.navigate', { url: PAGE });
  await sleep(1200);

  // 首页：只截「事实行」那一带（3 倍清晰度）
  const box = await evalJS(`(() => { const r = document.querySelector('#timeFacts').getBoundingClientRect();
    const h = document.querySelector('#toggleManual').getBoundingClientRect();
    return { x: Math.max(0, r.left - 14), y: r.top - 10, w: Math.min(390, r.width + 28), h: (h.bottom - r.top) + 18 }; })()`);
  await shot('z1-facts.png', { x: box.x, y: box.y, width: box.w, height: box.h });

  // 结果页属性行
  await evalJS(`document.querySelector('#castBtn').click()`);
  await sleep(1800);
  const box2 = await evalJS(`(() => { const r = document.querySelector('.res-top .attrs').getBoundingClientRect();
    return { x: 0, y: r.top - 60, w: 390, h: r.height + 130 }; })()`);
  await shot('z2-attrs.png', { x: box2.x, y: box2.y, width: box2.w, height: box2.h });
  console.log(JSON.stringify(await evalJS(`(() => {
    const v = document.querySelector('.fact .v'), k = document.querySelector('.fact .k');
    const cs = getComputedStyle(v);
    return { valueFont: cs.fontFamily.slice(0,40), weight: cs.fontWeight, size: cs.fontSize,
             labelFont: getComputedStyle(k).fontFamily.slice(0,40),
             attrs: [...document.querySelectorAll('.res-top .attr')].map(e=>e.innerText) };
  })()`), null, 1));
} catch (e) { console.error('FAIL', e.message); } finally { try { ws && ws.close(); } catch {} chrome.kill(); }
