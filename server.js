import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { GoogleGenAI } from '@google/genai';
import { Firecrawl } from 'firecrawl';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

if (!process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY. Add your key to .env file.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Firecrawl setup (optional — works without it, just skips research)
const firecrawl = process.env.FIRECRAWL_API_KEY
  ? new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY })
  : null;

if (firecrawl) console.log('✓ Firecrawl enabled — will research companies before generating questions.');
else console.warn('⚠ No FIRECRAWL_API_KEY — skipping company research. Questions will be generated from resume + JD only.');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

// ─── Research cache (file-based, keyed by company+role) ─────────────────────
const CACHE_DIR = path.join(__dirname, '.firecrawl-cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function cacheKey(company, role) {
  const slug = `${company}-${role}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return slug || 'unknown';
}

function loadCachedResearch(company, role) {
  const file = path.join(CACHE_DIR, `${cacheKey(company, role)}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Cache valid for 7 days
    const ageMs = Date.now() - (data.timestamp || 0);
    if (ageMs > 7 * 24 * 60 * 60 * 1000) return null;
    if (!data.sources || !data.sources.length) return null;
    console.log(`  ↳ Using cached research for "${company} / ${role}" (${Math.round(ageMs / 3600000)}h old) - ${data.sources.length} sources`);
    return data;
  } catch { return null; }
}

function saveCachedResearch(company, role, data) {
  const file = path.join(CACHE_DIR, `${cacheKey(company, role)}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...data, timestamp: Date.now() }, null, 2));
}

// ─── Firecrawl research ─────────────────────────────────────────────────────
async function researchCompanyRole(company, role, jobDescription) {
  if (!firecrawl || !company) {
    console.log('Skipping research: firecrawl initialized =', !!firecrawl, 'company =', company);
    return { insights: '', sources: [] };
  }

  console.log(`🔍 Researching "${company}" for "${role}" with Firecrawl...`);

  // Check cache first
  const cached = loadCachedResearch(company, role);
  if (cached) return { insights: cached.insights, sources: cached.sources };

  const sources = [];
  const allContent = [];
  const urlsToScrape = new Set();

  // Step 1: Search to discover relevant URLs
  const queries = [
    `${company} ${role} interview questions`,
    `${company} engineering culture technology stack`,
    `${company} careers ${role}`,
  ];

  for (const query of queries) {
    try {
      console.log(`  🔎 Searching: "${query}"`);
      const result = await firecrawl.search(query, { limit: 3 });

      if (result?.web) {
        for (const item of result.web) {
          sources.push({ title: item.title || item.url, url: item.url });
          // Collect search snippet as lightweight context
          if (item.description) {
            allContent.push(`## ${item.title || item.url}\nURL: ${item.url}\n${item.description}`);
          }
          // Queue top results for full scrape
          if (urlsToScrape.size < 4) {
            urlsToScrape.add(item.url);
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠ Search failed for "${query}": ${err.message}`);
    }
  }

  // Step 2: Scrape top URLs for full content
  const companySlug = company.toLowerCase().replace(/\s+/g, '');
  const directUrls = [
    `https://www.${companySlug}.com`,
    `https://www.${companySlug}.com/careers`,
  ];
  for (const u of directUrls) {
    if (urlsToScrape.size < 6) urlsToScrape.add(u);
  }

  // Scrape in parallel with 6s timeout per request
  const scrapePromises = [...urlsToScrape].slice(0, 5).map(async (url) => {
    try {
      console.log(`  🌐 Scraping: ${url}`);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Scrape timeout')), 6000));
      const scrapePromise = firecrawl.scrape(url, { formats: ['markdown'] });
      const result = await Promise.race([scrapePromise, timeoutPromise]);

      if (result?.markdown) {
        const title = result.metadata?.title || url;
        const trimmed = result.markdown.slice(0, 2500);
        allContent.push(`## Source: ${title}\nURL: ${url}\n\n${trimmed}`);
        sources.push({ title, url });
      }
    } catch (err) {
      console.warn(`  ⚠ Scrape failed for ${url}: ${err.message}`);
    }
  });

  await Promise.allSettled(scrapePromises);

  // Deduplicate sources by URL
  const uniqueSources = [...new Map(sources.map(s => [s.url, s])).values()];

  const insights = allContent.length > 0
    ? allContent.join('\n\n---\n\n').slice(0, 12000)
    : '';

  console.log(`  ✅ Research complete: ${uniqueSources.length} sources, ${insights.length} chars of context`);

  // Save to cache
  if (insights) {
    saveCachedResearch(company, role, { insights, sources: uniqueSources });
  }

  return { insights, sources: uniqueSources };
}

// ─── Gemini helpers ─────────────────────────────────────────────────────────
async function askGemini({ system, prompt, maxTokens = 4000 }, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          systemInstruction: system,
          maxOutputTokens: maxTokens,
        },
      });
      return { text: response.text, sources: [] };
    } catch (err) {
      console.warn(`Gemini API attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((res) => setTimeout(res, attempt * 1000));
    }
  }
}

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON');
  const jsonStr = raw.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    const cleaned = jsonStr.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleaned);
  }
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n[truncated]' : s);

// ─── POST /api/start ────────────────────────────────────────────────────────
app.post('/api/start', upload.single('resumeFile'), async (req, res) => {
  try {
    const { jobDescription = '', company = '', role = '' } = req.body;
    const count = Math.min(Math.max(parseInt(req.body.count, 10) || 8, 3), 12);

    let resume = (req.body.resumeText || '').trim();
    if (req.file) {
      const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
      resume = isPdf ? (await pdf(req.file.buffer)).text.trim() : req.file.buffer.toString('utf8').trim();
    }

    if (resume.length < 100) return res.status(400).json({ error: 'Please upload a valid resume PDF with readable text content.' });
    if (jobDescription.trim().length < 50) return res.status(400).json({ error: 'Add the job description.' });

    // ── Firecrawl research (runs in parallel-safe way) ──
    const { insights: companyResearch, sources: researchSources } = await researchCompanyRole(company, role, jobDescription);

    const system = `You are a senior interviewer and interview coach. You design realistic, personalised mock interviews.
Your response must be a single valid JSON object and nothing else. No markdown, no explanation.`;

    const researchBlock = companyResearch
      ? `\nCOMPANY RESEARCH (from web sources — use this to create company-specific questions):\n"""\n${clip(companyResearch, 6000)}\n"""\n`
      : '';

    const prompt = `Build a mock interview of exactly ${count} questions.

COMPANY: ${company || '(not given - infer from the job description)'}
ROLE: ${role || '(not given - infer from the job description)'}

JOB DESCRIPTION:
"""
${clip(jobDescription, 8000)}
"""

CANDIDATE RESUME:
"""
${clip(resume, 8000)}
"""
${researchBlock}
Mix: ~25% resume-based, ~25% job-description skills, ~20% company-specific (from research if available), ~15% behavioral, ~15% scenario-based.
Order: warm-up first, hardest in the middle, wrap-up last.
When company research is available, use real company products, technologies, and practices to make questions specific and realistic.

Return ONLY this JSON (no markdown):
{
  "candidateSummary": "2 sentences on the candidate background and fit",
  "questions": [
    {
      "id": 1,
      "question": "the question as the interviewer would say it",
      "type": "resume | jd | company | behavioral",
      "why": "one short line on why you are asking this",
      "sourceUrl": null,
      "idealPoints": ["3-5 points a strong answer should cover"]
    }
  ]
}`;

    const { text } = await askGemini({ system, prompt, maxTokens: 6000 });
    const plan = extractJSON(text);
    if (!Array.isArray(plan.questions) || !plan.questions.length) throw new Error('No questions generated');

    const id = randomUUID();
    sessions.set(id, {
      id, company, role,
      resume: clip(resume, 8000),
      jobDescription: clip(jobDescription, 8000),
      summary: plan.candidateSummary,
      questions: plan.questions,
      sources: researchSources,
      companyResearch: clip(companyResearch, 4000),
      history: [],
    });

    res.json({
      sessionId: id,
      summary: plan.candidateSummary,
      sources: researchSources,
      total: plan.questions.length,
      questions: plan.questions.map(({ id, question, type, why, sourceUrl }) => ({ id, question, type, why, sourceUrl })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not build the interview. Please try again.' });
  }
});

// ─── POST /api/answer ───────────────────────────────────────────────────────
app.post('/api/answer', async (req, res) => {
  try {
    const { sessionId, index, answer = '' } = req.body;
    const s = sessions.get(sessionId);
    if (!s) return res.status(404).json({ error: 'Session expired. Start a new interview.' });
    const q = s.questions[index];
    if (!q) return res.status(400).json({ error: 'Unknown question.' });

    const skipped = answer.trim().length === 0;

    const system = `You are a strict but encouraging interview coach. Be specific and concrete. Reply with a single JSON object only, no markdown.`;

    const companyContext = s.companyResearch
      ? `\nCOMPANY CONTEXT:\n${clip(s.companyResearch, 2000)}\n`
      : '';

    const prompt = `ROLE: ${s.role || 'see job description'} at ${s.company || 'the company'}

QUESTION: ${q.question}
IDEAL POINTS: ${JSON.stringify(q.idealPoints || [])}

CANDIDATE RESUME:
${clip(s.resume, 4000)}
${companyContext}
CANDIDATE ANSWER:
${skipped ? '(skipped - no answer given)' : clip(answer, 4000)}

Return ONLY this JSON (no markdown):
{
  "score": 0,
  "strengths": ["up to 3 short points"],
  "improvements": ["up to 3 short specific points"],
  "sampleAnswer": "a strong 3-5 sentence answer using the candidate real experience",
  "followUp": "one follow-up question an interviewer would likely ask"
}`;

    const { text } = await askGemini({ system, prompt, maxTokens: 1500 });
    const feedback = extractJSON(text);
    s.history[index] = { question: q.question, type: q.type, answer: skipped ? '(skipped)' : answer, feedback };
    res.json(feedback);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not score that answer. Please try again.' });
  }
});

// ─── POST /api/finish ───────────────────────────────────────────────────────
app.post('/api/finish', async (req, res) => {
  try {
    const s = sessions.get(req.body.sessionId);
    if (!s) return res.status(404).json({ error: 'Session expired. Start a new interview.' });

    const answered = s.history.filter(Boolean);
    if (!answered.length) return res.status(400).json({ error: 'Answer at least one question first.' });

    const system = 'You are an interview coach writing a debrief. Reply with a single JSON object only, no markdown.';
    const prompt = `Role: ${s.role || 'see job description'} at ${s.company || 'the company'}
Candidate summary: ${s.summary}

Transcript:
${JSON.stringify(answered.map((h) => ({ q: h.question, type: h.type, a: clip(h.answer, 1200), score: h.feedback.score })), null, 1)}

Return ONLY this JSON (no markdown):
{
  "overallScore": 0,
  "verdict": "one sentence",
  "strengths": ["3 short points"],
  "weakAreas": ["3 short points"],
  "nextSteps": ["3 concrete things to practice"]
}`;

    const { text } = await askGemini({ system, prompt, maxTokens: 1500 });
    res.json({ ...extractJSON(text), sources: s.sources || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not build the report. Please try again.' });
  }
});

app.listen(PORT, () => console.log(`Interview MVP running at http://localhost:${PORT}`));
