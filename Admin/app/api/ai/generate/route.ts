import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash'
];

import { normalizeQuestionStem, isPlaceholderQuestion, checkTopicMismatch } from '@/lib/deduplication';

function createQuestionFingerprint(question: any): string {
  return normalizeQuestionStem(question.question_text_en || '');
}

// Server-side validation to check for duplicates before insertion
async function checkForDuplicatesInDatabase(questions: any[], supabaseUrl: string, supabaseKey: string): Promise<{ duplicates: any[], unique: any[] }> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const duplicates: any[] = [];
  const unique: any[] = [];
  
  try {
    const subjects = Array.from(new Set(questions.map(q => q.subject)));
    
    // Fetch all existing questions in the subject(s) across ALL chapters to catch cross-chapter duplicates
    const { data: existingQuestions, error } = await supabase
      .from('questions')
      .select('question_id, question_text_en, topic, subject')
      .in('subject', subjects);
    
    if (error) {
      console.error('Error fetching existing questions for validation:', error);
      return { duplicates: [], unique: questions };
    }
    
    const existingStems = new Set<string>();
    (existingQuestions || []).forEach(q => {
      const stem = normalizeQuestionStem(q.question_text_en);
      if (stem.length > 10) existingStems.add(stem);
    });

    const inBatchStems = new Set<string>();
    
    questions.forEach(q => {
      const stem = normalizeQuestionStem(q.question_text_en);
      const placeholderCheck = isPlaceholderQuestion(q);
      const mismatchCheck = checkTopicMismatch(q.subject, q.topic, q.question_text_en);

      // Filter out if duplicate in DB, duplicate in this batch, placeholder, or subject mismatch
      if (
        (stem.length > 10 && existingStems.has(stem)) ||
        inBatchStems.has(stem) ||
        placeholderCheck.isPlaceholder ||
        mismatchCheck.isMismatch
      ) {
        duplicates.push({
          ...q,
          _rejectionReason: placeholderCheck.reason || mismatchCheck.reason || 'Duplicate question stem'
        });
      } else {
        if (stem.length > 10) inBatchStems.add(stem);
        unique.push(q);
      }
    });
    
  } catch (error) {
    console.error('Server-side validation error:', error);
    return { duplicates: [], unique: questions };
  }
  
  return { duplicates, unique };
}

/**
 * POST /api/ai/generate
 * Generates EAMCET questions on the server side to bypass browser CORS & origin limits
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subject, chapter, count = 5, customApiKey, existingSamples = [] } = body;

    let rawKey = customApiKey?.trim() || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

    // Auto-extract API key if user pasted a curl command
    if (rawKey.includes('curl ') || rawKey.includes('curl"') || rawKey.includes('key=') || rawKey.includes('Bearer ') || rawKey.includes('x-goog-api-key')) {
      const matchKey = rawKey.match(/[?&]key=([a-zA-Z0-9_\.-]+)/);
      const matchHeader = rawKey.match(/x-goog-api-key:\s*['"]?([a-zA-Z0-9_\.-]+)['"]?/i);
      const matchBearer = rawKey.match(/Bearer\s+['"]?([a-zA-Z0-9_\.-]+)['"]?/i);
      if (matchKey && matchKey[1]) {
        rawKey = matchKey[1];
      } else if (matchHeader && matchHeader[1]) {
        rawKey = matchHeader[1];
      } else if (matchBearer && matchBearer[1]) {
        rawKey = matchBearer[1];
      }
    }

    const apiKey = rawKey;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'No Gemini API key found. Please provide a key.' },
        { status: 400 }
      );
    }

    if (!subject || !chapter) {
      return NextResponse.json(
        { success: false, error: 'Subject and chapter are required.' },
        { status: 400 }
      );
    }

    // Build the "already exists" block so AI avoids regenerating them
    const avoidBlock = existingSamples.length > 0
      ? `\n\n⚠️ CRITICAL — DO NOT REPEAT THE FOLLOWING QUESTIONS (already in database):\n${existingSamples
          .slice(0, 100) // Increased from 30 to 100 for better deduplication
          .map((q: string, i: number) => `${i + 1}. ${String(q).slice(0, 200)}`) // Increased slice length from 180 to 200
          .join('\n')}\n\n⚠️ TOTAL: ${existingSamples.length} questions exist in database. Every generated question MUST be completely different in concept, numbers, and wording from ALL ${existingSamples.length} questions above. Use different mathematical approaches, varied numerical values, and distinct problem scenarios.`
      : '';

    const prompt = `Create exactly ${count} high-quality, original AP/TS EAMCET multiple-choice questions.
Subject: ${subject}
Chapter: ${chapter}

Strict Rules:
1. ZERO DUPLICATES: Every question must be completely unique. Never repeat the same mathematical concept, numerical values, or problem structure from the existing database or within this batch.
2. CONCEPT VARIETY: Each question must test a DIFFERENT concept, formula, or numerical scenario. If one question uses integration by parts, the next should use substitution or definite integrals.
3. NUMERICAL DIVERSITY: Use varied numerical values. If one question uses coefficients 2,3,4, use different numbers like 5,7,11 for the next question.
4. QUESTION STYLE VARIETY: Mix different question types - numerical computation, conceptual understanding, graph-based problems, formula application, exception/identification, comparative analysis.
5. UNIQUE PATTERNS: Every question must have a distinct model_id describing the specific mathematical/scientific pattern (e.g. "${subject.toLowerCase()}-${chapter.slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, '-')}-unique-001").
6. Distinct options: Exactly 4 distinct options, one correct index (0-3), and step-by-step solution.
7. Natural Telugu translation matching the English problem exactly using standard Intermediate Telugu Akademi terms.
8. Clean LaTeX inside strings for mathematical/chemical symbols, formulas ($...$).
9. Return JSON array only.${avoidBlock}

Output JSON format for each question:
{
  "model_id": "unique-model-id",
  "question_text_en": "string with LaTeX",
  "question_text_te": "Telugu string with LaTeX",
  "options_en": ["opt1", "opt2", "opt3", "opt4"],
  "options_te": ["opt1_te", "opt2_te", "opt3_te", "opt4_te"],
  "correct_option": 0,
  "explanation_en": "step-by-step solution",
  "explanation_te": "step-by-step solution in Telugu",
  "difficulty": "Medium"
}`;

    let lastError: any = null;
    let questions: any[] = [];
    let successfulModel = '';

    for (const model of CANDIDATE_MODELS) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };

        let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        if (apiKey.startsWith('ya29.')) {
          // OAuth2 access token: Send Authorization Bearer header
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          // Standard API key (including AIza... and AQ...): Send x-goog-api-key and URL query parameter
          headers['x-goog-api-key'] = apiKey;
          url += `?key=${encodeURIComponent(apiKey)}`;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.6, // Increased from 0.35 to 0.6 for more variety and less deterministic output
              maxOutputTokens: 24576
            }
          })
        });

        if (res.status === 429) {
          lastError = new Error(`Quota limit reached (429) on ${model}.`);
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          lastError = new Error(`Model [${model}] status ${res.status}: ${errText.slice(0, 180)}`);
          continue;
        }

        const data = await res.json();
        const rawText = (data.candidates || [])
          .flatMap((c: any) => c.content?.parts || [])
          .map((p: any) => p.text || '')
          .join('');

        if (rawText.trim()) {
          const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const match = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            const list = Array.isArray(parsed) ? parsed : (parsed.questions || [parsed]);
            if (list.length > 0) {
              questions = list;
              successfulModel = model;
              break;
            }
          }
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (questions.length === 0) {
      // If all cloud Gemini models are rate-limited or return 401, provide high-precision dynamic questions for this chapter
      questions = generateIntelligentFallback(subject, chapter, count);
      successfulModel = 'EAMCET Blueprint Engine (Smart Fallback)';
    }

    // Format & validate questions
    const validQuestions = questions.map((q: any, i: number) => ({
      ...q,
      question_id: `gen-${Date.now()}-${i}`,
      subject,
      topic: chapter,
      is_previous_year: false,
      stream: subject === 'Biology' ? 'Agriculture' : 'Engineering'
    }));

    console.log(`Generated ${validQuestions.length} questions for subject: ${subject}, chapter: ${chapter}`);

    // Server-side validation: Check for duplicates in database before returning
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    let validationResult: { duplicates: any[], unique: any[] } = { duplicates: [], unique: validQuestions };
    
    if (supabaseUrl && supabaseKey) {
      try {
        validationResult = await checkForDuplicatesInDatabase(validQuestions, supabaseUrl, supabaseKey);
        
        if (validationResult.duplicates.length > 0) {
          console.log(`Server-side validation: Found ${validationResult.duplicates.length} duplicates, returning ${validationResult.unique.length} unique questions`);
        }
      } catch (error) {
        console.error('Server-side validation failed, proceeding with all questions:', error);
        validationResult = { duplicates: [], unique: validQuestions };
      }
    }

    return NextResponse.json({
      success: true,
      modelUsed: successfulModel,
      count: validationResult.unique.length,
      questions: validationResult.unique,
      validationResults: {
        totalGenerated: validQuestions.length,
        duplicatesRemoved: validationResult.duplicates.length,
        uniqueQuestions: validationResult.unique.length
      }
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Internal Server Error during question generation'
    }, { status: 500 });
  }
}

function generateIntelligentFallback(subject: string, chapter: string, count: number) {
  const result: any[] = [];
  const cleanChapter = chapter.toLowerCase();
  const baseTime = Date.now();

  for (let i = 1; i <= count; i++) {
    // Unique seed for each question to avoid collision
    const k = (baseTime + i * 17) % 89 + 2;
    const a = ((k * 3) % 9) + 2;
    const b = ((k * 5) % 11) + 3;
    const c = ((k * 7) % 7) + 1;
    const modelIndex = (i - 1);

    if (subject === 'Mathematics') {
      if (cleanChapter.includes('calculus') || cleanChapter.includes('integral') || cleanChapter.includes('derivative') || cleanChapter.includes('limit')) {
        const calculusType = modelIndex % 6;

        if (calculusType === 0) {
          result.push({
            model_id: `calc-king-integral-${k}-${i}`,
            question_text_en: `Evaluate the definite integral: $\\int_{0}^{\\pi/2} \\frac{\\sin^{${a}} x}{\\sin^{${a}} x + \\cos^{${a}} x} \\, dx$`,
            question_text_te: `నిశ్చిత సమాకలనము విలువను కనుగొనండి: $\\int_{0}^{\\pi/2} \\frac{\\sin^{${a}} x}{\\sin^{${a}} x + \\cos^{${a}} x} \\, dx$`,
            options_en: ['$\\frac{\\pi}{2}$', '$\\frac{\\pi}{4}$', '$\\frac{\\pi}{8}$', '$\\pi$'],
            options_te: ['$\\frac{\\pi}{2}$', '$\\frac{\\pi}{4}$', '$\\frac{\\pi}{8}$', '$\\pi$'],
            correct_option: 1,
            explanation_en: `Applying property $\\int_0^a f(x)dx = \\int_0^a f(a-x)dx$ gives $2I = \\int_0^{\\pi/2} 1 \\,dx = \\frac{\\pi}{2} \\implies I = \\frac{\\pi}{4}$.`,
            explanation_te: `$\\int_0^a f(x)dx = \\int_0^a f(a-x)dx$ ధర్మాన్ని ఉపయోగించగా $2I = \\frac{\\pi}{2} \\implies I = \\frac{\\pi}{4}$.`,
            difficulty: 'Medium'
          });
        } else if (calculusType === 1) {
          result.push({
            model_id: `calc-limits-${k}-${i}`,
            question_text_en: `Compute the limit: $\\lim_{x \\to 0} \\frac{1 - \\cos(${a}x)}{x^2}$`,
            question_text_te: `హద్దు (లిమిట్) విలువను గణించండి: $\\lim_{x \\to 0} \\frac{1 - \\cos(${a}x)}{x^2}$`,
            options_en: [`$\\frac{${a * a}}{2}$`, `$${a}$`, `$${a * a}$`, `$\\frac{${a}}{2}$`],
            options_te: [`$\\frac{${a * a}}{2}$`, `$${a}$`, `$${a * a}$`, `$\\frac{${a}}{2}$`],
            correct_option: 0,
            explanation_en: `Using standard limit $\\lim_{x\\to 0} \\frac{1-\\cos kx}{x^2} = \\frac{k^2}{2}$. For $k = ${a}$, the value is $\\frac{${a * a}}{2}$.`,
            explanation_te: `ప్రామాణిక సూత్రం $\\lim_{x\\to 0} \\frac{1-\\cos kx}{x^2} = \\frac{k^2}{2}$ ప్రకారం ఇక్కడ $k = ${a}$ కాబట్టి $\\frac{${a * a}}{2}$ అగును.`,
            difficulty: 'Easy'
          });
        } else if (calculusType === 2) {
          const m = 3 * a * (c * c) - b;
          result.push({
            model_id: `calc-tangent-${k}-${i}`,
            question_text_en: `Find the slope of the tangent to the curve $y = ${a}x^3 - ${b}x + ${k}$ at the point where $x = ${c}$:`,
            question_text_te: `$y = ${a}x^3 - ${b}x + ${k}$ వక్రానికి $x = ${c}$ బిందువు వద్ద స్పర్శరేఖ వాలు (slope):`,
            options_en: [`$${m}$`, `$${m + 3}$`, `$${m - 4}$`, `$${m * 2}$`],
            options_te: [`$${m}$`, `$${m + 3}$`, `$${m - 4}$`, `$${m * 2}$`],
            correct_option: 0,
            explanation_en: `$\\frac{dy}{dx} = 3(${a})x^2 - ${b}$. At $x = ${c}$, slope $m = 3(${a})(${c})^2 - ${b} = ${m}$.`,
            explanation_te: `$\\frac{dy}{dx} = 3(${a})x^2 - ${b}$. $x = ${c}$ వద్ద వాలు $m = ${m}$.`,
            difficulty: 'Medium'
          });
        } else if (calculusType === 3) {
          result.push({
            model_id: `calc-exp-limit-${k}-${i}`,
            question_text_en: `Evaluate $\\lim_{x \\to \\infty} \\left(1 + \\frac{${a}}{x}\\right)^{${b}x}$:`,
            question_text_te: `$\\lim_{x \\to \\infty} \\left(1 + \\frac{${a}}{x}\\right)^{${b}x}$ విలువ ఎంత?`,
            options_en: [`$e^{${a * b}}$`, `$e^{${a}}$`, `$e^{${b}}$`, `$e^{${a + b}}$`],
            options_te: [`$e^{${a * b}}$`, `$e^{${a}}$`, `$e^{${b}}$`, `$e^{${a + b}}$`],
            correct_option: 0,
            explanation_en: `Using $\\lim_{x\\to\\infty} (1 + k/x)^{mx} = e^{km}$. Here $k=${a}, m=${b} \\implies e^{${a * b}}$.`,
            explanation_te: `$\\lim_{x\\to\\infty} (1 + k/x)^{mx} = e^{km}$ సూత్రం ప్రకారం $e^{${a * b}}$.`,
            difficulty: 'Easy'
          });
        } else if (calculusType === 4) {
          result.push({
            model_id: `calc-parts-integral-${k}-${i}`,
            question_text_en: `The integral $\\int e^{${a}x} \\left(${a}\\sin x + \\cos x\\right) dx$ is equal to:`,
            question_text_te: `$\\int e^{${a}x} \\left(${a}\\sin x + \\cos x\\right) dx$ సమాకలనం దేనికి సమానం?`,
            options_en: [`$e^{${a}x}\\sin x + C$`, `$e^{${a}x}\\cos x + C$`, `$\\frac{1}{${a}} e^{${a}x}\\sin x + C$`, `$-e^{${a}x}\\cos x + C$`],
            options_te: [`$e^{${a}x}\\sin x + C$`, `$e^{${a}x}\\cos x + C$`, `$\\frac{1}{${a}} e^{${a}x}\\sin x + C$`, `$-e^{${a}x}\\cos x + C$`],
            correct_option: 0,
            explanation_en: `Using the formula $\\int e^{kx} (k f(x) + f'(x)) dx = e^{kx} f(x) + C$ where $f(x) = \\sin x$.`,
            explanation_te: `$\\int e^{kx} (k f(x) + f'(x)) dx = e^{kx} f(x) + C$ సూత్రం ద్వారా $e^{${a}x}\\sin x + C$.`,
            difficulty: 'Medium'
          });
        } else {
          result.push({
            model_id: `calc-diff-eq-${k}-${i}`,
            question_text_en: `The integrating factor (I.F.) of the differential equation $\\frac{dy}{dx} + \\left(\\frac{${a}}{x}\\right) y = x^{${b}}$ is:`,
            question_text_te: `$\\frac{dy}{dx} + \\left(\\frac{${a}}{x}\\right) y = x^{${b}}$ అవకలన సమీకరణం యొక్క సమాకలన గుణకం (I.F.):`,
            options_en: [`$x^{${a}}$`, `$e^{${a}x}$`, `$\\frac{1}{x^{${a}}}$`, `$x^{${b}}$`],
            options_te: [`$x^{${a}}$`, `$e^{${a}x}$`, `$\\frac{1}{x^{${a}}}$`, `$x^{${b}}$`],
            correct_option: 0,
            explanation_en: `$\\text{I.F.} = e^{\\int P(x)dx} = e^{\\int (${a}/x)dx} = e^{${a} \\ln x} = x^{${a}}$.`,
            explanation_te: `$\\text{I.F.} = e^{\\int P(x)dx} = e^{\\int (${a}/x)dx} = x^{${a}}$.`,
            difficulty: 'Medium'
          });
        }
      } else if (cleanChapter.includes('matrix') || cleanChapter.includes('determinant')) {
        const matrixType = modelIndex % 3;
        if (matrixType === 0) {
          result.push({
            model_id: `math-matrix-${k}-${i}`,
            question_text_en: `If matrix $A = \\begin{pmatrix} ${a} & 1 \\\\ 0 & ${a} \\end{pmatrix}$, then $A^{${b}}$ is equal to:`,
            question_text_te: `$A = \\begin{pmatrix} ${a} & 1 \\\\ 0 & ${a} \\end{pmatrix}$ అయితే, $A^{${b}}$ మాత్రిక విలువ:`,
            options_en: [
              `$\\begin{pmatrix} ${a}^{${b}} & ${b} \\cdot ${a}^{${b - 1}} \\\\ 0 & ${a}^{${b}} \\end{pmatrix}$`,
              `$\\begin{pmatrix} ${a}^{${b}} & 1 \\\\ 0 & ${a}^{${b}} \\end{pmatrix}$`,
              `$\\begin{pmatrix} ${a * b} & ${b} \\\\ 0 & ${a * b} \\end{pmatrix}$`,
              `$\\begin{pmatrix} ${a}^{${b}} & 0 \\\\ 0 & ${a}^{${b}} \\end{pmatrix}$`
            ],
            options_te: [
              `$\\begin{pmatrix} ${a}^{${b}} & ${b} \\cdot ${a}^{${b - 1}} \\\\ 0 & ${a}^{${b}} \\end{pmatrix}$`,
              `$\\begin{pmatrix} ${a}^{${b}} & 1 \\\\ 0 & ${a}^{${b}} \\end{pmatrix}$`,
              `$\\begin{pmatrix} ${a * b} & ${b} \\\\ 0 & ${a * b} \\end{pmatrix}$`,
              `$\\begin{pmatrix} ${a}^{${b}} & 0 \\\\ 0 & ${a}^{${b}} \\end{pmatrix}$`
            ],
            correct_option: 0,
            explanation_en: `By induction on upper-triangular nilpotent decomposition: $A^{${b}} = \\begin{pmatrix} ${a}^{${b}} & ${b} \\cdot ${a}^{${b - 1}} \\\\ 0 & ${a}^{${b}} \\end{pmatrix}$.`,
            explanation_te: `గణిత ఆగమన సిద్ధాంతం ప్రకారం $A^{${b}} = \\begin{pmatrix} ${a}^{${b}} & ${b} \\cdot ${a}^{${b - 1}} \\\\ 0 & ${a}^{${b}} \\end{pmatrix}$.`,
            difficulty: 'Medium'
          });
        } else if (matrixType === 1) {
          result.push({
            model_id: `math-adj-det-${k}-${i}`,
            question_text_en: `If $A$ is a square matrix of order $3 \\times 3$ such that $\\det(A) = ${a}$, then $\\det(\\text{adj}(A))$ is:`,
            question_text_te: `$A$ అనేది $3 \\times 3$ మాత్రిక మరియు $\\det(A) = ${a}$ అయితే, $\\det(\\text{adj}(A))$ విలువ:`,
            options_en: [`$${a * a}$`, `$${a * a * a}$`, `$${a}$`, `$3 \\times ${a}$`],
            options_te: [`$${a * a}$`, `$${a * a * a}$`, `$${a}$`, `$3 \\times ${a}$`],
            correct_option: 0,
            explanation_en: `Formula: $\\det(\\text{adj}(A)) = |A|^{n-1}$. For $n=3$, $|A|^{3-1} = |A|^2 = (${a})^2 = ${a * a}$.`,
            explanation_te: `సూత్రం: $\\det(\\text{adj}(A)) = |A|^{n-1} = (${a})^2 = ${a * a}$.`,
            difficulty: 'Easy'
          });
        } else {
          result.push({
            model_id: `math-cramer-${k}-${i}`,
            question_text_en: `For what value of $\\lambda$ will the system of equations $x + y + z = ${a}$, $x + 2y + 3z = ${b}$, $x + 3y + \\lambda z = ${c}$ have no unique solution?`,
            question_text_te: `$x + y + z = ${a}$, $x + 2y + 3z = ${b}$, $x + 3y + \\lambda z = ${c}$ సమీకరణాల వ్యవస్థకు ఏకైక సాధన లేకుండుటకు $\\lambda$ విలువ:`,
            options_en: [`$5$`, `$4$`, `$3$`, `$0$`],
            options_te: [`$5$`, `$4$`, `$3$`, `$0$`],
            correct_option: 0,
            explanation_en: `Set determinant of coefficients to zero: $\\begin{vmatrix} 1 & 1 & 1 \\\\ 1 & 2 & 3 \\\\ 1 & 3 & \\lambda \\end{vmatrix} = 0 \\implies \\lambda - 5 = 0 \\implies \\lambda = 5$.`,
            explanation_te: `గుణక మాత్రిక నిర్ణాయకం సున్నా కావాలి: $\\lambda - 5 = 0 \\implies \\lambda = 5$.`,
            difficulty: 'Hard'
          });
        }
      } else {
        result.push({
          model_id: `math-binom-${k}-${i}`,
          question_text_en: `In the expansion of $\\left(x^{${c}} + \\frac{${a}}{x^2}\\right)^{${b * 3}}$, the term independent of $x$ corresponds to $r = $`,
          question_text_te: `$\\left(x^{${c}} + \\frac{${a}}{x^2}\\right)^{${b * 3}}$ విస్తరణలో $x$ లేని స్థిరపదంలో $r$ విలువ:`,
          options_en: [`$${b}$`, `$${b + 1}$`, `$${b - 1}$`, `$${b * 2}$`],
          options_te: [`$${b}$`, `$${b + 1}$`, `$${b - 1}$`, `$${b * 2}$`],
          correct_option: 0,
          explanation_en: `General term power of $x$ is $c(n-r) - 2r = 0 \\implies r = \\frac{cn}{c+2} = ${b}$.`,
          explanation_te: `$x$ ఘాతం $c(n-r) - 2r = 0 \\implies r = ${b}$.`,
          difficulty: 'Medium'
        });
      }
    } else if (subject === 'Physics') {
      const physType = modelIndex % 4;
      if (physType === 0) {
        result.push({
          model_id: `phys-motion-${k}-${i}`,
          question_text_en: `A body of mass $m = ${a}\\text{ kg}$ starts from rest under a force $F = (${b}t)\\,\\text{N}$. The kinetic energy gained after $t = 2\\text{ s}$ is:`,
          question_text_te: `$m = ${a}\\text{ kg}$ ద్రవ్యరాశి గల వస్తువు $F = (${b}t)\\,\\text{N}$ బలం వలన $t = 2\\text{ s}$ తర్వాత పొందే గతిజ శక్తి:`,
          options_en: [`$${Math.round((b * 2 * b * 2) / (2 * a))}\\text{ J}$`, `$${Math.round((b * b) / a)}\\text{ J}$`, `$${Math.round((b * 4) / a)}\\text{ J}$`, `$${b * a}\\text{ J}$`],
          options_te: [`$${Math.round((b * 2 * b * 2) / (2 * a))}\\text{ J}$`, `$${Math.round((b * b) / a)}\\text{ J}$`, `$${Math.round((b * 4) / a)}\\text{ J}$`, `$${b * a}\\text{ J}$`],
          correct_option: 0,
          explanation_en: `Velocity $v = \\int_0^2 \\frac{${b}t}{${a}}dt = \\frac{2 \\cdot ${b}}{${a}}$. $K = \\frac{1}{2} m v^2 = \\frac{2 \\cdot ${b}^2}{${a}}\\,\\text{J}$.`,
          explanation_te: `వేగం $v = \\frac{2 \\cdot ${b}}{${a}}$. గతిజ శక్తి $K = \\frac{1}{2} m v^2$.`,
          difficulty: 'Medium'
        });
      } else if (physType === 1) {
        result.push({
          model_id: `phys-carnot-${k}-${i}`,
          question_text_en: `A Carnot engine operates between temperatures $T_1 = ${a * 100}\\text{ K}$ and $T_2 = ${Math.round(a * 50)}\\text{ K}$. Its efficiency $\\eta$ is:`,
          question_text_te: `ఒక కార్నో ఇంజిన్ $T_1 = ${a * 100}\\text{ K}$ మరియు $T_2 = ${Math.round(a * 50)}\\text{ K}$ మధ్య పనిచేస్తుంటే దాని సామర్థ్యం $\\eta$:`,
          options_en: [`$50\\%$`, `$25\\%$`, `$75\\%$`, `$100\\%$`],
          options_te: [`$50\\%$`, `$25\\%$`, `$75\\%$`, `$100\\%$`],
          correct_option: 0,
          explanation_en: `$\\eta = 1 - \\frac{T_2}{T_1} = 1 - 0.5 = 0.50 = 50\\%$.`,
          explanation_te: `$\\eta = 1 - \\frac{T_2}{T_1} = 1 - 0.5 = 50\\%$.`,
          difficulty: 'Easy'
        });
      } else {
        result.push({
          model_id: `phys-projectile-${k}-${i}`,
          question_text_en: `The horizontal range of a projectile fired with speed $u = ${a * 10}\\text{ m/s}$ at an angle of $45^\\circ$ ($g = 10\\text{ m/s}^2$) is:`,
          question_text_te: `$u = ${a * 10}\\text{ m/s}$ వేగంతో $45^\\circ$ కోణంలో విసిరిన ప్రక్షేపక వ్యాప్తి (Range) ఎంత? ($g = 10\\text{ m/s}^2$):`,
          options_en: [`$${(a * 10 * a * 10) / 10}\\text{ m}$`, `$${(a * 10 * a * 10) / 20}\\text{ m}$`, `$${a * 10}\\text{ m}$`, `$${(a * 10 * a * 10) / 5}\\text{ m}$`],
          options_te: [`$${(a * 10 * a * 10) / 10}\\text{ m}$`, `$${(a * 10 * a * 10) / 20}\\text{ m}$`, `$${a * 10}\\text{ m}$`, `$${(a * 10 * a * 10) / 5}\\text{ m}$`],
          correct_option: 0,
          explanation_en: `$R = \\frac{u^2 \\sin 2\\theta}{g} = \\frac{(${a * 10})^2 \\sin 90^\\circ}{10} = ${(a * 10 * a * 10) / 10}\\text{ m}$.`,
          explanation_te: `$R = \\frac{u^2 \\sin 2\\theta}{g} = ${(a * 10 * a * 10) / 10}\\text{ m}$.`,
          difficulty: 'Easy'
        });
      }
    } else if (subject === 'Biology') {
      const bioType = modelIndex % 3;
      if (bioType === 0) {
        result.push({
          model_id: `bio-photo-${k}-${i}`,
          question_text_en: `During non-cyclic photophosphorylation in chloroplasts, the primary electron acceptor from Photosystem II ($PS\\text{ II}$) is:`,
          question_text_te: `క్లోరోప్లాస్ట్‌లలో అచక్రీయ కాంతి ఫాస్ఫోరిలేషన్ సమయంలో, కాంతి వ్యవస్థ II ($PS\\text{ II}$) నుండి ప్రాథమిక ఎలక్ట్రాన్ గ్రాహకం:`,
          options_en: [`Pheophytin`, `Plastoquinone`, `Cytochrome $b_6f$`, `Plastocyanin`],
          options_te: [`ఫియోఫైటిన్`, `ప్లాస్టోక్వినోన్`, `సైటోక్రోమ్ $b_6f$`, `ప్లాస్టోసయనిన్`],
          correct_option: 0,
          explanation_en: `Excited $P_{680}$ transfers its electron directly to pheophytin, which then transfers to plastoquinone ($PQ_A$).`,
          explanation_te: `ఉత్తేజితమైన $P_{680}$ తన ఎలక్ట్రాన్‌ను మొదట ఫియోఫైటిన్‌కు అందిస్తుంది.`,
          difficulty: 'Medium'
        });
      } else if (bioType === 1) {
        result.push({
          model_id: `bio-genetics-${k}-${i}`,
          question_text_en: `In a dihybrid cross involving two heterozygous parents ($AaBb \\times AaBb$), the proportion of offspring that are completely homozygous ($AABB$, $AAbb$, $aaBB$, or $aabb$) is:`,
          question_text_te: `ద్విసంకరణ సంకరంలో ($AaBb \\times AaBb$), పూర్తిగా సమయుగ్మజాలు ($AABB$, $AAbb$, $aaBB$, $aabb$) అయ్యే సంతతి నిష్పత్తి:`,
          options_en: [`$\\frac{4}{16}$ ($25\\%$)`, `$\\frac{9}{16}$`, `$\\frac{1}{16}$`, `$\\frac{6}{16}$`],
          options_te: [`$\\frac{4}{16}$ ($25\\%$)`, `$\\frac{9}{16}$`, `$\\frac{1}{16}$`, `$\\frac{6}{16}$`],
          correct_option: 0,
          explanation_en: `Each double homozygote occurs with probability $1/16$. There are 4 such genotypes, so $4/16 = 1/4 = 25\\%$.`,
          explanation_te: `ప్రతి డబుల్ హోమోజైగోట్ $1/16$ సంభావ్యతతో వస్తుంది. మొత్తం 4 రకాలు కాబట్టి $4/16 = 25\\%$.`,
          difficulty: 'Hard'
        });
      } else {
        result.push({
          model_id: `bio-resp-${k}-${i}`,
          question_text_en: `The net yield of ATP molecules produced directly by substrate-level phosphorylation during complete oxidation of one glucose molecule is:`,
          question_text_te: `ఒక గ్లూకోజ్ అణువు పూర్తి ఆక్సీకరణంలో సబ్‌స్ట్రేట్ స్థాయి ఫాస్ఫోరిలేషన్ ద్వారా నేరుగా ఉత్పత్తి అయ్యే నికర ATP అణువుల సంఖ్య:`,
          options_en: [`$4\\text{ ATP}$`, `$2\\text{ ATP}$`, `$36\\text{ ATP}$`, `$38\\text{ ATP}$`],
          options_te: [`$4\\text{ ATP}$`, `$2\\text{ ATP}$`, `$36\\text{ ATP}$`, `$38\\text{ ATP}$`],
          correct_option: 0,
          explanation_en: `2 ATP from glycolysis and 2 GTP/ATP from Krebs cycle via substrate-level phosphorylation = 4 ATP total.`,
          explanation_te: `గ్లైకోలాసిస్‌లో 2 ATP మరియు క్రెబ్స్ వలయంలో 2 ATP నేరుగా లభిస్తాయి, మొత్తం 4 ATP.`,
          difficulty: 'Medium'
        });
      }
    } else if (subject === 'Zoology') {
      const zooType = modelIndex % 3;
      if (zooType === 0) {
        result.push({
          model_id: `zoo-cardio-${k}-${i}`,
          question_text_en: `In the human cardiac cycle, the duration of ventricular systole under normal resting heart rate of $75\\text{ beats/min}$ is approximately:`,
          question_text_te: `మానవ హృదయ స్పందన చక్రంలో, నిమిషానికి 75 స్పందనలు ఉన్నప్పుడు జఠరికల సంకోచ కాలం (Ventricular Systole):`,
          options_en: [`$0.3\\text{ seconds}$`, `$0.1\\text{ seconds}$`, `$0.4\\text{ seconds}$`, `$0.8\\text{ seconds}$`],
          options_te: [`$0.3\\text{ సెకన్లు}$`, `$0.1\\text{ సెకన్లు}$`, `$0.4\\text{ సెకన్లు}$`, `$0.8\\text{ సెకన్లు}$`],
          correct_option: 0,
          explanation_en: `Atrial systole is 0.1 s, ventricular systole is 0.3 s, and complete cardiac diastole is 0.4 s (total = 0.8 s).`,
          explanation_te: `కర్ణికల సంకోచం 0.1 సె., జఠరికల సంకోచం 0.3 సె., మరియు సంయుక్త విశ్రాంతి కాలం 0.4 సె.`,
          difficulty: 'Easy'
        });
      } else if (zooType === 1) {
        result.push({
          model_id: `zoo-excretory-${k}-${i}`,
          question_text_en: `In the counter-current multiplier mechanism of the human kidney, the descending limb of the Loop of Henle is:`,
          question_text_te: `మానవ మూత్రపిండంలోని కౌంటర్-కరెంట్ విధానంలో, హెన్లీ లూప్ యొక్క అవరోహణ బాహువు (Descending Limb):`,
          options_en: [
            `Permeable to water, impermeable to electrolytes`,
            `Impermeable to water, permeable to electrolytes`,
            `Permeable to both water and electrolytes`,
            `Impermeable to both water and electrolytes`
          ],
          options_te: [
            `నీటికి పారగమ్యత కలిగి, ఎలక్ట్రోలైట్లకు అపారగమ్యంగా ఉంటుంది`,
            `నీటికి అపారగమ్యంగా ఉండి, ఎలక్ట్రోలైట్లకు పారగమ్యంగా ఉంటుంది`,
            `నీరు మరియు లవణాలు రెండింటికీ పారగమ్యం`,
            `రెండింటికీ అపారగమ్యం`
          ],
          correct_option: 0,
          explanation_en: `The descending limb is permeable to water but impermeable to salts, allowing tubular fluid to become hypertonic.`,
          explanation_te: `హెన్లీ లూప్ అవరోహణ బాహువు నీటికి పారగమ్యంగా ఉండి ఎలక్ట్రోలైట్లకు అపారగమ్యంగా ఉంటుంది.`,
          difficulty: 'Medium'
        });
      } else {
        result.push({
          model_id: `zoo-endocrine-${k}-${i}`,
          question_text_en: `Which pituitary hormone stimulates Leydig cells in the testes to synthesize and secrete androgens?`,
          question_text_te: `వృషణాలలోని లెడిగ్ కణాలను ఉత్తేజపరిచి ఆండ్రోజెన్ల స్రావానికి కారణమయ్యే పిట్యూటరీ హార్మోన్ ఏది?`,
          options_en: [`Luteinizing Hormone (LH)`, `Follicle Stimulating Hormone (FSH)`, `Prolactin`, `Adrenocorticotropic Hormone (ACTH)`],
          options_te: [`ల్యూటినైజింగ్ హార్మోన్ (LH / ICSH)`, `ఫాలికల్ స్టిమ్యులేటింగ్ హార్మోన్ (FSH)`, `ప్రోలాక్టిన్`, `ACTH`],
          correct_option: 0,
          explanation_en: `LH (also known as ICSH in males) acts on interstitial Leydig cells to stimulate testosterone synthesis.`,
          explanation_te: `LH (పురుషులలో ICSH) లెడిగ్ కణాలపై పనిచేసి టెస్టోస్టెరాన్ ఉత్పత్తిని ప్రేరేపిస్తుంది.`,
          difficulty: 'Easy'
        });
      }
    } else {
      // Chemistry
      const chemType = modelIndex % 3;
      if (chemType === 0) {
        result.push({
          model_id: `chem-eq-${k}-${i}`,
          question_text_en: `For the gaseous reaction $A_{(g)} + ${a}B_{(g)} \\rightleftharpoons ${b}C_{(g)}$, the exponent of $RT$ in $K_p = K_c (RT)^{\\Delta n}$ is:`,
          question_text_te: `$A_{(g)} + ${a}B_{(g)} \\rightleftharpoons ${b}C_{(g)}$ చర్యకు $K_p = K_c (RT)^{\\Delta n}$ లో $\\Delta n$ విలువ:`,
          options_en: [`$${b - 1 - a}$`, `$${b}$`, `$${a + 1}$`, `$${b - a}$`],
          options_te: [`$${b - 1 - a}$`, `$${b}$`, `$${a + 1}$`, `$${b - a}$`],
          correct_option: 0,
          explanation_en: `$\\Delta n_g = n_{\\text{products}} - n_{\\text{reactants}} = ${b} - (1 + ${a}) = ${b - 1 - a}$.`,
          explanation_te: `$\\Delta n_g = ${b} - (1 + ${a}) = ${b - 1 - a}$.`,
          difficulty: 'Easy'
        });
      } else if (chemType === 1) {
        result.push({
          model_id: `chem-kinetics-${k}-${i}`,
          question_text_en: `A first-order reaction has rate constant $k = ${a} \\times 10^{-3}\\text{ s}^{-1}$. The half-life period $t_{1/2}$ is approximately:`,
          question_text_te: `ఒక ప్రథమ క్రమాంక చర్య రేటు స్థిరాంకం $k = ${a} \\times 10^{-3}\\text{ s}^{-1}$ అయితే, అర్ధ జీవిత కాలం $t_{1/2}$:`,
          options_en: [`$${Math.round(693 / a)}\\text{ s}$`, `$${Math.round(69.3 / a)}\\text{ s}$`, `$${Math.round(6930 / a)}\\text{ s}$`, `$${Math.round(100 / a)}\\text{ s}$`],
          options_te: [`$${Math.round(693 / a)}\\text{ s}$`, `$${Math.round(69.3 / a)}\\text{ s}$`, `$${Math.round(6930 / a)}\\text{ s}$`, `$${Math.round(100 / a)}\\text{ s}$`],
          correct_option: 0,
          explanation_en: `$t_{1/2} = \\frac{0.693}{k} = \\frac{0.693}{${a} \\times 10^{-3}} = ${Math.round(693 / a)}\\text{ s}$.`,
          explanation_te: `$t_{1/2} = \\frac{0.693}{k} = ${Math.round(693 / a)}\\text{ s}$.`,
          difficulty: 'Medium'
        });
      } else {
        result.push({
          model_id: `chem-hybrid-${k}-${i}`,
          question_text_en: `The hybridization and geometry of the central atom in $SF_6$ are:`,
          question_text_te: `$SF_6$ అణువులో కేంద్ర పరమాణువు సంకరీకరణం మరియు ఆకృతి:`,
          options_en: [`$sp^3d^2$, Octahedral`, `$sp^3d$, Trigonal bipyramidal`, `$sp^3$, Tetrahedral`, `$dsp^2$, Square planar`],
          options_te: [`$sp^3d^2$, అష్టముఖి (Octahedral)`, `$sp^3d$, త్రికోణ ద్విపిరమిడ్`, `$sp^3$, చతుర్ముఖి`, `$dsp^2$, సమతల చతురస్రం`],
          correct_option: 0,
          explanation_en: `Sulfur has 6 valence electrons and forms 6 $\\sigma$-bonds with zero lone pairs $\\implies sp^3d^2$ octahedral.`,
          explanation_te: `సల్ఫర్ 6 బంధాలను కలిగి ఉండి $sp^3d^2$ అష్టముఖి ఆకృతిని ఏర్పరుస్తుంది.`,
          difficulty: 'Easy'
        });
      }
    }
  }

  // Shuffle options so correct_option is randomized across (0, 1, 2, 3)
  return result.map(q => {
    const correct = typeof q.correct_option === 'number' ? q.correct_option : 0;
    const pairs = q.options_en.map((en: string, idx: number) => ({
      en,
      te: q.options_te ? q.options_te[idx] : en,
      isCorrect: idx === correct
    }));

    for (let j = pairs.length - 1; j > 0; j--) {
      const randIdx = Math.floor(Math.random() * (j + 1));
      [pairs[j], pairs[randIdx]] = [pairs[randIdx], pairs[j]];
    }

    const newCorrect = pairs.findIndex((p: any) => p.isCorrect);

    return {
      ...q,
      options_en: pairs.map((p: any) => p.en),
      options_te: pairs.map((p: any) => p.te),
      correct_option: newCorrect >= 0 ? newCorrect : 0
    };
  });
}
