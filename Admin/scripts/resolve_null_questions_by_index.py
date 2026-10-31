# scripts/resolve_null_questions_by_index.py
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

SUPABASE_URL = "https://wazluhsbslxylgcmdkpi.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemx1aHNic2x4eWxnY21ka3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNDMxNDYsImV4cCI6MjEwNDYxOTE0Nn0.gw3659JvvCWu8Lhi6tvZCs2jcfdgvhEnq5TwpzwpfMs"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

BASE_SEARCH_DIRS = [
    r"D:\Projects\EAMCET PAPERS",
    r"D:\Projects\New folder\AP_EAPCET_Papers",
    os.path.expanduser(r"~\Desktop"),
    os.path.expanduser(r"~\Downloads"),
    r"D:\Projects",
]

PROGRESS_FILE = "scripts/replace_progress.json"

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"done_ids": [], "failed_ids": []}

def save_progress(progress):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)

def find_pdf_for_shift(year, stream, shift):
    sh_orig = shift or ""
    sh_clean = re.sub(r"[^a-z0-9]", "", sh_orig.lower())
    yr_str = str(year) if year else ""
    st_lower = (stream or "").lower()

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

                if yr_str and yr_str not in f_clean:
                    continue

                if "engineering" in st_lower and "engineering" not in f_clean:
                    continue
                if "agriculture" in st_lower and "agriculture" not in f_clean:
                    continue

                # Strategy 1: day + shift number
                match_core = re.search(r"(\d+).*?(shift\d+)", sh_clean)
                if match_core:
                    d_part, s_part = match_core.groups()
                    if d_part in f_clean and s_part in f_clean:
                        return os.path.join(root, file)

                # Strategy 2: month + day + FN/AN or shift number
                month_m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", sh_clean)
                day_m = re.search(r"^(\d+)", sh_clean)
                s_num_m = re.search(r"shift(\d+)", sh_clean)
                if month_m and day_m:
                    m_part = month_m.group(1)
                    d_part = day_m.group(1)
                    if m_part in f_clean and d_part in f_clean:
                        if s_num_m and f"shift{s_num_m.group(1)}" in f_clean:
                            return os.path.join(root, file)
                        if is_fn and ("fn" in f_clean or "shift1" in f_clean):
                            return os.path.join(root, file)
                        if is_an and ("an" in f_clean or "shift2" in f_clean):
                            return os.path.join(root, file)

                # Strategy 3: Shift-1 / Shift-2 only
                if s_num_m and f"shift{s_num_m.group(1)}" in f_clean:
                    if is_fn and ("fn" in f_clean or "shift1" in f_clean):
                        return os.path.join(root, file)
                    if is_an and ("an" in f_clean or "shift2" in f_clean):
                        return os.path.join(root, file)

                if sh_clean in f_clean:
                    return os.path.join(root, file)
    return None

def extract_diagram_for_q(doc, q_num):
    target_page_idx = -1
    for p_idx in range(len(doc)):
        text = doc[p_idx].get_text()
        if re.search(rf"Question Number\s*:\s*{q_num}\b", text):
            target_page_idx = p_idx
            break

    if target_page_idx == -1:
        return None, "page_not_found"

    best_img = None
    best_area = 0

    for p_idx in [target_page_idx, target_page_idx + 1]:
        if p_idx >= len(doc):
            continue
        page = doc[p_idx]
        image_list = page.get_images()

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
            break

    if not best_img:
        return None, "no_img"

    return Image.open(io.BytesIO(best_img)), "ok"

def update_supabase(question_id, data_uri):
    url = f"{SUPABASE_URL}/rest/v1/questions?question_id=eq.{question_id}"
    res = requests.patch(url, headers=HEADERS, json={"image_url": data_uri})
    return res.status_code in [200, 204]

def main():
    with open("scripts/diagram_audit_report.json", "r", encoding="utf-8") as f:
        report = json.load(f)

    progress = load_progress()
    done_ids = set(progress.get("done_ids", []))

    null_qs = [q for q in report.get("svg_questions_list", []) if q.get("is_ai_svg") and not q.get("q_number")]
    remaining = [q for q in null_qs if q["question_id"] not in done_ids]
    print(f"Total null questions remaining: {len(remaining)}")

    # Group remaining by (year, shift, stream, subject)
    from collections import defaultdict
    groups = defaultdict(list)
    for q in remaining:
        key = (q.get("year"), q.get("shift"), q.get("stream"), q.get("subject"))
        groups[key].append(q)

    print(f"Found {len(groups)} distinct (year, shift, stream, subject) groups to process.")

    doc_cache = {}
    success_count = 0
    fail_count = 0

    for (year, shift, stream, subject), target_qs in groups.items():
        print(f"\n========================================================")
        print(f"📚 {year} | {shift} | {stream} | {subject} ({len(target_qs)} questions)")

        # Query all questions for this subject in this shift from Supabase ordered by created_at
        encoded_shift = requests.utils.quote(shift)
        url = f"{SUPABASE_URL}/rest/v1/questions?year=eq.{year}&shift=eq.{encoded_shift}&stream=eq.{stream}&subject=eq.{subject}&select=question_id,created_at,question_text_en&order=created_at.asc"
        res = requests.get(url, headers=HEADERS, timeout=20)
        if res.status_code != 200:
            print(f"   ❌ Failed to fetch shift questions: {res.status_code}")
            fail_count += len(target_qs)
            continue

        all_subject_qs = res.json()
        print(f"   Loaded {len(all_subject_qs)} questions for this subject in DB.")

        # Determine starting question number
        stream_lower = (stream or "").lower()
        subject_lower = (subject or "").lower()

        start_q = 1
        if "engineering" in stream_lower:
            if "math" in subject_lower:
                start_q = 1
            elif "physics" in subject_lower:
                start_q = 81
            elif "chemistry" in subject_lower:
                start_q = 121
        else: # agriculture
            if "botany" in subject_lower:
                start_q = 1
            elif "zoology" in subject_lower:
                start_q = 41
            elif "physics" in subject_lower:
                start_q = 81
            elif "chemistry" in subject_lower:
                start_q = 121

        # Map each question_id to its calculated question number
        qid_to_qnum = {}
        for idx, item in enumerate(all_subject_qs):
            qid_to_qnum[item["question_id"]] = start_q + idx

        # Find PDF
        pdf_path = find_pdf_for_shift(year, stream, shift)
        if not pdf_path:
            print(f"   ⚠️ PDF not found for {year} {shift} ({stream})")
            fail_count += len(target_qs)
            continue

        if pdf_path not in doc_cache:
            try:
                doc_cache[pdf_path] = pymupdf.open(pdf_path)
            except Exception as e:
                print(f"   ❌ Error opening PDF {pdf_path}: {e}")
                fail_count += len(target_qs)
                continue
        doc = doc_cache[pdf_path]
        print(f"   PDF: {os.path.basename(pdf_path)}")

        for t_q in target_qs:
            qid = t_q["question_id"]
            calculated_qnum = qid_to_qnum.get(qid)
            if not calculated_qnum:
                print(f"   ⚠️ QID {qid} not found in sorted subject questions list!")
                fail_count += 1
                continue

            print(f"   🎯 Calculated Q{calculated_qnum} for {qid} ({subject})")
            img, status = extract_diagram_for_q(doc, calculated_qnum)
            if not img:
                print(f"      ⚠️ Failed to extract diagram: {status}")
                fail_count += 1
                continue

            out_buf = io.BytesIO()
            img.save(out_buf, format="PNG", optimize=True)
            b64_str = base64.b64encode(out_buf.getvalue()).decode("utf-8")
            data_uri = f"data:image/png;base64,{b64_str}"

            if update_supabase(qid, data_uri):
                print(f"      🎉 Replaced! {img.width}x{img.height}")
                done_ids.add(qid)
                progress["done_ids"] = list(done_ids)
                save_progress(progress)
                success_count += 1
            else:
                print(f"      ❌ Supabase update failed")
                fail_count += 1

    for doc in doc_cache.values():
        try:
            doc.close()
        except Exception:
            pass

    print(f"\n========================================================")
    print(f"🏁 Summary of Indexed Replacement:")
    print(f"   ✅ Successfully Replaced: {success_count}")
    print(f"   ⚠️ Failed/Skipped:        {fail_count}")
    print(f"   Total in progress file:  {len(done_ids)} / 569")
    print(f"========================================================")

if __name__ == "__main__":
    main()

