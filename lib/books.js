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

/* full book with every formatted chapter assembled, or null if the id doesn't exist */
export async function getBook(id) {
  const dir = path.join(BOOKS_DIR, id);
  const meta = await readJson(path.join(dir, 'meta.json'));
  if (!meta) return null;
  const stems = await readJson(path.join(dir, 'chapters.json'), []);
  const chapters = await Promise.all(
    stems.map((stem) => readJson(path.join(dir, 'chapters', 'formatted', `${stem}.json`)))
  );
  return { ...meta, chapters: chapters.filter(Boolean) };
}
