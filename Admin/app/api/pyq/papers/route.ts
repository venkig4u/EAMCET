import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PAPERS_DATABASE, PaperItem } from '@/lib/data/papers';

export const dynamic = 'force-dynamic';

interface PaperGroup {
  state: 'AP' | 'TG';
  year: number;
  stream: 'Engineering' | 'Agriculture';
  shift: string;
  count: number;
}

// In-memory cache to make repeated calls ultra-fast (<5ms)
let cachedPapers: { data: PaperItem[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Normalizes text for matching
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * GET /api/pyq/papers
 * Fetches all official previous year papers currently present in the Supabase database.
 * Only returns papers that have at least 160 questions (complete papers).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('fresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && cachedPapers && now - cachedPapers.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        count: cachedPapers.data.length,
        papers: cachedPapers.data,
        cached: true
      });
    }

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database client not initialized' },
        { status: 500 }
      );
    }

    // Paginate to retrieve all PYQ records safely
    let allRows: Array<{ state: string | null; year: number | null; stream: string | null; shift: string | null }> = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('questions')
        .select('state, year, stream, shift')
        .eq('is_previous_year', true)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error querying PYQ papers from Supabase:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    // Group by state, year, stream, shift
    const groupsMap = new Map<string, PaperGroup>();

    for (const row of allRows) {
      const state: 'AP' | 'TG' = (row.state && row.state.toUpperCase() === 'TG') ? 'TG' : 'AP';
      const year = Number(row.year) || 2024;
      const rawStream = (row.stream || 'Engineering').toLowerCase();
      const stream: 'Engineering' | 'Agriculture' = rawStream.includes('agri') || rawStream.includes('pharm')
        ? 'Agriculture'
        : 'Engineering';
      const shift = (row.shift || 'Shift-1 (FN)').trim();

      const groupKey = `${state}__${year}__${stream}__${shift}`;
      const existing = groupsMap.get(groupKey);

      if (existing) {
        existing.count++;
      } else {
        groupsMap.set(groupKey, {
          state,
          year,
          stream,
          shift,
          count: 1
        });
      }
    }

    // Keep only complete papers (at least 160 questions)
    const validGroups = Array.from(groupsMap.values()).filter(g => g.count >= 160);

    // Map each group to a PaperItem (using PAPERS_DATABASE metadata if available)
    const livePapers: PaperItem[] = validGroups.map(group => {
      // Find matching item in PAPERS_DATABASE
      const match = PAPERS_DATABASE.find(p => {
        const stateMatch = p.state === group.state;
        const yearMatch = p.year === group.year;
        const streamMatch = p.stream === group.stream;
        const shiftNormP = normalizeKey(p.shift);
        const shiftNormG = normalizeKey(group.shift);
        const shiftMatch = shiftNormP === shiftNormG || p.shift === group.shift;
        return stateMatch && yearMatch && streamMatch && shiftMatch;
      });

      if (match) {
        return {
          ...match,
          questionsCount: group.count
        };
      }

      // If not in static PAPERS_DATABASE, dynamically generate PaperItem
      const dateMatch = group.shift.match(/^(\d{1,2}\s+[A-Za-z]+)/);
      const dateStr = dateMatch ? `${dateMatch[1]} ${group.year}` : `${group.year} Official`;
      const idSlug = `pyq-${group.state.toLowerCase()}-${group.year}-${group.stream.toLowerCase()}-${group.shift.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/, '');

      return {
        id: idSlug,
        title: `${group.state} EAPCET ${group.year} ${group.stream} Official Paper (${group.shift})`,
        state: group.state,
        year: group.year,
        stream: group.stream,
        shift: group.shift,
        date: dateStr,
        questionsCount: group.count,
        durationMins: 180,
        avgScore: 90,
        difficulty: 'Moderate'
      };
    });

    // Sort papers: newest year first, then by shift/date
    livePapers.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return a.shift.localeCompare(b.shift);
    });

    // Update in-memory cache
    cachedPapers = {
      data: livePapers,
      timestamp: Date.now()
    };

    return NextResponse.json({
      success: true,
      count: livePapers.length,
      papers: livePapers,
      cached: false
    });
  } catch (error: any) {
    console.error('Unexpected error in /api/pyq/papers:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
