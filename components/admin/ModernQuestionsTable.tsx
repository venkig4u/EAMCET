'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Edit3,
  Trash2,
  Copy,
  Check,
  X,
  Filter,
  FilterX,
  Download,
  RotateCcw,
  GripVertical,
  Columns3,
  Maximize2,
  Minimize2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  MoveLeft,
  MoveRight
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { Question, SubjectType } from '@/types';
import blueprintData from '@/data/eamcet-blueprint.json';

export interface ModernQuestionsTableProps {
  questions: Question[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
  initialSubject?: string;
  initialChapter?: string;
}

export type ColumnId = 
  | 'sno'
  | 'subject'
  | 'topic'
  | 'question'
  | 'opt1'
  | 'opt2'
  | 'opt3'
  | 'opt4'
  | 'correct'
  | 'difficulty'
  | 'metadata'
  | 'actions';

interface ColumnDef {
  id: ColumnId;
  label: string;
  minWidth: number;
  defaultWidth: number;
  sortable: boolean;
  filterable: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'sno', label: 'S.No', minWidth: 60, defaultWidth: 70, sortable: true, filterable: false },
  { id: 'subject', label: 'Subject', minWidth: 100, defaultWidth: 130, sortable: true, filterable: true },
  { id: 'topic', label: 'Chapter / Topic', minWidth: 120, defaultWidth: 160, sortable: true, filterable: true },
  { id: 'question', label: 'Question Text', minWidth: 250, defaultWidth: 380, sortable: true, filterable: true },
  { id: 'opt1', label: 'Option 1', minWidth: 120, defaultWidth: 180, sortable: true, filterable: true },
  { id: 'opt2', label: 'Option 2', minWidth: 120, defaultWidth: 180, sortable: true, filterable: true },
  { id: 'opt3', label: 'Option 3', minWidth: 120, defaultWidth: 180, sortable: true, filterable: true },
  { id: 'opt4', label: 'Option 4', minWidth: 120, defaultWidth: 180, sortable: true, filterable: true },
  { id: 'correct', label: 'Answer', minWidth: 80, defaultWidth: 95, sortable: true, filterable: true },
  { id: 'difficulty', label: 'Difficulty', minWidth: 90, defaultWidth: 110, sortable: true, filterable: true },
  { id: 'metadata', label: 'Year / Stream', minWidth: 110, defaultWidth: 130, sortable: true, filterable: true },
  { id: 'actions', label: 'Actions', minWidth: 90, defaultWidth: 110, sortable: false, filterable: false },
];

const DEFAULT_VISIBLE: ColumnId[] = [
  'sno',
  'subject',
  'topic',
  'question',
  'opt1',
  'opt2',
  'opt3',
  'opt4',
  'correct',
  'difficulty',
  'actions'
];

export default function ModernQuestionsTable({
  questions,
  loading,
  onRefresh,
  onEdit,
  onDelete,
  initialSubject = '',
  initialChapter = 'All'
}: ModernQuestionsTableProps) {
  // Global search & column filters
  const [globalSearch, setGlobalSearch] = useState('');
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    subject: initialSubject,
    topic: initialChapter === 'All' ? '' : initialChapter,
    question: '',
    opt1: '',
    opt2: '',
    opt3: '',
    opt4: '',
    correct: '',
    difficulty: '',
    metadata: ''
  });

  // Data mode: Question Bank vs Previous Papers (each mode remembers its own filters)
  const [dataMode, setDataMode] = useState<'question-bank' | 'previous-papers'>('question-bank');
  const [pyqFilters, setPyqFilters] = useState({
    subject: '',
    topic: '',
    question: '',
    state: '',
    year: '',
    stream: '',
    shift: ''
  });

  // Sorting
  const [sortColumn, setSortColumn] = useState<ColumnId>('sno');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Column order & visibility
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(ALL_COLUMNS.map(c => c.id));
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_VISIBLE);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  // Column Resizing
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    ALL_COLUMNS.forEach(col => {
      initial[col.id] = col.defaultWidth;
    });
    return initial;
  });
  const [resizingCol, setResizingCol] = useState<ColumnId | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartW, setResizeStartW] = useState(0);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [jumpPageInput, setJumpPageInput] = useState('');

  // UI state
  const [density, setDensity] = useState<'compact' | 'normal' | 'comfortable'>('normal');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTelugu, setShowTelugu] = useState(false);

  // Sync initial subject / chapter changes
  useEffect(() => {
    if (initialSubject !== undefined) {
      setColumnFilters(prev => ({
        ...prev,
        subject: initialSubject,
        topic: initialChapter === 'All' ? '' : initialChapter
      }));
    }
  }, [initialSubject, initialChapter]);

  // Click outside to close column menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    if (showColumnMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColumnMenu]);

  // Column resizing mouse listeners
  useEffect(() => {
    if (!resizingCol) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartX;
      const colDef = ALL_COLUMNS.find(c => c.id === resizingCol);
      const minW = colDef?.minWidth || 60;
      const newWidth = Math.max(minW, resizeStartW + deltaX);
      setColumnWidths(prev => ({ ...prev, [resizingCol]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingCol(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingCol, resizeStartX, resizeStartW]);

  // Previous Papers subset and mode-scoped dataset
  const pyqQuestions = useMemo(
    () => questions.filter(q => q.is_previous_year === true),
    [questions]
  );
  const scopedQuestions = dataMode === 'previous-papers' ? pyqQuestions : questions;
  const activeSubjectFilter = dataMode === 'previous-papers' ? pyqFilters.subject : columnFilters.subject;
  const activeTopicFilter = dataMode === 'previous-papers' ? pyqFilters.topic : columnFilters.topic;

  const setTopicFilter = (topic: string) => {
    if (dataMode === 'previous-papers') {
      setPyqFilters(prev => ({ ...prev, topic }));
    } else {
      setColumnFilters(prev => ({ ...prev, topic }));
    }
  };

  // Unique list of subjects and topics for quick filter dropdowns
  const { uniqueSubjects, uniqueTopics, availableTopics } = useMemo(() => {
    const subjects = new Set<string>();
    const topics = new Set<string>();
    const countBySubjectAndTopic = new Map<string, number>();

    scopedQuestions.forEach(q => {
      if (q.subject) subjects.add(q.subject);
      if (q.topic) {
        topics.add(q.topic);
        const key = `${q.subject || ''}:::${q.topic}`;
        countBySubjectAndTopic.set(key, (countBySubjectAndTopic.get(key) || 0) + 1);
      }
    });

    // Also ensure official blueprint subjects are available
    if (blueprintData && (blueprintData as any).subjects) {
      Object.keys((blueprintData as any).subjects).forEach(s => subjects.add(s));
    }

    // Determine available chapters for the currently selected subject
    let candidateTopics: string[] = [];
    if (activeSubjectFilter) {
      const bpChapters = (((blueprintData as any)?.subjects?.[activeSubjectFilter]?.chapters || []) as any[]).map((c: any) => c.topic);
      const dbTopicsForSubject = new Set<string>();
      scopedQuestions.forEach(q => {
        if (q.subject === activeSubjectFilter && q.topic) {
          dbTopicsForSubject.add(q.topic);
        }
      });
      candidateTopics = Array.from(new Set([...bpChapters, ...Array.from(dbTopicsForSubject)])).sort();
    } else {
      candidateTopics = Array.from(topics).sort();
    }

    const availableTopicsList = candidateTopics.map(t => {
      let cnt = 0;
      if (activeSubjectFilter) {
        cnt = countBySubjectAndTopic.get(`${activeSubjectFilter}:::${t}`) || 0;
      } else {
        scopedQuestions.forEach(q => {
          if (q.topic === t) cnt++;
        });
      }
      return { topic: t, count: cnt };
    });

    return {
      uniqueSubjects: Array.from(subjects).sort(),
      uniqueTopics: Array.from(topics).sort(),
      availableTopics: availableTopicsList
    };
  }, [scopedQuestions, activeSubjectFilter]);

  // Previous Papers facet lists with per-option counts (states, years, streams, shifts)
  const pyqFacets = useMemo(() => {
    const stateCounts = new Map<string, number>();
    const yearCounts = new Map<number, number>();
    const streamCounts = new Map<string, number>();
    const shiftCounts = new Map<string, number>();

    pyqQuestions.forEach(q => {
      if (q.state) stateCounts.set(q.state, (stateCounts.get(q.state) || 0) + 1);
      if (q.year != null) yearCounts.set(q.year, (yearCounts.get(q.year) || 0) + 1);
      if (q.stream) streamCounts.set(q.stream, (streamCounts.get(q.stream) || 0) + 1);
      if (q.shift) shiftCounts.set(q.shift, (shiftCounts.get(q.shift) || 0) + 1);
    });

    return {
      states: Array.from(stateCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, count })),
      years: Array.from(yearCounts.entries()).sort((a, b) => b[0] - a[0]).map(([value, count]) => ({ value: String(value), count })),
      streams: Array.from(streamCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, count })),
      shifts: Array.from(shiftCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, count }))
    };
  }, [pyqQuestions]);

  // Handle Sort
  const handleSort = (column: ColumnId) => {
    const colDef = ALL_COLUMNS.find(c => c.id === column);
    if (!colDef?.sortable) return;

    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        // Toggle back to S.No default
        setSortColumn('sno');
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Filtered Questions — mode-scoped: Previous Papers facets vs Question Bank column filters
  const filteredQuestions = useMemo(() => {
    const searchLower = globalSearch.trim().toLowerCase();
    const source = dataMode === 'previous-papers' ? pyqQuestions : questions;

    return source.filter((q) => {
      // 1. Global Search
      if (searchLower) {
        const textEn = (q.question_text_en || '').toLowerCase();
        const textTe = (q.question_text_te || '').toLowerCase();
        const subject = (q.subject || '').toLowerCase();
        const topic = (q.topic || '').toLowerCase();
        const optsEn = (q.options_en || []).join(' ').toLowerCase();
        const optsTe = (q.options_te || []).join(' ').toLowerCase();
        const expEn = (q.explanation_en || '').toLowerCase();
        const id = (q.question_id || '').toLowerCase();
        const difficulty = (q.difficulty || '').toLowerCase();
        const year = q.year ? String(q.year) : '';

        const matchesGlobal =
          textEn.includes(searchLower) ||
          textTe.includes(searchLower) ||
          subject.includes(searchLower) ||
          topic.includes(searchLower) ||
          optsEn.includes(searchLower) ||
          optsTe.includes(searchLower) ||
          expEn.includes(searchLower) ||
          id.includes(searchLower) ||
          difficulty.includes(searchLower) ||
          year.includes(searchLower);

        if (!matchesGlobal) return false;
      }

      // 2. Previous Papers facet filters (active mode)
      if (dataMode === 'previous-papers') {
        if (pyqFilters.subject && q.subject !== pyqFilters.subject) return false;
        if (pyqFilters.topic) {
          const topicFilter = pyqFilters.topic.toLowerCase();
          if (!(q.topic || '').toLowerCase().includes(topicFilter)) return false;
        }
        if (pyqFilters.question) {
          const qFilter = pyqFilters.question.toLowerCase();
          const inEn = (q.question_text_en || '').toLowerCase().includes(qFilter);
          const inTe = (q.question_text_te || '').toLowerCase().includes(qFilter);
          if (!inEn && !inTe) return false;
        }
        if (pyqFilters.state && q.state !== pyqFilters.state) return false;
        if (pyqFilters.stream && q.stream !== pyqFilters.stream) return false;
        if (pyqFilters.shift && q.shift !== pyqFilters.shift) return false;
        if (pyqFilters.year) {
          const yearFilter = parseInt(pyqFilters.year, 10);
          if (!isNaN(yearFilter) && q.year !== yearFilter) return false;
        }
        return true;
      }

      // 2. Question Bank column-level filters
      if (columnFilters.subject && q.subject !== columnFilters.subject) {
        return false;
      }
      if (columnFilters.topic) {
        const topicFilter = columnFilters.topic.toLowerCase();
        if (!(q.topic || '').toLowerCase().includes(topicFilter)) {
          return false;
        }
      }
      if (columnFilters.question) {
        const qFilter = columnFilters.question.toLowerCase();
        const inEn = (q.question_text_en || '').toLowerCase().includes(qFilter);
        const inTe = (q.question_text_te || '').toLowerCase().includes(qFilter);
        if (!inEn && !inTe) return false;
      }
      if (columnFilters.opt1 && !(q.options_en?.[0] || '').toLowerCase().includes(columnFilters.opt1.toLowerCase())) {
        return false;
      }
      if (columnFilters.opt2 && !(q.options_en?.[1] || '').toLowerCase().includes(columnFilters.opt2.toLowerCase())) {
        return false;
      }
      if (columnFilters.opt3 && !(q.options_en?.[2] || '').toLowerCase().includes(columnFilters.opt3.toLowerCase())) {
        return false;
      }
      if (columnFilters.opt4 && !(q.options_en?.[3] || '').toLowerCase().includes(columnFilters.opt4.toLowerCase())) {
        return false;
      }
      if (columnFilters.correct !== '') {
        const optNum = parseInt(columnFilters.correct, 10);
        if (!isNaN(optNum) && q.correct_option !== (optNum - 1)) {
          return false;
        }
      }
      if (columnFilters.difficulty && q.difficulty !== columnFilters.difficulty) {
        return false;
      }
      if (columnFilters.metadata) {
        const metaFilter = columnFilters.metadata.toLowerCase();
        const metaStr = `${q.year || ''} ${q.state || ''} ${q.stream || ''} ${q.shift || ''}`.toLowerCase();
        if (!metaStr.includes(metaFilter)) return false;
      }

      return true;
    });
  }, [questions, pyqQuestions, globalSearch, columnFilters, pyqFilters, dataMode]);

  // Sorted Questions
  const sortedQuestions = useMemo(() => {
    if (sortColumn === 'sno') {
      return sortDirection === 'asc' ? filteredQuestions : [...filteredQuestions].reverse();
    }

    return [...filteredQuestions].sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      switch (sortColumn) {
        case 'subject':
          valA = a.subject || '';
          valB = b.subject || '';
          break;
        case 'topic':
          valA = a.topic || '';
          valB = b.topic || '';
          break;
        case 'question':
          valA = a.question_text_en || a.question_text_te || '';
          valB = b.question_text_en || b.question_text_te || '';
          break;
        case 'opt1':
          valA = a.options_en?.[0] || '';
          valB = b.options_en?.[0] || '';
          break;
        case 'opt2':
          valA = a.options_en?.[1] || '';
          valB = b.options_en?.[1] || '';
          break;
        case 'opt3':
          valA = a.options_en?.[2] || '';
          valB = b.options_en?.[2] || '';
          break;
        case 'opt4':
          valA = a.options_en?.[3] || '';
          valB = b.options_en?.[3] || '';
          break;
        case 'correct':
          valA = a.correct_option;
          valB = b.correct_option;
          break;
        case 'difficulty':
          valA = a.difficulty || 'Medium';
          valB = b.difficulty || 'Medium';
          break;
        case 'metadata':
          valA = a.year || 0;
          valB = b.year || 0;
          break;
        default:
          return 0;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const cmp = String(valA).localeCompare(String(valB));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredQuestions, sortColumn, sortDirection]);

  // Total pages
  const totalPages = Math.max(1, Math.ceil(sortedQuestions.length / pageSize));

  // Reset page when filter/search/mode changes
  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, columnFilters, pyqFilters, dataMode, pageSize]);

  // Paginated Rows
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedQuestions.slice(start, start + pageSize);
  }, [sortedQuestions, currentPage, pageSize]);

  // Active filters count (active mode's filters)
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (globalSearch.trim()) count++;
    const filters = dataMode === 'previous-papers' ? pyqFilters : columnFilters;
    Object.values(filters).forEach(val => {
      if (val && val.trim()) count++;
    });
    return count;
  }, [globalSearch, columnFilters, pyqFilters, dataMode]);

  // Reset all filters (active mode)
  const handleResetFilters = () => {
    setGlobalSearch('');
    if (dataMode === 'previous-papers') {
      setPyqFilters({
        subject: '',
        topic: '',
        question: '',
        state: '',
        year: '',
        stream: '',
        shift: ''
      });
    } else {
      setColumnFilters({
        subject: '',
        topic: '',
        question: '',
        opt1: '',
        opt2: '',
        opt3: '',
        opt4: '',
        correct: '',
        difficulty: '',
        metadata: ''
      });
    }
    setSortColumn('sno');
    setSortDirection('asc');
  };

  // Toggle Column Visibility
  const toggleColumn = (id: ColumnId) => {
    if (visibleColumns.includes(id)) {
      if (visibleColumns.length === 1) return; // Prevent hiding all
      setVisibleColumns(visibleColumns.filter(c => c !== id));
    } else {
      setVisibleColumns([...visibleColumns, id]);
    }
  };

  // Move Column in Order
  const moveColumn = (id: ColumnId, direction: 'left' | 'right') => {
    const idx = columnOrder.indexOf(id);
    if (idx === -1) return;
    if (direction === 'left' && idx > 0) {
      const nextOrder = [...columnOrder];
      const temp = nextOrder[idx - 1];
      nextOrder[idx - 1] = nextOrder[idx];
      nextOrder[idx] = temp;
      setColumnOrder(nextOrder);
    } else if (direction === 'right' && idx < columnOrder.length - 1) {
      const nextOrder = [...columnOrder];
      const temp = nextOrder[idx + 1];
      nextOrder[idx + 1] = nextOrder[idx];
      nextOrder[idx] = temp;
      setColumnOrder(nextOrder);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (sortedQuestions.length === 0) return;
    const headers = ['S.No', 'Subject', 'Topic', 'Question (EN)', 'Question (TE)', 'Opt 1', 'Opt 2', 'Opt 3', 'Opt 4', 'Correct Option', 'Difficulty', 'Year', 'State', 'Stream', 'Shift'];
    const rows = sortedQuestions.map((q, i) => [
      i + 1,
      `"${(q.subject || '').replace(/"/g, '""')}"`,
      `"${(q.topic || '').replace(/"/g, '""')}"`,
      `"${(q.question_text_en || '').replace(/"/g, '""')}"`,
      `"${(q.question_text_te || '').replace(/"/g, '""')}"`,
      `"${(q.options_en?.[0] || '').replace(/"/g, '""')}"`,
      `"${(q.options_en?.[1] || '').replace(/"/g, '""')}"`,
      `"${(q.options_en?.[2] || '').replace(/"/g, '""')}"`,
      `"${(q.options_en?.[3] || '').replace(/"/g, '""')}"`,
      q.correct_option + 1,
      q.difficulty || 'Medium',
      q.year || '',
      q.state || '',
      q.stream || '',
      q.shift || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `questions_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy text helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Density padding classes
  const cellPaddingClass = {
    compact: 'px-2.5 py-1.5 text-xs',
    normal: 'px-3 py-2 text-xs',
    comfortable: 'px-3.5 py-3 text-sm'
  }[density];

  // Subject Badge Styles
  const getSubjectBadge = (subject: string) => {
    switch (subject) {
      case 'Mathematics':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'Physics':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'Chemistry':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'Botany':
      case 'Zoology':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  // Difficulty Badge
  const getDifficultyBadge = (diff: string) => {
    switch (diff) {
      case 'Easy':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Hard':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      default:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
  };

  // Visible columns in user-specified order
  const activeColumnsInOrder = useMemo(() => {
    return columnOrder.filter(c => visibleColumns.includes(c));
  }, [columnOrder, visibleColumns]);

  return (
    <div className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 p-6 overflow-y-auto' : ''}`}>
      {/* TOP CONTROL BAR: SEARCH, ACTIONS & TOOLBAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Global Search Bar */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search across all questions, options, topics, Telugu text, LaTeX..."
              className="w-full pl-10 pr-9 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all shadow-inner"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Data Mode Toggle: Question Bank / Previous Papers */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <button
                onClick={() => setDataMode('question-bank')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition ${
                  dataMode === 'question-bank'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Browse the full question bank"
              >
                Question Bank ({questions.length})
              </button>
              <button
                onClick={() => {
                  setDataMode('previous-papers');
                  setShowFilterRow(true);
                }}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition ${
                  dataMode === 'previous-papers'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Browse previous year question papers"
              >
                Previous Papers ({pyqQuestions.length})
              </button>
            </div>

            {/* Toggle Column Filters */}
            <button
              onClick={() => setShowFilterRow(!showFilterRow)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
                showFilterRow || activeFiltersCount > 0
                  ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 shadow-sm'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-blue-600 text-white rounded-full text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Toggle Columns Visibility Menu */}
            <div className="relative" ref={columnMenuRef}>
              <button
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
                  showColumnMenu
                    ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span>Columns ({visibleColumns.length}/{ALL_COLUMNS.length})</span>
              </button>

              {/* Column Visibility Dropdown */}
              {showColumnMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Manage Columns
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        onClick={() => setVisibleColumns(ALL_COLUMNS.map(c => c.id))}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() => setVisibleColumns(DEFAULT_VISIBLE)}
                        className="text-slate-500 hover:underline"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                    {columnOrder.map((colId, index) => {
                      const col = ALL_COLUMNS.find(c => c.id === colId);
                      if (!col) return null;
                      const isVisible = visibleColumns.includes(colId);

                      return (
                        <div
                          key={colId}
                          className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 group transition"
                        >
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => toggleColumn(colId)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                            />
                            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium select-none">
                              {col.label}
                            </span>
                          </label>

                          {/* Reorder Buttons */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              disabled={index === 0}
                              onClick={() => moveColumn(colId, 'left')}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                              title="Move left/up"
                            >
                              <MoveLeft className="w-3 h-3" />
                            </button>
                            <button
                              disabled={index === columnOrder.length - 1}
                              onClick={() => moveColumn(colId, 'right')}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                              title="Move right/down"
                            >
                              <MoveRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Density Selector */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <button
                onClick={() => setDensity('compact')}
                className={`px-2 py-1.5 rounded-lg font-medium transition ${
                  density === 'compact'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Compact view"
              >
                Compact
              </button>
              <button
                onClick={() => setDensity('normal')}
                className={`px-2 py-1.5 rounded-lg font-medium transition ${
                  density === 'normal'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Normal view"
              >
                Normal
              </button>
              <button
                onClick={() => setDensity('comfortable')}
                className={`px-2 py-1.5 rounded-lg font-medium transition ${
                  density === 'comfortable'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Comfortable view"
              >
                Spacious
              </button>
            </div>

            {/* Language preview toggle (Bilingual Telugu / English) */}
            <button
              onClick={() => setShowTelugu(!showTelugu)}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl border transition ${
                showTelugu
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
              title="Show Telugu bilingual preview in table"
            >
              <span>తెలుగు {showTelugu ? 'ON' : 'OFF'}</span>
            </button>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCSV}
              disabled={sortedQuestions.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 disabled:opacity-50 transition"
              title="Export filtered questions to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Table'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-800 transition disabled:opacity-50"
              title="Refresh database"
            >
              <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* SUMMARY BADGES & ACTIVE FILTERS STRIP */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Showing {filteredQuestions.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredQuestions.length)}
            </span>
            <span>of</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredQuestions.length} questions</span>
            {filteredQuestions.length !== scopedQuestions.length && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                (Filtered from {scopedQuestions.length} total)
              </span>
            )}
            {sortColumn !== 'sno' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Sorted by {ALL_COLUMNS.find(c => c.id === sortColumn)?.label} ({sortDirection.toUpperCase()})
              </span>
            )}
          </div>

          {activeFiltersCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:underline font-semibold"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Clear all filters</span>
            </button>
          )}
        </div>

        {/* COLLAPSIBLE COLUMN FILTER ROW */}
        {showFilterRow && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-150">
            {dataMode === 'previous-papers' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {/* Subject Filter (Previous Papers) */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Subject
                </label>
                <select
                  value={pyqFilters.subject}
                  onChange={(e) => {
                    const newSub = e.target.value;
                    setPyqFilters(prev => ({
                      ...prev,
                      subject: newSub,
                      topic: '' // Reset chapter filter when subject changes so it doesn't filter out everything
                    }));
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="">All Subjects ({scopedQuestions.length})</option>
                  {uniqueSubjects.map(sub => {
                    const subCount = scopedQuestions.filter(q => q.subject === sub).length;
                    return (
                      <option key={sub} value={sub}>
                        {sub} ({subCount})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* State Filter */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  State
                </label>
                <select
                  value={pyqFilters.state}
                  onChange={(e) => setPyqFilters({ ...pyqFilters, state: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="">All States ({scopedQuestions.length})</option>
                  {pyqFacets.states.map(({ value, count }) => (
                    <option key={value} value={value}>
                      {value} ({count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Year Filter */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Year
                </label>
                <select
                  value={pyqFilters.year}
                  onChange={(e) => setPyqFilters({ ...pyqFilters, year: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="">All Years ({scopedQuestions.length})</option>
                  {pyqFacets.years.map(({ value, count }) => (
                    <option key={value} value={value}>
                      {value} ({count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Stream Filter */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Stream
                </label>
                <select
                  value={pyqFilters.stream}
                  onChange={(e) => setPyqFilters({ ...pyqFilters, stream: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="">All Streams ({scopedQuestions.length})</option>
                  {pyqFacets.streams.map(({ value, count }) => (
                    <option key={value} value={value}>
                      {value} ({count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Shift Filter */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Shift
                </label>
                <select
                  value={pyqFilters.shift}
                  onChange={(e) => setPyqFilters({ ...pyqFilters, shift: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="">All Shifts ({scopedQuestions.length})</option>
                  {pyqFacets.shifts.map(({ value, count }) => (
                    <option key={value} value={value}>
                      {value} ({count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Question Text Filter (Previous Papers) */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Question Text
                </label>
                <input
                  type="text"
                  value={pyqFilters.question}
                  onChange={(e) => setPyqFilters({ ...pyqFilters, question: e.target.value })}
                  placeholder="Search question..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {/* Subject Filter */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Subject
                </label>
                <select
                  value={columnFilters.subject}
                  onChange={(e) => {
                    const newSub = e.target.value;
                    setColumnFilters(prev => ({
                      ...prev,
                      subject: newSub,
                      topic: '' // Reset topic filter when subject changes so it doesn't filter out everything
                    }));
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="">All Subjects ({scopedQuestions.length})</option>
                  {uniqueSubjects.map(sub => {
                    const subCount = scopedQuestions.filter(q => q.subject === sub).length;
                    return (
                      <option key={sub} value={sub}>
                        {sub} ({subCount})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Chapter Filter */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Chapter / Topic
                </label>
                <select
                  value={columnFilters.topic}
                  onChange={(e) => setColumnFilters({ ...columnFilters, topic: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="">
                    All Chapters ({availableTopics.reduce((acc, t) => acc + t.count, 0)})
                  </option>
                  {availableTopics.map(({ topic, count }) => (
                    <option key={topic} value={topic}>
                      {topic} ({count})
                    </option>
                  ))}
                </select>
              </div>

            {/* Question Text Filter */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                Question Text
              </label>
              <input
                type="text"
                value={columnFilters.question}
                onChange={(e) => setColumnFilters({ ...columnFilters, question: e.target.value })}
                placeholder="Search question..."
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Correct Option Filter */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                Correct Answer
              </label>
              <select
                value={columnFilters.correct}
                onChange={(e) => setColumnFilters({ ...columnFilters, correct: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All Answers</option>
                <option value="1">Option 1 (A)</option>
                <option value="2">Option 2 (B)</option>
                <option value="3">Option 3 (C)</option>
                <option value="4">Option 4 (D)</option>
              </select>
            </div>

            {/* Difficulty Filter */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                Difficulty
              </label>
              <select
                value={columnFilters.difficulty}
                onChange={(e) => setColumnFilters({ ...columnFilters, difficulty: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            </div>
            )}

          {/* Quick Chapter Filter Badges & Health Breakdown */}
          {availableTopics.length > 0 && (
            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  {activeSubjectFilter ? `${activeSubjectFilter} Chapters Status (${availableTopics.length} Chapters)` : `All Chapters Overview (${availableTopics.length})`}
                </span>
                {activeTopicFilter && (
                  <button
                    onClick={() => setTopicFilter('')}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    Clear Chapter Filter
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                <button
                  onClick={() => setTopicFilter('')}
                  className={`text-xs px-2.5 py-1 rounded-lg shrink-0 font-medium transition ${
                    !activeTopicFilter
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All ({availableTopics.reduce((acc, t) => acc + t.count, 0)})
                </button>
                {availableTopics.map(({ topic, count }) => {
                  const isSelected = activeTopicFilter === topic;
                  const hasQuestions = count > 0;
                  return (
                    <button
                      key={topic}
                      onClick={() => setTopicFilter(isSelected ? '' : topic)}
                      title={`${topic}: ${count} questions`}
                      className={`text-xs px-2.5 py-1 rounded-lg shrink-0 font-medium transition flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : hasQuestions
                            ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                            : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                      }`}
                    >
                      <span className="truncate max-w-[200px]">{topic}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : hasQuestions
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                            : 'bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* MODERN DATA TABLE CONTAINER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* TABLE HORIZONTAL SCROLL WRAPPER */}
        <div className="overflow-x-auto max-h-[640px] relative scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
            {/* STICKY TABLE HEADER */}
            <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-850/95 backdrop-blur z-20 border-b border-slate-200 dark:border-slate-700 select-none shadow-sm">
              <tr>
                {activeColumnsInOrder.map((colId) => {
                  const col = ALL_COLUMNS.find(c => c.id === colId)!;
                  const isSorted = sortColumn === colId;
                  const width = columnWidths[colId] || col.defaultWidth;

                  return (
                    <th
                      key={colId}
                      style={{ width, minWidth: col.minWidth }}
                      className={`relative group ${cellPaddingClass} font-semibold text-slate-700 dark:text-slate-300 tracking-wider text-[11px] uppercase border-r border-slate-200 dark:border-slate-700/80 transition-colors ${
                        col.sortable ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : ''
                      } ${isSorted ? 'bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : ''}`}
                      onClick={() => col.sortable && handleSort(colId)}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{col.label}</span>
                        {col.sortable && (
                          <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 flex-shrink-0">
                            {isSorted ? (
                              sortDirection === 'asc' ? (
                                <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 font-bold" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 font-bold" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Resizing Handle */}
                      <div
                        className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-10 transition-colors ${
                          resizingCol === colId
                            ? 'bg-blue-500'
                            : 'hover:bg-blue-400/80 group-hover:bg-slate-300 dark:group-hover:bg-slate-600'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setResizingCol(colId);
                          setResizeStartX(e.clientX);
                          setResizeStartW(columnWidths[colId] || col.defaultWidth);
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* TABLE BODY */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200 font-normal">
              {loading ? (
                <tr>
                  <td colSpan={activeColumnsInOrder.length} className="py-20 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-semibold">ప్రశ్నలు లోడ్ అవుతున్నాయి (Loading questions)...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedQuestions.length === 0 ? (
                <tr>
                  <td colSpan={activeColumnsInOrder.length} className="py-16 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-medium">ఈ ఫిల్టర్‌తో ఎటువంటి ప్రశ్నలు దొరకలేదు.</p>
                      <p className="text-xs text-slate-400">No questions match your current search or filter criteria.</p>
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={handleResetFilters}
                          className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedQuestions.map((q, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const isAnswerOpt1 = q.correct_option === 0;
                  const isAnswerOpt2 = q.correct_option === 1;
                  const isAnswerOpt3 = q.correct_option === 2;
                  const isAnswerOpt4 = q.correct_option === 3;

                  return (
                    <tr
                      key={q.question_id || idx}
                      className="hover:bg-blue-50/40 dark:hover:bg-slate-800/60 transition-colors group"
                      onDoubleClick={() => setPreviewQuestion(q)}
                    >
                      {activeColumnsInOrder.map((colId) => {
                        switch (colId) {
                          case 'sno':
                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} font-mono text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800 text-center font-medium`}
                              >
                                {globalIdx}
                              </td>
                            );

                          case 'subject':
                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} border-r border-slate-100 dark:border-slate-800`}
                              >
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getSubjectBadge(q.subject)}`}>
                                  {q.subject}
                                </span>
                              </td>
                            );

                          case 'topic':
                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} font-medium text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 truncate`}
                                title={q.topic}
                              >
                                {q.topic || '—'}
                              </td>
                            );

                          case 'question':
                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} border-r border-slate-100 dark:border-slate-800 relative`}
                              >
                                <div className="space-y-1">
                                  <div className="line-clamp-2 cursor-pointer font-medium hover:text-blue-600 dark:hover:text-blue-400 transition" onClick={() => setPreviewQuestion(q)}>
                                    <MathRenderer content={q.question_text_en} inline />
                                  </div>
                                  {showTelugu && q.question_text_te && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 border-t border-slate-100 dark:border-slate-800/60 pt-0.5 font-normal">
                                      {q.question_text_te}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );

                          case 'opt1':
                          case 'opt2':
                          case 'opt3':
                          case 'opt4': {
                            const optIndex = colId === 'opt1' ? 0 : colId === 'opt2' ? 1 : colId === 'opt3' ? 2 : 3;
                            const isCorrect = q.correct_option === optIndex;
                            const optTextEn = q.options_en?.[optIndex] || '';
                            const optTextTe = q.options_te?.[optIndex] || '';

                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} border-r border-slate-100 dark:border-slate-800 ${
                                  isCorrect ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                                }`}
                              >
                                <div className="flex items-start gap-1">
                                  {isCorrect && (
                                    <span className="flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400 font-bold" title="Correct Option">
                                      ✓
                                    </span>
                                  )}
                                  <div className="truncate flex-1">
                                    <MathRenderer content={optTextEn} inline />
                                    {showTelugu && optTextTe && (
                                      <div className="text-[10px] text-slate-400 truncate">{optTextTe}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          case 'correct':
                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} text-center border-r border-slate-100 dark:border-slate-800`}
                              >
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                  {q.correct_option + 1}
                                </span>
                              </td>
                            );

                          case 'difficulty':
                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} text-center border-r border-slate-100 dark:border-slate-800`}
                              >
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${getDifficultyBadge(q.difficulty || 'Medium')}`}>
                                  {q.difficulty || 'Medium'}
                                </span>
                              </td>
                            );

                          case 'metadata':
                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} text-xs text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800`}
                              >
                                <div className="space-y-0.5 text-[11px]">
                                  {q.year && <span className="font-semibold text-slate-700 dark:text-slate-300">{q.year} </span>}
                                  {q.state && <span className="uppercase text-blue-600 font-bold">[{q.state}]</span>}
                                  {q.shift && <div className="text-[10px] text-slate-400 truncate">{q.shift}</div>}
                                </div>
                              </td>
                            );

                          case 'actions':
                            return (
                              <td
                                key={colId}
                                className={`${cellPaddingClass} text-center`}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  {/* Preview Details */}
                                  <button
                                    onClick={() => setPreviewQuestion(q)}
                                    className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition"
                                    title="View Full Question Details"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Edit Question */}
                                  <button
                                    onClick={() => onEdit(q)}
                                    className="p-1 rounded-md text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 transition"
                                    title="Edit Question"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Copy LaTeX */}
                                  <button
                                    onClick={() => handleCopy(q.question_text_en, q.question_id || String(globalIdx))}
                                    className="p-1 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 transition"
                                    title="Copy English LaTeX Question"
                                  >
                                    {copiedId === (q.question_id || String(globalIdx)) ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>

                                  {/* Delete Question */}
                                  <button
                                    onClick={() => onDelete(q.question_id!)}
                                    className="p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition"
                                    title="Delete Question"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            );

                          default:
                            return null;
                        }
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* BOTTOM PAGINATION & METRICS TOOLBAR */}
        <div className="bg-slate-50/90 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          {/* Rows per page selector & Quick Stats */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <span className="hidden md:inline-block text-slate-300 dark:text-slate-700">|</span>

            <span className="hidden md:inline-block">
              Page <span className="font-bold text-slate-900 dark:text-white">{currentPage}</span> of <span className="font-bold text-slate-900 dark:text-white">{totalPages}</span>
            </span>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-1">
            {/* First Page */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Previous Page */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Numeric Page Buttons (Windowed) */}
            <div className="flex items-center gap-1 mx-1">
              {(() => {
                const pages: (number | string)[] = [];
                if (totalPages <= 7) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  if (currentPage <= 4) {
                    pages.push(1, 2, 3, 4, 5, '...', totalPages);
                  } else if (currentPage >= totalPages - 3) {
                    pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                  } else {
                    pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
                  }
                }

                return pages.map((page, i) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-slate-400 select-none">
                        ...
                      </span>
                    );
                  }

                  const isCurrent = page === currentPage;
                  return (
                    <button
                      key={`page-${page}`}
                      onClick={() => setCurrentPage(Number(page))}
                      className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {page}
                    </button>
                  );
                });
              })()}
            </div>

            {/* Next Page */}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Last Page */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>

            {/* Direct Jump to Page Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = parseInt(jumpPageInput, 10);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                  setCurrentPage(p);
                  setJumpPageInput('');
                }
              }}
              className="hidden lg:flex items-center gap-1 ml-2"
            >
              <span className="text-[11px] text-slate-400">Go to:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                placeholder="#"
                className="w-11 px-1.5 py-1 text-center text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </form>
          </div>
        </div>
      </div>

      {/* QUICK PREVIEW MODAL */}
      {previewQuestion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${getSubjectBadge(previewQuestion.subject)}`}>
                  {previewQuestion.subject}
                </span>
                <span className="text-xs text-slate-500 font-semibold">• {previewQuestion.topic}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getDifficultyBadge(previewQuestion.difficulty || 'Medium')}`}>
                  {previewQuestion.difficulty || 'Medium'}
                </span>
              </div>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Question Text */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Question (English)</h4>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 text-sm font-medium">
                <MathRenderer content={previewQuestion.question_text_en} />
              </div>
            </div>

            {previewQuestion.question_text_te && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Question (Telugu)</h4>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 text-sm">
                  {previewQuestion.question_text_te}
                </div>
              </div>
            )}

            {/* Options */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Options</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {previewQuestion.options_en?.map((opt, i) => {
                  const isCorrect = previewQuestion.correct_option === i;
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-xl border transition ${
                        isCorrect
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600 text-emerald-900 dark:text-emerald-200 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                          isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                          {i + 1}
                        </span>
                        {isCorrect && (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            (Correct Answer)
                          </span>
                        )}
                      </div>
                      <div className="text-xs">
                        <MathRenderer content={opt} inline />
                        {previewQuestion.options_te?.[i] && (
                          <div className="text-[11px] text-slate-500 mt-1">{previewQuestion.options_te[i]}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Explanation */}
            {previewQuestion.explanation_en && (
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Explanation</h4>
                <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900 text-xs">
                  <MathRenderer content={previewQuestion.explanation_en} />
                </div>
              </div>
            )}

            {/* Metadata Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
              <div className="space-x-3">
                {previewQuestion.year && <span>Year: <strong className="text-slate-700 dark:text-slate-300">{previewQuestion.year}</strong></span>}
                {previewQuestion.state && <span>State: <strong className="text-slate-700 dark:text-slate-300">{previewQuestion.state}</strong></span>}
                {previewQuestion.shift && <span>Shift: <strong className="text-slate-700 dark:text-slate-300">{previewQuestion.shift}</strong></span>}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const q = previewQuestion;
                    setPreviewQuestion(null);
                    onEdit(q);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs transition"
                >
                  Edit Question
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
