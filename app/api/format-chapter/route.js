import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { formatChapterViaOpenRouter } from '@/lib/openrouter';
import { normalizeBlocks } from '@/lib/normalizeBlocks';

const BOOKS_DIR = path.join(process.cwd(), 'public', 'books');

async function readJson(p) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

/* Progressive on-demand formatting — called by ReaderView for the next few
   unformatted chapters ahead of the reading position. Fast (single direct
   OpenRouter call), so it can run inline in a request instead of needing a
   background job queue. */
export async function POST(req) {
  const { bookId, stem } = await req.json();
  if (!bookId || !stem) {
    return NextResponse.json({ error: 'bookId and stem are required' }, { status: 400 });
  }

  const dir = path.join(BOOKS_DIR, bookId);
  const formattedPath = path.join(dir, 'chapters', 'formatted', `${stem}.json`);

  if (await readJson(formattedPath)) {
    return NextResponse.json({ ok: true, alreadyDone: true });
  }

  const original = await readJson(path.join(dir, 'chapters', 'original', `${stem}.json`));
  const meta = await readJson(path.join(dir, 'meta.json'));
  if (!original || !meta) {
    return NextResponse.json({ error: 'chapter or book not found' }, { status: 404 });
  }

  try {
    const formatted = await formatChapterViaOpenRouter(original, meta.characters);
    formatted.blocks = normalizeBlocks(formatted.blocks);
    await mkdir(path.dirname(formattedPath), { recursive: true });
    await writeFile(formattedPath, JSON.stringify(formatted, null, 2), 'utf8');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
