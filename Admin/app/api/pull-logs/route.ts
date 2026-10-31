import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/pull-logs?limit=100
 * Returns recent pull operations (dry runs included), newest first,
 * for the admin "Previous Papers Auto-Ingest" pull-history table.
 */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { success: false, error: 'Supabase is not configured', logs: [] },
      { status: 503 }
    );
  }

  try {
    const limitParam = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('pull_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, logs: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, logs: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error', logs: [] },
      { status: 500 }
    );
  }
}
