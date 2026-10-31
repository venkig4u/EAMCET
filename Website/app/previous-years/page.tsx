'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Filter, 
  BookOpen, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Languages, 
  FileText, 
  ArrowRight,
  Sparkles,
  MapPin,
  Layers
} from 'lucide-react';
import AdBanner from '@/components/AdBanner';

interface PaperItem {
  id: string;
  title: string;
  state: 'AP' | 'TS';
  year: number;
  stream: 'Engineering' | 'Agriculture';
  shift: string;
  date: string;
  questionsCount: number;
  durationMins: number;
  avgScore: number;
  difficulty: 'Moderate' | 'Hard' | 'Easy-Moderate';
}

const PAPERS_DATABASE: PaperItem[] = [
  {
    id: 'pyq-ap-2024-shift1',
    title: 'AP EAPCET 2024 Engineering Official Paper',
    state: 'AP',
    year: 2024,
    stream: 'Engineering',
    shift: 'Shift-1 (FN)',
    date: '18 May 2024',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 92,
    difficulty: 'Moderate'
  },
  {
    id: 'pyq-ap-2024-shift2',
    title: 'AP EAPCET 2024 Engineering Official Paper',
    state: 'AP',
    year: 2024,
    stream: 'Engineering',
    shift: 'Shift-2 (AN)',
    date: '18 May 2024',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 89,
    difficulty: 'Hard'
  },
  {
    id: 'pyq-ts-2024-shift1',
    title: 'TG EAPCET (TS EAMCET) 2024 Engineering Official Paper',
    state: 'TS',
    year: 2024,
    stream: 'Engineering',
    shift: 'Shift-1 (FN)',
    date: '10 May 2024',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 94,
    difficulty: 'Moderate'
  },
  {
    id: 'pyq-ts-2024-shift2',
    title: 'TG EAPCET (TS EAMCET) 2024 Engineering Official Paper',
    state: 'TS',
    year: 2024,
    stream: 'Engineering',
    shift: 'Shift-2 (AN)',
    date: '10 May 2024',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 87,
    difficulty: 'Hard'
  },
  {
    id: 'pyq-ap-2023-shift1',
    title: 'AP EAPCET 2023 Engineering Question Paper',
    state: 'AP',
    year: 2023,
    stream: 'Engineering',
    shift: 'Shift-1 (FN)',
    date: '15 May 2023',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 96,
    difficulty: 'Easy-Moderate'
  },
  {
    id: 'pyq-ts-2023-shift1',
    title: 'TS EAMCET 2023 Engineering Question Paper',
    state: 'TS',
    year: 2023,
    stream: 'Engineering',
    shift: 'Shift-1 (FN)',
    date: '12 May 2023',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 90,
    difficulty: 'Moderate'
  },
  {
    id: 'pyq-ap-2023-agri',
    title: 'AP EAPCET 2023 Agriculture & Pharmacy Stream',
    state: 'AP',
    year: 2023,
    stream: 'Agriculture',
    shift: 'Shift-1 (FN)',
    date: '22 May 2023',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 104,
    difficulty: 'Moderate'
  },
  {
    id: 'pyq-ts-2022-shift1',
    title: 'TS EAMCET 2022 Engineering Official Paper',
    state: 'TS',
    year: 2022,
    stream: 'Engineering',
    shift: 'Shift-1 (FN)',
    date: '18 July 2022',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 88,
    difficulty: 'Hard'
  },
  {
    id: 'pyq-ap-2022-shift1',
    title: 'AP EAPCET 2022 Engineering Official Paper',
    state: 'AP',
    year: 2022,
    stream: 'Engineering',
    shift: 'Shift-1 (FN)',
    date: '04 July 2022',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 95,
    difficulty: 'Moderate'
  },
  {
    id: 'pyq-ap-2021-shift1',
    title: 'AP EAPCET 2021 Engineering Official Paper',
    state: 'AP',
    year: 2021,
    stream: 'Engineering',
    shift: 'Shift-1 (FN)',
    date: '19 August 2021',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 101,
    difficulty: 'Easy-Moderate'
  },
  {
    id: 'pyq-ts-2021-shift2',
    title: 'TS EAMCET 2021 Engineering Official Paper',
    state: 'TS',
    year: 2021,
    stream: 'Engineering',
    shift: 'Shift-2 (AN)',
    date: '05 August 2021',
    questionsCount: 160,
    durationMins: 180,
    avgScore: 93,
    difficulty: 'Moderate'
  }
];

export default function PreviousYearsPage() {
  const [selectedState, setSelectedState] = useState<'ALL' | 'AP' | 'TS'>('ALL');
  const [selectedYear, setSelectedYear] = useState<number | 'ALL'>('ALL');
  const [selectedStream, setSelectedStream] = useState<'Engineering' | 'Agriculture'>('Engineering');
  const [selectedShift, setSelectedShift] = useState<string | 'ALL'>('ALL');

  const filteredPapers = PAPERS_DATABASE.filter(paper => {
    if (selectedState !== 'ALL' && paper.state !== selectedState) return false;
    if (selectedYear !== 'ALL' && paper.year !== selectedYear) return false;
    if (paper.stream !== selectedStream) return false;
    if (selectedShift !== 'ALL' && !paper.shift.includes(selectedShift)) return false;
    return true;
  });

  const yearsList = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 sm:p-8 shadow-md border border-indigo-800/40">
        <div className="max-w-3xl space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold">
            <BookOpen className="w-3.5 h-3.5" />
            <span>2018 - 2026 Archive</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            AP & TS EAMCET Previous Year Question Papers
          </h1>
          <p className="text-sm text-slate-300">
            Practice actual TCS iON questions with real 180-minute countdowns, bilingual Telugu/English view, instant rank prediction, and step-by-step KaTeX explanations.
          </p>
        </div>
      </div>

      {/* Multi-Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-sm font-bold text-slate-900 dark:text-white">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Filter Question Papers</span>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredPapers.length} papers
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* State Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              State / Conducting Board
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              {(['ALL', 'AP', 'TS'] as const).map(state => (
                <button
                  key={state}
                  onClick={() => setSelectedState(state)}
                  className={`py-1.5 rounded-lg transition ${
                    selectedState === state
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {state === 'ALL' ? 'All States' : state === 'AP' ? 'AP (EAPCET)' : 'TS (TG EAPCET)'}
                </button>
              ))}
            </div>
          </div>

          {/* Stream Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Stream
            </label>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              {(['Engineering', 'Agriculture'] as const).map(stream => (
                <button
                  key={stream}
                  onClick={() => setSelectedStream(stream)}
                  className={`py-1.5 rounded-lg transition ${
                    selectedStream === stream
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {stream === 'Engineering' ? 'Engineering (MPC)' : 'Agri/Pharma (BiPC)'}
                </button>
              ))}
            </div>
          </div>

          {/* Year Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Exam Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold rounded-xl p-2.5 border-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Years (2018 - 2026)</option>
              {yearsList.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {/* Shift Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Exam Shift
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              {[
                { label: 'All', val: 'ALL' },
                { label: 'Shift 1', val: 'Shift-1' },
                { label: 'Shift 2', val: 'Shift-2' }
              ].map(shift => (
                <button
                  key={shift.val}
                  onClick={() => setSelectedShift(shift.val)}
                  className={`py-1.5 rounded-lg transition ${
                    selectedShift === shift.val
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {shift.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Papers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPapers.map((paper) => (
          <div
            key={paper.id}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between hover:shadow-lg hover:border-blue-500/40 transition group"
          >
            <div className="space-y-3">
              {/* Badges */}
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                  paper.state === 'AP' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                }`}>
                  {paper.state} EAMCET {paper.year}
                </span>

                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {paper.shift}
                </span>
              </div>

              {/* Title */}
              <h2 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-blue-600 transition">
                {paper.title}
              </h2>

              {/* Specs */}
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>{paper.durationMins} Mins (3 Hrs)</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{paper.questionsCount} Questions</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Languages className="w-3.5 h-3.5 text-indigo-500" />
                  <span>English & Telugu</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                  <span>Avg Score: {paper.avgScore}/160</span>
                </div>
              </div>
            </div>

            {/* Launch Button */}
            <div className="pt-6 mt-4 border-t border-slate-100 dark:border-slate-800/80">
              <Link
                href={`/exam/${paper.id}`}
                className="w-full inline-flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-sm group-hover:shadow transition"
              >
                <span>Take Full CBT Exam</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {filteredPapers.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <BookOpen className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-white">No papers found matching filters</h3>
          <p className="text-xs text-slate-500 mt-1">Try selecting &quot;All States&quot; or &quot;All Years&quot; to see available question papers.</p>
        </div>
      )}

      {/* Responsive AdSense banner */}
      <AdBanner format="horizontal" />
    </div>
  );
}
