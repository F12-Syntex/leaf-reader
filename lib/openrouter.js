/* Server-only: formats one chapter via OpenRouter (fast, direct HTTP call — no
   agent/tool-call overhead). Used by app/api/format-chapter/route.js for
   progressive on-demand formatting as a reader gets close to an unformatted
   chapter. Requires OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL) in
   .env.local — never expose these client-side. */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(chapter, characters) {
  const charList = Object.entries(characters || {})
    .map(([key, c]) => `${key} (${c.name})`)
    .join(', ') || 'none identified — skip {say:} tags';

  return `You are formatting one chapter of a novel for a rich-text reading app. Characters in this book: ${charList}.

For any charKey field ({say:charKey}, statcard char, letter from, delta char): use one of the exact keys listed above, lowercase, exactly as given — never invent a new casing of an existing key. If a paragraph's speaker is a character NOT in that list (a minor/new character), you may still tag them with a new lowercase_snake_case key of your own choosing, consistently reused for that same character within this chapter.

Line-edit only — fix clear OCR/extraction artifacts, mangled punctuation, missing spaces after periods/commas, broken line-wraps, and obvious translation-grammar errors, while preserving the author's exact word choices, sentence rhythm, and any intentional repetition or stylistic quirks. This is copy-editing, not paraphrasing or summarizing.

Two different kinds of markup — do not mix them up:

1. INLINE TEXT TOKENS stay inside a plain paragraph string, written exactly as shown:
   - {say:charKey} at the very start of a paragraph (nowhere else in it) when a line of dialogue's speaker is clear from narration.
   - *italics* / **bold** for emphasis already present in the source.
   - {scream:...}, {whisper:...}, {tremble:...}, {cold:...}, {glow:...}, {fade:...} wrapped tightly around a short phrase, only where the prose's own tone is that intense.
   - [fn:term|note] for a world-building/period term worth a one-line gloss.

2. TYPED BLOCKS are their own separate JSON OBJECT entries in the blocks array — never write their syntax as text inside a paragraph string. The notation below (t:'break') is shorthand for the SHAPE only; what you actually emit must be a real JSON object with double-quoted keys/strings, e.g. {"t":"break"}, as its own array element, not embedded in any string:
   - {t:'break'} in place of an isolated scene-break marker (***, a clear hard cut).
   - {t:'timeskip', x:'<phrase>'} for an explicit time-jump phrase.
   - {t:'letter', from:charKey, to:'...', sign:'...', lines:[...]} for an in-story letter/note read on the page.
   - {t:'quote', x:'...', by:'...'} for a standalone epigraph/pull-quote.
   - {t:'scene', label:'...', fx:'rain'|'candles'|undefined, x:'...'} for a vivid, self-contained atmospheric passage.
   - {t:'statcard', char:charKey} the first time a major character is properly introduced in this chapter.
   - {t:'uistat', items:[{label, value}, ...]} for embedded game-UI stat-dump text (e.g. "STATS HEALTH 0 SPEED 0").

These are enrichments, not inventions — every block must be grounded in something actually happening in this chapter. Never add dialogue, events, or characters not in the source. When in doubt, leave a paragraph as plain text.

Also add "rel": <1-10> — story relevance of THIS chapter (1-2 filler/idle, 3-4 slow burn, 5-6 the story moves, 7-8 major beat, 9-10 pivotal/climactic).

Chapter JSON (n, title, blocks are plain paragraph strings):
${JSON.stringify({ n: chapter.n, title: chapter.title, blocks: chapter.blocks })}

Reply with ONLY a single minified JSON object of the shape {"n":"...","title":"...","rel":<int>,"blocks":[...]} — no markdown code fences, no prose before or after.`;
}

export async function formatChapterViaOpenRouter(chapter, characters) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:nitro';
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildPrompt(chapter, characters) }],
      temperature: 0.3,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
      /* gpt-oss models on OpenRouter can't disable reasoning outright (400s),
         and default/medium effort burns most of max_tokens on hidden reasoning
         before ever writing the JSON, truncating the reply mid-chapter
         (finish_reason: "length"). Low effort leaves enough budget to finish. */
      reasoning: { effort: 'low' },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in OpenRouter response');
  return JSON.parse(match[0]);
}
