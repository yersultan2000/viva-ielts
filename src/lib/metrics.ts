/** Transcript analysis. Everything here is a plain measurement of the words that were recognised. */

export const tokens = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) || []).map((t) => t.replace('’', "'"));

const FILLER_WORD = /^(u+m+|u+h+|e+r+m*|h+m+|a+h+|m+m+)$/;
const FILLER_PHRASES = ['you know', 'i mean', 'sort of', 'kind of'];

export function countFillers(text: string): { count: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {};
  const toks = tokens(text);
  for (const t of toks) if (FILLER_WORD.test(t)) byType[t] = (byType[t] || 0) + 1;
  const lower = ' ' + toks.join(' ') + ' ';
  for (const p of FILLER_PHRASES) {
    const n = lower.split(` ${p} `).length - 1;
    if (n) byType[p] = n;
  }
  return { count: Object.values(byType).reduce((a, b) => a + b, 0), byType };
}

export function repetitions(toks: string[]): number {
  let n = 0;
  for (let i = 1; i < toks.length; i++) if (toks[i] === toks[i - 1] && toks[i].length > 1 && toks[i] !== 'very') n++;
  return n;
}

export const CONNECTIVES = [
  'however', 'although', 'though', 'whereas', 'while', 'because', 'since', 'therefore', 'so', 'besides',
  'moreover', 'furthermore', 'instead', 'otherwise', 'unless', 'actually', 'for example', 'for instance',
  'on the other hand', 'in addition', 'as a result', 'in fact', 'having said that', 'apart from', 'even though',
  'as well as', 'first of all', 'in the end', 'at the same time', 'to be honest', 'that said', 'by contrast',
];

export function connectivesUsed(text: string): string[] {
  const lower = ' ' + tokens(text).join(' ') + ' ';
  return CONNECTIVES.filter((c) => lower.includes(` ${c} `));
}

const STRUCTURES: [string, RegExp][] = [
  ['conditional', /\bif\b[^.?!]{0,60}\b(would|will|could|might|had)\b|\bunless\b|\bhad i\b|\bwere i\b/],
  ['present perfect', /\b(have|has|i've|we've|they've|you've|he's|she's|it's) (never |always |just |already |recently |ever )?(been|\w+ed|gone|seen|done|had|made|taken|known|become|grown|found)\b/],
  ['past perfect', /\b(had|i'd|he'd|she'd|we'd|they'd) (never |already |just )?(been|\w+ed|gone|seen|done|made|taken|known|planned)\b/],
  ['passive', /\b(is|are|was|were|been|being|be|get|got) (\w+ly )?(\w+ed|given|taken|made|built|known|seen|done|held|taught|told|written|shown)\b/],
  ['relative clause', /\b(which|who|whose|whom|where)\b/],
  ['modal perfect', /\b(would|could|should|might|must) (not )?have\b|\b(would've|could've|should've)\b/],
  ['used to', /\bused to\b/],
  ['comparative', /\b(more|less) \w+ than\b|\b\w+er than\b|\bas \w+ as\b/],
  ['future form', /\b(going to|will|won't|i'll|we'll|they'll)\b/],
];
const SUBORDINATORS = ['because', 'although', 'though', 'which', 'who', 'whose', 'if', 'when', 'while', 'whereas', 'unless', 'since', 'until', 'whenever', 'whether', 'that'];

export function structuresUsed(text: string): string[] {
  const lower = tokens(text).join(' ');
  return STRUCTURES.filter(([, re]) => re.test(lower)).map(([n]) => n);
}
export function subordinatorCount(toks: string[]): number {
  return toks.filter((t) => SUBORDINATORS.includes(t)).length;
}

/** Moving-average type–token ratio: lexical variety that does not shrink as answers get longer. */
export function mattr(toks: string[], win = 40): number | null {
  if (toks.length < win) return toks.length >= 15 ? new Set(toks).size / toks.length : null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + win <= toks.length; i += 5) {
    sum += new Set(toks.slice(i, i + win)).size / win;
    n++;
  }
  return sum / n;
}

const STOP = new Set(
  `a about above after again all also am an and any are aren't as at be because been before being below between both but by
can can't cannot could couldn't did didn't do does doesn't doing don't down during each even ever every few for from further get got
had hadn't has hasn't have haven't having he he's her here hers him his how i i'd i'll i'm i've if in into is isn't it it's its just
kind know like lot lots many may me might more most much must my no nor not now of off on once one only or other our out over own
quite rather really same she she's should so some such than that that's the their them then there there's these they they're thing things
think this those though through time to too under until up us very was wasn't way we we're well were what when where which while who
why will with would wouldn't yes yeah you you're your people something someone actually usually always never sometimes often
going go went good bad big small new old different little long great make made take took say said see saw come came want need
year years day days today yesterday tomorrow week month probably maybe perhaps because however although`.split(/\s+/),
);

export function lessCommonWords(toks: string[]): string[] {
  const seen = new Set<string>();
  for (const t of toks) if (t.length >= 8 && !STOP.has(t) && !t.includes("'")) seen.add(t);
  return [...seen];
}

export function overusedWords(toks: string[]): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of toks) if (!STOP.has(t) && t.length > 3) counts.set(t, (counts.get(t) || 0) + 1);
  const min = Math.max(4, Math.round(toks.length * 0.02));
  return [...counts.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));
}

interface Rule {
  re: RegExp;
  fix: (m: RegExpExecArray) => string;
  why: string;
  guardPrev?: string[];
}
const BASE: Record<string, string> = {
  went: 'go', saw: 'see', came: 'come', took: 'take', made: 'make', got: 'get', knew: 'know', gave: 'give',
  found: 'find', thought: 'think', told: 'tell', became: 'become', bought: 'buy', ate: 'eat', did: 'do', had: 'have',
};
const THIRD: Record<string, string> = {
  "don't": "doesn't", have: 'has', do: 'does', go: 'goes', like: 'likes', want: 'wants', need: 'needs', live: 'lives', work: 'works',
};
const AUX = ['does', 'did', 'do', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must', 'to', 'let', 'make', 'made', 'help', 'see', 'saw', 'watch', "doesn't", "didn't", "don't", "won't", "can't"];

const RULES: Rule[] = [
  { re: /\bmore (better|worse|easier|bigger|smaller|faster|cheaper|older|younger|harder)\b/g, fix: (m) => m[1], why: 'Double comparative: the -er form already means "more".' },
  { re: /\b(informations|advices|furnitures|equipments|homeworks|knowledges|luggages|traffics|sceneries)\b/g, fix: (m) => m[1].replace(/ies$/, 'y').replace(/s$/, ''), why: 'Uncountable noun: no plural form.' },
  { re: /\bam agree\b/g, fix: () => 'agree', why: '"Agree" is a verb, so it does not take "am".' },
  { re: /\b(didn't|did not|doesn't|does not|don't|do not) (went|saw|came|took|made|got|knew|gave|found|thought|told|became|bought|ate|did|had)\b/g, fix: (m) => `${m[1]} ${BASE[m[2]]}`, why: 'After do/does/did, use the base form of the verb.' },
  { re: /\b(he|she|it) (don't|have|do|go|like|want|need|live|work)\b/g, fix: (m) => `${m[1]} ${THIRD[m[2]]}`, why: 'Third-person singular needs -s in the present simple.', guardPrev: AUX },
  { re: /\bpeoples\b/g, fix: () => 'people', why: '"People" is already plural.' },
  { re: /\bdiscuss about\b/g, fix: () => 'discuss', why: '"Discuss" takes a direct object, with no preposition.' },
  { re: /\bmarried with\b/g, fix: () => 'married to', why: 'The preposition after "married" is "to".' },
  { re: /\b(depend|depends) of\b/g, fix: (m) => `${m[1]} on`, why: 'The preposition after "depend" is "on".' },
  { re: /\blisten (music|the music|him|her|them|podcasts|the radio)\b/g, fix: (m) => `listen to ${m[1]}`, why: '"Listen" needs "to" before its object.' },
  { re: /\bexplain me\b/g, fix: () => 'explain to me', why: '"Explain" needs "to" before the person.' },
  { re: /\bin my opinion i think\b/g, fix: () => 'in my opinion', why: 'Redundant: use one opinion marker, not two.' },
  { re: /\bi am (work|live|study|go|like|think|agree|prefer)\b/g, fix: (m) => `I ${m[1]}`, why: 'Use the present simple ("I work") or the continuous ("I am working"), not a mix.' },
  { re: /\ba (apple|hour|idea|interesting|important|old|easy|umbrella|engineer|example|issue|opportunity|experience|amazing|excellent|honest)\b/g, fix: (m) => `an ${m[1]}`, why: 'Use "an" before a vowel sound.' },
  { re: /\bmany (money|time|work|information|traffic|homework|advice)\b/g, fix: (m) => `much ${m[1]}`, why: 'Uncountable nouns take "much" or "a lot of", not "many".' },
  { re: /\bless (people|cars|students|children|jobs|friends|problems)\b/g, fix: (m) => `fewer ${m[1]}`, why: 'Countable plurals take "fewer".' },
  { re: /\bvery (delicious|excellent|perfect|enormous|fantastic|amazing|terrible|awful|exhausted|essential)\b/g, fix: (m) => `absolutely ${m[1]}`, why: 'Extreme adjectives take "absolutely" or "really", not "very".' },
  { re: /\blook(ing)? forward to (see|meet|go|hear|visit|work)\b/g, fix: (m) => `look${m[1] || ''} forward to ${m[2]}ing`, why: 'After "look forward to", use the -ing form.' },
  { re: /\bone of (my|the) (best |main |biggest |favourite |favorite |most important )?(friend|reason|problem|hobby|teacher|place|thing|city|way)\b(?!s)/g, fix: (m) => `one of ${m[1]} ${m[2] || ''}${m[3].replace(/y$/, 'ie')}s`, why: '"One of" is followed by a plural noun.' },
];

export interface RuleHit {
  original: string;
  corrected: string;
  explanation: string;
}

export function grammarHits(text: string): RuleHit[] {
  const lower = tokens(text).join(' ');
  const hits: RuleHit[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(lower))) {
      const before = lower.slice(0, m.index).trim().split(' ');
      if (rule.guardPrev && rule.guardPrev.includes(before[before.length - 1])) continue;
      const after = lower.slice(m.index + m[0].length).trim().split(' ').slice(0, 4).join(' ');
      const lead = before.slice(-4).join(' ');
      const original = `${lead} ${m[0]} ${after}`.trim();
      if (seen.has(original)) continue;
      seen.add(original);
      hits.push({ original, corrected: `${lead} ${rule.fix(m)} ${after}`.trim(), explanation: rule.why });
    }
  }
  return hits.slice(0, 10);
}
