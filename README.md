# Viva: IELTS Speaking Examiner

Viva is a web app that runs a full IELTS Speaking mock test by voice and then gives an evidence-based band estimate for each of the four criteria.

- **Mock test.** Part 1 interview, Part 2 long turn (cue card, one minute of preparation, notes), Part 3 discussion. The examiner speaks, listens, and asks one question at a time with no feedback until the end.
- **Report.** Overall band, four criterion bands with quoted evidence, grammar corrections, vocabulary analysis, fluency and pronunciation measurements, three improved answers, an improvement plan, the transcript and your recordings. Export as PDF (print), Markdown or JSON.
- **Practice centre.** Part 1, Part 2 and Part 3 practice, practice by topic, vocabulary exercises, fluency drills, a random question generator and a daily challenge.
- **Dashboard and notebook.** Test history, progress against a target band (7 to 9), weekly speaking minutes, weakness tracker, vocabulary notebook, saved questions, bookmarked cue cards, Band 8+ model answers.

Viva is an independent practice tool. It is not affiliated with or endorsed by IELTS, the British Council, IDP or Cambridge, and its band estimates are not official results.

## How it is built

| Part | What it is |
| --- | --- |
| `src/` | React 19 + TypeScript single-page app. Hash routing, so it works on GitHub Pages at any path. Hand-written CSS with design tokens (light and dark), SVG charts, no UI framework. |
| `build.mjs` | Build script using esbuild. Outputs a static site to `dist/`. |
| `backend/` | A small API that holds the LLM key. One handler (`worker.js`) runs on Cloudflare Workers or on Node 20+ (`node-server.js`). No dependencies. |
| `.github/workflows/deploy.yml` | Builds the frontend and publishes it to GitHub Pages on every push to `main`. |

All user data (tests, reports, notebook, recordings) is stored in the browser: `localStorage` for data, IndexedDB for audio. There are no accounts and no database.

### Two modes

| | Demo mode (no backend) | AI mode (backend connected) |
| --- | --- | --- |
| Questions | Built-in bank | New AI-written sets, with AI follow-up questions in Part 3 |
| Assessment | Rule-based estimate from measurable features, clearly labelled, capped between bands 4 and 8 | LLM assessment against the band descriptors, with quoted evidence |
| Improved answers | Stored Band 8+ model answers | Your own answers rewritten at your target band |
| Voice, recording, transcript, practice, history | Yes | Yes |

The app shows which mode it is in at all times. A GitHub Pages site is static and cannot keep a secret, so **the frontend alone always runs in demo mode**. AI mode needs the backend, deployed separately (below).

### What is and is not measured

- **Speech recognition** uses the browser's Web Speech API (Chrome, Edge, Safari). In Chrome, audio is sent to Google's speech service by the browser. In browsers without it (Firefox), answers are typed and fluency is not measured.
- **Audio analysis** runs locally with the Web Audio API: speech rate, pauses of 1 s and 2.5 s or more, and pitch movement in semitones.
- **Pronunciation is always marked provisional.** The app measures pitch variation, pausing and recognition confidence. It cannot judge individual sounds or word stress. Neither the rule-based estimate nor the LLM hears the audio.

## Run it locally

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173, rebuilds on change
npm run build      # production build in ./dist
npm run typecheck  # TypeScript check
```

Microphone access needs `https://` or `http://localhost`.

## Deploy the frontend to GitHub Pages

1. Create a GitHub repository and push this project to the `main` branch.
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). The site is published at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

No base-path configuration is needed: asset paths are relative and routing uses the URL hash.

At this point the site works in demo mode.

## Deploy the backend (for AI mode)

The backend is the only place the LLM API key lives. It is not a general proxy: prompts are fixed on the server, inputs are length-limited, origins are allow-listed and requests are rate-limited per IP.

### Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `LLM_API_KEY` | yes | Secret key for the LLM provider. Set it as a secret, never in a file that is committed. |
| `ALLOWED_ORIGINS` | yes in production | Comma-separated origins allowed to call the backend, for example `https://your-username.github.io`. Origin only: no path, no trailing slash. With none set, only `localhost` origins are accepted. |
| `LLM_PROVIDER` | no | `anthropic` (default) or `openai` (any OpenAI-compatible API). |
| `LLM_MODEL` | no for Anthropic | Model id. Defaults to `claude-sonnet-5-5` for Anthropic; required for `openai`. Check your provider's current model list. |
| `LLM_BASE_URL` | no | Override the provider base URL (for a gateway or compatible API). |
| `PORT` | no | Node server only. Defaults to `8787`. |

### Option A: Cloudflare Workers

```bash
cd backend
# edit wrangler.toml: set ALLOWED_ORIGINS to your GitHub Pages origin
npx wrangler login
npx wrangler secret put LLM_API_KEY
npx wrangler deploy
```

Wrangler prints the Worker URL, for example `https://viva-backend.your-name.workers.dev`. For local Worker development, copy `.dev.vars.example` to `.dev.vars` (git-ignored).

### Option B: any Node host (Render, Railway, Fly.io, a VPS)

Start command: `node backend/node-server.js`. Set the environment variables above in the host's dashboard. Locally:

```bash
LLM_API_KEY=your-key ALLOWED_ORIGINS=http://localhost:5173 npm run backend
```

### Connect the frontend to the backend

Either:

- open the deployed site, go to **Settings > AI examiner**, paste the backend URL and choose **Save and test**; or
- bake a default in at build time: in the GitHub repository, add a repository **variable** (not a secret) named `VIVA_API_URL` under **Settings > Secrets and variables > Actions > Variables**, then re-run the workflow. For local builds, copy `.env.example` to `.env`.

The backend URL is public information. The API key is not, and it never appears in the frontend, the repository or the build.

### Backend API

| Route | Purpose |
| --- | --- |
| `GET /health` | Reports whether a key and model are configured. |
| `POST /api/plan` | Writes a new question set: Part 1 frames, a cue card and Part 3 questions. |
| `POST /api/examiner` | Returns the examiner's next Part 3 question from the conversation so far. |
| `POST /api/assess` | Assesses a transcript with measurements. Returns criterion bands with evidence, corrections, vocabulary notes, improved answers and a plan. |
| `POST /api/generate` | Practice content: questions, a cue card, or a Band 8+ sample answer. |

The overall band is always computed in the frontend from the four criterion bands (mean, rounded down to the nearest half band), never taken from the model.

## Costs and limits

- Each AI-assessed mock test makes roughly 5 to 10 LLM calls; you pay your provider for these.
- The rate limiter is in-memory (60 requests per 5 minutes per IP). On Workers it applies per isolate. For a public deployment, add your platform's own rate limiting or an access check in front of the backend.
- Browser storage is per device and can be cleared by the browser. Use **Settings > Export everything** to keep a copy.

## Licence

MIT. See `LICENSE`.
