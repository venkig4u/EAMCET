'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ShieldCheck, Heart, Sparkles, ExternalLink } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();

  // Strict 0 ads / footer clutter on active CBT exam
  if (pathname.startsWith('/exam/')) {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Column 1: Brand & Mission */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow">
                E
              </div>
              <span className="font-bold text-base text-slate-900 dark:text-white">
                EAMCET<span className="text-cyan-600">Portal</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Empowering Andhra Pradesh and Telangana students to conquer AP EAMCET (EAPCET) & TS EAMCET (TG EAPCET) with authentic CBT simulations, KaTeX formulas, and AI tutoring.
            </p>
            <div className="flex items-center space-x-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Aligned with Latest 2024-2026 Intermediate Syllabus</span>
            </div>
          </div>

          {/* Column 2: Previous Year Papers */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider text-[11px] mb-3">
              Previous Year Papers
            </h4>
            <ul className="space-y-2">
              <li><Link href="/previous-years?state=AP&year=2024" className="hover:text-blue-600 dark:hover:text-blue-400">AP EAPCET 2024 Engineering</Link></li>
              <li><Link href="/previous-years?state=TS&year=2024" className="hover:text-blue-600 dark:hover:text-blue-400">TS EAMCET 2024 Engineering</Link></li>
              <li><Link href="/previous-years?state=AP&year=2023" className="hover:text-blue-600 dark:hover:text-blue-400">AP EAPCET 2023 Shift 1 & 2</Link></li>
              <li><Link href="/previous-years?state=TS&year=2023" className="hover:text-blue-600 dark:hover:text-blue-400">TS EAMCET 2023 Agriculture</Link></li>
              <li><Link href="/previous-years" className="text-blue-600 dark:text-blue-400 font-medium">View All Papers (2018-2026) →</Link></li>
            </ul>
          </div>

          {/* Column 3: Subjects & Practice */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider text-[11px] mb-3">
              Practice Modules
            </h4>
            <ul className="space-y-2">
              <li><Link href="/practice?subject=Mathematics" className="hover:text-blue-600 dark:hover:text-blue-400">Mathematics (80 Marks Drill)</Link></li>
              <li><Link href="/practice?subject=Physics" className="hover:text-blue-600 dark:hover:text-blue-400">Physics (Mechanics, Optics, Modern)</Link></li>
              <li><Link href="/practice?subject=Chemistry" className="hover:text-blue-600 dark:hover:text-blue-400">Chemistry (Physical & Organic)</Link></li>
              <li><Link href="/speed-challenge" className="hover:text-blue-600 dark:hover:text-blue-400">Daily 10-Q Speed Sprint</Link></li>
              <li><Link href="/ai-generator" className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1">
                <span>AI Question Generator</span>
                <Sparkles className="w-3 h-3 text-amber-500" />
              </Link></li>
            </ul>
          </div>

          {/* Column 4: Official Portals */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider text-[11px] mb-3">
              Official Portals & Resources
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="https://cets.apsche.ap.gov.in" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1">
                  <span>APSCHE Official Portal</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a href="https://eapcet.tsche.ac.in" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1">
                  <span>TG EAPCET Official Portal</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li><Link href="/#rank-predictor" className="hover:text-blue-600 dark:hover:text-blue-400">Marks vs Rank Matrix 2026</Link></li>
              <li><Link href="/#faq" className="hover:text-blue-600 dark:hover:text-blue-400">Exam Pattern & Negative Marking</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-slate-500 text-[11px] gap-2">
          <p>© 2026 EAMCET Portal. For educational & mock test practice purposes.</p>
          <p className="flex items-center space-x-1">
            <span>Built for Telugu aspirants with</span>
            <Heart className="w-3 h-3 text-red-500 fill-red-500" />
            <span>in Hyderabad & Visakhapatnam</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
