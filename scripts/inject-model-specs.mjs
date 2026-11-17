// B：给每篇正文注入「本型号真实规格差异」块（幂等，带 MARK 标记）
// 数据源：src/data/models.ts 的 useCases/notes/backing/attachment/gritRange
// 仅对有 productModel 的文章注入；重跑先删旧块再重建
import fs from 'node:fs';
import path from 'node:path';
import { models } from '../src/data/models.ts';

const dir = path.resolve('src/content/articles');
// MDX 合法注释语法（HTML 注释 <!-- --> 在 MDX/JSX 中非法，会导致构建失败）
const MARK = '{/* model-spec-block */}';
const modelBySlug = new Map(models.map((m) => [m.slug, m]));

function parseModel(file, text) {
  const m = text.match(/^productModel:\s*"([^"]+)"/m);
  return { slug: m ? m[1] : null, text };
}

function specBlock(model) {
  if (!model) return null;
  const grits = model.gritRange.slice(0, 4).join('–') + (model.gritRange.length > 4 ? '…' : '');
  const lines = [
    MARK,
    `<h2>مواصفات ${model.name} (الفروقات الجوهرية)</h2>`,
    `<ul class="plain-links">`,
    `  <li><strong>درجات الغرِت المتاحة:</strong> ${grits}</li>`,
    `  <li><strong>القاعدة/الخلف:</strong> ${model.backing}</li>`,
    `  <li><strong>نظام التثبيت:</strong> ${model.attachment}</li>`,
    ...model.useCases.map((u) => `  <li><strong>استخدام أساسي:</strong> ${u}</li>`),
    ...model.notes.slice(0, 2).map((n) => `  <li><strong>ملاحظة فنية:</strong> ${n}</li>`),
    `</ul>`,
  ];
  return lines.join('\n');
}

let injected = 0;
let skippedNoModel = 0;
let removed = 0;

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.mdx')) continue;
  const p = path.join(dir, f);
  let text = fs.readFileSync(p, 'utf8');
  // 幂等：先移除旧块（块以 MARK 开始、以 </ul> 结束）
  if (text.includes(MARK)) {
    const re = new RegExp(`${MARK.replace(/[-[\\]{}()]/g, '\\$&')}[\\s\\S]*?</ul>\\s*`, 'g');
    text = text.replace(re, '');
    removed++;
  }
  const { slug } = parseModel(f, text);
  const model = slug ? modelBySlug.get(slug) : null;
  if (process.env.DEBUG && !injected) {
    console.log(`[debug] ${f} slug=${slug} hasModel=${modelBySlug.has(slug)} model=${!!model}`);
  }
  if (!model) { skippedNoModel++; continue; }
  const block = specBlock(model);
  if (!block) continue;
  // 插在正文根 <div dir="rtl"> 开标签之后（避免 MDX 非根内容警告）
  const rootOpen = text.indexOf('<div dir="rtl"');
  let insertAt = -1;
  if (rootOpen !== -1) {
    const closeIdx = text.indexOf('>', rootOpen);
    insertAt = closeIdx + 1;
  } else {
    // 兜底：frontmatter 结束后的位置
    const fmEnd = text.indexOf('\n---', 4);
    insertAt = fmEnd === -1 ? text.length : fmEnd + 4;
  }
  text = text.slice(0, insertAt) + '\n' + block + text.slice(insertAt);
  fs.writeFileSync(p, text);
  injected++;
}

console.log(`注入 ${injected} 篇, 无 productModel 跳过 ${skippedNoModel}, 清除旧块 ${removed}`);
