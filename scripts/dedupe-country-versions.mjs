// 国家版去重：同 (model|category|industry) cell 内保留主版（qatar 优先）可索引，
// 其余国家版 frontmatter 加 noindex: true + canonicalSlug: 主版 slug
// 幂等：重跑先清除旧标记再按当前分布重新打标
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('src/content/articles');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));

// 主版国家优先级：qatar 是旗舰市场；缺失时退而取 saudi-arabia、uae
const countryRank = (c) => ({ qatar: 0, 'saudi-arabia': 1, uae: 2 })[c] ?? 3;

function parseMeta(file) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = text.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { end = i; break; }
  const get = (key) => {
    const re = new RegExp(`^${key}:(.*)$`, 'm');
    const m = lines.slice(1, end).join('\n').match(re);
    return m ? m[1].trim() : '';
  };
  return {
    file,
    slug: file.replace(/\.mdx$/, ''),
    model: get('productModel'),
    category: get('category'),
    industry: get('industry'),
    country: get('gccCountry'),
    noindex: get('noindex'),
    canonicalSlug: get('canonicalSlug').replace(/^"|"$/g, ''),
  };
}

const metas = files.map(parseMeta);

// 分组并选主版
const cells = new Map();
for (const m of metas) {
  const key = `${m.model}|${m.category}|${m.industry}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(m);
}

const assignments = new Map(); // file -> { noindex, canonicalSlug }
for (const [key, group] of cells) {
  if (group.length === 1) continue; // 单篇无需处理
  const primary = [...group].sort((a, b) => countryRank(a.country) - countryRank(b.country))[0];
  for (const m of group) {
    if (m === primary) continue;
    assignments.set(m.file, { noindex: 'true', canonicalSlug: primary.slug });
  }
}

// 幂等清除：旧标记但本次不该标记的文件也要清除
const stale = metas.filter((m) => (m.noindex || m.canonicalSlug) && !assignments.has(m.file));

let wrote = 0;
for (const [file, a] of assignments) {
  const p = path.join(dir, file);
  let text = fs.readFileSync(p, 'utf8');
  const lines = text.split('\n');
  let end = 1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { end = i; break; }
  // 删除旧 noindex / canonicalSlug 行
  const body = lines.slice(0, end).filter((l) => !/^noindex:/.test(l) && !/^canonicalSlug:/.test(l));
  body.push(`noindex: ${a.noindex}`, `canonicalSlug: "${a.canonicalSlug}"`);
  const out = [...body, ...lines.slice(end)];
  fs.writeFileSync(p, out.join('\n'));
  wrote++;
}
for (const m of stale) {
  const p = path.join(dir, m.file);
  let text = fs.readFileSync(p, 'utf8');
  const lines = text.split('\n');
  let end = 1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { end = i; break; }
  const out = [...lines.slice(0, end).filter((l) => !/^noindex:/.test(l) && !/^canonicalSlug:/.test(l)), ...lines.slice(end)];
  fs.writeFileSync(p, out.join('\n'));
  wrote++;
}

console.log(`cell 数: ${cells.size}, 多国家 cell: ${[...cells.values()].filter((g) => g.length > 1).length}, 标记 noindex: ${assignments.size}, 清除旧标记: ${stale.length}, 写回文件: ${wrote}`);
