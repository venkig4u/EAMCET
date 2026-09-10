export type SubjectType = 'Mathematics' | 'Physics' | 'Chemistry' | 'Biology';

export type QuestionStatus = 
  | 'NOT_VISITED'
  | 'NOT_ANSWERED'
  | 'ANSWERED'
  | 'MARKED_FOR_REVIEW'
  | 'ANSWERED_AND_MARKED_FOR_REVIEW';

export interface Question {
  question_id: string;
  subject: SubjectType;
  topic: string;
  question_text_en: string;
  question_text_te: string;
  options_en: string[];
  options_te: string[];
  correct_option: number; // 0, 1, 2, 3
  explanation_en: string;
  explanation_te: string;
  is_previous_year: boolean;
  state?: 'AP' | 'TS';
  year?: number;
  stream?: 'Engineering' | 'Agriculture';
  shift?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  image_url?: string;
}

export interface UserResponse {
  selectedOption: number | null; // 0, 1, 2, 3 or null
  status: QuestionStatus;
  timeSpentSeconds: number;
}

export interface TestAttempt {
  attempt_id: string;
  user_id: string;
  test_title: string;
  test_type: 'PYQ' | 'TOPIC_PRACTICE' | 'SPEED_CHALLENGE' | 'FULL_MOCK';
  total_score: number;
  max_marks: number;
  subject_scores: Record<string, { score: number; total: number; correct: number; incorrect: number; unattempted: number }>;
  user_answers: Record<string, UserResponse>;
  time_taken_seconds: number;
  rank_estimate: string;
  created_at: string;
}

export interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  hall_ticket_no: string;
  target_exam: string;
  streak_count: number;
  total_questions_solved: number;
  accuracy_rate: number;
  badges_earned: Badge[];
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
}

export interface PYQFilterState {
  state: 'ALL' | 'AP' | 'TS';
  year: number | 'ALL';
  stream: 'Engineering' | 'Agriculture';
  shift: string | 'ALL';
}

export interface RankPrediction {
  marks: number;
  estimatedRank: string;
  percentile: string;
  qualifyingStatus: 'Qualified' | 'Not Qualified';
  topColleges: string[];
  tips: string[];
}
