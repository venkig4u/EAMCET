'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Trophy, 
  Flame, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  BookMarked, 
  Zap, 
  ArrowRight, 
  PlayCircle, 
  BarChart3, 
  Award, 
  ExternalLink,
  Target,
  Sparkles,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { getUserProfile, getTestAttempts, getBookmarks } from '@/lib/storage';
import { UserProfile, TestAttempt, Question } from '@/types';
import { SAMPLE_QUESTIONS } from '@/lib/data/sampleQuestions';
import AdBanner from '@/components/AdBanner';
import MathRenderer from '@/components/MathRenderer';

export default function StudentDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [activeBookmarkTab, setActiveBookmarkTab] = useState<'All' | 'Mathematics' | 'Physics' | 'Chemistry'>('All');

  useEffect(() => {
    setProfile(getUserProfile());
    setAttempts(getTestAttempts());
    setBookmarkedIds(getBookmarks());
  }, []);

  const bookmarkedQuestions = SAMPLE_QUESTIONS.filter(q => bookmarkedIds.includes(q.question_id));
  const filteredBookmarks = activeBookmarkTab === 'All' 
    ? bookmarkedQuestions 
    : bookmarkedQuestions.filter(q => q.subject === activeBookmarkTab);

  const averageScore = attempts.length > 0
    ? Math.round(attempts.reduce((sum, a) => sum + a.total_score, 0) / attempts.length)
    : 112;

  const totalTests = attempts.length > 0 ? attempts.length : 3;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 sm:p-8 shadow-xl border border-blue-800/50">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-20 -top-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-800/60 border border-blue-600/40 text-xs font-semibold text-blue-200">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Target: AP & TS EAMCET 2026</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Welcome back, {profile?.name || 'Aspirant'}! 👋
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Hall Ticket: <span className="font-mono text-cyan-300 font-semibold">{profile?.hall_ticket_no || '2604A08921'}</span> • Target Stream: <span className="text-white font-medium">Engineering (MPC)</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/exam/pyq-ap-2024-shift1"
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 transition transform hover:-translate-y-0.5"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Launch 160Q CBT Mock</span>
            </Link>
            <Link
              href="/speed-challenge"
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm transition"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Daily 10Q Sprint</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Metric 1: Current Streak */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-amber-400/50 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Study Streak</span>
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Flame className="w-5 h-5 fill-amber-500 text-amber-500" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {profile?.streak_count || 5} <span className="text-base font-normal text-slate-500">Days</span>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium flex items-center">
            <TrendingUp className="w-3.5 h-3.5 mr-1 inline" /> Next badge at 7 days!
          </p>
        </div>

        {/* Metric 2: Average Score */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-blue-400/50 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Mock Score</span>
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {averageScore} <span className="text-sm font-normal text-slate-400">/ 160</span>
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" /> Above State Cutoff (40 marks)
          </p>
        </div>

        {/* Metric 3: Est. Rank Bracket */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-indigo-400/50 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estimated Rank</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
            1,200 - 3,500
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            Top Tier College Admission Safe
          </p>
        </div>

        {/* Metric 4: Solved Questions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-cyan-400/50 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Questions Solved</span>
            <div className="w-9 h-9 rounded-xl bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {profile?.total_questions_solved || 340}
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            {profile?.accuracy_rate || 76.5}% Accuracy Rate
          </p>
        </div>
      </div>

      {/* Main Grid: Subject Mastery & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Subject Accuracy Analytics & Recent Attempts */}
        <div className="lg:col-span-2 space-y-8">
          {/* Subject Mastery Progress Bars */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Subject Accuracy & Weightage</h2>
                <p className="text-xs text-slate-500">Based on recent chapter drills and full mock attempts</p>
              </div>
              <Link href="/practice" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center">
                Practice Weak Areas <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </div>

            <div className="space-y-4">
              {/* Mathematics */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-800 dark:text-slate-200 flex items-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 mr-2"></span>
                    Mathematics (80 Questions / 80 Marks)
                  </span>
                  <span className="text-blue-600 font-bold">78% Accuracy</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500" style={{ width: '78%' }} />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Strong: Calculus, Matrices</span>
                  <span>Needs Practice: 3D Vectors</span>
                </div>
              </div>

              {/* Physics */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-800 dark:text-slate-200 flex items-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2"></span>
                    Physics (40 Questions / 40 Marks)
                  </span>
                  <span className="text-emerald-600 font-bold">71% Accuracy</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-400 to-teal-600 h-3 rounded-full transition-all duration-500" style={{ width: '71%' }} />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Strong: Thermodynamics, Optics</span>
                  <span>Needs Practice: Rotational Dynamics</span>
                </div>
              </div>

              {/* Chemistry */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-800 dark:text-slate-200 flex items-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2"></span>
                    Chemistry (40 Questions / 40 Marks)
                  </span>
                  <span className="text-amber-600 font-bold">82% Accuracy</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-400 to-orange-500 h-3 rounded-full transition-all duration-500" style={{ width: '82%' }} />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Strong: Organic Chemistry, Kinetics</span>
                  <span>Needs Practice: Coordination Compounds</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Test Attempts */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Test Attempts</h2>
              <span className="text-xs text-slate-500">Last 3 tests recorded</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {attempts.length > 0 ? (
                attempts.slice(0, 3).map((attempt) => (
                  <div key={attempt.attempt_id} className="py-3.5 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{attempt.test_title}</h3>
                      <p className="text-xs text-slate-400">
                        {new Date(attempt.created_at).toLocaleDateString()} • {Math.round(attempt.time_taken_seconds / 60)} mins taken
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-blue-600 dark:text-blue-400">
                          {attempt.total_score} / {attempt.max_marks}
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-600 uppercase">
                          {attempt.rank_estimate}
                        </span>
                      </div>
                      <Link
                        href={`/analysis/${attempt.attempt_id}`}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950 text-slate-600 hover:text-blue-600 transition"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="py-3.5 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">AP EAPCET 2024 Engineering - Shift 1</h3>
                      <p className="text-xs text-slate-400">Yesterday • 142 mins taken</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-blue-600 dark:text-blue-400">118 / 160</div>
                        <span className="text-[10px] font-semibold text-emerald-600">Rank: ~1,200 - 3,500</span>
                      </div>
                      <Link
                        href="/analysis/demo-attempt-01"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950 text-slate-600 hover:text-blue-600 transition"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  <div className="py-3.5 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">TS EAMCET 2023 - Shift 2 (Full Mock)</h3>
                      <p className="text-xs text-slate-400">3 days ago • 155 mins taken</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-blue-600 dark:text-blue-400">106 / 160</div>
                        <span className="text-[10px] font-semibold text-emerald-600">Rank: ~3,500 - 8,000</span>
                      </div>
                      <Link
                        href="/analysis/demo-attempt-02"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950 text-slate-600 hover:text-blue-600 transition"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Bookmarked Questions & Gamification Badges */}
        <div className="space-y-8">
          {/* Daily 10-Q Speed Sprint Card */}
          <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-6 shadow-md relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-0.5 rounded-md bg-white/20 text-xs font-bold uppercase tracking-wider">
                Daily Sprint
              </span>
              <Zap className="w-6 h-6 text-amber-200 fill-amber-200 animate-bounce" />
            </div>
            <h3 className="text-xl font-black">10 Questions in 5 Mins</h3>
            <p className="text-xs text-amber-100 mt-1 mb-4">
              Rapid calculation booster for AP & TS aspirants. Compete on today&apos;s state leaderboard!
            </p>
            <Link
              href="/speed-challenge"
              className="block text-center py-2.5 px-4 bg-white text-orange-600 hover:bg-amber-50 rounded-xl font-bold text-sm shadow transition"
            >
              Start Speed Sprint ⚡
            </Link>
          </div>

          {/* Bookmarked Questions Quick Box */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <BookMarked className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Bookmarked Questions</h3>
              </div>
              <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                {bookmarkedQuestions.length}
              </span>
            </div>

            {/* Subject Tabs */}
            <div className="flex space-x-1 border-b border-slate-200 dark:border-slate-800 pb-2 mb-3 text-xs">
              {(['All', 'Mathematics', 'Physics', 'Chemistry'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveBookmarkTab(tab)}
                  className={`px-2 py-1 rounded font-medium ${
                    activeBookmarkTab === tab
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Questions List */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {filteredBookmarks.length > 0 ? (
                filteredBookmarks.map((q) => (
                  <div key={q.question_id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 transition text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-blue-600 dark:text-blue-400">{q.subject} • {q.topic}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{q.difficulty}</span>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 line-clamp-2">
                      <MathRenderer content={q.question_text_en} inline />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">
                  No bookmarked questions in this subject. Click bookmark during any test to save tricky questions!
                </p>
              )}
            </div>
          </div>

          {/* Gamification Achievement Badges */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-3 flex items-center space-x-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              <span>Earned Badges ({profile?.badges_earned?.length || 3})</span>
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {profile?.badges_earned?.map((badge) => (
                <div
                  key={badge.id}
                  title={badge.description}
                  className="flex flex-col items-center text-center p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60"
                >
                  <span className="text-2xl mb-1">{badge.icon}</span>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 line-clamp-1">
                    {badge.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Non-exam AdSense Responsive Banner */}
      <AdBanner format="horizontal" />
    </div>
  );
}
