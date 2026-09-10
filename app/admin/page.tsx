'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Upload, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Save, 
  Trash2, 
  Eye, 
  RefreshCw,
  Copy,
  Layers,
  FileSpreadsheet,
  FileUp,
  Image as ImageIcon,
  XCircle,
  HelpCircle,
  Info
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { isSupabaseConfigured, supabase, insertQuestions, fetchQuestions } from '@/lib/supabase';
import { safeParseJsonQuestions } from '@/lib/jsonRepair';
import { Question } from '@/types';

export default function AdminQuestionsPage() {
  const [activeTab, setActiveTab] = useState<'extract' | 'manual' | 'browse'>('extract');
  const [supabaseConnected, setSupabaseConnected] = useState(isSupabaseConfigured);
  const [dbCount, setDbCount] = useState<number | null>(null);
  
  // Paper Metadata
  const [state, setState] = useState<'AP' | 'TS'>('AP');
  const [year, setYear] = useState<number>(2024);
  const [stream, setStream] = useState<'Engineering' | 'Agriculture'>('Engineering');
  const [shift, setShift] = useState<string>('Shift-1 (FN)');
  const [defaultSubject, setDefaultSubject] = useState<'Mathematics' | 'Physics' | 'Chemistry'>('Mathematics');

  // File & AI Extraction State
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    name: string;
    type: string;
    base64: string;
    previewUrl?: string;
  } | null>(null);
  const [rawText, setRawText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedQuestions, setExtractedQuestions] = useState<Omit<Question, 'question_id'>[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Add Form State
  const [manualQ, setManualQ] = useState({
    subject: 'Mathematics',
    topic: 'Matrices',
    question_text_en: '',
    question_text_te: '',
    opt1_en: '',
    opt2_en: '',
    opt3_en: '',
    opt4_en: '',
    opt1_te: '',
    opt2_te: '',
    opt3_te: '',
    opt4_te: '',
    correct_option: 0,
    explanation_en: '',
    explanation_te: '',
    difficulty: 'Medium' as 'Easy' | 'Medium' | 'Hard'
  });

  // Database browse state
  const [dbQuestions, setDbQuestions] = useState<Question[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);

  useEffect(() => {
    checkDatabase();
  }, []);

  // Allow pasting screenshots directly from clipboard (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            loadFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const checkDatabase = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setSupabaseConnected(false);
      return;
    }
    try {
      const { count, error } = await supabase.from('questions').select('*', { count: 'exact', head: true });
      if (!error && count !== null) {
        setSupabaseConnected(true);
        setDbCount(count);
      } else {
        setSupabaseConnected(false);
      }
    } catch {
      setSupabaseConnected(false);
    }
  };

  const loadDatabaseQuestions = async () => {
    setLoadingDb(true);
    const questions = await fetchQuestions({ limit: 50 });
    setDbQuestions(questions);
    setLoadingDb(false);
  };

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');
      setSelectedFile({
        file,
        name: file.name,
        type: mimeType,
        base64,
        previewUrl: file.type.startsWith('image/') ? result : undefined
      });
      setExtractError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadFile(e.target.files[0]);
    }
  };

  // AI extraction using Gemini 3.6 Flash
  const handleExtractWithGemini = async () => {
    if (!selectedFile && !rawText.trim()) {
      setExtractError('దయచేసి PDF / Image ఫైల్‌ని అప్‌లోడ్ చేయండి లేదా టెక్స్ట్‌ని పేస్ట్ చేయండి.');
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      setExtractError('Gemini API key (.env.local లో) కనిపించలేదు.');
      return;
    }

    setIsExtracting(true);
    setExtractError(null);
    setSaveSuccessMsg(null);

    const systemPrompt = `You are an expert AP/TS EAMCET bilingual exam OCR & processor.
Extract all multiple choice questions from the provided file/image/text with extreme mathematical precision.

CRITICAL MATHEMATICS & LATEX RULES:
1. ALWAYS format matrices in LaTeX using \\begin{bmatrix} ... \\end{bmatrix} or \\begin{pmatrix} ... \\end{pmatrix}.
2. Format all superscripts, powers, inverses properly: $5A^{-1}$, $A^2 - 4A$, $5I$.
3. Wrap all formulas, symbols, fractions, and equations in single dollar signs $...$ for inline math, or double dollar signs $$...$$ for standalone display math.
4. All LaTeX backslashes MUST be escaped in JSON strings using double backslashes (e.g. \\\\begin{bmatrix}, \\\\frac{a}{b}, \\\\det).

CRITICAL JSON FORMAT RULES:
1. Return ONLY a valid JSON array of question objects. Do not wrap in markdown code blocks.
2. Limit extraction to the first 5-10 clearly visible questions from this page/file to prevent truncation.
3. Each object must strictly have these fields:
   - "subject": "${defaultSubject}" (or detect: "Mathematics", "Physics", "Chemistry")
   - "topic": appropriate chapter/topic name (e.g. "Matrices & Determinants")
   - "question_text_en": English question text with LaTeX math wrapped in $...$
   - "question_text_te": Fluent Telugu translation with math wrapped in $...$
   - "options_en": Array of 4 strings in English with LaTeX math
   - "options_te": Array of 4 strings in Telugu with LaTeX math
   - "correct_option": integer (0 for option 1/A, 1 for option 2/B, 2 for option 3/C, 3 for option 4/D)
   - "explanation_en": Step-by-step mathematical solution in English
   - "explanation_te": Step-by-step mathematical solution in Telugu
   - "is_previous_year": true
   - "state": "${state}"
   - "year": ${year}
   - "stream": "${stream}"
   - "shift": "${shift}"
   - "difficulty": "Medium" (or "Easy" / "Hard")`;

    const parts: any[] = [];

    // Add inline file data if user uploaded PDF or image
    if (selectedFile) {
      parts.push({
        inlineData: {
          mimeType: selectedFile.type,
          data: selectedFile.base64
        }
      });
    }

    // Add prompt text
    const promptMessage = `${systemPrompt}\n\n${
      rawText.trim() ? `ADDITIONAL RAW EXAM TEXT:\n${rawText}` : 'Please extract all questions from the attached file/image.'
    }`;
    parts.push({ text: promptMessage });

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const errMsg = errJson?.error?.message || response.statusText;
        throw new Error(`Gemini API error (${response.status}): ${errMsg}`);
      }

      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!generatedText) {
        throw new Error('Gemini did not return question data.');
      }

      const questionsList = safeParseJsonQuestions(generatedText);

      if (Array.isArray(questionsList) && questionsList.length > 0) {
        setExtractedQuestions(questionsList);
      } else {
        throw new Error('Parsed response does not contain valid questions.');
      }
    } catch (err: any) {
      console.error(err);
      setExtractError(err.message || 'ప్రశ్నల ఎక్స్‌ట్రాక్షన్‌లో సమస్య వచ్చింది.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Save extracted questions to Supabase
  const handleSaveToSupabase = async () => {
    if (extractedQuestions.length === 0) return;
    if (!supabaseConnected) {
      setExtractError('Supabase ఇంకా కనెక్ట్ అవ్వలేదు. దయచేసి .env.local లో మీ Supabase URL & Key ని ఎంటర్ చేయండి.');
      return;
    }

    setIsSaving(true);
    setExtractError(null);

    const result = await insertQuestions(extractedQuestions);

    setIsSaving(false);
    if (result.success) {
      setSaveSuccessMsg(`విజయవంతంగా ${result.count ?? extractedQuestions.length} ప్రశ్నలు Supabase డేటాబేస్‌లో సేవ్ అయ్యాయి! 🎉`);
      setExtractedQuestions([]);
      setSelectedFile(null);
      setRawText('');
      checkDatabase();
    } else {
      setExtractError(result.error || 'సేవ్ చేయడంలో లోపం ఏర్పడింది.');
    }
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseConnected) {
      alert('Supabase ఇంకా కనెక్ట్ అవ్వలేదు. దయచేసి .env.local లో వివరాలు ఇవ్వండి.');
      return;
    }

    const questionPayload: Omit<Question, 'question_id'> = {
      subject: manualQ.subject as any,
      topic: manualQ.topic,
      question_text_en: manualQ.question_text_en,
      question_text_te: manualQ.question_text_te || manualQ.question_text_en,
      options_en: [manualQ.opt1_en, manualQ.opt2_en, manualQ.opt3_en, manualQ.opt4_en],
      options_te: [
        manualQ.opt1_te || manualQ.opt1_en,
        manualQ.opt2_te || manualQ.opt2_en,
        manualQ.opt3_te || manualQ.opt3_en,
        manualQ.opt4_te || manualQ.opt4_en,
      ],
      correct_option: manualQ.correct_option,
      explanation_en: manualQ.explanation_en,
      explanation_te: manualQ.explanation_te || manualQ.explanation_en,
      is_previous_year: true,
      state: state,
      year: year,
      stream: stream,
      shift: shift,
      difficulty: manualQ.difficulty,
    };

    setIsSaving(true);
    const result = await insertQuestions([questionPayload]);
    setIsSaving(false);

    if (result.success) {
      alert('ప్రశ్న డేటాబేస్‌లో సేవ్ అయ్యింది!');
      checkDatabase();
    } else {
      alert('Error: ' + result.error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              <Database className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              EAMCET PDF & Question Manager
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            PDF ఫైల్‌ను నేరుగా అప్‌లోడ్ చేయండి లేదా స్క్రీన్‌షాట్ పేస్ట్ చేయండి — మ్యాథ్స్ సింబల్స్‌తో సహా ఆటోమేటిక్‌గా Supabase లో భద్రపరచండి.
          </p>
        </div>

        {/* Supabase Status Banner */}
        <div className="flex items-center space-x-3">
          <div className={`px-4 py-2 rounded-xl border flex items-center space-x-2 text-sm font-semibold ${
            supabaseConnected 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
          }`}>
            {supabaseConnected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Supabase Live Connected ({dbCount ?? 0} ప్రశ్నలు డేటాబేస్‌లో ఉన్నాయి)</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <span>Supabase Not Connected</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info Card explaining why copy-paste fails & how PDF/image solves it */}
      <div className="mb-6 p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-start space-x-3">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
          <strong className="font-bold">సింబల్స్ ఎందుకు పోతున్నాయి?</strong> PDF లోని మ్యాథ్స్ సింబల్స్ (మాత్రికల బ్రాకెట్లు, $A^{-1}$, రూట్స్) ప్రత్యేక ఫాంట్స్ వల్ల సాధారణ టెక్స్ట్‌గా కాపీ చేసినప్పుడు క్యూబ్ బాక్సులు (<span className="font-mono bg-white dark:bg-slate-900 px-1 rounded border">?</span>) గా మారిపోతాయి.
          <span className="block mt-1 text-blue-700 dark:text-blue-300 font-medium">
            💡 <strong>పరిష్కారం:</strong> మీ PDF ఫైల్‌ని నేరుగా క్రింద అప్‌లోడ్ చేయండి లేదా పేపర్ లోని ప్రశ్నల స్క్రీన్‌షాట్ తీసి <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border rounded font-mono font-bold">Ctrl + V</kbd> నొక్కి పేస్ట్ చేయండి. Gemini AI కంటితో చూసి 100% పర్ఫెక్ట్ మ్యాథ్స్ KaTeX సమీకరణాలుగా మారుస్తుంది!
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-800 mb-6">
        <button
          onClick={() => setActiveTab('extract')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-bold border-b-2 transition ${
            activeTab === 'extract'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Direct PDF / Image AI Extractor</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-bold border-b-2 transition ${
            activeTab === 'manual'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Manual Single Entry</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('browse');
            loadDatabaseQuestions();
          }}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-bold border-b-2 transition ${
            activeTab === 'browse'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Browse Database ({dbCount ?? dbQuestions.length})</span>
        </button>
      </div>

      {/* TAB 1: AI PDF & IMAGE EXTRACTOR */}
      {activeTab === 'extract' && (
        <div className="space-y-6">
          {/* Paper Metadata Config */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
              1. ఈ పేపర్ వివరాలు ఎంచుకోండి (Exam & Paper Metadata)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">రాష్ట్రం (State)</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value as any)}
                  className="mt-1 w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="AP">AP EAMCET (EAPCET)</option>
                  <option value="TS">TS EAMCET (TG EAPCET)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">సంవత్సరం (Year)</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="mt-1 w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value={2025}>2025</option>
                  <option value={2024}>2024</option>
                  <option value={2023}>2023</option>
                  <option value={2022}>2022</option>
                  <option value={2021}>2021</option>
                  <option value={2020}>2020</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Stream</label>
                <select
                  value={stream}
                  onChange={(e) => setStream(e.target.value as any)}
                  className="mt-1 w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="Engineering">Engineering</option>
                  <option value="Agriculture">Agriculture & Pharmacy</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">షిఫ్ట్ (Shift)</label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className="mt-1 w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="Shift-1 (FN)">Shift-1 (FN Morning)</option>
                  <option value="Shift-2 (AN)">Shift-2 (AN Afternoon)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">సబ్జెక్ట్ (Subject)</label>
                <select
                  value={defaultSubject}
                  onChange={(e) => setDefaultSubject(e.target.value as any)}
                  className="mt-1 w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="Mathematics">Mathematics</option>
                  <option value="Physics">Physics</option>
                  <option value="Chemistry">Chemistry</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Direct PDF / Image Upload Section */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                2. PDF ఫైల్ ని అప్‌లోడ్ చేయండి లేదా స్క్రీన్‌షాట్ పేస్ట్ చేయండి
              </h3>
              <span className="text-xs text-slate-500 flex items-center space-x-1">
                <span>సపోర్ట్: PDF, PNG, JPG</span>
              </span>
            </div>

            {/* Drag and drop upload zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  loadFile(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-blue-300 dark:border-blue-900 hover:border-blue-500 dark:hover:border-blue-600 rounded-2xl p-6 text-center cursor-pointer bg-blue-50/30 dark:bg-blue-950/20 transition-all group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInput}
                accept=".pdf,image/png,image/jpeg,image/webp"
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center space-y-3">
                  {selectedFile.previewUrl ? (
                    <img
                      src={selectedFile.previewUrl}
                      alt="Uploaded question"
                      className="max-h-48 rounded-xl border border-slate-300 dark:border-slate-700 shadow-sm object-contain"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950 flex items-center justify-center text-red-600">
                      <FileText className="w-8 h-8" />
                    </div>
                  )}

                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-center space-x-2">
                      <span>{selectedFile.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </p>
                    <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                      ✓ ఫైల్ సిద్ధంగా ఉంది — క్రింద "ప్రశ్నలను ఎక్స్‌ట్రాక్ట్ చేయి" నొక్కండి
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-2 py-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    PDF ఫైల్‌ని ఇక్కడ డ్రాగ్ & డ్రాప్ చేయండి లేదా క్లిక్ చేసి ఎంచుకోండి
                  </p>
                  <p className="text-xs text-slate-500">
                    లేదా క్వశ్చన్ పేపర్ స్క్రీన్‌షాట్ తీసి నేరుగా <kbd className="px-2 py-0.5 bg-white dark:bg-slate-800 border rounded font-mono font-bold text-blue-600">Ctrl + V</kbd> నొక్కి పేస్ట్ చేయండి
                  </p>
                </div>
              )}
            </div>

            {/* Optional Raw Text / Notes Fallback */}
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold hover:text-blue-600">
                + లేదా టెక్స్ట్ నేరుగా టైప్/పేస్ట్ చేయాలనుకుంటున్నారా? (Optional Text Box)
              </summary>
              <textarea
                rows={4}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="ఫైల్ అప్‌లోడ్ కాకుండా టెక్స్ట్ మాత్రమే ఇవ్వాలనుకుంటే ఇక్కడ పేస్ట్ చేయవచ్చు..."
                className="mt-2 w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </details>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-500">
                Gemini 3.6 Flash మోడల్ కంటితో చూసి మ్యాథ్స్ మాత్రికలను ($[\\dots]$) KaTeX లోకి మారుస్తుంది.
              </span>
              <button
                type="button"
                disabled={isExtracting || (!selectedFile && !rawText.trim())}
                onClick={handleExtractWithGemini}
                className="inline-flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow transition"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gemini AI ఫైల్ నుండి ప్రశ్నలను రీడ్ చేస్తోంది...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>ప్రశ్నలను ఎక్స్‌ట్రాక్ట్ చేయి (Extract Questions)</span>
                  </>
                )}
              </button>
            </div>

            {extractError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{extractError}</span>
              </div>
            )}

            {saveSuccessMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}
          </div>

          {/* Extracted Questions Preview & Live Edit before Saving */}
          {extractedQuestions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-black">
                      {extractedQuestions.length} ప్రశ్నలు సిద్ధమయ్యాయి
                    </span>
                    <span>ప్రివ్యూ చూడండి (సింబల్స్ సరిగ్గా వచ్చాయో లేదో చెక్ చేయండి)</span>
                  </h3>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setExtractedQuestions([])}
                    className="text-xs text-slate-500 hover:text-rose-600 font-semibold"
                  >
                    రద్దు చేయి (Clear)
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={handleSaveToSupabase}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow transition"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>డేటాబేస్‌లో సేవ్ అవుతోంది...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Supabase లో సేవ్ చేయండి (Save All to DB)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Question cards preview with KaTeX rendering */}
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {extractedQuestions.map((q, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-blue-600 text-sm">Q{idx + 1}.</span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {q.subject} • {q.topic}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-[11px] font-semibold text-blue-600">
                          {q.state} {q.year} {q.stream}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600">
                        సరియైన సమాధానం: ఆప్షన్ ({q.correct_option + 1})
                      </span>
                    </div>

                    {/* Question text */}
                    <div className="space-y-2 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        <MathRenderer content={q.question_text_en} />
                      </div>
                      {q.question_text_te && (
                        <div className="text-xs text-slate-600 dark:text-slate-400 font-telugu pt-1 border-t border-slate-100 dark:border-slate-800">
                          <MathRenderer content={q.question_text_te} />
                        </div>
                      )}
                    </div>

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.options_en.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className={`p-2.5 rounded-lg border ${
                            q.correct_option === oIdx
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-bold'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className="font-bold mr-1.5 text-slate-500">({oIdx + 1})</span>
                          <MathRenderer content={opt} inline />
                        </div>
                      ))}
                    </div>

                    {/* Explanation */}
                    {q.explanation_en && (
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-slate-700 dark:text-slate-300">వివరణ (Solution): </span>
                        <MathRenderer content={q.explanation_en} inline />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANUAL QUESTION ENTRY */}
      {activeTab === 'manual' && (
        <form onSubmit={handleManualSave} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">ఒక్కో ప్రశ్నను మాన్యువల్‌గా ఎంటర్ చేయండి</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Subject</label>
              <select
                value={manualQ.subject}
                onChange={(e) => setManualQ({ ...manualQ, subject: e.target.value })}
                className="mt-1 w-full p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="Mathematics">Mathematics</option>
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Topic / Chapter</label>
              <input
                type="text"
                value={manualQ.topic}
                onChange={(e) => setManualQ({ ...manualQ, topic: e.target.value })}
                className="mt-1 w-full p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                placeholder="e.g. Matrices & Determinants"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Difficulty</label>
              <select
                value={manualQ.difficulty}
                onChange={(e) => setManualQ({ ...manualQ, difficulty: e.target.value as any })}
                className="mt-1 w-full p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">Question Text (English with LaTeX)</label>
            <textarea
              rows={3}
              value={manualQ.question_text_en}
              onChange={(e) => setManualQ({ ...manualQ, question_text_en: e.target.value })}
              className="mt-1 w-full p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
              placeholder="e.g. If $A = \begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}$, find $A^2$."
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">ప్రశ్న టెక్స్ట్ (తెలుగు - Optional)</label>
            <textarea
              rows={2}
              value={manualQ.question_text_te}
              onChange={(e) => setManualQ({ ...manualQ, question_text_te: e.target.value })}
              className="mt-1 w-full p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-telugu text-xs"
              placeholder="తెలుగు అనువాదం..."
            />
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((num, i) => (
              <div key={num} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">ఆప్షన్ {num}</span>
                  <label className="flex items-center space-x-1 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="correct_opt"
                      checked={manualQ.correct_option === i}
                      onChange={() => setManualQ({ ...manualQ, correct_option: i })}
                    />
                    <span className="font-semibold text-emerald-600">సరియైన సమాధానం</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={(manualQ as any)[`opt${num}_en`]}
                  onChange={(e) => setManualQ({ ...manualQ, [`opt${num}_en`]: e.target.value })}
                  placeholder={`Option ${num} (English with LaTeX)`}
                  className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 mb-1 font-mono"
                  required
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">Explanation (English)</label>
            <textarea
              rows={2}
              value={manualQ.explanation_en}
              onChange={(e) => setManualQ({ ...manualQ, explanation_en: e.target.value })}
              className="mt-1 w-full p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
              placeholder="Detailed solution step by step..."
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition"
          >
            {isSaving ? 'సేవ్ అవుతోంది...' : 'డేటాబేస్‌లో చేర్చు (Save Question)'}
          </button>
        </form>
      )}

      {/* TAB 3: BROWSE CURRENT DATABASE */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              డేటాబేస్‌లో ఉన్న ప్రశ్నలు ({dbQuestions.length})
            </h3>
            <button
              onClick={loadDatabaseQuestions}
              disabled={loadingDb}
              className="flex items-center space-x-1 text-xs font-bold text-blue-600 hover:underline"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDb ? 'animate-spin' : ''}`} />
              <span>రీఫ్రెష్ చేయి</span>
            </button>
          </div>

          {loadingDb ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
              <span>ప్రశ్నలు లోడ్ అవుతున్నాయి...</span>
            </div>
          ) : dbQuestions.length === 0 ? (
            <div className="p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
              <p className="text-slate-500">ఇంకా ఏ ప్రశ్నలు లేవు లేదా Supabase కనెక్ట్ అవ్వలేదు.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dbQuestions.map((q, idx) => (
                <div key={q.question_id || idx} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {q.subject} • {q.topic}
                    </span>
                    <span className="text-xs text-slate-500">
                      {q.state} {q.year} ({q.stream})
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    <MathRenderer content={q.question_text_en} />
                  </div>
                  {q.question_text_te && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-telugu">
                      <MathRenderer content={q.question_text_te} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
