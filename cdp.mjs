// 用 CDP 驱动无头 Chrome：截图 + 交互 + 收集控制台错误
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const OUT = new URL('./shots/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const PAGE = process.env.PAGE_URL || new URL('./index.html', import.meta.url).href;

const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.env.TEMP + '\\liuren-cdp',
  '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--force-color-profile=srgb',
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const events = [];
function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res, rej) => {
    pending.set(mid, { res, rej });
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 20000);
  });
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function shot(name, fullPage = false) {
  const params = { format: 'png', captureBeyondViewport: fullPage };
  if (fullPage) {
    const m = await send('Page.getLayoutMetrics');
    const h = Math.ceil(m.cssContentSize.height), w = Math.ceil(m.cssContentSize.width);
    params.clip = { x: 0, y: 0, width: w, height: h, scale: 1 };
  }
  const r = await send('Page.captureScreenshot', params);
  writeFileSync(new URL(name, OUT), Buffer.from(r.data, 'base64'));
  console.log('  shot →', name);
}

try {
  // 等 CDP 起来
  let ver = null;
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch { await sleep(200); }
  }
  if (!ver) throw new Error('Chrome 未就绪');

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) {
      if (msg.method === 'Runtime.consoleAPICalled')
        events.push({ type: msg.params.type, text: msg.params.args.map(a => a.value ?? a.description ?? '').join(' ') });
      if (msg.method === 'Runtime.exceptionThrown')
        events.push({ type: 'exception', text: msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text });
      if (msg.method === 'Log.entryAdded')
        events.push({ type: msg.params.entry.level, text: msg.params.entry.text + ' ' + (msg.params.entry.url || '') });
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  // ── 手机宽度 390 ──
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: PAGE });
  await sleep(1200);

  console.log('\n== 首屏体检 ==');
  const home = await evalJS(`(() => ({
    title: document.title,
    now: (document.querySelector('#nowcard')||{}).innerText,
    facts: (document.querySelector('#timeFacts')||{}).innerText,
    palmCells: document.querySelectorAll('.palm-cell').length,
    palmNames: [...document.querySelectorAll('.palm-cell .nm')].map(e=>e.textContent),
    chips: [...document.querySelectorAll('#qChips .attr')].map(e=>e.textContent),
    btn: (document.querySelector('#castBtn')||{}).innerText,
    docH: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    records: (document.querySelector('#recList')||{}).innerText
  }))()`);
  console.log(JSON.stringify(home, null, 1));
  await shot('01-home-390.png');
  await shot('02-home-390-full.png', true);

  // ── 起课：时辰法 ──
  console.log('\n== 时辰起课 ==');
  await evalJS(`document.querySelector('#castBtn').click()`);
  await sleep(1800);
  const res = await evalJS(`(() => ({
    view: document.querySelector('.view.active').dataset.view,
    palace: (document.querySelector('.plaque .nm')||{}).textContent,
    luck: (document.querySelector('.res-top .luck')||{}).innerText,
    attrs: [...document.querySelectorAll('.res-top .attr')].map(e=>e.innerText),
    meta: (document.querySelector('.res-top .caption')||{}).innerText,
    poemLines: document.querySelectorAll('.poem p').length,
    items: [...document.querySelectorAll('#resultView .grid2 .item dt')].map(e=>e.textContent),
    steps: [...document.querySelectorAll('#resultView .step')].map(e=>e.innerText.replace(/\\s+/g,' ')),
    advice: [...document.querySelectorAll('#resultView .advice li')].map(e=>e.innerText),
    due: (document.querySelector('.dueline .v')||{}).innerText,
    records: (document.querySelector('#recList')||{}).innerText,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
  }))()`);
  console.log(JSON.stringify(res, null, 1));
  await shot('03-result-390.png');
  await shot('04-result-390-full.png', true);

  // ── 报数起课（固定 3/5/7 验证推演）──
  console.log('\n== 报数起课 3/5/7 ==');
  await evalJS(`(() => {
    document.querySelector('[data-nav="home"]').click();
    document.querySelector('.seg [data-method="num"]').click();
    document.querySelector('#n1').value = 3;
    document.querySelector('#n2').value = 5;
    document.querySelector('#n3').value = 7;
    return true;
  })()`);
  await sleep(200);
  await evalJS(`document.querySelector('#castBtn').click()`);
  await sleep(1800);
  const numRes = await evalJS(`(() => ({
    palace: (document.querySelector('.plaque .nm')||{}).textContent,
    meta: (document.querySelector('.res-top .caption')||{}).innerText,
    steps: [...document.querySelectorAll('#resultView .step')].map(e=>e.innerText.replace(/\\s+/g,' '))
  }))()`);
  console.log(JSON.stringify(numRes, null, 1));
  await shot('05-result-num-390.png');

  // ── 六宫详解 ──
  console.log('\n== 六宫详解 ==');
  await evalJS(`document.querySelectorAll('[data-nav="detail"]')[1].click()`);
  await sleep(500);
  const detail = await evalJS(`(() => {
    const nav = document.querySelector('#detailNav');
    return {
      cards: document.querySelectorAll('.dcard').length,
      names: [...document.querySelectorAll('.dcard .nm')].map(e=>e.textContent),
      navBtns: document.querySelectorAll('#detailNav button').length,
      navFits: nav.scrollWidth <= nav.clientWidth + 1,
      firstCardHeight: Math.round(document.querySelector('.dcard').getBoundingClientRect().height),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  })()`);
  console.log(JSON.stringify(detail, null, 1));
  await shot('06-detail-390.png');

  // ── 所问事项 + 推演展开 + 记录回看 ──
  console.log('\n== 所问/推演/记录 ==');
  await evalJS(`(() => {
    document.querySelector('[data-nav="home"]').click();
    document.querySelector('.seg [data-method="time"]').click();
    document.querySelector('#qChips [data-q="love"]').click();
    return true;
  })()`);
  await sleep(200);
  await evalJS(`document.querySelector('#castBtn').click()`);
  await sleep(1800);
  const qTest = await evalJS(`(() => {
    const opened = document.querySelector('#resultView .deriv');
    if (opened) opened.open = true;
    const firstItem = document.querySelector('#resultView .grid2 .item');
    return {
      palace: (document.querySelector('.plaque .nm')||{}).textContent,
      qbadge: (document.querySelector('.qbadge')||{}).innerText,
      firstLabel: firstItem ? firstItem.querySelector('dt').textContent : null,
      firstHasAsk: firstItem ? firstItem.classList.contains('ask') : null,
      steps: [...document.querySelectorAll('#resultView .step')].map(e=>e.textContent.replace(/\\s+/g,' ').trim()),
      copyBtn: !!document.querySelector('#copyBtn'),
      recRows: document.querySelectorAll('#recList .rec').length
    };
  })()`);
  console.log(JSON.stringify(qTest, null, 1));
  await shot('10-result-love-390.png');

  // ── 桌面 1440 ──
  console.log('\n== 桌面 1440 ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evalJS(`document.querySelector('[data-nav="home"]').click()`);
  await sleep(400);
  await shot('07-home-1440.png');
  await evalJS(`document.querySelector('#castBtn').click()`);
  await sleep(1800);
  await shot('08-result-1440.png');

  // ── 深色模式 ──
  console.log('\n== 深色模式 390 ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(300);
  await shot('09-result-dark-390.png');
  await send('Emulation.setEmulatedMedia', { features: [] });

  console.log('\n== 控制台 ==');
  if (!events.length) console.log('  无报错 / 无警告');
  else events.slice(0, 20).forEach(e => console.log('  [' + e.type + ']', e.text));
} catch (e) {
  console.error('CDP 失败:', e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
}
