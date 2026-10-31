import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pdfName, pdfPath, pageNumber, targetQNum, customApiKey } = body;

    if (!pdfName && !pdfPath) {
      return NextResponse.json({ error: 'pdfName or pdfPath is required' }, { status: 400 });
    }

    const actualPage = pageNumber || 1;
    const pythonPath = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const scriptPath = path.join(process.cwd(), 'scripts', 'scan_single_question.py');

    const args = [
      scriptPath,
      '--pdf', pdfPath || pdfName,
      '--page', String(actualPage),
    ];

    if (targetQNum) {
      args.push('--qnum', String(targetQNum));
    }
    if (customApiKey) {
      args.push('--api-key', String(customApiKey));
    }

    return new Promise<NextResponse>((resolve) => {
      const proc = spawn(pythonPath, args, {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) {
            resolve(NextResponse.json({ success: false, error: parsed.error }, { status: 500 }));
          } else {
            resolve(NextResponse.json({ success: true, question: parsed }));
          }
        } catch {
          resolve(NextResponse.json({
            success: false,
            error: stderr || stdout || 'Failed to parse scan output',
          }, { status: 500 }));
        }
      });
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
