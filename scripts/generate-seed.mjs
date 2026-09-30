import { readFile, writeFile } from 'node:fs/promises';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const slug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = [];
for (const [, categoryId, section] of html.matchAll(/<section class="category" id="([^"]+)">([\s\S]*?)<\/section>/g)) {
  const category = section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]?.replace(/<[^>]+>/g, '').trim() || categoryId;
  const starts = [...section.matchAll(/<div class="item(?: item-preview)?(?:\s[^>]*)?>/g)].map(m => m.index);
  for (let i = 0; i < starts.length; i++) {
    const part = section.slice(starts[i], starts[i + 1] ?? section.length);
    const name = part.match(/class="item-name"[^>]*>([^<]+)</)?.[1]?.trim();
    const price = Number(part.match(/class="item-price"[^>]*>([0-9]+(?:\.[0-9]{1,2})?)</)?.[1]);
    if (!name || !Number.isFinite(price)) continue;
    const description = part.match(/class="item-desc"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
    const image = part.match(/data-images="([^"]+)/)?.[1]?.split(',')[0] || '';
    const key = `${categoryId}-${slug(name)}`;
    sql.push(`(${q(key)},${q(name)},${q(category)},${q(description)},${Math.round(price * 100)},${q(image)})`);
  }
}
const output = `-- Generated from index.html by scripts/generate-seed.mjs. Re-run after editing the menu.\ninsert into public.products(catalog_key,name,category,description,price_cents,image_url) values\n${sql.join(',\n')}\non conflict (catalog_key) do update set name=excluded.name,category=excluded.category,description=excluded.description,price_cents=excluded.price_cents,image_url=excluded.image_url,updated_at=now();\n`;
await writeFile(new URL('../database/seed.sql', import.meta.url), output, 'utf8');
console.log(`Generated seed data for ${sql.length} menu items.`);
