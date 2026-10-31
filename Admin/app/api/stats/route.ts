import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/stats
 * Returns live DB stats for Math, Physics, and Chemistry
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Supabase database not configured in .env.local'
      }, { status: 500 });
    }

    const subjects = ['Mathematics', 'Physics', 'Chemistry'];
    const stats: Record<string, { total: number; topics: Record<string, number> }> = {
      Mathematics: { total: 0, topics: {} },
      Physics: { total: 0, topics: {} },
      Chemistry: { total: 0, topics: {} }
    };

    let grandTotal = 0;

    for (const sub of subjects) {
      const { data, count, error } = await supabase
        .from('questions')
        .select('topic', { count: 'exact' })
        .eq('subject', sub);

      if (!error && data) {
        const total = count ?? data.length;
        grandTotal += total;
        const topicMap: Record<string, number> = {};
        for (const r of data) {
          if (r.topic) {
            topicMap[r.topic] = (topicMap[r.topic] || 0) + 1;
          }
        }
        stats[sub] = { total, topics: topicMap };
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      grandTotal,
      targetTotal: 40000,
      progressPercent: Math.min(100, Math.round((grandTotal / 40000) * 100)),
      subjects: stats
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
