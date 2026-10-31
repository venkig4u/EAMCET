'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Play,
  Pause,
  Flame,
  ShieldCheck,
  Layers,
  Eye,
  ChevronRight,
  Check,
  Copy,
  Loader2,
  BookOpen,
  Atom,
  FlaskConical,
  Calculator,
  Clock,
  BarChart3,
  Server,
  Trash2,
  Key,
  ExternalLink,
  Leaf,
  Mountain,
  Globe,
  Download
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Question } from '@/types';

// Blueprint configuration for the Bulk Question Entry
export const EAMCET_BLUEPRINT = {
  subjects: {
    Mathematics: {
      icon: Calculator,
      color: 'blue',
      chapters: [
        { topic: "Calculus - Integral Calculus", weightagePercent: 12 },
        { topic: "Vector Algebra & 3D Geometry", weightagePercent: 10 },
        { topic: "Algebra - Matrices & Determinants", weightagePercent: 8 },
        { topic: "Algebra - Permutations, Combinations & Probability", weightagePercent: 8 },
        { topic: "Calculus - Limits, Continuity & Differentiability", weightagePercent: 8 },
        { topic: "Coordinate Geometry - Parabola, Ellipse & Hyperbola", weightagePercent: 8 },
        { topic: "Trigonometry & Inverse Trigonometry", weightagePercent: 8 },
        { topic: "Calculus - Applications of Derivatives", weightagePercent: 7 },
        { topic: "Algebra - Binomial Theorem & Sequences", weightagePercent: 6 },
        { topic: "Calculus - Differential Equations", weightagePercent: 6 },
        { topic: "Algebra - Complex Numbers", weightagePercent: 5 },
        { topic: "Coordinate Geometry - Straight Lines", weightagePercent: 5 },
        { topic: "Coordinate Geometry - Circles", weightagePercent: 5 },
        { topic: "Statistics", weightagePercent: 4 }
      ]
    },
    Physics: {
      icon: Atom,
      color: 'purple',
      chapters: [
        { topic: "Mechanics - Laws of Motion & Work-Energy-Power", weightagePercent: 14 },
        { topic: "Electromagnetism - Current Electricity & Circuits", weightagePercent: 12 },
        { topic: "Thermodynamics & Kinetic Theory of Gases", weightagePercent: 12 },
        { topic: "Electromagnetism - Magnetic Effects of Current & Magnetism", weightagePercent: 10 },
        { topic: "Mechanics - Rotational Motion & Gravitation", weightagePercent: 10 },
        { topic: "Optics - Ray Optics & Optical Instruments", weightagePercent: 8 },
        { topic: "Modern Physics - Atoms, Nuclei & Dual Nature of Matter", weightagePercent: 8 },
        { topic: "Mechanics - Kinematics in 1D & 2D", weightagePercent: 8 },
        { topic: "Oscillations, Waves & Sound", weightagePercent: 7 },
        { topic: "Properties of Solids & Fluids (Viscosity, Surface Tension)", weightagePercent: 6 },
        { topic: "Semiconductors & Electronic Devices", weightagePercent: 5 }
      ]
    },
    Chemistry: {
      icon: FlaskConical,
      color: 'emerald',
      chapters: [
        { topic: "Organic Chemistry - Hydrocarbons & Functional Groups", weightagePercent: 14 },
        { topic: "Chemical Bonding & Molecular Structure", weightagePercent: 10 },
        { topic: "Physical Chemistry - Solutions & Colligative Properties", weightagePercent: 9 },
        { topic: "Physical Chemistry - Chemical Kinetics & Equilibrium", weightagePercent: 9 },
        { topic: "Physical Chemistry - Thermodynamics & Thermochemistry", weightagePercent: 9 },
        { topic: "Physical Chemistry - Electrochemistry", weightagePercent: 8 },
        { topic: "Inorganic Chemistry - p-Block Elements", weightagePercent: 8 },
        { topic: "Inorganic Chemistry - Coordination Compounds & d-Block", weightagePercent: 8 },
        { topic: "Organic Chemistry - Carbonyl Compounds, Amines & Biomolecules", weightagePercent: 9 },
        { topic: "Inorganic Chemistry - Periodic Classification & s-Block", weightagePercent: 6 },
        { topic: "Atomic Structure & States of Matter", weightagePercent: 6 },
        { topic: "Environmental Chemistry & General Principles", weightagePercent: 4 }
      ]
    },
    Biology: {
      icon: Leaf,
      color: 'green',
      chapters: [
        { topic: "Plant Physiology - Photosynthesis", weightagePercent: 12 },
        { topic: "Plant Physiology - Respiration", weightagePercent: 10 },
        { topic: "Human Physiology - Digestion & Absorption", weightagePercent: 10 },
        { topic: "Human Physiology - Circulation", weightagePercent: 9 },
        { topic: "Human Physiology - Excretion", weightagePercent: 8 },
        { topic: "Genetics - Principles of Inheritance", weightagePercent: 10 },
        { topic: "Genetics - Molecular Basis of Inheritance", weightagePercent: 9 },
        { topic: "Biotechnology - Principles & Processes", weightagePercent: 8 },
        { topic: "Biotechnology - Applications", weightagePercent: 7 },
        { topic: "Ecology - Organisms & Environment", weightagePercent: 8 },
        { topic: "Reproduction in Organisms", weightagePercent: 9 }
      ]
    },
    Zoology: {
      icon: Mountain,
      color: 'amber',
      chapters: [
        { topic: "Animal Diversity & Classification", weightagePercent: 10 },
        { topic: "Human Physiology - Digestive & Respiratory Systems", weightagePercent: 10 },
        { topic: "Human Reproduction - Gametogenesis & Fertilization", weightagePercent: 10 },
        { topic: "Genetics & Evolution - Chromosomal Disorders", weightagePercent: 10 },
        { topic: "Biotechnology & Immunology - PCR & Antibodies", weightagePercent: 10 },
        { topic: "Human Nervous & Endocrine Systems", weightagePercent: 10 },
        { topic: "Animal Kingdom - Invertebrates & Vertebrates", weightagePercent: 10 },
        { topic: "Human Physiology - Circulatory & Excretory Systems", weightagePercent: 10 },
        { topic: "Ecology & Environmental Biology", weightagePercent: 10 },
        { topic: "Developmental Biology & Embryology", weightagePercent: 10 }
      ]
    }
  }
};

type SubjectKey = 'Mathematics' | 'Physics' | 'Chemistry' | 'Biology' | 'Zoology';

export default function QuestionPipelineDashboard() {
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>('Mathematics');
  const [selectedMethod, setSelectedMethod] = useState<'api' | 'python' | 'pull'>('api');
  const [counts, setCounts] = useState<{ [subject: string]: { total: number; topics: { [topic: string]: number } } }>({
    Mathematics: { total: 0, topics: {} },
    Physics: { total: 0, topics: {} },
    Chemistry: { total: 0, topics: {} },
    Biology: { total: 0, topics: {} },
    Zoology: { total: 0, topics: {} }
  });
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Audit state
  const [isAuditing, setIsAuditing] = useState(false);
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    subject: string;
    total: number;
    unique: number;
    duplicates: number;
    duplicateIds: string[];
    clean: boolean;
  } | null>(null);

  // Generation / Test state
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [batchSize, setBatchSize] = useState<number>(5);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<string[]>([]);
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);

  // Auto-Pipeline state
  const [isAutoPipeline, setIsAutoPipeline] = useState(false);
  const [autoPipelineStats, setAutoPipelineStats] = useState<{ batches: number; inserted: number; skipped: number } | null>(null);
  const autoPipelineRef = useRef<boolean>(false); // live flag — set to false to stop the loop

  // Pull method state
  const [pullSourceUrl, setPullSourceUrl] = useState<string>('');
  const [pullSourceType, setPullSourceType] = useState<'github' | 'api' | 'website'>('github');
  const [pullFilterSubject, setPullFilterSubject] = useState<string>('');
  const [pullMinGrade, setPullMinGrade] = useState<string>('');
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [pullProgress, setPullProgress] = useState<number>(0);
  const [pullError, setPullError] = useState<string | null>(null);
  const [recentSources, setRecentSources] = useState<Array<{url: string, type: string}>>([]);

  // AI source suggestions for the pull panel
  const [sourceSuggestions, setSourceSuggestions] = useState<Array<{ url: string; title: string; type: string; description: string; source: string }>>([]);
  const [sourceSuggestionsLoading, setSourceSuggestionsLoading] = useState(false);
  const [sourceSuggestionsError, setSourceSuggestionsError] = useState<string | null>(null);

  // Auto-fetch AI source suggestions when the pull panel opens
  useEffect(() => {
    if (selectedMethod !== 'pull') return;
    let cancelled = false;
    setSourceSuggestionsLoading(true);
    setSourceSuggestionsError(null);
    fetch('/api/ai/source-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: selectedSubject, chapter: selectedChapter, customApiKey }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.suggestions)) {
          setSourceSuggestions(data.suggestions);
          if (data.provider) addLog(`💡 Source suggestions loaded (${data.provider}).`);
        } else {
          setSourceSuggestions([]);
          setSourceSuggestionsError(data?.error || 'No suggestions available.');
        }
      })
      .catch(() => {
        if (!cancelled) setSourceSuggestionsError('Failed to load source suggestions.');
      })
      .finally(() => {
        if (!cancelled) setSourceSuggestionsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMethod]);


  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setActivityLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Load real-time database counts and saved custom API key on mount
  useEffect(() => {
    fetchDatabaseCounts();
    try {
      const savedKey = localStorage.getItem('eamcet_gemini_api_key');
      if (savedKey) {
        setCustomApiKey(savedKey);
        setShowKeyInput(true);
      }
    } catch (e) {
      // Ignore localStorage error
    }
  }, []);

  const handleSaveCustomKey = (inputKey: string) => {
    let key = inputKey.trim();
    // Auto-extract API key if user pasted a curl command from Google AI Studio
    if (key.includes('curl ') || key.includes('curl"') || key.includes('key=') || key.includes('Bearer ') || key.includes('x-goog-api-key')) {
      const matchKey = key.match(/[?&]key=([a-zA-Z0-9_\.-]+)/);
      const matchHeader = key.match(/x-goog-api-key:\s*['"]?([a-zA-Z0-9_\.-]+)['"]?/i);
      const matchBearer = key.match(/Bearer\s+['"]?([a-zA-Z0-9_\.-]+)['"]?/i);
      if (matchKey && matchKey[1]) {
        key = matchKey[1];
      } else if (matchHeader && matchHeader[1]) {
        key = matchHeader[1];
      } else if (matchBearer && matchBearer[1]) {
        key = matchBearer[1];
      }
    }

    setCustomApiKey(key);
    try {
      if (key) {
        localStorage.setItem('eamcet_gemini_api_key', key);
        addLog('🔑 Custom Gemini API Key saved to browser storage.');
      } else {
        localStorage.removeItem('eamcet_gemini_api_key');
        addLog('🔑 Custom Gemini API Key cleared. Reverted to default.');
      }
    } catch (e) {}
  };

  // Update selected chapter when subject changes
  useEffect(() => {
    const firstChapter = EAMCET_BLUEPRINT.subjects[selectedSubject].chapters[0]?.topic || '';
    setSelectedChapter(firstChapter);
    setAuditResult(null);
  }, [selectedSubject]);

  const fetchDatabaseCounts = async () => {
    if (!supabase) return;
    setLoadingCounts(true);
    addLog('Fetching real-time counts from Supabase Cloud DB...');

    try {
      const subjects: SubjectKey[] = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Zoology'];
      const newCounts: any = {
        Mathematics: { total: 0, topics: {} },
        Physics: { total: 0, topics: {} },
        Chemistry: { total: 0, topics: {} },
        Biology: { total: 0, topics: {} },
        Zoology: { total: 0, topics: {} }
      };

      for (const sub of subjects) {
        // Fetch total count first
        const { count: totalCount, error: countError } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('subject', sub);

        if (!countError && totalCount !== null) {
          newCounts[sub].total = totalCount;
        }

        // Fetch all topic data for this subject using pagination to get ALL rows
        const topicMap: { [topic: string]: number } = {};
        let offset = 0;
        const pageSize = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from('questions')
            .select('topic')
            .eq('subject', sub)
            .range(offset, offset + pageSize - 1);

          if (error) {
            addLog(`❌ Error fetching ${sub} at offset ${offset}: ${error.message}`);
            break;
          }

          if (!data || data.length === 0) break;

          for (const item of data) {
            if (item.topic) {
              topicMap[item.topic] = (topicMap[item.topic] || 0) + 1;
            }
          }

          if (data.length < pageSize) break; // Last batch
          offset += pageSize;
        }

        newCounts[sub].topics = topicMap;
        
        // Debug: log Vector Algebra count if Mathematics
        if (sub === 'Mathematics') {
          const vectorCount = topicMap['Vector Algebra & 3D Geometry'] || 0;
          addLog(`🔍 Vector Algebra count in fetch: ${vectorCount}`);
          console.log('Mathematics topicMap:', topicMap);
        }
      }

      setCounts(newCounts);
      addLog(`Cloud DB counts updated: Math: ${newCounts.Mathematics.total}, Physics: ${newCounts.Physics.total}, Chemistry: ${newCounts.Chemistry.total}, Biology: ${newCounts.Biology.total}, Zoology: ${newCounts.Zoology.total}`);
    } catch (err: any) {
      console.error(err);
      addLog(`Error fetching DB counts: ${err.message}`);
    } finally {
      setLoadingCounts(false);
    }
  };

  // Run duplicate audit for selected subject
  const handleRunAudit = async () => {
    if (!supabase) {
      alert('Supabase not configured in .env.local');
      return;
    }
    setIsAuditing(true);
    setAuditResult(null);
    setErrorMessage(null);
    addLog(`Running duplicate audit for ${selectedSubject}...`);

    try {
      const allRows: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from('questions')
          .select('question_id, topic, question_text_en, options_en')
          .eq('subject', selectedSubject)
          .range(offset, offset + 999);

        if (error) throw error;
        allRows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }

      // Smart semantic normalization for detecting duplicates
      const normalizeText = (raw: string): string => {
        return String(raw || '')
          .toLowerCase()
          // Strip variations like "(Variation 1)", "[Variation 80]"
          .replace(/[\(\[\{]?variation\s*\d+[\)\]\}]?/gi, '')
          // Strip question numbering like "1.", "Q1:", "Question 1:"
          .replace(/^(question\s*\d*[:.]?|\bq\d*[:.]?|\d+[:.)-])\s*/i, '')
          // Strip math delimiters and backslashes
          .replace(/[\$\\]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/^[^\w\d]+|[^\w\d]+$/g, '')
          .trim();
      };

      const seen = new Map<string, string>(); // normalizedText -> first question_id
      const duplicateIds: string[] = [];

      for (const r of allRows) {
        const norm = normalizeText(r.question_text_en);
        if (!norm) continue;

        if (seen.has(norm)) {
          duplicateIds.push(r.question_id);
        } else {
          seen.set(norm, r.question_id);
        }
      }

      const result = {
        subject: selectedSubject,
        total: allRows.length,
        unique: seen.size,
        duplicates: duplicateIds.length,
        duplicateIds: duplicateIds,
        clean: duplicateIds.length === 0
      };

      setAuditResult(result);
      if (result.clean) {
        addLog(`✅ Audit Complete: ${selectedSubject} has 0 duplicates across ${allRows.length} questions! (100% Unique)`);
      } else {
        addLog(`⚠️ Audit Complete: Found ${duplicateIds.length} duplicate questions in ${selectedSubject}!`);
      }
    } catch (err: any) {
      console.error(err);
      addLog(`Audit failed: ${err.message}`);
      alert(`Audit failed: ${err.message}`);
    } finally {
      setIsAuditing(false);
    }
  };

  // Delete redundant duplicate questions from Supabase
  const handleDeleteDuplicates = async () => {
    if (!supabase || !auditResult || auditResult.duplicateIds.length === 0) return;
    
    const count = auditResult.duplicateIds.length;
    const confirmMsg = `Are you sure you want to permanently delete ${count} duplicate questions from "${auditResult.subject}" in the Supabase database?\n\n(Note: 1 unique original copy of each question will be preserved; only redundant duplicate rows will be deleted).`;
    
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsDeletingDuplicates(true);
    setErrorMessage(null);
    setUploadSuccessMsg(null);
    addLog(`🗑️ Starting deletion of ${count} duplicate rows from ${auditResult.subject}...`);

    try {
      const CHUNK_SIZE = 50;
      const ids = auditResult.duplicateIds;
      let deletedTotal = 0;

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('questions')
          .delete()
          .in('question_id', chunk);

        if (error) {
          throw new Error(`Failed deleting batch ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`);
        }
        deletedTotal += chunk.length;
        addLog(`Deleted duplicate batch: ${deletedTotal}/${count} questions removed.`);
      }

      setUploadSuccessMsg(`🎉 Successfully deleted ${deletedTotal} duplicate questions from ${auditResult.subject}! Database is now 100% clean.`);
      addLog(`✅ Deletion complete: ${deletedTotal} duplicate questions purged.`);
      
      // Refresh DB counts and re-run audit to show updated 100% clean state
      await fetchDatabaseCounts();
      await handleRunAudit();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Duplicate cleanup error: ${err.message}`);
      addLog(`❌ Duplicate deletion failed: ${err.message}`);
      alert(`Deletion error: ${err.message}`);
    } finally {
      setIsDeletingDuplicates(false);
    }
  };

  // Fetch ALL existing question texts for a chapter to pass to AI (comprehensive dedup at generation time)
  const fetchExistingSamples = async (chapter: string): Promise<string[]> => {
    if (!supabase) return [];
    try {
      const allTexts: string[] = [];
      // Fetch in batches of 1000 to get ALL existing questions for this chapter
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from('questions')
          .select('question_text_en')
          .eq('topic', chapter)
          .range(offset, offset + 999);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        const batchTexts = data.map((r: any) => String(r.question_text_en || '').trim()).filter(Boolean);
        allTexts.push(...batchTexts);
        
        if (data.length < 1000) break; // Last batch
      }
      return allTexts;
    } catch {
      return [];
    }
  };

  // Generate Questions (Dry-Run or Cloud Ingestion) with Server-Side Engine
  const handleGenerate = async (mode: 'dry-run' | 'insert', targetCount = batchSize) => {
    setIsGenerating(true);
    setErrorMessage(null);
    setUploadSuccessMsg(null);
    addLog(`Initiating ${mode === 'dry-run' ? 'Dry-Run Test' : 'Cloud Ingestion'} (${targetCount} questions for ${selectedSubject} - ${selectedChapter})...`);

    try {
      addLog(`🎯 Target chapter for insertion: "${selectedChapter}"`);
      addLog(`Connecting to AI Generation Engine on server...`);

      // Fetch existing question texts so AI avoids repeating them
      addLog(`📋 Loading ALL existing questions from database for "${selectedChapter}" to prevent duplicates...`);
      const existingSamples = await fetchExistingSamples(selectedChapter);
      if (existingSamples.length > 0) {
        addLog(`🧠 Sending ${existingSamples.length} existing questions to AI as "Do Not Repeat" list (Comprehensive Pre-Generation Check)...`);
      } else {
        addLog(`✅ No existing questions found for "${selectedChapter}" - generating fresh content.`);
      }

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selectedSubject,
          chapter: selectedChapter,
          count: targetCount,
          customApiKey: customApiKey.trim() || undefined,
          existingSamples
        })
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || `AI Generation error (${res.status})`);
      }

      const validQuestions = result.questions || [];
      
      // Log server-side validation results if available
      if (result.validationResults) {
        const { totalGenerated, duplicatesRemoved, uniqueQuestions } = result.validationResults;
        if (duplicatesRemoved > 0) {
          addLog(`🛡️ Server-side validation: Generated ${totalGenerated} questions, removed ${duplicatesRemoved} duplicates, ${uniqueQuestions} unique questions returned.`);
        } else {
          addLog(`✅ Server-side validation: All ${totalGenerated} generated questions are unique!`);
        }
      }
      
      addLog(`✨ Successfully generated ${validQuestions.length} questions using ${result.modelUsed || 'Gemini'}!`);

      setPreviewQuestions(validQuestions);

      if (mode === 'dry-run') {
        addLog(`🧪 Dry-Run preview ready: ${validQuestions.length} questions rendered below. (No DB changes)`);
      } else {
        // Insert into Supabase
        if (!supabase) throw new Error('Supabase not configured');
        addLog(`Uploading ${validQuestions.length} questions to Supabase Cloud Database for chapter "${selectedChapter}"...`);

        // Sanitize rows to match the exact Supabase schema (strip model_id and omit pseudo question_id)
        const dbRows = validQuestions.map((q: any) => {
          const row: any = {
            subject: q.subject || selectedSubject,
            topic: q.topic || selectedChapter,
            question_text_en: q.question_text_en,
            question_text_te: q.question_text_te,
            options_en: q.options_en,
            options_te: q.options_te,
            correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0,
            explanation_en: q.explanation_en || '',
            explanation_te: q.explanation_te || '',
            is_previous_year: q.is_previous_year ?? false,
            stream: q.stream || (selectedSubject === 'Biology' ? 'Agriculture' : 'Engineering'),
            difficulty: q.difficulty || 'Medium'
          };
          if (q.state) row.state = q.state;
          if (q.year) row.year = q.year;
          if (q.shift) row.shift = q.shift;
          if (q.image_url) row.image_url = q.image_url;
          // Always set (PostgREST requires uniform keys across a batch insert)
          row.diagram_json = q.diagram_json || q.diagram || null;
          return row;
        });

        const { data, error } = await supabase.from('questions').insert(dbRows).select('question_id');
        if (error) throw error;

        const insertedCount = data?.length ?? dbRows.length;
        setUploadSuccessMsg(`🎉 Successfully inserted ${insertedCount} new questions for "${selectedChapter}" into Supabase Cloud Database!`);
        addLog(`🚀 Upload complete! ${insertedCount} questions added to Supabase for chapter "${selectedChapter}".`);
        fetchDatabaseCounts();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Generation failed');
      addLog(`❌ Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Helper: build normalized fingerprint string for a question
  const fp = (q: any): string => {
    return String(q.question_text_en || '')
      .toLowerCase()
      // Remove (Variation 123) or [Variation 123]
      .replace(/[\(\[\{]?variation\s*\d+[\)\]\}]?/gi, '')
      // Remove leading numbering like "1. ", "Q1: ", etc.
      .replace(/^(question\s*\d*[:.]?|\bq\d*[:.]?|\d+[:.)-])\s*/i, '')
      // Normalize LaTeX symbols and spaces
      .replace(/[\$\\]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[^\w\d]+|[^\w\d]+$/g, '')
      .trim();
  };

  // Python Batch Generation Handler
  const handlePythonBatchGeneration = async () => {
    if (!selectedChapter) {
      addLog('⚠️ Please select a chapter first.');
      return;
    }

    setIsGenerating(true);
    addLog(`🚀 Starting Python batch generation for ${selectedSubject} - ${selectedChapter} (${batchSize} questions)...`);
    addLog(`🎯 Target chapter for generation: "${selectedChapter}"`);
    addLog(`📋 Using simplified duplicate prevention (no math patterns)`);

    try {
      const res = await fetch('/api/questions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selectedSubject,
          chapter: selectedChapter,
          count: batchSize,
          outputFormat: 'json'
        })
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Python batch generation failed');
      }

      const validQuestions = result.questions || [];
      
      // Log server-side validation results if available
      if (result.validationResults) {
        const { totalGenerated, duplicatesRemoved, uniqueQuestions } = result.validationResults;
        if (duplicatesRemoved > 0) {
          addLog(`🛡️ Server-side validation: Generated ${totalGenerated} questions, removed ${duplicatesRemoved} duplicates, ${uniqueQuestions} unique questions returned.`);
        } else {
          addLog(`✅ Server-side validation: All ${totalGenerated} generated questions are unique!`);
        }
      }
      
      addLog(`✨ Successfully generated ${validQuestions.length} questions using Python script for chapter "${selectedChapter}"!`);
      setPreviewQuestions(validQuestions);
      addLog(`🧪 Python batch preview ready: ${validQuestions.length} questions rendered below.`);

    } catch (err: any) {
      addLog(`❌ Python batch generation failed: ${err.message}`);
      setErrorMessage(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Python Upload to Cloud Handler
  const handlePythonUpload = async () => {
    if (!selectedChapter) {
      addLog('⚠️ Please select a chapter first.');
      return;
    }

    setIsGenerating(true);
    addLog(`🚀 Starting Python batch generation & upload for ${selectedSubject} - ${selectedChapter} (${batchSize} questions)...`);
    addLog(`🎯 Target chapter for insertion: "${selectedChapter}"`);

    try {
      const res = await fetch('/api/questions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selectedSubject,
          chapter: selectedChapter,
          count: batchSize,
          outputFormat: 'json'
        })
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Python batch generation failed');
      }

      const validQuestions = result.questions || [];
      
      // Log server-side validation results if available
      if (result.validationResults) {
        const { totalGenerated, duplicatesRemoved, uniqueQuestions } = result.validationResults;
        if (duplicatesRemoved > 0) {
          addLog(`🛡️ Server-side validation: Generated ${totalGenerated} questions, removed ${duplicatesRemoved} duplicates, ${uniqueQuestions} unique questions returned.`);
        } else {
          addLog(`✅ Server-side validation: All ${totalGenerated} generated questions are unique!`);
        }
      }
      
      addLog(`✨ Successfully generated ${validQuestions.length} questions using Python script for chapter "${selectedChapter}"!`);

      // Insert into Supabase
      if (!supabase) throw new Error('Supabase not configured');
      addLog(`Uploading ${validQuestions.length} questions to Supabase Cloud Database for chapter "${selectedChapter}"...`);

      // Sanitize rows to match the exact Supabase schema
      const dbRows = validQuestions.map((q: any) => {
        const row: any = {
          subject: q.subject || selectedSubject,
          topic: q.topic || selectedChapter,
          question_text_en: q.question_text_en,
          question_text_te: q.question_text_te,
          options_en: q.options_en,
          options_te: q.options_te,
          correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0,
          explanation_en: q.explanation_en || '',
          explanation_te: q.explanation_te || '',
          is_previous_year: q.is_previous_year ?? false,
          stream: q.stream || (selectedSubject === 'Biology' ? 'Agriculture' : 'Engineering'),
          difficulty: q.difficulty || 'Medium'
        };
        if (q.state) row.state = q.state;
        if (q.year) row.year = q.year;
        if (q.shift) row.shift = q.shift;
        if (q.image_url) row.image_url = q.image_url;
        // Always set (PostgREST requires uniform keys across a batch insert)
        row.diagram_json = q.diagram_json || q.diagram || null;
        return row;
      });

      const { data, error } = await supabase.from('questions').insert(dbRows).select('question_id');
      if (error) throw error;

      const insertedCount = data?.length ?? dbRows.length;
      setUploadSuccessMsg(`🎉 Successfully inserted ${insertedCount} new questions for "${selectedChapter}" into Supabase Cloud Database!`);
      addLog(`🚀 Upload complete! ${insertedCount} questions added to Supabase for chapter "${selectedChapter}".`);
      fetchDatabaseCounts();

    } catch (err: any) {
      addLog(`❌ Python upload failed: ${err.message}`);
      setErrorMessage(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Python Auto-Pipeline: continuous generation with built-in dedup fingerprinting
  // ───────────────────────────────────────────────────────────────────────────
  const handlePythonAutoPipeline = async () => {
    if (!supabase) { alert('Supabase not configured.'); return; }
    if (!selectedChapter) { alert('Please select a chapter first.'); return; }

    if (isAutoPipeline) {
      // Stop the running pipeline
      autoPipelineRef.current = false;
      setIsAutoPipeline(false);
      addLog('⏹️ Python Auto-Pipeline stopped by user.');
      return;
    }

    autoPipelineRef.current = true;
    setIsAutoPipeline(true);
    setAutoPipelineStats({ batches: 0, inserted: 0, skipped: 0 });
    setErrorMessage(null);
    setUploadSuccessMsg(null);
    
    // Get all chapters for current subject
    const allChapters = EAMCET_BLUEPRINT.subjects[selectedSubject].chapters.map((c: any) => c.topic);
    let currentChapterIndex = allChapters.indexOf(selectedChapter);
    let currentChapter = selectedChapter;
    
    addLog(`🚀 Python Auto-Pipeline STARTED with cyclic chapter switching (${batchSize} questions / batch, 20 batches per chapter)`);
    addLog(`🎯 Starting with chapter: "${currentChapter}" (${currentChapterIndex + 1}/${allChapters.length})`);

    let batches = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let chapterBatches = 0; // Track batches per chapter
    const BATCHES_PER_CHAPTER = 20;

    try {
      while (autoPipelineRef.current) {
        // Fetch existing fingerprints for current chapter
        addLog(`📋 Loading existing fingerprints from DB for "${currentChapter}"...`);
        const existingFPs = new Set<string>();
        const existingSampleTexts: string[] = [];
        try {
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase
              .from('questions')
              .select('question_text_en, topic, options_en')
              .eq('topic', currentChapter)
              .range(offset, offset + 999);
            if (error) throw error;
            (data || []).forEach((r: any) => {
              existingFPs.add(fp(r));
              const txt = String(r.question_text_en || '').trim();
              if (txt) existingSampleTexts.push(txt);
            });
            if (!data || data.length < 1000) break;
          }
          addLog(`✅ Loaded ${existingFPs.size} existing fingerprints + ${existingSampleTexts.length} sample texts from DB.`);
        } catch (err: any) {
          addLog(`⚠️ Warning: Could not load existing fingerprints: ${err.message}. Continuing without dedup.`);
        }

        // Run batches for current chapter
        chapterBatches = 0;
        while (autoPipelineRef.current && chapterBatches < BATCHES_PER_CHAPTER) {
          batches++;
          chapterBatches++;
          addLog(`🔄 Starting Python batch #${batches} for "${currentChapter}" (${chapterBatches}/${BATCHES_PER_CHAPTER}, ${batchSize} questions)...`);

          try {
            // Verify current chapter and subject before generation
            addLog(`🔍 Generating for Subject: "${selectedSubject}", Chapter: "${currentChapter}"`);
            
            const res = await fetch('/api/questions/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subject: selectedSubject,
                chapter: currentChapter,
                count: batchSize,
                outputFormat: 'json',
                existingSamples: existingSampleTexts
              })
            });

            const result = await res.json();

            if (!res.ok || !result.success) {
              throw new Error(result.error || 'Python batch generation failed');
            }

            const validQuestions = result.questions || [];
            
            // Log server-side validation results if available
            if (result.validationResults) {
              const { totalGenerated, duplicatesRemoved, uniqueQuestions } = result.validationResults;
              if (duplicatesRemoved > 0) {
                addLog(`🛡️ Server-side validation: Generated ${totalGenerated} questions, removed ${duplicatesRemoved} duplicates, ${uniqueQuestions} unique questions returned.`);
              } else {
                addLog(`✅ Server-side validation: All ${totalGenerated} generated questions are unique!`);
              }
            }

            addLog(`✨ Python batch #${batches}: Generated ${validQuestions.length} questions.`);

            // Client-side dedup: filter out questions whose fingerprint already exists in DB
            const newQuestions = validQuestions.filter((q: any) => {
              const qFp = fp(q);
              if (existingFPs.has(qFp)) {
                return false; // skip duplicate
              }
              existingFPs.add(qFp); // mark as seen
              return true;
            });

            if (newQuestions.length === 0) {
              addLog(`⏭️ Batch #${batches}: All ${validQuestions.length} questions were duplicates. Skipping upload.`);
              totalSkipped += validQuestions.length;
            } else {
              addLog(`🧹 Client-side dedup: ${validQuestions.length - newQuestions.length} duplicates removed, ${newQuestions.length} unique questions ready for upload.`);

            // Insert unique questions into Supabase
            const dbRows = newQuestions.map((q: any) => {
              const row: any = {
                subject: q.subject || selectedSubject,
                topic: q.topic || currentChapter,
                question_text_en: q.question_text_en,
                question_text_te: q.question_text_te,
                options_en: q.options_en,
                options_te: q.options_te,
                correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0,
                explanation_en: q.explanation_en || '',
                explanation_te: q.explanation_te || '',
                is_previous_year: q.is_previous_year ?? false,
                stream: q.stream || (selectedSubject === 'Biology' ? 'Agriculture' : 'Engineering'),
                difficulty: q.difficulty || 'Medium'
              };
              if (q.state) row.state = q.state;
              if (q.year) row.year = q.year;
              if (q.shift) row.shift = q.shift;
              if (q.image_url) row.image_url = q.image_url;
              // Always set (PostgREST requires uniform keys across a batch insert)
              row.diagram_json = q.diagram_json || q.diagram || null;
              return row;
            });

            // Verify all rows have correct subject and topic
            const invalidRows = dbRows.filter((r: any) => r.subject !== selectedSubject || r.topic !== currentChapter);
            if (invalidRows.length > 0) {
              addLog(`⚠️ Warning: ${invalidRows.length} rows have incorrect subject/topic!`);
            }

            const { data, error } = await supabase.from('questions').insert(dbRows).select('question_id');
            if (error) throw error;

            const insertedCount = data?.length ?? dbRows.length;
            totalInserted += insertedCount;
            addLog(`🚀 Batch #${batches}: Successfully inserted ${insertedCount} unique questions into Supabase for chapter "${currentChapter}"!`);
            addLog(`📊 Inserted with Subject: "${selectedSubject}", Topic: "${currentChapter}"`);
            
            // Live update database counts after each batch
            await fetchDatabaseCounts();
          }

          // Update live stats
          setAutoPipelineStats({ batches, inserted: totalInserted, skipped: totalSkipped });

          // Log current chapter count
          const currentChapterCount = counts[selectedSubject]?.topics[currentChapter] || 0;
          addLog(`📊 Current chapter "${currentChapter}": ${currentChapterCount} questions in Cloud DB`);

          // Brief delay between batches to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));

          } catch (batchErr: any) {
            addLog(`❌ Batch #${batches} failed: ${batchErr.message}. Stopping pipeline.`);
            setErrorMessage(`Python Auto-Pipeline stopped due to error: ${batchErr.message}`);
            break;
          }
        } // End of inner while loop (chapter batches)

        // Switch to next chapter after 20 batches
        if (chapterBatches >= BATCHES_PER_CHAPTER && autoPipelineRef.current) {
          addLog(`✅ Completed ${BATCHES_PER_CHAPTER} batches for "${currentChapter}". Switching to next chapter...`);
          
          // Move to next chapter
          currentChapterIndex = (currentChapterIndex + 1) % allChapters.length;
          currentChapter = allChapters[currentChapterIndex];
          
          // Update selected chapter state
          setSelectedChapter(currentChapter);
          
          addLog(`🎯 Switched to chapter: "${currentChapter}" (${currentChapterIndex + 1}/${allChapters.length})`);
          addLog(`📌 Subject: "${selectedSubject}" | Chapter: "${currentChapter}"`);
          
          // Clear fingerprints for new chapter
          existingFPs.clear();
          existingSampleTexts.length = 0;
          
          // Refresh database counts
          await fetchDatabaseCounts();
          
          addLog(`✅ Ready to generate questions for "${currentChapter}"`);
        }
      } // End of outer while loop

      if (autoPipelineRef.current) {
        addLog(`🎉 Python Auto-Pipeline completed: ${batches} batches, ${totalInserted} questions inserted, ${totalSkipped} duplicates skipped.`);
        setUploadSuccessMsg(`🎉 Python Auto-Pipeline completed: ${totalInserted} questions inserted across ${batches} batches!`);
      } else {
        addLog(`⏹️ Python Auto-Pipeline stopped by user after ${batches} batches.`);
      }

      fetchDatabaseCounts();

    } catch (err: any) {
      console.error(err);
      addLog(`❌ Python Auto-Pipeline error: ${err.message}`);
      setErrorMessage(err.message);
    } finally {
      setIsAutoPipeline(false);
      autoPipelineRef.current = false;
    }
  };

  // Auto-Pipeline: continuous generation with built-in dedup fingerprinting
  // ───────────────────────────────────────────────────────────────────────────
  const handleAutoPipeline = async () => {
    if (!supabase) { alert('Supabase not configured.'); return; }
    if (!selectedChapter) { alert('Please select a chapter first.'); return; }

    if (isAutoPipeline) {
      autoPipelineRef.current = false;
      setIsAutoPipeline(false);
      addLog('⏹️ Auto-Pipeline stopped by user.');
      return;
    }

    autoPipelineRef.current = true;
    setIsAutoPipeline(true);
    setAutoPipelineStats({ batches: 0, inserted: 0, skipped: 0 });
    setErrorMessage(null);
    setUploadSuccessMsg(null);
    
    // Get all chapters for current subject
    const allChapters = EAMCET_BLUEPRINT.subjects[selectedSubject].chapters.map((c: any) => c.topic);
    let currentChapterIndex = allChapters.indexOf(selectedChapter);
    let currentChapter = selectedChapter;
    
    addLog(`🚀 Smart AI Auto-Pipeline STARTED with cyclic chapter switching (${batchSize} questions / batch, 20 batches per chapter)`);
    addLog(`🎯 Starting with chapter: "${currentChapter}" (${currentChapterIndex + 1}/${allChapters.length})`);

    let batchCount = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let chapterBatches = 0;
    const BATCHES_PER_CHAPTER = 20;

    try {
      while (autoPipelineRef.current) {
        // Fetch existing fingerprints for current chapter
        addLog(`📋 Loading existing fingerprints from DB for "${currentChapter}"...`);
        const existingFPs = new Set<string>();
        const existingSampleTexts: string[] = [];
        try {
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase
              .from('questions')
              .select('question_text_en, topic, options_en')
              .eq('topic', currentChapter)
              .range(offset, offset + 999);
            if (error) throw error;
            (data || []).forEach((r: any) => {
              existingFPs.add(fp(r));
              const txt = String(r.question_text_en || '').trim();
              if (txt) existingSampleTexts.push(txt);
            });
            if (!data || data.length < 1000) break;
          }
          addLog(`✅ Loaded ${existingFPs.size} existing fingerprints (${existingSampleTexts.length} sample texts for AI).`);
        } catch (err: any) {
          addLog(`❌ Failed to load existing fingerprints: ${err.message}`);
          setIsAutoPipeline(false);
          autoPipelineRef.current = false;
          return;
        }

        // Run batches for current chapter
        chapterBatches = 0;
        while (autoPipelineRef.current && chapterBatches < BATCHES_PER_CHAPTER) {
          batchCount++;
          chapterBatches++;
          addLog(`⚙️ Batch #${batchCount}: Generating ${batchSize} questions for "${currentChapter}" (${chapterBatches}/${BATCHES_PER_CHAPTER})...`);

          try {
            const samplesForAI = existingSampleTexts.slice(-100);

            const res = await fetch('/api/ai/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subject: selectedSubject,
                chapter: currentChapter,
                count: batchSize,
                customApiKey: customApiKey.trim() || undefined,
                existingSamples: samplesForAI
              })
            });

            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || `AI error (${res.status})`);

            const generated: any[] = result.questions || [];
            addLog(`🤖 AI Generated: ${generated.length} questions`);
            
            if (result.validationResults) {
              addLog(`🛡️ Server validation: Total ${result.validationResults.totalGenerated}, Removed ${result.validationResults.duplicatesRemoved}, Unique ${result.validationResults.uniqueQuestions}`);
            }

            const uniqueRows: any[] = [];
            let batchSkipped = 0;
            for (const q of generated) {
              const key = fp(q);
              if (existingFPs.has(key)) {
                batchSkipped++;
              } else {
                existingFPs.add(key);
                uniqueRows.push({
                  subject: q.subject || selectedSubject,
                  topic: q.topic || currentChapter,
                  question_text_en: q.question_text_en,
                  question_text_te: q.question_text_te,
                  options_en: q.options_en,
                  options_te: q.options_te,
                  correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0,
                  explanation_en: q.explanation_en || '',
                  explanation_te: q.explanation_te || '',
                  is_previous_year: q.is_previous_year ?? false,
                  stream: q.stream || (selectedSubject === 'Biology' ? 'Agriculture' : 'Engineering'),
                  difficulty: q.difficulty || 'Medium',
                  ...(q.state ? { state: q.state } : {}),
                  ...(q.year ? { year: q.year } : {}),
                  ...(q.shift ? { shift: q.shift } : {}),
                  ...(q.image_url ? { image_url: q.image_url } : {})
                });
              }
            }

            totalSkipped += batchSkipped;
            addLog(`🔍 Client-side filtering: ${generated.length} generated → ${uniqueRows.length} unique, ${batchSkipped} duplicates`);

            if (uniqueRows.length > 0) {
              const { data: inserted, error: insErr } = await supabase.from('questions').insert(uniqueRows).select('question_id');
              if (insErr) throw insErr;
              const count = inserted?.length ?? uniqueRows.length;
              totalInserted += count;
              addLog(`✅ Bulk Insert: +${count} questions inserted into chapter "${currentChapter}"`);
              
              // Update sample list and fetch counts
              uniqueRows.forEach(r => { if (r.question_text_en) existingSampleTexts.push(String(r.question_text_en)); });
              await fetchDatabaseCounts();
            } else {
              addLog(`⚠️ Batch #${batchCount}: All ${generated.length} questions were duplicates — skipped.`);
            }

            setAutoPipelineStats({ batches: batchCount, inserted: totalInserted, skipped: totalSkipped });

            const currentChapterCount = counts[selectedSubject]?.topics[currentChapter] || 0;
            addLog(`📊 Current chapter "${currentChapter}": ${currentChapterCount} questions in Cloud DB`);

            if (autoPipelineRef.current) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (err: any) {
            addLog(`❌ Batch #${batchCount} error: ${err.message}`);
            if (autoPipelineRef.current) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
        
        // Switch to next chapter after 20 batches
        if (chapterBatches >= BATCHES_PER_CHAPTER && autoPipelineRef.current) {
          addLog(`✅ Completed ${BATCHES_PER_CHAPTER} batches for "${currentChapter}". Switching to next chapter...`);
          
          // Move to next chapter
          currentChapterIndex = (currentChapterIndex + 1) % allChapters.length;
          currentChapter = allChapters[currentChapterIndex];
          
          // Update selected chapter state
          setSelectedChapter(currentChapter);
          
          addLog(`🎯 Switched to chapter: "${currentChapter}" (${currentChapterIndex + 1}/${allChapters.length})`);
          addLog(`📌 Subject: "${selectedSubject}" | Chapter: "${currentChapter}"`);
          
          // Clear fingerprints for new chapter
          existingFPs.clear();
          existingSampleTexts.length = 0;
          
          // Refresh database counts
          await fetchDatabaseCounts();
          
          addLog(`✅ Ready to generate questions for "${currentChapter}"`);
        }
      }
    } catch (err: any) {
      addLog(`❌ Auto-Pipeline error: ${err.message}`);
      setIsAutoPipeline(false);
      autoPipelineRef.current = false;
    }

    setIsAutoPipeline(false);
    setUploadSuccessMsg(`🎉 Auto-Pipeline complete! ${totalInserted} unique questions inserted across ${batchCount} batches (${totalSkipped} duplicates skipped).`);
    addLog(`🏁 Auto-Pipeline DONE. Total inserted: ${totalInserted}, Batches: ${batchCount}, Dups skipped: ${totalSkipped}`);
    fetchDatabaseCounts();
  };

  // Pull method handlers
  const handlePullTest = async () => {
    if (!pullSourceUrl.trim()) {
      setPullError('URL is empty. Please enter a URL.');
      return;
    }

    setIsPulling(true);
    setPullError(null);
    setPullProgress(0);
    addLog(`🧪 Pull Test starting: ${pullSourceType} - ${pullSourceUrl}`);

    try {
      const res = await fetch('/api/questions/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: pullSourceUrl,
          sourceType: pullSourceType,
          subject: selectedSubject,
          chapter: selectedChapter,
          count: batchSize,
          dryRun: true,
          outputFormat: 'json',
          filterSubject: pullFilterSubject,
          minGrade: pullMinGrade
        })
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Pull failed');
      }

      setPreviewQuestions(result.questions || []);
      addLog(`✅ Pull Test successful: ${result.questions?.length || 0} questions previewed.`);

      // Add to recent sources
      if (!recentSources.some(s => s.url === pullSourceUrl)) {
        setRecentSources(prev => [{ url: pullSourceUrl, type: pullSourceType }, ...prev].slice(0, 5));
      }

    } catch (err: any) {
      setPullError(err.message);
      addLog(`❌ Pull Test failed: ${err.message}`);
    } finally {
      setIsPulling(false);
      setPullProgress(0);
    }
  };

  const handlePullUpload = async () => {
    if (!pullSourceUrl.trim()) {
      setPullError('URL is empty. Please enter a URL.');
      return;
    }

    if (!supabase) {
      alert('Supabase not configured');
      return;
    }

    setIsPulling(true);
    setPullError(null);
    setPullProgress(0);
    addLog(`🚀 Pull & Upload starting: ${pullSourceType} - ${pullSourceUrl}`);

    try {
      const res = await fetch('/api/questions/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: pullSourceUrl,
          sourceType: pullSourceType,
          subject: selectedSubject,
          chapter: selectedChapter,
          count: batchSize,
          dryRun: false,
          outputFormat: 'json',
          filterSubject: pullFilterSubject,
          minGrade: pullMinGrade
        })
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Pull failed');
      }

      const validQuestions = result.questions || [];
      addLog(`✨ ${validQuestions.length} questions pulled successfully!`);

      // Insert into Supabase
      const dbRows = validQuestions.map((q: any) => {
        const row: any = {
          subject: q.subject || selectedSubject,
          topic: q.topic || selectedChapter,
          question_text_en: q.question_text_en,
          question_text_te: q.question_text_te,
          options_en: q.options_en,
          options_te: q.options_te,
          correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0,
          explanation_en: q.explanation_en || '',
          explanation_te: q.explanation_te || '',
          is_previous_year: q.is_previous_year ?? false,
          stream: q.stream || (selectedSubject === 'Biology' ? 'Agriculture' : 'Engineering'),
          difficulty: q.difficulty || 'Medium'
        };
        if (q.state) row.state = q.state;
        if (q.year) row.year = q.year;
        if (q.shift) row.shift = q.shift;
        if (q.image_url) row.image_url = q.image_url;
        // Always set (PostgREST requires uniform keys across a batch insert)
        row.diagram_json = q.diagram_json || q.diagram || null;
        return row;
      });

      const { data, error } = await supabase.from('questions').insert(dbRows).select('question_id');
      if (error) throw error;

      const insertedCount = data?.length ?? dbRows.length;
      setUploadSuccessMsg(`🎉 ${insertedCount} questions successfully inserted into Supabase!`);
      addLog(`🚀 Upload complete! ${insertedCount} questions added to Supabase.`);
      fetchDatabaseCounts();

      // Add to recent sources
      if (!recentSources.some(s => s.url === pullSourceUrl)) {
        setRecentSources(prev => [{ url: pullSourceUrl, type: pullSourceType }, ...prev].slice(0, 5));
      }

    } catch (err: any) {
      setPullError(err.message);
      addLog(`❌ Pull & Upload failed: ${err.message}`);
    } finally {
      setIsPulling(false);
      setPullProgress(0);
    }
  };

  const handlePullAutoPipeline = async () => {
    if (!supabase) { alert('Supabase not configured.'); return; }
    if (!selectedChapter) { alert('Please select a chapter first.'); return; }
    if (!pullSourceUrl.trim()) { alert('Please enter a source URL first.'); return; }

    if (isAutoPipeline) {
      autoPipelineRef.current = false;
      setIsAutoPipeline(false);
      addLog('⏹️ Pull Auto-Pipeline stopped by user.');
      return;
    }

    autoPipelineRef.current = true;
    setIsAutoPipeline(true);
    setAutoPipelineStats({ batches: 0, inserted: 0, skipped: 0 });
    setErrorMessage(null);
    setUploadSuccessMsg(null);
    addLog(`🚀 Pull Auto-Pipeline STARTED for "${selectedChapter}" (${batchSize} questions / batch)`);
    addLog(`🎯 Source: ${pullSourceType} - ${pullSourceUrl}`);

    // Fetch existing fingerprints for this chapter from DB
    addLog(`📋 Loading existing fingerprints from DB for "${selectedChapter}"...`);
    const existingFPs = new Set<string>();
    try {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from('questions')
          .select('question_text_en, topic, options_en')
          .eq('topic', selectedChapter)
          .range(offset, offset + 999);
        if (error) throw error;
        (data || []).forEach((r: any) => {
          existingFPs.add(fp(r));
        });
        if (!data || data.length < 1000) break;
      }
      addLog(`✅ Loaded ${existingFPs.size} existing fingerprints from DB.`);
    } catch (err: any) {
      addLog(`⚠️ Warning: Could not load existing fingerprints: ${err.message}. Continuing without dedup.`);
    }

    let batches = 0;
    let totalInserted = 0;
    let totalSkipped = 0;

    try {
      while (autoPipelineRef.current) {
        batches++;
        addLog(`🔄 Starting Pull batch #${batches} (${batchSize} questions)...`);

        try {
          const res = await fetch('/api/questions/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceUrl: pullSourceUrl,
              sourceType: pullSourceType,
              subject: selectedSubject,
              chapter: selectedChapter,
              count: batchSize,
              dryRun: false,
              outputFormat: 'json',
              filterSubject: pullFilterSubject,
              minGrade: pullMinGrade
            })
          });

          const result = await res.json();

          if (!res.ok || !result.success) {
            throw new Error(result.error || 'Pull batch failed');
          }

          const validQuestions = result.questions || [];
          addLog(`✨ Pull batch #${batches}: ${validQuestions.length} questions fetched.`);

          // Client-side dedup
          const newQuestions = validQuestions.filter((q: any) => {
            const qFp = fp(q);
            if (existingFPs.has(qFp)) {
              return false;
            }
            existingFPs.add(qFp);
            return true;
          });

          if (newQuestions.length === 0) {
            addLog(`⏭️ Batch #${batches}: All questions were duplicates. Skipping upload.`);
            totalSkipped += validQuestions.length;
          } else {
            addLog(`🧹 Client-side dedup: ${validQuestions.length - newQuestions.length} duplicates removed, ${newQuestions.length} unique questions ready for upload.`);

            const dbRows = newQuestions.map((q: any) => {
              const row: any = {
                subject: q.subject || selectedSubject,
                topic: q.topic || selectedChapter,
                question_text_en: q.question_text_en,
                question_text_te: q.question_text_te,
                options_en: q.options_en,
                options_te: q.options_te,
                correct_option: typeof q.correct_option === 'number' ? q.correct_option : 0,
                explanation_en: q.explanation_en || '',
                explanation_te: q.explanation_te || '',
                is_previous_year: q.is_previous_year ?? false,
                stream: q.stream || (selectedSubject === 'Biology' ? 'Agriculture' : 'Engineering'),
                difficulty: q.difficulty || 'Medium'
              };
              if (q.state) row.state = q.state;
              if (q.year) row.year = q.year;
              if (q.shift) row.shift = q.shift;
              if (q.image_url) row.image_url = q.image_url;
              // Always set (PostgREST requires uniform keys across a batch insert)
              row.diagram_json = q.diagram_json || q.diagram || null;
              return row;
            });

            const { data, error } = await supabase.from('questions').insert(dbRows).select('question_id');
            if (error) throw error;

            const insertedCount = data?.length ?? dbRows.length;
            totalInserted += insertedCount;
            addLog(`🚀 Batch #${batches}: ${insertedCount} unique questions inserted into Supabase!`);
          }

          setAutoPipelineStats({ batches, inserted: totalInserted, skipped: totalSkipped });

          const currentChapterCount = counts[selectedSubject]?.topics[selectedChapter] || 0;
          addLog(`📊 Current chapter "${selectedChapter}": ${currentChapterCount} questions in Cloud DB`);

          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (batchErr: any) {
          addLog(`❌ Batch #${batches} failed: ${batchErr.message}. Stopping pipeline.`);
          setErrorMessage(`Pull Auto-Pipeline stopped due to error: ${batchErr.message}`);
          break;
        }
      }

      if (autoPipelineRef.current) {
        addLog(`🎉 Pull Auto-Pipeline completed: ${batches} batches, ${totalInserted} questions inserted, ${totalSkipped} duplicates skipped.`);
        setUploadSuccessMsg(`🎉 Pull Auto-Pipeline completed: ${totalInserted} questions inserted across ${batches} batches!`);
      } else {
        addLog(`⏹️ Pull Auto-Pipeline stopped by user after ${batches} batches.`);
      }

      fetchDatabaseCounts();

    } catch (err: any) {
      console.error(err);
      addLog(`❌ Pull Auto-Pipeline error: ${err.message}`);
      setErrorMessage(err.message);
    } finally {
      setIsAutoPipeline(false);
      autoPipelineRef.current = false;
    }
  };

  const currentSubjectConfig = EAMCET_BLUEPRINT.subjects[selectedSubject];
  const currentSubjectCount = counts[selectedSubject]?.total || 0;

  const totalAllSubjectsInDb = (counts.Mathematics?.total || 0) + (counts.Physics?.total || 0) + (counts.Chemistry?.total || 0) + (counts.Biology?.total || 0) + (counts.Zoology?.total || 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & High-Level Summary Stats */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-6 rounded-3xl border border-indigo-800/40 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-2.5 mb-2">
              <span className="px-3 py-1 text-xs font-black tracking-wider uppercase rounded-full bg-blue-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 shadow-xs">
                <Zap className="w-3.5 h-3.5 fill-cyan-400" />
                Bulk Question Entry
              </span>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Zero Duplicates & Max 2 Models Guard
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Bulk Question Entry - API & Python Generation
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Bulk question entry via API or Python. Generate questions and upload them to the Supabase Cloud Database.
            </p>
          </div>

          {/* Overall Metrics Card - Live Totals */}
          <div className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/15 min-w-[260px] shrink-0 shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold mb-1">
              <span>Cloud Database Questions</span>
              <span className="text-emerald-300 font-bold flex items-center gap-1.5 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Live DB
              </span>
            </div>
            <div className="text-3xl font-black tracking-tight text-white mt-1">
              {totalAllSubjectsInDb.toLocaleString()} <span className="text-sm font-semibold text-slate-300">Questions</span>
            </div>
            <p className="text-xs text-slate-300/80 mt-1">
              Total questions across all 5 subjects in Cloud DB
            </p>
          </div>
        </div>

        {/* 5 Subjects Quick Status Grid - Live Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/10">
          {/* Math Card */}
          <button
            onClick={() => setSelectedSubject('Mathematics')}
            className={`text-left p-3.5 rounded-xl border transition-all ${
              selectedSubject === 'Mathematics'
                ? 'bg-blue-600/30 border-cyan-400 ring-2 ring-cyan-400/30 shadow-lg'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calculator className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-sm text-white">Mathematics</span>
              </div>
              <span className="text-[11px] font-bold text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded-full border border-cyan-500/30">
                Live
              </span>
            </div>
            <div className="mt-2 text-xl font-black text-slate-100">
              {(counts.Mathematics?.total || 0).toLocaleString()} <span className="text-xs text-slate-300 font-normal">Qs</span>
            </div>
          </button>

          {/* Physics Card */}
          <button
            onClick={() => setSelectedSubject('Physics')}
            className={`text-left p-3.5 rounded-xl border transition-all ${
              selectedSubject === 'Physics'
                ? 'bg-purple-600/30 border-purple-400 ring-2 ring-purple-400/30 shadow-lg'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Atom className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-sm text-white">Physics</span>
              </div>
              <span className="text-[11px] font-bold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-500/30">
                Live
              </span>
            </div>
            <div className="mt-2 text-xl font-black text-slate-100">
              {(counts.Physics?.total || 0).toLocaleString()} <span className="text-xs text-slate-300 font-normal">Qs</span>
            </div>
          </button>

          {/* Chemistry Card */}
          <button
            onClick={() => setSelectedSubject('Chemistry')}
            className={`text-left p-3.5 rounded-xl border transition-all ${
              selectedSubject === 'Chemistry'
                ? 'bg-emerald-600/30 border-emerald-400 ring-2 ring-emerald-400/30 shadow-lg'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FlaskConical className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-white">Chemistry</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Live
              </span>
            </div>
            <div className="mt-2 text-xl font-black text-slate-100">
              {(counts.Chemistry?.total || 0).toLocaleString()} <span className="text-xs text-slate-300 font-normal">Qs</span>
            </div>
          </button>

          {/* Biology Card */}
          <button
            onClick={() => setSelectedSubject('Biology')}
            className={`text-left p-3.5 rounded-xl border transition-all ${
              selectedSubject === 'Biology'
                ? 'bg-green-600/30 border-green-400 ring-2 ring-green-400/30 shadow-lg'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Leaf className="w-4 h-4 text-green-400" />
                <span className="font-bold text-sm text-white">Biology</span>
              </div>
              <span className="text-[11px] font-bold text-green-300 bg-green-500/20 px-2 py-0.5 rounded-full border border-green-500/30">
                Live
              </span>
            </div>
            <div className="mt-2 text-xl font-black text-slate-100">
              {(counts.Biology?.total || 0).toLocaleString()} <span className="text-xs text-slate-300 font-normal">Qs</span>
            </div>
          </button>

          {/* Zoology Card */}
          <button
            onClick={() => setSelectedSubject('Zoology')}
            className={`text-left p-3.5 rounded-xl border transition-all ${
              selectedSubject === 'Zoology'
                ? 'bg-amber-600/30 border-amber-400 ring-2 ring-amber-400/30 shadow-lg'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mountain className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-sm text-white">Zoology</span>
              </div>
              <span className="text-[11px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                Live
              </span>
            </div>
            <div className="mt-2 text-xl font-black text-slate-100">
              {(counts.Zoology?.total || 0).toLocaleString()} <span className="text-xs text-slate-300 font-normal">Qs</span>
            </div>
          </button>
        </div>
      </div>

      {/* Method Selection */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>🔧 Generation Method Selection</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a method below to generate questions
            </p>
          </div>
        </div>

        {/* Method Info Cards - Clickable */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div 
            onClick={() => setSelectedMethod('api')}
            className={`p-4 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] ${
              selectedMethod === 'api'
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 ring-2 ring-blue-400/30'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">🤖</span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Smart AI Generator</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Generate questions using Gemini AI and upload directly to the database. Uses cloud-based AI models.
            </p>
          </div>

          <div
            onClick={() => setSelectedMethod('python')}
            className={`p-4 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] ${
              selectedMethod === 'python'
                ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 ring-2 ring-purple-400/30'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700'
            }`}
          >
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">🐍</span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Local Script Generator</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Generate questions using local Python scripts and upload to the database. Template-based generation.
            </p>
          </div>

          <div
            onClick={() => setSelectedMethod('pull')}
            className={`p-4 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] ${
              selectedMethod === 'pull'
                ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 ring-2 ring-green-400/30'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-700'
            }`}
          >
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">🌐</span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Auto Data Puller</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Pull data from GitHub repos, Public APIs and Websites, then auto-insert into the database.
            </p>
          </div>
        </div>
      </div>

      {/* Pull Config UI - Shows only when pull method is selected */}
      {selectedMethod === 'pull' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🌐 Data Source Configuration</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select URL and type to pull data from GitHub repos, Public APIs or Websites
              </p>
            </div>
          </div>

          <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Source Type
                </label>
                <select
                  value={pullSourceType}
                  onChange={(e) => setPullSourceType(e.target.value as 'github' | 'api' | 'website')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="github">GitHub Raw JSON/CSV</option>
                  <option value="api">Public HTTP API (GET)</option>
                  <option value="website">Website Scrape</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Source URL
                </label>
                <input
                  value={pullSourceUrl}
                  onChange={(e) => setPullSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
                {pullError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{pullError}</p>
                )}
              </div>
            </div>

            {/* Source-level filters (subject / min grade) for large datasets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Filter by Subject <span className="text-slate-400">(optional)</span>
                </label>
                <select
                  value={pullFilterSubject}
                  onChange={(e) => setPullFilterSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">Any subject</option>
                  <option value="physics">Physics</option>
                  <option value="chemistry">Chemistry</option>
                  <option value="biology">Biology</option>
                  <option value="math">Mathematics</option>
                  <option value="natural science">Natural Science</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Min Grade <span className="text-slate-400">(optional)</span>
                </label>
                <select
                  value={pullMinGrade}
                  onChange={(e) => setPullMinGrade(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">Any grade</option>
                  <option value="grade8">Grade 8+</option>
                  <option value="grade9">Grade 9+ (high school)</option>
                  <option value="grade10">Grade 10+</option>
                  <option value="grade11">Grade 11+</option>
                  <option value="grade12">Grade 12</option>
                </select>
              </div>
            </div>
            {recentSources.length > 0 && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Recent Sources
                </label>
                <select
                  onChange={(e) => {
                    const selected = recentSources.find(s => s.url === e.target.value);
                    if (selected) {
                      setPullSourceUrl(selected.url);
                      setPullSourceType(selected.type as 'github' | 'api' | 'website');
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">Select recent source...</option>
                  {recentSources.map((source, idx) => (
                    <option key={idx} value={source.url}>
                      {source.type}: {source.url}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* AI Source Suggestions — click to fill URL + type */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  💡 Suggested Sources (AI)
                </label>
                <button
                  onClick={() => {
                    setSourceSuggestionsLoading(true);
                    setSourceSuggestionsError(null);
                    fetch('/api/ai/source-suggest', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ subject: selectedSubject, chapter: selectedChapter, customApiKey }),
                    })
                      .then(r => r.json())
                      .then(data => {
                        if (data?.success && Array.isArray(data.suggestions)) {
                          setSourceSuggestions(data.suggestions);
                          addLog(`💡 Source suggestions refreshed (${data.provider}).`);
                        } else {
                          setSourceSuggestionsError(data?.error || 'No suggestions available.');
                        }
                      })
                      .catch(() => setSourceSuggestionsError('Failed to load source suggestions.'))
                      .finally(() => setSourceSuggestionsLoading(false));
                  }}
                  disabled={sourceSuggestionsLoading}
                  className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {sourceSuggestionsLoading ? 'Loading…' : '↻ Refresh'}
                </button>
              </div>
              {sourceSuggestionsError && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{sourceSuggestionsError}</p>
              )}
              {sourceSuggestionsLoading && sourceSuggestions.length === 0 && (
                <p className="text-xs text-slate-500">Fetching suggestions…</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sourceSuggestions.map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setPullSourceUrl(sug.url);
                      const t = sug.type === 'raw_json' || sug.type === 'raw_csv' || sug.type === 'github_repo'
                        ? 'github'
                        : (sug.type as 'github' | 'api' | 'website');
                      setPullSourceType(t);
                      addLog(`🔗 Source selected: ${sug.title}`);
                    }}
                    className="text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{sug.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 shrink-0">
                        {sug.source === 'ai' ? 'AI' : 'catalog'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{sug.description}</p>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 truncate">{sug.url}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Control Panel & Interactive Buttons */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>🎛️ {selectedSubject} Control Actions</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                Total: {counts[selectedSubject]?.total?.toLocaleString() || 0}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Use the buttons below to audit the database, test 5 questions, or upload to the live cloud.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 transition"
              title="Override default Gemini API Key if free quota limit is reached"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{customApiKey ? 'Custom Key Active' : 'API Key'}</span>
            </button>

            <button
              onClick={fetchDatabaseCounts}
              disabled={loadingCounts}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCounts ? 'animate-spin' : ''}`} />
              <span>Refresh Live DB Counts</span>
            </button>
          </div>
        </div>

        {/* Custom API Key Input Box when toggled */}
        {showKeyInput && (
          <div className="mt-3 p-4 bg-amber-50/90 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-2">
              <div className="flex items-center space-x-2 text-amber-900 dark:text-amber-200">
                <Key className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-extrabold">Google Gemini API Key Management:</span>
              </div>

              {/* Direct button to open Google AI Studio Key Page */}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition hover:scale-[1.02] active:scale-[0.98]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Get Free API Key ↗</span>
              </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                value={customApiKey}
                onChange={(e) => handleSaveCustomKey(e.target.value)}
                placeholder="Paste your Google AI Studio API key (AQ.Ab8... or AIzaSy...)"
                className="flex-1 p-2.5 text-xs font-mono rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-400 outline-hidden"
              />
              {customApiKey ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800">
                    {customApiKey.startsWith('ya29.') ? 'OAuth Token Active ✅' : 'API Key Active ✅'}
                  </span>
                  <button
                    onClick={() => handleSaveCustomKey('')}
                    className="px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200"
                    title="Clear custom key and revert to default"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-slate-500 shrink-0">
                  (Using .env default key)
                </span>
              )}
            </div>

            {/* Informational tip for the user */}
            <div className="p-2.5 bg-blue-50/80 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-[11px] text-blue-900 dark:text-blue-200 flex items-center justify-between gap-2">
              <span>
                💡 <strong>Google AI Studio Key Support:</strong> Both new <strong>AQ.Ab8...</strong> (Auth Key) and <strong>AIzaSy...</strong> formats are fully supported.
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-200/60 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 shrink-0">
                Auto Bearer + Header Auth
              </span>
            </div>
          </div>
        )}

        {/* Controls Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-4">
          {/* Chapter Selector */}
          <div className="md:col-span-3">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
              Select Chapter:
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(e.target.value)}
              className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              {currentSubjectConfig.chapters.map(ch => (
                <option key={ch.topic} value={ch.topic}>
                  {ch.topic} ({ch.weightagePercent}%)
                </option>
              ))}
            </select>
          </div>

          {/* Batch Size Selector */}
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
              Batch Size:
            </label>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              <option value={5}>5 Qs (Fast)</option>
              <option value={10}>10 Qs (Standard)</option>
              <option value={20}>20 Qs (Turbo)</option>
              <option value={100}>100 Qs (Max)</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="md:col-span-7 flex items-end gap-2 flex-wrap">
            {/* Run Audit */}
            <button
              onClick={handleRunAudit}
              disabled={isAuditing || isGenerating || isAutoPipeline}
              className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-xs whitespace-nowrap"
            >
              {isAuditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Audit Duplicates</span>
            </button>

            {/* API-specific buttons */}
            {selectedMethod === 'api' && (
              <>
                {/* API Generation (Dry-Run) */}
                <button
                  onClick={() => handleGenerate('dry-run')}
                  disabled={isGenerating || isAuditing || isAutoPipeline}
                  className="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-xs whitespace-nowrap"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  <span>API Test ({batchSize} Qs)</span>
                </button>

                {/* API Upload to Cloud — single batch */}
                <button
                  onClick={() => handleGenerate('insert')}
                  disabled={isGenerating || isAuditing || isAutoPipeline}
                  className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-extrabold flex items-center justify-center space-x-1.5 transition shadow-md hover:shadow-lg disabled:opacity-60 whitespace-nowrap"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-white" />}
                  <span>API Upload ({batchSize} Qs)</span>
                </button>

                {/* Auto-Pipeline — continuous dedup loop */}
                <button
                  onClick={handleAutoPipeline}
                  disabled={isGenerating || isAuditing}
                  className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1.5 transition shadow-md hover:shadow-lg whitespace-nowrap ${
                    isAutoPipeline
                      ? 'bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-700 hover:to-orange-600 text-white animate-pulse'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'
                  }`}
                  title={isAutoPipeline ? 'Click to stop the running Auto-Pipeline' : 'Start continuous auto-generation with built-in duplicate prevention'}
                >
                  {isAutoPipeline ? (
                    <><Pause className="w-4 h-4" /><span>Stop Pipeline</span></>
                  ) : (
                    <><Flame className="w-4 h-4" /><span>Auto-Pipeline 🔥</span></>
                  )}
                </button>
              </>
            )}

            {/* Python-specific buttons */}
            {selectedMethod === 'python' && (
              <>
                {/* Python Batch Generation */}
                <button
                  onClick={handlePythonBatchGeneration}
                  disabled={isGenerating || isAuditing || isAutoPipeline}
                  className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-xs whitespace-nowrap"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                  <span>Python Test ({batchSize} Qs)</span>
                </button>

                {/* Python Upload to Cloud — single batch */}
                <button
                  onClick={handlePythonUpload}
                  disabled={isGenerating || isAuditing || isAutoPipeline}
                  className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs font-extrabold flex items-center justify-center space-x-1.5 transition shadow-md hover:shadow-lg disabled:opacity-60 whitespace-nowrap"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4 fill-white" />}
                  <span>Python Upload ({batchSize} Qs)</span>
                </button>

                {/* Python Auto-Pipeline — continuous dedup loop */}
                <button
                  onClick={handlePythonAutoPipeline}
                  disabled={isGenerating || isAuditing}
                  className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1.5 transition shadow-md hover:shadow-lg whitespace-nowrap ${
                    isAutoPipeline
                      ? 'bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-700 hover:to-orange-600 text-white animate-pulse'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'
                  }`}
                  title={isAutoPipeline ? 'Click to stop the running Python Auto-Pipeline' : 'Start continuous Python auto-generation with built-in duplicate prevention'}
                >
                  {isAutoPipeline ? (
                    <><Pause className="w-4 h-4" /><span>Stop Pipeline</span></>
                  ) : (
                    <><Flame className="w-4 h-4" /><span>Auto-Pipeline 🔥</span></>
                  )}
                </button>
              </>
            )}

            {/* Pull-specific buttons */}
            {selectedMethod === 'pull' && (
              <>
                {/* Pull Test - Dry-run */}
                <button
                  onClick={handlePullTest}
                  disabled={isPulling || isAuditing || isAutoPipeline}
                  className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 hover:bg-green-100 dark:bg-green-950/40 dark:hover:bg-green-900/60 text-green-700 dark:text-green-300 text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-xs whitespace-nowrap"
                >
                  {isPulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  <span>Test Pull ({batchSize} Qs)</span>
                </button>

                {/* Pull & Upload - Single batch */}
                <button
                  onClick={handlePullUpload}
                  disabled={isPulling || isAuditing || isAutoPipeline}
                  className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-xs font-extrabold flex items-center justify-center space-x-1.5 transition shadow-md hover:shadow-lg disabled:opacity-60 whitespace-nowrap"
                >
                  {isPulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 fill-white" />}
                  <span>Pull & Upload ({batchSize} Qs)</span>
                </button>

                {/* Pull Auto-Pipeline - Continuous loop */}
                <button
                  onClick={handlePullAutoPipeline}
                  disabled={isPulling || isAuditing}
                  className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1.5 transition shadow-md hover:shadow-lg whitespace-nowrap ${
                    isAutoPipeline
                      ? 'bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-700 hover:to-orange-600 text-white animate-pulse'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'
                  }`}
                  title={isAutoPipeline ? 'Click to stop the running Pull Auto-Pipeline' : 'Start continuous auto-pull with built-in duplicate prevention'}
                >
                  {isAutoPipeline ? (
                    <><Pause className="w-4 h-4" /><span>Stop Pipeline</span></>
                  ) : (
                    <><Flame className="w-4 h-4" /><span>Auto-Pull Pipeline 🔥</span></>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Auto-Pipeline live stats banner */}
          {(isAutoPipeline || autoPipelineStats) && (
            <div className={`md:col-span-6 mt-1 p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
              isAutoPipeline
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}>
              <div className="flex items-center gap-2">
                {isAutoPipeline ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
                <span className="font-bold">{isAutoPipeline ? '🔥 Auto-Pipeline Running...' : '✅ Auto-Pipeline Finished'}</span>
              </div>
              {autoPipelineStats && (
                <div className="flex items-center gap-4 font-semibold">
                  <span>Batches: <strong className="text-blue-600 dark:text-blue-400">{autoPipelineStats.batches}</strong></span>
                  <span>Inserted: <strong className="text-emerald-600 dark:text-emerald-400">{autoPipelineStats.inserted}</strong></span>
                  <span>Dups Skipped: <strong className="text-amber-600 dark:text-amber-400">{autoPipelineStats.skipped}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Audit Result Banner with 1-Click Clean Duplicate Action */}
        {auditResult && (
          <div className={`mt-4 p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all ${
            auditResult.clean 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' 
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          }`}>
            <div className="flex items-center space-x-3 text-xs">
              {auditResult.clean ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <div>
                <div className="leading-snug">
                  <strong>{auditResult.subject} Database Audit:</strong> Total Rows in DB: <strong>{auditResult.total}</strong> | Unique: <strong>{auditResult.unique}</strong> | Duplicates: <strong>{auditResult.duplicates}</strong>
                </div>
                {!auditResult.clean && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium mt-0.5">
                    Found {auditResult.duplicates} duplicate copies in the database. Click &quot;Delete Duplicates&quot; below to safely remove extras while keeping 1 original copy of each.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <span className={`text-[11px] font-black uppercase px-2.5 py-1 rounded border ${
                auditResult.clean
                  ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
              }`}>
                {auditResult.clean ? '✅ 100% Clean' : '⚠️ Duplicates Found'}
              </span>

              {!auditResult.clean && (
                <button
                  onClick={handleDeleteDuplicates}
                  disabled={isDeletingDuplicates || isAuditing}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm hover:shadow-md transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  title="Remove redundant duplicate rows from Supabase"
                >
                  {isDeletingDuplicates ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isDeletingDuplicates 
                      ? 'Deleting...' 
                      : `🗑️ Delete ${auditResult.duplicates} Duplicates`}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Success / Error Messages */}
        {uploadSuccessMsg && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{uploadSuccessMsg}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Chapter-wise Breakdown Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {selectedSubject} Syllabus & Chapter-Wise Breakdown
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {currentSubjectConfig.chapters.length} Chapters Blueprint
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Chapter / Topic</th>
                <th className="py-3 px-3 text-center">Weightage</th>
                <th className="py-3 px-3 text-center">Questions in DB</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-3 text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentSubjectConfig.chapters.map((chapter) => {
                const currentInDb = counts[selectedSubject]?.topics[chapter.topic] || 0;

                return (
                  <tr key={chapter.topic} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {chapter.topic}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-600 dark:text-slate-400">
                      {chapter.weightagePercent}%
                    </td>
                    <td className="py-3 px-3 text-center font-black text-sm text-emerald-600 dark:text-emerald-400">
                      {currentInDb.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {currentInDb > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active ({currentInDb} Qs)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          0 Qs
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedChapter(chapter.topic);
                          handleGenerate('insert', 10);
                        }}
                        disabled={isGenerating}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950 text-slate-700 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300 font-bold text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-2xs"
                      >
                        +10 Qs
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generated Questions Preview Section (Shown after Test Run or Generation) */}
      {previewQuestions.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                Generated Questions Preview ({previewQuestions.length} Questions)
              </h3>
            </div>
            <button
              onClick={() => setPreviewQuestions([])}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Clear Preview
            </button>
          </div>

          <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
            {previewQuestions.map((q, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    Question #{idx + 1} • {q.topic}
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    Model: {q.model_id} | Difficulty: {q.difficulty}
                  </span>
                </div>

                {/* Question English & Telugu */}
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    <span className="text-xs text-blue-600 font-bold mr-1.5">[EN]</span>
                    <MathRenderer content={q.question_text_en} />
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    <span className="text-xs text-emerald-600 font-bold mr-1.5">[TE]</span>
                    <MathRenderer content={q.question_text_te} />
                  </div>
                </div>

                {/* 4 Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options_en.map((opt: string, optIdx: number) => {
                    const isCorrect = optIdx === q.correct_option;
                    return (
                      <div 
                        key={optIdx} 
                        className={`p-2.5 rounded-lg border text-xs font-medium ${
                          isCorrect 
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-bold' 
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>({optIdx + 1}) <MathRenderer content={opt} /></span>
                          {isCorrect && <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 ml-2">✔ CORRECT</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          [TE] <MathRenderer content={q.options_te[optIdx]} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-100 dark:border-blue-900/40 text-xs text-slate-700 dark:text-slate-300">
                  <div className="font-bold text-blue-800 dark:text-blue-300 mb-0.5">Solution Explanation:</div>
                  <div><MathRenderer content={q.explanation_en} /></div>
                  <div className="mt-1 text-slate-600 dark:text-slate-400 font-normal"><MathRenderer content={q.explanation_te} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Activity Console */}
      <div className="bg-slate-950 text-slate-200 rounded-2xl border border-slate-800 p-4 font-mono text-xs shadow-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 text-slate-400">
          <div className="flex items-center space-x-2">
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold uppercase tracking-wider text-[11px] text-slate-300">Live Pipeline Console</span>
          </div>
          <button onClick={() => setActivityLogs([])} className="hover:text-white transition">Clear Logs</button>
        </div>
        <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] leading-relaxed">
          {activityLogs.length === 0 ? (
            <div className="text-slate-600">Console idle. Ready to execute pipeline tasks.</div>
          ) : (
            activityLogs.map((log, idx) => (
              <div key={idx} className="text-slate-300">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
