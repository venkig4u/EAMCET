-- AP/TS EAMCET Exam Portal Database Schema (Supabase / PostgreSQL)

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    auth_provider VARCHAR(50) DEFAULT 'email',
    avatar_url TEXT,
    target_exam VARCHAR(50) DEFAULT 'AP_EAMCET_ENG', -- AP_EAMCET_ENG, TS_EAMCET_ENG, AP_EAMCET_AGRI, TS_EAMCET_AGRI
    target_year INTEGER DEFAULT 2026,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Questions Table
CREATE TABLE IF NOT EXISTS questions (
    question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject VARCHAR(50) NOT NULL, -- 'Mathematics', 'Physics', 'Chemistry', 'Biology'
    topic VARCHAR(100) NOT NULL,
    question_text_en TEXT NOT NULL,
    question_text_te TEXT NOT NULL,
    options_en JSONB NOT NULL, -- Array of 4 strings in English
    options_te JSONB NOT NULL, -- Array of 4 strings in Telugu
    correct_option INTEGER NOT NULL CHECK (correct_option BETWEEN 0 AND 3),
    explanation_en TEXT NOT NULL,
    explanation_te TEXT NOT NULL,
    is_previous_year BOOLEAN DEFAULT false,
    state VARCHAR(10), -- 'AP', 'TS', or NULL for general practice
    year INTEGER,      -- 2018 - 2026
    stream VARCHAR(50), -- 'Engineering', 'Agriculture'
    shift VARCHAR(50),  -- 'Shift-1 (FN)', 'Shift-2 (AN)'
    difficulty VARCHAR(20) DEFAULT 'Medium' CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for ultra-fast question payload generation & filtering
CREATE INDEX IF NOT EXISTS idx_questions_pyq ON questions (state, year, stream, shift);
CREATE INDEX IF NOT EXISTS idx_questions_subject_topic ON questions (subject, topic, difficulty);

-- 3. Test Attempts Table
CREATE TABLE IF NOT EXISTS test_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    test_title VARCHAR(255) NOT NULL,
    test_type VARCHAR(50) NOT NULL, -- 'PYQ', 'TOPIC_PRACTICE', 'SPEED_CHALLENGE', 'FULL_MOCK'
    total_score NUMERIC(5, 2) NOT NULL,
    max_marks INTEGER DEFAULT 160,
    subject_scores JSONB NOT NULL, -- e.g. {"Mathematics": 65, "Physics": 28, "Chemistry": 32}
    user_answers JSONB NOT NULL,   -- Map of question_id -> { selectedOption: number, status: string, timeSpentSeconds: number }
    time_taken_seconds INTEGER NOT NULL,
    rank_estimate VARCHAR(100),    -- e.g. "Top 1,500 - 3,000"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_attempts_user ON test_attempts (user_id, created_at DESC);

-- 4. User Gamification Table
CREATE TABLE IF NOT EXISTS user_gamification (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    streak_count INTEGER DEFAULT 1,
    last_active_date DATE DEFAULT CURRENT_DATE,
    total_questions_solved INTEGER DEFAULT 0,
    total_correct_answers INTEGER DEFAULT 0,
    badges_earned JSONB DEFAULT '["EAMCET_ASPIRANT"]'::jsonb,
    speed_challenge_best_score INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Bookmarks Table
CREATE TABLE IF NOT EXISTS bookmarks (
    bookmark_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(question_id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, question_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Questions are readable and writable
CREATE POLICY "Public questions read" ON questions FOR SELECT USING (true);
CREATE POLICY "Public questions insert" ON questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public questions update" ON questions FOR UPDATE USING (true);
CREATE POLICY "Public questions delete" ON questions FOR DELETE USING (true);
