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

The source text below is PLAIN, UNFORMATTED text extracted straight from an ebook — it has no italics, no bold, no speaker tags, nothing. That does not mean it should stay plain. Your job is to actively apply the markup below wherever the prose supports it, not just to tidy punctuation. A chapter that comes back with only one or two {say:} tags and nothing else is under-formatted and wrong — go through EVERY paragraph and actively decide which markup fits it, the way a professional ebook typesetter would when adapting a raw manuscript. Aim for VARIETY: a well-formatted chapter mixes dialogue tags, italic thoughts, several different inline effects, and 2-5 typed blocks — not the same one or two devices repeated.

For any charKey field ({say:charKey}, statcard char, letter from, delta char): use one of the exact keys listed above, lowercase, exactly as given — never invent a new casing of an existing key. If a paragraph's speaker is a character NOT in that list (a minor/new character), you may still tag them with a new lowercase_snake_case key of your own choosing, consistently reused for that same character within this chapter.

Line-edit only — fix clear OCR/extraction artifacts, mangled punctuation, missing spaces after periods/commas, broken line-wraps, and obvious translation-grammar errors, while preserving the author's exact word choices, sentence rhythm, and any intentional repetition or stylistic quirks. This is copy-editing, not paraphrasing or summarizing. Never change or remove a sentence to "apply" markup — markup wraps the existing words, it never replaces them. Every sentence of the source must appear in your output.

Two different kinds of markup — DO NOT mix them up:

1. INLINE TEXT TOKENS stay inside a plain paragraph string, written exactly as shown:
   - {say:charKey} at the very start of a paragraph (nowhere else in it), ONLY on a paragraph that actually contains quoted speech (" " or “ ”) — never on plain narration or internal monologue. Apply it whenever that quoted line's speaker is identifiable from the narration, even loosely (a pronoun tied to a recently-named character counts) — this is the single highest-value tag in the whole system and it should appear on nearly every paragraph that opens with an actual quotation mark.
   - *italics* for silent first-person internal thought/monologue — a very common pattern in translated web novels: an unquoted sentence in the character's own voice, reacting or reasoning in the moment, as opposed to third-person narration describing what happened. Wrap the whole thought. This prose is full of these — actively look for them.
   - *italics* / **bold** for any other emphasis a careful reader would put weight on — a stressed word, a title of a work, a foreign/invented term on first use.
   - {item:...} wrapped tightly around a mention of a specific, plot-relevant physical object once it's been established (a named weapon, a letter, a key artifact) — the objects the story is asking the reader to track.
   - Expressive effects, wrapped tightly around a SHORT phrase (a few words, never a whole paragraph). Fifteen kinds — pick whichever truly fits the moment, and vary them:
       {scream:...} a shouted/screamed line · {whisper:...} hushed or fearful speech · {tremble:...} shaking dread · {cold:...} supernatural chill · {glow:...} eerie radiance · {fade:...} a sentence trailing away · {echo:...} a voice reverberating or repeating in the mind · {chant:...} an incanted phrase or prayer spoken aloud · {blood:...} visceral gore or injury · {divine:...} holy/godly presence, divine power · {shadow:...} darkness, something moving unseen · {thunder:...} a heavy impact or deafening sound described in prose · {ancient:...} archaic or timeworn words, old inscriptions · {tiny:...} a meek, small, barely-audible utterance · {mind:...} telepathy or a voice heard inside the head.
     A moody, atmospheric chapter should typically use 4-10 of these across several DIFFERENT kinds.
   - [fn:term|note] for a world-building term worth a one-line gloss (titles, currency, institutions, in-world terminology) — the first time it's used in the chapter.

2. TYPED BLOCKS are their own separate JSON OBJECT entries in the blocks array. Every field name and every string value must use standard JSON double quotes, e.g. {"t":"scene","label":"The fog","x":"..."}. NEVER write block syntax as text inside a paragraph string — a paragraph string must contain only prose and the inline tokens from section 1. NEVER invent your own object shape (no {"say":...,"text":...} objects — dialogue is a STRING starting with {say:key}). Available blocks:
   - {"t":"break"} in place of an isolated scene-break marker (***, a clear hard cut).
   - {"t":"timeskip","x":"<phrase>"} for an explicit time-jump phrase ("Three days later...").
   - {"t":"quote","x":"...","by":"..."} for a standalone epigraph/pull-quote, or one striking line worth pulling out large.
   - {"t":"scene","label":"...","fx":"rain|candles|fog|snow|embers|moonlight","x":"..."} for a vivid, self-contained atmospheric passage (weather, lighting, a striking setting) — fx optional, only when it matches. This book leans gothic/mystical and usually has one per chapter worth pulling out.
   - {"t":"sfx","x":"Bam!"} for a short standalone onomatopoeia paragraph ("Bam!", "Kacha!", "Boom—") — the source has many; convert the isolated ones (a paragraph that is ONLY the sound).
   - {"t":"dream","label":"...","x":"..."} for a dream, vision, hallucination, or divination scene passage.
   - {"t":"flashback","label":"...","x":"..."} for a passage that is explicitly a memory/recollection of an earlier moment.
   - {"t":"ritual","lines":["...","..."]} for a spoken ritual, spell, incantation, or prayer of one or more lines (e.g. honorific names recited at a séance).
   - {"t":"poem","lines":["...","..."]} for verse, song lyrics quoted in the text, or a rhyme.
   - {"t":"sys","lines":["...","..."]} for mystical/system notifications the character perceives as text or a voice of rules (messages, prompts, revelations formatted like an interface).
   - {"t":"sign","x":"..."} for the text of a signboard, plaque, gravestone, nameplate, or storefront read in the scene.
   - {"t":"news","title":"...","x":"...","source":"..."} for a newspaper article, headline, or printed notice being read — title/source optional.
   - {"t":"letter","from":"charKey","to":"...","sign":"...","lines":["..."]} for an in-story letter/note read on the page.
   - {"t":"statcard","char":"charKey"} the first time a major character is properly introduced in this chapter.
   - {"t":"statrow","chars":["charKey",...]} instead of multiple statcards back-to-back, when two or more characters are introduced or reunite in the same scene.
   - {"t":"delta","char":"charKey","label":"...","from":0-10,"to":0-10,"note":"..."} when the text explicitly shows a character's condition shifting on some measurable axis within this chapter — sanity/composure, health/injury, suspicion, resolve, a relationship warming or souring. from/to are your best-effort 0-10 read of that axis before/after AS DEPICTED in this chapter, label names the axis, note is a short grounding phrase from what actually happened. Only for a real, textually-evident shift.
   - {"t":"journey","from":"...","to":"...","dist":"...","meta":["..."]} when the chapter narrates travel between two named places — dist only if the text gives one.
   - {"t":"uistat","items":[{"label":"...","value":"..."},...]} for embedded game-UI stat-dump text.

CORRECT blocks array shape (mixed strings and objects):
  ["{say:klein} \\"Be careful!\\" he shouted, {tremble:his hands shaking}.", {"t":"sfx","x":"Bam!"}, "*This can't be real...* Klein stared at the {item:brass spirit pendulum}.", {"t":"break"}]
WRONG (never do these): a paragraph string containing {t:"break"} or {"t":"scene"...}; an object like {"say":"klein","text":"..."}; single-quoted JSON.

These enrich the existing text — they never invent new dialogue, events, characters, or objects that aren't in the source, and they never alter meaning. But within those bounds, be generous: a well-formatted chapter usually has italicized thoughts in most paragraphs of introspection, a {say:} tag on nearly every dialogue line, several different expressive effects, and 2-5 typed blocks when the content supports them. Only leave a paragraph completely bare when it's pure connective narration with no thought, no object, no dialogue, and no atmosphere to mark.

Also add "rel": <1-10> — story relevance of THIS chapter (1-2 filler/idle, 3-4 slow burn, 5-6 the story moves, 7-8 major beat, 9-10 pivotal/climactic).

Chapter JSON (n, title, blocks are plain paragraph strings):
${JSON.stringify({ n: chapter.n, title: chapter.title, blocks: chapter.blocks })}

Reply with ONLY a single minified JSON object of the shape {"n":"...","title":"...","rel":<int>,"blocks":[...]} — no markdown code fences, no prose before or after.`;
}

/* correction — an optional note appended to the prompt when a previous
   attempt came back broken, telling the model exactly what to avoid */
export async function formatChapterViaOpenRouter(chapter, characters, correction) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:nitro';
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  let prompt = buildPrompt(chapter, characters);
  if (correction) prompt += `\n\nIMPORTANT — a previous attempt at this chapter was rejected for the following problems; do not repeat them:\n${correction}`;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
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
