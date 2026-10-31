import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// SSRF Protection: Allow only approved domains
const ALLOWED_DOMAINS = [
  'github.com',
  'raw.githubusercontent.com',
  'api.github.com',
  'api.example.com' // Add more as needed
].map(d => new RegExp(`^https?://([\\w.-]+\\.)*${d.replace(/\./g, '\\.')}`, 'i'));

// Private IP ranges to block
const PRIVATE_IP_PATTERNS = [
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^127\./,
  /^0\./
];

// Environment configuration
const MAX_PULL_SIZE_MB = parseInt(process.env.MAX_PULL_SIZE_MB || '5', 10);
const PULL_RATE_LIMIT_PER_HOUR = parseInt(process.env.PULL_RATE_LIMIT_PER_HOUR || '10', 10);

// Simple in-memory rate limiting (for production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Previous-year paper metadata (per-file `paper` object > filename pattern > run-level values)
interface PyqMetadata {
  state?: string;
  year?: number;
  stream?: string;
  shift?: string;
}

/**
 * Minimal glob → RegExp for repo path matching:
 *  - `**` matches any number of path segments (including none)
 *  - `*`  matches within a single path segment
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withDoublestar = escaped.replace(/\/?\*\*\/?/g, (match) => {
    if (match === '**') return '.*';
    if (match === '**/') return '(.*/)?';
    if (match === '/**/') return '/(.*/)?';
    return '/(.*)?'; // trailing '/**'
  });
  const pattern = withDoublestar.replace(/\*/g, '[^/]*');
  return new RegExp(`^${pattern}$`, 'i');
}

/**
 * Derive paper metadata from the repo filename convention
 * `papers/<state>-<year>-<shift>.json` (e.g. ap-2024-shift1.json, ap-2023-agri.json).
 */
function parseFilenamePaperMeta(path: string): PyqMetadata {
  const base = path.split('/').pop() || '';
  const m = base.match(/^([a-z]{2,})-(\d{4})-(.+)\.json$/i);
  if (!m) return {};
  const meta: PyqMetadata = { state: m[1].toUpperCase(), year: parseInt(m[2], 10) };
  const suffix = m[3].toLowerCase();
  if (suffix === 'agri' || suffix === 'agriculture') {
    meta.stream = 'Agriculture';
  } else {
    const shiftMatch = suffix.match(/^shift[\s_-]*(\d+)/);
    if (shiftMatch) meta.shift = `Shift-${shiftMatch[1]}`;
  }
  return meta;
}

/**
 * Merge PYQ metadata with precedence: per-file `paper` object > filename pattern > run-level values.
 */
function mergePyqMetadata(runLevel: PyqMetadata | null | undefined, filenameMeta: PyqMetadata, paper?: Record<string, any>): PyqMetadata {
  const merged: PyqMetadata = { ...(runLevel || {}) };
  for (const [key, value] of Object.entries(filenameMeta)) {
    if (value !== undefined) (merged as any)[key] = value;
  }
  if (paper) {
    for (const key of ['state', 'year', 'stream', 'shift'] as const) {
      if (paper[key] !== undefined && paper[key] !== null && paper[key] !== '') {
        (merged as any)[key] = paper[key];
      }
    }
  }
  return merged;
}

// Fingerprint function for deduplication
function createQuestionFingerprint(question: any): string {
  const text = String(question.question_text_en || '').trim().toLowerCase();
  const topic = String(question.topic || '').trim().toLowerCase();

  const numbers = text.match(/\d+\.?\d*/g) || [];
  const numbersSignature = numbers.slice(0, 5).join(',');

  const optsStructure = Array.isArray(question.options_en)
    ? question.options_en.map((o: any) => {
        const optText = String(o).toLowerCase();
        const hasMath = /\\[a-z]+|\\frac|\\int|\\sum/.test(optText);
        const length = optText.length;
        return `${length}-${hasMath ? 'M' : 'T'}`;
      }).join(',')
    : '';

  return `${topic}|${numbersSignature}|${optsStructure}`;
}

// SSRF Protection check
function isSafeUrl(url: string): { safe: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Check against allowed domains
    const isAllowed = ALLOWED_DOMAINS.some(pattern => pattern.test(url));
    if (!isAllowed) {
      return { safe: false, error: 'Domain not in approved list' };
    }

    // Check for private IPs
    const hostname = parsed.hostname;
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { safe: false, error: 'Private IP addresses are not allowed' };
      }
    }

    return { safe: true };
  } catch (error) {
    return { safe: false, error: 'Invalid URL format' };
  }
}

// Rate limiting check
function checkRateLimit(identifier: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + hourMs });
    return { allowed: true };
  }

  if (entry.count >= PULL_RATE_LIMIT_PER_HOUR) {
    return { allowed: false, error: 'Rate limit exceeded' };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Record a pull operation in the pull_logs table (dry runs included).
 * Best-effort: logging failures never break the pull response.
 */
async function writePullLog(entry: {
  sourceUrl: string;
  sourceType: string;
  subject: string;
  chapter: string;
  questionsPulled: number;
  questionsInserted: number;
  questionsSkipped: number;
  status: 'pending' | 'success' | 'partial' | 'failed';
  errorMessage?: string;
  dryRun: boolean;
}): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseKey) return;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('pull_logs').insert({
      source_url: entry.sourceUrl,
      source_type: entry.sourceType,
      subject: entry.subject,
      chapter: entry.chapter,
      questions_pulled: entry.questionsPulled,
      questions_inserted: entry.questionsInserted,
      questions_skipped: entry.questionsSkipped,
      status: entry.status,
      error_message: entry.errorMessage || null,
      dry_run: entry.dryRun
    });
  } catch (err) {
    console.error('Failed to write pull_logs entry:', err);
  }
}

// Sanitize HTML/JS from text
function sanitizeText(text: string): string {
  // Remove HTML tags and potentially dangerous content
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

// Validate question structure
function validateQuestion(q: any): { valid: boolean; error?: string } {
  if (!q.question_text_en || typeof q.question_text_en !== 'string') {
    return { valid: false, error: 'Missing or invalid question_text_en' };
  }

  if (!Array.isArray(q.options_en) || q.options_en.length < 2) {
    return { valid: false, error: 'options_en must be an array with at least 2 options' };
  }

  if (typeof q.correct_option !== 'number' || q.correct_option < 0 || q.correct_option >= q.options_en.length) {
    return { valid: false, error: 'Invalid correct_option index' };
  }

  return { valid: true };
}

// Fetch data from source with retry logic
async function fetchFromSource(sourceUrl: string, sourceType: string, maxRetries = 3): Promise<any[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(sourceUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'EAMCET-Portal/1.0'
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_PULL_SIZE_MB * 1024 * 1024) {
        throw new Error(`File size exceeds ${MAX_PULL_SIZE_MB}MB limit`);
      }

      const text = await response.text();

      if (text.length > MAX_PULL_SIZE_MB * 1024 * 1024) {
        throw new Error(`Content size exceeds ${MAX_PULL_SIZE_MB}MB limit`);
      }

      // Parse based on source type
      if (sourceType === 'github' || sourceType === 'api') {
        const data = JSON.parse(text);
        return normalizeToArray(data);
      } else if (sourceType === 'json') {
        // Raw JSON document (repo files may carry a `paper` object
        // alongside the questions array) — returned wrapped.
        return [JSON.parse(text)];
      } else if (sourceType === 'website') {
        // For website scraping, return raw text (would need actual scraping logic)
        throw new Error('Website scraping not yet implemented');
      }

      return [];

    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }
    }
  }

  throw lastError || new Error('Failed to fetch from source');
}

/**
 * Source-level filters for large datasets (ScienceQA-style fields):
 *  - filterSubject: matches q.subject / q.category / q.category_name (case-insensitive contains)
 *  - minGrade: 'grade1'..'grade12' — keeps entries whose grade is >= minGrade;
 *    entries without any grade field pass (can't judge them).
 */
const GRADE_ORDER = [
  'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6',
  'grade7', 'grade8', 'grade9', 'grade10', 'grade11', 'grade12',
];

function gradeRank(v: any): number | null {
  const m = String(v ?? '').toLowerCase().match(/grade\s*(\d{1,2})/);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 12 ? n : null;
  }
  // High-school synonyms
  const s = String(v ?? '').toLowerCase();
  if (s.includes('high school') || s === 'hs' || s.includes('senior')) return 9;
  if (s.includes('middle') || s === 'ms') return 6;
  if (s.includes('elementary') || s === 'es' || s.includes('primary')) return 1;
  return null;
}

function passesFilters(q: any, filterSubject: string, minGrade: string): boolean {
  if (filterSubject) {
    const want = filterSubject.toLowerCase();
    const fields = [q.subject, q.category, q.category_name, q.topic, q.field]
      .map((v: any) => String(v ?? '').toLowerCase())
      .filter(f => f.length > 0); // never let empty fields match via substring
    if (!fields.some(f => f.includes(want) || want.includes(f))) return false;
  }
  if (minGrade) {
    const minRank = gradeRank(minGrade);
    if (minRank !== null) {
      const entryRank = gradeRank(q.grade ?? q.level ?? q.school_grade);
      // No grade info on the entry → keep it (can't judge); ranked → compare
      if (entryRank !== null && entryRank < minRank) return false;
    }
  }
  return true;
}

/**
 * Normalize common JSON shapes into a flat question array:
 *  - [ {...}, ... ]                      (array)
 *  - { questions: [...] } / { data: [...] } / { results: [...] }  (wrapped)
 *  - { "1": {...}, "2": {...}, ... }      (keyed map — e.g. ScienceQA problems.json)
 */
function normalizeToArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['questions', 'data', 'results', 'items']) {
      if (Array.isArray(data[key])) return data[key];
    }
    const values = Object.values(data);
    if (values.length > 0 && values.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      return values;
    }
  }
  return [];
}

interface RepoFileResult {
  path: string;
  paper?: Record<string, any>;
  pyq: PyqMetadata;
  questions: any[];
  errors: string[];
}

/**
 * Crawl a GitHub repo via the git-trees API and pull every file matching `glob`.
 * Each file's questions are tagged with effective PYQ metadata
 * (per-file `paper` object > filename pattern > run-level pyq values).
 */
async function fetchGithubRepoFiles(
  owner: string,
  repo: string,
  branch: string,
  glob: string,
  runLevelPyq?: PyqMetadata | null
): Promise<RepoFileResult[]> {
  // URL-injection guard: only safe GitHub identifiers
  const safeId = /^[A-Za-z0-9._-]+$/;
  for (const [label, value] of [['owner', owner], ['repo', repo], ['branch', branch]] as const) {
    if (!value || !safeId.test(value)) {
      throw new Error(`Invalid repo ${label} "${value}" — only letters, digits, '.', '_' and '-' are allowed`);
    }
  }

  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const response = await fetch(treeUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'EAMCET-Portal/1.0',
      'Accept': 'application/vnd.github+json'
    },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    throw new Error(`GitHub API error: HTTP ${response.status} ${response.statusText} (${treeUrl})`);
  }

  const tree = await response.json() as any;
  if (tree.truncated) {
    console.warn(`GitHub tree for ${owner}/${repo} was truncated — files may be missing on very large repos.`);
  }

  // Match blob paths against the glob; reject traversal / absolute paths
  const matcher = globToRegex(glob || '**');
  const matchedPaths: string[] = (Array.isArray(tree.tree) ? tree.tree : [])
    .filter((entry: any) => entry && entry.type === 'blob'
      && typeof entry.path === 'string'
      && !entry.path.startsWith('/')
      && !entry.path.includes('..')
      && matcher.test(entry.path))
    .map((entry: any) => entry.path as string);

  const results: RepoFileResult[] = [];
  for (const path of matchedPaths) {
    const fileErrors: string[] = [];
    let questions: any[] = [];
    let paper: Record<string, any> | undefined;

    try {
      // Encode each path segment — slashes must stay literal for raw.githubusercontent.com
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
      const [data] = await fetchFromSource(rawUrl, 'json');
      paper = data && typeof data.paper === 'object' && data.paper ? data.paper : undefined;
      questions = normalizeToArray(data);
    } catch (err: any) {
      fileErrors.push(err.message || 'Failed to fetch or parse file');
    }

    // Effective metadata: per-file paper object > filename pattern > run-level values
    const pyq = mergePyqMetadata(runLevelPyq, parseFilenamePaperMeta(path), paper);
    questions.forEach(q => {
      if (q && typeof q === 'object') (q as any).__pyq = pyq;
    });
    results.push({ path, paper, pyq, questions, errors: fileErrors });
  }

  return results;
}

// Map external data to internal format
function mapToInternalFormat(externalQuestions: any[], subject: string, chapter: string, pyq?: PyqMetadata | null): any[] {
  return externalQuestions.map((q) => {
    const options = Array.isArray(q.options_en || q.options || q.choices)
      ? (q.options_en || q.options || q.choices).map((opt: any) => sanitizeText(String(opt)))
      : [];
    // Accept 0-based numeric index (ScienceQA `answer`) or letter (A/B/C/D)
    let correct = typeof q.correct_option === 'number'
      ? q.correct_option
      : typeof q.answer === 'number'
        ? q.answer
        : (typeof q.answer === 'string' && /^[A-Da-d]$/.test(q.answer.trim())
          ? q.answer.trim().toUpperCase().charCodeAt(0) - 65
          : 0);

    // Per-file PYQ metadata (stamped by fetchGithubRepoFiles) wins over run-level values
    const meta: PyqMetadata | null = (q && typeof q === 'object' ? (q as any).__pyq : null) || pyq || null;
    const pyqActive = Boolean(meta && (meta.state || meta.year || meta.stream || meta.shift));

    // Per-question subject/topic (e.g. PYQ files) win over run-level values
    const qSubject = typeof q.subject === 'string' && q.subject.trim() ? q.subject : subject;
    const qTopic = typeof q.topic === 'string' && q.topic.trim() ? q.topic : chapter;
    // If any PYQ metadata field is present, pyqActive is already true —
    // so `meta?.field` truthiness is equivalent to `pyqActive && meta.field`.
    const pyqStream = meta?.stream || '';

    return {
      subject: qSubject,
      topic: qTopic,
      question_text_en: sanitizeText(q.question_text_en || q.question || q.text || ''),
      question_text_te: sanitizeText(q.question_text_te || q.question_te || ''),
      options_en: options,
      options_te: options,
      correct_option: correct,
      explanation_en: sanitizeText(q.explanation_en || q.explanation || q.lecture || q.solution || ''),
      explanation_te: sanitizeText(q.explanation_te || q.explanation_te || ''),
      is_previous_year: pyqActive ? true : (q.is_previous_year ?? false),
      stream: pyqStream || (qSubject === 'Biology' ? 'Agriculture' : 'Engineering'),
      difficulty: q.difficulty || 'Medium',
      source: q.source || 'external_pull',
      source_url: q.source_url || '',
      ...(meta?.state ? { state: meta.state } : {}),
      ...(meta?.year ? { year: meta.year } : {}),
      ...(meta?.shift ? { shift: meta.shift } : {})
    };
  });
}

export async function POST(request: NextRequest) {
  // Pull-log context: defaults apply when the body fails to parse;
  // overwritten once the request body is read.
  const pullContext = {
    sourceUrl: '',
    sourceType: 'github',
    subject: 'Mathematics',
    chapter: '',
    dryRun: false
  };

  const logPull = (fields: {
    questionsPulled: number;
    questionsInserted: number;
    questionsSkipped: number;
    status: 'pending' | 'success' | 'partial' | 'failed';
    errorMessage?: string;
  }) => writePullLog({ ...pullContext, ...fields });

  try {
    const body = await request.json();
    const {
      sourceUrl,
      sourceType = 'github',
      subject = 'Mathematics',
      chapter = '',
      count = 10,
      dryRun = false,
      outputFormat = 'json',
      filterSubject = '',   // e.g. 'physics' | 'chemistry' | 'biology' (ScienceQA `subject` field)
      minGrade = '',        // e.g. 'grade9' — keep entries at this grade or harder
      repoOwner = '',       // github-repo mode: repo owner (e.g. 'octocat')
      repoName = '',        // github-repo mode: repo name (e.g. 'eamcet-pyq-test-data')
      repoBranch = 'main',  // github-repo mode: branch to crawl
      pathGlob = '**',      // github-repo mode: glob over repo file paths
      pyq = null            // run-level PYQ metadata fallback { state, year, stream, shift }
    } = body;

    const isRepoMode = Boolean(repoOwner && repoName);
    // Repo mode derives its source URL from owner/repo — no sourceUrl field needed
    const effectiveSourceUrl = sourceUrl || (isRepoMode ? `https://github.com/${repoOwner}/${repoName}` : '');
    // Normalize run-level PYQ metadata (ignore unexpected shapes)
    const pyqMeta: PyqMetadata = {
      state: typeof (pyq as any)?.state === 'string' ? (pyq as any).state : undefined,
      year: typeof (pyq as any)?.year === 'number' ? (pyq as any).year : undefined,
      stream: typeof (pyq as any)?.stream === 'string' ? (pyq as any).stream : undefined,
      shift: typeof (pyq as any)?.shift === 'string' ? (pyq as any).shift : undefined
    };

    Object.assign(pullContext, {
      sourceUrl: effectiveSourceUrl,
      sourceType: isRepoMode ? 'github-repo' : sourceType,
      subject,
      chapter,
      dryRun
    });

    // Validation
    if (!effectiveSourceUrl) {
      return NextResponse.json(
        { success: false, error: 'sourceUrl is required' },
        { status: 400 }
      );
    }

    if (!chapter) {
      return NextResponse.json(
        { success: false, error: 'chapter is required' },
        { status: 400 }
      );
    }

    // SSRF Protection
    const urlCheck = isSafeUrl(effectiveSourceUrl);
    if (!urlCheck.safe) {
      await logPull({ questionsPulled: 0, questionsInserted: 0, questionsSkipped: 0, status: 'failed', errorMessage: urlCheck.error });
      return NextResponse.json(
        { success: false, error: urlCheck.error },
        { status: 403 }
      );
    }

    // Rate limiting (use IP as identifier)
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitCheck = checkRateLimit(ip);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { success: false, error: rateLimitCheck.error },
        { status: 429 }
      );
    }

    // Fetch data from source (repo crawl or direct URL)
    let externalQuestions: any[];
    let repoFileCount = 0;
    let repoFileErrors: string[] = [];

    if (isRepoMode) {
      const repoFiles = await fetchGithubRepoFiles(repoOwner, repoName, repoBranch, pathGlob, pyqMeta);
      repoFileCount = repoFiles.length;
      repoFileErrors = repoFiles.flatMap(f => f.errors.map(e => `${f.path}: ${e}`));
      externalQuestions = repoFiles.flatMap(f => f.questions);
    } else {
      externalQuestions = await fetchFromSource(effectiveSourceUrl, sourceType);
    }

    if (externalQuestions.length === 0) {
      await logPull({ questionsPulled: 0, questionsInserted: 0, questionsSkipped: 0, status: 'failed', errorMessage: 'No questions found in source' });
      return NextResponse.json(
        { success: false, error: 'No questions found in source' },
        { status: 404 }
      );
    }

    // Source-level filtering (subject / min grade) BEFORE taking `count`,
    // so a filtered slice contains only relevant entries.
    const wantsFilter = Boolean(filterSubject || minGrade);
    const filteredQuestions = wantsFilter
      ? externalQuestions.filter(q => passesFilters(q, filterSubject, minGrade))
      : externalQuestions;
    const filteredCount = wantsFilter ? filteredQuestions.length : externalQuestions.length;

    if (filteredQuestions.length === 0) {
      await logPull({ questionsPulled: 0, questionsInserted: 0, questionsSkipped: 0, status: 'failed', errorMessage: `No questions matched the filters (subject: ${filterSubject || 'any'}, min grade: ${minGrade || 'any'})` });
      return NextResponse.json(
        {
          success: false,
          error: `No questions matched the filters (subject: ${filterSubject || 'any'}, min grade: ${minGrade || 'any'})`,
          totalFetched: externalQuestions.length,
        },
        { status: 404 }
      );
    }

    // Limit to requested count (repo mode pulls everything — repos are curated)
    const limitedQuestions = isRepoMode ? filteredQuestions : filteredQuestions.slice(0, count);

    // Map to internal format
    const mappedQuestions = mapToInternalFormat(limitedQuestions, subject, chapter, pyqMeta);

    // Validate questions
    const validQuestions = [];
    const validationErrors = [];

    for (const q of mappedQuestions) {
      const validation = validateQuestion(q);
      if (validation.valid) {
        validQuestions.push(q);
      } else {
        validationErrors.push(validation.error);
      }
    }

    if (validQuestions.length === 0) {
      await logPull({ questionsPulled: 0, questionsInserted: 0, questionsSkipped: 0, status: 'failed', errorMessage: 'No valid questions found' });
      return NextResponse.json(
        { success: false, error: 'No valid questions found', validationErrors },
        { status: 400 }
      );
    }

    // Deduplication check
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    let insertedCount = 0;
    let skippedCount = 0;

    if (!dryRun && supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch existing fingerprints per (subject, topic) pair — per-file PYQ
      // metadata can spread one pull across multiple pairs.
      const pairKeys = new Set<string>();
      const pairs: { subject: string; topic: string }[] = [];
      validQuestions.forEach(q => {
        const key = `${q.subject}||${q.topic}`;
        if (!pairKeys.has(key)) {
          pairKeys.add(key);
          pairs.push({ subject: q.subject, topic: q.topic });
        }
      });

      const existingFingerprints = new Set<string>();
      for (const pair of pairs) {
        const { data: existingQuestions, error: fetchError } = await supabase
          .from('questions')
          .select('question_text_en, topic, options_en')
          .eq('subject', pair.subject)
          .eq('topic', pair.topic);

        if (!fetchError && existingQuestions) {
          existingQuestions.forEach(q => existingFingerprints.add(createQuestionFingerprint(q)));
        }
      }

      // Filter out duplicates
      const uniqueQuestions = validQuestions.filter(q => {
        const fp = createQuestionFingerprint(q);
        if (existingFingerprints.has(fp)) {
          skippedCount++;
          return false;
        }
        existingFingerprints.add(fp);
        return true;
      });

      // Insert unique questions
      if (uniqueQuestions.length > 0) {
        const { data: insertedData, error: insertError } = await supabase
          .from('questions')
          .insert(uniqueQuestions)
          .select('question_id');

        if (insertError) {
          throw new Error(`Database insert failed: ${insertError.message}`);
        }

        insertedCount = insertedData?.length || uniqueQuestions.length;
      }
    }

    // Record the pull (dry runs are logged too)
    const pullStatus: 'success' | 'partial' = (validationErrors.length > 0 || skippedCount > 0 || (!dryRun && insertedCount === 0))
      ? 'partial'
      : 'success';
    await logPull({
      questionsPulled: validQuestions.length,
      questionsInserted: dryRun ? 0 : insertedCount,
      questionsSkipped: skippedCount,
      status: pullStatus
    });

    return NextResponse.json({
      success: true,
      questions: validQuestions,
      totalFetched: externalQuestions.length,
      matchedFilters: wantsFilter ? filteredCount : undefined,
      appliedFilters: wantsFilter ? { filterSubject: filterSubject || null, minGrade: minGrade || null } : undefined,
      validCount: validQuestions.length,
      inserted: dryRun ? 0 : insertedCount,
      skipped: skippedCount,
      validationErrors: validationErrors.slice(0, 10), // Limit error reporting
      dryRun,
      ...(isRepoMode ? {
        sourceMode: 'github-repo',
        filesMatched: repoFileCount,
        fileErrors: repoFileErrors
      } : {})
    });

  } catch (err: any) {
    console.error('Pull API error:', err);
    await logPull({ questionsPulled: 0, questionsInserted: 0, questionsSkipped: 0, status: 'failed', errorMessage: err.message || 'Internal Server Error' });
    return NextResponse.json({
      success: false,
      error: err.message || 'Internal Server Error'
    }, { status: 500 });
  }
}
