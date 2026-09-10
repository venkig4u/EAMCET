'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  HelpCircle, 
  FileText, 
  Send, 
  Bookmark, 
  Languages, 
  Maximize2, 
  Minimize2, 
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  Menu
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { generateExamPaper, parsePaperConfig } from '@/lib/data/sampleQuestions';
import { isSupabaseConfigured, fetchQuestions } from '@/lib/supabase';
import { saveTestAttempt, toggleBookmark, isBookmarked, getUserProfile, predictEamcetRank } from '@/lib/storage';
import { Question, QuestionStatus, UserResponse, TestAttempt, SubjectType } from '@/types';

export default function CbtExamPage() {
  const params = useParams();
  const router = useRouter();
  const paperId = (params?.id as string) || 'eamcet-2024';

  // 1. Initial 0-latency question payload (Full 160 Questions)
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const advancingRef = useRef(false); // guard against double-advance

  // 2. State tracking per question
  const [userResponses, setUserResponses] = useState<Record<string, UserResponse>>({});
  const [currentSelection, setCurrentSelection] = useState<number | null>(null);

  // 3. Exam Timer (duration set dynamically from paper config)
  const [timeLeft, setTimeLeft] = useState(10800);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showPaperModal, setShowPaperModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [language, setLanguage] = useState<'EN' | 'TE'>('EN');
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [questionBookmarks, setQuestionBookmarks] = useState<Record<string, boolean>>({});

  // Initialize Exam Questions & Initial User Responses
  useEffect(() => {
    async function loadExamPaper() {
      const config = parsePaperConfig(paperId);
      let paper: Question[] = [];

      if (isSupabaseConfigured) {
        const filterOpts = config.subject !== 'ALL'
          ? { subject: config.subject, limit: config.totalCount }
          : { limit: config.totalCount };
        const dbQs = await fetchQuestions(filterOpts);
        if (dbQs && dbQs.length >= 5) {
          paper = dbQs;
        }
      }

      if (paper.length === 0) {
        paper = generateExamPaper(paperId);
      }

      setQuestions(paper);
      setTimeLeft(config.durationMinutes * 60);

      const initialResponses: Record<string, UserResponse> = {};
      const initialBookmarks: Record<string, boolean> = {};

      paper.forEach((q, idx) => {
        initialResponses[q.question_id] = {
          selectedOption: null,
          status: idx === 0 ? 'NOT_ANSWERED' : 'NOT_VISITED',
          timeSpentSeconds: 0
        };
        initialBookmarks[q.question_id] = isBookmarked(q.question_id);
      });

      setUserResponses(initialResponses);
      setQuestionBookmarks(initialBookmarks);
    }

    loadExamPaper();
  }, [paperId]);

  // Load selection when current question changes
  useEffect(() => {
    if (questions.length > 0 && questions[currentIndex]) {
      const qId = questions[currentIndex].question_id;
      const resp = userResponses[qId];
      setCurrentSelection(resp?.selectedOption ?? null);

      // If question was NOT_VISITED, mark as NOT_ANSWERED upon viewing
      if (resp?.status === 'NOT_VISITED') {
        setUserResponses(prev => ({
          ...prev,
          [qId]: { ...prev[qId], status: 'NOT_ANSWERED' }
        }));
      }
    }
  }, [currentIndex, questions]);

  // Countdown timer loop with auto-submit
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [questions, userResponses]);

  // Format seconds to HH:MM:SS
  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQ = questions[currentIndex];

  // Subject Range definitions (Official EAMCET standard)
  const sections: { name: SubjectType; range: [number, number]; label: string }[] = [
    { name: 'Mathematics', range: [0, 79], label: 'Section A: Mathematics (Q1-80)' },
    { name: 'Physics', range: [80, 119], label: 'Section B: Physics (Q81-120)' },
    { name: 'Chemistry', range: [120, 159], label: 'Section C: Chemistry (Q121-160)' },
  ];

  const currentSection = sections.find(
    sec => currentIndex >= sec.range[0] && currentIndex <= sec.range[1]
  ) || sections[0];

  // Action: Option selected → save response & auto-advance to next question
  const handleOptionSelect = (idx: number) => {
    if (!currentQ || advancingRef.current) return; // prevent double-fire
    const qId = currentQ.question_id;
    setCurrentSelection(idx);
    setUserResponses(prev => ({
      ...prev,
      [qId]: { ...prev[qId], selectedOption: idx, status: 'ANSWERED' }
    }));
    if (currentIndex < questions.length - 1) {
      advancingRef.current = true;
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        advancingRef.current = false;
      }, 480);
    }
  };

  // Action: Save & Next (manual button)
  const handleSaveAndNext = () => {
    if (!currentQ) return;
    const qId = currentQ.question_id;
    const status: QuestionStatus = currentSelection !== null ? 'ANSWERED' : 'NOT_ANSWERED';
    setUserResponses(prev => ({
      ...prev,
      [qId]: { ...prev[qId], selectedOption: currentSelection, status }
    }));
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  // Action: Clear Response
  const handleClearResponse = () => {
    if (!currentQ) return;
    const qId = currentQ.question_id;
    setCurrentSelection(null);

    setUserResponses(prev => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        selectedOption: null,
        status: 'NOT_ANSWERED'
      }
    }));
  };

  // Action: Mark for Review & Next
  const handleMarkForReviewAndNext = () => {
    if (!currentQ) return;
    const qId = currentQ.question_id;
    const status: QuestionStatus = currentSelection !== null 
      ? 'ANSWERED_AND_MARKED_FOR_REVIEW' 
      : 'MARKED_FOR_REVIEW';

    setUserResponses(prev => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        selectedOption: currentSelection,
        status
      }
    }));

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  // Jump directly to a question
  const handleJumpToQuestion = (index: number) => {
    setCurrentIndex(index);
  };

  // Palette Status Counts
  const paletteCounts = useMemo(() => {
    let answered = 0;
    let notAnswered = 0;
    let notVisited = 0;
    let markedForReview = 0;
    let answeredAndMarked = 0;

    Object.values(userResponses).forEach(resp => {
      switch (resp.status) {
        case 'ANSWERED':
          answered++;
          break;
        case 'NOT_ANSWERED':
          notAnswered++;
          break;
        case 'NOT_VISITED':
          notVisited++;
          break;
        case 'MARKED_FOR_REVIEW':
          markedForReview++;
          break;
        case 'ANSWERED_AND_MARKED_FOR_REVIEW':
          answeredAndMarked++;
          break;
      }
    });

    return { answered, notAnswered, notVisited, markedForReview, answeredAndMarked };
  }, [userResponses]);

  // Submit and route to analysis
  const handleSubmitExam = () => {
    setIsSubmitting(true);

    // Calculate score
    let totalScore = 0;
    const subjectScores: Record<string, { score: number; total: number; correct: number; incorrect: number; unattempted: number }> = {
      Mathematics: { score: 0, total: 80, correct: 0, incorrect: 0, unattempted: 0 },
      Physics: { score: 0, total: 40, correct: 0, incorrect: 0, unattempted: 0 },
      Chemistry: { score: 0, total: 40, correct: 0, incorrect: 0, unattempted: 0 }
    };

    questions.forEach((q) => {
      const resp = userResponses[q.question_id];
      const subj = q.subject;

      // In EAMCET: Answered OR Answered & Marked for Review are evaluated!
      const isConsidered = resp && (resp.status === 'ANSWERED' || resp.status === 'ANSWERED_AND_MARKED_FOR_REVIEW') && resp.selectedOption !== null;

      if (isConsidered) {
        if (resp.selectedOption === q.correct_option) {
          totalScore += 1;
          if (subjectScores[subj]) {
            subjectScores[subj].score += 1;
            subjectScores[subj].correct += 1;
          }
        } else {
          if (subjectScores[subj]) {
            subjectScores[subj].incorrect += 1;
          }
        }
      } else {
        if (subjectScores[subj]) {
          subjectScores[subj].unattempted += 1;
        }
      }
    });

    const rankInfo = predictEamcetRank(totalScore);
    const attemptId = `attempt-${Date.now()}`;
    const timeTaken = 10800 - timeLeft;

    const attempt: TestAttempt = {
      attempt_id: attemptId,
      user_id: 'usr-student-001',
      test_title: 'AP/TS EAMCET CBT Full Length Mock Paper',
      test_type: 'PYQ',
      total_score: totalScore,
      max_marks: 160,
      subject_scores: subjectScores,
      user_answers: userResponses,
      time_taken_seconds: timeTaken,
      rank_estimate: rankInfo.estimatedRank,
      created_at: new Date().toISOString()
    };

    saveTestAttempt(attempt);
    router.push(`/analysis/${attemptId}`);
  };

  const handleToggleBookmark = (qId: string) => {
    const isNow = toggleBookmark(qId);
    setQuestionBookmarks(prev => ({ ...prev, [qId]: isNow }));
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (!currentQ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold tracking-wide">Loading 160 EAMCET CBT Questions Payload...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 font-sans select-none overflow-x-hidden">
      {/* 1. Official CBT Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 px-4 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-blue-600 font-black flex items-center justify-center text-sm shadow">
            CBT
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-100 line-clamp-1">
              AP & TS EAMCET (EAPCET) 2026 - ONLINE COMPUTER BASED TEST (CBT)
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">
              Test ID: <span className="text-cyan-400">{paperId}</span> • Stream: Engineering (MPC) • Marks: 160
            </p>
          </div>
        </div>

        {/* Header Right: Language, Fullscreen & Live Timer */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Bilingual Switcher */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-xs font-bold">
            <button
              onClick={() => setLanguage('EN')}
              className={`px-2.5 py-1 rounded ${language === 'EN' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('TE')}
              className={`px-2.5 py-1 rounded ${language === 'TE' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`}
            >
              తెలుగు
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hidden sm:block"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Official Countdown Timer */}
          <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-mono text-sm font-bold border shadow-xs ${
            timeLeft < 300 
              ? 'bg-red-950/80 border-red-500 text-red-300 animate-pulse' 
              : timeLeft < 1800 
              ? 'bg-amber-950/80 border-amber-500 text-amber-300' 
              : 'bg-slate-800 border-slate-700 text-emerald-400'
          }`}>
            <Clock className="w-4 h-4" />
            <div className="text-right">
              <span className="block text-[9px] uppercase tracking-wider text-slate-400 leading-none">Time Remaining</span>
              <span className="text-sm sm:text-base font-extrabold">{formatTimer(timeLeft)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Section Navigation Bar */}
      <div className="bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 px-4 py-1.5 flex flex-wrap items-center justify-between text-xs gap-2">
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-1">
          <span className="font-bold text-slate-600 dark:text-slate-400 text-[11px] mr-1 uppercase">Sections:</span>
          {sections.map(sec => {
            const isActive = currentSection.name === sec.name;
            const rangeQuestions = questions.slice(sec.range[0], sec.range[1] + 1);
            const answeredCount = rangeQuestions.filter(
              q => userResponses[q.question_id]?.status === 'ANSWERED' || userResponses[q.question_id]?.status === 'ANSWERED_AND_MARKED_FOR_REVIEW'
            ).length;

            return (
              <button
                key={sec.name}
                onClick={() => setCurrentIndex(sec.range[0])}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-2 whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>{sec.name}</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                  isActive ? 'bg-blue-800 text-cyan-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>
                  {answeredCount}/{rangeQuestions.length}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowInstructionsModal(true)}
            className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-semibold flex items-center space-x-1"
          >
            <Info className="w-3.5 h-3.5 text-blue-500" />
            <span>Instructions</span>
          </button>
          <button
            onClick={() => setShowPaperModal(true)}
            className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-semibold flex items-center space-x-1"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-500" />
            <span>Question Paper</span>
          </button>
          <button
            onClick={() => setPaletteCollapsed(!paletteCollapsed)}
            className="p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 lg:hidden"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3. Main Examination Viewport + Palette Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Center: Question Viewport & Action Controls */}
        <div className="flex-1 flex flex-col justify-between bg-white dark:bg-slate-900 overflow-y-auto">
          {/* Question Meta Strip */}
          <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center space-x-3">
              <span className="font-extrabold text-slate-900 dark:text-white text-base">
                Question No. {currentIndex + 1}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                {currentQ.subject}
              </span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                {currentQ.topic}
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleToggleBookmark(currentQ.question_id)}
                className={`flex items-center space-x-1 text-xs font-semibold px-2 py-1 rounded transition ${
                  questionBookmarks[currentQ.question_id]
                    ? 'text-amber-600 bg-amber-50 dark:bg-amber-950'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${questionBookmarks[currentQ.question_id] ? 'fill-amber-500 text-amber-500' : ''}`} />
                <span>Bookmark</span>
              </button>

              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Marks: <span className="text-emerald-600">+1</span> • Negative: <span className="text-slate-400">0</span>
              </div>
            </div>
          </div>

          {/* Question Text & Options Content — key causes remount+fadeIn on each new question */}
          <div key={currentIndex} className="p-6 sm:p-8 space-y-6 flex-1 question-fade-in">
            {/* Primary Question Text (English & Telugu based on language preference) */}
            <div className="text-base font-semibold text-slate-900 dark:text-white leading-relaxed space-y-3">
              {language === 'EN' ? (
                <div>
                  <MathRenderer content={currentQ.question_text_en} />
                </div>
              ) : (
                <div className="font-telugu text-slate-900 dark:text-slate-100">
                  <MathRenderer content={currentQ.question_text_te} />
                </div>
              )}

              {/* Show alternate language subtext in bilingual mode */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-500 font-medium">
                {language === 'EN' ? (
                  <div className="font-telugu">
                    <span className="font-bold text-blue-600 mr-1">[తెలుగు]:</span>
                    <MathRenderer content={currentQ.question_text_te} inline />
                  </div>
                ) : (
                  <div>
                    <span className="font-bold text-blue-600 mr-1">[English]:</span>
                    <MathRenderer content={currentQ.question_text_en} inline />
                  </div>
                )}
              </div>
            </div>

            {/* 4 Options Grid */}
            <div className="space-y-3 pt-4">
              {(language === 'EN' ? currentQ.options_en : currentQ.options_te).map((opt, idx) => {
                const isSelected = currentSelection === idx;
                return (
                  <label
                    key={idx}
                    onClick={() => handleOptionSelect(idx)}
                    className={`flex items-center space-x-3 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-semibold ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-option-${currentQ.question_id}`}
                      checked={isSelected}
                      readOnly
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 pointer-events-none"
                    />
                    <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div className="flex-1 text-sm">
                      <MathRenderer content={opt} inline />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 4. Official CBT Action Control Footer */}
          <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 px-6 flex flex-wrap items-center justify-between gap-3">
            {/* Left Controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleMarkForReviewAndNext}
                className="px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition shadow-xs"
              >
                Mark for Review & Next
              </button>
              <button
                onClick={handleClearResponse}
                className="px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-semibold text-xs transition"
              >
                Clear Response
              </button>
            </div>

            {/* Center Navigation */}
            <div className="flex items-center space-x-2">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(prev => prev - 1)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-bold text-xs disabled:opacity-30 transition flex items-center space-x-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <button
                disabled={currentIndex === questions.length - 1}
                onClick={() => setCurrentIndex(prev => prev + 1)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-bold text-xs disabled:opacity-30 transition flex items-center space-x-1"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Primary Action Right */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSaveAndNext}
                className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md hover:shadow-lg transition transform hover:-translate-y-0.5"
              >
                Save & Next →
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Official Collapsible Question Palette (TCS iON pattern) */}
        <aside className={`${
          paletteCollapsed ? 'hidden' : 'flex'
        } lg:flex flex-col w-80 bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 p-4 space-y-4 overflow-y-auto`}>
          {/* Candidate Profile Tile */}
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="w-11 h-11 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow">
              VS
            </div>
            <div className="text-xs">
              <div className="font-bold text-slate-900 dark:text-white">Venkata Sai Kumar</div>
              <div className="text-slate-500 font-mono text-[11px]">HT: 2604A08921</div>
              <div className="text-emerald-600 font-semibold text-[10px]">C04-LAB-02 • Active</div>
            </div>
          </div>

          {/* Official 5 Status Legends with Real-Time Counters */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 cbt-btn-answered flex items-center justify-center font-bold text-xs">
                  {paletteCounts.answered}
                </span>
                <span className="text-slate-700 dark:text-slate-300">Answered</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 cbt-btn-not-answered flex items-center justify-center font-bold text-xs">
                  {paletteCounts.notAnswered}
                </span>
                <span className="text-slate-700 dark:text-slate-300">Not Answered</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 cbt-btn-not-visited flex items-center justify-center font-bold text-xs">
                  {paletteCounts.notVisited}
                </span>
                <span className="text-slate-700 dark:text-slate-300">Not Visited</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 cbt-btn-review flex items-center justify-center font-bold text-xs">
                  {paletteCounts.markedForReview}
                </span>
                <span className="text-slate-700 dark:text-slate-300">Marked for Review</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="w-6 h-6 cbt-btn-review-answered flex items-center justify-center font-bold text-xs">
                {paletteCounts.answeredAndMarked}
              </span>
              <span className="text-slate-700 dark:text-slate-300 leading-tight">
                Answered & Marked for Review (Evaluated)
              </span>
            </div>
          </div>

          {/* Question Palette Section Filter */}
          <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
            <span>{currentSection.name} Palette</span>
            <span className="text-slate-400 font-normal">
              Q{currentSection.range[0] + 1} - Q{currentSection.range[1] + 1}
            </span>
          </div>

          {/* Interactive Question Grid */}
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs max-h-80 overflow-y-auto">
            <div className="grid grid-cols-5 gap-2">
              {questions.slice(currentSection.range[0], currentSection.range[1] + 1).map((q, localIdx) => {
                const globalIndex = currentSection.range[0] + localIdx;
                const status = userResponses[q.question_id]?.status || 'NOT_VISITED';
                const isCurrent = currentIndex === globalIndex;

                let btnClass = 'cbt-btn-not-visited';
                if (status === 'ANSWERED') btnClass = 'cbt-btn-answered';
                else if (status === 'NOT_ANSWERED') btnClass = 'cbt-btn-not-answered';
                else if (status === 'MARKED_FOR_REVIEW') btnClass = 'cbt-btn-review';
                else if (status === 'ANSWERED_AND_MARKED_FOR_REVIEW') btnClass = 'cbt-btn-review-answered';

                return (
                  <button
                    key={q.question_id}
                    onClick={() => handleJumpToQuestion(globalIndex)}
                    className={`w-9 h-9 text-xs font-bold transition flex items-center justify-center relative ${btnClass} ${
                      isCurrent ? 'ring-2 ring-yellow-400 ring-offset-2 dark:ring-offset-slate-900 scale-105' : ''
                    }`}
                  >
                    {globalIndex + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Test Button */}
          <div className="pt-2">
            <button
              onClick={() => setShowSubmitModal(true)}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-extrabold text-sm shadow-md transition flex items-center justify-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Submit Entire Exam</span>
            </button>
          </div>
        </aside>
      </div>

      {/* MODAL 1: Submit Exam Confirmation Dialog */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>Submit Exam Confirmation</span>
              </h3>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to submit? Here is your overall test attempt summary across all 3 sections:
            </p>

            {/* Summary Matrix Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                  <tr>
                    <th className="p-2.5">Section</th>
                    <th className="p-2.5 text-center">Total</th>
                    <th className="p-2.5 text-center text-emerald-600">Answered</th>
                    <th className="p-2.5 text-center text-purple-600">Review</th>
                    <th className="p-2.5 text-center text-red-600">Unanswered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sections.map(sec => {
                    const secQuestions = questions.slice(sec.range[0], sec.range[1] + 1);
                    const ans = secQuestions.filter(q => userResponses[q.question_id]?.status === 'ANSWERED').length;
                    const rev = secQuestions.filter(q => userResponses[q.question_id]?.status === 'MARKED_FOR_REVIEW' || userResponses[q.question_id]?.status === 'ANSWERED_AND_MARKED_FOR_REVIEW').length;
                    const unans = secQuestions.length - ans;

                    return (
                      <tr key={sec.name}>
                        <td className="p-2.5 font-bold">{sec.name}</td>
                        <td className="p-2.5 text-center">{secQuestions.length}</td>
                        <td className="p-2.5 text-center font-bold text-emerald-600">{ans}</td>
                        <td className="p-2.5 text-center font-bold text-purple-600">{rev}</td>
                        <td className="p-2.5 text-center font-bold text-red-500">{unans}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 dark:bg-slate-800/60 font-black">
                    <td className="p-2.5">Total (160 Marks)</td>
                    <td className="p-2.5 text-center">160</td>
                    <td className="p-2.5 text-center text-emerald-600">{paletteCounts.answered}</td>
                    <td className="p-2.5 text-center text-purple-600">{paletteCounts.markedForReview + paletteCounts.answeredAndMarked}</td>
                    <td className="p-2.5 text-center text-red-500">{paletteCounts.notAnswered + paletteCounts.notVisited}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Return to Exam
              </button>
              <button
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition disabled:opacity-50"
              >
                {isSubmitting ? 'Evaluating Score...' : 'Confirm Final Submission 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Question Paper Full View */}
      {showPaperModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full h-[85vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Complete Question Paper View (160 Questions)</span>
              </h3>
              <button onClick={() => setShowPaperModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {questions.map((q, idx) => (
                <div key={q.question_id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between font-bold text-blue-600">
                    <span>Q{idx + 1}. {q.subject} • {q.topic}</span>
                    <span>1 Mark</span>
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    <MathRenderer content={language === 'EN' ? q.question_text_en : q.question_text_te} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-slate-600 dark:text-slate-400">
                    {(language === 'EN' ? q.options_en : q.options_te).map((opt, oIdx) => (
                      <div key={oIdx} className="p-2 rounded bg-slate-50 dark:bg-slate-800/60">
                        {String.fromCharCode(65 + oIdx)}) <MathRenderer content={opt} inline />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Official Instructions */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                <Info className="w-4 h-4 text-blue-600" />
                <span>AP & TS EAMCET Official Exam Guidelines</span>
              </h3>
              <button onClick={() => setShowInstructionsModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
              <p>1. Total test duration is <strong>180 minutes (3 Hours)</strong>. The clock counts down automatically from 180:00.</p>
              <p>2. The test contains <strong>160 objective-type multiple-choice questions</strong>:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Mathematics: 80 Questions (80 Marks)</li>
                <li>Physics: 40 Questions (40 Marks)</li>
                <li>Chemistry: 40 Questions (40 Marks)</li>
              </ul>
              <p>3. <strong>Marking Scheme:</strong> Each correct answer carries <strong>+1 mark</strong>. There is <strong>NO NEGATIVE MARKING</strong> in EAMCET.</p>
              <p>4. <strong>Palette Colors Legend:</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-emerald-600">Green:</strong> Answered</li>
                <li><strong className="text-red-500">Red:</strong> Visited but not answered</li>
                <li><strong className="text-slate-400">Grey:</strong> Not visited yet</li>
                <li><strong className="text-purple-600">Purple:</strong> Marked for review</li>
                <li><strong className="text-purple-700 font-bold">Purple with Green Dot:</strong> Answered and marked for review (WILL be evaluated).</li>
              </ul>
              <p>5. Zero ads are shown inside the active examination portal to adhere strictly to exam integrity standards.</p>
            </div>

            <button
              onClick={() => setShowInstructionsModal(false)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow"
            >
              I Understand, Continue Exam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
