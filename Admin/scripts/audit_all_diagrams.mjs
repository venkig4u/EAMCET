// scripts/audit_all_diagrams.mjs
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wazluhsbslxylgcmdkpi.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemx1aHNic2x4eWxnY21ka3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNDMxNDYsImV4cCI6MjEwNDYxOTE0Nn0.gw3659JvvCWu8Lhi6tvZCs2jcfdgvhEnq5TwpzwpfMs';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('🔍 Starting Comprehensive Diagram Audit across Supabase...\n');

  // 1. Fetch all questions that have image_url or diagram_json
  let allDiagramQuestions = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await sb
      .from('questions')
      .select('question_id, state, year, stream, shift, subject, topic, question_text_en, question_text_te, explanation_en, image_url, diagram_json')
      .or('image_url.not.is.null,diagram_json.not.is.null')
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('Error fetching records:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allDiagramQuestions.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  console.log(`📊 Found ${allDiagramQuestions.length} total questions with diagram fields set.`);

  const stats = {
    total: allDiagramQuestions.length,
    ai_svg_count: 0,
    real_image_url_count: 0,
    diagram_json_count: 0,
    by_state_year_stream: {},
    by_subject: {},
    svg_questions_list: []
  };

  for (const q of allDiagramQuestions) {
    const imgStr = String(q.image_url || '').trim();
    const isSvg = imgStr.startsWith('<svg') || imgStr.includes('<svg');
    const isHttp = imgStr.startsWith('http') || imgStr.startsWith('data:image/');
    const hasJson = !!q.diagram_json;

    if (isSvg) stats.ai_svg_count++;
    if (isHttp) stats.real_image_url_count++;
    if (hasJson) stats.diagram_json_count++;

    const groupKey = `${q.state || 'Unknown'} ${q.year || 'Unknown'} ${q.stream || 'Unknown'}`;
    stats.by_state_year_stream[groupKey] = (stats.by_state_year_stream[groupKey] || 0) + 1;

    const sub = q.subject || 'Unknown';
    stats.by_subject[sub] = (stats.by_subject[sub] || 0) + 1;

    const qNumMatch = (q.explanation_en || '').match(/Q(\d+)/i) || (q.question_text_en || '').match(/Q(?:uestion)?\s*(\d+)/i);
    const qNum = qNumMatch ? parseInt(qNumMatch[1], 10) : null;

    stats.svg_questions_list.push({
      question_id: q.question_id,
      state: q.state,
      year: q.year,
      stream: q.stream,
      shift: q.shift,
      subject: q.subject,
      topic: q.topic,
      q_number: qNum,
      is_ai_svg: isSvg,
      is_real_url: isHttp,
      question_snippet: (q.question_text_en || '').slice(0, 100)
    });
  }

  console.log('\n--- Summary ---');
  console.log(`🤖 AI-Generated SVGs (need PDF replacement): ${stats.ai_svg_count}`);
  console.log(`🌐 Real Image URLs: ${stats.real_image_url_count}`);
  console.log(`📐 Diagram JSON Specs: ${stats.diagram_json_count}`);

  console.log('\n--- Breakdown by Paper Group ---');
  console.table(stats.by_state_year_stream);

  console.log('\n--- Breakdown by Subject ---');
  console.table(stats.by_subject);

  // Write full JSON report
  writeFileSync('scripts/diagram_audit_report.json', JSON.stringify(stats, null, 2), 'utf8');
  console.log('\n💾 Saved full audit details to: scripts/diagram_audit_report.json');
}

main().catch(console.error);

