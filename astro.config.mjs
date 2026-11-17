import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import fs from 'node:fs';
import path from 'node:path';

// 收集 noindex 文章的 slug，构建时从 sitemap 中排除（避免把 doorway 页喂给爬虫）
function collectNoindexSlugs() {
  const dir = path.resolve('src/content/articles');
  const slugs = new Set();
  if (!fs.existsSync(dir)) return slugs;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.mdx')) continue;
    const p = path.join(dir, f);
    const head = fs.readFileSync(p, 'utf8').split('\n').slice(0, 40).join('\n');
    if (/^noindex:\s*true/m.test(head)) slugs.add(f.replace(/\.mdx$/, ''));
  }
  return slugs;
}

const noindexSlugs = collectNoindexSlugs();

export default defineConfig({
  site: 'https://ar.motaiabrasive.com',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
  integrations: [mdx(), sitemap({
    changefreq: 'weekly',
    priority: 0.7,
    lastmod: new Date(),
    // 排除 noindex 国家版，避免 scaled/doorway 内容进 sitemap
    filter: (url) => {
      const slug = url.replace(/^\/articles\//, '').replace(/\/$/, '');
      return !noindexSlugs.has(slug);
    },
  })],
});
