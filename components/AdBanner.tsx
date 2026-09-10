'use client';

import React from 'react';

interface AdBannerProps {
  slotId?: string;
  format?: 'horizontal' | 'sidebar' | 'leaderboard';
  className?: string;
}

export default function AdBanner({ slotId = 'default-slot', format = 'horizontal', className = '' }: AdBannerProps) {
  // Respecting specification: Strict 0 ads inside active exam
  return (
    <aside aria-label="Sponsored Advertisement" className={`w-full overflow-hidden my-4 ${className}`}>
      <div className="relative rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-gradient-to-r from-slate-50 via-slate-100 to-slate-50 dark:from-slate-900/50 dark:via-slate-800/50 dark:to-slate-900/50 p-4 text-center transition-all hover:border-slate-400">
        <span className="absolute top-1.5 right-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Advertisement
        </span>
        
        {format === 'horizontal' && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-1">
            <div className="text-left">
              <span className="inline-block px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded mb-1">
                EAMCET 2026 Rank Booster
              </span>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                🚀 Master 160/160 with Top Faculty Mentorship & Formula Cheat Sheets
              </p>
              <p className="text-xs text-slate-500">
                Join 50,000+ aspirants preparing for AP & TS EAMCET
              </p>
            </div>
            <button className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-medium text-xs rounded-lg shadow-sm transition whitespace-nowrap">
              Explore Free Series
            </button>
          </div>
        )}

        {format === 'leaderboard' && (
          <div className="py-6 flex flex-col items-center justify-center">
            <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">Google AdSense Space (728x90)</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
              ⚡ Top Engineering College Admissions Counseling - Live AP/TS Seat Matrix Predictor
            </div>
          </div>
        )}

        {format === 'sidebar' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center font-bold text-lg">
              🎯
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 text-center">
              Targeting Top 500 in TS/AP EAMCET?
            </p>
            <p className="text-xs text-slate-500 text-center px-2">
              Get personalized weakness diagnostics & 1-on-1 problem-solving sessions.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
