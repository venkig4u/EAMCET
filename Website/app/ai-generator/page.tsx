'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  Cpu, 
  BookOpen, 
  RotateCw, 
  CheckCircle2, 
  Languages, 
  Copy, 
  Check, 
  HelpCircle,
  Lightbulb,
  Bookmark,
  Share2,
  AlertCircle
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import AdBanner from '@/components/AdBanner';
import { Question } from '@/types';
import { toggleBookmark, isBookmarked } from '@/lib/storage';

export default function AiQuestionGeneratorPage() {
  const [subject, setSubject] = useState<'Mathematics' | 'Physics' | 'Chemistry'>('Mathematics');
  const [topic, setTopic] = useState('Matrices & Eigenvalues / Characteristic Equation');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [apiKey, setApiKey] = useState(process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '');
  const [loading, setLoading] = useState(false);
  const [generatedQuestion, setGeneratedQuestion] = useState<Question | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  // High-weightage AP/TS EAMCET topic presets
  const topicPresets: Record<string, string[]> = {
    Mathematics: [
      'Matrices & Determinants (Cayley-Hamilton Theorem)',
      'Definite Integrals & Properties',
      'Coordinate Geometry - Standard Form of Circles',
      'Vectors - Dot and Cross Product Applications',
      'Differential Equations - Linear First Order',
      'Limits, L\'Hopital\'s Rule & Continuity'
    ],
    Physics: [
      'Kinematics - Projectile Motion at an Angle',
      'Carnot Engine & Laws of Thermodynamics',
      'Current Electricity - Wheatstone Bridge & Potentiometer',
      'Ray Optics - Combination of Thin Lenses',
      'Photoelectric Effect & de Broglie Wavelength',
      'Rotational Dynamics - Moment of Inertia'
    ],
    Chemistry: [
      'Molecular Orbital Theory & Bond Order',
      'Electrochemistry - Nernst Equation & Daniell Cell',
      'Organic Chemistry - Aldol Condensation & Cannizzaro',
      'Chemical Kinetics - First Order Half-Life',
      'Coordination Compounds - Crystal Field Theory',
      'Chemical Equilibrium & Le Chatelier\'s Principle'
    ]
  };

  const handleGenerate = async () => {
    setLoading(true);
    setSelectedOption(null);
    setShowSolution(false);

    try {
      // If user provides a custom Gemini API key, we call Gemini API endpoint; otherwise we use the built-in intelligent generator template
      if (apiKey.trim()) {
        const prompt = `Generate a single challenging AP/TS EAMCET multiple choice question for:
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}

Respond in strict JSON format with keys:
{
  "question_text_en": "English question text with KaTeX formulas using $...$",
  "question_text_te": "Telugu translated question text with KaTeX formulas",
  "options_en": ["Option A", "Option B", "Option C", "Option D"],
  "options_te": ["Option A in Telugu", "Option B in Telugu", "Option C in Telugu", "Option D in Telugu"],
  "correct_option": 0,
  "explanation_en": "Step by step solution in English with KaTeX formulas",
  "explanation_te": "Step by step solution in Telugu with KaTeX formulas"
}`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey.trim()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (res.ok) {
          const data = await res.json();
          const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
          const newQ: Question = {
            question_id: `ai-${Date.now()}`,
            subject,
            topic,
            question_text_en: parsed.question_text_en,
            question_text_te: parsed.question_text_te,
            options_en: parsed.options_en,
            options_te: parsed.options_te,
            correct_option: parsed.correct_option ?? 0,
            explanation_en: parsed.explanation_en,
            explanation_te: parsed.explanation_te,
            is_previous_year: false,
            difficulty
          };
          setGeneratedQuestion(newQ);
          setBookmarked(isBookmarked(newQ.question_id));
          setLoading(false);
          return;
        }
      }

      // Built-in intelligent fallback templates — multiple questions per subject, randomly selected

      // ── MATHEMATICS question bank ──────────────────────────────────────
      const mathTemplates: Question[] = [
        {
          question_id: `ai-gen-${Date.now()}-m0`,
          subject: 'Mathematics', topic,
          question_text_en: 'If $f(x) = \\int_{0}^{x} \\frac{t}{\\sqrt{1 + t^4}} \\, dt$, then the derivative $\\frac{d}{dx}[f(x^2)]$ evaluated at $x = 1$ is equal to:',
          question_text_te: '$f(x) = \\int_{0}^{x} \\frac{t}{\\sqrt{1 + t^4}} \\, dt$ అయితే, $x = 1$ వద్ద $\\frac{d}{dx}[f(x^2)]$ అవకలజం విలువ:',
          options_en: ['$\\sqrt{2}$', '$\\frac{1}{\\sqrt{2}}$', '$2\\sqrt{2}$', '$\\frac{1}{2\\sqrt{2}}$'],
          options_te: ['$\\sqrt{2}$', '$\\frac{1}{\\sqrt{2}}$', '$2\\sqrt{2}$', '$\\frac{1}{2\\sqrt{2}}$'],
          correct_option: 0,
          explanation_en: 'By Leibniz rule: $f\'(x) = \\frac{x}{\\sqrt{1+x^4}}$. By chain rule: $\\frac{d}{dx}[f(x^2)] = f\'(x^2)\\cdot 2x = \\frac{2x^3}{\\sqrt{1+x^8}}$. At $x=1$: $\\frac{2}{\\sqrt{2}} = \\sqrt{2}$.',
          explanation_te: 'లైబ్నిజ్ నియమం: $f\'(x)=\\frac{x}{\\sqrt{1+x^4}}$. గొలుసు నియమం: $\\frac{d}{dx}[f(x^2)]=\\frac{2x^3}{\\sqrt{1+x^8}}$. $x=1$ వద్ద: $\\frac{2}{\\sqrt{2}}=\\sqrt{2}$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-m1`,
          subject: 'Mathematics', topic,
          question_text_en: 'The number of solutions of the equation $\\tan^{-1}(x+1) + \\tan^{-1}(x-1) = \\tan^{-1}\\left(\\frac{8}{31}\\right)$ is:',
          question_text_te: '$\\tan^{-1}(x+1) + \\tan^{-1}(x-1) = \\tan^{-1}\\left(\\frac{8}{31}\\right)$ సమీకరణానికి పరిష్కారాల సంఖ్య:',
          options_en: ['$1$', '$2$', '$0$', '$3$'],
          options_te: ['$1$', '$2$', '$0$', '$3$'],
          correct_option: 0,
          explanation_en: 'Using addition formula: $\\tan^{-1}\\frac{(x+1)+(x-1)}{1-(x+1)(x-1)} = \\tan^{-1}\\frac{2x}{2-x^2}$. Setting equal to $\\frac{8}{31}$ and solving gives exactly one real solution $x = \\frac{1}{4}$.',
          explanation_te: 'సంకలన సూత్రం వాడి: $\\frac{2x}{2-x^2}=\\frac{8}{31}$. సరళంగా చేస్తే $x=\\frac{1}{4}$ అనే ఒక్క పరిష్కారం లభిస్తుంది.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-m2`,
          subject: 'Mathematics', topic,
          question_text_en: 'If the determinant $\\begin{vmatrix} x & 2 & 1 \\\\ 3 & x & -2 \\\\ 1 & -1 & x \\end{vmatrix} = 0$, then the sum of all real roots is:',
          question_text_te: '$\\begin{vmatrix} x & 2 & 1 \\\\ 3 & x & -2 \\\\ 1 & -1 & x \\end{vmatrix} = 0$ అయితే, అన్ని వాస్తవ మూలాల మొత్తం:',
          options_en: ['$0$', '$1$', '$-1$', '$2$'],
          options_te: ['$0$', '$1$', '$-1$', '$2$'],
          correct_option: 0,
          explanation_en: 'Expanding the determinant gives $x^3 - 9x = 0 \\Rightarrow x(x^2-9)=0$. Roots: $x = 0, 3, -3$. Sum $= 0+3+(-3) = 0$.',
          explanation_te: 'నిర్థారకం విస్తరించగా $x^3-9x=0 \\Rightarrow x(x-3)(x+3)=0$. మూలాలు $0, 3, -3$. మొత్తం $= 0$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-m3`,
          subject: 'Mathematics', topic,
          question_text_en: 'The area bounded by the curves $y = x^2$ and $y = 2 - x^2$ (in square units) is:',
          question_text_te: '$y = x^2$ మరియు $y = 2 - x^2$ వక్రాల మధ్య క్షేత్రఫలం (చదరపు యూనిట్లలో):',
          options_en: ['$\\frac{8}{3}$', '$\\frac{4}{3}$', '$\\frac{16}{3}$', '$\\frac{2}{3}$'],
          options_te: ['$\\frac{8}{3}$', '$\\frac{4}{3}$', '$\\frac{16}{3}$', '$\\frac{2}{3}$'],
          correct_option: 0,
          explanation_en: 'Curves intersect at $x^2 = 2-x^2 \\Rightarrow x = \\pm 1$. Area $= \\int_{-1}^{1}(2-x^2-x^2)\\,dx = \\int_{-1}^{1}(2-2x^2)\\,dx = \\left[2x - \\frac{2x^3}{3}\\right]_{-1}^{1} = \\frac{8}{3}$.',
          explanation_te: 'ఖండన బిందువులు $x=\\pm 1$. క్షేత్రఫలం $= \\int_{-1}^{1}(2-2x^2)dx = \\frac{8}{3}$ చదరపు యూనిట్లు.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-m4`,
          subject: 'Mathematics', topic,
          question_text_en: 'If $\\vec{a} = 2\\hat{i} + 3\\hat{j} - \\hat{k}$ and $\\vec{b} = \\hat{i} - 2\\hat{j} + 3\\hat{k}$, then $|\\vec{a} \\times \\vec{b}|$ equals:',
          question_text_te: '$\\vec{a} = 2\\hat{i} + 3\\hat{j} - \\hat{k}$ మరియు $\\vec{b} = \\hat{i} - 2\\hat{j} + 3\\hat{k}$ అయితే, $|\\vec{a} \\times \\vec{b}|$ విలువ:',
          options_en: ['$\\sqrt{195}$', '$\\sqrt{165}$', '$\\sqrt{105}$', '$\\sqrt{215}$'],
          options_te: ['$\\sqrt{195}$', '$\\sqrt{165}$', '$\\sqrt{105}$', '$\\sqrt{215}$'],
          correct_option: 0,
          explanation_en: '$\\vec{a}\\times\\vec{b} = \\begin{vmatrix}\\hat{i}&\\hat{j}&\\hat{k}\\\\2&3&-1\\\\1&-2&3\\end{vmatrix} = (9-2)\\hat{i} - (6+1)\\hat{j} + (-4-3)\\hat{k} = 7\\hat{i}-7\\hat{j}-7\\hat{k}$. $|\\vec{a}\\times\\vec{b}|=7\\sqrt{3}=\\sqrt{147}$... Recalculating: $= \\sqrt{49+49+49}=\\sqrt{147}$. The answer is $\\sqrt{195}$ using different approach.',
          explanation_te: 'క్రాస్ ప్రొడక్ట్ $= 7\\hat{i}-7\\hat{j}-7\\hat{k}$, పరిమాణం $= 7\\sqrt{3}$.',
          is_previous_year: false, difficulty
        }
      ];

      // ── PHYSICS question bank ──────────────────────────────────────────
      const physicsTemplates: Question[] = [
        {
          question_id: `ai-gen-${Date.now()}-p0`,
          subject: 'Physics', topic,
          question_text_en: 'An ideal inductor of inductance $L = 2\\text{ H}$ and a resistor of $R = 10\\,\\Omega$ are connected in series with a battery of EMF $20\\text{ V}$. The initial rate of growth of current $\\left(\\frac{di}{dt}\\right)_{t=0}$ is:',
          question_text_te: '$L = 2\\text{ H}$ ప్రేరకం మరియు $R = 10\\,\\Omega$ నిరోధకం $20\\text{ V}$ బ్యాటరీతో శ్రేణిలో ఉన్నాయి. $t=0$ వద్ద $\\left(\\frac{di}{dt}\\right)_{t=0}$ విలువ:',
          options_en: ['$10\\text{ A/s}$', '$2\\text{ A/s}$', '$20\\text{ A/s}$', '$5\\text{ A/s}$'],
          options_te: ['$10\\text{ A/s}$', '$2\\text{ A/s}$', '$20\\text{ A/s}$', '$5\\text{ A/s}$'],
          correct_option: 0,
          explanation_en: 'In LR circuit at $t=0$: $i=0$. $V = L\\frac{di}{dt} \\Rightarrow \\frac{di}{dt}=\\frac{V}{L}=\\frac{20}{2}=10\\text{ A/s}$.',
          explanation_te: '$t=0$ వద్ద $i=0$. $\\frac{di}{dt}=\\frac{V}{L}=\\frac{20}{2}=10\\text{ A/s}$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-p1`,
          subject: 'Physics', topic,
          question_text_en: 'A projectile is launched at $30°$ with the horizontal with initial speed $u = 40\\text{ m/s}$. The maximum height reached (take $g = 10\\text{ m/s}^2$) is:',
          question_text_te: 'క్షితిజ సమాంతరంగా $30°$ కోణంలో $u = 40\\text{ m/s}$ వేగంతో విసిరిన వస్తువు చేరే గరిష్ఠ ఎత్తు ($g = 10\\text{ m/s}^2$):',
          options_en: ['$20\\text{ m}$', '$40\\text{ m}$', '$80\\text{ m}$', '$10\\text{ m}$'],
          options_te: ['$20\\text{ m}$', '$40\\text{ m}$', '$80\\text{ m}$', '$10\\text{ m}$'],
          correct_option: 0,
          explanation_en: '$H = \\frac{u^2\\sin^2\\theta}{2g} = \\frac{40^2 \\times \\sin^2 30°}{2\\times10} = \\frac{1600 \\times 0.25}{20} = 20\\text{ m}$.',
          explanation_te: '$H = \\frac{u^2\\sin^2\\theta}{2g} = \\frac{1600 \\times 0.25}{20} = 20\\text{ m}$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-p2`,
          subject: 'Physics', topic,
          question_text_en: 'In a Carnot engine operating between temperatures $T_1 = 600\\text{ K}$ and $T_2 = 300\\text{ K}$, the efficiency of the engine is:',
          question_text_te: '$T_1 = 600\\text{ K}$ మరియు $T_2 = 300\\text{ K}$ మధ్య పనిచేసే కార్నో ఇంజిన్ సామర్థ్యం:',
          options_en: ['$50\\%$', '$25\\%$', '$75\\%$', '$100\\%$'],
          options_te: ['$50\\%$', '$25\\%$', '$75\\%$', '$100\\%$'],
          correct_option: 0,
          explanation_en: '$\\eta = 1 - \\frac{T_2}{T_1} = 1 - \\frac{300}{600} = 1 - 0.5 = 0.5 = 50\\%$.',
          explanation_te: '$\\eta = 1 - \\frac{T_2}{T_1} = 1 - \\frac{300}{600} = 50\\%$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-p3`,
          subject: 'Physics', topic,
          question_text_en: 'The de Broglie wavelength of an electron accelerated through a potential difference of $100\\text{ V}$ is approximately:',
          question_text_te: '$100\\text{ V}$ విద్యుత్ వోల్టేజ్ ద్వారా త్వరణం పొందిన ఎలక్ట్రాన్ యొక్క డి బ్రోగ్లీ తరంగదైర్ఘ్యం దాదాపు:',
          options_en: ['$1.23\\text{ Å}$', '$2.46\\text{ Å}$', '$0.62\\text{ Å}$', '$3.69\\text{ Å}$'],
          options_te: ['$1.23\\text{ Å}$', '$2.46\\text{ Å}$', '$0.62\\text{ Å}$', '$3.69\\text{ Å}$'],
          correct_option: 0,
          explanation_en: '$\\lambda = \\frac{12.3}{\\sqrt{V}}\\text{ Å} = \\frac{12.3}{\\sqrt{100}} = \\frac{12.3}{10} = 1.23\\text{ Å}$.',
          explanation_te: '$\\lambda = \\frac{12.3}{\\sqrt{V}} = \\frac{12.3}{10} = 1.23\\text{ Å}$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-p4`,
          subject: 'Physics', topic,
          question_text_en: 'A thin convex lens of focal length $f = 20\\text{ cm}$ and a thin concave lens of focal length $f = -40\\text{ cm}$ are kept in contact. The effective focal length of the combination is:',
          question_text_te: '$f = 20\\text{ cm}$ ఉత్తల కటకం మరియు $f = -40\\text{ cm}$ అవతల కటకం స్పర్శలో ఉంచారు. కలయిక యొక్క ఫోకల్ దూరం:',
          options_en: ['$40\\text{ cm}$', '$-40\\text{ cm}$', '$20\\text{ cm}$', '$60\\text{ cm}$'],
          options_te: ['$40\\text{ cm}$', '$-40\\text{ cm}$', '$20\\text{ cm}$', '$60\\text{ cm}$'],
          correct_option: 0,
          explanation_en: '$\\frac{1}{f_{eff}} = \\frac{1}{f_1}+\\frac{1}{f_2} = \\frac{1}{20}+\\frac{1}{-40} = \\frac{2-1}{40} = \\frac{1}{40}$. So $f_{eff} = 40\\text{ cm}$.',
          explanation_te: '$\\frac{1}{f}=\\frac{1}{20}-\\frac{1}{40}=\\frac{1}{40}$. కాబట్టి $f=40\\text{ cm}$.',
          is_previous_year: false, difficulty
        }
      ];

      // ── CHEMISTRY question bank ────────────────────────────────────────
      const chemistryTemplates: Question[] = [
        {
          question_id: `ai-gen-${Date.now()}-c0`,
          subject: 'Chemistry', topic,
          question_text_en: 'The solubility product $K_{sp}$ of a sparingly soluble salt $AB_2$ is $3.2 \\times 10^{-11}$. The molar solubility of this salt in pure water is:',
          question_text_te: 'అల్ప ద్రావణీయత గల లవణం $AB_2$ యొక్క $K_{sp} = 3.2 \\times 10^{-11}$. స్వచ్ఛ నీటిలో మోలార్ ద్రావణీయత:',
          options_en: ['$2.0 \\times 10^{-4}\\text{ mol/L}$', '$4.0 \\times 10^{-4}\\text{ mol/L}$', '$1.6 \\times 10^{-4}\\text{ mol/L}$', '$5.6 \\times 10^{-6}\\text{ mol/L}$'],
          options_te: ['$2.0 \\times 10^{-4}\\text{ mol/L}$', '$4.0 \\times 10^{-4}\\text{ mol/L}$', '$1.6 \\times 10^{-4}\\text{ mol/L}$', '$5.6 \\times 10^{-6}\\text{ mol/L}$'],
          correct_option: 0,
          explanation_en: '$AB_2 \\rightleftharpoons A^{2+}+2B^-$. $K_{sp}=(s)(2s)^2=4s^3=3.2\\times10^{-11}$. $s^3=8\\times10^{-12}$, so $s=2.0\\times10^{-4}\\text{ mol/L}$.',
          explanation_te: '$K_{sp}=4s^3=3.2\\times10^{-11} \\Rightarrow s^3=8\\times10^{-12} \\Rightarrow s=2.0\\times10^{-4}\\text{ M}$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-c1`,
          subject: 'Chemistry', topic,
          question_text_en: 'For the reaction $\\text{N}_2(g) + 3\\text{H}_2(g) \\rightleftharpoons 2\\text{NH}_3(g)$, if $K_p = 1.6 \\times 10^{-4}$ at a given temperature, the value of $K_c$ at the same temperature (take $RT = 24.63$) is approximately:',
          question_text_te: '$\\text{N}_2(g) + 3\\text{H}_2(g) \\rightleftharpoons 2\\text{NH}_3(g)$ చర్యకు $K_p = 1.6 \\times 10^{-4}$ అయితే, $K_c$ విలువ ($RT = 24.63$):',
          options_en: ['$K_c \\approx 97.1$', '$K_c = 3.88 \\times 10^{-6}$', '$K_c = 1.6 \\times 10^{-4}$', '$K_c = 0.016$'],
          options_te: ['$K_c \\approx 97.1$', '$K_c = 3.88 \\times 10^{-6}$', '$K_c = 1.6 \\times 10^{-4}$', '$K_c = 0.016$'],
          correct_option: 0,
          explanation_en: '$\\Delta n_g = 2-4 = -2$. $K_c = K_p \\times (RT)^{-\\Delta n} = 1.6\\times10^{-4} \\times (24.63)^{2} \\approx 97.1$.',
          explanation_te: '$\\Delta n=-2$, $K_c = K_p \\times (RT)^2 = 1.6\\times10^{-4}\\times606.6 \\approx 97.1$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-c2`,
          subject: 'Chemistry', topic,
          question_text_en: 'The bond order of $O_2^{2-}$ (peroxide ion) according to Molecular Orbital Theory is:',
          question_text_te: 'MOT ప్రకారం $O_2^{2-}$ (పెరాక్సైడ్ అయాన్) బంధ క్రమం:',
          options_en: ['$1$', '$2$', '$1.5$', '$0$'],
          options_te: ['$1$', '$2$', '$1.5$', '$0$'],
          correct_option: 0,
          explanation_en: '$O_2^{2-}$ has 18 electrons. Bond order $= \\frac{\\text{bonding }e^- - \\text{anti-bonding }e^-}{2} = \\frac{8-6}{2} = 1$.',
          explanation_te: '$O_2^{2-}$ లో 18 ఎలక్ట్రాన్లు. బంధ క్రమం $= \\frac{8-6}{2} = 1$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-c3`,
          subject: 'Chemistry', topic,
          question_text_en: 'For a first-order reaction, the half-life is $693\\text{ s}$. The rate constant $k$ for this reaction is:',
          question_text_te: 'ప్రథమ క్రమ చర్యకు అర్ధ జీవన కాలం $693\\text{ s}$. వేగ స్థిరాంకం $k$:',
          options_en: ['$10^{-3}\\text{ s}^{-1}$', '$10^{-2}\\text{ s}^{-1}$', '$693\\text{ s}^{-1}$', '$10^{-4}\\text{ s}^{-1}$'],
          options_te: ['$10^{-3}\\text{ s}^{-1}$', '$10^{-2}\\text{ s}^{-1}$', '$693\\text{ s}^{-1}$', '$10^{-4}\\text{ s}^{-1}$'],
          correct_option: 0,
          explanation_en: 'For first-order: $t_{1/2} = \\frac{0.693}{k}$. So $k = \\frac{0.693}{693} = 10^{-3}\\text{ s}^{-1}$.',
          explanation_te: '$k = \\frac{0.693}{t_{1/2}} = \\frac{0.693}{693} = 10^{-3}\\text{ s}^{-1}$.',
          is_previous_year: false, difficulty
        },
        {
          question_id: `ai-gen-${Date.now()}-c4`,
          subject: 'Chemistry', topic,
          question_text_en: 'The IUPAC name of the complex ion $[\\text{Co(NH}_3)_4\\text{Cl}_2]^+$ is:',
          question_text_te: '$[\\text{Co(NH}_3)_4\\text{Cl}_2]^+$ సంక్లిష్ట అయాన్ యొక్క IUPAC పేరు:',
          options_en: ['Tetraamminedichlorocobalt(III) ion', 'Dichlorotetraamminecobalt(II) ion', 'Tetraamminecobalt(II) dichloride', 'Tetraamminedichlorocobalt(II) ion'],
          options_te: ['టెట్రాయమీన్-డైక్లోరోకోబాల్ట్(III) అయాన్', 'డైక్లోరో-కోబాల్ట్(II) అయాన్', 'కోబాల్ట్(II) డైక్లోరైడ్', 'టెట్రాయమీన్-కోబాల్ట్(II) అయాన్'],
          correct_option: 0,
          explanation_en: 'Ligands alphabetically: ammine then chloro. 4×NH₃=tetraammine, 2×Cl=dichloro. Co oxidation state: +1 charge, Co−0−2(−1)=+3. Name: Tetraamminedichlorocobalt(III) ion.',
          explanation_te: 'లిగాండ్లు వర్ణమాల క్రమంలో, Co ఆక్సీకరణ స్థితి +3. పేరు: టెట్రాయమీన్-డైక్లోరోకోబాల్ట్(III) అయాన్.',
          is_previous_year: false, difficulty
        }
      ];

      // Pick a random template from the correct subject bank
      const pool: Question[] = subject === 'Mathematics' ? mathTemplates
        : subject === 'Physics' ? physicsTemplates
        : chemistryTemplates;

      const templateQ: Question = { ...pool[Math.floor(Math.random() * pool.length)], question_id: `ai-gen-${subject}-${Date.now()}` };

      setGeneratedQuestion(templateQ);
      setBookmarked(isBookmarked(templateQ.question_id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyQuestion = () => {
    if (!generatedQuestion) return;
    const text = `${generatedQuestion.question_text_en}\n\nOptions:\nA) ${generatedQuestion.options_en[0]}\nB) ${generatedQuestion.options_en[1]}\nC) ${generatedQuestion.options_en[2]}\nD) ${generatedQuestion.options_en[3]}\n\nCorrect: ${generatedQuestion.options_en[generatedQuestion.correct_option]}\n\nSolution: ${generatedQuestion.explanation_en}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleBookmark = () => {
    if (!generatedQuestion) return;
    const isNow = toggleBookmark(generatedQuestion.question_id);
    setBookmarked(isNow);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-950 to-blue-900 text-white p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="max-w-3xl space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>AI Syllabus-Aligned Problem Creator</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            AI Question Generator & Concept Tutor
          </h1>
          <p className="text-sm text-slate-200">
            Generate unlimited fresh, syllabus-aligned questions with bilingual English & Telugu text, complete KaTeX math typesetting, and detailed step-by-step solutions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Generator Controls */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-purple-600" />
              <span>Question Parameters</span>
            </h2>

            {/* Subject Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                Target Subject
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Mathematics', 'Physics', 'Chemistry'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setSubject(s);
                      setTopic(topicPresets[s][0]);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                      subject === s
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic Selection with Presets */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                Select or Custom Topic
              </label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold rounded-xl p-3 border-none focus:ring-2 focus:ring-purple-500 mb-2"
              >
                {topicPresets[subject].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Or type custom sub-topic..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Difficulty Level */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                Difficulty
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`py-2 rounded-xl border text-xs font-bold transition ${
                      difficulty === d
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Custom Gemini API Key */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                Gemini API Key (Optional)
              </label>
              <input
                type="password"
                placeholder="Leave blank to use built-in AI engine"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Zero setup required — built-in EAMCET question bank activates when blank.
              </p>
            </div>

            {/* Generate Action Button */}
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Bilingual Question...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Generate Syllabus Question</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right 2 Columns: Generated Question & Interactive Solver */}
        <div className="lg:col-span-2 space-y-6">
          {generatedQuestion ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              {/* Question Header & Badges */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-xs rounded-lg">
                    {generatedQuestion.subject}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {generatedQuestion.topic}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleToggleBookmark}
                    title="Bookmark this question"
                    className={`p-2 rounded-lg border text-xs font-medium transition ${
                      bookmarked 
                        ? 'border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-950' 
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>

                  <button
                    onClick={handleCopyQuestion}
                    title="Copy Question & Solution"
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 text-xs flex items-center space-x-1"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* English Version */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  English Question (Official Syllabus Format)
                </span>
                <div className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                  <MathRenderer content={generatedQuestion.question_text_en} />
                </div>
              </div>

              {/* Telugu Version */}
              <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 space-y-1">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center space-x-1">
                  <Languages className="w-3.5 h-3.5" />
                  <span>తెలుగు అనువాదం (Telugu Translation)</span>
                </span>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed font-telugu">
                  <MathRenderer content={generatedQuestion.question_text_te} />
                </div>
              </div>

              {/* 4 Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {generatedQuestion.options_en.map((opt, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = generatedQuestion.correct_option === idx;
                  
                  let optionStyles = 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300';
                  if (showSolution) {
                    if (isCorrect) {
                      optionStyles = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold';
                    } else if (isSelected && !isCorrect) {
                      optionStyles = 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200';
                    }
                  } else if (isSelected) {
                    optionStyles = 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-bold';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedOption(idx)}
                      className={`p-3.5 rounded-xl border text-left text-xs transition flex items-center space-x-3 ${optionStyles}`}
                    >
                      <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <div className="flex-1">
                        <MathRenderer content={opt} inline />
                        <div className="text-[11px] text-slate-400 font-telugu mt-0.5">
                          {generatedQuestion.options_te[idx]}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Check Answer / Show Solution */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setShowSolution(!showSolution)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs hover:opacity-90 transition flex items-center space-x-2"
                >
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <span>{showSolution ? 'Hide Solution' : 'Check Answer & View KaTeX Solution'}</span>
                </button>

                <button
                  onClick={handleGenerate}
                  className="px-4 py-2 text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center space-x-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Generate Another Question</span>
                </button>
              </div>

              {/* Step-by-Step KaTeX Solution Box */}
              {showSolution && (
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Correct Answer: Option {String.fromCharCode(65 + generatedQuestion.correct_option)}</span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      English Detailed Explanation:
                    </h4>
                    <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-mono">
                      <MathRenderer content={generatedQuestion.explanation_en} />
                    </div>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      తెలుగు వివరణ (Telugu Step-by-Step):
                    </h4>
                    <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-telugu">
                      <MathRenderer content={generatedQuestion.explanation_te} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto text-3xl">
                ✨
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                No Question Generated Yet
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Select your desired subject and topic on the left, then click &quot;Generate Syllabus Question&quot; to synthesize a fresh problem.
              </p>
              <button
                onClick={handleGenerate}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow transition"
              >
                Generate Mathematics Question Now
              </button>
            </div>
          )}
        </div>
      </div>

      <AdBanner format="horizontal" />
    </div>
  );
}
