import { createHash } from 'node:crypto';
import { inlineScriptHashes } from './web-app';

describe('inlineScriptHashes', () => {
  it('autorise exactement les scripts en ligne, pas les scripts externes', () => {
    const inline = "\n  try { document.documentElement.dataset.theme = 'night'; } catch (e) {}\n";
    const html = `<head><script>${inline}</script><script type="module" src="/assets/app.js"></script></head>`;
    const expected = `'sha256-${createHash('sha256').update(inline).digest('base64')}'`;
    expect(inlineScriptHashes(html)).toEqual([expected]);
  });
});
