import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SEARCH_DIRS = [
  path.join('D:', 'Projects', 'EAMCET PAPERS'),
  path.join('D:', 'Projects', 'New folder', 'AP_EAPCET_Papers'),
  path.join('D:', 'Projects'),
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('name') || '';
    const filePath = searchParams.get('path') || '';

    let targetPath = '';

    // Direct path provided and exists
    if (filePath && fs.existsSync(filePath)) {
      targetPath = filePath;
    } else if (fileName) {
      // Search in predefined directories
      const cleanName = path.basename(fileName).toLowerCase();
      for (const baseDir of SEARCH_DIRS) {
        if (!fs.existsSync(baseDir)) continue;

        const findFile = (dir: string): string | null => {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                const found = findFile(full);
                if (found) return found;
              } else if (entry.name.toLowerCase() === cleanName) {
                return full;
              }
            }
          } catch {
            // Ignore permission errors
          }
          return null;
        };

        const match = findFile(baseDir);
        if (match) {
          targetPath = match;
          break;
        }
      }
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return NextResponse.json({ error: 'PDF file not found' }, { status: 404 });
    }

    const stat = fs.statSync(targetPath);
    const fileStream = fs.createReadStream(targetPath);

    return new NextResponse(fileStream as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `inline; filename="${path.basename(targetPath)}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

