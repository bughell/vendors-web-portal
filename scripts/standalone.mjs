import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

// Make the production entry self-contained, so it also works without a server.
const root = resolve('dist');
const artifact = async path => {
  const resolved = resolve(root, path.replace(/^\//, ''));
  if (!resolved.startsWith(root + sep)) throw new Error('Invalid asset path');
  return readFile(resolved, 'utf8');
};
let html = await readFile(resolve(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)) {
  const js = (await artifact(match[1])).replace(/<\/script/gi, '<\\/script');
  html = html.replace(match[0], () => `<script type="module">${js}</script>`);
}
for (const match of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)) {
  const css = (await artifact(match[1])).replace(/<\/style/gi, '<\\/style');
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
const favicon = Buffer.from(await readFile(resolve(root, 'favicon.svg'))).toString('base64');
html = html.replace('href="/favicon.svg"', `href="data:image/svg+xml;base64,${favicon}"`);
if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel="(?:stylesheet|modulepreload)"/i.test(html)) {
  throw new Error('Standalone HTML still contains external scripts or styles');
}
await writeFile(resolve(root, 'index.html'), html);
// Retain the existing download filename for compatibility.
await writeFile(resolve(root, 'portal.html'), html);
console.log('Standalone demo: dist/index.html (also available as dist/portal.html)');
