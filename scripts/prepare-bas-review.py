"""Prepare a PRIVATE review worksheet as JSON; never approve or import data.

Read-only with respect to the source workbook and all databases. The output
deliberately fails the existing production importer until independent review.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
MAX_ROWS = 20000
MAX_ACCOUNTS = 10000


def label(value):
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def prepare(sheets, source_hash, source_version, source_reference, rights_reference=None):
    """Preserve every source occurrence; never last-row-wins a duplicate."""
    if not re.fullmatch(r"[a-f0-9]{64}", source_hash):
        raise ValueError("Source SHA-256 is required.")
    if not source_version.strip() or not source_reference.strip():
        raise ValueError("Source version and reference are required.")
    if rights_reference is not None and not rights_reference.strip():
        raise ValueError("A supplied rights reference must not be empty.")
    records = {}
    read_rows = 0
    for sheet_name, rows in sheets:
        class_heading = None
        group_heading = None
        for index, row in enumerate(rows, 1):
            read_rows += 1
            if read_rows > MAX_ROWS:
                raise ValueError("Source exceeds bounded review size.")
            cells = list(row) + [None] * 4
            for column in (0, 2):
                token, name = label(cells[column]), label(cells[column + 1])
                if re.fullmatch(r"[1-8]", token):
                    if not name:
                        raise ValueError("Unnamed class heading.")
                    class_heading = (token, name)
                    group_heading = None
                elif re.fullmatch(r"[1-8]\d", token):
                    if not name:
                        raise ValueError("Invalid group heading.")
                    if class_heading and token[0] != class_heading[0]:
                        class_heading = None
                    group_heading = (token, name)
                elif re.fullmatch(r"[1-8]\d{3}#?", token):
                    number = token.rstrip("#")
                    if not name or len(name) > 2000:
                        raise ValueError("Invalid full source account name.")
                    if not group_heading:
                        raise ValueError(f"Account without matching source headings at row {index}.")
                    class_name = class_heading[1] if class_heading and number[0] == class_heading[0] else None
                    group_name = group_heading[1] if number[:2] == group_heading[0] else None
                    record = records.setdefault(number, {
                        "number": number,
                        "accountClass": number[0],
                        "accountGroup": number[:2],
                        # Some official spreadsheets omit class headings. Keep
                        # missing evidence missing rather than inventing a label.
                        "className": class_name,
                        "groupName": group_name,
                        "category": "GROUP_ACCOUNT" if number.endswith("00") else (
                            "MAIN_ACCOUNT" if number.endswith("0") else "SUBACCOUNT"),
                        "sourceOccurrences": []
                    })
                    if (record["className"], record["groupName"]) != (
                            class_name, group_name):
                        raise ValueError("Duplicate has conflicting source headings.")
                    record["sourceOccurrences"].append({
                        "name": name, "isK2Restricted": token.endswith("#"),
                        "position": f"{sheet_name}!{'A' if column == 0 else 'C'}{index}",
                        "sourceSection": {"number": group_heading[0], "name": group_heading[1]}
                    })
                    if len(records) > MAX_ACCOUNTS:
                        raise ValueError("Source exceeds account bound.")
                elif re.match(r"^[1-8]\d{3}", token):
                    raise ValueError("Unrecognized account identifier or restriction marker.")
    if not records:
        raise ValueError("No source accounts found.")
    accounts = []
    for number, record in sorted(records.items()):
        occurrences = record["sourceOccurrences"]
        names = sorted({o["name"] for o in occurrences})
        markers = {o["isK2Restricted"] for o in occurrences}
        derived_parent = number[:3] + "0"
        group_parent = number[:2] + "00"
        candidates = []
        if record["category"] == "SUBACCOUNT":
            candidates = [p for p in dict.fromkeys((derived_parent, group_parent))
                          if p in records and p != number]
        accounts.append({
            **record,
            "officialName": names[0] if len(names) == 1 else None,
            "sourceNameVariants": names,
            "isK2Restricted": next(iter(markers)) if len(markers) == 1 else None,
            "sourcePosition": "; ".join(o["position"] for o in occurrences),
            "parentCandidates": candidates,
            "parentAccountNumber": None,
            "type": None,
            "normalBalance": None,
            "isBookable": None,
            "classificationReference": None,
            "reviewStatus": "REQUIRED"
        })
    return {
        "mode": "REVIEW_REQUIRED_NOT_IMPORTABLE",
        "version": source_version,
        "sourceVersion": source_version,
        "sourceReference": source_reference,
        "sourceSha256": source_hash,
        # Explicit operator-supplied attestation, never inferred from downloads
        # or successful tests. This is not independent legal advice.
        "licenseReference": rights_reference,
        "rightsConfirmed": rights_reference is not None,
        "classificationReviewReference": None,
        "expectedAccounts": len(accounts),
        "verification": {
            "allSourceEntriesReviewed": False,
            "unresolvedClassifications": len(accounts),
            "unresolvedNames": sum(a["officialName"] is None for a in accounts),
            "unresolvedDuplicates": sum(
                len(a["sourceNameVariants"]) > 1 or a["isK2Restricted"] is None
                for a in accounts)
        },
        "accounts": accounts
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--rights-reference", help="Reference to an existing explicit rights attestation; never generated automatically")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    # Official names and draft metadata must not leak into Git/public assets.
    if not output.is_relative_to((ROOT / ".local-artifacts").resolve()):
        raise ValueError("Output must be in the private .local-artifacts directory.")
    if output.exists():
        raise ValueError("Refusing to overwrite an existing review file.")
    source = args.xlsx.resolve(strict=True)
    if not source.is_file() or source.stat().st_size > 12 * 1024 * 1024:
        raise ValueError("Invalid bounded source file.")
    import openpyxl
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    try:
        with source.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        review = prepare(((sheet.title, sheet.values) for sheet in workbook),
                         digest, args.version, args.reference, args.rights_reference)
    finally:
        workbook.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(review, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    # Do not log full account names, local private paths or license materials.
    print(json.dumps({
        "status": review["mode"], "accounts": len(review["accounts"]),
        "sourceOccurrences": sum(len(a["sourceOccurrences"]) for a in review["accounts"]),
        "categories": dict(Counter(a["category"] for a in review["accounts"])),
        "verification": review["verification"],
        "databaseConnected": False, "databaseMutations": 0
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("BAS review preparation refused. Check bounded source, headings and private output; no source data is logged.")
