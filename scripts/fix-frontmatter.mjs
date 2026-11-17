// 修复 frontmatter 中未加引号且含冒号的标量值（YAML 解析失败）
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const dir = path.resolve('src/content/articles');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));

function extractFrontmatter(text) {
  // 返回 { start: 首行 title 的行号(0基), end: 结束 --- 行号(0基) }
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return { lines, start: 1, end: i };
  }
  return null;
}

function fixLine(line) {
  // 匹配 "key: value"（value 未加引号）
  const m = line.match(/^(\s*(?:- )?[A-Za-z_\u0600-\u06FF][\w\u0600-\u06FF-]*:)(\s+)(\S.*)$/);
  if (!m) return line;
  const value = m[3];
  // 已加引号或 flow 结构，跳过
  if (/^["'[\{]/.test(value)) return line;
  // 值内含 "冒号+空格" 或 "冒号+行尾" → 需要加引号
  if (/:(\s|$)/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${m[1]} "${escaped}"`;
  }
  return line;
}

let fixedFiles = 0;
let fixedLines = 0;
let failed = [];

for (const file of files) {
  const p = path.join(dir, file);
  let text = fs.readFileSync(p, 'utf8');
  for (let iter = 0; iter < 10; iter++) {
    const fm = extractFrontmatter(text);
    if (!fm) { failed.push(file + ' (no frontmatter)'); break; }
    const fmText = fm.lines.slice(fm.start, fm.end + 1).join('\n');
    let err;
    try { parse(fmText); err = null; } catch (e) { err = e; }
    if (!err) break;
    // 定位出错行：yaml 报错行号基于 fmText（1 基）
    const msgLine = Number(err.message.match(/line (\d+)/)?.[1] ?? 0);
    const idx = fm.start + (msgLine > 0 ? msgLine - 1 : 0);
    const before = fm.lines[idx];
    const after = fixLine(before);
    if (after === before) {
      // 无法通过加引号修复该行（可能是多行值或结构错误）
      failed.push(`${file} line ${idx + 1}: ${err.message.split('\n')[0]}`);
      break;
    }
    fm.lines[idx] = after;
    const rest = [fm.lines.slice(0, fm.start), fm.lines.slice(fm.start, fm.end + 1), fm.lines.slice(fm.end + 1)];
    text = [...rest[0], ...rest[1], ...rest[2]].join('\n');
    fixedLines++;
  }
  const fm2 = extractFrontmatter(text);
  try { parse(fm2.lines.slice(fm2.start, fm2.end + 1).join('\n')); }
  catch (e) { if (!failed.some((f) => f.startsWith(file))) failed.push(`${file}: ${e.message.split('\n')[0]}`); }
  if (text !== fs.readFileSync(p, 'utf8')) {
    fs.writeFileSync(p, text);
    fixedFiles++;
  }
}

console.log(`修复文件: ${fixedFiles}, 修复行: ${fixedLines}`);
if (failed.length) {
  console.log(`失败 ${failed.length} 个:`);
  failed.slice(0, 20).forEach((f) => console.log('  ' + f));
} else {
  console.log('全部 frontmatter YAML 解析通过');
}
