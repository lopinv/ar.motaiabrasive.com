#!/usr/bin/env node
/**
 * 批量生成文章脚本
 * 读取选题矩阵，生成 MDX 文件写入 src/content/articles/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { topicMatrix } from '../src/templates/topic-matrix.js';
import { generateArticle } from '../src/templates/content-generator.js';

const CONTENT_DIR = path.resolve(__dirname, '../src/content/articles');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeSlug(slug: string): string {
  return slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function escapeYamlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function frontmatterToYaml(fm: Record<string, any>): string {
  const lines: string[] = ['---'];

  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      // Check if array of objects
      if (value[0] && typeof value[0] === 'object') {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push('  - ');
          for (const [k, v] of Object.entries(item)) {
            const yamlValue = typeof v === 'string' ? `"${escapeYamlString(v)}"` : v;
            lines.push(`    ${k}: ${yamlValue}`);
          }
        }
      } else {
        // Simple array
        const arrStr = '[' + value.map(v => typeof v === 'string' ? `"${escapeYamlString(v)}"` : v).join(', ') + ']';
        lines.push(`${key}: ${arrStr}`);
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        const yamlValue = typeof v === 'string' ? `"${escapeYamlString(v)}"` : v;
        lines.push(`  ${k}: ${yamlValue}`);
      }
    } else if (typeof value === 'string') {
      lines.push(`${key}: "${escapeYamlString(value)}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

function writeArticle(article: { frontmatter: Record<string, any>; html: string; slug: string }) {
  const safeSlug = sanitizeSlug(article.slug);
  const filePath = path.join(CONTENT_DIR, `${safeSlug}.mdx`);

  const yaml = frontmatterToYaml(article.frontmatter);
  const content = `${yaml}\n\n${article.html}\n`;

  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

async function main() {
  const args = process.argv.slice(2);
  const startIdx = parseInt(args[0] || '0', 10);
  const count = parseInt(args[1] || '50', 10);
  const priorityFilter = args[2] ? parseInt(args[2], 10) : undefined;

  console.log(`=== 批量生成文章 ===`);
  console.log(`起始索引: ${startIdx}`);
  console.log(`生成数量: ${count}`);
  console.log(`优先级过滤: ${priorityFilter ? `P${priorityFilter}` : '全部'}`);
  console.log(`输出目录: ${CONTENT_DIR}`);

  ensureDir(CONTENT_DIR);

  let filtered = topicMatrix;
  if (priorityFilter) {
    filtered = topicMatrix.filter(t => t.priority === priorityFilter);
  }

  const batch = filtered.slice(startIdx, startIdx + count);
  console.log(`实际将生成: ${batch.length} 篇`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const topic = batch[i];
    const globalIdx = startIdx + i;

    try {
      const article = generateArticle(topic);
      const filePath = writeArticle(article);
      success++;
      if ((i + 1) % 10 === 0 || i === batch.length - 1) {
        console.log(`  [${i + 1}/${batch.length}] ✓ ${topic.slug} (P${topic.priority})`);
      }
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${batch.length}] ✗ ${topic.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n=== 完成 ===`);
  console.log(`成功: ${success}`);
  console.log(`失败: ${failed}`);
  console.log(`文件目录: ${CONTENT_DIR}`);

  // 生成/更新索引文件 - 读取现有索引并合并
  const indexPath = path.join(CONTENT_DIR, '_index.json');
  let existingIndex: any[] = [];
  if (fs.existsSync(indexPath)) {
    try {
      existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch (e) {
      existingIndex = [];
    }
  }
  
  const newIndex = batch.map((t, i) => ({
    slug: sanitizeSlug(t.slug),
    title: t.title,
    articleType: t.articleType,
    productFamily: t.productFamily,
    industry: t.industry,
    gccCountry: t.gccCountry,
    priority: t.priority,
    primaryKeyword: t.primaryKeyword,
  }));
  
  // 合并并去重（以 slug 为键）
  const combinedMap = new Map<string, any>();
  for (const item of [...existingIndex, ...newIndex]) {
    combinedMap.set(item.slug, item);
  }
  const combinedIndex = Array.from(combinedMap.values());
  
  fs.writeFileSync(indexPath, JSON.stringify(combinedIndex, null, 2), 'utf-8');
  console.log(`索引文件: ${indexPath} (总计 ${combinedIndex.length} 篇)`);
}

main().catch(console.error);