/**
 * Viva backend — the only place the LLM API key lives.
 *
 * Runs unchanged on Cloudflare Workers (see wrangler.toml) and on Node 20+
 * (see node-server.js). It exposes a small, purpose-built API rather than a
 * general proxy: prompts are fixed on the server, inputs are length-limited,
 * origins are allow-listed and requests are rate-limited per IP.
 *
 * Environment variables
 *   LLM_API_KEY      required  secret key for the provider
 *   LLM_PROVIDER     optional  "anthropic" (default) or "openai" (any OpenAI-compatible API)
 *   LLM_MODEL        optional  model id; defaults to claude-sonnet-5-5 for anthropic, required for openai
 *   LLM_BASE_URL     optional  override the provider base URL (e.g. an OpenAI-compatible gateway)
 *   ALLOWED_ORIGINS  required in production  comma-separated list, e.g. https://you.github.io
 */

const LIMIT = { windowMs: 5 * 60 * 1000, max: 60 };
const MAX_BODY = 200 * 1024;
const hits = new Map();

const BANDS = `Band guidance (a paraphrase of the public IELTS Speaking band descriptors; award whole bands 0-9 per criterion).
Fluency and Coherence: 9 fluent with only rare, content-related hesitation, fully coherent and well developed. 8 fluent, occasional repetition or self-correction, hesitation mostly for ideas, develops topics coherently. 7 speaks at length without noticeable effort, some language-related hesitation or self-correction, flexible range of connectives. 6 willing to speak at length but coherence is sometimes lost through repetition, self-correction or hesitation; connectives not always appropriate. 5 usually keeps going but relies on repetition, self-correction or slow speech; overuses some connectives; simple speech fluent, complex speech causes problems. 4 noticeable pauses, slow, frequent repetition; links basic sentences with simple connectives. 3 or below: long pauses, limited ability to link sentences.
Lexical Resource: 9 full flexibility and precision, natural idiomatic use. 8 wide resource used readily and flexibly, skilful less-common and idiomatic items with occasional inaccuracy, effective paraphrase. 7 flexible across topics, some less-common and idiomatic vocabulary with awareness of style and collocation, some inappropriate choices. 6 wide enough to discuss topics at length and make meaning clear despite inappropriacies; generally paraphrases successfully. 5 manages familiar and unfamiliar topics with limited flexibility; paraphrase has mixed success. 4 basic meaning on familiar topics only, frequent word-choice errors, rarely paraphrases.
Grammatical Range and Accuracy: 9 full range used naturally, consistently accurate apart from native-like slips. 8 wide range used flexibly, majority of sentences error-free, only occasional non-systematic errors. 7 range of complex structures with some flexibility, frequent error-free sentences though some errors persist. 6 mix of simple and complex structures with limited flexibility; frequent errors in complex structures that rarely impede communication. 5 basic forms reasonably accurate; limited complex structures, usually with errors. 4 basic sentence forms, subordinate structures rare, frequent errors.
Pronunciation: judged by an examiner on individual sounds, word and sentence stress, rhythm, intonation and overall intelligibility. 9 effortless to understand, full range of features with precision. 7 shows the positive features of band 6 and some of band 8. 6 range of features with mixed control, generally understood, occasional mispronunciation. 4 limited range, frequent mispronunciation causing some difficulty.`;

const PROMPTS = {
  plan: `You write original question sets for IELTS Speaking practice. Write new questions in the authentic style and difficulty of the test; never reproduce published test material.
Return ONLY JSON of this shape:
{"part1":[{"topic":"short noun phrase used in 'Let's talk about ...'","questions":["4 short personal questions"]}],
"cueCard":{"topic":"one-word category","prompt":"Describe ...","points":["3 short bullet points beginning who/what/when/where/how"],"closing":"and explain ...","roundOff":"one short yes/no follow-up question","part3Theme":"abstract theme linked to the card","part3":["5 discussion questions moving from general to more abstract and evaluative"]}}
Part 1 questions are about the candidate's own life and can be answered in two or three sentences. Part 3 questions are about society in general, not the candidate.`,

  examiner: `You are an IELTS Speaking examiner conducting Part 3, the two-way discussion. Ask exactly ONE question, in one or two sentences, in neutral professional spoken English.
Rules: never give feedback, praise, hints, corrections or opinions; never explain a question beyond rephrasing it once if the candidate asks; do not repeat any question already asked; build on what the candidate just said when it allows a deeper or more abstract follow-up, otherwise move to a new angle on the theme; raise the level of abstraction gradually if the candidate is coping well and simplify slightly if they are struggling. If the candidate's last answer is very short, a brief "Why?" or "Why do you think that is?" is appropriate.
Return ONLY JSON: {"text":"your question"}`,

  assess: `You are a senior IELTS Speaking examiner writing an assessment of a mock test from its transcript and from signal measurements. Be rigorous and never generous: when evidence sits between two bands, award the lower. Do not inflate scores to encourage the candidate. Short or minimal answers limit the bands that can be evidenced.
${BANDS}
Important limits you must respect:
- The transcript comes from automatic speech recognition. It has no punctuation, may hide hesitations and fillers, and may mis-hear words. Do not penalise an obvious recognition error as a candidate error, and say so where you are unsure.
- You cannot hear the audio. Base Pronunciation ONLY on the measurements provided (pitch movement in semitones, pausing, recognition confidence) and on words that appear to have been mis-recognised. State clearly that the pronunciation band is provisional. If no measurements are present, set it no higher than the lowest of the other three criteria and say it was not assessed.
- Every band must be justified with specific evidence: quote the candidate's own words (short quotes) or cite a measurement. Evidence items must be concrete, not generic.
Return ONLY JSON of this shape:
{"criteria":{"fc":{"band":0,"summary":"one sentence","evidence":["3-5 items quoting the transcript or citing measurements"],"toImprove":["2-3 specific actions"]},"lr":{...},"gra":{...},"pron":{...}},
"examinerNote":"2-3 sentences: overall judgement and the single biggest thing separating this performance from the target band",
"corrections":[{"original":"candidate's words","corrected":"corrected version","explanation":"brief rule"}],
"vocabulary":{"strong":["effective words or phrases the candidate used"],"overused":[{"word":"","count":0}],"upgrades":[{"from":"plain phrase used","to":"more precise alternative","note":"when to use it"}]},
"fluencyNote":"2-3 sentences interpreting speech rate, pausing and coherence",
"pronunciationNote":"2-3 sentences on what the measurements suggest",
"improved":[{"question":"","original":"candidate's answer, shortened if long","improved":"a rewrite at the target band that keeps the candidate's own ideas","why":"what changed"}],
"plan":[{"title":"short action","detail":"how, how often, and what to measure"}]}
Give exactly 3 items in "improved", choosing the answers with the most room to improve, up to 8 corrections, and 3-4 plan items aimed at the candidate's target band.`,

  questions: `You write original IELTS Speaking practice questions in the authentic style of the test; never reproduce published test material. Part 1 questions are short and personal. Part 3 questions are abstract, about society, and invite opinion, comparison or speculation.
Return ONLY JSON: {"questions":["..."]}`,

  cuecard: `You write original IELTS Speaking Part 2 cue cards in the authentic style of the test; never reproduce published test material.
Return ONLY JSON: {"topic":"one-word category","prompt":"Describe ...","points":["3 short bullet points"],"closing":"and explain ...","roundOff":"short follow-up question","part3Theme":"abstract theme","part3":["5 discussion questions"]}`,

  sample: `You write model answers for IELTS Speaking at Band 8 to 9: natural spoken English, well developed, with flexible vocabulary and a range of structures, but not memorised-sounding or overloaded with idioms. Length: Part 1 two to four sentences; Part 2 about 220-260 words; Part 3 four to six sentences.
Return ONLY JSON: {"answer":"...","features":["3 short notes on what makes it Band 8+, each quoting a phrase from the answer"]}`,
};

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  // With no allow-list configured, only local development origins are accepted.
  const ok = allowed.length ? allowed.includes(origin) || allowed.includes('*') : /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ok: ok || !origin,
    headers: {
      'Access-Control-Allow-Origin': ok ? origin : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  };
}

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < LIMIT.windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > LIMIT.max;
}

function config(env) {
  const provider = (env.LLM_PROVIDER || 'anthropic').toLowerCase();
  const model = env.LLM_MODEL || (provider === 'anthropic' ? 'claude-sonnet-5-5' : '');
  return { provider, model, key: env.LLM_API_KEY || '', base: (env.LLM_BASE_URL || '').replace(/\/$/, '') };
}

async function callLLM(env, system, user, maxTokens) {
  const { provider, model, key, base } = config(env);
  let res;
  if (provider === 'anthropic') {
    res = await fetch(`${base || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
  } else {
    res = await fetch(`${base || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('LLM error', res.status, detail.slice(0, 500));
    const err = new Error(res.status === 401 || res.status === 403 ? 'The backend’s LLM API key was rejected.' : res.status === 429 ? 'The AI provider is rate-limiting requests. Try again shortly.' : 'The AI provider returned an error.');
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const text = provider === 'anthropic' ? (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('') : data.choices?.[0]?.message?.content || '';
  return text;
}

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json');
  return JSON.parse(text.slice(start, end + 1));
}

async function askJson(env, system, user, maxTokens) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callLLM(env, system, attempt ? `${user}\n\nReturn valid JSON only, with no commentary.` : user, maxTokens);
    try { return parseJson(text); } catch { /* retry once */ }
  }
  const err = new Error('The AI returned a response that could not be read. Please try again.');
  err.status = 502;
  throw err;
}

const routes = {
  async '/api/plan'(body, env) {
    const avoid = (Array.isArray(body.avoid) ? body.avoid : []).slice(0, 30).map((s) => clip(s, 80)).join('; ');
    const topics = Math.min(3, Math.max(1, Number(body.topics) || 3));
    const out = await askJson(env, PROMPTS.plan, `Write ${topics} Part 1 topic frame(s) and one cue card with its Part 3 questions. The first Part 1 frame may be about work or studies. Avoid these recently used topics: ${avoid || 'none'}.`, 1500);
    if (!Array.isArray(out.part1) || !out.cueCard?.prompt || !Array.isArray(out.cueCard.part3)) throw Object.assign(new Error('The AI returned an incomplete question set.'), { status: 502 });
    return out;
  },
  async '/api/examiner'(body, env) {
    const history = (Array.isArray(body.history) ? body.history : []).slice(-12).map((h) => `${h.role === 'examiner' ? 'Examiner' : 'Candidate'}: ${clip(h.text, 1200)}`).join('\n');
    const asked = (Array.isArray(body.asked) ? body.asked : []).slice(-20).map((s) => `- ${clip(s, 300)}`).join('\n');
    const pool = (Array.isArray(body.fallback) ? body.fallback : []).slice(0, 6).map((s) => `- ${clip(s, 300)}`).join('\n');
    const out = await askJson(env, PROMPTS.examiner, `Theme: ${clip(body.theme, 120)}\n\nConversation so far:\n${history || '(none yet)'}\n\nQuestions already asked (do not repeat):\n${asked || '(none)'}\n\nPrepared questions you may use or adapt:\n${pool || '(none)'}\n\nAsk the next question.`, 200);
    if (!out.text) throw Object.assign(new Error('The AI returned no question.'), { status: 502 });
    return { text: clip(String(out.text), 400) };
  },
  async '/api/assess'(body, env) {
    const answers = (Array.isArray(body.answers) ? body.answers : []).slice(0, 40);
    if (!answers.length) throw Object.assign(new Error('There are no answers to assess.'), { status: 400 });
    const transcript = answers.map((a, i) => `[${i + 1}] Part ${Number(a.part) || 1}${a.longTurn ? ' (long turn)' : ''}${a.typed ? ' (typed, not spoken)' : ''}\nQ: ${clip(a.question, 500)}\nA: ${clip(a.answer, 4000) || '(no answer)'}\nMeasured: ${clip(JSON.stringify(a.metrics || {}), 500)}`).join('\n\n');
    const target = [7, 7.5, 8, 8.5, 9].includes(Number(body.target)) ? Number(body.target) : 7;
    return askJson(env, PROMPTS.assess, `Candidate's target band: ${target}\n\nSession measurements: ${clip(JSON.stringify(body.measurements || {}), 1500)}\n(wpm = words per minute; pauses = silences of 1s or more; longPauses = 2.5s or more; pitchSdSt = pitch standard deviation in semitones, under 1.5 is flat; confidence = mean speech-recognition confidence 0-1; null = not measured.)\n\nTranscript:\n${transcript}`, 4000);
  },
  async '/api/generate'(body, env) {
    const topic = clip(body.topic, 80) || 'any everyday topic';
    if (body.kind === 'questions') {
      const part = Number(body.part) === 3 ? 3 : 1;
      const count = Math.min(8, Math.max(1, Number(body.count) || 5));
      const out = await askJson(env, PROMPTS.questions, `Write ${count} Part ${part} questions about: ${topic}.`, 600);
      return { questions: (Array.isArray(out.questions) ? out.questions : []).map((q) => clip(String(q), 300)).slice(0, count) };
    }
    if (body.kind === 'cuecard') return askJson(env, PROMPTS.cuecard, `Write one cue card on the topic: ${topic}.`, 700);
    if (body.kind === 'sample') return askJson(env, PROMPTS.sample, `Part ${Number(body.part) || 1} question: ${clip(body.question, 800)}`, 900);
    throw Object.assign(new Error('Unknown generation kind.'), { status: 400 });
  },
};

export async function handle(request, env) {
  const c = cors(request, env);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...c.headers } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
  if (!c.ok) return json({ error: 'This origin is not allowed. Add it to ALLOWED_ORIGINS on the backend.' }, 403);

  const url = new URL(request.url);
  const cfg = config(env);
  if (url.pathname === '/health' || url.pathname === '/') {
    if (!cfg.key) return json({ ok: false, error: 'The backend is running but LLM_API_KEY is not set.' }, 503);
    if (!cfg.model) return json({ ok: false, error: 'The backend is running but LLM_MODEL is not set.' }, 503);
    return json({ ok: true, provider: cfg.provider, model: cfg.model });
  }

  const route = routes[url.pathname];
  if (!route || request.method !== 'POST') return json({ error: 'Not found.' }, 404);
  if (!cfg.key || !cfg.model) return json({ error: 'The backend is not configured with an LLM key and model.' }, 503);

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  if (limited(ip)) return json({ error: 'Too many requests. Please wait a few minutes.' }, 429);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'The request was too large.' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'The request body was not valid JSON.' }, 400);
  }

  try {
    return json(await route(body || {}, env));
  } catch (e) {
    if (!e.status) console.error(e);
    return json({ error: e.status ? e.message : 'The backend hit an unexpected error.' }, e.status || 500);
  }
}

export default { fetch: (request, env) => handle(request, env) };
