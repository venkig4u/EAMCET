'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen,
  StopCircle,
  Check,
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
import PdfComparisonViewer, { VerifyPaperItem } from '@/components/admin/PdfComparisonViewer';
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
  const [defaultSubject, setDefaultSubject] = useState<'Mathematics' | 'Physics' | 'Chemistry' | 'Botany' | 'Zoology'>('Mathematics');

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

  // Folder / Batch PDF Mode State
  const [extractMode, setExtractMode] = useState<'single' | 'folder'>('single');
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [scannedPdfs, setScannedPdfs] = useState<Array<{
    id: string;
    file: File;
    name: string;
    relativePath: string;
    sizeBytes: number;
    state: 'AP' | 'TG';
    year: number;
    stream: 'engineering' | 'agriculture-pharmacy';
    shift: string;
    subject: 'Auto-Detect' | 'Mathematics' | 'Physics' | 'Chemistry' | 'Botany' | 'Zoology';
    status: 'idle' | 'checking' | 'extracting' | 'completed' | 'partial' | 'error';
    extractedCount?: number;
    inDbCount?: number;
    expectedCount?: number;
    missingCount?: number;
    isPartial?: boolean;
    isOvercount?: boolean;
    subjectBreakdown?: Record<string, number>;
    progressMsg?: string;
    error?: string;
    supervisedText?: string;
  }>>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isSyncingDiagrams, setIsSyncingDiagrams] = useState(false);
  const [syncResultMsg, setSyncResultMsg] = useState<string | null>(null);
  const [verifyModalItem, setVerifyModalItem] = useState<VerifyPaperItem | null>(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [currentProcessingIdx, setCurrentProcessingIdx] = useState<number>(-1);
  const [batchStats, setBatchStats] = useState({
    total: 0,
    completed: 0,
    errors: 0,
    totalQuestions: 0,
  });
  const [supervisedLogs, setSupervisedLogs] = useState<string[]>([]);
  const abortBatchRef = useRef<boolean>(false);

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
   - "subject": "${defaultSubject}" (or detect: "Mathematics", "Physics", "Chemistry", "Botany", "Zoology")
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
      const models = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-2.5-flash'];
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

  // ── Helper: Detect PDF Metadata from Filename & Relative Path ──
  const detectPdfMetadata = (
    fileName: string,
    relativePath: string,
    fallback: { state: 'AP' | 'TG'; year: number; stream: 'Engineering' | 'Agriculture'; shift: string; subject: string }
  ) => {
    const full = `${relativePath || ''} ${fileName}`.toLowerCase();

    // 1. State detection (handles AP_, TG_, TS_, AP-EAPCET, etc.)
    let detectedState: 'AP' | 'TG' = fallback.state;
    if (/(?:^|[^a-z0-9])(tg|ts|telangana)(?:[^a-z0-9]|$)/i.test(full) || /ts[-_]?eamcet/i.test(full) || /tg[-_]?eapcet/i.test(full)) {
      detectedState = 'TG';
    } else if (/(?:^|[^a-z0-9])(ap|andhra)(?:[^a-z0-9]|$)/i.test(full) || /ap[-_]?eamcet/i.test(full) || /ap[-_]?eapcet/i.test(full)) {
      detectedState = 'AP';
    }

    // 2. Year detection (looks for 2015 - 2035; works with attached words like 21May2025 or 2025_Shift1)
    let detectedYear = fallback.year;
    const yearMatch = full.match(/(?<!\d)(20[1-3]\d)(?!\d)/);
    if (yearMatch) {
      detectedYear = parseInt(yearMatch[1], 10);
    }

    // 3. Stream detection
    let detectedStream: 'engineering' | 'agriculture-pharmacy' =
      fallback.stream === 'Agriculture' ? 'agriculture-pharmacy' : 'engineering';
    if (/(?:^|[^a-z0-9])(am|agri|agriculture|pharmacy|medical)(?:[^a-z0-9]|$)/i.test(full)) {
      detectedStream = 'agriculture-pharmacy';
    } else if (/(?:^|[^a-z0-9])(eng|engg|engineering|e)(?:[^a-z0-9]|$)/i.test(full)) {
      detectedStream = 'engineering';
    }

    // 4. Date detection (e.g. '21May', '21 May', '21_May', '18 May')
    let dateStr = '';
    const dateMatch = full.match(/(?:^|[^a-z0-9])(\d{1,2})[\s_-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const m = dateMatch[2];
      const month = m.charAt(0).toUpperCase() + m.slice(1, 3).toLowerCase();
      dateStr = `${day} ${month}`;
    }

    // 5. Shift detection
    let shiftNum = '';
    let sessionLabel = '';
    if (/shift[\s_-]?2|\ban\b|afternoon/i.test(full)) {
      shiftNum = '2';
      sessionLabel = 'AN';
    } else if (/shift[\s_-]?1|\bfn\b|forenoon|morning/i.test(full)) {
      shiftNum = '1';
      sessionLabel = 'FN';
    } else if (/shift[\s_-]?3|evening/i.test(full)) {
      shiftNum = '3';
      sessionLabel = 'Evening';
    } else {
      const shiftMatch = full.match(/shift[\s_-]?(\d)/i);
      if (shiftMatch) {
        shiftNum = shiftMatch[1];
        sessionLabel = shiftNum === '1' ? 'FN' : (shiftNum === '2' ? 'AN' : '');
      }
    }

    let detectedShift = fallback.shift;
    if (shiftNum) {
      if (dateStr) {
        detectedShift = sessionLabel
          ? `${dateStr} Shift-${shiftNum} (${sessionLabel})`
          : `${dateStr} Shift-${shiftNum}`;
      } else {
        detectedShift = sessionLabel
          ? `Shift-${shiftNum} (${sessionLabel})`
          : `Shift-${shiftNum}`;
      }
    }

    // 6. Subject detection
    let detectedSubject: 'Auto-Detect' | 'Mathematics' | 'Physics' | 'Chemistry' | 'Botany' | 'Zoology' = 'Auto-Detect';
    if (/math|mathematics/i.test(full)) detectedSubject = 'Mathematics';
    else if (/phys|physics/i.test(full)) detectedSubject = 'Physics';
    else if (/chem|chemistry/i.test(full)) detectedSubject = 'Chemistry';
    else if (/botany|bot/i.test(full)) detectedSubject = 'Botany';
    else if (/zoology|zoo/i.test(full)) detectedSubject = 'Zoology';

    return {
      state: detectedState,
      year: detectedYear,
      stream: detectedStream,
      shift: detectedShift,
      subject: detectedSubject,
    };
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(base64);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  };

  const formatSupervisedText = (fileItem: any, questions: any[]): string => {
    const lines: string[] = [
      `================================================================================`,
      `📄 [SUPERVISED TEXT ENTRY] FILE: ${fileItem.name} (${(fileItem.sizeBytes / 1024 / 1024).toFixed(2)} MB)`,
      `📌 Path: ${fileItem.relativePath || fileItem.name}`,
      `🏛️ Exam: ${fileItem.state} EAPCET | Year: ${fileItem.year} | Stream: ${fileItem.stream} | Shift: ${fileItem.shift}`,
      `📚 Subject: ${fileItem.subject} | Questions Extracted: ${questions.length}`,
      `⏰ Processed At: ${new Date().toLocaleString()}`,
      `================================================================================\n`,
    ];

    questions.forEach((q, idx) => {
      lines.push(
        `[Q${idx + 1}] Subject: ${q.subject} | Topic: ${q.topic} | Correct: Option (${(q.correct_option ?? 0) + 1})`,
        `[EN Text]: ${q.question_text_en}`,
        q.question_text_te ? `[TE Text]: ${q.question_text_te}` : '',
        `[Options]:`,
        `  (1) ${q.options_en?.[0] || ''}${q.options_te?.[0] ? '  [తెలుగు: ' + q.options_te[0] + ']' : ''}`,
        `  (2) ${q.options_en?.[1] || ''}${q.options_te?.[1] ? '  [తెలుగు: ' + q.options_te[1] + ']' : ''}`,
        `  (3) ${q.options_en?.[2] || ''}${q.options_te?.[2] ? '  [తెలుగు: ' + q.options_te[2] + ']' : ''}`,
        `  (4) ${q.options_en?.[3] || ''}${q.options_te?.[3] ? '  [తెలుగు: ' + q.options_te[3] + ']' : ''}`,
        q.explanation_en ? `[Explanation EN]: ${q.explanation_en}` : '',
        q.explanation_te ? `[Explanation TE]: ${q.explanation_te}` : '',
        `--------------------------------------------------------------------------------\n`
      );
    });

    return lines.filter(Boolean).join('\n');
  };

  // ── Database Verification for Single Paper ──
  const checkSinglePdfInDb = async (item: {
    state: 'AP' | 'TG';
    year: number;
    stream: 'engineering' | 'agriculture-pharmacy' | 'Engineering' | 'Agriculture';
    shift: string;
    subject?: string;
  }) => {
    if (!supabase) return { count: 0, bySubject: {} as Record<string, number> };
    const normStream = item.stream.toLowerCase().includes('agri') ? 'Agriculture' : 'Engineering';
    try {
      const { data, count } = await supabase
        .from('questions')
        .select('question_id, subject', { count: 'exact' })
        .eq('is_previous_year', true)
        .eq('state', item.state)
        .eq('year', item.year)
        .eq('stream', normStream)
        .eq('shift', item.shift);

      const bySubject: Record<string, number> = {};
      if (data) {
        data.forEach((r: any) => {
          if (r.subject) bySubject[r.subject] = (bySubject[r.subject] || 0) + 1;
        });
      }
      return { count: count ?? (data?.length || 0), bySubject };
    } catch (err) {
      console.warn('Error checking paper in DB:', err);
      return { count: 0, bySubject: {} as Record<string, number> };
    }
  };

  const checkAllPdfsInDb = async (itemsToCheck?: typeof scannedPdfs) => {
    const targetItems = itemsToCheck || scannedPdfs;
    if (targetItems.length === 0 || !supabase) return;

    setScannedPdfs(prev => prev.map(item => {
      const inTarget = targetItems.some(t => t.id === item.id);
      return inTarget && item.status !== 'extracting' ? { ...item, status: 'checking', progressMsg: 'Checking DB...' } : item;
    }));

    let totalInDb = 0;
    let completedCount = 0;

    const updated = await Promise.all(targetItems.map(async (item) => {
      const isEng = item.stream === 'engineering';
      const expected = (item.subject === 'Auto-Detect' || !item.subject)
        ? 160
        : (item.subject === 'Mathematics' || item.subject === 'Botany' || item.subject === 'Zoology' ? 80 : 40);

      const res = await checkSinglePdfInDb(item);
      const count = res.count;
      const isComplete = count >= expected;
      const isOvercount = count > expected;
      const isPartial = count > 0 && count < expected;
      const missingCount = Math.max(0, expected - count);

      totalInDb += count;
      if (isComplete) completedCount++;

      return {
        ...item,
        status: (isComplete ? 'completed' : isPartial ? 'partial' : 'idle') as any,
        inDbCount: count,
        expectedCount: expected,
        missingCount,
        isPartial,
        isOvercount,
        subjectBreakdown: res.bySubject,
        progressMsg: undefined,
      };
    }));

    setScannedPdfs(prev => prev.map(item => {
      const match = updated.find(u => u.id === item.id);
      return match || item;
    }));

    setBatchStats(prev => ({
      ...prev,
      completed: completedCount,
      totalQuestions: totalInDb,
    }));
  };

  const handleCheckSinglePdfDb = async (id: string) => {
    const item = scannedPdfs.find(f => f.id === id);
    if (!item) return;
    setScannedPdfs(prev => prev.map(f => f.id === id ? { ...f, status: 'checking', progressMsg: 'Checking DB...' } : f));
    const expected = (item.subject === 'Auto-Detect' || !item.subject) ? 160 : (item.subject === 'Mathematics' || item.subject === 'Botany' || item.subject === 'Zoology' ? 80 : 40);
    const res = await checkSinglePdfInDb(item);
    const isComplete = res.count >= expected;
    const isOvercount = res.count > expected;
    const isPartial = res.count > 0 && res.count < expected;
    const missingCount = Math.max(0, expected - res.count);
    setScannedPdfs(prev => prev.map(f => f.id === id ? {
      ...f,
      status: (isComplete ? 'completed' : isPartial ? 'partial' : 'idle') as any,
      inDbCount: res.count,
      expectedCount: expected,
      missingCount,
      isPartial,
      isOvercount,
      subjectBreakdown: res.bySubject,
      progressMsg: undefined,
    } : f));
  };

  const handleCleanDuplicatesForPdf = async (id: string) => {
    const item = scannedPdfs.find(f => f.id === id);
    if (!item || !supabase) return;

    // Show "Cleaning..." in the row immediately — no popup
    setScannedPdfs(prev => prev.map(f => f.id === id ? { ...f, status: 'checking', progressMsg: 'Removing duplicates...' } : f));

    const dbStream = item.stream === 'engineering' ? 'Engineering' : 'Agriculture';
    try {
      const { data: rows } = await supabase
        .from('questions')
        .select('question_id, question_text_en, created_at')
        .eq('is_previous_year', true)
        .eq('state', item.state)
        .eq('year', item.year)
        .eq('stream', dbStream)
        .eq('shift', item.shift)
        .order('created_at', { ascending: true });

      if (!rows || rows.length === 0) {
        await handleCheckSinglePdfDb(id);
        return;
      }

      const seenStems = new Set<string>();
      const idsToDelete: string[] = [];

      rows.forEach((r: any) => {
        const stem = normalizeQuestionStem(r.question_text_en || '');
        if (seenStems.has(stem)) {
          idsToDelete.push(r.question_id);
        } else {
          seenStems.add(stem);
        }
      });

      if (idsToDelete.length > 0) {
        for (let i = 0; i < idsToDelete.length; i += 50) {
          const chunk = idsToDelete.slice(i, i + 50);
          await supabase.from('questions').delete().in('question_id', chunk);
        }
      }
      // Re-check DB to update row count
      await handleCheckSinglePdfDb(id);
      checkDatabase();
    } catch (err: any) {
      setScannedPdfs(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: 'Clean failed: ' + err.message, progressMsg: undefined } : f));
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const list: typeof scannedPdfs = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const relPath = (file as any).webkitRelativePath || file.name;
        const meta = detectPdfMetadata(file.name, relPath, {
          state,
          year,
          stream,
          shift,
          subject: defaultSubject
        });
        list.push({
          id: `pdf-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
          file,
          name: file.name,
          relativePath: relPath,
          sizeBytes: file.size,
          state: meta.state,
          year: meta.year,
          stream: meta.stream,
          shift: meta.shift,
          subject: meta.subject,
          status: 'idle',
        });
      }
    }

    setScannedPdfs(list);
    setBatchStats({
      total: list.length,
      completed: 0,
      errors: 0,
      totalQuestions: 0,
    });
    e.target.value = '';
    checkAllPdfsInDb(list);
  };

  const handleUpdateScannedPdf = async (id: string, updates: Partial<(typeof scannedPdfs)[0]>) => {
    const isIdentityChange = 'state' in updates || 'year' in updates || 'stream' in updates || 'shift' in updates || 'subject' in updates;

    // Immediately reflect the UI selection change
    setScannedPdfs(prev => prev.map(item => item.id === id ? {
      ...item,
      ...updates,
      ...(isIdentityChange ? { status: 'checking', progressMsg: 'Checking DB...' } : {})
    } : item));

    // If State, Year, Stream, Shift, or Subject changed, re-verify with the database
    if (isIdentityChange && supabase) {
      const current = scannedPdfs.find(item => item.id === id);
      if (!current) return;
      const updatedItem = { ...current, ...updates };

      const isEng = updatedItem.stream === 'engineering';
      const expected = (updatedItem.subject === 'Auto-Detect' || !updatedItem.subject)
        ? 160
        : (updatedItem.subject === 'Mathematics' || updatedItem.subject === 'Botany' || updatedItem.subject === 'Zoology' ? 80 : 40);

      const res = await checkSinglePdfInDb(updatedItem);
      const isComplete = res.count >= expected;
      const isOvercount = res.count > expected;
      const isPartial = res.count > 0 && res.count < expected;
      const missingCount = Math.max(0, expected - res.count);

      setScannedPdfs(prev => {
        const nextList = prev.map(f => f.id === id ? {
          ...f,
          ...updates,
          status: (isComplete ? 'completed' : isPartial ? 'partial' : 'idle') as any,
          inDbCount: res.count,
          expectedCount: expected,
          missingCount,
          isPartial,
          isOvercount,
          subjectBreakdown: res.bySubject,
          progressMsg: undefined,
        } : f);

        const totalInDb = nextList.reduce((acc, f) => acc + (f.inDbCount ?? 0), 0);
        const completedCount = nextList.filter(f => f.status === 'completed' || ((f.inDbCount || 0) >= (f.expectedCount || 160))).length;
        setBatchStats(b => ({
          ...b,
          completed: completedCount,
          totalQuestions: totalInDb,
        }));

        return nextList;
      });
    }
  };

  const handleClearScannedPdfs = () => {
    if (isBatchProcessing) {
      alert('Batch process is currently running. Please stop it first.');
      return;
    }
    setScannedPdfs([]);
    setBatchStats({ total: 0, completed: 0, errors: 0, totalQuestions: 0 });
    setCurrentProcessingIdx(-1);
  };

  // ── High-Fidelity Chunked Batch Extractor with Multi-Pass Auto-Healing ──
  const processSinglePdfFile = async (
    item: (typeof scannedPdfs)[0],
    apiKey: string,
    onProgress?: (count: number, msg: string, liveSubjects?: Record<string, number>) => void,
    skipToHealOnly?: boolean
  ) => {
    const base64 = await convertFileToBase64(item.file);
    const isEng = item.stream === 'engineering';
    const totalQuestions = (item.subject === 'Auto-Detect' || !item.subject)
      ? 160
      : (item.subject === 'Mathematics' || item.subject === 'Botany' || item.subject === 'Zoology' ? 80 : 40);

    const dbStream = isEng ? 'Engineering' : 'Agriculture';

    const paperNormalizedStems = new Set<string>();
    const paperRawPrefixes = new Set<string>();
    const paperQNums = new Set<number>();
    const subjectCounts: Record<string, number> = {
      Mathematics: 0,
      Physics: 0,
      Chemistry: 0,
      Botany: 0,
      Zoology: 0
    };

    let initialInDbCount = 0;
    try {
      if (supabase) {
        const { data: existingRows } = await supabase
          .from('questions')
          .select('question_id, question_text_en, explanation_en, subject')
          .eq('is_previous_year', true)
          .eq('state', item.state)
          .eq('year', item.year)
          .eq('stream', dbStream)
          .eq('shift', item.shift);

        if (existingRows && existingRows.length > 0) {
          initialInDbCount = existingRows.length;
          existingRows.forEach((r: any) => {
            if (r.question_text_en) {
              const norm = normalizeQuestionStem(r.question_text_en);
              if (norm) paperNormalizedStems.add(norm);
              paperRawPrefixes.add(r.question_text_en.trim().slice(0, 60).toLowerCase());
            }
            const m = (r.explanation_en || '').match(/\bQ(\d+)\b/i);
            if (m) paperQNums.add(parseInt(m[1], 10));
            if (r.subject && subjectCounts[r.subject] !== undefined) {
              subjectCounts[r.subject]++;
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not query existing paper records:', e);
    }

    if (initialInDbCount >= totalQuestions) {
      if (onProgress) onProgress(initialInDbCount, `Already Complete (${initialInDbCount}/${totalQuestions}) - 100%`);
      return {
        count: initialInDbCount,
        totalInsertedInThisRun: 0,
        isComplete: true,
        isOvercount: initialInDbCount > totalQuestions,
        supervisedLog: `Paper already 100% complete in database (${initialInDbCount} questions).`
      };
    }

    // ── Shared: needed by both main batch loop AND auto-heal ──
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview'
    ];
    const allExtractedQuestions: any[] = [];
    let totalInserted = 0;

    const callGeminiWithFallback = async (promptText: string, label: string) => {
      for (const model of candidateModels) {
        if (abortBatchRef.current) break;
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (abortBatchRef.current) break;
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            if (apiKey.startsWith('ya29.')) {
              headers['Authorization'] = `Bearer ${apiKey}`;
            } else {
              headers['x-goog-api-key'] = apiKey;
              url += `?key=${encodeURIComponent(apiKey)}`;
            }
            const res = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: base64 } }, { text: promptText }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.15, maxOutputTokens: 16384 }
              })
            });
            if (res.status === 429 || res.status === 503) {
              if (res.status === 503) {
                if (onProgress) onProgress(initialInDbCount + totalInserted, `${label} [${model}]: Busy (503). Switching to fast model...`);
                break;
              }

              let isDailyQuotaExhausted = false;
              try {
                const errData = await res.json();
                const errMsg = errData?.error?.message || '';
                if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted') || errMsg.includes('PerDay')) {
                  isDailyQuotaExhausted = true;
                }
              } catch {}

              if (isDailyQuotaExhausted) {
                if (onProgress) onProgress(initialInDbCount + totalInserted, `${label} [${model}]: Daily quota reached. Trying next model...`);
                break;
              }

              const waitSec = 3;
              if (onProgress) onProgress(initialInDbCount + totalInserted, `${label} [${model}] Busy (${waitSec}s wait · Attempt ${attempt}/2...)`);
              await new Promise(r => setTimeout(r, waitSec * 1000));
              continue;
            }
            if (!res.ok) break;
            const data = await res.json();
            const candidate = data?.candidates?.[0];

            // Handle recitation copyright filter on standard textbook problems
            if (candidate?.finishReason === 'RECITATION') {
              console.warn(`[${model}] RECITATION triggered. Retrying with paraphrased conceptual prompt...`);
              const rephrasePrompt = `${promptText}\n\nIMPORTANT COPYRIGHT NOTE: Transcribe by paraphrasing the question statement in clear conceptual English using LaTeX math variables (avoid verbatim identical phrases to prevent automated recitation filter trips).`;
              try {
                const retryRes = await fetch(url, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: base64 } }, { text: rephrasePrompt }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 16384 }
                  })
                });
                if (retryRes.ok) {
                  const retryData = await retryRes.json();
                  const retryCand = retryData?.candidates?.[0];
                  if (retryCand && retryCand.finishReason !== 'RECITATION') {
                    const retryText = retryCand.content?.parts?.find((p: any) => p.text && !p.thought)?.text || retryCand.content?.parts?.[0]?.text;
                    if (retryText) {
                      const retryParsed = safeParseJsonQuestions(retryText);
                      if (Array.isArray(retryParsed) && retryParsed.length > 0) return retryParsed;
                    }
                  }
                }
              } catch {}
              continue;
            }

            const text = candidate?.content?.parts?.find((p: any) => p.text && !p.thought)?.text
              || candidate?.content?.parts?.[0]?.text;
            if (!text) continue;
            const parsed = safeParseJsonQuestions(text);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          } catch (err: any) {
            console.warn(`Error on ${model} attempt ${attempt}:`, err.message);
            await new Promise(r => setTimeout(r, 1500));
          }
        }
      }
      return [];
    };

    // ── SKIP main batch loop when retrying missing only (go straight to targeted heal) ──
    if (!skipToHealOnly) {
    const BATCH_SIZE = 10;
    const batches: { start: number; end: number; subjectHint: string; qRange: string }[] = [];
    for (let s = 1; s <= totalQuestions; s += BATCH_SIZE) {
      const e = Math.min(s + BATCH_SIZE - 1, totalQuestions);
      let hint = item.subject !== 'Auto-Detect' ? item.subject : (
        isEng
          ? (s <= 80 ? 'Mathematics' : s <= 120 ? 'Physics' : 'Chemistry')
          : (s <= 40 ? 'Botany' : s <= 80 ? 'Zoology' : s <= 120 ? 'Physics' : 'Chemistry')
      );

      let allBatchQNumsExist = true;
      for (let qn = s; qn <= e; qn++) {
        if (!paperQNums.has(qn)) {
          allBatchQNumsExist = false;
          break;
        }
      }

      const expectedSubjectLimit = hint === 'Mathematics' ? 80 : 40;
      const currentSubjectCount = subjectCounts[hint] || 0;

      if ((allBatchQNumsExist && paperQNums.size > 0) || currentSubjectCount >= expectedSubjectLimit) {
        continue;
      }

      batches.push({ start: s, end: e, subjectHint: hint, qRange: `Q${s}-Q${e}` });
    }

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (abortBatchRef.current) break;

      const { start, end, subjectHint, qRange } = batches[bIdx];
      const batchLabel = `Batch ${bIdx + 1}/${batches.length} (${qRange} · ${subjectHint})`;
      const currentTotal = initialInDbCount + totalInserted;

      if (onProgress) onProgress(currentTotal, `${batchLabel} (Reading AI...)`);

      const prompt = `This document is the official ${item.state} EAPCET ${item.year} (${item.stream}) Shift ${item.shift} Question Paper.
Carefully examine the pages and extract Question Number ${start} through Question Number ${end} (inclusive).
All questions in this range belong to ${subjectHint}.

CRITICAL REQUIREMENTS:
1. "q_number": integer question number (${start} to ${end}).
2. "subject": "${subjectHint}".
3. "topic": Specific Intermediate chapter/topic name (e.g. "Matrices", "Complex Numbers", "Thermodynamics", "Organic Chemistry", "Kinematics", etc.).
4. "question_text_en": The English question text with standard LaTeX ($...$) for math/chemical equations and matrices (\\begin{bmatrix}...\\end{bmatrix}).
5. "question_text_te": The exact Telugu translation from the paper image.
6. "options_en": Array of 4 English options [opt1, opt2, opt3, opt4] with LaTeX.
7. "options_te": Array of 4 Telugu options [opt1_te, opt2_te, opt3_te, opt4_te].
8. "correct_option": The 0-based integer index (0, 1, 2, or 3) of the correct answer (look for marked key/green tick).
9. "explanation_en": Brief 1-2 sentence step-by-step solution.
10. "explanation_te": Brief Telugu explanation.
11. "difficulty": "Medium".
12. "image_url": Inline SVG (<svg viewBox="0 0 360 200" width="100%" style="max-width:400px;margin:auto;display:block;" stroke="currentColor" fill="none">...</svg>) if diagram/graph/circuit present, else null.

Return ONLY a valid JSON array of ${end - start + 1} question objects. Do not wrap in markdown.`;

      const batchExtracted = await callGeminiWithFallback(prompt, batchLabel);

      if (batchExtracted.length > 0) {
        const toInsert: any[] = [];

        batchExtracted.forEach((q: any, idx: number) => {
          if (!q.question_text_en || q.question_text_en.trim().length < 8) return;

          const targetSub = q.subject || subjectHint;
          const currentSubCount = subjectCounts[targetSub] || 0;
          const subLimit = targetSub === 'Mathematics' ? 80 : 40;
          if (currentSubCount >= subLimit) {
            return;
          }

          const normStem = normalizeQuestionStem(q.question_text_en);
          if (normStem && paperNormalizedStems.has(normStem)) {
            return;
          }

          const rawPrefix = q.question_text_en.trim().slice(0, 60).toLowerCase();
          if (rawPrefix && paperRawPrefixes.has(rawPrefix)) {
            return;
          }

          const qNum = typeof q.q_number === 'number' ? q.q_number : (start + idx);
          if (paperQNums.has(qNum)) {
            return;
          }

          const placeCheck = isPlaceholderQuestion(q);
          if (placeCheck.isPlaceholder) {
            return;
          }

          toInsert.push({
            subject: q.subject || subjectHint,
            topic: q.topic || 'General PYQ',
            question_text_en: q.question_text_en,
            question_text_te: q.question_text_te || q.question_text_en,
            options_en: Array.isArray(q.options_en) ? q.options_en : [],
            options_te: Array.isArray(q.options_te) ? q.options_te : (q.options_en || []),
            correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0,
            explanation_en: q.explanation_en
              ? (q.explanation_en.startsWith(`Q${qNum}`) ? q.explanation_en : `Q${qNum}: ${q.explanation_en}`)
              : `Q${qNum} - ${item.state} EAPCET ${item.year} ${item.stream} Shift ${item.shift}`,
            explanation_te: q.explanation_te || `Q${qNum} - ${item.state} EAPCET ${item.year} ${item.stream} Shift ${item.shift}`,
            is_previous_year: true,
            state: item.state,
            year: item.year,
            stream: dbStream,
            shift: item.shift,
            difficulty: q.difficulty || 'Medium',
            image_url: (q.image_url && typeof q.image_url === 'string' && q.image_url.includes('<svg')) ? q.image_url : null,
            _tempQNum: qNum
          });
        });

        if (toInsert.length > 0) {
          const insertPayload = toInsert.map(({ _tempQNum, ...rest }) => rest);
          const insertRes = await insertQuestions(insertPayload);
          if (insertRes.success) {
            const addedCount = insertRes.count ?? toInsert.length;
            totalInserted += addedCount;
            allExtractedQuestions.push(...insertPayload);

            toInsert.forEach((q: any) => {
              const norm = normalizeQuestionStem(q.question_text_en);
              if (norm) paperNormalizedStems.add(norm);
              paperRawPrefixes.add(q.question_text_en.trim().slice(0, 60).toLowerCase());
              if (q._tempQNum) paperQNums.add(q._tempQNum);
              if (q.subject && subjectCounts[q.subject] !== undefined) {
                subjectCounts[q.subject]++;
              }
            });

            const liveTotal = initialInDbCount + totalInserted;
            if (onProgress) onProgress(liveTotal, `${batchLabel} (Saved +${addedCount} · Total: ${liveTotal}/${totalQuestions})`, { ...subjectCounts });
          }
        } else {
          if (onProgress) onProgress(initialInDbCount + totalInserted, `${batchLabel} (All existing in this paper · Skipped)`, { ...subjectCounts });
        }
      }

      if (bIdx < batches.length - 1 && !abortBatchRef.current) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    } // end: if (!skipToHealOnly)

    const MAX_AUTO_HEAL_ROUNDS = 4;
    let autoHealRound = 1;

    while (!abortBatchRef.current && (initialInDbCount + totalInserted) < totalQuestions && autoHealRound <= MAX_AUTO_HEAL_ROUNDS) {
      const currentLiveTotal = initialInDbCount + totalInserted;
      const missingTotal = totalQuestions - currentLiveTotal;

      const getSubjectRange = (sub: string): [number, number] => {
        if (isEng) {
          if (sub === 'Mathematics') return [1, 80];
          if (sub === 'Physics') return [81, 120];
          return [121, 160];
        } else {
          if (sub === 'Botany') return [1, 40];
          if (sub === 'Zoology') return [41, 80];
          if (sub === 'Physics') return [81, 120];
          return [121, 160];
        }
      };

      const getMissingQNumsForSubject = (sub: string): number[] => {
        const [minQ, maxQ] = getSubjectRange(sub);
        const missing: number[] = [];
        for (let q = minQ; q <= maxQ; q++) {
          if (!paperQNums.has(q)) missing.push(q);
        }
        return missing;
      };

      const mathNeeded = isEng ? Math.max(0, 80 - (subjectCounts.Mathematics || 0)) : 0;
      const phyNeeded = Math.max(0, 40 - (subjectCounts.Physics || 0));
      const chemNeeded = Math.max(0, 40 - (subjectCounts.Chemistry || 0));
      const botNeeded = !isEng ? Math.max(0, 40 - (subjectCounts.Botany || 0)) : 0;
      const zooNeeded = !isEng ? Math.max(0, 40 - (subjectCounts.Zoology || 0)) : 0;

      const healTasks: { subject: string; needed: number; targetQNums: number[]; startIdx: number }[] = [];
      const subjectsToCheck = isEng
        ? [{ sub: 'Mathematics', needed: mathNeeded }, { sub: 'Physics', needed: phyNeeded }, { sub: 'Chemistry', needed: chemNeeded }]
        : [{ sub: 'Botany', needed: botNeeded }, { sub: 'Zoology', needed: zooNeeded }, { sub: 'Physics', needed: phyNeeded }, { sub: 'Chemistry', needed: chemNeeded }];

      for (const { sub, needed } of subjectsToCheck) {
        if (needed > 0) {
          const missingQNums = getMissingQNumsForSubject(sub);
          const [minQ] = getSubjectRange(sub);
          healTasks.push({
            subject: sub,
            needed,
            targetQNums: missingQNums,
            startIdx: missingQNums.length > 0 ? missingQNums[0] : (minQ + (subjectCounts[sub] || 0))
          });
        }
      }

      if (healTasks.length === 0) break;

      if (onProgress) onProgress(currentLiveTotal, `Auto-Healing (Round ${autoHealRound}/${MAX_AUTO_HEAL_ROUNDS}): Recovering ${missingTotal} missing Qs...`, { ...subjectCounts });

      let addedInThisRound = 0;

      for (const task of healTasks) {
        if (abortBatchRef.current) break;
        if (task.needed <= 0) continue;

        const chunkSize = Math.min(task.needed, 6);
        const targetsForBatch = task.targetQNums.slice(0, chunkSize);
        const targetDesc = targetsForBatch.length > 0
          ? `Question Number ${targetsForBatch.join(', ')}`
          : `Question around ${task.startIdx} to ${task.startIdx + chunkSize - 1}`;
        const healLabel = `Auto-Heal ${task.subject} (${targetDesc})`;

        const rescuePrompt = `This document is the official ${item.state} EAPCET ${item.year} (${item.stream}) Shift ${item.shift} Question Paper.
Carefully review the ${task.subject} section of this question paper.
CRITICAL: The database is specifically missing ${targetDesc}. Locate and extract ${targetDesc} from the ${task.subject} section that are present in the paper.
For each question:
1. "q_number": integer question number (specifically ${targetDesc}).
2. "subject": "${task.subject}".
3. "topic": Specific Intermediate chapter name.
4. "question_text_en": English question text with LaTeX math ($...$).
5. "question_text_te": Exact Telugu translation.
6. "options_en": Array of 4 English options with LaTeX.
7. "options_te": Array of 4 Telugu options.
8. "correct_option": 0-based integer index (0-3).
9. "explanation_en": Step-by-step English explanation.
10. "explanation_te": Telugu explanation.
11. "difficulty": "Medium".
12. "image_url": Inline SVG (<svg viewBox="0 0 360 200" width="100%" style="max-width:400px;margin:auto;display:block;" stroke="currentColor" fill="none">...</svg>) if diagram present, else null.

Return ONLY a valid JSON array of question objects.`;

        const rescueExtracted = await callGeminiWithFallback(rescuePrompt, healLabel);

        if (rescueExtracted.length > 0) {
          const rescueToInsert: any[] = [];

          rescueExtracted.forEach((q: any, idx: number) => {
            if (!q.question_text_en || q.question_text_en.trim().length < 8) return;

            const rescueSub = q.subject || task.subject;
            const currentCount = subjectCounts[rescueSub] || 0;
            const limit = rescueSub === 'Mathematics' ? 80 : 40;
            if (currentCount >= limit) return;

            const normStem = normalizeQuestionStem(q.question_text_en);
            if (normStem && paperNormalizedStems.has(normStem)) return;
            const rawPrefix = q.question_text_en.trim().slice(0, 60).toLowerCase();
            if (rawPrefix && paperRawPrefixes.has(rawPrefix)) return;

            let qNum: number;
            if (typeof q.q_number === 'number' && task.targetQNums.includes(q.q_number)) {
              qNum = q.q_number;
            } else if (typeof q.q_number === 'number' && !paperQNums.has(q.q_number)) {
              qNum = q.q_number;
            } else if (targetsForBatch.length > idx) {
              qNum = targetsForBatch[idx];
            } else {
              qNum = task.startIdx + idx;
            }
            if (paperQNums.has(qNum)) return;

            rescueToInsert.push({
              subject: q.subject || task.subject,
              topic: q.topic || 'General PYQ',
              question_text_en: q.question_text_en,
              question_text_te: q.question_text_te || q.question_text_en,
              options_en: Array.isArray(q.options_en) ? q.options_en : [],
              options_te: Array.isArray(q.options_te) ? q.options_te : (q.options_en || []),
              correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0,
              explanation_en: q.explanation_en
                ? (q.explanation_en.startsWith(`Q${qNum}`) ? q.explanation_en : `Q${qNum}: ${q.explanation_en}`)
                : `Q${qNum} - ${item.state} EAPCET ${item.year} ${item.stream} Shift ${item.shift}`,
              explanation_te: q.explanation_te || `Q${qNum} - ${item.state} EAPCET ${item.year} ${item.stream} Shift ${item.shift}`,
              is_previous_year: true,
              state: item.state,
              year: item.year,
              stream: dbStream,
              shift: item.shift,
              difficulty: q.difficulty || 'Medium',
              image_url: (q.image_url && typeof q.image_url === 'string' && q.image_url.includes('<svg')) ? q.image_url : null,
              _tempQNum: qNum
            });
          });

          if (rescueToInsert.length > 0) {
            const insertPayload = rescueToInsert.map(({ _tempQNum, ...rest }) => rest);
            const insertRes = await insertQuestions(insertPayload);
            if (insertRes.success) {
              const added = insertRes.count ?? rescueToInsert.length;
              totalInserted += added;
              addedInThisRound += added;
              allExtractedQuestions.push(...insertPayload);
              rescueToInsert.forEach((q: any) => {
                const norm = normalizeQuestionStem(q.question_text_en);
                if (norm) paperNormalizedStems.add(norm);
                paperRawPrefixes.add(q.question_text_en.trim().slice(0, 60).toLowerCase());
                if (q._tempQNum) paperQNums.add(q._tempQNum);
                if (q.subject && subjectCounts[q.subject] !== undefined) {
                  subjectCounts[q.subject]++;
                }
              });
              const newTotal = initialInDbCount + totalInserted;
              if (onProgress) onProgress(newTotal, `Auto-Healed +${added} ${task.subject} Qs (Total: ${newTotal}/${totalQuestions})`, { ...subjectCounts });
            }
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      autoHealRound++;
      if (addedInThisRound === 0) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    const finalTotal = initialInDbCount + totalInserted;
    const isComplete = finalTotal >= totalQuestions;
    const isOvercount = finalTotal > totalQuestions;
    const supervisedLog = formatSupervisedText(item, allExtractedQuestions);

    return {
      count: finalTotal,
      totalInsertedInThisRun: totalInserted,
      isComplete,
      isOvercount,
      supervisedLog
    };
  };

  const handleStartBatchProcessing = async () => {
    if (scannedPdfs.length === 0) {
      alert('Please select a PDF folder first.');
      return;
    }

    const apiKey = customApiKey.trim() || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert('Gemini API key not found in .env.local or settings.');
      return;
    }

    if (!supabaseConnected) {
      alert('Supabase is not connected. Please check .env.local.');
      return;
    }

    // Filter all papers that are not yet complete
    const queue = scannedPdfs.filter(f => 
      f.status !== 'completed' && ((f.inDbCount || 0) < (f.expectedCount || 160))
    );

    if (queue.length === 0) {
      alert('All papers are already complete!');
      return;
    }

    setIsBatchProcessing(true);
    abortBatchRef.current = false;

    const CONCURRENCY = 3;
    let queueIdx = 0;

    const worker = async () => {
      while (queueIdx < queue.length && !abortBatchRef.current) {
        const current = queue[queueIdx++];
        if (!current || abortBatchRef.current) break;

        const isPartialPdf = (current.inDbCount || 0) > 0 && (current.inDbCount || 0) < (current.expectedCount || 160);

        setScannedPdfs(prev => prev.map(f => f.id === current.id ? {
          ...f,
          status: 'extracting',
          error: undefined,
          progressMsg: isPartialPdf ? 'Targeting missing questions...' : 'Starting...'
        } : f));

        try {
          const { count, isComplete, isOvercount, supervisedLog } = await processSinglePdfFile(
            current,
            apiKey,
            (liveCount, msg, liveSubjects) => {
              setScannedPdfs(prev => prev.map(f => f.id === current.id ? {
                ...f,
                progressMsg: msg,
                extractedCount: liveCount,
                inDbCount: liveCount,
                missingCount: Math.max(0, (f.expectedCount || 160) - liveCount),
                subjectBreakdown: liveSubjects || f.subjectBreakdown,
              } : f));
            },
            isPartialPdf // skipToHealOnly: immediately target missing questions if already partially in DB
          );

          setSupervisedLogs(prev => [supervisedLog, ...prev]);

          const expected = current.expectedCount || 160;
          const freshDb = await checkSinglePdfInDb(current);
          const finalCount = freshDb.count > 0 ? freshDb.count : count;
          const finalIsComplete = finalCount >= expected;
          const finalIsPartial = finalCount > 0 && !finalIsComplete;
          const finalMissing = Math.max(0, expected - finalCount);

          setScannedPdfs(prev => {
            const nextList = prev.map(f => f.id === current.id ? {
              ...f,
              status: (finalIsComplete ? 'completed' : finalIsPartial ? 'partial' : 'idle') as any,
              extractedCount: finalCount,
              inDbCount: finalCount,
              missingCount: finalMissing,
              isPartial: finalIsPartial,
              isOvercount: finalCount > expected,
              subjectBreakdown: freshDb.bySubject || f.subjectBreakdown,
              supervisedText: supervisedLog,
              progressMsg: undefined,
            } : f);

            const totalInDb = nextList.reduce((acc, f) => acc + (f.inDbCount ?? 0), 0);
            const completedCount = nextList.filter(f => f.status === 'completed' || ((f.inDbCount || 0) >= (f.expectedCount || 160))).length;
            setBatchStats(b => ({
              ...b,
              completed: completedCount,
              totalQuestions: totalInDb,
            }));

            return nextList;
          });

          checkDatabase();
        } catch (err: any) {
          console.error(`Error in ${current.name}:`, err);
          setBatchStats(b => ({ ...b, errors: b.errors + 1 }));
          setScannedPdfs(prev => prev.map(f => f.id === current.id ? {
            ...f,
            status: 'error',
            error: err.message || 'Processing failed',
            progressMsg: undefined,
          } : f));
        }

        if (!abortBatchRef.current) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    };

    // Run up to 3 workers concurrently
    const activeWorkers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker());
    await Promise.all(activeWorkers);

    setIsBatchProcessing(false);
    setCurrentProcessingIdx(-1);
    checkDatabase();

    // Auto-sync diagrams from local PDFs immediately after batch insertion finishes
    try {
      await handleSyncDiagrams();
    } catch (e) {
      console.warn('Auto-sync diagrams notice:', e);
    }
  };

  const handleSyncDiagrams = async (specificShift?: string) => {
    setIsSyncingDiagrams(true);
    setSyncResultMsg('Syncing authentic diagrams from local PDFs...');
    try {
      const res = await fetch('/api/diagrams/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(specificShift ? { shift: specificShift } : {})
      });
      const data = await res.json();
      if (data.success) {
        setSyncResultMsg('🎉 Authentic diagrams successfully synced from PDFs!');
        setTimeout(() => setSyncResultMsg(null), 8000);
      } else {
        setSyncResultMsg('⚠️ Diagram sync warning: ' + (data.error || 'Check server logs'));
      }
    } catch (err: any) {
      setSyncResultMsg('❌ Diagram sync error: ' + err.message);
    } finally {
      setIsSyncingDiagrams(false);
    }
  };

  const handleStopBatchProcessing = () => {
    abortBatchRef.current = true;
    setIsBatchProcessing(false);
  };

  const handleProcessSinglePdf = async (id: string, retryMissing?: boolean) => {
    const item = scannedPdfs.find(f => f.id === id);
    if (!item) return;

    const apiKey = customApiKey.trim() || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert('Gemini API key not found in .env.local or settings.');
      return;
    }

    setScannedPdfs(prev => prev.map(f => f.id === id ? { ...f, status: 'extracting', error: undefined, progressMsg: retryMissing ? 'Recovering missing questions...' : 'Processing...' } : f));

    try {
      const { count, isComplete, isOvercount, supervisedLog } = await processSinglePdfFile(
        item,
        apiKey,
        (liveCount, msg, liveSubjects) => {
          setScannedPdfs(prev => prev.map(f => f.id === id ? {
            ...f,
            progressMsg: msg,
            extractedCount: liveCount,
            inDbCount: liveCount,
            missingCount: Math.max(0, (f.expectedCount || 160) - liveCount),
            subjectBreakdown: liveSubjects || f.subjectBreakdown,
          } : f));
        },
        retryMissing // skipToHealOnly: jump straight to targeted subject heal, skip 20-batch main loop
      );
      setSupervisedLogs(prev => [supervisedLog, ...prev]);
      const expected = item.expectedCount || 160;
      const freshDb = await checkSinglePdfInDb(item);
      const finalCount = freshDb.count > 0 ? freshDb.count : count;
      const finalIsComplete = finalCount >= expected;
      const finalIsPartial = finalCount > 0 && !finalIsComplete;
      const finalMissing = Math.max(0, expected - finalCount);

      setScannedPdfs(prev => {
        const nextList = prev.map(f => f.id === id ? {
          ...f,
          status: (finalIsComplete ? 'completed' : finalIsPartial ? 'partial' : 'idle') as any,
          extractedCount: finalCount,
          inDbCount: finalCount,
          missingCount: finalMissing,
          isPartial: finalIsPartial,
          isOvercount: finalCount > expected,
          subjectBreakdown: freshDb.bySubject || f.subjectBreakdown,
          supervisedText: supervisedLog,
          progressMsg: undefined,
        } : f);

        const totalInDb = nextList.reduce((acc, f) => acc + (f.inDbCount ?? 0), 0);
        const completedCount = nextList.filter(f => f.status === 'completed' || ((f.inDbCount || 0) >= (f.expectedCount || 160))).length;
        setBatchStats(b => ({
          ...b,
          completed: completedCount,
          totalQuestions: totalInDb,
        }));

        return nextList;
      });
      checkDatabase();
    } catch (err: any) {
      setScannedPdfs(prev => prev.map(f => f.id === id ? {
        ...f,
        status: 'error',
        error: err.message || 'Processing failed',
        progressMsg: undefined,
      } : f));
    }
  };

  const handleDownloadSupervisedTxt = () => {
    if (supervisedLogs.length === 0) {
      alert('No supervised text dataset logs available yet.');
      return;
    }
    const blob = new Blob([supervisedLogs.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eamcet-supervised-dataset-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSupervisedJson = () => {
    if (supervisedLogs.length === 0) {
      alert('ఇంకా ఏవీ సూపర్వైజ్డ్ టెక్స్ట్ డేటా లాగ్స్ లేవు.');
      return;
    }
    const completedItems = scannedPdfs.filter(f => f.status === 'completed');
    const blob = new Blob([JSON.stringify({
      dataset: 'EAPCET Supervised Questions Text Dataset',
      exportedAt: new Date().toISOString(),
      filesCount: completedItems.length,
      logs: supervisedLogs,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eamcet-supervised-dataset-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySupervisedText = () => {
    if (supervisedLogs.length === 0) return;
    navigator.clipboard.writeText(supervisedLogs.join('\n\n'));
    alert('Supervised text dataset copied to clipboard! 📋');
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
              <strong className="font-bold">High-Fidelity AI Vision Extraction:</strong> Mathematical formulas, complex matrices ($A^{-1}$), chemical equations, and bilingual scripts are accurately recognized and rendered using KaTeX.
              <span className="block mt-1 text-blue-700 dark:text-blue-300 font-medium">
                💡 <strong>Tip:</strong> Upload your PDF file below or paste a screenshot using <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border rounded font-mono font-bold">Ctrl + V</kbd>. You can also switch to <strong>Browse Folder (Batch)</strong> to process multiple papers automatically.
              </span>
            </div>
          </div>

          {/* Paper Metadata Config */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
              1. Exam &amp; Paper Metadata (Fallback / Default)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value as 'AP' | 'TG')}
                  className="mt-1 w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="AP">AP EAPCET</option>
                  <option value="TG">TG EAPCET</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="mt-1 w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value={2026}>2026</option>
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
                  <option value="Agriculture">Agriculture &amp; Pharmacy</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Shift</label>
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
                <label className="text-xs font-semibold text-slate-500">Subject</label>
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
            {/* Mode Switcher: Single File vs Folder (Batch) */}
            <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setExtractMode('single')}
                className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  extractMode === 'single'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileUp className="w-4 h-4" />
                <span>Single File / Screenshot</span>
              </button>

              <button
                type="button"
                onClick={() => setExtractMode('folder')}
                className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  extractMode === 'folder'
                    ? 'bg-amber-600 text-white shadow'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                <span>Browse Folder (Batch)</span>
                {scannedPdfs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-bold">
                    {scannedPdfs.length}
                  </span>
                )}
              </button>
            </div>

            {extractMode === 'single' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    2. Upload PDF File or Paste Screenshot
                  </h3>
                  <span className="text-xs text-slate-500 flex items-center space-x-1">
                    <span>Supported: PDF, PNG, JPG</span>
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
                        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600">
                          <FileText className="w-8 h-8" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{selectedFile.name}</p>
                        <p className="text-xs text-slate-500">{(selectedFile.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold underline">
                        Click or drag to choose a different file
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 mx-auto group-hover:scale-110 transition shadow-sm">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          Drop PDF or image here, or paste from clipboard (Ctrl+V)
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          You can also take a screenshot with Snipping Tool and paste directly here
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Extract action button */}
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={handleExtractWithGemini}
                    disabled={isExtracting || !selectedFile}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-2"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI Extracting Questions...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Extract Questions with AI</span>
                      </>
                    )}
                  </button>

                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setExtractedQuestions([]);
                      }}
                      className="p-3 text-slate-400 hover:text-rose-500 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                      title="Clear file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {saveSuccessMsg && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{saveSuccessMsg}</span>
                  </div>
                )}
              </div>
            )}

            {/* MODE 2: BROWSE FOLDER & BATCH AUTO-PROCESS ONE-BY-ONE */}
            {extractMode === 'folder' && (
              <div className="space-y-5">
                {/* Hidden Directory File Input */}
                <input
                  type="file"
                  ref={folderInputRef}
                  {...({ webkitdirectory: '', directory: '' } as any)}
                  multiple
                  accept=".pdf"
                  onChange={handleFolderSelect}
                  className="hidden"
                />

                {/* Folder Selection Trigger Zone */}
                {scannedPdfs.length === 0 ? (
                  <div
                    onClick={() => folderInputRef.current?.click()}
                    className="border-2 border-dashed border-amber-300 dark:border-amber-900/60 hover:border-amber-500 dark:hover:border-amber-600 rounded-2xl p-8 text-center cursor-pointer bg-amber-50/20 dark:bg-amber-950/10 transition-all group space-y-3"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 mx-auto group-hover:scale-110 transition shadow-sm">
                      <FolderOpen className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
                        Select PDF Folder (Browse Folder)
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                        Select any folder on your computer. All PDF files inside will be scanned, and State, Year, Stream, Shift, and Subject will be automatically detected based on file names.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        folderInputRef.current?.click();
                      }}
                      className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold text-xs rounded-xl shadow transition"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>📂 Browse Folder</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Folder Summary & Batch Actions Bar */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                            <FolderOpen className="w-4 h-4" />
                          </span>
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                            {scannedPdfs.length} PDF Files Detected
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            {scannedPdfs.reduce((acc, f) => acc + (f.inDbCount ?? f.extractedCount ?? 0), 0)} Questions in DB
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center flex-wrap gap-x-4 gap-y-1">
                          <span>Completed (160/160): <strong className="text-emerald-600 font-bold">{scannedPdfs.filter(f => f.status === 'completed' || ((f.inDbCount ?? f.extractedCount ?? 0) >= (f.expectedCount || 160))).length}</strong></span>
                          <span>Partial / Incomplete: <strong className="text-amber-600 font-bold">{scannedPdfs.filter(f => f.status === 'partial' || ((f.inDbCount || 0) > 0 && (f.inDbCount || 0) < (f.expectedCount || 160))).length}</strong></span>
                          <span>Missing Qs: <strong className="text-rose-600 font-bold">{scannedPdfs.reduce((acc, f) => acc + (f.missingCount ?? Math.max(0, (f.expectedCount || 160) - (f.inDbCount || 0))), 0)}</strong></span>
                          {scannedPdfs.some(f => f.isOvercount) && (
                            <span>Duplicates in DB: <strong className="text-purple-600 font-bold">{scannedPdfs.filter(f => f.isOvercount).length} papers</strong></span>
                          )}
                        </div>
                      </div>

                      {/* Control Buttons */}
                      <div className="flex items-center flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => checkAllPdfsInDb()}
                          disabled={isBatchProcessing}
                          title="Query database to verify exact live questions count for all papers"
                          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                          <span>Re-check DB</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => folderInputRef.current?.click()}
                          disabled={isBatchProcessing}
                          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Change Folder</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleClearScannedPdfs}
                          disabled={isBatchProcessing}
                          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear</span>
                        </button>

                        {isBatchProcessing ? (
                          <button
                            type="button"
                            onClick={handleStopBatchProcessing}
                            className="inline-flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow transition animate-pulse"
                          >
                            <StopCircle className="w-4 h-4" />
                            <span>Stop Processing</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={handleStartBatchProcessing}
                              disabled={scannedPdfs.length === 0 || scannedPdfs.every(f => f.status === 'completed' || ((f.inDbCount || 0) >= (f.expectedCount || 160)))}
                              className="inline-flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition"
                            >
                              <Zap className="w-4 h-4 fill-white" />
                              <span>
                                {scannedPdfs.some(f => (f.inDbCount || 0) > 0 && (f.inDbCount || 0) < (f.expectedCount || 160))
                                  ? 'Process All Incomplete Papers (Retry Missing)'
                                  : 'Process All One-by-One & Insert into DB'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSyncDiagrams()}
                              disabled={isSyncingDiagrams || isBatchProcessing}
                              className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition"
                              title="Extract and replace authentic diagrams from local PDFs into Supabase"
                            >
                              {isSyncingDiagrams ? (
                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-white" />
                              )}
                              <span>{isSyncingDiagrams ? 'Syncing Diagrams...' : 'Sync PDF Diagrams'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Diagram Sync Notification Banner */}
                    {syncResultMsg && (
                      <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center space-x-2 text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                        {isSyncingDiagrams ? <Loader2 className="w-4 h-4 animate-spin shrink-0 text-indigo-600" /> : <Sparkles className="w-4 h-4 shrink-0 text-indigo-600" />}
                        <span>{syncResultMsg}</span>
                      </div>
                    )}

                    {/* Progress Bar (Visible while processing or completed) */}
                    {(isBatchProcessing || scannedPdfs.some(f => (f.inDbCount ?? f.extractedCount ?? 0) > 0)) && (
                      <div className="space-y-1.5 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-blue-900 dark:text-blue-200">
                            {isBatchProcessing ? (
                              <span className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                                <span>
                                  Processing <strong>{scannedPdfs.filter(f => f.status === 'extracting').length}</strong> papers in parallel (3 concurrent) · 
                                  <strong> {scannedPdfs.filter(f => f.status === 'completed' || ((f.inDbCount || 0) >= (f.expectedCount || 160))).length}</strong> / {scannedPdfs.length} papers completed ({scannedPdfs.reduce((acc, f) => acc + (f.inDbCount ?? f.extractedCount ?? 0), 0)} questions stored)
                                </span>
                              </span>
                            ) : (
                              <span>Batch Status: {scannedPdfs.filter(f => f.status === 'completed' || ((f.inDbCount ?? f.extractedCount ?? 0) >= (f.expectedCount || 160))).length} / {scannedPdfs.length} papers complete ({scannedPdfs.reduce((acc, f) => acc + (f.inDbCount ?? f.extractedCount ?? 0), 0)} questions stored)</span>
                            )}
                          </span>
                          <span className="font-extrabold text-blue-700 dark:text-blue-300">
                            {Math.min(100, Math.round((scannedPdfs.reduce((acc, f) => acc + (f.inDbCount ?? f.extractedCount ?? 0), 0) / Math.max(1, scannedPdfs.reduce((acc, f) => acc + (f.expectedCount || 160), 0))) * 100))}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.round((scannedPdfs.reduce((acc, f) => acc + (f.inDbCount ?? f.extractedCount ?? 0), 0) / Math.max(1, scannedPdfs.reduce((acc, f) => acc + (f.expectedCount || 160), 0))) * 100))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Scanned PDFs Metadata Table */}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                      <div className="max-h-[440px] overflow-x-auto overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse min-w-[1240px]">
                          <thead className="bg-slate-100/90 dark:bg-slate-800/90 sticky top-0 z-10 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                            <tr>
                              <th className="p-2.5 w-10 text-center">#</th>
                              <th className="p-2.5 min-w-[280px]">PDF File (Name &amp; Path)</th>
                              <th className="p-2.5 w-24">State</th>
                              <th className="p-2.5 w-24">Year</th>
                              <th className="p-2.5 w-40">Stream</th>
                              <th className="p-2.5 w-48">Shift</th>
                              <th className="p-2.5 w-40">Subject</th>
                              <th className="p-2.5 min-w-[200px] w-[200px] text-center sticky right-[230px] z-20 bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Status in DB</th>
                              <th className="p-2.5 min-w-[230px] w-[230px] text-center sticky right-0 z-20 bg-slate-100 dark:bg-slate-800">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                            {scannedPdfs.map((item, idx) => {
                              const isComplete = item.status === 'completed' || ((item.inDbCount || 0) >= (item.expectedCount || 160));
                              const isOvercount = (item.inDbCount || 0) > (item.expectedCount || 160);
                              const isPartial = !isComplete && ((item.inDbCount || 0) > 0 || item.status === 'partial');

                              return (
                                <tr
                                  key={item.id}
                                  className={`group transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                                    (item.status === 'extracting' || currentProcessingIdx === idx) ? 'bg-blue-50/40 dark:bg-blue-950/20 ring-1 ring-blue-400' : ''
                                  }`}
                                >
                                  <td className="p-2.5 text-center font-bold text-slate-400 shrink-0">
                                    {idx + 1}
                                  </td>

                                  {/* File Name & Size */}
                                  <td className="p-2.5 min-w-[260px]">
                                    <div className="flex items-start space-x-2">
                                      <FileText className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                      <div className="min-w-0">
                                        <p className="font-bold text-slate-800 dark:text-slate-100 truncate" title={item.name}>
                                          {item.name}
                                        </p>
                                        <p className="text-[10px] text-slate-400 truncate max-w-xs" title={item.relativePath}>
                                          {item.relativePath} • {(item.sizeBytes / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* State Dropdown */}
                                  <td className="p-2.5 w-24">
                                    <select
                                      value={item.state}
                                      disabled={isBatchProcessing}
                                      onChange={(e) => handleUpdateScannedPdf(item.id, { state: e.target.value as 'AP' | 'TG' })}
                                      className="w-20 min-w-[75px] px-2 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                    >
                                      <option value="AP">AP</option>
                                      <option value="TG">TG / TS</option>
                                    </select>
                                  </td>

                                  {/* Year Dropdown */}
                                  <td className="p-2.5 w-24">
                                    <select
                                      value={item.year}
                                      disabled={isBatchProcessing}
                                      onChange={(e) => handleUpdateScannedPdf(item.id, { year: parseInt(e.target.value, 10) })}
                                      className="w-20 min-w-[75px] px-2 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                    >
                                      {[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* Stream Dropdown */}
                                  <td className="p-2.5 w-40">
                                    <select
                                      value={item.stream}
                                      disabled={isBatchProcessing}
                                      onChange={(e) => handleUpdateScannedPdf(item.id, { stream: e.target.value as any })}
                                      className="w-36 min-w-[140px] px-2 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                    >
                                      <option value="engineering">Engineering</option>
                                      <option value="agriculture-pharmacy">Agri &amp; Pharmacy</option>
                                    </select>
                                  </td>

                                  {/* Shift Dropdown with auto-included date-shift option */}
                                  <td className="p-2.5 w-48">
                                    {(() => {
                                      const dMatch = `${item.name} ${item.shift}`.match(/(?:^|[^a-z0-9])(\d{1,2})[\s_-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
                                      let datePrefix = '';
                                      if (dMatch) {
                                        const day = dMatch[1].padStart(2, '0');
                                        const m = dMatch[2];
                                        const month = m.charAt(0).toUpperCase() + m.slice(1, 3).toLowerCase();
                                        datePrefix = `${day} ${month}`;
                                      }
                                      const standardShifts = [
                                        ...(datePrefix ? [`${datePrefix} Shift-1 (FN)`, `${datePrefix} Shift-2 (AN)`] : []),
                                        'Shift-1 (FN)',
                                        'Shift-2 (AN)',
                                        'Shift-1 (FN Morning)',
                                        'Shift-2 (AN Afternoon)',
                                        'Shift-3 (Evening)'
                                      ];
                                      return (
                                        <select
                                          value={item.shift}
                                          disabled={isBatchProcessing}
                                          onChange={(e) => handleUpdateScannedPdf(item.id, { shift: e.target.value })}
                                          className="w-44 min-w-[170px] px-2 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                        >
                                          {item.shift && !standardShifts.includes(item.shift) && (
                                            <option value={item.shift}>{item.shift}</option>
                                          )}
                                          {standardShifts.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                          ))}
                                        </select>
                                      );
                                    })()}
                                  </td>

                                  {/* Subject Dropdown */}
                                  <td className="p-2.5 w-40">
                                    <select
                                      value={item.subject}
                                      disabled={isBatchProcessing}
                                      onChange={(e) => handleUpdateScannedPdf(item.id, { subject: e.target.value as any })}
                                      className="w-36 min-w-[140px] px-2 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                    >
                                      <option value="Auto-Detect">Auto-Detect (160 Qs)</option>
                                      <option value="Mathematics">Mathematics (80 Qs)</option>
                                      <option value="Physics">Physics (40 Qs)</option>
                                      <option value="Chemistry">Chemistry (40 Qs)</option>
                                      <option value="Botany">Botany (40 Qs)</option>
                                      <option value="Zoology">Zoology (40 Qs)</option>
                                    </select>
                                  </td>

                                  {/* Status Badge (Sticky on right) */}
                                  <td className={`p-2.5 text-center min-w-[200px] w-[200px] sticky right-[160px] z-10 border-l border-slate-200 dark:border-slate-800 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] ${
                                    (item.status === 'extracting' || currentProcessingIdx === idx)
                                      ? 'bg-blue-50 dark:bg-blue-950'
                                      : 'bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80'
                                  }`}>
                                    {item.status === 'checking' && (
                                      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        <Loader2 className="w-3 h-3 animate-spin shrink-0 text-blue-500" />
                                        <span>Checking DB...</span>
                                      </span>
                                    )}

                                    {item.status === 'extracting' && (
                                      <div className="flex flex-col items-center gap-1">
                                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 animate-pulse shadow-sm">
                                          <Loader2 className="w-3 h-3 animate-spin shrink-0 text-blue-600" />
                                          <span>{item.inDbCount ?? item.extractedCount ?? 0} / {item.expectedCount || 160}</span>
                                        </span>
                                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium text-center max-w-[170px] truncate" title={item.progressMsg}>
                                          {item.progressMsg || 'Processing AI batch...'}
                                        </span>
                                      </div>
                                    )}

                                    {isOvercount && item.status !== 'extracting' && item.status !== 'checking' && (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                                          <AlertTriangle className="w-3 h-3 text-purple-600 shrink-0" />
                                          <span>⚠️ {item.inDbCount} / {item.expectedCount || 160} (+{(item.inDbCount || 0) - (item.expectedCount || 160)} Dups)</span>
                                        </span>
                                        <span className="text-[10px] text-purple-700 dark:text-purple-400 font-semibold">
                                          Duplicates in DB
                                        </span>
                                        {item.subjectBreakdown && (
                                          <span className="text-[9px] text-slate-500 font-mono">
                                            {item.stream === 'agriculture-pharmacy'
                                              ? `B:${item.subjectBreakdown.Botany || 0} · Z:${item.subjectBreakdown.Zoology || 0} · P:${item.subjectBreakdown.Physics || 0} · C:${item.subjectBreakdown.Chemistry || 0}`
                                              : `M:${item.subjectBreakdown.Mathematics || 0} · P:${item.subjectBreakdown.Physics || 0} · C:${item.subjectBreakdown.Chemistry || 0}`
                                            }
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {!isOvercount && isComplete && item.status !== 'extracting' && item.status !== 'checking' && (
                                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-sm">
                                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                                        <span>✓ {item.inDbCount || item.extractedCount || 160} / {item.expectedCount || 160} Full</span>
                                      </span>
                                    )}

                                    {!isOvercount && isPartial && item.status !== 'extracting' && item.status !== 'checking' && (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                          <span>⚠️ {item.inDbCount} / {item.expectedCount || 160} in DB</span>
                                        </span>
                                        <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                                          {item.missingCount ?? ((item.expectedCount || 160) - (item.inDbCount || 0))} questions missing
                                        </span>
                                        {item.subjectBreakdown && (
                                          <span className="text-[9px] text-slate-500 font-mono">
                                            {item.stream === 'agriculture-pharmacy'
                                              ? `B:${item.subjectBreakdown.Botany || 0} · Z:${item.subjectBreakdown.Zoology || 0} · P:${item.subjectBreakdown.Physics || 0} · C:${item.subjectBreakdown.Chemistry || 0}`
                                              : `M:${item.subjectBreakdown.Mathematics || 0} · P:${item.subjectBreakdown.Physics || 0} · C:${item.subjectBreakdown.Chemistry || 0}`
                                            }
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {item.status === 'idle' && !item.inDbCount && (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        ⏳ 0 / {item.expectedCount || 160} (Ready)
                                      </span>
                                    )}

                                    {item.status === 'error' && (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300">
                                          ❌ Failed ({item.inDbCount || 0} in DB)
                                        </span>
                                        {item.error && (
                                          <span
                                            className="text-[9px] text-rose-600 dark:text-rose-400 text-center max-w-[150px] leading-tight cursor-help truncate"
                                            title={item.error}
                                          >
                                            {item.error}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  {/* Row Action (Sticky on right edge) */}
                                  <td className={`p-2.5 text-center min-w-[160px] w-[160px] sticky right-0 z-10 ${
                                    (item.status === 'extracting' || currentProcessingIdx === idx)
                                      ? 'bg-blue-50 dark:bg-blue-950'
                                      : 'bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80'
                                  }`}>
                                    {item.status === 'extracting' ? (
                                      <span className="text-xs font-semibold text-blue-600 flex items-center justify-center space-x-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span>Working...</span>
                                      </span>
                                    ) : isOvercount ? (
                                      <div className="flex items-center justify-center space-x-1">
                                        <button
                                          type="button"
                                          disabled={isBatchProcessing}
                                          onClick={() => handleCleanDuplicatesForPdf(item.id)}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-300 dark:border-purple-700 rounded-lg transition shadow-sm disabled:opacity-50"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          <span>Clean Dups (-{(item.inDbCount || 0) - (item.expectedCount || 160)})</span>
                                        </button>
                                        <button
                                          type="button"
                                          title="Re-check database status for this paper"
                                          onClick={() => handleCheckSinglePdfDb(item.id)}
                                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : isComplete ? (
                                      <div className="flex items-center justify-center space-x-1">
                                        <span className="text-xs font-bold text-emerald-600">✓ Done</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyModalItem(item);
                                            setIsVerifyModalOpen(true);
                                          }}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-300 dark:border-indigo-700 rounded-lg transition shadow-sm ml-1"
                                          title="Check questions side-by-side with original PDF"
                                        >
                                          <Eye className="w-3 h-3 text-indigo-600" />
                                          <span>Check</span>
                                        </button>
                                        <button
                                          type="button"
                                          title="Re-check database status for this paper"
                                          onClick={() => handleCheckSinglePdfDb(item.id)}
                                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : isPartial ? (
                                      <div className="flex items-center justify-center space-x-1">
                                        <button
                                          type="button"
                                          disabled={isBatchProcessing}
                                          onClick={() => handleProcessSinglePdf(item.id, true)}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700 rounded-lg transition shadow-sm disabled:opacity-50"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                          <span>Retry ({item.missingCount ?? ((item.expectedCount || 160) - (item.inDbCount || 0))})</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyModalItem(item);
                                            setIsVerifyModalOpen(true);
                                          }}
                                          className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-300 dark:border-indigo-700 rounded-lg transition shadow-sm"
                                          title="Check questions side-by-side with original PDF"
                                        >
                                          <Eye className="w-3 h-3 text-indigo-600" />
                                          <span>Check</span>
                                        </button>
                                        <button
                                          type="button"
                                          title="Re-check database status"
                                          onClick={() => handleCheckSinglePdfDb(item.id)}
                                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : item.status === 'error' ? (
                                      <div className="flex items-center justify-center space-x-1">
                                        <button
                                          type="button"
                                          disabled={isBatchProcessing}
                                          onClick={() => handleProcessSinglePdf(item.id, (item.inDbCount || 0) > 0)}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-700 rounded-lg transition shadow-sm disabled:opacity-50"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                          <span>Retry</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyModalItem(item);
                                            setIsVerifyModalOpen(true);
                                          }}
                                          className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-300 dark:border-indigo-700 rounded-lg transition shadow-sm"
                                          title="Check questions side-by-side with original PDF"
                                        >
                                          <Eye className="w-3 h-3 text-indigo-600" />
                                          <span>Check</span>
                                        </button>
                                        <button
                                          type="button"
                                          title="Re-check database status"
                                          onClick={() => handleCheckSinglePdfDb(item.id)}
                                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center space-x-1">
                                        <button
                                          type="button"
                                          disabled={isBatchProcessing}
                                          onClick={() => handleProcessSinglePdf(item.id, false)}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg transition disabled:opacity-50"
                                        >
                                          <Zap className="w-3 h-3" />
                                          <span>Process</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyModalItem(item);
                                            setIsVerifyModalOpen(true);
                                          }}
                                          className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-300 dark:border-indigo-700 rounded-lg transition shadow-sm"
                                          title="Check questions side-by-side with original PDF"
                                        >
                                          <Eye className="w-3 h-3 text-indigo-600" />
                                          <span>Check</span>
                                        </button>
                                        <button
                                          type="button"
                                          title="Re-check database status"
                                          onClick={() => handleCheckSinglePdfDb(item.id)}
                                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* SUPERVISED TEXT DATABASE MANIFEST & EXPORT */}
                    <div className="mt-6 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center space-x-2">
                          <span className="p-2 rounded-xl bg-blue-900/60 text-blue-400 border border-blue-800/60">
                            <Database className="w-4 h-4" />
                          </span>
                          <div>
                            <h4 className="text-sm font-black text-white flex items-center space-x-2">
                              <span>Supervised Text Dataset Manifest</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                {supervisedLogs.length} Entries
                              </span>
                            </h4>
                            <p className="text-[11px] text-slate-400">
                              Complete document archive containing original text, LaTeX formulas, and solutions of all questions inserted into the database.
                            </p>
                          </div>
                        </div>

                        {/* Export Action Buttons */}
                        <div className="flex items-center flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleCopySupervisedText}
                            disabled={supervisedLogs.length === 0}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Text</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDownloadSupervisedTxt}
                            disabled={supervisedLogs.length === 0}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-400" />
                            <span>Download .TXT</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDownloadSupervisedJson}
                            disabled={supervisedLogs.length === 0}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-xs font-extrabold text-white rounded-lg shadow transition"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Export .JSON</span>
                          </button>
                        </div>
                      </div>

                      {supervisedLogs.length > 0 && (
                        <div className="max-h-48 overflow-y-auto p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {supervisedLogs[0]}
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
      {/* Side-by-Side PDF & Database Question Verification Modal */}
      <PdfComparisonViewer
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        item={verifyModalItem}
        onQuestionDeleted={() => checkAllPdfsInDb()}
        onQuestionUpdated={() => checkAllPdfsInDb()}
      />
    </div>
  );
}
