'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Zap, 
  Flame, 
  Trophy, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Play, 
  RotateCcw, 
  ArrowRight,
  Sparkles,
  Medal,
  Users
} from 'lucide-react';
import confetti from 'canvas-confetti';
import MathRenderer from '@/components/MathRenderer';
import AdBanner from '@/components/AdBanner';
import { SAMPLE_QUESTIONS } from '@/lib/data/sampleQuestions';
import { getUserProfile, saveUserProfile } from '@/lib/storage';
import { fetchQuestions } from '@/lib/supabase';
import { Question } from '@/types';

interface LeaderboardEntry {
  rank: number;
  name: string;
  location: string;
  score: number;
  timeSeconds: number;
  avatar: string;
}

const DAILY_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, name: 'Sai Teja Reddy', location: 'Hyderabad (TS)', score: 10, timeSeconds: 142, avatar: '👨‍🎓' },
  { rank: 2, name: 'Ananya Sharma', location: 'Visakhapatnam (AP)', score: 10, timeSeconds: 168, avatar: '👩‍🎓' },
  { rank: 3, name: 'K. Karthik', location: 'Vijayawada (AP)', score: 10, timeSeconds: 195, avatar: '🧑‍🎓' },
  { rank: 4, name: 'M. Sravani', location: 'Warangal (TS)', score: 9, timeSeconds: 155, avatar: '👩‍💻' },
  { rank: 5, name: 'Rahul Varma', location: 'Tirupati (AP)', score: 9, timeSeconds: 180, avatar: '👨‍💻' },
  { rank: 6, name: 'Deepika Rao', location: 'Guntur (AP)', score: 9, timeSeconds: 210, avatar: '👩‍🎓' },
  { rank: 7, name: 'P. Akhil', location: 'Karimnagar (TS)', score: 8, timeSeconds: 175, avatar: '🧑‍💻' },
  { rank: 8, name: 'Sujatha B.', location: 'Kurnool (AP)', score: 8, timeSeconds: 190, avatar: '👩‍🎓' },
];

export default function SpeedChallengePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'COMPLETED'>('IDLE');
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [userScore, setUserScore] = useState(0);
  const [language, setLanguage] = useState<'EN' | 'TE'>('EN');

  useEffect(() => {
    async function loadChallengeQuestions() {
      const qList = await fetchQuestions({ limit: 30 });
      const shuffled = [...qList].sort(() => 0.5 - Math.random()).slice(0, 10);
      setQuestions(shuffled);
    }
    loadChallengeQuestions();
  }, []);

  // Timer loop
  useEffect(() => {
    let timer: any;
    if (gameState === 'PLAYING' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleCompleteChallenge();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  const handleStart = () => {
    setTimeLeft(300);
    setSelectedAnswers({});
    setCurrentIndex(0);
    setGameState('PLAYING');
  };

  const handleSelectOption = (optIndex: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [currentIndex]: optIndex
    }));
  };

  const handleCompleteChallenge = () => {
    setGameState('COMPLETED');

    let score = 0;
    questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correct_option) {
        score += 1;
      }
    });
    setUserScore(score);

    // Increment streak in storage
    const profile = getUserProfile();
    profile.streak_count += 1;
    profile.total_questions_solved += 10;
    saveUserProfile(profile);

    // Fire celebratory confetti if score is high
    if (score >= 6) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 text-white p-6 sm:p-8 shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-black uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            <span>Daily AP & TS Speed Drill</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Daily 10-Question Speed Sprint
          </h1>
          <p className="text-sm text-amber-100">
            Boost calculation agility and pattern recognition under time pressure. Solve 10 questions in 5 minutes to level up your daily study streak!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Interactive Challenge Arena */}
        <div className="lg:col-span-2 space-y-6">
          {gameState === 'IDLE' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-6 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto text-3xl shadow-inner">
                ⚡
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Ready for Today&apos;s Sprint?</h2>
                <p className="text-xs text-slate-500">
                  10 curated questions across Maths, Physics & Chemistry. 30 seconds average per question. No negative marks!
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto py-4">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                  <Clock className="w-5 h-5 mx-auto text-blue-500 mb-1" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">5 Minutes</span>
                  <p className="text-[10px] text-slate-400">Total Duration</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                  <Award className="w-5 h-5 mx-auto text-amber-500 mb-1" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">10 Marks</span>
                  <p className="text-[10px] text-slate-400">1 Mark each</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                  <Flame className="w-5 h-5 mx-auto text-orange-500 mb-1" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">+1 Streak</span>
                  <p className="text-[10px] text-slate-400">On completion</p>
                </div>
              </div>

              <button
                onClick={handleStart}
                className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-orange-500/25 transition transform hover:scale-105"
              >
                Start 5-Minute Sprint Now 🚀
              </button>
            </div>
          )}

          {gameState === 'PLAYING' && questions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              {/* Question Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold text-xs rounded-lg">
                    Question {currentIndex + 1} of 10
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {questions[currentIndex]?.subject}
                  </span>
                </div>

                <div className="flex items-center space-x-3">
                  {/* Language Switcher */}
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-bold">
                    <button
                      onClick={() => setLanguage('EN')}
                      className={`px-2 py-0.5 rounded ${language === 'EN' ? 'bg-white dark:bg-slate-700 text-blue-600' : 'text-slate-500'}`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => setLanguage('TE')}
                      className={`px-2 py-0.5 rounded ${language === 'TE' ? 'bg-white dark:bg-slate-700 text-blue-600' : 'text-slate-500'}`}
                    >
                      తెలుగు
                    </button>
                  </div>

                  {/* Countdown Timer */}
                  <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-mono text-xs font-bold ${
                    timeLeft < 60 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTime(timeLeft)}</span>
                  </div>
                </div>
              </div>

              {/* Question Text */}
              <div className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                <MathRenderer
                  content={
                    language === 'EN' 
                      ? questions[currentIndex]?.question_text_en 
                      : questions[currentIndex]?.question_text_te
                  }
                />
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {(language === 'EN' ? questions[currentIndex]?.options_en : questions[currentIndex]?.options_te)?.map((opt, oIdx) => {
                  const isSelected = selectedAnswers[currentIndex] === oIdx;
                  return (
                    <button
                      key={oIdx}
                      onClick={() => handleSelectOption(oIdx)}
                      className={`p-3.5 rounded-xl border text-left text-xs font-medium transition flex items-center space-x-3 ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                      }`}>
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                      <div className="flex-1">
                        <MathRenderer content={opt} inline />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Bottom Nav Controls */}
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex(prev => prev - 1)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                >
                  ← Previous
                </button>

                <div className="flex space-x-2">
                  {currentIndex < 9 ? (
                    <button
                      onClick={() => setCurrentIndex(prev => prev + 1)}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      onClick={handleCompleteChallenge}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md"
                    >
                      Submit Sprint 🏁
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {gameState === 'COMPLETED' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-6 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl">
                {userScore >= 8 ? '🏆' : userScore >= 5 ? '🎯' : '💪'}
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Sprint Completed!</h2>
                <p className="text-xs text-slate-500">
                  You scored <span className="font-bold text-emerald-600">{userScore} out of 10</span> in {formatTime(300 - timeLeft)}
                </p>
              </div>

              {/* Score Badges */}
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 max-w-sm mx-auto flex items-center justify-center space-x-3">
                <Flame className="w-6 h-6 text-amber-500 fill-amber-500" />
                <div className="text-left text-xs font-bold text-amber-800 dark:text-amber-200">
                  Daily Streak Extended!
                  <span className="block font-normal text-[11px] text-amber-600">Keep it up tomorrow for bonus rewards</span>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button
                  onClick={handleStart}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 font-bold text-xs text-slate-700 dark:text-slate-300 flex items-center space-x-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Retry Challenge</span>
                </button>

                <Link
                  href="/practice"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition flex items-center space-x-1.5"
                >
                  <span>Practice Weak Chapters</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Live Today Leaderboard */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Today&apos;s Leaderboard</h3>
              </div>
              <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                Live State Rank
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {DAILY_LEADERBOARD.map((item) => (
                <div key={item.rank} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <span className={`w-5 font-black text-center ${
                      item.rank === 1 ? 'text-amber-500 text-sm' : item.rank === 2 ? 'text-slate-400 text-sm' : item.rank === 3 ? 'text-amber-700 text-sm' : 'text-slate-400 text-xs'
                    }`}>
                      {item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : `#${item.rank}`}
                    </span>
                    <span className="text-base">{item.avatar}</span>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">{item.name}</div>
                      <div className="text-[10px] text-slate-400">{item.location}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-extrabold text-blue-600 dark:text-blue-400">{item.score}/10</span>
                    <span className="block text-[10px] text-slate-400">{item.timeSeconds}s</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AdBanner format="horizontal" />
    </div>
  );
}
