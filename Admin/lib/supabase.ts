import { createClient } from '@supabase/supabase-js';
import { Question } from '@/types';
import { SAMPLE_QUESTIONS } from '@/lib/data/sampleQuestions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project.supabase.co' &&
  !supabaseUrl.includes('xxxx')
);

// Fallback client or initialized client
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface QuestionFilters {
  subject?: string;
  topic?: string;
  state?: 'AP' | 'TS';
  year?: number;
  stream?: 'Engineering' | 'Agriculture';
  shift?: string;
  limit?: number;
}

/**
 * Fetch questions from Supabase if configured; otherwise fallback to sampleQuestions
 */
export async function fetchQuestions(filters?: QuestionFilters): Promise<Question[]> {
  if (!supabase) {
    console.info('Supabase not configured, returning local sample questions');
    return filterLocalQuestions(filters);
  }

  try {
    let query = supabase.from('questions').select('*');

    if (filters?.subject && filters.subject !== 'All') {
      query = query.eq('subject', filters.subject);
    }
    if (filters?.topic && filters.topic !== 'All') {
      query = query.eq('topic', filters.topic);
    }
    if (filters?.state) {
      query = query.eq('state', filters.state);
    }
    if (filters?.year) {
      query = query.eq('year', filters.year);
    }
    if (filters?.stream) {
      query = query.eq('stream', filters.stream);
    }
    if (filters?.shift) {
      query = query.eq('shift', filters.shift);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching questions from Supabase:', error);
      return filterLocalQuestions(filters);
    }

    if (!data || data.length === 0) {
      return filterLocalQuestions(filters);
    }

    return data as Question[];
  } catch (err) {
    console.error('Supabase fetch exception:', err);
    return filterLocalQuestions(filters);
  }
}

/**
 * Bulk insert questions into Supabase
 */
export async function insertQuestions(questions: Omit<Question, 'question_id'>[]): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured yet. Please add credentials to .env.local' };
  }

  try {
    const { data, error } = await supabase.from('questions').insert(questions).select('question_id');
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, count: data?.length ?? questions.length };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to insert questions' };
  }
}

function filterLocalQuestions(filters?: QuestionFilters): Question[] {
  let list = [...SAMPLE_QUESTIONS];
  if (filters?.subject && filters.subject !== 'All') {
    list = list.filter(q => q.subject.toLowerCase() === filters.subject?.toLowerCase());
  }
  if (filters?.topic && filters.topic !== 'All') {
    list = list.filter(q => q.topic.toLowerCase() === filters.topic?.toLowerCase());
  }
  if (filters?.state) {
    list = list.filter(q => q.state === filters.state);
  }
  if (filters?.year) {
    list = list.filter(q => q.year === filters.year);
  }
  if (filters?.limit) {
    list = list.slice(0, filters.limit);
  }
  return list;
}
