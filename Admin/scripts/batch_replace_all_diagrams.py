# scripts/batch_replace_all_diagrams.py
# Usage:
#   Process specific shift:  python batch_replace_all_diagrams.py "21 May Shift-1"
#   Process ALL shifts:      python batch_replace_all_diagrams.py --all
#   Dry run all:             python batch_replace_all_diagrams.py --all --dry-run
#   Skip already done:       python batch_replace_all_diagrams.py --all --skip-done

import os
import sys
import json
import base64
import io
import re
import requests
import pymupdf
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://wazluhsbslxylgcmdkpi.supabase.co")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemx1aHNic2x4eWxnY21ka3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNDMxNDYsImV4cCI6MjEwNDYxOTE0Nn0.gw3659JvvCWu8Lhi6tvZCs2jcfdgvhEnq5TwpzwpfMs")

API_KEY = ""
try:
    with open(".env.local", "r", encoding="utf-8") as f:
        content = f.read()
        m = re.search(r"GEMINI_API_KEY=([^\r\n]+)", content)
        if m:
            API_KEY = m.group(1).strip()
except Exception:
    pass

BASE_SEARCH_DIRS = [
    r"D:\Projects\EAMCET PAPERS",
    r"D:\Projects\New folder\AP_EAPCET_Papers",
    os.path.expanduser(r"~\Desktop"),
    os.path.expanduser(r"~\Downloads"),
    r"D:\Projects",
]

# Progress tracking file - so we can resume if interrupted
PROGRESS_FILE = "scripts/replace_progress.json"

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"done_ids": [], "failed_ids": [], "skipped_ids": []}

def save_progress(progress):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)

def find_pdf_for_shift(year, stream, shift):
    sh_orig = shift or ""
    sh_clean = re.sub(r"[^a-z0-9]", "", sh_orig.lower())
    yr_str = str(year) if year else ""
    st_lower = (stream or "").lower()

    # Determine FN/AN from shift string
    is_fn = bool(re.search(r"\bfn\b|shift.?1|morning", sh_orig.lower()))
    is_an = bool(re.search(r"\ban\b|shift.?2|afternoon", sh_orig.lower()))

    for base_dir in BASE_SEARCH_DIRS:
        if not os.path.exists(base_dir):
            continue
        for root, dirs, files in os.walk(base_dir):
            for file in files:
                if not file.lower().endswith(".pdf"):
                    continue
                f_lower = file.lower()
                f_clean = re.sub(r"[^a-z0-9]", "", f_lower)

                # Must match year
                if yr_str and yr_str not in f_clean:
                    continue

                # Stream match (engineering / agriculture)
                if "engineering" in st_lower and "engineering" not in f_clean:
                    continue
                if "agriculture" in st_lower and "agriculture" not in f_clean:
                    continue

                # --- Strategy 1: day + "shift1"/"shift2" in filename ---
                match_core = re.search(r"(\d+).*?(shift\d+)", sh_clean)
                if match_core:
                    d_part, s_part = match_core.groups()
                    if d_part in f_clean and s_part in f_clean:
                        return os.path.join(root, file)

                # --- Strategy 2: month + day + FN/AN (for 2020-style filenames) ---
                month_m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", sh_clean)
                day_m = re.search(r"^(\d+)", sh_clean)
                if month_m and day_m:
                    month_part = month_m.group(1)
                    day_part = day_m.group(1)
                    if month_part in f_clean and day_part in f_clean:
                        # Check FN/AN
                        if is_fn and "fn" in f_clean:
                            return os.path.join(root, file)
                        if is_an and "an" in f_clean:
                            return os.path.join(root, file)
                        # No FN/AN in filename → accept any match
                        if not is_fn and not is_an:
                            return os.path.join(root, file)

                # --- Strategy 3: month + shift number (no day) for "Shift-1 (FN Morning)" ---
                # These are Agriculture papers where shift name has no date
                if not day_m and month_m:
                    s_num_m = re.search(r"shift(\d+)", sh_clean)
                    if s_num_m and month_m.group(1) in f_clean:
                        fn_ok = is_fn and "fn" in f_clean
                        an_ok = is_an and "an" in f_clean
                        shift_ok = f"shift{s_num_m.group(1)}" in f_clean
                        if (fn_ok or an_ok) and shift_ok:
                            return os.path.join(root, file)

                # --- Strategy 4: FN/AN only (no day, no month) e.g. "Shift-1 (FN Morning)" ---
                if not day_m and not month_m:
                    s_num_m = re.search(r"shift(\d+)", sh_clean)
                    if s_num_m:
                        snum = s_num_m.group(1)
                        # Prefer exact shift number match in filename
                        shift_in_f = f"shift{snum}" in f_clean
                        fn_ok = is_fn and "fn" in f_clean and shift_in_f
                        an_ok = is_an and "an" in f_clean and shift_in_f
                        if fn_ok or an_ok:
                            return os.path.join(root, file)
                        # Fallback: just shift number match
                        if shift_in_f:
                            return os.path.join(root, file)

                # --- Strategy 5: direct substring fallback ---
                if sh_clean in f_clean:
                    return os.path.join(root, file)

    return None

def detect_bbox_gemini(png_bytes):
    if not API_KEY:
        return None
    b64 = base64.b64encode(png_bytes).decode("utf-8")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={API_KEY}"
    payload = {
        "contents": [{
            "parts": [
                {"inlineData": {"mimeType": "image/png", "data": b64}},
                {"text": (
                    "Locate ONLY the visual diagram, circuit diagram, graph, pulley system, "
                    "organic chemical structure, or vector/force diagram in this exam question image. "
                    "DO NOT include question text, answer options, or Telugu text. "
                    "Return ONLY JSON: {\"has_diagram\": true, \"box_2d\": [ymin, xmin, ymax, xmax]} "
                    "where values are normalized 0-1000. "
                    "If no visual diagram exists, return {\"has_diagram\": false}."
                )}
            ]
        }],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0}
    }
    try:
        res = requests.post(url, json=payload, timeout=25)
        data = res.json()
        txt = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        parsed = json.loads(txt)
        if isinstance(parsed, list) and len(parsed) > 0:
            parsed = parsed[0]
        if isinstance(parsed, dict) and parsed.get("has_diagram"):
            bbox = parsed.get("box_2d")
            if bbox and len(bbox) == 4:
                return bbox
    except Exception as e:
        print(f"      Gemini bbox error: {e}")
    return None

def update_supabase_image(question_id, data_uri):
    url = f"{SUPABASE_URL}/rest/v1/questions?question_id=eq.{question_id}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    payload = {"image_url": data_uri}
    res = requests.patch(url, headers=headers, json=payload)
    return res.status_code in [200, 204]

def find_question_page_by_text(doc, q_num, q_text_snippet=None):
    """Find the page containing the question by number or text snippet."""
    # Method 1: exact "Question Number : N"
    for p_idx in range(len(doc)):
        text = doc[p_idx].get_text()
        if re.search(rf"Question Number\s*:\s*{q_num}\b", text):
            return p_idx

    # Method 2: text snippet search (fallback for null q_number)
    if q_text_snippet and len(q_text_snippet) > 20:
        snippet = q_text_snippet[:60].lower().strip()
        # Extract key words (skip common words)
        words = [w for w in re.findall(r"[a-zA-Z]{4,}", snippet) if w not in
                 {"that", "with", "this", "from", "have", "will", "when", "which", "then"}]
        for p_idx in range(len(doc)):
            page_text = doc[p_idx].get_text().lower()
            if len(words) >= 3:
                matches = sum(1 for w in words[:6] if w in page_text)
                if matches >= 3:
                    return p_idx
    return -1

def extract_diagram_from_page(doc, page_idx, q_num, use_gemini=True):
    """Extract the diagram image from a page (and page+1 as fallback)."""
    found_img_bytes = None
    found_page_idx = None

    for p_idx in [page_idx, page_idx + 1]:
        if p_idx >= len(doc):
            continue
        page = doc[p_idx]
        image_list = page.get_images()

        # Pick the most significant image on this page
        best_img = None
        best_area = 0

        for img_info in image_list:
            xref = img_info[0]
            try:
                pix = pymupdf.Pixmap(doc, xref)
                area = pix.width * pix.height
                if pix.width > 200 and pix.height > 80 and area > best_area:
                    if pix.n >= 5:
                        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                    best_img = pix.tobytes("png")
                    best_area = area
            except Exception:
                continue

        if best_img:
            found_img_bytes = best_img
            found_page_idx = p_idx
            break

    if not found_img_bytes:
        # Fallback: render the page to PNG and let Gemini crop it
        for p_idx in [page_idx, page_idx + 1]:
            if p_idx >= len(doc):
                continue
            page = doc[p_idx]
            # Render at 2x resolution
            mat = pymupdf.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat)
            rendered_bytes = pix.tobytes("png")
            # Check if page has any visual content worth sending to Gemini
            if len(rendered_bytes) > 50000:  # At least 50KB
                found_img_bytes = rendered_bytes
                found_page_idx = p_idx
                break

    if not found_img_bytes:
        return None

    img = Image.open(io.BytesIO(found_img_bytes))
    w, h = img.size
    final_img = img

    if use_gemini:
        bbox = detect_bbox_gemini(found_img_bytes)
        if bbox and len(bbox) == 4:
            ymin, xmin, ymax, xmax = bbox
            pad = 15
            crop_y1 = max(0, int((ymin / 1000) * h) - pad)
            crop_x1 = max(0, int((xmin / 1000) * w) - pad)
            crop_y2 = min(h, int((ymax / 1000) * h) + pad)
            crop_x2 = min(w, int((xmax / 1000) * w) + pad)

            if (crop_x2 - crop_x1) > 40 and (crop_y2 - crop_y1) > 40:
                final_img = img.crop((crop_x1, crop_y1, crop_x2, crop_y2))
                print(f"      Gemini crop: {final_img.width}x{final_img.height} (from page {found_page_idx+1})")
            else:
                print(f"      Gemini bbox too small, using full image")
        else:
            print(f"      No Gemini bbox, using full image {w}x{h}")

    return final_img

def process_single_question(q, doc_cache, dry_run=False):
    q_id = q["question_id"]
    year = q.get("year")
    stream = q.get("stream")
    shift = q.get("shift")
    q_num = q.get("q_number")
    subject = q.get("subject", "")
    q_text = q.get("question_text_en", "") or ""

    if not shift:
        print(f"   ⚠️ Skipping: no shift info")
        return "skip"

    pdf_path = find_pdf_for_shift(year, stream, shift)
    if not pdf_path:
        print(f"   ⚠️ PDF not found for {year} {shift} ({stream})")
        return "no_pdf"

    if pdf_path not in doc_cache:
        try:
            doc_cache[pdf_path] = pymupdf.open(pdf_path)
        except Exception as e:
            print(f"   ❌ Error opening PDF: {e}")
            return "error"
    doc = doc_cache[pdf_path]

    # Find the question's page
    target_page_idx = find_question_page_by_text(doc, q_num, q_text)

    if target_page_idx == -1:
        if q_num:
            print(f"   ⚠️ Q{q_num}: page not found in {os.path.basename(pdf_path)}")
        else:
            print(f"   ⚠️ QNull: text-based page search failed in {os.path.basename(pdf_path)}")
        return "not_found"

    final_img = extract_diagram_from_page(doc, target_page_idx, q_num)
    if not final_img:
        label = f"Q{q_num}" if q_num else "QNull"
        print(f"   ⚠️ {label}: no diagram image found on pages {target_page_idx+1}-{target_page_idx+2}")
        return "no_img"

    if dry_run:
        label = f"Q{q_num}" if q_num else "QNull"
        print(f"   [DRY RUN] Would replace {label} ({subject}) - {final_img.width}x{final_img.height}")
        return "dry_run"

    out_buf = io.BytesIO()
    final_img.save(out_buf, format="PNG", optimize=True)
    png_bytes = out_buf.getvalue()

    b64_str = base64.b64encode(png_bytes).decode("utf-8")
    data_uri = f"data:image/png;base64,{b64_str}"

    success = update_supabase_image(q_id, data_uri)
    label = f"Q{q_num}" if q_num else "QNull"
    if success:
        print(f"   ✅ {label} ({subject}): Replaced! {final_img.width}x{final_img.height}")
        return "done"
    else:
        print(f"   ❌ {label}: Supabase update failed")
        return "error"

def main():
    args = sys.argv[1:]
    do_all = "--all" in args
    dry_run = "--dry-run" in args
    skip_done = "--skip-done" in args
    target_filter = None

    for a in args:
        if not a.startswith("--"):
            target_filter = a
            break

    report_path = "scripts/diagram_audit_report.json"
    if not os.path.exists(report_path):
        print("❌ Audit report not found.")
        return

    with open(report_path, "r", encoding="utf-8") as f:
        report = json.load(f)

    all_questions = [q for q in report.get("svg_questions_list", []) if q.get("is_ai_svg")]

    if do_all:
        questions = all_questions
        print(f"🚀 Processing ALL {len(questions)} AI SVG diagrams across all shifts...")
    elif target_filter:
        questions = [q for q in all_questions if target_filter.lower() in (q.get("shift") or "").lower()]
        print(f"🚀 Processing shift filter: '{target_filter}' → {len(questions)} questions")
    else:
        # Default: process everything
        questions = all_questions
        print(f"🚀 Processing ALL {len(questions)} questions (no filter specified)...")

    progress = load_progress()
    done_ids = set(progress.get("done_ids", []))

    if skip_done:
        questions = [q for q in questions if q["question_id"] not in done_ids]
        print(f"   (Skipping {len(done_ids)} already done) → {len(questions)} remaining")

    if dry_run:
        print("   ⚠️  DRY RUN MODE - no DB changes will be made")

    doc_cache = {}
    stats = {"done": 0, "no_pdf": 0, "not_found": 0, "no_img": 0, "error": 0, "skip": 0}
    total = len(questions)

    # Group by (year, shift, stream) for cleaner output
    from collections import defaultdict
    groups = defaultdict(list)
    for q in questions:
        key = f"{q.get('year')}|{q.get('shift')}|{q.get('stream')}"
        groups[key].append(q)

    q_idx = 0
    for group_key, group_qs in groups.items():
        year, shift, stream = group_key.split("|")
        print(f"\n{'='*60}")
        print(f"📄 {year} | {shift} | {stream} ({len(group_qs)} questions)")
        print(f"{'='*60}")

        for q in group_qs:
            q_idx += 1
            q_num = q.get('q_number')
            label = f"Q{q_num}" if q_num else "QNull(text-search)"
            print(f"\n[{q_idx}/{total}] {label} ({q.get('subject', '')})...")

            result = process_single_question(q, doc_cache, dry_run=dry_run)
            stats[result] = stats.get(result, 0) + 1

            if result == "done":
                done_ids.add(q["question_id"])
                progress["done_ids"] = list(done_ids)
                save_progress(progress)
            elif result == "error":
                progress.setdefault("failed_ids", [])
                if q["question_id"] not in progress["failed_ids"]:
                    progress["failed_ids"].append(q["question_id"])
                save_progress(progress)

    # Close all cached PDFs
    for doc in doc_cache.values():
        try:
            doc.close()
        except Exception:
            pass

    print(f"\n{'='*60}")
    print(f"🏁 FINAL SUMMARY:")
    print(f"   ✅ Replaced:   {stats.get('done', 0)}")
    print(f"   📄 No PDF:    {stats.get('no_pdf', 0)}")
    print(f"   🔍 Not found: {stats.get('not_found', 0)}")
    print(f"   🖼️ No image:  {stats.get('no_img', 0)}")
    print(f"   ❌ Errors:    {stats.get('error', 0)}")
    print(f"   ⏭️ Skipped:   {stats.get('skip', 0)}")
    print(f"   Total: {total}")
    print(f"{'='*60}")

    if not dry_run:
        print(f"\nProgress saved to {PROGRESS_FILE}")
        print(f"Resume with: python batch_replace_all_diagrams.py --all --skip-done")

if __name__ == "__main__":
    main()
