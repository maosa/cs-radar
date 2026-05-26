#!/usr/bin/env python3
"""
One-shot migration: insert all rows from project_tracker_populated.csv
into the project_tracker_entries table in Supabase.
"""
import csv
import json
import urllib.request
import urllib.error
from collections import defaultdict
import os

SUPABASE_URL = "https://donbpqsnslreougnwrtd.supabase.co"
SERVICE_ROLE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbmJwcXNuc2xyZW91Z253cnRkIiwi"
    "cm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ3NDU1MCwiZXhwIjoyMDkz"
    "MDUwNTUwfQ.n-VL30hyy8M8ZO548dXlqC7n4II8TQEqQwGQugULNTQ"
)
ADMIN_USER_ID = "b54d5d5b-6222-4676-ab16-ec664b18107d"  # andreas@accessinfinity.com

PROJECT_MAP = {
    ("AH",   "Pfizer - Vaccines"):           "2e32277d-1766-494b-833d-1b9ea04d9b39",
    ("EH",   "Astellas - Xtandi"):           "5d303f01-ba69-42dd-b02e-89e90c6080da",
    ("EH",   "BI - Jardiance"):              "c6d4f3bc-2882-404f-8c1b-a324b61f8679",
    ("EH",   "General"):                     "4fbc26af-5a5b-462b-aebc-32596d2a941b",
    ("EH",   "Regeneron - Linvoseltamab"):   "f811feed-5a13-4536-8848-1f414bbe0ab9",
    ("EH",   "Regeneron - Odronextamab"):    "21b82456-e490-4c69-b0e8-f8b625f0f580",
    ("EH",   "Sanofi - Epidemiology"):       "e9426546-ffad-4070-9abc-8ba25dbd9a26",
    ("N/A",  "General"):                     "5a220f06-bcca-472b-b2dc-eb379d46aeda",
    ("NURO", "Almirall"):                    "f95a739c-1f49-4ee5-bd69-c4139da4102f",
    ("NURO", "General"):                     "9134c670-3477-42e9-9f63-cf51055cb399",
}


def parse_date(yyyymmdd: str) -> str:
    s = yyyymmdd.strip()
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}"


def load_entries(csv_path: str) -> list[dict]:
    entries = []
    week_counter: dict[str, int] = defaultdict(int)
    skipped = []

    with open(csv_path, newline="", encoding="latin-1") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):  # row 2 = first data row
            product = row["Product"].strip()
            project_name = row["Project"].strip()
            week_raw = row["Week"].strip()
            description = row["Description"].strip()
            flagged_raw = row["Flagged"].strip().upper()

            project_id = PROJECT_MAP.get((product, project_name))
            if not project_id:
                skipped.append(f"  row {i}: ({product}, {project_name})")
                continue

            week_date = parse_date(week_raw)
            sort_order = week_counter[week_date]
            week_counter[week_date] += 1

            entries.append({
                "admin_user_id":  ADMIN_USER_ID,
                "project_id":     project_id,
                "product":        product,
                "description":    description,
                "week_start_date": week_date,
                "is_flagged":     flagged_raw == "TRUE",
                "sort_order":     sort_order,
                "created_by":     ADMIN_USER_ID,
            })

    if skipped:
        print(f"WARNING — {len(skipped)} rows skipped (no matching project):")
        for s in skipped:
            print(s)

    return entries


def insert_batch(entries: list[dict]) -> None:
    payload = json.dumps(entries).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/project_tracker_entries"
        "?on_conflict=admin_user_id,project_id,week_start_date",
        data=payload,
        headers={
            "apikey":        SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal,resolution=ignore-duplicates",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        print(f"  → inserted {len(entries)} entries (HTTP {resp.status})")


def main() -> None:
    csv_path = os.path.join(os.path.dirname(__file__), "..", "project_tracker_populated.csv")
    csv_path = os.path.normpath(csv_path)

    print(f"Reading: {csv_path}")
    entries = load_entries(csv_path)
    print(f"Entries prepared: {len(entries)}")

    if not entries:
        print("Nothing to insert.")
        return

    batch_size = 50
    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(entries) + batch_size - 1) // batch_size
        print(f"Batch {batch_num}/{total_batches} ({len(batch)} rows)…", end=" ")
        try:
            insert_batch(batch)
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"FAILED: HTTP {e.code} — {body}")
            raise

    print("Done.")


if __name__ == "__main__":
    main()
