import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/questions/[id]
 * Fetch a single question by question_id
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Question ID is required' }, { status: 400 });
    }

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database connection not configured' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('question_id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: `Question with ID '${id}' not found` }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT /api/questions/[id]
 * Update a single question by question_id
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Question ID is required' }, { status: 400 });
    }

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database connection not configured' }, { status: 500 });
    }

    const body = await request.json();
    
    const { data, error } = await supabase
      .from('questions')
      .update(body)
      .eq('question_id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      message: `Question '${id}' updated successfully.`
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to update question' }, { status: 500 });
  }
}

/**
 * DELETE /api/questions/[id]
 * Delete a single question by question_id
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Question ID is required' }, { status: 400 });
    }

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database connection not configured' }, { status: 500 });
    }

    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('question_id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Question '${id}' permanently deleted from database.`
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to delete question' }, { status: 500 });
  }
}
