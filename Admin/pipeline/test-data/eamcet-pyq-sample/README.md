# EAPCET PYQ Sample Dataset (test fixtures)

A tiny, curated previous-year-question (PYQ) dataset used to test the
**Previous Papers Auto-Ingest** flow end-to-end: a GitHub repo is crawled via the
GitHub git-trees API, every `papers/**/*.json` file is pulled, questions are
stamped with paper metadata, validated, deduplicated by fingerprint, and inserted
into the Supabase `questions` table (inserts only — never delete/replace).

## Repo layout convention

```
papers/<state>-<year>-<shift>.json
```

| File | Contents |
| --- | --- |
| `papers/ap-2024-shift1.json` | 5 questions — Mathematics (Quadratic Equations, Sequences & Series), Physics (Electrostatics, Optics), Chemistry (Chemical Bonding) |
| `papers/ts-2023-shift1.json` | 3 Engineering questions — Mathematics (Trigonometry), Physics (Modern Physics), Chemistry (Atomic Structure) |
| `papers/ap-2023-agri.json` | 3 Agriculture questions — Botany (Morphology of Flowering Plants, Plant Physiology), Zoology (Human Reproduction) |

**Totals:** 11 questions · 3 files · 2 states (AP, TS) · 2 streams (Engineering, Agriculture).

## File format

```json
{
  "paper": { "state": "AP", "year": 2024, "stream": "Engineering", "shift": "Shift-1", "title": "EAPCET 2024 Shift-1 (Engineering)" },
  "questions": [
    {
      "question_text_en": "If $\\alpha$ and $\\beta$ are the roots of ...",
      "options_en": ["19", "13", "25", "7"],
      "correct_option": 1,
      "explanation_en": "Here $\\alpha + \\beta = 5$ ...",
      "subject": "Mathematics",
      "topic": "Quadratic Equations",
      "difficulty": "Medium"
    }
  ]
}
```

- `paper` is optional but recommended — it carries the paper-level metadata.
- Each question carries its own `subject` / `topic` (these win over the run-level
  values from the admin form).
- `correct_option` is a **0-based** index into `options_en`.
- Math uses `$...$` LaTeX, rendered by the portal's `MathRenderer`.

## Metadata precedence (highest → lowest)

1. **Per-file `paper` object** — `state`, `year`, `stream`, `shift` from the JSON file itself.
2. **Filename pattern** — `papers/<state>-<year>-<shift>.json`
   (e.g. `ap-2024-shift1.json` → AP / 2024 / Shift-1; the `agri` suffix implies
   stream `Agriculture`). Stream is *not* derivable for `shift-N` names, so it
   falls through to the next level.
3. **Admin form run-level values** — the PYQ metadata section of the
   "Previous Papers Auto-Ingest" tab.

When any metadata is in effect, pulled rows get `is_previous_year = true` plus the
merged `state` / `year` / `shift` (and `stream` when known).

## Admin form values (exact)

In **Admin → Previous Papers Auto-Ingest**:

| Field | Value |
| --- | --- |
| Source type | `github-repo` |
| Repo owner | `<your GitHub username>` |
| Repo name | `eamcet-pyq-test-data` |
| Branch | `main` |
| Path glob | `papers/**/*.json` |
| Fallback subject / topic | any (used only for questions that lack their own `subject`/`topic`) |
| Paper metadata (run-level) | lowest precedence — per-file `paper` objects in these fixtures override them |

**Scan & Preview** runs a dry-run (`dryRun: true`) — nothing is inserted.
**Insert into Database** runs the real pull (`dryRun: false`), dedupes by
fingerprint against existing rows for each `(subject, topic)` pair, and inserts
only new questions.

## Push these fixtures to a scratch repo

```bash
cd pipeline/test-data/eamcet-pyq-sample
git init
git add papers README.md
git commit -m "EAPCET PYQ sample fixtures (11 questions, 3 papers)"
git branch -M main
git remote add origin https://github.com/<your-username>/eamcet-pyq-test-data.git
git push -u origin main
```

Then run a dry-run from the admin tab (or POST to `/api/questions/pull` with
`repoOwner`, `repoName`, `repoBranch: "main"`, `pathGlob: "papers/**/*.json"`
and `dryRun: true`). Expected dry-run result: **11 valid questions, 0 inserted**.

## Notes

- **Display threshold:** `/previous-years` only surfaces a paper card for groups
  with **≥160 questions**. This fixture (11 questions across 3 papers) tests the
  *ingest* pipeline, not the paper-card display — the rows will exist in the
  database without producing a paper card.
- **Pull rate limit:** every scan/insert counts against the in-memory
  **10 requests/hour** pull rate limit (`PULL_RATE_LIMIT_PER_HOUR`), keyed by IP.
  Restarting the dev server resets the counter.
- **GitHub API limits:** unauthenticated `api.github.com` allows **60 requests/hour**;
  the crawl uses 1 tree request + 1 raw fetch per matched file.
- These fixtures contain only public sample questions written for this test —
  safe to commit, **no keys or credentials** are included.
