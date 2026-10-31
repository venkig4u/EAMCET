import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured, fetchQuestions, insertQuestions } from '@/lib/supabase';

/**
 * GET /api/questions
 * Query parameters:
 *  - subject: 'Mathematics' | 'Physics' | 'Chemistry' | 'All'
 *  - topic / chapter: filter by chapter name
 *  - limit: number (default 20, max 200)
 *  - page: number (default 1)
 *  - offset: number
 *  - difficulty: 'Easy' | 'Medium' | 'Hard'
 *  - stream: 'Engineering' | 'Agriculture'
 *  - state: 'AP' | 'TG'
 *  - search: string (search text in English/Telugu)
 *  - random: 'true' | 'false' (randomize order)
 *  - id: single question ID lookup
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Single Question ID query shortcut
    const singleId = searchParams.get('id');
    if (singleId && supabase) {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('question_id', singleId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: `Question with ID '${singleId}' not found.` },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data });
    }

    const subject = searchParams.get('subject') || undefined;
    const topic = searchParams.get('topic') || searchParams.get('chapter') || undefined;
    const difficulty = (searchParams.get('difficulty') as 'Easy' | 'Medium' | 'Hard' | undefined) || undefined;
    const streamParam = (searchParams.get('stream') as 'Engineering' | 'Agriculture' | undefined) || undefined;
    const stream = streamParam === 'Agriculture' ? 'agriculture-pharmacy' : streamParam === 'Engineering' ? 'engineering' : undefined;
    const state = (searchParams.get('state') as 'AP' | 'TG' | undefined) || undefined;
    const search = searchParams.get('search')?.trim().toLowerCase() || undefined;
    const random = searchParams.get('random') === 'true';

    const limitParam = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 200);

    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);

    const offsetParam = searchParams.get('offset');
    const offset = offsetParam !== null ? parseInt(offsetParam, 10) : (page - 1) * limit;

    let questions = [];
    let totalCount = 0;

    if (supabase) {
      let query = supabase.from('questions').select('*', { count: 'exact' });

      if (subject && subject.toLowerCase() !== 'all') {
        query = query.eq('subject', subject);
      }
      if (topic && topic.toLowerCase() !== 'all') {
        query = query.ilike('topic', `%${topic}%`);
      }
      if (difficulty) {
        query = query.eq('difficulty', difficulty);
      }
      if (stream) {
        query = query.eq('stream', stream);
      }
      if (state) {
        query = query.eq('state', state);
      }
      if (search) {
        query = query.or(`question_text_en.ilike.%${search}%,question_text_te.ilike.%${search}%`);
      }

      // Range pagination
      query = query.range(offset, offset + limit - 1);

      const { data, count, error } = await query;

      if (error) {
        console.error('Supabase GET API Error:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      questions = data || [];
      totalCount = count || questions.length;
    } else {
      // Fallback local search
      questions = await fetchQuestions({ subject, topic, difficulty, stream, state, limit });
      totalCount = questions.length;
    }

    // Randomize if requested
    if (random && questions.length > 0) {
      questions = [...questions].sort(() => Math.random() - 0.5);
    }

    return NextResponse.json({
      success: true,
      count: questions.length,
      totalInDb: totalCount,
      page,
      limit,
      offset,
      filters: {
        subject: subject || 'All',
        topic: topic || 'All',
        difficulty: difficulty || 'All',
        stream: stream || 'All',
        random
      },
      data: questions
    });
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/questions
 * Accepts JSON body with a single question or array of questions to insert
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'JSON payload required' },
        { status: 400 }
      );
    }

    const questionsList = Array.isArray(body) ? body : [body];

    // Basic Validation
    for (const q of questionsList) {
      if (!q.subject || !q.topic || !q.question_text_en || !q.question_text_te) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Each question must include subject, topic, question_text_en, and question_text_te.' 
          },
          { status: 422 }
        );
      }
    }

    const result = await insertQuestions(questionsList);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully inserted ${result.count} questions into the database.`,
      insertedCount: result.count
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}
