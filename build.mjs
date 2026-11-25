// 把农历表注入 src.html → index.html（单文件，可离线、可发微信）
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const tpl = readFileSync(new URL('./src.html', here), 'utf8');
const table = readFileSync(new URL('./lunar.txt', here), 'utf8').trim();

if (!tpl.includes('__LUNAR_TABLE__')) throw new Error('模板里找不到 __LUNAR_TABLE__ 占位符');
if (!/^[0-9|;]+$/.test(table)) throw new Error('农历表格式异常');

const out = tpl.split('__LUNAR_TABLE__').join(table);
writeFileSync(new URL('./index.html', here), out, 'utf8');
console.log(`index.html 已生成：${(out.length / 1024).toFixed(1)} KB，农历表 ${table.length} 字符`);
