import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../index.html', import.meta.url);
let html = await readFile(file, 'utf8');
html = html.replace('<link rel="stylesheet" href="menu.css">', '<link rel="stylesheet" href="menu.css">\n<link rel="stylesheet" href="pedidos.css">');
html = html.replace('<script src="menu.js" defer></script>', '<script src="menu.js" defer></script>\n<script src="pedidos.js" defer></script>');
await writeFile(file, html, 'utf8');
