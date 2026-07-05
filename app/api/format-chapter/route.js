import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { formatChapterViaOpenRouter } from '@/lib/openrouter';
import { normalizeBlocks, auditBlocks, wordsInBlocks } from '@/lib/normalizeBlocks';

const BOOKS_DIR = path.join(process.cwd(), 'public', 'books');

async function readJson(p) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

/* De-dupes concurrent requests for the same chapter (e.g. React Strict Mode's
   double-effect, or a reader re-triggering before the first request lands) —
   without this, two overlapping OpenRouter calls for the same stem can race
   on the write and the slower/worse response silently clobbers the good one. */
const inFlight = new Map();

async function formatOne(bookId, stem, force) {
  const dir = path.join(BOOKS_DIR, bookId);
  const formattedPath = path.join(dir, 'chapters', 'formatted', `${stem}.json`);

  if (!force && await readJson(formattedPath)) {
    return { ok: true, alreadyDone: true };
  }

  const original = await readJson(path.join(dir, 'chapters', 'original', `${stem}.json`));
  const meta = await readJson(path.join(dir, 'meta.json'));
  if (!original || !meta) {
    return { error: 'chapter or book not found', status: 404 };
  }

  /* correction loop: normalize repairs most model drift in place; whatever
     it can't fix (or a truncated/paraphrased chapter that lost too much
     prose) triggers ONE retry with an explicit note about what went wrong.
     If the retry is still unusable, keep the chapter unformatted rather than
     writing a broken file — the reader's Reanalyse button can try again. */
  const originalWords = wordsInBlocks(original.blocks);
  const attempt = async (correction) => {
    const formatted = await formatChapterViaOpenRouter(original, meta.characters, correction);
    formatted.blocks = normalizeBlocks(formatted.blocks);
    const problems = auditBlocks(formatted.blocks);
    const words = wordsInBlocks(formatted.blocks);
    if (originalWords > 100 && words < originalWords * 0.6) {
      problems.push(`output lost too much prose (${words} words vs ${originalWords} in the source) — it was truncated or summarized; every sentence of the source must be present`);
    }
    return { formatted, problems };
  };

  let { formatted, problems } = await attempt();
  if (problems.length) {
    ({ formatted, problems } = await attempt('- ' + problems.slice(0, 8).join('\n- ')));
  }
  if (problems.length) {
    return { error: 'formatting failed validation: ' + problems.slice(0, 3).join('; '), status: 502 };
  }

  await mkdir(path.dirname(formattedPath), { recursive: true });
  await writeFile(formattedPath, JSON.stringify(formatted, null, 2), 'utf8');
  return { ok: true };
}

/* Progressive on-demand formatting — called by ReaderView for the next few
   unformatted chapters ahead of the reading position. Fast (single direct
   OpenRouter call), so it can run inline in a request instead of needing a
   background job queue. */
export async function POST(req) {
  const { bookId, stem, force } = await req.json();
  if (!bookId || !stem) {
    return NextResponse.json({ error: 'bookId and stem are required' }, { status: 400 });
  }

  const key = `${bookId}:${stem}`;
  let promise = inFlight.get(key);
  if (!promise) {
    promise = formatOne(bookId, stem, !!force).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }

  try {
    const result = await promise;
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
