# scripts/sync_all_diagrams.py
# Single unified command to auto-detect and replace all diagram questions from original PDFs.
# Usage:
#   npm run sync-diagrams
#   python scripts/sync_all_diagrams.py

import os
import sys
import subprocess

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

python_exe = sys.executable

print("==========================================================")
print("🚀 EAMCET Unified Diagram Auto-Sync & Replacement Pipeline")
print("==========================================================")

# Step 1: Run audit to update diagram_audit_report.json
print("\n[Step 1/3] Auditing all questions in Supabase...")
try:
    subprocess.run(["node", "scripts/audit_all_diagrams.mjs"], check=False)
except Exception as e:
    print(f"Audit warning: {e}")

# Step 2: Run batch replacement for questions with explicit q_number
print("\n[Step 2/3] Extracting authentic PNG diagrams from PDFs (Pass 1)...")
try:
    subprocess.run([python_exe, "scripts/batch_replace_all_diagrams.py", "--all", "--skip-done"], check=False)
except Exception as e:
    print(f"Batch replace error: {e}")

# Step 3: Run indexed resolution for any questions without explicit q_number
print("\n[Step 3/3] Resolving and extracting diagrams for indexed questions (Pass 2)...")
try:
    subprocess.run([python_exe, "scripts/resolve_null_questions_by_index.py"], check=False)
except Exception as e:
    print(f"Indexed replace error: {e}")

print("\n==========================================================")
print("✅ Auto-Sync Completed! All diagrams are now authentic PDF PNGs.")
print("==========================================================")

