'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Info,
  Zap,
  ExternalLink,
  BarChart3,
  Calculator,
  Atom,
  FlaskConical,
  Leaf,
  Mountain,
  Flame,
  Pause,
  ShieldCheck,
  AlertTriangle,
  Server,
  BookOpen,
  Key,
  Filter,
  CheckSquare,
  Square,
  X,
  GitBranch,
  History,
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { isSupabaseConfigured, supabase, insertQuestions, fetchQuestions } from '@/lib/supabase';
import { safeParseJsonQuestions } from '@/lib/jsonRepair';
import { Question, SubjectType } from '@/types';
import QuestionPipelineDashboard from '@/components/admin/QuestionPipelineDashboard';
import ModernQuestionsTable from '@/components/admin/ModernQuestionsTable';
import blueprint from '@/data/eamcet-blueprint.json';
import { normalizeQuestionStem, isPlaceholderQuestion, checkTopicMismatch } from '@/lib/deduplication';

// ── Dataset Pipeline Types ────────────────────────────────────
type SubjectKey = 'Mathematics' | 'Physics' | 'Chemistry' | 'Biology' | 'Zoology';
export interface FlaggedRecord {
  id: string; subject: string; topic: string; question_text_en: string;
  issueType: 'same-chapter-duplicate' | 'cross-chapter-duplicate' | 'topic-mismatch' | 'placeholder';
  reason: string; matchedWith?: { subject: string; topic: string; id: string };
}
interface SubjectCounts { total: number; topics: Record<string, number>; }
type AllCounts = Record<SubjectKey, SubjectCounts>;
const SUBJECT_ICONS: Record<SubjectKey, React.ElementType> = { Mathematics: Calculator, Physics: Atom, Chemistry: FlaskConical, Biology: Leaf, Zoology: Mountain };
const SUBJECT_COLORS: Record<SubjectKey, string> = { Mathematics: 'blue', Physics: 'purple', Chemistry: 'emerald', Biology: 'green', Zoology: 'amber' };
const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue:    { bg: 'bg-blue-600/25',    border: 'border-cyan-400',    text: 'text-cyan-300',    badge: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300' },
  purple:  { bg: 'bg-purple-600/25',  border: 'border-purple-400',  text: 'text-purple-300',  badge: 'bg-purple-500/20 border-purple-500/30 text-purple-300' },
  emerald: { bg: 'bg-emerald-600/25', border: 'border-emerald-400', text: 'text-emerald-300', badge: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' },
  green:   { bg: 'bg-green-600/25',   border: 'border-green-400',   text: 'text-green-300',   badge: 'bg-green-500/20 border-green-500/30 text-green-300' },
  amber:   { bg: 'bg-amber-600/25',   border: 'border-amber-400',   text: 'text-amber-300',   badge: 'bg-amber-500/20 border-amber-500/30 text-amber-300' },
};

export default function AdminQuestionsPage() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'extract' | 'manual' | 'browse' | 'dataset-pipeline' | 'pyq-ingest'>('pipeline');
  const [supabaseConnected, setSupabaseConnected] = useState(isSupabaseConfigured);
  const [dbCount, setDbCount] = useState<number | null>(null);
  
  // Paper Metadata
  const [state, setState] = useState<'AP' | 'TG'>('AP');
  const [year, setYear] = useState<number>(2024);
  const [stream, setStream] = useState<'Engineering' | 'Agriculture'>('Engineering');
  const [shift, setShift] = useState<string>('Shift-1 (FN)');
  const [defaultSubject, setDefaultSubject] = useState<'Mathematics' | 'Physics' | 'Chemistry'>('Mathematics');

  // PYQ Auto-Ingest State (github-repo pull source)
  const [pyqRepo, setPyqRepo] = useState({ owner: '', name: '', branch: 'main', glob: 'papers/**/*.json' });
  const [pyqMeta, setPyqMeta] = useState({ state: 'AP', year: '2024', stream: 'Engineering', shift: 'Shift-1' });
  const [pyqFallback, setPyqFallback] = useState({ subject: 'Mathematics', chapter: 'Previous Year Questions' });
  const [pyqScanning, setPyqScanning] = useState(false);
  const [pyqInserting, setPyqInserting] = useState(false);
  const [pyqPreview, setPyqPreview] = useState<any[]>([]);
  const [pyqResult, setPyqResult] = useState<any>(null);
  const [pyqError, setPyqError] = useState<string | null>(null);
  const [pyqLogs, setPyqLogs] = useState<any[]>([]);
  const [pyqLogsLoading, setPyqLogsLoading] = useState(false);

  const refreshPyqLogs = async () => {
    try {
      setPyqLogsLoading(true);
      const res = await fetch('/api/pull-logs');
      if (!res.ok) return;
      const data = await res.json();
      setPyqLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch { } finally { setPyqLogsLoading(false); }
  };

  // Dry-run (Scan & Preview) or real insert against a GitHub repo of PYQ JSON files.
  const runPyqPull = async (dryRun: boolean) => {
    if (!pyqRepo.owner.trim() || !pyqRepo.name.trim()) {
      setPyqError('Repo owner and repo name are required.');
      return;
    }
    setPyqError(null);
    if (dryRun) setPyqScanning(true); else setPyqInserting(true);
    try {
      const body = {
        sourceType: 'github-repo',
        repoOwner: pyqRepo.owner.trim(),
        repoName: pyqRepo.name.trim(),
        repoBranch: pyqRepo.branch.trim() || 'main',
        pathGlob: pyqRepo.glob.trim() || '**',
        subject: pyqFallback.subject.trim() || 'Mathematics',
        chapter: pyqFallback.chapter.trim() || 'Previous Year Questions',
        dryRun,
        pyq: {
          state: pyqMeta.state || undefined,
          year: pyqMeta.year ? Number(pyqMeta.year) : undefined,
          stream: pyqMeta.stream || undefined,
          shift: pyqMeta.shift || undefined
        }
      };
      const res = await fetch('/api/questions/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPyqError(data.error || 'Pull failed');
        setPyqResult(null);
        setPyqPreview([]);
        return;
      }
      setPyqResult(data);
      setPyqPreview(dryRun ? (data.questions || []) : []);
      await refreshPyqLogs();
    } catch (err: any) {
      setPyqError(err.message || 'Network error');
      setPyqResult(null);
      setPyqPreview([]);
    } finally {
      setPyqScanning(false);
      setPyqInserting(false);
    }
  };

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
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [filterChapter, setFilterChapter] = useState<string>('All');
  const [filterCounts, setFilterCounts] = useState<{ total: number; bySubject: Record<string, number>; byChapter: Record<string, number> }>({ total: 0, bySubject: {}, byChapter: {} });
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [showQuestions, setShowQuestions] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('sno');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['sno', 'question', 'opt1', 'opt2', 'opt3', 'opt4', 'actions']);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    sno: 60,
    question: 300,
    opt1: 150,
    opt2: 150,
    opt3: 150,
    opt4: 150,
    actions: 100
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState<number>(0);
  const [resizeStartWidth, setResizeStartWidth] = useState<number>(0);

  // ── Dataset Pipeline State ───────────────────────────────────
  const pipelineSubjects = Object.keys(blueprint.subjects) as SubjectKey[];
  const [activeSubject, setActiveSubject] = useState<SubjectKey>('Mathematics');
  const [counts, setCounts] = useState<AllCounts>(Object.fromEntries(Object.keys(blueprint.subjects).map((s) => [s, { total: 0, topics: {} }])) as AllCounts);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [batchSize, setBatchSize] = useState(10);
  const [customApiKey, setCustomApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutoPipeline, setIsAutoPipeline] = useState(false);
  const autoPipelineRef = useRef(false);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [pipelineSuccessMsg, setPipelineSuccessMsg] = useState<string | null>(null);
  const [pipelineErrorMsg, setPipelineErrorMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [auditStats, setAuditStats] = useState<{ total: number; unique: number; duplicates: number; crossChapterDuplicates: number; mismatches: number; placeholders: number; } | null>(null);
  const [flaggedRecords, setFlaggedRecords] = useState<FlaggedRecord[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [selectedFlaggedIds, setSelectedFlaggedIds] = useState<Set<string>>(new Set());
  const [activeIssueFilter, setActiveIssueFilter] = useState<string>('all');
  const [isPurging, setIsPurging] = useState(false);
  const [auditScope, setAuditScope] = useState<'active' | 'all'>('active');
  const [autoPipelineStats, setAutoPipelineStats] = useState<{ batches: number; inserted: number; skipped: number; } | null>(null);

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
    
    // Fetch all questions directly from Supabase with pagination to get accurate counts
    let questions: Question[] = [];
    if (supabase) {
      try {
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const { data, error } = await supabase
            .from('questions')
            .select('*')
            .range(offset, offset + pageSize - 1);
          
          if (error) {
            console.error('Error fetching questions:', error);
            break;
          }
          
          if (data && data.length > 0) {
            questions = questions.concat(data);
            offset += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      } catch (err) {
        console.error('Error fetching questions:', err);
      }
    }
    
    setDbQuestions(questions);
    
    // Calculate filter counts
    const bySubject: Record<string, number> = {};
    const byChapter: Record<string, number> = {};
    questions.forEach(q => {
      bySubject[q.subject] = (bySubject[q.subject] || 0) + 1;
      byChapter[q.topic] = (byChapter[q.topic] || 0) + 1;
    });
    setFilterCounts({ total: questions.length, bySubject, byChapter });
    setLoadingDb(false);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    
    try {
      const res = await fetch(`/api/questions/${questionId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        await loadDatabaseQuestions();
        await checkDatabase();
      } else {
        alert('Failed to delete: ' + result.error);
      }
    } catch (err: any) {
      alert('Error deleting question: ' + err.message);
    }
  };

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingQuestion) return;
    
    try {
      const res = await fetch(`/api/questions/${editingQuestion.question_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingQuestion)
      });
      const result = await res.json();
      if (result.success) {
        setShowEditModal(false);
        setEditingQuestion(null);
        await loadDatabaseQuestions();
      } else {
        alert('Failed to update: ' + result.error);
      }
    } catch (err: any) {
      alert('Error updating question: ' + err.message);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleColumnResize = (column: string, width: number) => {
    setColumnWidths(prev => ({ ...prev, [column]: width }));
  };

  const toggleColumn = (column: string) => {
    setVisibleColumns(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const handleResizeStart = (column: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[column]);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingColumn) return;
    
    const deltaX = e.clientX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + deltaX);
    setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
  };

  const handleResizeEnd = () => {
    setResizingColumn(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    if (resizingColumn) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

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

    const systemPrompt = `You are an expert AP/TS EAPCET bilingual exam OCR & processor.
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
      const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let response: Response | null = null;
      let lastErrMsg = '';

      for (const model of models) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        if (apiKey.startsWith('AQ.') || apiKey.startsWith('ya29.')) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          headers['x-goog-api-key'] = apiKey;
          url += `?key=${encodeURIComponent(apiKey)}`;
        }

        response = await fetch(
          url,
          {
            method: 'POST',
            headers,
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

        if (response.ok) break;
        if (response.status === 429) {
          lastErrMsg = `Quota exceeded on ${model} (429). Trying fallback model...`;
          continue;
        }
        const errJson = await response.json().catch(() => null);
        lastErrMsg = errJson?.error?.message || response.statusText;
      }

      if (!response || !response.ok) {
        throw new Error(`Gemini API error: ${lastErrMsg || 'Rate limit / quota exceeded. Please wait a few seconds or verify your API key.'}`);
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

    const normalizedStream = stream === 'Engineering' ? 'engineering' : 'agriculture-pharmacy';

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
      stream: normalizedStream,
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

  // ── Dataset Pipeline helpers ──────────────────────────────────
  const addLog = (msg: string) => { const time = new Date().toLocaleTimeString('en-US', { hour12: false }); setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 99)]); };

  const fetchCounts = useCallback(async () => {
    if (!supabase) return;
    setLoadingCounts(true);
    addLog('🔄 Fetching live counts from Supabase...');
    try {
      const fresh: AllCounts = Object.fromEntries((Object.keys(blueprint.subjects) as SubjectKey[]).map((s) => [s, { total: 0, topics: {} }])) as AllCounts;
      for (const sub of Object.keys(blueprint.subjects) as SubjectKey[]) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subject', sub);
        if (count !== null) fresh[sub].total = count;
        const topicMap: Record<string, number> = {};
        let offset = 0;
        while (true) {
          const { data, error } = await supabase.from('questions').select('topic').eq('subject', sub).range(offset, offset + 999);
          if (error || !data || data.length === 0) break;
          for (const row of data) { if (row.topic) topicMap[row.topic] = (topicMap[row.topic] || 0) + 1; }
          if (data.length < 1000) break;
          offset += 1000;
        }
        fresh[sub].topics = topicMap;
      }
      setCounts(fresh);
      addLog('✅ Counts updated');
    } catch (err: any) { addLog(`❌ Fetch error: ${err.message}`); }
    finally { setLoadingCounts(false); }
  }, []);

  const saveApiKey = (val: string) => { setCustomApiKey(val); try { if (val) localStorage.setItem('eamcet_gemini_api_key', val); else localStorage.removeItem('eamcet_gemini_api_key'); } catch { } };

  const fetchExistingSamples = async (chapter: string): Promise<string[]> => {
    if (!supabase) return [];
    const texts: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('questions').select('question_text_en').eq('topic', chapter).range(offset, offset + 999);
      if (error || !data || data.length === 0) break;
      texts.push(...data.map((r: any) => String(r.question_text_en || '').trim()).filter(Boolean));
      if (data.length < 1000) break;
    }
    return texts;
  };

  const handleAudit = async (scope: 'active' | 'all' = auditScope) => {
    if (!supabase) { setPipelineErrorMsg('Supabase is not configured.'); return; }
    setIsGenerating(true); setPipelineErrorMsg(null); setPipelineSuccessMsg(null);
    addLog(`🔎 Running audit for ${scope === 'all' ? 'All 5 Subjects' : activeSubject}...`);
    try {
      const allRows: any[] = []; let offset = 0;
      while (true) {
        let query = supabase.from('questions').select('question_id, question_text_en, options_en, subject, topic');
        if (scope === 'active') query = query.eq('subject', activeSubject);
        const { data, error } = await query.range(offset, offset + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }
      addLog(`📊 Loaded ${allRows.length} questions...`);
      const seenStems = new Map<string, { id: string; subject: string; topic: string }>();
      const flagged: FlaggedRecord[] = [];
      let sameChapterDupes = 0, crossChapterDupes = 0, mismatches = 0, placeholders = 0;
      for (const row of allRows) {
        const text = String(row.question_text_en || '').trim();
        const stem = normalizeQuestionStem(text);
        const phCheck = isPlaceholderQuestion(row);
        if (phCheck.isPlaceholder) { placeholders++; flagged.push({ id: row.question_id, subject: row.subject, topic: row.topic, question_text_en: text, issueType: 'placeholder', reason: phCheck.reason || 'Placeholder / Dummy Question' }); continue; }
        const mismatchCheck = checkTopicMismatch(row.subject, row.topic, text);
        if (mismatchCheck.isMismatch) { mismatches++; flagged.push({ id: row.question_id, subject: row.subject, topic: row.topic, question_text_en: text, issueType: 'topic-mismatch', reason: mismatchCheck.reason || 'Chapter / Subject Content Mismatch' }); continue; }
        if (stem.length > 15) {
          if (seenStems.has(stem)) {
            const original = seenStems.get(stem)!;
            const isCross = original.subject !== row.subject || original.topic !== row.topic;
            if (isCross) { crossChapterDupes++; flagged.push({ id: row.question_id, subject: row.subject, topic: row.topic, question_text_en: text, issueType: 'cross-chapter-duplicate', reason: `Cross-chapter duplicate (Found in: ${original.subject} -> ${original.topic})`, matchedWith: original }); }
            else { sameChapterDupes++; flagged.push({ id: row.question_id, subject: row.subject, topic: row.topic, question_text_en: text, issueType: 'same-chapter-duplicate', reason: `Duplicate within same chapter (${row.topic})`, matchedWith: original }); }
          } else { seenStems.set(stem, { id: row.question_id, subject: row.subject, topic: row.topic }); }
        }
      }
      setFlaggedRecords(flagged); setSelectedFlaggedIds(new Set(flagged.map(f => f.id)));
      setAuditStats({ total: allRows.length, unique: allRows.length - flagged.length, duplicates: sameChapterDupes, crossChapterDuplicates: crossChapterDupes, mismatches, placeholders });
      addLog(`✅ Audit complete → ${flagged.length} issues found`);
      setPipelineSuccessMsg(`Audit Complete: ${flagged.length} issues detected.`);
      if (flagged.length > 0) setShowAuditModal(true);
      fetchCounts();
    } catch (err: any) { setPipelineErrorMsg(err.message); addLog(`❌ Audit failed: ${err.message}`); }
    finally { setIsGenerating(false); }
  };

  const handlePurgeSelected = async () => {
    if (!supabase || selectedFlaggedIds.size === 0) return;
    const count = selectedFlaggedIds.size;
    if (!confirm(`Are you sure you want to permanently delete ${count} flagged question(s)?`)) return;
    setIsPurging(true); addLog(`🗑️ Deleting ${count} flagged questions...`);
    try {
      const idArray = Array.from(selectedFlaggedIds);
      for (let i = 0; i < idArray.length; i += 200) {
        const chunk = idArray.slice(i, i + 200);
        const { error } = await supabase.from('questions').delete().in('question_id', chunk);
        if (error) throw error;
      }
      addLog(`✅ Successfully purged ${count} questions!`);
      setPipelineSuccessMsg(`Purged ${count} problematic / duplicate questions.`);
      setFlaggedRecords(prev => prev.filter(f => !selectedFlaggedIds.has(f.id)));
      setSelectedFlaggedIds(new Set()); setShowAuditModal(false); fetchCounts();
    } catch (err: any) { addLog(`❌ Purge error: ${err.message}`); setPipelineErrorMsg(`Purge error: ${err.message}`); }
    finally { setIsPurging(false); }
  };

  const handleGenerate = async (mode: 'dry-run' | 'insert', count = batchSize) => {
    if (!selectedChapter) { addLog('⚠️ Please select a chapter first.'); return; }
    setIsGenerating(true); setPipelineErrorMsg(null); setPipelineSuccessMsg(null);
    try {
      const existingSamples = await fetchExistingSamples(selectedChapter);
      const res = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: activeSubject, chapter: selectedChapter, count, customApiKey: customApiKey.trim() || undefined, existingSamples }) });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || `AI error (${res.status})`);
      const questions = result.questions || [];
      addLog(`✨ Generated ${questions.length} candidate questions`);
      setPreviewQuestions(questions);
      if (mode === 'insert') {
        if (!supabase) throw new Error('Supabase not configured');
        const { data: dbCheck, error: fetchErr } = await supabase.from('questions').select('question_text_en').eq('subject', activeSubject);
        const existingStems = new Set<string>();
        if (!fetchErr && dbCheck) dbCheck.forEach(r => { const s = normalizeQuestionStem(r.question_text_en); if (s.length > 10) existingStems.add(s); });
        const cleanDbRows: any[] = []; let rejectedCount = 0;
        for (const q of questions) {
          const stem = normalizeQuestionStem(q.question_text_en);
          const phCheck = isPlaceholderQuestion(q); const mmCheck = checkTopicMismatch(activeSubject, selectedChapter, q.question_text_en);
          if ((stem.length > 10 && existingStems.has(stem)) || phCheck.isPlaceholder || mmCheck.isMismatch) { rejectedCount++; addLog(`⚠️ Blocked: "${(q.question_text_en || '').slice(0, 50)}..."`); }
          else { existingStems.add(stem); cleanDbRows.push({ subject: q.subject || activeSubject, topic: q.topic || selectedChapter, question_text_en: q.question_text_en, question_text_te: q.question_text_te, options_en: q.options_en, options_te: q.options_te, correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0, explanation_en: q.explanation_en || '', explanation_te: q.explanation_te || '', is_previous_year: q.is_previous_year ?? false, stream: q.stream || (['Biology', 'Zoology'].includes(activeSubject) ? 'Agriculture' : 'Engineering'), difficulty: q.difficulty || 'Medium' }); }
        }
        if (cleanDbRows.length === 0) { setPipelineErrorMsg('All generated questions were duplicates or mismatched. Zero inserted.'); return; }
        const { data, error } = await supabase.from('questions').insert(cleanDbRows).select('question_id');
        if (error) throw error;
        const inserted = data?.length ?? cleanDbRows.length;
        setPipelineSuccessMsg(`🎉 ${inserted} clean questions inserted! (${rejectedCount} blocked)`);
        addLog(`🚀 Inserted ${inserted} clean questions (${rejectedCount} blocked).`);
        fetchCounts();
      } else { addLog(`🧪 Dry-Run: ${questions.length} questions previewed (no DB change).`); }
    } catch (err: any) { setPipelineErrorMsg(err.message); addLog(`❌ ${err.message}`); }
    finally { setIsGenerating(false); }
  };

  const handleAutoPipeline = async () => {
    if (!supabase) { alert('Supabase not configured.'); return; }
    if (!selectedChapter) { alert('Please select a chapter first.'); return; }
    if (isAutoPipeline) { autoPipelineRef.current = false; setIsAutoPipeline(false); addLog('⏹️ Auto-Pipeline stopped.'); return; }
    autoPipelineRef.current = true; setIsAutoPipeline(true); setAutoPipelineStats({ batches: 0, inserted: 0, skipped: 0 }); setPipelineErrorMsg(null); setPipelineSuccessMsg(null);
    addLog(`🔥 Auto-Pipeline STARTED for "${selectedChapter}" (${batchSize} Qs/batch)`);
    const existingFPs = new Set<string>(); const sampleTexts: string[] = [];
    try {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('questions').select('question_text_en, topic').eq('subject', activeSubject).range(offset, offset + 999);
        if (error || !data || data.length === 0) break;
        for (const r of data) { const txt = String(r.question_text_en || '').trim(); const stem = normalizeQuestionStem(txt); if (stem.length > 10) existingFPs.add(stem); if (r.topic === selectedChapter && txt) sampleTexts.push(txt); }
        if (data.length < 1000) break;
      }
      addLog(`✅ Loaded ${existingFPs.size} subject fingerprints.`);
    } catch (err: any) { addLog(`⚠️ Could not load fingerprints: ${err.message}`); }
    let batches = 0, totalInserted = 0, totalSkipped = 0;
    const buffer: any[] = [];
    while (autoPipelineRef.current) {
      batches++; addLog(`⚙️ Batch #${batches}: Generating ${batchSize} questions...`);
      try {
        const res = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: activeSubject, chapter: selectedChapter, count: batchSize, customApiKey: customApiKey.trim() || undefined, existingSamples: sampleTexts.slice(-50) }) });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || `AI error (${res.status})`);
        const generated: any[] = result.questions || []; const unique: any[] = []; let skipped = 0;
        for (const q of generated) {
          const stem = normalizeQuestionStem(q.question_text_en); const phCheck = isPlaceholderQuestion(q); const mmCheck = checkTopicMismatch(activeSubject, selectedChapter, q.question_text_en);
          if ((stem.length > 10 && existingFPs.has(stem)) || phCheck.isPlaceholder || mmCheck.isMismatch) { skipped++; }
          else { if (stem.length > 10) existingFPs.add(stem); sampleTexts.push(String(q.question_text_en || '')); unique.push({ subject: q.subject || activeSubject, topic: q.topic || selectedChapter, question_text_en: q.question_text_en, question_text_te: q.question_text_te, options_en: q.options_en, options_te: q.options_te, correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0, explanation_en: q.explanation_en || '', explanation_te: q.explanation_te || '', is_previous_year: false, stream: ['Biology', 'Zoology'].includes(activeSubject) ? 'Agriculture' : 'Engineering', difficulty: q.difficulty || 'Medium' }); }
        }
        totalSkipped += skipped; addLog(`🔍 Batch #${batches}: ${unique.length} unique, ${skipped} skipped`);
        if (unique.length > 0) {
          buffer.push(...unique);
          const { data, error } = await supabase.from('questions').insert(buffer).select('question_id');
          if (error) throw error;
          const count = data?.length ?? buffer.length; totalInserted += count;
          addLog(`✅ Inserted ${count} questions`); buffer.length = 0;
        }
        setAutoPipelineStats({ batches, inserted: totalInserted, skipped: totalSkipped });
        if (batches % 5 === 0) fetchCounts();
        await new Promise((r) => setTimeout(r, 500));
      } catch (batchErr: any) { addLog(`❌ Batch #${batches} failed: ${batchErr.message}`); await new Promise((r) => setTimeout(r, 2000)); }
    }
    if (buffer.length > 0) { try { await supabase.from('questions').insert(buffer); addLog(`✅ Final flush done`); } catch (err: any) { addLog(`❌ Final flush error: ${err.message}`); } }
    setIsAutoPipeline(false);
    setPipelineSuccessMsg(`🎉 Pipeline complete! ${totalInserted} questions inserted across ${batches} batches.`);
    addLog(`🏁 Auto-Pipeline DONE. Inserted: ${totalInserted}, Batches: ${batches}, Skipped: ${totalSkipped}`);
    fetchCounts();
  };

  useEffect(() => {
    if (activeTab === 'dataset-pipeline') {
      fetchCounts();
      try { const saved = localStorage.getItem('eamcet_gemini_api_key'); if (saved) { setCustomApiKey(saved); setShowKeyInput(true); } } catch { }
    }
  }, [activeTab, fetchCounts]);

  useEffect(() => {
    if (activeTab === 'pyq-ingest') { refreshPyqLogs(); }
  }, [activeTab]);

  useEffect(() => {
    const chapters = (blueprint.subjects as any)[activeSubject]?.chapters ?? [];
    setSelectedChapter(chapters[0]?.topic ?? '');
  }, [activeSubject]);

  const totalAllSubjects = (Object.keys(blueprint.subjects) as SubjectKey[]).reduce((sum, s) => sum + (counts[s]?.total || 0), 0);
  const currentSubjectChapters: { topic: string; weightagePercent: number }[] = (blueprint.subjects as any)[activeSubject]?.chapters ?? [];
  const colorKey = SUBJECT_COLORS[activeSubject];
  const colorCls = COLOR_CLASSES[colorKey];
  const tabCls = (tab: string) => `flex items-center space-x-2 px-4 py-2.5 text-sm font-bold border-b-2 transition shrink-0 ${ activeTab === tab ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 rounded-t-lg' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900' }`;

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
              EAPCET Question Database Manager
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            EAPCET ప్రశ్నలను నిర్వహించడానికి మరియు సప్లిమెంట్ చేయడానికి సెంట్రల్ డేటాబేస్ సిస్టమ్.
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



      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto">
        <button onClick={() => setActiveTab('pipeline')} className={tabCls('pipeline')}>
          <Zap className="w-4 h-4 text-amber-500 fill-amber-500" /><span>⚡ Bulk Question Entry</span>
        </button>
        <button onClick={() => setActiveTab('extract')} className={tabCls('extract')}>
          <Sparkles className="w-4 h-4" /><span>Direct PDF / Image AI Extractor</span>
        </button>
        <button onClick={() => setActiveTab('manual')} className={tabCls('manual')}>
          <Upload className="w-4 h-4" /><span>Manual Single Entry</span>
        </button>

        <button
          onClick={() => { setActiveTab('browse'); loadDatabaseQuestions(); }}
          className={tabCls('browse')}
        >
          <Layers className="w-4 h-4" />
          <span>Browse Database ({dbCount ?? dbQuestions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('dataset-pipeline')}
          className={tabCls('dataset-pipeline')}
        >
          <Zap className="w-4 h-4 fill-emerald-500 text-emerald-500" />
          <span>Dataset Pipeline Hub</span>
        </button>

        <button
          onClick={() => setActiveTab('pyq-ingest')}
          className={tabCls('pyq-ingest')}
        >
          <GitBranch className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span>Previous Papers Auto-Ingest</span>
        </button>
      </div>

      {/* TAB 0: BULK QUESTION ENTRY DASHBOARD */}
      {activeTab === 'pipeline' && (
        <QuestionPipelineDashboard />
      )}

      {/* TAB 1: AI PDF & IMAGE EXTRACTOR */}
      {activeTab === 'extract' && (
        <div className="space-y-6">
          {/* Info Card at the top */}
          <div className="mb-6 p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
              <strong className="font-bold">సింబల్స్ ఎందుకు పోతున్నాయి?</strong> PDF లోని మ్యాథ్స్ సింబల్స్ (మాత్రికల బ్రాకెట్లు, $A^{-1}$, రూట్స్) ప్రత్యేక ఫాంట్స్ వల్ల సాధారణ టెక్స్ట్‌గా కాపీ చేసినప్పుడు క్యూబ్ బాక్సులు (<span className="font-mono bg-white dark:bg-slate-900 px-1 rounded border">?</span>) గా మారిపోతాయి.
              <span className="block mt-1 text-blue-700 dark:text-blue-300 font-medium">
                💡 <strong>పరిష్కారం:</strong> మీ PDF ఫైల్‌ని నేరుగా క్రింద అప్‌లోడ్ చేయండి లేదా పేపర్ లోని ప్రశ్నల స్క్రీన్‌షాట్ తీసి <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border rounded font-mono font-bold">Ctrl + V</kbd> నొక్కి పేస్ట్ చేయండి. Gemini AI కంటితో చూసి 100% పర్ఫెక్ట్ మ్యాథ్స్ KaTeX సమీకరణాలుగా మారుస్తుంది!
              </span>
            </div>
          </div>

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
                  onChange={(e) => setState(e.target.value as 'AP' | 'TG')}
                  className="mt-1 w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="AP">AP EAPCET (EAPCET)</option>
                  <option value="TG">TG EAPCET (TS EAPCET)</option>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>డేటాబేస్‌లో ఉన్న ప్రశ్నలు (Database Questions)</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  {dbQuestions.length || filterCounts.total}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time interactive research & data table with global search, column filters, sorting, column reordering, LaTeX KaTeX formulas, and CSV export.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadDatabaseQuestions}
                disabled={loadingDb}
                className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition border border-blue-200 dark:border-blue-900"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDb ? 'animate-spin' : ''}`} />
                <span>{loadingDb ? 'లోడ్ అవుతోంది...' : 'రిఫ్రెష్ (Reload Database)'}</span>
              </button>
            </div>
          </div>

          <ModernQuestionsTable
            questions={dbQuestions}
            loading={loadingDb}
            onRefresh={loadDatabaseQuestions}
            onEdit={handleEditQuestion}
            onDelete={handleDeleteQuestion}
            initialSubject={filterSubject}
            initialChapter={filterChapter}
          />
        </div>
      )}

      {/* TAB 4: DATASET PIPELINE HUB */}
      {activeTab === 'dataset-pipeline' && (
        <div className="space-y-6">
          {/* Hero Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-6 rounded-3xl border border-indigo-800/40 shadow-xl relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 text-xs font-black tracking-wider uppercase rounded-full bg-blue-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 fill-cyan-400" />Dataset Pipeline Hub</span>
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Duplicate-Proof</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">EAMCET Dataset Pipeline</h2>
                <p className="text-sm text-slate-300 mt-1 max-w-xl">5 సబ్జెక్టులకు AI-జనరేటెడ్ ప్రశ్నలు Supabase డేటాబేస్‌లో ఇన్సర్ట్ చేయడానికి వేదిక. Duplicate prevention + Auto-Pipeline సపోర్ట్ ఉన్నాయి.</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/15 min-w-[220px] shrink-0">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold mb-1"><span>Total Questions in DB</span><span className="text-emerald-300 flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</span></div>
                <div className="text-3xl font-black text-white">{totalAllSubjects.toLocaleString()}</div>
                <p className="text-xs text-slate-400 mt-1">5 subjects combined</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/10">
              {(Object.keys(blueprint.subjects) as SubjectKey[]).map((sub) => {
                const Icon = SUBJECT_ICONS[sub]; const col = SUBJECT_COLORS[sub]; const cls = COLOR_CLASSES[col]; const subCount = counts[sub]?.total || 0;
                return (
                  <button key={sub} onClick={() => setActiveSubject(sub)} className={`text-left p-3.5 rounded-xl border transition-all ${activeSubject === sub ? `${cls.bg} ${cls.border} ring-2 ring-offset-0 shadow-lg` : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${cls.text}`} /><span className="font-bold text-sm text-white">{sub}</span></div><span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full border ${cls.badge}`}>Live</span></div>
                    <div className="mt-2 text-xl font-black text-slate-100">{subCount.toLocaleString()}<span className="text-xs text-slate-400 font-normal ml-1">ప్రశ్నలు</span></div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Control Panel */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><span>🎛️ {activeSubject} — Generation Control</span><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">{counts[activeSubject]?.total?.toLocaleString() || 0} in DB</span></h2>
                <p className="text-xs text-slate-500 mt-0.5">చాప్టర్ ఎంచుకుని బ్యాచ్ సైజ్ సెట్ చేసి Generate చేయండి</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowKeyInput((v) => !v)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 transition"><Key className="w-3.5 h-3.5" />{customApiKey ? 'Custom Key ✅' : 'API Key'}</button>
                <button onClick={fetchCounts} disabled={loadingCounts} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><RefreshCw className={`w-3.5 h-3.5 ${loadingCounts ? 'animate-spin' : ''}`} />Refresh</button>
              </div>
            </div>
            {showKeyInput && (<div className="mt-4 p-4 bg-amber-50/90 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5"><Key className="w-4 h-4 text-amber-600" />Gemini API Key</span><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition"><ExternalLink className="w-3 h-3" />Free Key ↗</a></div><input type="text" value={customApiKey} onChange={(e) => saveApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full p-2.5 text-xs font-mono rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900" /></div>)}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-4">
              <div className="md:col-span-4"><label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Chapter (చాప్టర్):</label><select value={selectedChapter} onChange={(e) => setSelectedChapter(e.target.value)} className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100">{currentSubjectChapters.map((ch) => (<option key={ch.topic} value={ch.topic}>{ch.topic} ({ch.weightagePercent}%)</option>))}</select></div>
              <div className="md:col-span-2"><label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Batch Size:</label><select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"><option value={5}>5 Qs (Fast)</option><option value={10}>10 Qs (Standard)</option><option value={20}>20 Qs (Turbo)</option><option value={50}>50 Qs (Max)</option><option value={100}>100 Qs (Bulk)</option></select></div>
              <div className="md:col-span-6 flex items-end gap-2 flex-wrap">
                <button onClick={() => handleAudit('active')} disabled={isGenerating || isAutoPipeline} className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap">{isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}Audit {activeSubject}</button>
                <button onClick={() => handleAudit('all')} disabled={isGenerating || isAutoPipeline} className="flex-1 min-w-[120px] py-2.5 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap">{isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}Audit All 5 Subjects</button>
                <button onClick={() => handleGenerate('dry-run')} disabled={isGenerating || isAutoPipeline} className="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap">{isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}Quick Test ({batchSize} Qs)</button>
                <button onClick={() => handleGenerate('insert')} disabled={isGenerating || isAutoPipeline} className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition shadow-md whitespace-nowrap disabled:opacity-60">{isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-white" />}Generate Batch ({batchSize} Qs)</button>
                <button onClick={handleAutoPipeline} disabled={isGenerating} className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition shadow-md whitespace-nowrap ${isAutoPipeline ? 'bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-700 hover:to-orange-600 text-white animate-pulse' : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'}`}>{isAutoPipeline ? <><Pause className="w-4 h-4" />Stop Auto-Run</> : <><Flame className="w-4 h-4" />Continuous Auto-Run</>}</button>
              </div>
            </div>
            {(isAutoPipeline || autoPipelineStats) && (<div className={`mt-3 p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${isAutoPipeline ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'}`}><div className="flex items-center gap-2">{isAutoPipeline ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}<span className="font-bold">{isAutoPipeline ? '🔥 Auto-Pipeline Running...' : '✅ Auto-Pipeline Finished'}</span></div>{autoPipelineStats && (<div className="flex items-center gap-4 font-semibold"><span>Batches: <strong className="text-blue-600 dark:text-blue-400">{autoPipelineStats.batches}</strong></span><span>Inserted: <strong className="text-emerald-600 dark:text-emerald-400">{autoPipelineStats.inserted}</strong></span><span>Skipped: <strong className="text-amber-600">{autoPipelineStats.skipped}</strong></span></div>)}</div>)}
            {auditStats && (<div className="mt-3 p-4 rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-950/40 dark:to-indigo-950/40 border border-sky-200 dark:border-sky-800 text-xs shadow-sm"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="space-y-1.5"><div className="flex items-center gap-2 font-bold text-sky-900 dark:text-sky-100"><ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" /><span>Audit Results: {auditStats.total.toLocaleString()} Scanned · {auditStats.unique.toLocaleString()} Clean</span></div><div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-[11px] flex-wrap"><span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-semibold">Cross-Chapter Dupes: {auditStats.crossChapterDuplicates}</span><span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-semibold">Same-Chapter Dupes: {auditStats.duplicates}</span><span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-semibold">Topic Mismatches: {auditStats.mismatches}</span><span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">Placeholders: {auditStats.placeholders}</span></div></div><div className="flex items-center gap-2 shrink-0">{flaggedRecords.length > 0 && (<button onClick={() => setShowAuditModal(true)} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Review & Clean ({flaggedRecords.length})</button>)}<button onClick={() => setAuditStats(null)} className="px-2.5 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-bold">Dismiss</button></div></div></div>)}
            {pipelineSuccessMsg && (<div className="mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />{pipelineSuccessMsg}</div>)}
            {pipelineErrorMsg && (<div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />{pipelineErrorMsg}</div>)}
          </div>

          {/* Chapter Breakdown Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"><div className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-blue-600" /><h3 className="font-bold text-sm text-slate-900 dark:text-white">{activeSubject} — Chapter-wise Breakdown</h3></div><span className="text-xs font-semibold text-slate-500">{currentSubjectChapters.length} chapters · {counts[activeSubject]?.total?.toLocaleString() || 0} total</span></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800"><tr><th className="py-3 px-4">Chapter / Topic</th><th className="py-3 px-3 text-center">Weightage</th><th className="py-3 px-3 text-center">Questions in DB</th><th className="py-3 px-4 text-center">Status</th><th className="py-3 px-3 text-right">Quick Add</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{currentSubjectChapters.map((ch) => { const dbCnt = counts[activeSubject]?.topics[ch.topic] || 0; return (<tr key={ch.topic} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"><td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{ch.topic}</td><td className="py-3 px-3 text-center font-bold text-slate-500">{ch.weightagePercent}%</td><td className="py-3 px-3 text-center font-black text-sm text-emerald-600 dark:text-emerald-400">{dbCnt.toLocaleString()}</td><td className="py-3 px-4 text-center">{dbCnt > 0 ? (<span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active ({dbCnt} Qs)</span>) : (<span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">Empty</span>)}</td><td className="py-3 px-3 text-right"><button onClick={() => { setSelectedChapter(ch.topic); handleGenerate('insert', 10); }} disabled={isGenerating || isAutoPipeline} className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950 text-slate-700 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300 font-bold text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 transition">+10 Qs</button></td></tr>); })}</tbody></table></div>
          </div>

          {/* Preview Questions */}
          {previewQuestions.length > 0 && (<div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4"><div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3"><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /><h3 className="font-extrabold text-base text-slate-900 dark:text-white">Preview ({previewQuestions.length} Questions)</h3></div><button onClick={() => setPreviewQuestions([])} className="text-xs text-slate-500 hover:text-rose-600">Clear</button></div><div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">{previewQuestions.map((q, idx) => (<div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3"><div className="flex items-center justify-between text-xs"><span className="font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">Q{idx + 1} · {q.topic}</span><span className="text-slate-400 font-mono text-[11px]">{q.difficulty}</span></div><div className="text-sm font-semibold text-slate-900 dark:text-white"><MathRenderer content={q.question_text_en} /></div><div className="grid grid-cols-2 gap-2 text-xs">{q.options_en?.map((opt: string, oIdx: number) => (<div key={oIdx} className={`p-2.5 rounded-lg border ${oIdx === q.correct_option ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-900 dark:text-emerald-200 font-bold' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>({oIdx + 1}) <MathRenderer content={opt} inline /></div>))}</div></div>))}</div></div>)}

          {/* Live Console */}
          <div className="bg-slate-950 text-slate-200 rounded-2xl border border-slate-800 p-4 font-mono text-xs shadow-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 text-slate-400"><div className="flex items-center gap-2"><Server className="w-3.5 h-3.5 text-cyan-400" /><span className="font-bold uppercase tracking-wider text-[11px] text-slate-300">Live Console</span></div><button onClick={() => setLogs([])} className="hover:text-white transition">Clear</button></div>
            <div className="max-h-36 overflow-y-auto space-y-0.5 text-[11px] leading-relaxed">{logs.length === 0 ? <div className="text-slate-600">Console idle. Ready to run pipeline tasks.</div> : logs.map((log, idx) => <div key={idx} className="text-slate-300">{log}</div>)}</div>
          </div>

          {/* Audit Modal */}
          {showAuditModal && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"><div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"><div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20"><AlertCircle className="w-5 h-5" /></div><div><h3 className="font-extrabold text-lg text-slate-900 dark:text-white flex items-center gap-2">Database Quality Audit &amp; Cleanup<span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">{flaggedRecords.length} Issues Found</span></h3><p className="text-xs text-slate-500 mt-0.5">ఆ చాప్టర్ కి సంబంధం లేని ప్రశ్నలు, డూప్లికేట్స్ మరియు పనికిరాని రికార్డులను పరిశీలించి డిలీట్ చేయండి</p></div></div><button onClick={() => setShowAuditModal(false)} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><X className="w-5 h-5" /></button></div><div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs"><div className="flex items-center gap-1.5 flex-wrap">{[{key:'all',label:`All Issues (${flaggedRecords.length})`},{key:'cross-chapter-duplicate',label:`Cross-Chapter (${flaggedRecords.filter(f=>f.issueType==='cross-chapter-duplicate').length})`},{key:'topic-mismatch',label:`Topic Mismatches (${flaggedRecords.filter(f=>f.issueType==='topic-mismatch').length})`},{key:'placeholder',label:`Placeholders (${flaggedRecords.filter(f=>f.issueType==='placeholder').length})`},{key:'same-chapter-duplicate',label:`Same-Chapter (${flaggedRecords.filter(f=>f.issueType==='same-chapter-duplicate').length})`}].map(tab=>(<button key={tab.key} onClick={()=>setActiveIssueFilter(tab.key)} className={`px-3 py-1.5 rounded-xl font-bold transition ${activeIssueFilter===tab.key?'bg-blue-600 text-white shadow-sm':'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>{tab.label}</button>))}</div><div className="flex items-center gap-2"><button onClick={()=>{const filtered=flaggedRecords.filter(f=>activeIssueFilter==='all'||f.issueType===activeIssueFilter);const allSelected=filtered.every(f=>selectedFlaggedIds.has(f.id));const next=new Set(selectedFlaggedIds);if(allSelected){filtered.forEach(f=>next.delete(f.id));}else{filtered.forEach(f=>next.add(f.id));}setSelectedFlaggedIds(next);}} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition">Toggle Visible</button><button onClick={handlePurgeSelected} disabled={isPurging||selectedFlaggedIds.size===0} className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5">{isPurging?<Loader2 className="w-3.5 h-3.5 animate-spin" />:<Trash2 className="w-3.5 h-3.5" />}Purge Selected ({selectedFlaggedIds.size})</button></div></div><div className="p-4 overflow-y-auto space-y-3 flex-1">{flaggedRecords.filter(f=>activeIssueFilter==='all'||f.issueType===activeIssueFilter).map(item=>{const isChecked=selectedFlaggedIds.has(item.id);const issueBadge={'cross-chapter-duplicate':'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800','topic-mismatch':'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800','placeholder':'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700','same-chapter-duplicate':'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'}[item.issueType];return(<div key={item.id} onClick={()=>{const next=new Set(selectedFlaggedIds);if(isChecked)next.delete(item.id);else next.add(item.id);setSelectedFlaggedIds(next);}} className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${isChecked?'border-rose-300 dark:border-rose-800/80 bg-rose-50/40 dark:bg-rose-950/20':'border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 opacity-80'}`}><div className="flex items-start gap-3"><div className="mt-1">{isChecked?<CheckSquare className="w-4 h-4 text-rose-600" />:<Square className="w-4 h-4 text-slate-400" />}</div><div className="flex-1 space-y-1.5"><div className="flex items-center gap-2 flex-wrap text-xs"><span className="font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">{item.subject}</span><span className="font-semibold text-slate-500">{item.topic}</span><span className={`px-2 py-0.5 rounded-full font-bold text-[11px] border ${issueBadge}`}>{item.reason}</span></div><div className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2"><MathRenderer content={item.question_text_en} /></div>{item.matchedWith&&(<div className="text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-1 rounded-lg">🔗 Matched original: <strong>{item.matchedWith.subject}</strong> → <em>{item.matchedWith.topic}</em></div>)}</div></div></div>);})}{flaggedRecords.filter(f=>activeIssueFilter==='all'||f.issueType===activeIssueFilter).length===0&&(<div className="p-8 text-center text-slate-400 font-semibold text-xs">No issues found in this category.</div>)}</div><div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40 text-xs"><span className="text-slate-500 font-semibold">{selectedFlaggedIds.size} of {flaggedRecords.length} records selected for purge</span><div className="flex items-center gap-2"><button onClick={()=>setShowAuditModal(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition">Close</button><button onClick={handlePurgeSelected} disabled={isPurging||selectedFlaggedIds.size===0} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold shadow-md transition flex items-center gap-1.5">{isPurging?<Loader2 className="w-4 h-4 animate-spin" />:<Trash2 className="w-4 h-4" />}Purge {selectedFlaggedIds.size} Records</button></div></div></div></div>)}
        </div>
      )}

      {/* TAB 5: PREVIOUS PAPERS AUTO-INGEST (github-repo pull source) */}
      {activeTab === 'pyq-ingest' && (
        <div className="space-y-6">
          {/* Info banner */}
          <div className="mb-6 p-4 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/60 flex items-start space-x-3">
            <GitBranch className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs text-cyan-900 dark:text-cyan-200 leading-relaxed">
              Crawl a GitHub repo of previous-year papers (JSON) via the GitHub git-trees API, stamp every question with paper metadata
              (<strong>per-file <code className="font-mono bg-white/60 dark:bg-slate-900/60 px-1 rounded">paper</code> object &gt; filename pattern &gt; run-level values</strong>),
              then <strong>Scan &amp; Preview</strong> (dry-run — nothing is inserted) or <strong>Insert</strong>.
              Inserts only — dedup runs on the existing fingerprint path; rows are never deleted or replaced.
            </div>
          </div>

          {/* Repo + metadata config */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Source type</label>
                <div className="px-3 py-2 text-xs font-bold rounded-xl border border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" />github-repo</div>
              </div>
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Repo owner</label>
                <input type="text" value={pyqRepo.owner} onChange={(e) => setPyqRepo({ ...pyqRepo, owner: e.target.value })} placeholder="your-username" className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Repo name</label>
                <input type="text" value={pyqRepo.name} onChange={(e) => setPyqRepo({ ...pyqRepo, name: e.target.value })} placeholder="eamcet-pyq-test-data" className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Branch</label>
                <input type="text" value={pyqRepo.branch} onChange={(e) => setPyqRepo({ ...pyqRepo, branch: e.target.value })} placeholder="main" className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
              </div>
              <div className="md:col-span-6">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Path glob</label>
                <input type="text" value={pyqRepo.glob} onChange={(e) => setPyqRepo({ ...pyqRepo, glob: e.target.value })} placeholder="papers/**/*.json" className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Fallback subject</label>
                <input type="text" value={pyqFallback.subject} onChange={(e) => setPyqFallback({ ...pyqFallback, subject: e.target.value })} className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Fallback chapter / topic</label>
                <input type="text" value={pyqFallback.chapter} onChange={(e) => setPyqFallback({ ...pyqFallback, chapter: e.target.value })} className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
              </div>
            </div>

            {/* Paper metadata — run-level fallback (lowest precedence) */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Paper metadata — run-level fallback (lowest precedence)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500">State</label>
                  <select value={pyqMeta.state} onChange={(e) => setPyqMeta({ ...pyqMeta, state: e.target.value })} className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <option value="AP">AP</option>
                    <option value="TS">TS</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">Year</label>
                  <input type="number" value={pyqMeta.year} onChange={(e) => setPyqMeta({ ...pyqMeta, year: e.target.value })} className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">Stream</label>
                  <select value={pyqMeta.stream} onChange={(e) => setPyqMeta({ ...pyqMeta, stream: e.target.value })} className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <option value="Engineering">Engineering</option>
                    <option value="Agriculture">Agriculture</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">Shift</label>
                  <input type="text" value={pyqMeta.shift} onChange={(e) => setPyqMeta({ ...pyqMeta, shift: e.target.value })} placeholder="Shift-1" className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">Used only when a file has no <code className="font-mono">paper</code> object and its filename does not match <code className="font-mono">papers/&lt;state&gt;-&lt;year&gt;-&lt;shift&gt;.json</code>. Each question's own <code className="font-mono">subject</code>/<code className="font-mono">topic</code> override the fallbacks above.</p>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
              <button onClick={() => runPyqPull(true)} disabled={pyqScanning || pyqInserting} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-200 text-xs font-bold transition disabled:opacity-60"><Eye className="w-4 h-4" />{pyqScanning ? 'Scanning...' : 'Scan & Preview (dry-run)'}</button>
              <button onClick={() => runPyqPull(false)} disabled={pyqScanning || pyqInserting} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-extrabold transition shadow-md disabled:opacity-60">{pyqInserting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-white" />}{pyqInserting ? 'Inserting...' : 'Insert into Database'}</button>
              <button onClick={() => refreshPyqLogs()} disabled={pyqLogsLoading} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition disabled:opacity-60"><RefreshCw className={`w-3.5 h-3.5 ${pyqLogsLoading ? 'animate-spin' : ''}`} />Refresh History</button>
              <span className="text-[11px] text-slate-400 ml-auto">Every scan / insert counts against the hourly pull rate limit.</span>
            </div>
          </div>

          {/* Error banner */}
          {pyqError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />{pyqError}</div>
          )}

          {/* Result summary */}
          {pyqResult && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{pyqResult.dryRun ? 'Dry-run' : 'Insert'} complete: <strong>{pyqResult.validCount}</strong> valid from <strong>{pyqResult.filesMatched ?? '?'}</strong> file(s) · <strong>{pyqResult.inserted}</strong> inserted · <strong>{pyqResult.skipped}</strong> skipped (duplicates)</span>
              {Array.isArray(pyqResult.fileErrors) && pyqResult.fileErrors.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-bold" title={pyqResult.fileErrors.join('\n')}>⚠ {pyqResult.fileErrors.length} file error(s)</span>
              )}
              {Array.isArray(pyqResult.validationErrors) && pyqResult.validationErrors.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-bold" title={pyqResult.validationErrors.join('\n')}>⚠ {pyqResult.validationErrors.length} validation error(s)</span>
              )}
            </div>
          )}

          {/* Scan preview (dry-run only) */}
          {pyqPreview.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-amber-500" />
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Preview ({pyqPreview.length} Questions)</h3>
                </div>
                <button onClick={() => { setPyqPreview([]); setPyqResult(null); }} className="text-xs text-slate-500 hover:text-rose-600">Clear</button>
              </div>
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {pyqPreview.map((q: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">Q{idx + 1} · {q.subject} · {q.topic}</span>
                      <span className="flex items-center gap-1.5">
                        {q.is_previous_year && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">PYQ{q.state ? ` · ${q.state}` : ''}{q.year ? ` ${q.year}` : ''}{q.shift ? ` · ${q.shift}` : ''}</span>
                        )}
                        <span className="text-slate-400 font-mono text-[11px]">{q.difficulty}</span>
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white"><MathRenderer content={q.question_text_en} /></div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {q.options_en?.map((opt: string, oIdx: number) => (
                        <div key={oIdx} className={`p-2.5 rounded-lg border ${oIdx === q.correct_option ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-900 dark:text-emerald-200 font-bold' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>
                          ({oIdx + 1}) <MathRenderer content={opt} inline />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pull history */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Pull History</h3>
              </div>
              <span className="text-xs font-semibold text-slate-500">{pyqLogs.length} recent pulls</span>
            </div>
            {pyqLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-semibold text-xs">No pulls recorded yet. Run a scan or insert to see history here.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3">Subject / Topic</th>
                      <th className="py-3 px-3 text-center">Pulled</th>
                      <th className="py-3 px-3 text-center">Inserted</th>
                      <th className="py-3 px-3 text-center">Skipped</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-center">Dry run</th>
                      <th className="py-3 px-4 text-right">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pyqLogs.map((log: any) => {
                      const statusCls = ({
                        success: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                        partial: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                        failed: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
                        pending: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      } as Record<string, string>)[log.status] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700';
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300 max-w-[280px] truncate" title={log.source_url}>{log.source_url}</td>
                          <td className="py-3 px-3"><span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold">{log.source_type}</span></td>
                          <td className="py-3 px-3"><span className="font-semibold">{log.subject}</span>{log.chapter ? <span className="text-slate-400"> · {log.chapter}</span> : null}</td>
                          <td className="py-3 px-3 text-center font-bold">{log.questions_pulled}</td>
                          <td className="py-3 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">{log.questions_inserted}</td>
                          <td className="py-3 px-3 text-center font-bold text-amber-600 dark:text-amber-400">{log.questions_skipped}</td>
                          <td className="py-3 px-3"><span className={`px-2 py-0.5 rounded-full font-bold text-[11px] border ${statusCls}`} title={log.error_message || ''}>{log.status}</span></td>
                          <td className="py-3 px-3 text-center">{log.dry_run ? <span className="text-cyan-600 dark:text-cyan-400 font-bold">yes</span> : <span className="text-slate-400">no</span>}</td>
                          <td className="py-3 px-4 text-right text-slate-400 whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingQuestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Question</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <XCircle className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Subject</label>
                <input
                  type="text"
                  value={editingQuestion.subject}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, subject: e.target.value as SubjectType })}
                  className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Chapter/Topic</label>
                <input
                  type="text"
                  value={editingQuestion.topic}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, topic: e.target.value })}
                  className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Question (English)</label>
                <textarea
                  value={editingQuestion.question_text_en}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text_en: e.target.value })}
                  className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Question (Telugu)</label>
                <textarea
                  value={editingQuestion.question_text_te || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text_te: e.target.value })}
                  className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Option 1 (EN)</label>
                  <input
                    type="text"
                    value={editingQuestion.options_en?.[0] || ''}
                    onChange={(e) => {
                      const opts = [...(editingQuestion.options_en || ['', '', '', ''])];
                      opts[0] = e.target.value;
                      setEditingQuestion({ ...editingQuestion, options_en: opts });
                    }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Option 1 (TE)</label>
                  <input
                    type="text"
                    value={editingQuestion.options_te?.[0] || ''}
                    onChange={(e) => {
                      const opts = [...(editingQuestion.options_te || ['', '', '', ''])];
                      opts[0] = e.target.value;
                      setEditingQuestion({ ...editingQuestion, options_te: opts });
                    }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Option 2 (EN)</label>
                  <input
                    type="text"
                    value={editingQuestion.options_en?.[1] || ''}
                    onChange={(e) => {
                      const opts = [...(editingQuestion.options_en || ['', '', '', ''])];
                      opts[1] = e.target.value;
                      setEditingQuestion({ ...editingQuestion, options_en: opts });
                    }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Option 2 (TE)</label>
                  <input
                    type="text"
                    value={editingQuestion.options_te?.[1] || ''}
                    onChange={(e) => {
                      const opts = [...(editingQuestion.options_te || ['', '', '', ''])];
                      opts[1] = e.target.value;
                      setEditingQuestion({ ...editingQuestion, options_te: opts });
                    }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Option 3 (EN)</label>
                  <input
                    type="text"
                    value={editingQuestion.options_en?.[2] || ''}
                    onChange={(e) => {
                      const opts = [...(editingQuestion.options_en || ['', '', '', ''])];
                      opts[2] = e.target.value;
                      setEditingQuestion({ ...editingQuestion, options_en: opts });
                    }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Option 3 (TE)</label>
                  <input
                    type="text"
                    value={editingQuestion.options_te?.[2] || ''}
                    onChange={(e) => {
                      const opts = [...(editingQuestion.options_te || ['', '', '', ''])];
                      opts[2] = e.target.value;
                      setEditingQuestion({ ...editingQuestion, options_te: opts });
                    }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Option 4 (EN)</label>
                  <input
                    type="text"
                    value={editingQuestion.options_en?.[3] || ''}
                    onChange={(e) => {
                      const opts = [...(editingQuestion.options_en || ['', '', '', ''])];
                      opts[3] = e.target.value;
                      setEditingQuestion({ ...editingQuestion, options_en: opts });
                    }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Option 4 (TE)</label>
                  <input
                    type="text"
                    value={editingQuestion.options_te?.[3] || ''}
                    onChange={(e) => {
                      const opts = [...(editingQuestion.options_te || ['', '', '', ''])];
                      opts[3] = e.target.value;
                      setEditingQuestion({ ...editingQuestion, options_te: opts });
                    }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Correct Option (0-3)</label>
                <input
                  type="number"
                  min="0"
                  max="3"
                  value={editingQuestion.correct_option}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, correct_option: parseInt(e.target.value) })}
                  className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Explanation (English)</label>
                <textarea
                  value={editingQuestion.explanation_en || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation_en: e.target.value })}
                  className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 min-h-[80px]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Explanation (Telugu)</label>
                <textarea
                  value={editingQuestion.explanation_te || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation_te: e.target.value })}
                  className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 min-h-[80px]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
