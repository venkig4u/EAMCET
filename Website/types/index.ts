export type SubjectType = 'Mathematics' | 'Physics' | 'Chemistry' | 'Botany' | 'Zoology';

export type QuestionStatus = 
  | 'NOT_VISITED'
  | 'NOT_ANSWERED'
  | 'ANSWERED'
  | 'MARKED_FOR_REVIEW'
  | 'ANSWERED_AND_MARKED_FOR_REVIEW';

export type DiagramShapeType =
  | 'line' | 'arrow' | 'rect' | 'circle' | 'path' | 'zigzag'
  | 'battery' | 'diode' | 'ground' | 'acsource'
  | 'ammeter' | 'voltmeter' | 'label';

export interface DiagramShape {
  t: DiagramShapeType;
  x?: number; y?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  cx?: number; cy?: number; r?: number;
  w?: number; h?: number;
  d?: string;
  fill?: string;
  width?: number;
  dash?: boolean;
  vertical?: boolean;
  reverse?: boolean;
  lbl?: string;
  en?: string; te?: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
}

/** JSON SVG spec emitted by pipeline/admin-scripts/diagram_spec.py */
export interface DiagramSpec {
  template?: string;
  w: number;
  h: number;
  shapes: DiagramShape[];
}

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
  state?: 'AP' | 'TS' | 'TG';
  year?: number;
  stream?: 'engineering' | 'agriculture-pharmacy' | 'Engineering' | 'Agriculture';
  shift?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  image_url?: string;
  diagram_json?: DiagramSpec | null;
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
  questions?: Question[];
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
  preferred_stream: 'engineering' | 'agriculture-pharmacy';
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
  state: 'ALL' | 'AP' | 'TG';
  year: number | 'ALL';
  stream: 'engineering' | 'agriculture-pharmacy';
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
