/* Server-only: formats one chapter via OpenRouter (fast, direct HTTP call — no
   agent/tool-call overhead). Used by app/api/format-chapter/route.js for
   progressive on-demand formatting as a reader gets close to an unformatted
   chapter. Requires OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL) in
   .env.local — never expose these client-side. */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(chapter, characters) {
  const charList = Object.entries(characters || {})
    .map(([key, c]) => {
      const aliases = (c.aliases || []).filter((a) => a && a.toLowerCase() !== c.name.toLowerCase());
      return `${key} (${c.name}${aliases.length ? ', also called: ' + aliases.join(', ') : ''})`;
    })
    .join(', ') || 'none identified — skip {say:} tags';

  return `You are formatting one chapter of a novel for a rich-text reading app. Characters in this book: ${charList}.

The source text below is PLAIN, UNFORMATTED text extracted straight from an ebook — it has no italics, no bold, no speaker tags, nothing. That does not mean it should stay plain. Your job is to actively apply the markup below wherever the prose supports it, not just to tidy punctuation. A chapter that comes back with only one or two {say:} tags and nothing else is under-formatted and wrong — go through EVERY paragraph and actively decide which markup fits it, the way a professional ebook typesetter would when adapting a raw manuscript.

For any charKey field ({say:charKey}, statcard char, letter from, delta char): use one of the exact keys listed above, lowercase, exactly as given — never invent a new casing of an existing key. If a paragraph's speaker is a character NOT in that list (a minor/new character), you may still tag them with a new lowercase_snake_case key of your own choosing, consistently reused for that same character within this chapter.

Line-edit only — fix clear OCR/extraction artifacts, mangled punctuation, missing spaces after periods/commas, broken line-wraps, and obvious translation-grammar errors, while preserving the author's exact word choices, sentence rhythm, and any intentional repetition or stylistic quirks. This is copy-editing, not paraphrasing or summarizing. Never change or remove a sentence to "apply" markup — markup wraps the existing words, it never replaces them.

Two different kinds of markup — do not mix them up:

1. INLINE TEXT TOKENS stay inside a plain paragraph string, written exactly as shown:
   - {say:charKey} at the very start of a paragraph (nowhere else in it), ONLY on a paragraph that actually contains quoted speech (" " or “ ”) — never on plain narration or internal monologue, even first-person ones, no matter how much it reads like a character's "voice". Apply it whenever that quoted line's speaker is identifiable from the narration, even loosely (a pronoun tied to a recently-named character counts) — this is the single highest-value tag in the whole system and it should appear on nearly every paragraph that opens with an actual quotation mark. Skip it entirely on chapters/paragraphs with no dialogue in them at all.
   - *italics* for silent first-person internal thought/monologue — a very common pattern in translated web novels: an unquoted sentence in the character's own voice, reacting or reasoning in the moment (e.g. "Why would I suddenly have such a headache?" or "This can't be real..."), as opposed to third-person narration describing what happened. Wrap the whole thought. This prose is full of these — actively look for them in every paragraph, don't wait for an obvious cue.
   - *italics* / **bold** for any other emphasis a careful reader would put weight on — a stressed word, a title of a work, a foreign/invented term on first use.
   - {item:...} wrapped tightly around a mention of a specific, plot-relevant physical object once it's been established (a named weapon, a letter, a key artifact, a distinctive keepsake) — not every generic noun, but the objects the story is actually asking the reader to track. Reuse the same wording style consistently for the same object within a chapter.
   - {scream:...}, {whisper:...}, {tremble:...}, {cold:...}, {glow:...}, {fade:...} wrapped tightly around a short phrase — use these more than you'd think for a moody, atmospheric book: a shouted line, a fearful whisper, a shudder of dread, a supernatural chill, an eerie glow, a fading-out sentence. If the chapter has any horror, tension, or mystical beats at all, at least one of these should usually appear.
   - [fn:term|note] for a world-building or period term worth a one-line gloss (titles, currency, institutions, in-world terminology) — the first time it's used in the chapter.

2. TYPED BLOCKS are their own separate JSON OBJECT entries in the blocks array — never write their syntax as text inside a paragraph string. The notation below (t:'break') is shorthand for the SHAPE only; what you actually emit must be a real JSON object with double-quoted keys/strings, e.g. {"t":"break"}, as its own array element, not embedded in any string:
   - {t:'break'} in place of an isolated scene-break marker (***, a clear hard cut, or an unmistakable jump to a new moment with no transition sentence).
   - {t:'timeskip', x:'<phrase>'} for an explicit time-jump phrase.
   - {t:'letter', from:charKey, to:'...', sign:'...', lines:[...]} for an in-story letter/note read on the page.
   - {t:'quote', x:'...', by:'...'} for a standalone epigraph/pull-quote.
   - {t:'scene', label:'...', fx:'rain'|'candles'|undefined, x:'...'} for a vivid, self-contained atmospheric passage (weather, lighting, a striking setting) — this book leans gothic/mystical and usually has at least one per chapter worth pulling out.
   - {t:'statcard', char:charKey} the first time a major character is properly introduced in this chapter.
   - {t:'uistat', items:[{label, value}, ...]} for embedded game-UI stat-dump text (e.g. "STATS HEALTH 0 SPEED 0").

These enrich the existing text — they never invent new dialogue, events, characters, or objects that aren't in the source, and they never alter meaning. But within those bounds, be generous: a well-formatted chapter usually has italicized thoughts in most paragraphs of introspection, a {say:} tag on nearly every dialogue line, and at least one or two of the rarer blocks (scene/quote/item/fx) if the chapter's content supports it at all. Only leave a paragraph completely bare when it's pure connective narration with no thought, no object, no dialogue, and no atmosphere to mark.

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
