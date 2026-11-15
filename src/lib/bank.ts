import type { CueCard, Part1Topic } from './types';

/**
 * Built-in question bank. All questions are original, written in the style of the
 * IELTS Speaking test. The bank drives demo mode and is the fallback whenever the
 * AI backend cannot be reached.
 */

export const PART1: Part1Topic[] = [
  {
    id: 'work-study',
    topic: 'your work or studies',
    questions: [
      'Do you work, or are you a student?',
      'What do you find most interesting about that?',
      'Is there anything about it that you would like to change?',
      'What do you hope to be doing in five years’ time?',
    ],
    model:
      'I’m in my final year of a civil engineering degree. It’s a demanding course, to be honest, but I chose it because I’ve always been curious about how large structures actually stay standing, and that curiosity hasn’t worn off.',
  },
  {
    id: 'hometown',
    topic: 'your hometown',
    questions: [
      'Where is your hometown?',
      'What do you like most about it?',
      'Has it changed much since you were a child?',
      'Would you recommend it as a place to live?',
    ],
    model:
      'I come from a mid-sized city in the south of the country, about three hours from the capital. It isn’t particularly well known, but it sits right at the foot of the mountains, so people tend to pass through it on their way to go hiking.',
  },
  {
    id: 'home',
    topic: 'the place where you live',
    questions: [
      'Do you live in a house or a flat?',
      'Which room do you spend the most time in?',
      'What can you see from your windows?',
      'Is there anything you would like to change about your home?',
    ],
    model:
      'I live in a fairly small flat on the fourth floor of an older building. It’s nothing fancy, but it gets a lot of natural light in the mornings, which was honestly the main reason I took it.',
  },
  {
    id: 'reading',
    topic: 'reading',
    questions: [
      'Do you enjoy reading?',
      'What kinds of things do you usually read?',
      'Did you read much when you were a child?',
      'Do you prefer reading on paper or on a screen?',
    ],
    model:
      'I do, although I read far less than I used to. These days it’s mostly long articles on my commute rather than whole books, because I find it hard to set aside an uninterrupted hour.',
  },
  {
    id: 'food',
    topic: 'food and cooking',
    questions: [
      'Do you like cooking?',
      'What did you eat most often when you were growing up?',
      'Is there a dish you would like to learn to make?',
      'Do you think people in your country eat healthily?',
    ],
    model:
      'I’d say I like it when I have the time. On a weekday it feels like a chore, but at the weekend I genuinely enjoy spending an afternoon on something slow, like a stew, with music on in the background.',
  },
  {
    id: 'technology',
    topic: 'mobile phones',
    questions: [
      'How often do you use your phone?',
      'What do you use it for most?',
      'Is there anything you dislike about using phones?',
      'Could you manage for a week without one?',
    ],
    model:
      'Far more than I’d like to admit — probably a few hours a day. Most of that is messaging and maps, but I do catch myself scrolling for no reason, which is a habit I’m trying to break.',
  },
  {
    id: 'weekends',
    topic: 'weekends',
    questions: [
      'What do you usually do at weekends?',
      'Do you prefer to spend weekends with other people or alone?',
      'How was your last weekend?',
      'Are weekends important to you?',
    ],
    model:
      'It depends on the week I’ve had. If work has been intense I tend to keep Saturday completely free, but otherwise I’ll meet friends for a late breakfast and then go for a long walk by the river.',
  },
  {
    id: 'weather',
    topic: 'the weather',
    questions: [
      'What is the weather like where you live?',
      'Which season do you like best?',
      'Does the weather affect your mood?',
      'Has the weather in your country changed in recent years?',
    ],
    model:
      'It’s quite extreme, actually. The summers are dry and very hot, and then in winter the temperature can drop well below freezing, so you end up owning two entirely separate wardrobes.',
  },
];

export const CUE_CARDS: CueCard[] = [
  {
    id: 'teacher',
    topic: 'People',
    prompt: 'Describe a person who taught you something important.',
    points: ['who this person is', 'what they taught you', 'how they taught it'],
    closing: 'and explain why it has been important to you.',
    roundOff: 'Do you still keep in touch with this person?',
    part3Theme: 'teaching and learning',
    part3: [
      'What qualities make someone a good teacher?',
      'Do you think people learn better from experience or from instruction?',
      'How has the way people learn changed in the last few decades?',
      'Should schools spend more time on practical skills than on academic subjects?',
      'Some people say that technology will eventually replace teachers. To what extent do you agree?',
    ],
    model:
      'I’d like to talk about my grandfather, who taught me how to repair things rather than replace them. He was a retired electrician, and when I was about ten he started letting me sit with him in his workshop on Saturday mornings. He never really explained anything in the abstract. Instead, he’d hand me a broken radio and a screwdriver and ask what I thought was wrong with it, and then he’d wait — sometimes for an uncomfortably long time — while I worked it out. Looking back, what he was actually teaching me was patience, and the idea that most problems can be understood if you’re willing to take them apart slowly. That has stayed with me far longer than the technical skills. Whenever I’m faced with something that seems overwhelming at work, I still hear him asking what the first small piece is. Had he simply fixed those radios himself, I doubt I’d approach difficulties the way I do now.',
  },
  {
    id: 'place',
    topic: 'Travel',
    prompt: 'Describe a place you visited that left a strong impression on you.',
    points: ['where the place is', 'when you went there', 'what you did there'],
    closing: 'and explain why it left such a strong impression.',
    roundOff: 'Would you like to go back there?',
    part3Theme: 'travel and tourism',
    part3: [
      'Why do you think people enjoy visiting new places?',
      'What effects can large numbers of tourists have on a place?',
      'Do you think it is better to travel alone or in a group?',
      'How might international travel change in the future?',
      'Is it possible to really understand a culture from a short visit?',
    ],
    model:
      'The place that comes to mind is a small fishing village on the northern coast that I visited two summers ago. I’d gone there more or less by accident, because the ferry I’d planned to take had been cancelled, so I ended up staying three nights instead of passing through. There wasn’t much to do in the conventional sense. I walked along the cliffs in the mornings, and in the evenings I’d sit by the harbour watching the boats come in. What struck me, though, was the pace. Nobody seemed to be in a hurry, and people would stop mid-errand to have a proper conversation. Coming from a city where everything is scheduled, I found that almost disorientating at first, and then deeply restful. I think it left such a mark because it made me question how much of my own busyness is actually necessary. I haven’t managed to slow down as much as I’d hoped, but I do think about that harbour surprisingly often.',
  },
  {
    id: 'decision',
    topic: 'Experiences',
    prompt: 'Describe a time when you had to make a difficult decision.',
    points: ['what the decision was', 'when you had to make it', 'who you talked to about it'],
    closing: 'and explain how you feel about the decision now.',
    roundOff: 'Do you usually find it easy to make decisions?',
    part3Theme: 'making decisions',
    part3: [
      'What kinds of decisions do young people find hardest to make?',
      'Is it better to decide quickly or to take a long time over important choices?',
      'How much should parents be involved in their children’s major decisions?',
      'Why do some people find it harder than others to make up their minds?',
      'Do you think having more choices makes people happier?',
    ],
    model:
      'A decision I really struggled with was whether to turn down a job offer in another city about three years ago. On paper it was the better position — more responsibility and a noticeably higher salary — but accepting it would have meant leaving just as my mother was recovering from an operation. I went back and forth for nearly two weeks. I talked it through with my older sister, who was refreshingly blunt and told me that I’d already decided and was just looking for permission. She was right. In the end I declined, and although I did wonder for a while what I’d given up, I don’t regret it. If anything, it clarified what I actually value, which is being present for the people close to me. Another offer came along about a year later, as it happens, and by then the timing was right. So I’d say I feel settled about it, which isn’t something I expected at the time.',
  },
  {
    id: 'tech',
    topic: 'Technology',
    prompt: 'Describe a piece of technology that you find especially useful.',
    points: ['what it is', 'how you came to have it', 'how often you use it'],
    closing: 'and explain why it is so useful to you.',
    roundOff: 'Do your friends use the same thing?',
    part3Theme: 'technology in everyday life',
    part3: [
      'How has technology changed the way people communicate?',
      'Do you think people rely too heavily on technology?',
      'What are the risks of children using technology from a very young age?',
      'How might artificial intelligence change the jobs people do?',
      'Should governments regulate new technologies more strictly?',
    ],
    model:
      'The piece of technology I’d choose is a pair of noise-cancelling headphones I was given as a graduation present. I’d never have bought them for myself, since they seemed like a luxury, but I now use them practically every day. I work in an open-plan office, and before I had them I used to lose my train of thought every time someone took a phone call nearby. Now I can put them on, play something without lyrics, and stay focused for an hour or two at a stretch. They’ve also transformed long journeys, which I used to find exhausting purely because of the background noise. What makes them so valuable to me isn’t really the sound quality. It’s that they give me some control over my environment, which is something I hadn’t realised I was missing. I suppose the downside is that I’ve become a little dependent on them, and I feel oddly exposed when I’ve left them at home.',
  },
  {
    id: 'book',
    topic: 'Media',
    prompt: 'Describe a book or film that changed the way you think about something.',
    points: ['what it was', 'when you read or watched it', 'what it was about'],
    closing: 'and explain how it changed your thinking.',
    roundOff: 'Have you recommended it to anyone else?',
    part3Theme: 'stories, books and films',
    part3: [
      'Why do you think stories are important to people?',
      'Are films a better way of telling stories than books?',
      'How have people’s reading habits changed in your country?',
      'Should children be encouraged to read books that are difficult for them?',
      'To what extent can fiction teach us about real life?',
    ],
    model:
      'I’m going to describe a documentary I watched a couple of years ago about deep-sea exploration. I put it on one evening without expecting much, mainly because a colleague kept mentioning it. It follows a small research team mapping part of the ocean floor, and what surprised me was how little of it had ever been seen before. Until then I’d assumed, rather lazily, that the planet had basically been fully explored and that the remaining frontiers were all in space. The film overturned that completely. There’s a sequence where they discover an entire ecosystem around a volcanic vent, and one of the scientists is visibly lost for words. It made me realise how much confidence I’d placed in a picture of the world that was actually full of gaps. Since then I’ve been noticeably more sceptical of my own assumptions, and a good deal more curious. I’ve even started reading popular science, which I’d always dismissed as not for me.',
  },
  {
    id: 'skill',
    topic: 'Learning',
    prompt: 'Describe a skill you would like to learn.',
    points: ['what the skill is', 'why you want to learn it', 'how you would learn it'],
    closing: 'and explain how it would be useful to you.',
    roundOff: 'Do you think it would be difficult to learn?',
    part3Theme: 'skills and work',
    part3: [
      'Which skills do you think will be most valuable in the future?',
      'Is it easier to learn new skills as a child or as an adult?',
      'Should employers be responsible for training their staff?',
      'Why do some people give up when they try to learn something new?',
      'Do you think practical skills are valued enough in society?',
    ],
    model:
      'A skill I’d love to acquire is sign language. The idea first occurred to me last year, when a new neighbour who is deaf moved in across the hall, and I found myself limited to smiling and waving, which felt rather inadequate. I’d want to learn it properly, so I’d probably sign up for an evening course rather than relying on videos, because from what I understand facial expression and timing matter enormously and you need someone to correct you. I imagine it would take a year or two before I could hold a real conversation. Beyond being able to talk to my neighbour, I think it would be useful in a broader sense. I work in a public library, and we occasionally have visitors we can’t communicate with very well. More than that, though, I suspect that learning a language with a completely different structure would change the way I think about communication itself.',
  },
  {
    id: 'tradition',
    topic: 'Culture',
    prompt: 'Describe a tradition in your country that you enjoy.',
    points: ['what the tradition is', 'when it takes place', 'what people do'],
    closing: 'and explain why you enjoy it.',
    roundOff: 'Is this tradition popular with young people?',
    part3Theme: 'traditions and change',
    part3: [
      'Why do societies keep traditions alive?',
      'Are traditional celebrations becoming too commercial?',
      'How do traditions differ between older and younger generations?',
      'Can a country modernise without losing its traditions?',
      'What role should schools play in passing on culture?',
    ],
  },
  {
    id: 'help',
    topic: 'Community',
    prompt: 'Describe a time when you helped someone.',
    points: ['who you helped', 'what the situation was', 'what you did'],
    closing: 'and explain how you felt afterwards.',
    roundOff: 'Has anyone helped you in a similar way?',
    part3Theme: 'helping others',
    part3: [
      'Why are some people more willing to help strangers than others?',
      'Do people help each other less in big cities than in small towns?',
      'Should volunteering be a compulsory part of education?',
      'How can governments encourage people to support their communities?',
      'Is it the responsibility of individuals or the state to look after vulnerable people?',
    ],
  },
];

export const PART3_MODELS: Record<string, string> = {
  teacher:
    'I’d say patience matters more than expertise. Plenty of people know their subject thoroughly but can’t remember what it was like not to understand it, and that makes them poor at explaining. A good teacher, by contrast, can work out where a learner has gone wrong and approach the idea from a different angle. Beyond that, I think a certain amount of enthusiasm is essential, because students pick up very quickly on whether the person in front of them actually cares.',
  place:
    'I think a large part of it is novelty. In our everyday surroundings we stop noticing things, whereas somewhere unfamiliar forces us to pay attention again — to the food, the architecture, even the way people queue. There’s also an element of escape, of course. Having said that, I suspect some people travel mainly to be able to say they’ve been somewhere, which is a rather different motivation.',
  decision:
    'Career choices, without a doubt. At eighteen or so, people are expected to commit to a path when they’ve had very little exposure to what the work actually involves. On top of that, there’s often pressure from family, so it isn’t purely their own decision. I’d add that the sheer number of options nowadays makes it harder rather than easier, since choosing one thing means consciously giving up many others.',
  tech:
    'It’s made communication constant but, arguably, shallower. We’re in touch with far more people than previous generations ever were, yet a lot of that contact is a quick reaction to a photo rather than an actual exchange. On the other hand, for families separated by distance, video calls have been genuinely transformative. So I wouldn’t say it’s better or worse overall — it has simply changed what we mean by staying in touch.',
  book:
    'Mainly because they let us rehearse experiences we haven’t had. Through a story you can find out, in a safe way, what it might feel like to lose everything or to make a terrible mistake. They also bind communities together: a shared set of stories gives people common reference points. That’s probably why every culture we know of has told them, long before anyone could write them down.',
  skill:
    'I’d put adaptability at the top, if that counts as a skill. Specific technical knowledge goes out of date remarkably fast, so the ability to pick up something unfamiliar is worth more than any single qualification. Alongside that, I think communication will remain valuable precisely because it’s hard to automate. Whatever machines end up doing, somebody still has to explain the results to other human beings and persuade them to act.',
};

export interface VocabEntry {
  term: string;
  meaning: string;
  example: string; // must contain the term exactly once
}
export const VOCAB_SETS: { topic: string; items: VocabEntry[] }[] = [
  {
    topic: 'Education',
    items: [
      { term: 'rote learning', meaning: 'memorising by repetition without understanding', example: 'Many schools still depend on rote learning instead of discussion.' },
      { term: 'a steep learning curve', meaning: 'a lot to learn in a short time', example: 'My first month in the job involved a steep learning curve.' },
      { term: 'hands-on experience', meaning: 'knowledge gained by doing something yourself', example: 'An internship gives students hands-on experience of the industry.' },
      { term: 'to fall behind', meaning: 'to fail to keep up with others', example: 'Children who miss lessons can quickly begin to fall behind in maths.' },
      { term: 'well-rounded', meaning: 'having a balanced range of abilities', example: 'Sport and music help to produce well-rounded young adults.' },
      { term: 'to broaden your horizons', meaning: 'to widen your knowledge and experience', example: 'Studying abroad is a chance to broaden your horizons.' },
    ],
  },
  {
    topic: 'Technology',
    items: [
      { term: 'cutting-edge', meaning: 'the most advanced of its kind', example: 'The hospital has invested in cutting-edge scanning equipment.' },
      { term: 'to become obsolete', meaning: 'to go out of use because something newer exists', example: 'Phones tend to become obsolete within a few years.' },
      { term: 'a double-edged sword', meaning: 'something with both benefits and drawbacks', example: 'Social media is a double-edged sword for teenagers.' },
      { term: 'user-friendly', meaning: 'easy to use', example: 'Older people often want a more user-friendly interface.' },
      { term: 'to be glued to', meaning: 'to give all your attention to something', example: 'Commuters seem to be glued to their screens.' },
      { term: 'a breakthrough', meaning: 'an important discovery or development', example: 'The vaccine was a breakthrough in public health.' },
    ],
  },
  {
    topic: 'Environment',
    items: [
      { term: 'carbon footprint', meaning: 'the amount of carbon dioxide a person or activity produces', example: 'Flying less is one way to reduce your carbon footprint.' },
      { term: 'to take a toll on', meaning: 'to cause gradual damage to', example: 'Heavy traffic has begun to take a toll on air quality.' },
      { term: 'sustainable', meaning: 'able to continue without harming the environment', example: 'The city wants a more sustainable transport system.' },
      { term: 'to phase out', meaning: 'to stop using something gradually', example: 'Several countries plan to phase out petrol cars.' },
      { term: 'a throwaway culture', meaning: 'a society that discards things rather than repairing them', example: 'Cheap clothing encourages a throwaway culture.' },
      { term: 'renewable energy', meaning: 'power from sources that do not run out', example: 'Wind farms now supply much of the region’s renewable energy.' },
    ],
  },
  {
    topic: 'Work',
    items: [
      { term: 'job satisfaction', meaning: 'the pleasure you get from your work', example: 'For many people, job satisfaction matters more than salary.' },
      { term: 'a heavy workload', meaning: 'a large amount of work to do', example: 'Junior doctors often cope with a heavy workload.' },
      { term: 'to climb the career ladder', meaning: 'to progress to more senior positions', example: 'She moved abroad to climb the career ladder more quickly.' },
      { term: 'work-life balance', meaning: 'a healthy division of time between job and private life', example: 'Remote working has improved my work-life balance.' },
      { term: 'to be made redundant', meaning: 'to lose your job because it is no longer needed', example: 'Hundreds of staff expect to be made redundant this year.' },
      { term: 'a dead-end job', meaning: 'a job with no prospect of progress', example: 'He left what he saw as a dead-end job to retrain.' },
    ],
  },
  {
    topic: 'City life',
    items: [
      { term: 'the hustle and bustle', meaning: 'busy, noisy activity', example: 'I miss the hustle and bustle of the market.' },
      { term: 'urban sprawl', meaning: 'the uncontrolled spread of a city into the countryside', example: 'Farmland is disappearing because of urban sprawl.' },
      { term: 'a close-knit community', meaning: 'a group of people who know and support each other', example: 'The village is a close-knit community.' },
      { term: 'the cost of living', meaning: 'the money needed for basic expenses', example: 'In the capital, the cost of living keeps rising.' },
      { term: 'run-down', meaning: 'in poor condition', example: 'The council is renovating several run-down estates.' },
      { term: 'within walking distance', meaning: 'near enough to reach on foot', example: 'Everything I need is within walking distance.' },
    ],
  },
];

export const FLUENCY_PROMPTS = [
  'Talk about how you usually spend your mornings.',
  'Describe the street you live on.',
  'Explain how to prepare a meal you know well.',
  'Talk about a journey you make regularly.',
  'Describe a friend and how you met.',
  'Explain what you would do with a free day and no phone.',
  'Talk about a change you have noticed in your city.',
  'Describe something you bought recently and why.',
];

export const TOPICS = Array.from(new Set(CUE_CARDS.map((c) => c.topic)));

export const cardText = (c: CueCard) =>
  `${c.prompt} You should say: ${c.points.join(', ')}, ${c.closing}`;

export function pick<T>(arr: T[], n: number, exclude: (t: T) => boolean = () => false): T[] {
  const pool = arr.filter((t) => !exclude(t));
  const src = pool.length >= n ? pool : arr.slice();
  const out: T[] = [];
  const copy = src.slice();
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

/** The same challenge for everyone on a given day, rotating through the three parts. */
export function dailyChallenge(key: string): { part: 1 | 2 | 3; text: string; card?: CueCard; seconds: number } {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const kind = h % 3;
  if (kind === 0) {
    const t = PART1[h % PART1.length];
    return { part: 1, text: t.questions[(h >> 3) % t.questions.length], seconds: 30 };
  }
  const card = CUE_CARDS[h % CUE_CARDS.length];
  if (kind === 1) return { part: 2, text: card.prompt, card, seconds: 120 };
  return { part: 3, text: card.part3[(h >> 3) % card.part3.length], seconds: 60 };
}
