'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  Edit2,
  Trash2,
  Save,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Layers,
  Filter,
  Check,
  RefreshCw,
  Plus,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Sparkles,
  ArrowRight,
  CheckCheck,
  AlertCircle,
  Wand2,
  Zap,
  Key,
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { supabase } from '@/lib/supabase';

export interface VerifyPaperItem {
  id: string;
  file?: File;
  name: string;
  relativePath?: string;
  state: 'AP' | 'TG';
  year: number;
  stream: 'engineering' | 'agriculture-pharmacy' | 'Engineering' | 'Agriculture';
  shift: string;
  inDbCount?: number;
  expectedCount?: number;
}

interface QuestionRecord {
  question_id: string;
  subject: string;
  topic?: string;
  question_text_en: string;
  question_text_te?: string;
  options_en?: string[];
  options_te?: string[];
  correct_option?: number | string;
  explanation_en?: string;
  explanation_te?: string;
  image_url?: string | null;
  diagram_json?: any;
  year?: number;
  stream?: string;
  shift?: string;
  state?: string;
  qNum?: number;
  isVerified?: boolean;
}

interface PdfComparisonViewerProps {
  isOpen: boolean;
  onClose: () => void;
  item: VerifyPaperItem | null;
  onQuestionDeleted?: () => void;
  onQuestionUpdated?: () => void;
}

export default function PdfComparisonViewer({
  isOpen,
  onClose,
  item,
  onQuestionDeleted,
  onQuestionUpdated,
}: PdfComparisonViewerProps) {
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // PDF Viewer State
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalEstimatedPages, setTotalEstimatedPages] = useState<number>(140);
  const [pdfSplitRatio, setPdfSplitRatio] = useState<number>(50); // percentage for left panel
  const [activeFilter, setActiveFilter] = useState<'all' | 'verified' | 'pending' | 'diagrams' | 'text' | 'missing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');

  // Editing State
  const [editingQid, setEditingQid] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<QuestionRecord>>({});
  const [savingQid, setSavingQid] = useState<string | null>(null);
  const [deletingQid, setDeletingQid] = useState<string | null>(null);
  const [fullImageViewUrl, setFullImageViewUrl] = useState<string | null>(null);

  // AI Scan & Verification State
  const [scanningQid, setScanningQid] = useState<string | null>(null);
  const [isScanningAny, setIsScanningAny] = useState(false);
  const [scanTargetQInput, setScanTargetQInput] = useState<string>('');
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Batch Auto-Scan State
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [batchScanPaused, setBatchScanPaused] = useState(false);
  const [batchScanCurrentQ, setBatchScanCurrentQ] = useState(1);
  const [showBatchScanPanel, setShowBatchScanPanel] = useState(false);
  const [autoAttachDiagrams, setAutoAttachDiagrams] = useState(true);
  const [autoFixAnswers, setAutoFixAnswers] = useState(false);
  const [skipAlreadyVerified, setSkipAlreadyVerified] = useState(true);
  const [batchScanStats, setBatchScanStats] = useState({
    verified: 0,
    skipped: 0,
    diagramsAdded: 0,
    answersFixed: 0,
    mismatches: 0,
    missingInDb: 0,
    errors: 0,
  });
  const [batchScanLogs, setBatchScanLogs] = useState<Array<{
    qNum: number;
    type: 'verified' | 'skipped' | 'diagram' | 'answer' | 'mismatch' | 'missing' | 'error';
    text: string;
    time: string;
  }>>([]);
  const batchStopRef = useRef(false);
  const batchPauseRef = useRef(false);

  const [scanDiffModal, setScanDiffModal] = useState<{
    isOpen: boolean;
    dbQuestion: QuestionRecord | null;
    scannedData: any;
    targetQNum?: number;
    targetPage?: number;
  }>({
    isOpen: false,
    dbQuestion: null,
    scannedData: null,
  });
  const [applyingScan, setApplyingScan] = useState(false);

  // Detect if DB question and scanned question are about different content (mismatch)
  const isQuestionMismatch = useMemo(() => {
    if (!scanDiffModal.dbQuestion || !scanDiffModal.scannedData) return false;
    const dbText = (scanDiffModal.dbQuestion.question_text_en || '').toLowerCase();
    const scanText = (scanDiffModal.scannedData.question_text_en || '').trim().toLowerCase();
    if (!dbText || !scanText) return false;

    // Extract meaningful words (length > 3, skip math symbols)
    const stopwords = new Set(['that', 'this', 'with', 'from', 'have', 'will', 'what', 'when', 'then', 'than', 'also', 'into', 'been', 'they', 'were', 'which']);
    const words = (t: string) =>
      t.split(/[\s,.\(\)\[\]\{\}\$\\=+\-*/^]+/)
       .filter(w => w.length > 3 && !stopwords.has(w) && !/^\d+$/.test(w));

    const dbWords = new Set(words(dbText));
    const scanWords = words(scanText);
    if (dbWords.size === 0 || scanWords.length === 0) return false;

    const overlap = scanWords.filter(w => dbWords.has(w)).length;
    const similarity = overlap / Math.max(dbWords.size, scanWords.length);

    // Also check subject mismatch if subjects are clearly different
    const dbSubject = scanDiffModal.dbQuestion.subject || '';
    const mathKeywords = ['value', 'function', 'integral', 'matrix', 'determinant', 'lim', 'derivative', 'complex', 'roots'];
    const physicsKeywords = ['force', 'velocity', 'mass', 'current', 'voltage', 'resistance', 'magnetic', 'electric', 'wave', 'pressure', 'acceleration'];
    const chemKeywords = ['mole', 'reaction', 'compound', 'element', 'bond', 'acid', 'base', 'oxidation'];

    const inPhysics = physicsKeywords.some(k => scanText.includes(k));
    const inMath = mathKeywords.some(k => scanText.includes(k));
    const inChem = chemKeywords.some(k => scanText.includes(k));

    if (dbSubject === 'Physics' && !inPhysics && (inMath || inChem)) return true;
    if (dbSubject === 'Mathematics' && !inMath && (inPhysics || inChem)) return true;
    if (dbSubject === 'Chemistry' && !inChem && (inPhysics || inMath)) return true;

    // Less than 8% word overlap → clearly different questions
    return similarity < 0.08;
  }, [scanDiffModal.dbQuestion, scanDiffModal.scannedData]);

  // Load custom API key from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('gemini_custom_api_key');
      if (savedKey) setCustomApiKey(savedKey);
    }
  }, []);

  // Question container ref for scrolling
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Generate / Load PDF URL
  useEffect(() => {
    if (!isOpen || !item) {
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(null);
      return;
    }

    if (item.file) {
      const url = URL.createObjectURL(item.file);
      setPdfUrl(url);
    } else {
      // Fallback to server route
      const cleanName = encodeURIComponent(item.name);
      setPdfUrl(`/api/pdf/serve?name=${cleanName}`);
    }

    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [isOpen, item]);

  // Load questions from Supabase for this paper
  const fetchPaperQuestions = async () => {
    if (!item) return;
    setLoading(true);
    setErrorMsg(null);

    const normStream = item.stream.toLowerCase().includes('agri') ? 'Agriculture' : 'Engineering';

    try {
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      // Query questions matching year, stream, shift
      let query = supabase
        .from('questions')
        .select('*')
        .eq('year', item.year)
        .eq('stream', normStream);

      // Try exact shift first
      if (item.shift) {
        query = query.eq('shift', item.shift);
      }

      const { data, error } = await query;

      if (error) throw error;

      let records: QuestionRecord[] = (data || []).map((row: any) => {
        // Extract Question Number from explanation_en (e.g. "Q39: ...") or q_number
        let qNum: number | undefined = undefined;
        let isVerified = false;
        if (row.explanation_en) {
          const match = row.explanation_en.match(/Q(\d+)\s*:/i);
          if (match) qNum = parseInt(match[1], 10);
          isVerified = row.explanation_en.includes('[VERIFIED]') || row.explanation_en.includes('[OK_SCANNED]');
        }
        if (qNum === undefined && row.q_number) {
          qNum = parseInt(row.q_number, 10);
        }
        return {
          ...row,
          qNum,
          isVerified,
        };
      });

      // Sort questions: first by qNum if available, otherwise preserve order
      records.sort((a, b) => {
        if (a.qNum !== undefined && b.qNum !== undefined) {
          return a.qNum - b.qNum;
        }
        if (a.qNum !== undefined) return -1;
        if (b.qNum !== undefined) return 1;
        return (a.question_id || '').localeCompare(b.question_id || '');
      });

      setQuestions(records);
    } catch (err: any) {
      console.error('Failed to fetch paper questions:', err);
      setErrorMsg(err.message || 'Failed to load questions from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && item) {
      fetchPaperQuestions();
    } else {
      setQuestions([]);
      setEditingQid(null);
    }
  }, [isOpen, item?.id]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !fullImageViewUrl) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, fullImageViewUrl, onClose]);

  // Missing question numbers calculation (1..160)
  const expectedCount = item?.expectedCount || 160;
  const presentQNums = useMemo(() => {
    const set = new Set<number>();
    questions.forEach((q) => {
      if (q.qNum !== undefined) set.add(q.qNum);
    });
    return set;
  }, [questions]);

  const missingQNums = useMemo(() => {
    const list: number[] = [];
    for (let i = 1; i <= expectedCount; i++) {
      if (!presentQNums.has(i)) {
        list.push(i);
      }
    }
    return list;
  }, [expectedCount, presentQNums]);

  const verifiedCount = useMemo(() => {
    return questions.filter((q) => q.isVerified).length;
  }, [questions]);

  // Filtered Questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      // Subject Filter
      if (selectedSubject !== 'All' && q.subject !== selectedSubject) {
        return false;
      }
      // Mode Filter
      if (activeFilter === 'verified' && !q.isVerified) return false;
      if (activeFilter === 'pending' && q.isVerified) return false;
      if (activeFilter === 'diagrams' && !q.image_url) return false;
      if (activeFilter === 'text' && q.image_url) return false;

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesNum = q.qNum !== undefined && q.qNum.toString() === query;
        const matchesEn = q.question_text_en?.toLowerCase().includes(query);
        const matchesTe = q.question_text_te?.toLowerCase().includes(query);
        const matchesTopic = q.topic?.toLowerCase().includes(query);
        return matchesNum || matchesEn || matchesTe || matchesTopic;
      }

      return true;
    });
  }, [questions, selectedSubject, activeFilter, searchQuery]);

  // Jump to Question
  const handleJumpToQuestion = (qNum: number) => {
    const el = document.getElementById(`q-card-${qNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-4', 'ring-indigo-500', 'transition-all');
      setTimeout(() => el.classList.remove('ring-4', 'ring-indigo-500'), 1500);
    }

    // Estimate PDF page based on question number (Engineering standard: Math ~1-80, Physics ~81-120, Chem ~121-160)
    let estimatedPage = 3;
    if (qNum <= 80) {
      // Math: ~80 questions over ~65 pages
      estimatedPage = Math.min(68, Math.max(3, Math.round(3 + (qNum - 1) * 0.82)));
    } else if (qNum <= 120) {
      // Physics: ~40 questions over ~35 pages
      estimatedPage = Math.min(103, Math.max(69, Math.round(69 + (qNum - 81) * 0.85)));
    } else {
      // Chemistry: ~40 questions over ~35 pages
      estimatedPage = Math.min(139, Math.max(104, Math.round(104 + (qNum - 121) * 0.85)));
    }
    setCurrentPage(estimatedPage);
  };

  // Start Inline Editing
  const handleStartEdit = (q: QuestionRecord) => {
    setEditingQid(q.question_id);
    setEditFormData({
      question_text_en: q.question_text_en,
      question_text_te: q.question_text_te || '',
      options_en: q.options_en ? [...q.options_en] : ['', '', '', ''],
      options_te: q.options_te ? [...q.options_te] : ['', '', '', ''],
      correct_option: q.correct_option ?? 1,
      image_url: q.image_url || '',
      explanation_en: q.explanation_en || '',
      explanation_te: q.explanation_te || '',
      topic: q.topic || '',
      subject: q.subject,
    });
  };

  // Save Inline Edit
  const handleSaveEdit = async (qid: string) => {
    setSavingQid(qid);
    try {
      if (!supabase) throw new Error('Supabase not connected');

      const updates: any = {
        question_text_en: editFormData.question_text_en,
        question_text_te: editFormData.question_text_te || null,
        options_en: editFormData.options_en,
        options_te: editFormData.options_te,
        correct_option: editFormData.correct_option,
        image_url: editFormData.image_url ? editFormData.image_url.trim() : null,
        explanation_en: editFormData.explanation_en,
        explanation_te: editFormData.explanation_te || null,
        topic: editFormData.topic,
        subject: editFormData.subject,
      };

      const { error } = await supabase.from('questions').update(updates).eq('question_id', qid);

      if (error) throw error;

      // Update local state
      setQuestions((prev) =>
        prev.map((q) => (q.question_id === qid ? { ...q, ...updates } : q))
      );
      setEditingQid(null);
      if (onQuestionUpdated) onQuestionUpdated();
    } catch (err: any) {
      alert(`Error saving question: ${err.message}`);
    } finally {
      setSavingQid(null);
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (q: QuestionRecord) => {
    const qLabel = q.qNum ? `Question #${q.qNum}` : 'this question';
    if (!window.confirm(`Are you sure you want to DELETE ${qLabel} from the database? This cannot be undone.`)) {
      return;
    }

    setDeletingQid(q.question_id);
    try {
      if (!supabase) throw new Error('Supabase not connected');

      const { error } = await supabase.from('questions').delete().eq('question_id', q.question_id);

      if (error) throw error;

      setQuestions((prev) => prev.filter((item) => item.question_id !== q.question_id));
      if (onQuestionDeleted) onQuestionDeleted();
    } catch (err: any) {
      alert(`Failed to delete question: ${err.message}`);
    } finally {
      setDeletingQid(null);
    }
  };

  // Remove Image Only
  const handleRemoveImageOnly = async (q: QuestionRecord) => {
    if (!window.confirm(`Remove the attached diagram from Question #${q.qNum || ''}?`)) return;
    try {
      if (!supabase) throw new Error('Supabase not connected');
      const { error } = await supabase.from('questions').update({ image_url: null }).eq('question_id', q.question_id);
      if (error) throw error;
      setQuestions((prev) =>
        prev.map((item) => (item.question_id === q.question_id ? { ...item, image_url: null } : item))
      );
      if (onQuestionUpdated) onQuestionUpdated();
    } catch (err: any) {
      alert(`Error removing image: ${err.message}`);
    }
  };

  // Toggle single question verified status
  const handleToggleVerified = async (q: QuestionRecord) => {
    if (!supabase) return;
    const newStatus = !q.isVerified;
    const existingExpl = q.explanation_en || '';
    let newExpl = existingExpl;
    if (newStatus) {
      const cleanExpl = existingExpl.replace(/^Q\d+:\s*(\[VERIFIED\]\s*)?/i, '');
      newExpl = `Q${q.qNum || ''}: [VERIFIED] ${cleanExpl}`;
    } else {
      newExpl = existingExpl.replace(/\[VERIFIED\]\s*/i, '');
    }

    try {
      const { error } = await supabase
        .from('questions')
        .update({ explanation_en: newExpl })
        .eq('question_id', q.question_id);
      if (error) throw error;
      setQuestions((prev) =>
        prev.map((item) =>
          item.question_id === q.question_id
            ? { ...item, explanation_en: newExpl, isVerified: newStatus }
            : item
        )
      );
    } catch (err: any) {
      alert(`Could not toggle verified status: ${err.message}`);
    }
  };

  // Helper to detect question mismatch between DB and Scanned
  const checkMismatch = (dbQ: QuestionRecord, scanned: any) => {
    const dbText = (dbQ.question_text_en || '').toLowerCase();
    const scanText = (scanned.question_text_en || '').trim().toLowerCase();
    if (!dbText || !scanText) return false;

    const stopwords = new Set(['that', 'this', 'with', 'from', 'have', 'will', 'what', 'when', 'then', 'than', 'also', 'into', 'been', 'they', 'were', 'which']);
    const words = (t: string) =>
      t.split(/[\s,.\(\)\[\]\{\}\$\\=+\-*/^]+/)
       .filter((w) => w.length > 3 && !stopwords.has(w) && !/^\d+$/.test(w));

    const dbWords = new Set(words(dbText));
    const scanWords = words(scanText);
    if (dbWords.size === 0 || scanWords.length === 0) return false;

    const overlap = scanWords.filter((w) => dbWords.has(w)).length;
    const similarity = overlap / Math.max(dbWords.size, scanWords.length);

    const dbSubject = dbQ.subject || '';
    const mathKeywords = ['value', 'function', 'integral', 'matrix', 'determinant', 'lim', 'derivative', 'complex', 'roots'];
    const physicsKeywords = ['force', 'velocity', 'mass', 'current', 'voltage', 'resistance', 'magnetic', 'electric', 'wave', 'pressure', 'acceleration'];
    const chemKeywords = ['mole', 'reaction', 'compound', 'element', 'bond', 'acid', 'base', 'oxidation'];

    const inPhysics = physicsKeywords.some((k) => scanText.includes(k));
    const inMath = mathKeywords.some((k) => scanText.includes(k));
    const inChem = chemKeywords.some((k) => scanText.includes(k));

    if (dbSubject === 'Physics' && !inPhysics && (inMath || inChem)) return true;
    if (dbSubject === 'Mathematics' && !inMath && (inPhysics || inChem)) return true;
    if (dbSubject === 'Chemistry' && !inChem && (inPhysics || inMath)) return true;

    return similarity < 0.08;
  };

  // Start Batch Scan Loop
  const startBatchScan = async () => {
    if (!item) return;
    setIsBatchScanning(true);
    setBatchScanPaused(false);
    setShowBatchScanPanel(true);
    batchStopRef.current = false;
    batchPauseRef.current = false;

    setBatchScanStats({
      verified: 0,
      skipped: 0,
      diagramsAdded: 0,
      answersFixed: 0,
      mismatches: 0,
      missingInDb: 0,
      errors: 0,
    });
    setBatchScanLogs([]);

    for (let qNum = 1; qNum <= expectedCount; qNum++) {
      if (batchStopRef.current) break;

      while (batchPauseRef.current && !batchStopRef.current) {
        await new Promise((r) => setTimeout(r, 400));
      }
      if (batchStopRef.current) break;

      setBatchScanCurrentQ(qNum);
      const dbQ = questions.find((q) => q.qNum === qNum);

      // Skip already verified
      if (skipAlreadyVerified && dbQ?.isVerified) {
        setBatchScanStats((s) => ({ ...s, skipped: s.skipped + 1, verified: s.verified + 1 }));
        setBatchScanLogs((prev) => [
          {
            qNum,
            type: 'skipped',
            text: `Q#${qNum}: ముందే సరిచూడబడింది [VERIFIED] — స్కిప్ చేయబడింది.`,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 49),
        ]);
        continue;
      }

      handleJumpToQuestion(qNum);

      try {
        const res = await fetch('/api/ai/scan-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfName: item.name,
            pdfPath: item.relativePath,
            pageNumber: currentPage,
            targetQNum: qNum,
            customApiKey: customApiKey.trim() || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to scan question from PDF');
        }

        const scanned = data.question;
        if (scanned.page_number) {
          setCurrentPage(scanned.page_number);
        }

        // Case A: Missing from DB
        if (!dbQ) {
          setBatchScanStats((s) => ({ ...s, missingInDb: s.missingInDb + 1 }));
          setBatchScanLogs((prev) => [
            {
              qNum,
              type: 'missing',
              text: `⚠️ Q#${qNum}: డేటాబేస్‌లో లేదు (Missing from DB)!`,
              time: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 49),
          ]);
          batchPauseRef.current = true;
          setBatchScanPaused(true);
          setScanDiffModal({
            isOpen: true,
            dbQuestion: null,
            scannedData: scanned,
            targetQNum: qNum,
            targetPage: scanned.page_number || currentPage,
          });
          continue;
        }

        // Case B: Mismatch
        if (checkMismatch(dbQ, scanned)) {
          setBatchScanStats((s) => ({ ...s, mismatches: s.mismatches + 1 }));
          setBatchScanLogs((prev) => [
            {
              qNum,
              type: 'mismatch',
              text: `❌ Q#${qNum}: క్వశ్చన్లు సరిపోలలేదు (Mismatch)!`,
              time: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 49),
          ]);
          batchPauseRef.current = true;
          setBatchScanPaused(true);
          setScanDiffModal({
            isOpen: true,
            dbQuestion: dbQ,
            scannedData: scanned,
            targetQNum: qNum,
            targetPage: scanned.page_number || currentPage,
          });
          continue;
        }

        // Case C: Matches!
        const updates: any = {};
        let diagramAdded = false;
        let answerCorrected = false;

        const scannedHasDiagram = scanned.has_diagram && scanned.image_url;
        const dbHasDiagram = !!dbQ.image_url;
        if (scannedHasDiagram && !dbHasDiagram && autoAttachDiagrams) {
          updates.image_url = scanned.image_url;
          diagramAdded = true;
        }

        const rawScannedOpt = parseInt(String(scanned.correct_option), 10);
        const dbOpt = Number(dbQ.correct_option);
        const answerMatches = (dbOpt + 1) === rawScannedOpt;

        if (!answerMatches) {
          if (autoFixAnswers) {
            updates.correct_option = Math.max(0, Math.min(3, rawScannedOpt - 1));
            answerCorrected = true;
          } else {
            batchPauseRef.current = true;
            setBatchScanPaused(true);
            setScanDiffModal({
              isOpen: true,
              dbQuestion: dbQ,
              scannedData: scanned,
              targetQNum: qNum,
              targetPage: scanned.page_number || currentPage,
            });
            continue;
          }
        }

        const existingExpl = dbQ.explanation_en || '';
        const cleanExpl = existingExpl.replace(/^Q\d+:\s*(\[VERIFIED\]\s*)?/i, '');
        updates.explanation_en = `Q${qNum}: [VERIFIED] ${cleanExpl || scanned.explanation_en || dbQ.question_text_en}`;

        if (supabase) {
          const { error } = await supabase.from('questions').update(updates).eq('question_id', dbQ.question_id);
          if (error) throw error;
        }

        setQuestions((prev) =>
          prev.map((q) =>
            q.question_id === dbQ.question_id
              ? { ...q, ...updates, isVerified: true }
              : q
          )
        );

        if (diagramAdded) setBatchScanStats((s) => ({ ...s, diagramsAdded: s.diagramsAdded + 1 }));
        if (answerCorrected) setBatchScanStats((s) => ({ ...s, answersFixed: s.answersFixed + 1 }));
        setBatchScanStats((s) => ({ ...s, verified: s.verified + 1 }));
        setBatchScanLogs((prev) => [
          {
            qNum,
            type: 'verified',
            text: `✅ Q#${qNum}: సరిచూడబడింది & సేవ్ అయింది!${diagramAdded ? ' [🖼️ డయాగ్రమ్ జతచేయబడింది]' : ''}${answerCorrected ? ' [⚠️ కీ సరిదిద్దబడింది]' : ''}`,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 49),
        ]);
      } catch (err: any) {
        setBatchScanStats((s) => ({ ...s, errors: s.errors + 1 }));
        setBatchScanLogs((prev) => [
          {
            qNum,
            type: 'error',
            text: `❌ Q#${qNum} స్కాన్ లోపం: ${err.message}`,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 49),
        ]);
      }

      await new Promise((r) => setTimeout(r, 600));
    }

    setIsBatchScanning(false);
    setBatchScanPaused(false);
  };

  const stopBatchScan = () => {
    batchStopRef.current = true;
    batchPauseRef.current = false;
    setIsBatchScanning(false);
    setBatchScanPaused(false);
  };

  const toggleBatchScanPause = () => {
    const nextPaused = !batchScanPaused;
    batchPauseRef.current = nextPaused;
    setBatchScanPaused(nextPaused);
  };

  // ── AI SCAN FUNCTIONALITY ──
  const handleScanQuestion = async (q?: QuestionRecord, explicitQNum?: number) => {
    if (!item) return;
    const targetQ = explicitQNum !== undefined ? explicitQNum : (q?.qNum !== undefined ? q.qNum : undefined);

    if (q) {
      setScanningQid(q.question_id);
    } else {
      setIsScanningAny(true);
    }

    try {
      const res = await fetch('/api/ai/scan-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfName: item.name,
          pdfPath: item.relativePath,
          pageNumber: currentPage,
          targetQNum: targetQ,
          customApiKey: customApiKey.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to scan question from PDF');
      }

      const scanned = data.question;
      // Validate: if question_text_en is empty, it's likely a cover/instructions page
      if (!scanned.question_text_en || scanned.question_text_en.trim() === '') {
        alert(`⚠️ ఈ పేజీలో/Q# లో ప్రశ్న కనుగొనబడలేదు.\n\nQ# ఫీల్డ్‌లో సరైన ప్రశ్న నంబర్ నమోదు చేసి మళ్ళీ స్కాన్ చేయండి.`);
        return;
      }
      // Auto-navigate PDF viewer to scanned page
      if (scanned.page_number) {
        setCurrentPage(scanned.page_number);
      }

      let matchedDbQ: QuestionRecord | null = q || null;
      if (!matchedDbQ && scanned.q_num) {
        matchedDbQ = questions.find((item) => item.qNum === scanned.q_num) || null;
      }

      setScanDiffModal({
        isOpen: true,
        dbQuestion: matchedDbQ,
        scannedData: scanned,
        targetQNum: targetQ,
        targetPage: scanned.page_number || currentPage,
      });
    } catch (err: any) {
      console.error('Scan error:', err);
      alert(`⚠️ AI Scan Failed: ${err.message}\n\nTip: Click the 🔑 API Key icon in the toolbar to enter your own Gemini API key if free quota is reached.`);
    } finally {
      setScanningQid(null);
      setIsScanningAny(false);
    }
  };

  // Replace existing DB record with Scanned PDF Ground-Truth
  const handleApplyScanReplace = async () => {
    if (!scanDiffModal.dbQuestion || !scanDiffModal.scannedData) return;

    const scanned = scanDiffModal.scannedData;

    // Validate non-empty question before updating
    if (!scanned.question_text_en || scanned.question_text_en.trim() === '') {
      alert('⚠️ స్కాన్ చేసిన క్వశ్చన్ టెక్స్ట్ ఖాళీగా ఉంది. అప్‌డేట్ చేయలేం. దయచేసి సరైన Q# తో మళ్ళీ స్కాన్ చేయండి.');
      return;
    }

    setApplyingScan(true);

    try {
      if (!supabase) throw new Error('Supabase not connected');
      const qid = scanDiffModal.dbQuestion.question_id;

      // Convert Gemini 1-based correct_option → DB 0-based (0..3)
      const rawOpt = parseInt(String(scanned.correct_option), 10) || 1;
      const dbCorrectOpt = Math.max(0, Math.min(3, rawOpt - 1));

      const cleanExpl = (scanned.explanation_en || scanDiffModal.dbQuestion.explanation_en || '')
        .replace(/^Q\d+:\s*(\[VERIFIED\]\s*)?/i, '');
      const newExplanation = `Q${scanDiffModal.dbQuestion.qNum || ''}: [VERIFIED] ${cleanExpl}`;

      const updates: any = {
        question_text_en: scanned.question_text_en,
        question_text_te: scanned.question_text_te || scanned.question_text_en,
        options_en: scanned.options_en || ['', '', '', ''],
        options_te: scanned.options_te || scanned.options_en || ['', '', '', ''],
        correct_option: dbCorrectOpt,
        explanation_en: newExplanation,
        explanation_te: scanned.explanation_te || scanned.explanation_en || '',
        image_url: scanned.image_url || scanDiffModal.dbQuestion.image_url || null,
      };

      const { error } = await supabase.from('questions').update(updates).eq('question_id', qid);
      if (error) throw error;

      // Update local questions state
      setQuestions((prev) =>
        prev.map((item) => (item.question_id === qid ? { ...item, ...updates, isVerified: true } : item))
      );

      setScanDiffModal({ isOpen: false, dbQuestion: null, scannedData: null });
      if (onQuestionUpdated) onQuestionUpdated();
      alert(`✅ Question #${scanDiffModal.dbQuestion.qNum || ''} successfully updated with ground-truth PDF data!`);
    } catch (err: any) {
      alert(`Failed to update question: ${err.message}`);
    } finally {
      setApplyingScan(false);
    }
  };

  // Insert Scanned Data as a Brand New Question in DB
  const handleInsertAsNewQuestion = async () => {
    if (!item || !scanDiffModal.scannedData) return;

    const scanned = scanDiffModal.scannedData;

    // Validate: must have actual question text before inserting
    if (!scanned.question_text_en || scanned.question_text_en.trim() === '') {
      alert('⚠️ క్వశ్చన్ టెక్స్ట్ ఖాళీగా ఉంది! ఇన్సర్ట్ చేయలేం.\n\nదయచేసి సరైన Q# నమోదు చేసి మళ్ళీ స్కాన్ చేయండి.');
      return;
    }
    if (!scanned.options_en || scanned.options_en.length < 4) {
      alert('⚠️ Options సరిగ్గా స్కాన్ కాలేదు. దయచేసి మళ్ళీ స్కాన్ చేయండి.');
      return;
    }

    setApplyingScan(true);

    try {
      if (!supabase) throw new Error('Supabase not connected');
      const normStream = item.stream.toLowerCase().includes('agri') ? 'Agriculture' : 'Engineering';

      const qNum = scanned.q_num || scanDiffModal.targetQNum || (questions.length + 1);
      let subj = 'Mathematics';
      if (normStream === 'Agriculture') {
        if (qNum <= 80) subj = 'Biology';
        else if (qNum <= 120) subj = 'Physics';
        else subj = 'Chemistry';
      } else {
        if (qNum <= 80) subj = 'Mathematics';
        else if (qNum <= 120) subj = 'Physics';
        else subj = 'Chemistry';
      }

      // Convert Gemini 1-based correct_option → DB 0-based (0..3)
      // Gemini returns 1,2,3,4 → DB needs 0,1,2,3
      const rawOpt = parseInt(String(scanned.correct_option), 10) || 1;
      const dbCorrectOpt = Math.max(0, Math.min(3, rawOpt - 1));

      const newRow: any = {
        // Do NOT include question_id — let PostgreSQL generate UUID via gen_random_uuid()
        year: item.year,
        state: item.state,
        stream: normStream,
        shift: item.shift,
        subject: subj,
        topic: scanned.topic || subj || 'General',
        question_text_en: scanned.question_text_en,
        question_text_te: scanned.question_text_te || scanned.question_text_en,
        options_en: scanned.options_en,
        options_te: scanned.options_te || scanned.options_en,
        correct_option: dbCorrectOpt,
        explanation_en: `Q${qNum}: [VERIFIED] ${scanned.explanation_en || scanned.question_text_en}`,
        explanation_te: scanned.explanation_te || scanned.explanation_en || `Q${qNum}: పరిష్కారం`,
        image_url: scanned.image_url || null,
        difficulty: 'Medium',
        is_previous_year: true,
      };

      const { data, error } = await supabase.from('questions').insert(newRow).select();
      if (error) throw error;

      // Grab the auto-generated question_id from the inserted row
      const insertedRow = data?.[0] || newRow;
      const insertedId = insertedRow.question_id;

      setQuestions((prev) => {
        const next = [...prev, { ...insertedRow, qNum, isVerified: true }];
        next.sort((a, b) => (a.qNum ?? 0) - (b.qNum ?? 0));
        return next;
      });

      setScanDiffModal({ isOpen: false, dbQuestion: null, scannedData: null });
      if (onQuestionUpdated) onQuestionUpdated();
      alert(`✅ Q${qNum} విజయవంతంగా డేటాబేస్‌లో చేర్చబడింది!\nQuestion ID: ${insertedId || 'generated'}`);
    } catch (err: any) {
      alert(`Failed to insert question: ${err.message}`);
    } finally {
      setApplyingScan(false);
    }
  };

  const handleSaveApiKey = (key: string) => {
    setCustomApiKey(key);
    if (typeof window !== 'undefined') {
      localStorage.setItem('gemini_custom_api_key', key.trim());
    }
    setShowApiKeyModal(false);
    alert('API Key saved successfully!');
  };

  if (!isOpen || !item) return null;

  const diagramCount = questions.filter((q) => q.image_url).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 backdrop-blur-md text-slate-800 dark:text-slate-100 overflow-hidden animate-fadeIn">
      {/* ── TOP HEADER / TOOLBAR ── */}
      <header className="flex items-center justify-between px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                {item.state} {item.year}
              </span>
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                {item.stream}
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {item.shift}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
              📄 {item.name}
            </p>
          </div>
        </div>

        {/* Center: Live Stats */}
        <div className="hidden md:flex items-center space-x-3 bg-slate-50 dark:bg-slate-800/80 px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-center">
            <span className="text-xs text-slate-400 block leading-tight">In Database</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {questions.length} / {expectedCount}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="text-center">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 block leading-tight font-medium">Verified ✅</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {verifiedCount} / {expectedCount}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="text-center">
            <span className="text-xs text-slate-400 block leading-tight">Diagrams 🖼️</span>
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              {diagramCount}
            </span>
          </div>
          {missingQNums.length > 0 && (
            <>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="text-center">
                <span className="text-xs text-amber-500 block leading-tight">Missing Qs</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {missingQNums.length}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right: Split Ratio + Close */}
        <div className="flex items-center space-x-3">
          <div className="hidden lg:flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300">
            <button
              onClick={() => setPdfSplitRatio(40)}
              className={`px-2 py-1 rounded transition ${pdfSplitRatio === 40 ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 font-bold' : ''}`}
            >
              40 : 60
            </button>
            <button
              onClick={() => setPdfSplitRatio(50)}
              className={`px-2 py-1 rounded transition ${pdfSplitRatio === 50 ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 font-bold' : ''}`}
            >
              50 : 50
            </button>
            <button
              onClick={() => setPdfSplitRatio(60)}
              className={`px-2 py-1 rounded transition ${pdfSplitRatio === 60 ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 font-bold' : ''}`}
            >
              60 : 40
            </button>
          </div>

          <button
            onClick={() => setShowApiKeyModal(true)}
            title="Configure Gemini API Key"
            className={`p-2 rounded-lg transition flex items-center gap-1 text-xs font-semibold ${
              customApiKey
                ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">{customApiKey ? 'API Key ✓' : 'API Key'}</span>
          </button>

          <button
            onClick={fetchPaperQuestions}
            disabled={loading}
            title="Refresh database questions"
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── MAIN SIDE-BY-SIDE PANELS ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT PANEL: DATABASE QUESTIONS ── */}
        <section
          style={{ width: `${pdfSplitRatio}%` }}
          className="flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden"
        >
          {/* Subheader Toolbar: Filters, Search & Jump */}
          <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
            {/* Filter Pills */}
            <div className="flex items-center space-x-1 overflow-x-auto text-xs font-semibold">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                All ({questions.length})
              </button>
              <button
                onClick={() => setActiveFilter('verified')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
                  activeFilter === 'verified'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 hover:bg-slate-200'
                }`}
              >
                <span>✅ సరిచూసినవి</span>
                <span className="opacity-90">({verifiedCount})</span>
              </button>
              <button
                onClick={() => setActiveFilter('pending')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
                  activeFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-amber-700 dark:text-amber-300 hover:bg-slate-200'
                }`}
              >
                <span>⏳ సరిచూడనివి</span>
                <span className="opacity-90">({questions.length - verifiedCount})</span>
              </button>
              <button
                onClick={() => setActiveFilter('diagrams')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
                  activeFilter === 'diagrams'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <span>🖼️ Diagrams</span>
                <span className="opacity-80">({diagramCount})</span>
              </button>
              <button
                onClick={() => setActiveFilter('text')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeFilter === 'text'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                Text Only ({questions.length - diagramCount})
              </button>
              {missingQNums.length > 0 && (
                <button
                  onClick={() => setActiveFilter('missing')}
                  className={`px-3 py-1.5 rounded-lg transition text-rose-700 dark:text-rose-300 ${
                    activeFilter === 'missing'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800'
                  }`}
                >
                  ⚠️ Missing ({missingQNums.length})
                </button>
              )}
            </div>

            {/* Quick Jump & Search & Batch Scan */}
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Q# or text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg w-36 focus:w-48 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              {/* Jump Dropdown */}
              <select
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) handleJumpToQuestion(val);
                }}
                defaultValue=""
                className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="" disabled>
                  Jump to Q#
                </option>
                {Array.from({ length: expectedCount }, (_, i) => i + 1).map((num) => (
                  <option key={num} value={num}>
                    Q{num} {!presentQNums.has(num) ? '(Missing)' : ''}
                  </option>
                ))}
              </select>

              {/* Batch Scan Trigger Button */}
              {isBatchScanning ? (
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={toggleBatchScanPause}
                    className="px-2.5 py-1 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg shadow-sm transition flex items-center gap-1"
                  >
                    {batchScanPaused ? '▶️ కొనసాగించు' : '⏸ విరామం'}
                  </button>
                  <button
                    type="button"
                    onClick={stopBatchScan}
                    className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition flex items-center gap-1"
                  >
                    ⏹ ఆపు ({batchScanCurrentQ}/{expectedCount})
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!showBatchScanPanel) setShowBatchScanPanel(true);
                    startBatchScan();
                  }}
                  className="px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 hover:opacity-95 rounded-lg shadow-sm transition flex items-center gap-1.5"
                  title="PDF లోని అన్ని ప్రశ్నలను వరుసగా స్కాన్ చేసి డేటాబేస్‌తో సరిచూడండి"
                >
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>⚡ ఆటో-స్కాన్</span>
                </button>
              )}

              {/* Quick AI Scan Single Q# Input & Button */}
              <div className="flex items-center space-x-1 bg-amber-50 dark:bg-amber-950/40 p-0.5 rounded-lg border border-amber-300 dark:border-amber-800">
                <input
                  type="number"
                  min={1}
                  max={expectedCount}
                  placeholder="Q#"
                  value={scanTargetQInput}
                  onChange={(e) => setScanTargetQInput(e.target.value)}
                  className="w-11 text-xs px-1 py-0.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded text-center font-bold"
                  title="Target Question Number to scan"
                />
                <button
                  type="button"
                  onClick={() => {
                    const num = parseInt(scanTargetQInput, 10);
                    if (isNaN(num)) {
                      startBatchScan();
                    } else {
                      handleScanQuestion(undefined, num);
                    }
                  }}
                  disabled={isScanningAny || isBatchScanning}
                  title="AI Scan question from PDF and verify"
                  className="px-2.5 py-0.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                >
                  <Zap className={`w-3 h-3 ${isScanningAny ? 'animate-bounce' : ''}`} />
                  <span>{isScanningAny ? 'స్కాన్...' : '⚡ స్కాన్'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Live Batch Scanner Status & Control Banner */}
          {showBatchScanPanel && (
            <div className="bg-gradient-to-r from-amber-50 via-indigo-50/50 to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border-b-2 border-amber-400 dark:border-amber-600 p-3 shrink-0 shadow-sm transition-all animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <div className="flex items-center space-x-2">
                  <span className={`w-3 h-3 rounded-full ${isBatchScanning ? (batchScanPaused ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-ping') : 'bg-slate-400'}`} />
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>⚡ ఆటో-స్కాన్ & పరిశీలన:</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-extrabold text-sm">
                      Q#{batchScanCurrentQ} / {expectedCount}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ({Math.round((batchScanStats.verified / expectedCount) * 100)}% సరిచూడబడింది)
                    </span>
                  </span>
                </div>

                {/* Batch Action Controls */}
                <div className="flex items-center space-x-2">
                  {isBatchScanning ? (
                    <>
                      <button
                        type="button"
                        onClick={toggleBatchScanPause}
                        className={`px-3 py-1 text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1 ${
                          batchScanPaused
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                        }`}
                      >
                        {batchScanPaused ? '▶️ కొనసాగించు (Resume)' : '⏸ విరామం (Pause)'}
                      </button>
                      <button
                        type="button"
                        onClick={stopBatchScan}
                        className="px-3 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition flex items-center gap-1"
                      >
                        ⏹ ఆపు (Stop)
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={startBatchScan}
                      className="px-3 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition flex items-center gap-1"
                    >
                      ▶️ ప్రారంభించు (Start Scan)
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowBatchScanPanel(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="దాచు (Hide panel)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden mb-2.5">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-indigo-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, (batchScanStats.verified / expectedCount) * 100))}%` }}
                />
              </div>

              {/* Live Metric Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
                <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">సరిచూసినవి ✅</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">{batchScanStats.verified}</span>
                </div>
                <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">ముందే ఓకే (స్కిప్) ⏭️</span>
                  <span className="font-bold text-slate-600 dark:text-slate-300">{batchScanStats.skipped}</span>
                </div>
                <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">డయాగ్రమ్స్ జత 🖼️</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{batchScanStats.diagramsAdded}</span>
                </div>
                <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">కీ సవరణలు ⚠️</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{batchScanStats.answersFixed}</span>
                </div>
                <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">సరిపోలనివి ❌</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{batchScanStats.mismatches}</span>
                </div>
                <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 block">లేనివి ❓</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">{batchScanStats.missingInDb}</span>
                </div>
              </div>

              {/* Quick Settings Toggles */}
              <div className="flex flex-wrap items-center gap-4 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipAlreadyVerified}
                    onChange={(e) => setSkipAlreadyVerified(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                  <span>ముందే సరిచూసిన వాటిని స్కిప్ చేయి (Skip Verified)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAttachDiagrams}
                    onChange={(e) => setAutoAttachDiagrams(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-0"
                  />
                  <span>మిస్సింగ్ డయాగ్రమ్‌లను ఆటోమేటిక్‌గా జతచేయి (Auto-attach Diagrams)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoFixAnswers}
                    onChange={(e) => setAutoFixAnswers(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-0"
                  />
                  <span>అధికారిక కీ ప్రకారం ఆటో-సరిదిద్దు (Auto-fix Key)</span>
                </label>
              </div>

              {/* Latest Action Log */}
              {batchScanLogs.length > 0 && (
                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 truncate bg-white/70 dark:bg-slate-950/50 px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
                  <span className="font-mono text-slate-400">[{batchScanLogs[0].time}]</span> {batchScanLogs[0].text}
                </div>
              )}
            </div>
          )}

          {/* Questions Scrollable Stream */}
          <div ref={listContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                <p className="text-sm font-semibold">Loading questions from database...</p>
              </div>
            ) : errorMsg ? (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Error loading questions
                </p>
                <p className="mt-1 text-xs">{errorMsg}</p>
                <button
                  onClick={fetchPaperQuestions}
                  className="mt-3 px-3 py-1 bg-rose-600 text-white rounded text-xs font-bold"
                >
                  Retry Fetch
                </button>
              </div>
            ) : activeFilter === 'missing' ? (
              /* Missing Questions Tab */
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-bold">⚠️ {missingQNums.length} Questions Missing</span> from this paper in the
                  database. Check the PDF on the right side to extract or manually add them.
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {missingQNums.map((num) => (
                    <div
                      key={num}
                      className="p-3 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/80 rounded-xl flex items-center justify-between shadow-sm"
                    >
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-400">Q#{num}</span>
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleJumpToQuestion(num)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                        >
                          PDF 📄
                        </button>
                        <button
                          onClick={() => handleScanQuestion(undefined, num)}
                          disabled={isScanningAny}
                          className="px-2 py-0.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded transition flex items-center gap-0.5 shadow-sm"
                        >
                          <Zap className="w-3 h-3" />
                          <span>స్కాన్ & చేర్చు</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="py-20 text-center text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-semibold">No questions match the current filter.</p>
              </div>
            ) : (
              /* Normal Question Stream */
              filteredQuestions.map((q, idx) => {
                const isEditing = editingQid === q.question_id;
                const isDeleting = deletingQid === q.question_id;

                return (
                  <article
                    key={q.question_id}
                    id={`q-card-${q.qNum ?? idx + 1}`}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm transition-all duration-200 ${
                      q.isVerified
                        ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/10 ring-1 ring-emerald-500/20'
                        : q.image_url
                        ? 'border-indigo-300 dark:border-indigo-800/80 ring-1 ring-indigo-400/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Card Top: Number, Subject Badge, Topic & Action Buttons */}
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-black text-sm shadow-sm ${
                          q.isVerified ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
                        }`}>
                          {q.qNum ?? idx + 1}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            q.subject === 'Mathematics'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                              : q.subject === 'Physics'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                              : q.subject === 'Chemistry'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {q.subject}
                        </span>

                        {q.isVerified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-400 dark:border-emerald-700 shadow-xs">
                            <CheckCheck className="w-3 h-3 text-emerald-600" />
                            <span>సరిచూసినది (Verified)</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
                            ⏳ సరిచూడలేదు
                          </span>
                        )}

                        {q.topic && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[140px]" title={q.topic}>
                            • {q.topic}
                          </span>
                        )}
                        {q.image_url ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-300 dark:border-indigo-800">
                            🖼️ Diagram Attached
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                            Text
                          </span>
                        )}
                      </div>

                      {/* Top Right Action Buttons: Edit, Delete, Jump PDF */}
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleVerified(q)}
                          title={q.isVerified ? "సరిచూసిన స్థితిని తీసివేయి (Unmark Verified)" : "సరిచూసినట్లుగా గుర్తించు (Mark as Verified)"}
                          className={`px-2 py-1 text-xs font-bold rounded-lg border transition flex items-center gap-1 ${
                            q.isVerified
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700'
                              : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                          }`}
                        >
                          <CheckCircle2 className={`w-3.5 h-3.5 ${q.isVerified ? 'text-emerald-600' : 'text-slate-400'}`} />
                          <span className="hidden sm:inline">{q.isVerified ? 'Verified ✓' : 'Verify'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleJumpToQuestion(q.qNum ?? idx + 1)}
                          title="Jump PDF to estimated page"
                          className="px-2 py-1 text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded transition flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">PDF</span>
                        </button>

                        {!isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleScanQuestion(q)}
                              disabled={scanningQid === q.question_id}
                              title="Scan this question from PDF & Compare / Auto-fix"
                              className="px-2 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg border border-amber-300 dark:border-amber-700 transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                            >
                              <Zap className={`w-3 h-3 text-amber-500 ${scanningQid === q.question_id ? 'animate-bounce' : ''}`} />
                              <span>{scanningQid === q.question_id ? 'స్కాన్...' : '⚡ స్కాన్'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStartEdit(q)}
                              title="Modify question in database"
                              className="px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg border border-blue-200 dark:border-blue-800 transition flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q)}
                              disabled={isDeleting}
                              title="Delete from database"
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(q.question_id)}
                              disabled={savingQid === q.question_id}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              <span>{savingQid === q.question_id ? 'Saving...' : 'Save'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingQid(null)}
                              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Body: Normal View or Inline Edit Mode */}
                    {isEditing ? (
                      /* ── INLINE EDIT MODE ── */
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                            English Question Text
                          </label>
                          <textarea
                            rows={3}
                            value={editFormData.question_text_en || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, question_text_en: e.target.value })
                            }
                            className="w-full text-xs font-mono p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                            Telugu Question Text
                          </label>
                          <textarea
                            rows={2}
                            value={editFormData.question_text_te || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, question_text_te: e.target.value })
                            }
                            className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* Diagram URL Field */}
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                            Diagram Image (data:image/png;base64,... or URL)
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editFormData.image_url || ''}
                              onChange={(e) =>
                                setEditFormData({ ...editFormData, image_url: e.target.value })
                              }
                              placeholder="Leave blank if no diagram"
                              className="flex-1 text-xs p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                            />
                            {editFormData.image_url && (
                              <button
                                type="button"
                                onClick={() => setEditFormData({ ...editFormData, image_url: '' })}
                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Options 1-4 */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                            Options & Correct Answer
                          </label>
                          {[0, 1, 2, 3].map((optIdx) => (
                            <div key={optIdx} className="flex items-center space-x-2">
                              <input
                                type="radio"
                                name={`correct-${q.question_id}`}
                                checked={String(editFormData.correct_option) === String(optIdx + 1)}
                                onChange={() =>
                                  setEditFormData({ ...editFormData, correct_option: optIdx + 1 })
                                }
                                title="Mark as correct answer"
                                className="text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="text-xs font-bold text-slate-400 w-4">
                                ({optIdx + 1})
                              </span>
                              <input
                                type="text"
                                value={editFormData.options_en?.[optIdx] || ''}
                                onChange={(e) => {
                                  const newOpts = [...(editFormData.options_en || ['', '', '', ''])];
                                  newOpts[optIdx] = e.target.value;
                                  setEditFormData({ ...editFormData, options_en: newOpts });
                                }}
                                placeholder={`Option ${optIdx + 1} (English)`}
                                className="flex-1 text-xs p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                              <input
                                type="text"
                                value={editFormData.options_te?.[optIdx] || ''}
                                onChange={(e) => {
                                  const newOpts = [...(editFormData.options_te || ['', '', '', ''])];
                                  newOpts[optIdx] = e.target.value;
                                  setEditFormData({ ...editFormData, options_te: newOpts });
                                }}
                                placeholder="తెలుగు"
                                className="w-1/3 text-xs p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* ── NORMAL CARD DISPLAY ── */
                      <div className="space-y-3">
                        {/* English Question */}
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                          <MathRenderer content={q.question_text_en} />
                        </div>

                        {/* Telugu Question */}
                        {q.question_text_te && (
                          <div className="text-sm font-normal text-slate-700 dark:text-slate-300 leading-relaxed pt-1">
                            <MathRenderer content={q.question_text_te} />
                          </div>
                        )}

                        {/* Cropped Diagram Image (if attached) */}
                        {q.image_url && (
                          <div className="my-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 inline-block">
                            <div className="flex items-center justify-between mb-1 text-[11px] font-bold text-slate-500">
                              <span>DIAGRAM / FIGURE:</span>
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={() => setFullImageViewUrl(q.image_url || null)}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                                >
                                  <Maximize2 className="w-3 h-3" /> Zoom
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveImageOnly(q)}
                                  className="text-rose-500 hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            <img
                              src={q.image_url}
                              alt={`Diagram for Q${q.qNum ?? idx + 1}`}
                              className="max-h-56 max-w-full rounded border border-slate-200 dark:border-slate-700 bg-white object-contain cursor-pointer shadow-sm hover:opacity-95"
                              onClick={() => setFullImageViewUrl(q.image_url || null)}
                            />
                          </div>
                        )}

                        {/* Options List */}
                        {q.options_en && q.options_en.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                            {q.options_en.map((opt, oIdx) => {
                              const isCorrect = String(q.correct_option) === String(oIdx + 1);
                              return (
                                <div
                                  key={oIdx}
                                  className={`p-2.5 rounded-xl text-xs flex items-start space-x-2 transition ${
                                    isCorrect
                                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-semibold'
                                      : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <span
                                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                      isCorrect
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {isCorrect ? '✓' : oIdx + 1}
                                  </span>
                                  <div className="flex-1">
                                    <MathRenderer content={opt} />
                                    {q.options_te?.[oIdx] && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        <MathRenderer content={q.options_te[oIdx]} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* ── RIGHT PANEL: ORIGINAL PDF VIEWER ── */}
        <section
          style={{ width: `${100 - pdfSplitRatio}%` }}
          className="flex flex-col bg-slate-900 overflow-hidden"
        >
          {/* PDF Toolbar: Navigation & Jump to Section */}
          <div className="p-3 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center justify-between gap-2 text-white text-xs shrink-0">
            {/* Page Navigation */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 hover:bg-slate-700 rounded transition"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold">
                Page{' '}
                <input
                  type="number"
                  min={1}
                  max={totalEstimatedPages}
                  value={currentPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setCurrentPage(val);
                  }}
                  className="w-12 text-center bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-white"
                />
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1 hover:bg-slate-700 rounded transition"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Section Jump Pills */}
            <div className="hidden sm:flex items-center space-x-1.5 text-[11px]">
              <span className="text-slate-400">Jump:</span>
              <button
                onClick={() => setCurrentPage(3)}
                className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-blue-300 font-semibold"
              >
                Math (p.3)
              </button>
              <button
                onClick={() => setCurrentPage(69)}
                className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-purple-300 font-semibold"
              >
                Physics (p.69)
              </button>
              <button
                onClick={() => setCurrentPage(104)}
                className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-emerald-300 font-semibold"
              >
                Chem (p.104)
              </button>
            </div>

            {/* Open in new tab */}
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition"
                title="Open PDF in a new browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Full Tab</span>
              </a>
            )}
          </div>

          {/* PDF Embed Area */}
          <div className="flex-1 w-full h-full relative bg-slate-950 flex items-center justify-center">
            {pdfUrl ? (
              <iframe
                src={`${pdfUrl}#page=${currentPage}&toolbar=1&navpanes=1`}
                title="Original Exam Question Paper PDF"
                className="w-full h-full border-0"
              />
            ) : (
              <div className="text-center text-slate-400 p-8">
                <FileText className="w-16 h-16 mx-auto mb-3 opacity-30 text-indigo-400" />
                <p className="text-sm font-bold text-white mb-1">Original PDF File Viewer</p>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  Select the original PDF file from your computer to inspect side-by-side with database questions.
                </p>
                <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl cursor-pointer shadow-md transition">
                  <span>📂 Choose PDF File</span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setPdfUrl(url);
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── IMAGE ZOOM MODAL (if clicking on full image) ── */}
      {fullImageViewUrl && (
        <div
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setFullImageViewUrl(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 p-3 rounded-2xl max-w-3xl max-h-[90vh] flex flex-col shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                🖼️ High-Resolution Diagram Preview
              </span>
              <button
                onClick={() => setFullImageViewUrl(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-slate-50 dark:bg-slate-950 rounded-xl">
              <img
                src={fullImageViewUrl}
                alt="Enlarged Diagram"
                className="max-h-[75vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── AI SCAN & GROUND-TRUTH VERIFICATION DIFF MODAL ── */}
      {scanDiffModal.isOpen && scanDiffModal.scannedData && (
        <div
          className="fixed inset-0 z-70 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setScanDiffModal({ isOpen: false, dbQuestion: null, scannedData: null })}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-transparent border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>క్వశ్చన్ సరిపోలిక & రీ-ఇన్సర్ట్</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold">
                      Q#{scanDiffModal.scannedData.q_num || scanDiffModal.targetQNum || '—'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    PDF Page {scanDiffModal.targetPage || '—'} నుండి AI ద్వారా లైవ్ స్కాన్ చేయబడిన అసలైన క్వశ్చన్ డేటా.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setScanDiffModal({ isOpen: false, dbQuestion: null, scannedData: null })}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Difference Warning Alerts */}
            <div className="px-6 pt-3 shrink-0 space-y-2">
              {/* ── PRIORITY 1: Question Mismatch (completely different questions!) ── */}
              {scanDiffModal.dbQuestion &&
                scanDiffModal.scannedData?.question_text_en?.trim() &&
                isQuestionMismatch && (
                  <div className="p-3 bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 dark:border-rose-600 rounded-2xl text-xs text-rose-900 dark:text-rose-100 flex items-start space-x-3 shadow-md">
                    <span className="text-2xl shrink-0">❌</span>
                    <div className="flex-1">
                      <p className="font-black text-sm mb-1">క్వశ్చన్లు మ్యాచ్ కాలేదు! (Question Mismatch)</p>
                      <p className="leading-relaxed">
                        <strong>డేటాబేస్ Q#{scanDiffModal.dbQuestion.qNum}</strong> ({scanDiffModal.dbQuestion.subject}) మరియు{' '}
                        <strong>PDF లో స్కాన్ చేసిన Q#{scanDiffModal.scannedData.q_num}</strong> — రెండూ వేరే క్వశ్చన్లు!
                      </p>
                      <p className="mt-1 text-rose-700 dark:text-rose-300">
                        ⚠️ <strong>Replace & Update</strong> బటన్ నొక్కకూడదు — అది తప్పు క్వశ్చన్‌ను overwrite చేస్తుంది.
                        ఇది మీకు నిజంగా missing అయిన question అయితే <strong>Insert as New</strong> వాడండి.
                      </p>
                    </div>
                  </div>
                )}

              {/* ── PRIORITY 2: Answer Key Discrepancy (only when questions DO match) ── */}
              {scanDiffModal.dbQuestion &&
                scanDiffModal.scannedData?.question_text_en?.trim() &&
                !isQuestionMismatch &&
                (Number(scanDiffModal.dbQuestion.correct_option) + 1) !==
                  Number(scanDiffModal.scannedData.correct_option) && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-2xl text-xs text-amber-900 dark:text-amber-200 flex items-center space-x-2 shadow-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <span className="font-bold">⚠️ సమాధానం కీ తేడా (Answer Key Discrepancy): </span>
                      డేటాబేస్‌లో <strong className="underline">Option {Number(scanDiffModal.dbQuestion.correct_option) + 1}</strong> అని ఉంది,
                      కానీ PDF కీ ప్రకారం <strong className="underline text-emerald-700 dark:text-emerald-400">Option {scanDiffModal.scannedData.correct_option} (✓)</strong> సరైన సమాధానం!
                    </div>
                  </div>
                )}

              {/* ── PRIORITY 3: Questions Match — show success ── */}
              {scanDiffModal.dbQuestion &&
                scanDiffModal.scannedData?.question_text_en?.trim() &&
                !isQuestionMismatch &&
                (Number(scanDiffModal.dbQuestion.correct_option) + 1) ===
                  Number(scanDiffModal.scannedData.correct_option) && (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span><strong>క్వశ్చన్ మరియు సమాధానం రెండూ మ్యాచ్ అయ్యాయి!</strong> డేటాబేస్ సరిగ్గా ఉంది ✅</span>
                  </div>
                )}
            </div>

            {/* Side-by-Side Comparison Columns */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ── LEFT: CURRENT DATABASE VERSION ── */}
              <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col shadow-inner">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📁 డేటాబేస్ లో ఉన్న రికార్డు (Current DB)</span>
                  </span>
                  {scanDiffModal.dbQuestion ? (
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      ID: {scanDiffModal.dbQuestion.question_id.slice(-12)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded">
                      డేటాబేస్‌లో లేదు (Missing)
                    </span>
                  )}
                </div>

                {scanDiffModal.dbQuestion ? (
                  <div className="space-y-4 text-xs">
                    {/* ── Diagram FIRST (always visible at top, no need to scroll) ── */}
                    {scanDiffModal.dbQuestion.image_url && (
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                        <span className="font-bold text-indigo-700 dark:text-indigo-400 block mb-1.5 flex items-center gap-1">
                          🖼️ DB Diagram (డయాగ్రమ్):
                        </span>
                        <img
                          src={scanDiffModal.dbQuestion.image_url}
                          alt="DB Diagram"
                          className="max-h-44 max-w-full rounded-lg border-2 border-indigo-300 dark:border-indigo-700 bg-white object-contain shadow-sm cursor-pointer hover:opacity-90"
                          onClick={() => setFullImageViewUrl(scanDiffModal.dbQuestion?.image_url || null)}
                          title="Click to view full size"
                        />
                      </div>
                    )}

                    <div>
                      <span className="font-bold text-slate-400 block mb-1">Question (English):</span>
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                        <MathRenderer content={scanDiffModal.dbQuestion.question_text_en} />
                      </div>
                    </div>

                    {scanDiffModal.dbQuestion.question_text_te && (
                      <div>
                        <span className="font-bold text-slate-400 block mb-1">Question (Telugu):</span>
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                          <MathRenderer content={scanDiffModal.dbQuestion.question_text_te} />
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="font-bold text-slate-400 block mb-1">Options:</span>
                      <div className="space-y-2">
                        {(scanDiffModal.dbQuestion.options_en || []).map((opt, oIdx) => {
                          // DB stores 0-based correct_option (0,1,2,3) — compare with oIdx directly
                          const isCorrect = Number(scanDiffModal.dbQuestion?.correct_option) === oIdx;
                          return (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-xl border flex items-start space-x-2 ${
                                isCorrect
                                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 font-bold text-rose-900 dark:text-rose-200'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[11px] shrink-0">
                                {oIdx + 1}
                              </span>
                              <div className="flex-1">
                                <MathRenderer content={opt} />
                              </div>
                              {isCorrect && (
                                <span className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-bold">
                                  DB Answer
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center text-slate-400">
                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40 text-amber-500" />
                    <p className="font-bold">ఈ క్వశ్చన్ ప్రస్తుతం డేటాబేస్‌లో లేదు.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      కింద ఉన్న "+ Insert as New Question" బటన్ ద్వారా దీన్ని డేటాబేస్‌కు చేర్చవచ్చు.
                    </p>
                  </div>
                )}
              </div>

              {/* ── RIGHT: SCANNED PDF GROUND-TRUTH ── */}
              <div className="bg-emerald-50/40 dark:bg-emerald-950/20 border-2 border-emerald-400/50 dark:border-emerald-600/50 rounded-2xl p-4 flex flex-col shadow-inner">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-200 dark:border-emerald-800/60">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>పీడీఎఫ్ నుండి స్కాన్ చేసిన అసలైన డేటా (Ground-Truth ✓)</span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded">
                    AI Scanned
                  </span>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Show warning if question is empty */}
                  {(!scanDiffModal.scannedData.question_text_en || scanDiffModal.scannedData.question_text_en.trim() === '') ? (
                    <div className="py-10 text-center">
                      <div className="text-4xl mb-3">⚠️</div>
                      <p className="font-bold text-amber-700 dark:text-amber-400 text-sm">క్వశ్చన్ స్కాన్ కాలేదు!</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                        పై <strong>Q# ఫీల్డ్</strong>‌లో సరైన ప్రశ్న నంబర్ (1–160) నమోదు చేసి<br />
                        మళ్ళీ <strong>⚡ స్కాన్</strong> బటన్ నొక్కండి.
                      </p>
                    </div>
                  ) : (
                  <>
                  <div>
                    <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">
                      Question (English / LaTeX):
                    </span>
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800 text-sm leading-relaxed text-slate-900 dark:text-slate-100 ring-1 ring-emerald-500/20">
                      <MathRenderer content={scanDiffModal.scannedData.question_text_en} />
                    </div>
                  </div>

                  {scanDiffModal.scannedData.question_text_te && (
                    <div>
                      <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">
                        Question (Telugu):
                      </span>
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                        <MathRenderer content={scanDiffModal.scannedData.question_text_te} />
                      </div>
                    </div>
                  )}

                  {scanDiffModal.scannedData.image_url && (
                    <div>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-1">
                        🖼️ Cropped Visual Diagram (ఆటో-క్రాప్ చేసిన డయాగ్రమ్):
                      </span>
                      <img
                        src={scanDiffModal.scannedData.image_url}
                        alt="Scanned Diagram"
                        className="max-h-48 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-white shadow-sm"
                      />
                    </div>
                  )}

                  <div>
                    <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">
                      Options & Official Key:
                    </span>
                    <div className="space-y-2">
                      {(scanDiffModal.scannedData.options_en || []).map((opt: string, oIdx: number) => {
                        // Gemini returns 1-based correct_option (1,2,3,4) — compare with oIdx+1
                        const rawCorrect = parseInt(String(scanDiffModal.scannedData.correct_option), 10);
                        const isCorrect = rawCorrect === oIdx + 1;
                        return (
                          <div
                            key={oIdx}
                            className={`p-2.5 rounded-xl border flex items-start space-x-2 transition ${
                              isCorrect
                                ? 'bg-emerald-100/90 dark:bg-emerald-950 border-emerald-400 dark:border-emerald-600 font-bold text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/30'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${
                                isCorrect
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {isCorrect ? '✓' : oIdx + 1}
                            </span>
                            <div className="flex-1">
                              <MathRenderer content={opt} />
                              {scanDiffModal.scannedData.options_te?.[oIdx] && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  <MathRenderer content={scanDiffModal.scannedData.options_te[oIdx]} />
                                </div>
                              )}
                            </div>
                            {isCorrect && (
                              <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded font-bold shrink-0">
                                Official Key ✓
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {scanDiffModal.scannedData.explanation_en && (
                    <div>
                      <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">
                        Explanation (పరిష్కారం):
                      </span>
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 max-h-36 overflow-y-auto">
                        <MathRenderer content={scanDiffModal.scannedData.explanation_en} />
                      </div>
                    </div>
                  )}
                  </>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer Action Buttons */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setScanDiffModal({ isOpen: false, dbQuestion: null, scannedData: null })}
                disabled={applyingScan}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
              >
                రద్దు (Cancel)
              </button>

              <div className="flex items-center space-x-2">
                {scanDiffModal.dbQuestion && (
                  <button
                    type="button"
                    onClick={handleApplyScanReplace}
                    disabled={applyingScan || !scanDiffModal.scannedData?.question_text_en?.trim() || isQuestionMismatch}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      isQuestionMismatch
                        ? '❌ Questions మ్యాచ్ కాలేదు — Replace చేయడం ప్రమాదకరం!'
                        : !scanDiffModal.scannedData?.question_text_en?.trim()
                        ? 'క్వశ్చన్ ఖాళీగా ఉంది - అప్‌డేట్ చేయలేం'
                        : ''
                    }
                  >
                    <CheckCheck className={`w-4 h-4 ${applyingScan ? 'animate-spin' : ''}`} />
                    <span>
                      {applyingScan ? 'అప్‌డేట్ చేస్తోంది...' : '✓ Replace & Update in DB (సరిదిద్ది అప్‌డేట్ చెయ్యి)'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleInsertAsNewQuestion}
                  disabled={applyingScan || !scanDiffModal.scannedData?.question_text_en?.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!scanDiffModal.scannedData?.question_text_en?.trim() ? 'క్వశ్చన్ ఖాళీగా ఉంది - ఇన్సర్ట్ చేయలేం. సరైన Q# తో మళ్ళీ స్కాన్ చేయండి.' : ''}
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {applyingScan ? 'చేర్చుతోంది...' : '+ Insert as New Question (కొత్త క్వశ్చన్‌గా చేర్చు)'}
                  </span>
                </button>
              </div>

              {/* Hint when scanned data is empty */}
              {!scanDiffModal.scannedData?.question_text_en?.trim() && (
                <div className="w-full mt-1 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>స్కాన్ చేసిన క్వశ్చన్ ఖాళీగా ఉంది. పై Q# ఫీల్డ్‌లో సరైన ప్రశ్న నంబర్ (1–160) నమోదు చేసి మళ్ళీ <strong>⚡ స్కాన్</strong> క్లిక్ చేయండి.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── GEMINI API KEY CONFIG MODAL ── */}
      {showApiKeyModal && (
        <div
          className="fixed inset-0 z-70 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowApiKeyModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500" />
                <span>Configure Gemini API Key</span>
              </h4>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              ఫ్రీ-టైర్ కోటా రీచ్ అయినప్పుడు మీ సొంత Google AI Gemini API కీని ఇక్కడ ఇవ్వవచ్చు. ఇది మీ బ్రౌజర్‌లో లోకల్‌గా భద్రపరచబడుతుంది.
            </p>

            <input
              type="password"
              placeholder="AIzaSy..."
              defaultValue={customApiKey}
              id="gemini-key-input"
              className="w-full text-xs font-mono p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl mb-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />

            <div className="flex items-center justify-between">
              {customApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    handleSaveApiKey('');
                  }}
                  className="text-xs text-rose-500 hover:underline"
                >
                  Clear Key
                </button>
              )}
              <div className="flex items-center space-x-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('gemini-key-input') as HTMLInputElement;
                    handleSaveApiKey(el?.value || '');
                  }}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

