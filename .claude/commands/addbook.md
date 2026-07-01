---
description: Add a book to the reader's library from a local file (.txt/.pdf/.epub) or URL, via a two-phase extract-then-improve pipeline
---

# /addbook

Usage: `/addbook <path-or-url> [natural-language options]`

Examples:
- `/addbook ./sources/lotm.epub`
- `/addbook ./sources/lotm.epub only the first 300 chapters`
- `/addbook ./sources/lotm.epub add the rest of the chapters`
- `/addbook ./sources/pride.txt`

Arguments: `$ARGUMENTS`

Parse `$ARGUMENTS` as: the first token/quoted path or URL is the source; everything
else is free-form guidance (a chapter-count limit like "first 300 chapters", or a
resume instruction like "add the rest"/"continue"). If no limit is given, process
every chapter found. If the book already exists under `public/books/` and the instruction
implies continuing, resume instead of starting over (see Phase 2, step 3).

This command adds books to the local reader app **offline**. The shipped app has
zero AI calls at read time — all the intelligence happens here, once, when a book
is added. There is no in-app "import" button; this command is the only way books
enter `public/books/`.

## Cost discipline (read this first)

Do not read chapter bodies through your own context during Phase 1 — that's what
the extraction script is for. A book can be hundreds of chapters; reading it
yourself just to split it into chapters wastes tokens for zero value. Phase 1
should cost roughly: one peek at the source's structure, one script write, one
script run, one glance at its summary output.

Phase 2 needs judgment, but not *your* judgment applied hundreds of times over —
line-editing one chapter is a small, mechanical, independent task. Don't read and
rewrite every chapter yourself in this session. Instead, fan the work out to
parallel subagents running on **Haiku** (via the Agent tool, `model: "haiku"`) —
cheap and fast, and plenty capable for line-editing + pattern detection. You (the
orchestrating session) never read a chapter body directly in Phase 2; you only
dispatch subagents and verify their output landed on disk.

## On-disk contract

This is the exact shape both this command and the reader app (`components/reader/ReaderView.js`) agree
on. Don't deviate from it without updating both sides.

```
public/books/
  index.json                          [{ id, title, author, tint, chapterCount, minutes }]
  <bookId>/
    meta.json                         { id, title, author, tint, characters: {...} }
    chapters.json                     ["0001", "0002", ...]   ordered chapter file stems
    images/<slug>.jpg ...
    chapters/
      original/<stem>.json            { n, title, blocks: ["raw paragraph", ...] }
      formatted/<stem>.json           { n, title, rel: <1-10>, blocks: [ ...cleaned
                                         strings and rich blocks (statcard/letter/
                                         scene/uistat/...) ] }
    .addbook-progress.json            { lastCompleted: <int>, pending: [<int>, ...] }
                                         (Phase 2 resume marker — lastCompleted is the
                                         highest chapter with every prior chapter fully
                                         formatted; pending lists any chapters below it
                                         that failed twice and were skipped)
```

- `bookId`: a short kebab-case slug derived from the title (e.g. `lord-of-the-mysteries`).
  Reuse the existing id if the book is already present (for resume/append runs).
- `meta.json`'s `characters` map (optional but recommended if the book has a small,
  identifiable cast) follows the shape the reader already renders via `lib/richtext.js`/`components/richtext/blocks.js`:
  `{ key: { name, epithet, initials, aliases: [...], gender, stats: [[label, 1-10], ...] } }`.
  Only add characters you're confident about — this powers name-detection popovers
  and dialogue speaker coloring; a wrong or fabricated cast is worse than none.
- `tint`: a hex accent color for the book's shelf card. Pick something that suits
  the book's mood; any reasonable hex works.
- A chapter block (`blocks[]` entries) is either a plain paragraph string, or a
  rich block object. Supported block types today: `break`, `timeskip`,
  `{t:'quote', x, by}`, `{t:'scene', label, fx:'rain'|'candles', x}`,
  `{t:'delta', char, label, from, to, note}`, `{t:'journey', from, to, dist, meta:[...]}`,
  `{t:'statcard', char}`, `{t:'statrow', chars:[...]}`, `{t:'letter', from, to, sign, lines:[...]}`,
  and `{t:'uistat', items:[{label, value}, ...]}` (see below). Inline markdown
  (`*italic*`, `**bold**`) and `{say:charKey}` speaker tags work inside paragraph
  strings, same as the existing rendering engine in `lib/richtext.js`.

## Phase 1 — Extraction (scripted, cheap)

1. **Peek, don't read.** Look at just enough of the source to understand its shape:
   an EPUB's `META-INF/container.xml` + `content.opf` spine list, a PDF's outline/
   bookmarks (if any) via a quick script call, or the first/last ~2KB of a `.txt`
   file. Do not read the full source through your own context.
2. **Write a one-off extraction script** (Node.js, in a scratch location) tailored
   to what you found:
   - **EPUB**: unzip, walk the spine in `content.opf` order, strip each XHTML file
     to plain paragraphs (drop nav/boilerplate), pull `<img>` sources out to
     `public/books/<id>/images/`, and use the spine's own file/section boundaries as
     chapter boundaries (an EPUB's structure IS the chapter list — no heuristic
     needed).
   - **PDF**: use a PDF text-extraction library; prefer the PDF's own outline/
     bookmarks as chapter boundaries when present, otherwise fall back to a
     heading regex (`/^(chapter|part|book)\b/i` style) on standalone short lines.
   - **TXT**: split on blank-line-separated paragraphs; detect chapter headings
     with a heading regex similar to the above. If no headings are found at all,
     treat the whole file as a single chapter rather than guessing boundaries —
     you (Phase 2) can still improve and re-chapter it later by hand if needed.
   - The script does ALL of this mechanically and writes:
     - `public/books/<id>/chapters/original/<stem>.json` per chapter (`{n, title, blocks}`,
       `blocks` = raw paragraph strings, no cleanup yet)
     - any extracted images into `public/books/<id>/images/`
     - a summary to stdout: chapter count, first/last few titles, any warnings
       (e.g. "no chapter headings found, treated as one chapter")
3. **Run the script via Bash.** Read only its stdout summary — never the chapter
   files it produced — to sanity-check the result before moving on.
4. **Write metadata**: `public/books/<id>/meta.json`, `public/books/<id>/chapters.json` (the
   ordered stem list the script just produced), and add/update this book's entry
   in `public/books/index.json`. Set `chapterCount` and `minutes` to 0 for now — Phase 2
   fills those in for real as chapters are actually formatted, so the reader never
   advertises a chapter that isn't ready yet.
5. **Identify the main cast, yourself, directly** (this is the one place in the
   pipeline where *you* — not a subagent — read actual prose, because it needs
   cross-chapter judgment a single-chapter Haiku pass can't have). Read 2-3 early
   `original/` chapters and pull out the recurring named characters: name,
   epithet, gender, a one-line `desc`, and 2-3 rough `stats` (1-10). Write these
   into `meta.json`'s `characters` map (key = lowercase slug, e.g. `veythor`).
   This must happen *before* Phase 2, because every per-chapter subagent needs the
   character key list to tag dialogue correctly. Skip a character you're not
   confident about rather than guessing — an incomplete cast is fine, a wrong one
   isn't.

## Phase 2 — Improvement (parallel Haiku subagents, batched, resumable)

The point of `formatted/` isn't just clean prose — it's the full rich-reading
experience the app is built for: colored dialogue, character cards, scene cards,
pull-quotes, expressive text, footnotes, and a per-chapter story-relevance score.
A chapter with none of that is only half-done, even if the text itself is clean.

1. **Determine the range.** Read `public/books/<id>/.addbook-progress.json` if it
   exists (`{lastCompleted, pending}`); start at `lastCompleted + 1`. Apply any
   chapter-count limit parsed from `$ARGUMENTS` (e.g. "first 300 chapters" caps the
   end index at 300 regardless of how many `original/` chapters exist).
2. **Process the remaining chapters in parallel batches**, batch size ~6-8 (fewer
   if only a handful of chapters remain). For each batch:
   - Launch one **Agent** call per chapter in the batch, **all in a single message**
     (true parallel dispatch, not one-by-one), each with `model: "haiku"`. Every
     subagent is a fresh Haiku instance with no memory of this command, so each
     prompt must be fully self-contained — include the actual `meta.json`
     characters list (keys + names) inline, not just a description of the format:
     > Read `public/books/<id>/chapters/original/<stem>.json` (shape: `{n, title,
     > blocks: [...paragraph strings...]}`). This book's characters:
     > `<paste the meta.json characters map's keys+names here>`.
     >
     > Produce a `{n, title, rel, blocks}` object:
     >
     > **Line-edit, don't rewrite.** Fix clear OCR/extraction artifacts, mangled
     > punctuation, broken line-wraps, and obvious translation-grammar errors,
     > while preserving the author's exact word choices, sentence rhythm, and any
     > intentional repetition or stylistic quirks. If unsure whether something is
     > an error or a deliberate choice, leave it alone — copy-editing, not
     > paraphrasing or summarizing.
     >
     > **Apply the rich-text markup** the reader engine understands, wherever the
     > text actually supports it (don't force it into every paragraph):
     > - `{say:charKey}` at the start of a paragraph when a line of dialogue's
     >   speaker is clear from the narration (use the character keys given above).
     > - `*italics*` / `**bold**` for emphasis already present in the source
     >   (internal thoughts, stressed words).
     > - `{scream:...}`, `{whisper:...}`, `{tremble:...}`, `{cold:...}`, `{glow:...}`,
     >   `{fade:...}` wrapped tightly around a short phrase, for moments where the
     >   prose's own tone is that intense — sparingly, only where it's obviously
     >   earned, never on ordinary lines.
     > - `[fn:term|note]` for a world-building or period term worth a one-line
     >   gloss (a note you can reasonably infer from context, not invented lore).
     > - Replace an isolated scene-break marker (`***`, `* * *`, a blank
     >   line the author clearly used as a hard cut) with `{t:'break'}`.
     > - An explicit time-jump phrase ("The next morning", "Three days later") as
     >   its own block: `{t:'timeskip', x:'<the phrase>'}`.
     > - An in-story letter/note being read aloud on the page as
     >   `{t:'letter', from:charKey, to:'...', sign:'...', lines:[...]}`.
     > - A standalone epigraph/pull-quote as `{t:'quote', x:'...', by:'...'}`.
     > - A vivid, self-contained atmospheric passage (a storm, a candlelit room)
     >   as `{t:'scene', label:'...', fx:'rain'|'candles'|undefined, x:'...'}`.
     > - `{t:'statcard', char:charKey}` the *first* time a major character is
     >   properly introduced (not on every appearance).
     > - Embedded game-UI text (LitRPG stat dumps like "STATS HEALTH 0 SPEED 0")
     >   as `{t:'uistat', items:[{label, value}, ...]}`.
     > These are enrichments, not inventions — every block must be grounded in
     > something actually happening in this chapter's text. Never add dialogue,
     > events, or characters that aren't in the source. When in doubt, leave a
     > paragraph as plain text rather than force it into a block type.
     >
     > **Score story relevance**: add `"rel": <1-10>` to the chapter object — 1-2
     > filler/idle, 3-4 slow burn, 5-6 the story moves, 7-8 a major beat, 9-10
     > pivotal/climactic. Judge by what actually happens in *this* chapter.
     >
     > Write the result to `public/books/<id>/chapters/formatted/<stem>.json`.
     > Reply with just "done" or a one-line error.
   - Once the whole batch returns, **verify on disk** — for each chapter in the
     batch, confirm `chapters/formatted/<stem>.json` actually exists, parses as
     valid JSON, and has a `rel` field (a subagent claiming "done" isn't proof by
     itself). Retry any missing/invalid ones once, still on Haiku. If a chapter
     fails twice, skip it, add its number to `pending` in the progress file, and
     keep going — one bad chapter shouldn't block the rest of the book.
   - Only advance `lastCompleted` past a batch once every chapter in it (other
     than ones added to `pending`) has a verified formatted file on disk. Write
     `public/books/<id>/.addbook-progress.json` after each batch, not just at the
     end — if the run is interrupted or hits its chapter limit, everything up to
     that point must already be valid, readable, formatted chapters.
3. **After each batch, update `public/books/index.json`** for this book:
   `chapterCount` = `lastCompleted` (chapters actually formatted, contiguous from
   the start), `minutes` = sum of `words / 220` across those formatted chapters,
   rounded. The reader must never show a chapter count higher than what's actually
   in `formatted/`.
4. **Report a summary** at the end: how many chapters were formatted this run,
   how many remain (if capped by a limit) or are `pending` (repeatedly failed —
   worth a manual look, or a retry on a stronger model), and remind the user they
   can run `/addbook <same-path> add the rest` later to continue from where this
   run stopped.

## Notes

- Re-running `/addbook` on a source whose `bookId` already exists under `public/books/`
  should resume Phase 2 rather than re-extracting from scratch, unless the user's
  instruction clearly asks for a fresh re-extraction.
- Never invent chapters, dialogue, or plot content that isn't in the source.
- Never fabricate a `characters` entry, cover tint, or any other metadata you're
  not actually confident about — omit it instead.
