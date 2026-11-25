// 生成 1950-2051 农历对照表（供 index.html 内联，脱离浏览器 ICU 依赖）
// 输出格式：每年 "起日|闰月|大小月bits"
//  起日 = 正月初一 距 1950-01-01(北京时) 的天数
//  闰月 = 0 表示无闰月，否则为闰几月
//  bits = 依时序每个农历月的天数，1=30天 0=29天
import { writeFileSync } from 'node:fs';

const DAY = 86400000;
const EPOCH = Date.UTC(1950, 0, 1, 4); // 1950-01-01 12:00 北京时间

const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  year: 'numeric', month: 'long', day: 'numeric',
});

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 正: 1, 冬: 11, 腊: 12 };

function lunarOf(y, m, d) {
  const parts = fmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 4)));
  const get = (t) => (parts.find(p => p.type === t) || {}).value || '';
  const monthStr = get('month'); // 六月 / 闰六月
  const dayStr = get('day');     // 廿三
  const isLeap = monthStr.includes('闰');
  const mNum = CN_NUM[monthStr.replace(/闰|月/g, '')] ?? null;
  const dRaw = dayStr.replace(/日/g, '');
  const dNum = /^\d+$/.test(dRaw) ? Number(dRaw) : (CN_NUM[dRaw] ?? null);
  if (mNum == null || dNum == null) throw new Error(`解析失败 ${y}-${m}-${d}: ${monthStr} ${dayStr}`);
  return { m: mNum, d: dNum, leap: isLeap };
}

// 逐日扫描，记录每月初一
const starts = [];
let cur = Date.UTC(1949, 11, 1, 4);
const end = Date.UTC(2052, 0, 31, 4);
while (cur <= end) {
  const dt = new Date(cur);
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
  const L = lunarOf(y, m, d);
  if (L.d === 1) {
    starts.push({ days: Math.round((cur - EPOCH) / DAY), month: L.m, leap: L.leap });
  }
  cur += DAY;
}

const years = [];
for (let i = 0; i < starts.length; i++) {
  const s = starts[i];
  if (s.month !== 1 || s.leap) continue; // 正月初一 = 年首
  const gy = new Date(s.days * DAY + EPOCH).getUTCFullYear();
  if (gy < 1950 || gy > 2051) continue;
  // 找下一个年首（正月初一）
  let n = i + 1;
  while (n < starts.length && !(starts[n].month === 1 && !starts[n].leap)) n++;
  if (n >= starts.length) break;
  const nextDays = starts[n].days;

  // 收集本年各月（从正月初一起，含闰月）
  const months = starts.slice(i, n);
  const bounds = [...months.map(x => x.days), nextDays];
  let leap = 0, bits = '';
  for (let k = 0; k < months.length; k++) {
    if (months[k].leap) leap = months[k].month;
    bits += (bounds[k + 1] - bounds[k]) === 30 ? '1' : '0';
  }
  const total = nextDays - s.days;
  const sum = bits.split('').reduce((a, c) => a + (c === '1' ? 30 : 29), 0);
  if (total !== sum) throw new Error(`年份校验失败 ${gy}: ${total} vs ${sum}`);
  if (leap && !months.some(x => x.leap)) throw new Error(`闰月校验失败 ${gy}`);
  if (months.length !== 12 && months.length !== 13) throw new Error(`月数异常 ${gy}: ${months.length}`);
  years.push({ gy, days: s.days, leap, bits });
}

// 抽样自检
const check = [
  [2026, 2, 17, '2026 正月初一'],
  [2026, 11, 25, '今天'],
  [2025, 1, 29, '2025 春节'],
  [2024, 2, 10, '2024 春节'],
  [2000, 2, 5, '2000 春节'],
];
for (const [y, m, d, label] of check) {
  const L = lunarOf(y, m, d);
  console.log(`${label.padEnd(14)} ${y}-${m}-${d} => 农历${L.leap ? '闰' : ''}${L.m}月${L.d}日`);
}

const payload = years.map(v => `${v.days}|${v.leap}|${v.bits}`).join(';');
console.log(`\n年份数=${years.length}  表格长度=${payload.length} 字符`);
console.log('首尾：', payload.slice(0, 40), '...', payload.slice(-40));
writeFileSync(new URL('./lunar.txt', import.meta.url), payload, 'utf8');
console.log('已写入 lunar.txt');
