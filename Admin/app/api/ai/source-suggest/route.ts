import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ai/source-suggest
 * Suggests public data-source URLs (GitHub repos, raw JSON/CSV question banks,
 * open APIs) for a given EAMCET subject/chapter, using Gemini with Google
 * Search grounding. Falls back to a curated catalog when no key or no quota.
 *
 * Safety: every suggested URL is filtered against an SSRF allow-list
 * (github.com / raw.githubusercontent.com) before reaching the client.
 */

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash'
];

const ALLOWED_HOSTS = new Set(['github.com', 'www.github.com', 'raw.githubusercontent.com']);

function extractApiKey(raw: string): string {
  let key = (raw || '').trim();
  if (!key) return '';
  if (key.includes('curl ') || key.includes('key=') || key.includes('Bearer ') || key.includes('x-goog-api-key')) {
    const matchKey = key.match(/[?&]key=([a-zA-Z0-9_.-]+)/);
    const matchHeader = key.match(/x-goog-api-key:\s*['"]?([a-zA-Z0-9_.-]+)['"]?/i);
    const matchBearer = key.match(/Bearer\s+['"]?([a-zA-Z0-9_.-]+)['"]?/i);
    if (matchKey?.[1]) key = matchKey[1];
    else if (matchHeader?.[1]) key = matchHeader[1];
    else if (matchBearer?.[1]) key = matchBearer[1];
  }
  return key;
}

function filterSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

interface SourceSuggestion {
  url: string;
  title: string;
  type: 'github_repo' | 'raw_json' | 'raw_csv';
  description: string;
  source: 'ai' | 'catalog';
}

/**
 * Curated public sources (AI fallback + seed examples).
 * IMPORTANT: every URL here is verified live (HTTP 200) — never add a URL
 * that has not been curl-checked; dead suggestions cause pipeline 404s.
 */
const CATALOG: Record<string, SourceSuggestion[]> = {
  default: [
    {
      url: 'https://raw.githubusercontent.com/arxenix/Scibowl_Questions/master/questions.json',
      title: 'Science Bowl question dump (JSON, ~4MB)',
      type: 'raw_json',
      description: 'Thousands of HS-level physics/chem/bio MCQ+short-answer questions in one JSON file.',
      source: 'catalog',
    },
    {
      url: 'https://github.com/Samkarya/online-exam-questions',
      title: 'online-exam-questions (multi-country bank)',
      type: 'github_repo',
      description: 'Structured JSON question banks incl. India/government exams; browse for EAMCET-adjacent sets.',
      source: 'catalog',
    },
  ],
  physics: [
    {
      url: 'https://github.com/topics/physics-mcq',
      title: 'GitHub topic: physics-mcq',
      type: 'github_repo',
      description: 'Index of public repos tagged physics MCQ; check for EAMCET/JEE-aligned banks.',
      source: 'catalog',
    },
  ],
  chemistry: [
    {
      url: 'https://github.com/topics/chemistry-questions',
      title: 'GitHub topic: chemistry-questions',
      type: 'github_repo',
      description: 'Public chemistry question repositories; often include NEET/EAMCET chapter-wise dumps.',
      source: 'catalog',
    },
  ],
  mathematics: [
    {
      url: 'https://github.com/topics/mathematics-mcq',
      title: 'GitHub topic: mathematics-mcq',
      type: 'github_repo',
      description: 'Math MCQ collections with worked solutions; verify license before import.',
      source: 'catalog',
    },
  ],
  biology: [
    {
      url: 'https://github.com/topics/biology-mcq',
      title: 'GitHub topic: biology-mcq',
      type: 'github_repo',
      description: 'Biology MCQ banks (botany-heavy); matches the Agriculture stream chapters.',
      source: 'catalog',
    },
  ],
  zoology: [
    {
      url: 'https://github.com/topics/zoology-mcq',
      title: 'GitHub topic: zoology-mcq',
      type: 'github_repo',
      description: 'Zoology MCQ repositories for the Agriculture stream.',
      source: 'catalog',
    },
  ],
  _all_subjects: [
    {
      url: 'https://raw.githubusercontent.com/lupantech/ScienceQA/main/data/scienceqa/problems.json',
      title: 'ScienceQA problems.json (21k MCQs, ~30MB)',
      type: 'raw_json',
      description: 'K-12+ science MCQs with choices/answer/lecture fields across natural & social science.',
      source: 'catalog',
    },
  ],
};

function catalogFor(subject: string): SourceSuggestion[] {
  const key = (subject || '').toLowerCase();
  const specific = CATALOG[key] || [];
  return [...specific, ...CATALOG.default, ...CATALOG._all_subjects];
}

/** HEAD-check a suggested URL; drop dead links (404 etc.) before they reach the UI. */
async function isLive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (res.ok) return true;
    // Some hosts reject HEAD; retry with GET (range request to stay cheap)
    const res2 = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-255' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    return res2.status < 400;
  } catch {
    return false;
  }
}

function buildPrompt(subject: string, chapter: string): string {
  return `You are a research assistant for an EAMCET (Engineering/Agriculture Medical entrance) exam-prep platform.
Find PUBLIC, LEGALLY-SHARABLE data sources containing multiple-choice questions for:
Subject: ${subject}
Chapter: ${chapter}

Good sources are: GitHub repositories with question JSON/CSV dumps, raw.githubusercontent.com files,
or open REST APIs serving MCQs. Prefer sources with bilingual (English/Telugu) or English content,
structured fields, and permissive licenses. Government/NCERT/SCERT open-data is also acceptable.

Rules:
1. Only suggest URLs on github.com or raw.githubusercontent.com (these are safe to fetch server-side).
2. Return 3 to 5 suggestions.
3. For each, give a short title, the type, and a one-line description of what the source contains.
4. Return JSON only, no commentary.

Output JSON format:
{"suggestions":[{"url":"https://...","title":"...","type":"github_repo|raw_json|raw_csv","description":"..."}]}`;
}

async function askGemini(subject: string, chapter: string, apiKey: string): Promise<SourceSuggestion[]> {
  const prompt = buildPrompt(subject, chapter);
  const tools = [{ google_search: {} }];

  for (const model of CANDIDATE_MODELS) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      if (apiKey.startsWith('ya29.')) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers['x-goog-api-key'] = apiKey;
        url += `?key=${encodeURIComponent(apiKey)}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const rawText = (data.candidates || [])
        .flatMap((c: any) => c.content?.parts || [])
        .map((p: any) => p.text || '')
        .join('');
      if (!rawText.trim()) continue;

      const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const match = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]);
      const list = Array.isArray(parsed) ? parsed : (parsed.suggestions || []);
      if (!Array.isArray(list) || list.length === 0) continue;

      return list
        .map((s: any) => ({
          url: String(s.url || ''),
          title: String(s.title || 'Untitled source'),
          type: (['github_repo', 'raw_json', 'raw_csv'].includes(s.type) ? s.type : 'github_repo') as SourceSuggestion['type'],
          description: String(s.description || ''),
          source: 'ai' as const,
        }))
        .filter((s: SourceSuggestion) => filterSafeUrl(s.url))
        .slice(0, 5);
    } catch {
      continue;
    }
  }
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subject = '', chapter = '', customApiKey } = body || {};

    const rawKey = customApiKey?.trim() || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    const apiKey = extractApiKey(rawKey);

    let suggestions: SourceSuggestion[] = [];
    let provider = 'catalog';

    let aiUsed = false;
    if (apiKey) {
      suggestions = await askGemini(subject, chapter, apiKey);
      if (suggestions.length > 0) {
        provider = 'gemini-google-search';
        aiUsed = true;
      }
    }

    if (suggestions.length === 0) {
      suggestions = catalogFor(subject);
    }

    // Final safety pass (catalog URLs are static but filter anyway)
    suggestions = suggestions.filter(s => filterSafeUrl(s.url));

    // Liveness check: drop dead links (bad AI suggestions, moved repos) so the
    // user never clicks into a guaranteed 404. Catalog entries are checked too —
    // cheap HEAD requests, and repos do get deleted.
    suggestions = (
      await Promise.all(
        suggestions.map(async (s) => ({ s, live: await isLive(s.url) }))
      )
    )
      .filter(x => x.live)
      .map(x => x.s);

    if (aiUsed && suggestions.length === 0) {
      // AI returned only dead links — fall back to the verified catalog
      suggestions = catalogFor(subject);
      provider = 'catalog (ai links dead)';
    }

    return NextResponse.json({
      success: true,
      provider,
      subject,
      chapter,
      suggestions,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Source suggestion failed', suggestions: [], provider: 'none' },
      { status: 500 }
    );
  }
}
