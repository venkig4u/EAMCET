import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

import { normalizeQuestionStem, isPlaceholderQuestion, checkTopicMismatch } from '@/lib/deduplication';

function createQuestionFingerprint(question: any): string {
  return normalizeQuestionStem(question.question_text_en || '');
}

async function checkForDuplicatesInDatabase(questions: any[], supabaseUrl: string, supabaseKey: string): Promise<{ duplicates: any[], unique: any[] }> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const duplicates: any[] = [];
  const unique: any[] = [];
  
  try {
    // Scope fetch to the specific chapter (topic) rather than the whole subject.
    // Fetching the entire subject (14k+ rows) per batch causes severe slowdown
    // and leads to false-positive duplicate matches across unrelated chapters.
    const topics = Array.from(new Set(questions.map(q => q.topic).filter(Boolean)));
    const subjects = Array.from(new Set(questions.map(q => q.subject).filter(Boolean)));

    let existingQuestions: any[] = [];

    if (topics.length > 0) {
      // Fetch only the relevant chapters
      const { data, error } = await supabase
        .from('questions')
        .select('question_id, question_text_en, topic, subject')
        .in('subject', subjects)
        .in('topic', topics);

      if (error) {
        console.error('Error fetching existing questions for validation:', error);
        return { duplicates: [], unique: questions };
      }
      existingQuestions = data || [];
    }
    
    const existingStems = new Set<string>();
    existingQuestions.forEach(q => {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subject = 'Mathematics', chapter = '', count = 100, outputFormat = 'json' } = body;

    if (!subject) {
      return NextResponse.json(
        { success: false, error: 'Subject is required.' },
        { status: 400 }
      );
    }

    // Chapter is optional - if not provided, will use weightage-based distribution across all chapters

    // Run Python script to generate questions - use subject-specific script
    const scriptMap: { [key: string]: string } = {
      'Mathematics': 'mathematics.py',
      'Physics': 'physics.py',
      'Chemistry': 'chemistry.py',
      'Biology': 'biology.py',
      'Zoology': 'zoology.py'
    };
    
    const scriptPath = scriptMap[subject] || 'question_generator.py';
    const command = `python ${scriptPath} "${chapter}" ${count} ${outputFormat} true`;
    
    console.log(`Running Python script: ${command}`);
    console.log(`Working directory: ${path.join(process.cwd(), 'pipeline/admin-scripts')}`);
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: path.join(process.cwd(), 'pipeline/admin-scripts'),
      timeout: 120000 // 2 minutes timeout
    });

    if (stderr && stderr.includes('Error')) {
      console.error('Python script error:', stderr);
      return NextResponse.json(
        { success: false, error: 'Python script execution failed', details: stderr },
        { status: 500 }
      );
    }
    
    if (stderr) {
      console.warn('Python script stderr:', stderr);
    }

    // Parse the generated questions
    let questions: any[] = [];
    
    if (outputFormat === 'json') {
      // Split stdout by lines and find the JSON array
      const lines = stdout.split('\n');
      let jsonLine = '';
      
      for (const line of lines) {
        if (line.trim().startsWith('[') || line.trim().startsWith('{')) {
          jsonLine += line.trim();
          // Check if this is a complete JSON array
          try {
            const parsed = JSON.parse(jsonLine);
            if (Array.isArray(parsed)) {
              questions = parsed;
              break;
            }
          } catch {
            // Continue collecting lines if JSON is incomplete
            continue;
          }
        }
      }
      
      // If no JSON found, try alternative parsing
      if (questions.length === 0) {
        const jsonMatch = stdout.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          questions = JSON.parse(jsonMatch[0]);
        } else {
          // Try to parse entire output as JSON
          try {
            questions = JSON.parse(stdout);
          } catch {
            return NextResponse.json(
              { success: false, error: 'Failed to parse generated questions', debug: stdout.substring(0, 500) },
              { status: 500 }
            );
          }
        }
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'SQL format not yet supported for API' },
        { status: 400 }
      );
    }

    // Validate and format questions
    const validQuestions = questions.map((q: any, i: number) => ({
      ...q,
      question_id: q.question_id || `batch-${Date.now()}-${i}`,
      subject,
      topic: q.topic || chapter, // Use generated topic if available, otherwise use requested chapter
      is_previous_year: false,
      stream: subject === 'Biology' ? 'Agriculture' : 'Engineering'
    }));

    console.log(`Generated ${validQuestions.length} questions for subject: ${subject}, chapter: ${chapter}`);

    // Server-side validation: Check for duplicates in database
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
      modelUsed: 'Python Question Generator (Simplified)',
      count: validationResult.unique.length,
      questions: validationResult.unique,
      validationResults: {
        totalGenerated: validQuestions.length,
        duplicatesRemoved: validationResult.duplicates.length,
        uniqueQuestions: validationResult.unique.length
      }
    });
  } catch (err: any) {
    console.error('Batch generation error:', err);
    console.error('Error details:', err.message);
    console.error('Error stack:', err.stack);
    return NextResponse.json({
      success: false,
      error: err.message || 'Internal Server Error during batch generation',
      details: err.stack
    }, { status: 500 });
  }
}