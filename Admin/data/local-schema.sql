-- AP/TS EAMCET Exam Portal Database Schema (SQLite Version)

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    auth_provider TEXT DEFAULT 'email',
    avatar_url TEXT,
    target_exam TEXT DEFAULT 'AP_EAMCET_ENG',
    target_year INTEGER DEFAULT 2026,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2. Questions Table
CREATE TABLE IF NOT EXISTS questions (
    question_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    question_text_en TEXT NOT NULL,
    question_text_te TEXT NOT NULL,
    options_en TEXT NOT NULL,
    options_te TEXT NOT NULL,
    correct_option INTEGER NOT NULL CHECK (correct_option BETWEEN 0 AND 3),
    explanation_en TEXT NOT NULL,
    explanation_te TEXT NOT NULL,
    is_previous_year INTEGER DEFAULT 0,
    state TEXT,
    year INTEGER,
    stream TEXT,
    shift TEXT,
    difficulty TEXT DEFAULT 'Medium' CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for ultra-fast question payload generation & filtering
CREATE INDEX IF NOT EXISTS idx_questions_pyq ON questions (state, year, stream, shift);
CREATE INDEX IF NOT EXISTS idx_questions_subject_topic ON questions (subject, topic, difficulty);

-- 3. Test Attempts Table
CREATE TABLE IF NOT EXISTS test_attempts (
    attempt_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT,
    test_title TEXT NOT NULL,
    test_type TEXT NOT NULL,
    total_score REAL NOT NULL,
    max_marks INTEGER DEFAULT 160,
    subject_scores TEXT NOT NULL,
    user_answers TEXT NOT NULL,
    time_taken_seconds INTEGER NOT NULL,
    rank_estimate TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_test_attempts_user ON test_attempts (user_id, created_at);

-- 4. User Gamification Table
CREATE TABLE IF NOT EXISTS user_gamification (
    user_id TEXT PRIMARY KEY,
    streak_count INTEGER DEFAULT 1,
    last_active_date TEXT DEFAULT CURRENT_DATE,
    total_questions_solved INTEGER DEFAULT 0,
    total_correct_answers INTEGER DEFAULT 0,
    badges_earned TEXT DEFAULT '["EAMCET_ASPIRANT"]',
    speed_challenge_best_score INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 5. Bookmarks Table
CREATE TABLE IF NOT EXISTS bookmarks (
    bookmark_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT,
    question_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, question_id)
);