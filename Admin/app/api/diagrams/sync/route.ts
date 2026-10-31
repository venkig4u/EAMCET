import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const maxDuration = 300; // Allow up to 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetShift = body.shift || '';

    const pythonPath = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const scriptPath = targetShift
      ? path.join(process.cwd(), 'scripts', 'batch_replace_all_diagrams.py')
      : path.join(process.cwd(), 'scripts', 'sync_all_diagrams.py');

    const args = targetShift
      ? [scriptPath, targetShift]
      : [scriptPath];

    return new Promise<NextResponse>((resolve) => {
      const proc = spawn(pythonPath, args, {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(NextResponse.json({
            success: true,
            message: 'Diagram sync completed successfully',
            output: stdout.slice(-1500)
          }));
        } else {
          resolve(NextResponse.json({
            success: false,
            error: stderr || stdout.slice(-1000)
          }, { status: 500 }));
        }
      });
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to sync diagrams'
    }, { status: 500 });
  }
}

