'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  GraduationCap, 
  Check, 
  Clock, 
  Settings2, 
  PlayCircle, 
  Sparkles, 
  Zap, 
  CheckSquare, 
  Layers, 
  ChevronRight,
  Compass
} from 'lucide-react';
import AdBanner from '@/components/AdBanner';

interface TopicItem {
  id: string;
  name: string;
  weightageMarks: number;
  availableQuestions: number;
}

const TOPICS_DATA: Record<string, TopicItem[]> = {
  Mathematics: [
    { id: 'm_calc_int', name: 'Definite & Indefinite Integrals', weightageMarks: 12, availableQuestions: 145 },
    { id: 'm_matrices', name: 'Matrices & Determinants', weightageMarks: 8, availableQuestions: 98 },
    { id: 'm_coord_circ', name: 'Coordinate Geometry - Circles & Conics', weightageMarks: 14, availableQuestions: 180 },
    { id: 'm_vectors', name: 'Vectors & 3D Geometry', weightageMarks: 10, availableQuestions: 120 },
    { id: 'm_diff_eq', name: 'Differential Equations', weightageMarks: 6, availableQuestions: 75 },
    { id: 'm_limits', name: 'Limits, Continuity & Differentiability', weightageMarks: 8, availableQuestions: 110 },
    { id: 'm_trig', name: 'Trigonometry & Inverse Trigonometry', weightageMarks: 10, availableQuestions: 130 },
    { id: 'm_prob', name: 'Probability & Statistics', weightageMarks: 6, availableQuestions: 85 }
  ],
  Physics: [
    { id: 'p_mech', name: 'Kinematics & Laws of Motion', weightageMarks: 8, availableQuestions: 125 },
    { id: 'p_thermo', name: 'Thermodynamics & Kinetic Theory', weightageMarks: 6, availableQuestions: 95 },
    { id: 'p_current', name: 'Current Electricity & Circuit Networks', weightageMarks: 7, availableQuestions: 110 },
    { id: 'p_optics', name: 'Ray Optics & Optical Instruments', weightageMarks: 5, availableQuestions: 80 },
    { id: 'p_modern', name: 'Dual Nature of Matter & Photoelectric Effect', weightageMarks: 6, availableQuestions: 90 },
    { id: 'p_magnetism', name: 'Moving Charges & Magnetism', weightageMarks: 5, availableQuestions: 85 }
  ],
  Chemistry: [
    { id: 'c_bonding', name: 'Chemical Bonding & Molecular Structure', weightageMarks: 6, availableQuestions: 115 },
    { id: 'c_electro', name: 'Electrochemistry & Solutions', weightageMarks: 7, availableQuestions: 105 },
    { id: 'c_organic', name: 'Carbonyl Compounds, Aldehydes & Ketones', weightageMarks: 8, availableQuestions: 140 },
    { id: 'c_kinetics', name: 'Chemical Kinetics & Equilibrium', weightageMarks: 6, availableQuestions: 90 },
    { id: 'c_coordination', name: 'Coordination Chemistry & d-Block', weightageMarks: 5, availableQuestions: 80 },
    { id: 'c_periodic', name: 'Periodic Properties & General Principles', weightageMarks: 4, availableQuestions: 70 }
  ]
};

export default function PracticeModePage() {
  const [selectedSubject, setSelectedSubject] = useState<'Mathematics' | 'Physics' | 'Chemistry'>('Mathematics');
  const [selectedTopics, setSelectedTopics] = useState<string[]>(['m_calc_int', 'm_matrices']);
  const [difficulty, setDifficulty] = useState<'All' | 'Easy' | 'Medium' | 'Hard'>('Medium');
  const [questionCount, setQuestionCount] = useState<number>(25);
  const [timerMode, setTimerMode] = useState<'Timed' | 'Practice'>('Timed');

  const topics = TOPICS_DATA[selectedSubject];

  const toggleTopic = (topicId: string) => {
    if (selectedTopics.includes(topicId)) {
      if (selectedTopics.length > 1) {
        setSelectedTopics(selectedTopics.filter(id => id !== topicId));
      }
    } else {
      setSelectedTopics([...selectedTopics, topicId]);
    }
  };

  const selectAllTopics = () => {
    setSelectedTopics(topics.map(t => t.id));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-cyan-900 text-white p-6 sm:p-8 shadow-md">
        <div className="max-w-3xl space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/10 text-cyan-300 text-xs font-semibold">
            <Compass className="w-3.5 h-3.5" />
            <span>Targeted Weakness Remediation</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Subject & Chapter-Wise Practice Drill
          </h1>
          <p className="text-sm text-slate-200">
            Customize topic selections, choose difficulty ratings, and practice with bilingual Telugu & English questions rendered in crisp KaTeX math.
          </p>
        </div>
      </div>

      {/* Main Builder Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Subject & Chapter Selectors */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Subject Selection */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                <span>Select Subject</span>
              </h2>
              <span className="text-xs text-slate-500 font-medium">80 Marks Maths / 40 Physics / 40 Chem</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(['Mathematics', 'Physics', 'Chemistry'] as const).map(subj => (
                <button
                  key={subj}
                  onClick={() => {
                    setSelectedSubject(subj);
                    setSelectedTopics([TOPICS_DATA[subj][0].id]);
                  }}
                  className={`p-4 rounded-xl border text-center transition flex flex-col items-center justify-center space-y-1 ${
                    selectedSubject === subj
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-extrabold shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="text-xl">
                    {subj === 'Mathematics' ? '📐' : subj === 'Physics' ? '⚡' : '🧪'}
                  </span>
                  <span className="text-sm">{subj}</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {subj === 'Mathematics' ? '80 Questions' : '40 Questions'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Topic Selection */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                <span>Select Chapters / Topics ({selectedTopics.length} selected)</span>
              </h2>
              <button
                onClick={selectAllTopics}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Select All
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topics.map(topic => {
                const isSelected = selectedTopics.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    onClick={() => toggleTopic(topic.id)}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start justify-between space-x-2 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-xs leading-tight">{topic.name}</div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center space-x-2">
                        <span>~{topic.weightageMarks} marks in EAMCET</span>
                        <span>•</span>
                        <span>{topic.availableQuestions} questions</span>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center text-[10px] ${
                      isSelected ? 'bg-blue-600 text-white' : 'border border-slate-300'
                    }`}>
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Col: Configuration & Launch Card */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 sticky top-24">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Settings2 className="w-4 h-4 text-blue-600" />
              <span>Test Configuration</span>
            </h2>

            {/* Difficulty Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wider">
                Difficulty Level
              </label>
              <div className="grid grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                {(['All', 'Easy', 'Medium', 'Hard'] as const).map(diff => (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`py-1.5 rounded-lg transition ${
                      difficulty === diff
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            {/* Question Count */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wider">
                Number of Questions
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[10, 25, 50].map(cnt => (
                  <button
                    key={cnt}
                    onClick={() => setQuestionCount(cnt)}
                    className={`py-2 px-3 rounded-xl border text-center text-xs font-bold transition ${
                      questionCount === cnt
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-600'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {cnt} Questions
                  </button>
                ))}
              </div>
            </div>

            {/* Mode: Timed vs Untimed */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wider">
                Simulation Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTimerMode('Timed')}
                  className={`p-3 rounded-xl border text-left text-xs font-semibold transition ${
                    timerMode === 'Timed'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Timed (Exam Mode)</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{questionCount * 1.125} Mins allocation</p>
                </button>

                <button
                  onClick={() => setTimerMode('Practice')}
                  className={`p-3 rounded-xl border text-left text-xs font-semibold transition ${
                    timerMode === 'Practice'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Untimed Practice</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Instant solutions & AI tutor</p>
                </button>
              </div>
            </div>

            {/* Summary Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Subject:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedSubject}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Topics:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedTopics.length} Chapters</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Bilingual Format:</span>
                <span className="font-bold text-emerald-600">English + Telugu</span>
              </div>
            </div>

            {/* Start Practice Button */}
            <Link
              href={`/exam/practice-${selectedSubject.toLowerCase()}-${questionCount}`}
              className="w-full inline-flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition"
            >
              <PlayCircle className="w-5 h-5" />
              <span>Start Custom Practice Test</span>
            </Link>
          </div>
        </div>
      </div>

      <AdBanner format="horizontal" />
    </div>
  );
}
