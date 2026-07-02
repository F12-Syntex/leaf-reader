/* Server-only data loader — reads the on-disk book format straight from disk.
   Only import this from Server Components (app/page.js, app/book/[id]/page.js);
   it uses node:fs and will fail to bundle for the client. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BOOKS_DIR = path.join(process.cwd(), 'public', 'books');

async function readJson(filePath, fallback = null) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

/* lightweight list for the library grid: [{id, title, author, tint, chapterCount, minutes}] */
export async function getBookIndex() {
  const list = await readJson(path.join(BOOKS_DIR, 'index.json'), []);
  return Array.isArray(list) ? list : [];
}

/* full book, or null if the id doesn't exist. Every chapter renders immediately —
   formatted/<stem>.json when it exists, otherwise the raw original/<stem>.json
   marked `unformatted: true` so the reader can show it plainer and trigger
   background formatting instead of making the reader wait for the whole book. */
export async function getBook(id) {
  const dir = path.join(BOOKS_DIR, id);
  const meta = await readJson(path.join(dir, 'meta.json'));
  if (!meta) return null;
  const stems = await readJson(path.join(dir, 'chapters.json'), []);
  const chapters = await Promise.all(
    stems.map(async (stem) => {
      const formatted = await readJson(path.join(dir, 'chapters', 'formatted', `${stem}.json`));
      if (formatted) return { ...formatted, stem };
      const original = await readJson(path.join(dir, 'chapters', 'original', `${stem}.json`));
      return original ? { ...original, stem, unformatted: true } : null;
    })
  );
  return { ...meta, chapters: chapters.filter(Boolean) };
}
