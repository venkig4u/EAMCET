import { UserProfile, TestAttempt, Question, RankPrediction } from '@/types';

const USER_PROFILE_KEY = 'eamcet_user_profile_v1';
const ATTEMPTS_KEY = 'eamcet_test_attempts_v1';
const BOOKMARKS_KEY = 'eamcet_bookmarked_ids_v1';
const GAMIFICATION_KEY = 'eamcet_gamification_v1';

export const DEFAULT_USER: UserProfile = {
  user_id: 'usr-student-001',
  name: 'Venkata Sai Kumar',
  email: 'aspirant.sai@eamcetprep.in',
  hall_ticket_no: '2604A08921',
  target_exam: 'AP & TS EAMCET 2026 (Engineering)',
  streak_count: 5,
  total_questions_solved: 340,
  accuracy_rate: 76.5,
  badges_earned: [
    {
      id: 'streak_5',
      title: '5-Day Streak Fighter',
      description: 'Logged in and solved problems 5 days in a row',
      icon: '🔥',
      unlockedAt: '2026-09-08'
    },
    {
      id: 'math_prodigy',
      title: 'Maths Conqueror',
      description: 'Scored 85%+ in Mathematics mock section',
      icon: '📐',
      unlockedAt: '2026-09-05'
    },
    {
      id: 'century_club',
      title: 'Century Club',
      description: 'Crossed 100+ marks in full mock test',
      icon: '🏆',
      unlockedAt: '2026-09-01'
    }
  ]
};

export function getUserProfile(): UserProfile {
  if (typeof window === 'undefined') return DEFAULT_USER;
  const stored = localStorage.getItem(USER_PROFILE_KEY);
  if (!stored) {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(DEFAULT_USER));
    return DEFAULT_USER;
  }
  try {
    return JSON.parse(stored);
  } catch {
    return DEFAULT_USER;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

export function getTestAttempts(): TestAttempt[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(ATTEMPTS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function getTestAttemptById(attemptId: string): TestAttempt | null {
  const attempts = getTestAttempts();
  return attempts.find(a => a.attempt_id === attemptId) || null;
}

export function saveTestAttempt(attempt: TestAttempt): void {
  if (typeof window === 'undefined') return;
  const attempts = getTestAttempts();
  const filtered = attempts.filter(a => a.attempt_id !== attempt.attempt_id);
  filtered.unshift(attempt);
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(filtered));

  // Update profile metrics
  const profile = getUserProfile();
  profile.total_questions_solved += Object.keys(attempt.user_answers).length;
  saveUserProfile(profile);
}

export function getBookmarks(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(BOOKMARKS_KEY);
  if (!stored) return ['m-01', 'p-02', 'c-01'];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function toggleBookmark(questionId: string): boolean {
  if (typeof window === 'undefined') return false;
  const current = getBookmarks();
  let updated: string[];
  let isBookmarked = false;
  if (current.includes(questionId)) {
    updated = current.filter(id => id !== questionId);
    isBookmarked = false;
  } else {
    updated = [...current, questionId];
    isBookmarked = true;
  }
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
  return isBookmarked;
}

export function isBookmarked(questionId: string): boolean {
  return getBookmarks().includes(questionId);
}

export function predictEamcetRank(score: number): RankPrediction {
  // Official AP/TS EAMCET empirical curve (total 160 marks)
  if (score >= 145) {
    return {
      marks: score,
      estimatedRank: '1 - 250',
      percentile: '99.85+',
      qualifyingStatus: 'Qualified',
      topColleges: [
        'JNTU Hyderabad (CSE / ECE)',
        'Osmania University College of Engg (CSE)',
        'AU College of Engineering, Visakhapatnam (CSE)',
        'CBIT Hyderabad (CSE)'
      ],
      tips: [
        'Outstanding score! Top 500 guarantee in both AP & TS EAMCET.',
        'Eligible for 100% tuition reimbursement under government welfare schemes.'
      ]
    };
  } else if (score >= 130) {
    return {
      marks: score,
      estimatedRank: '251 - 1,200',
      percentile: '98.5 - 99.8',
      qualifyingStatus: 'Qualified',
      topColleges: [
        'JNTU Kakinada (CSE / IT)',
        'Vasavi College of Engineering, Hyderabad',
        'VNR VJIET Hyderabad',
        'Gayatri Vidya Parishad, Vizag'
      ],
      tips: [
        'Excellent score! Confirmed CSE/IT seat in tier-1 autonomous colleges.',
        'Focus on improving Chemistry speed to push into the top 500 bracket.'
      ]
    };
  } else if (score >= 110) {
    return {
      marks: score,
      estimatedRank: '1,201 - 4,500',
      percentile: '95.0 - 98.4',
      qualifyingStatus: 'Qualified',
      topColleges: [
        'Gokaraju Rangaraju (GRIET), Hyderabad',
        'BVRIT Hyderabad',
        'Sree Vidyanikethan, Tirupati',
        'RVR & JC College of Engg, Guntur'
      ],
      tips: [
        'Very strong competitive score. Core branches or CSE allied are within reach.',
        'Work on time management in Mathematics to pick up 8-12 extra marks.'
      ]
    };
  } else if (score >= 85) {
    return {
      marks: score,
      estimatedRank: '4,501 - 15,000',
      percentile: '88.0 - 94.9',
      qualifyingStatus: 'Qualified',
      topColleges: [
        'CVR College of Engineering',
        'Kakatiya Institute of Technology & Science (KITS)',
        'VR Siddhartha, Vijayawada',
        'MVSR Engineering College'
      ],
      tips: [
        'Respectable performance! Target high-weightage topics in Physics (Mechanics & Heat).'
      ]
    };
  } else if (score >= 60) {
    return {
      marks: score,
      estimatedRank: '15,001 - 38,000',
      percentile: '75.0 - 87.9',
      qualifyingStatus: 'Qualified',
      topColleges: [
        'Vardhaman College of Engineering',
        'Malla Reddy Engineering College',
        'Anil Neerukonda Institute (ANITS), Vizag'
      ],
      tips: [
        'Qualifying mark cleared (40 marks for general). Focus on formula memorization and PYQs.'
      ]
    };
  } else if (score >= 40) {
    return {
      marks: score,
      estimatedRank: '38,001 - 75,000',
      percentile: '55.0 - 74.9',
      qualifyingStatus: 'Qualified',
      topColleges: [
        'Regional affiliated private engineering colleges',
        'Government Polytechnic/Lateral Entry universities'
      ],
      tips: [
        'Just above qualifying cutoff (40/160). Rigorous chapter-wise mock tests recommended.'
      ]
    };
  } else {
    return {
      marks: score,
      estimatedRank: '75,000+ (Below Cutoff for General Category)',
      percentile: '< 55.0',
      qualifyingStatus: 'Not Qualified',
      topColleges: ['Re-attempt recommended / Management quota options'],
      tips: [
        'Minimum 40 marks (25%) required for General/OBC qualification. No cutoff for SC/ST.',
        'Start with our Topic Practice Mode to build foundational confidence.'
      ]
    };
  }
}
