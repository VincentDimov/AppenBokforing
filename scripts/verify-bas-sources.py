"""Read-only source audit. No catalog output, download, or production import.

Use operator-provided local official PDF/XLSX. Full source content is kept out
of distributed assets. Counts are evidence, not a license or classification.
"""
import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter


def normalized_name(value):
    """Whitespace/layout normalization only, never delete punctuation/letters."""
    return " ".join(unicodedata.normalize("NFC", value).split())

def layout_text(words):
    """Keep printed hyphens; only join a hyphenated word across PDF lines."""
    parts = []
    previous = None
    for word in words:
        join = previous and previous["text"].endswith("-") and (
            3 < word["top"] - previous["top"] < 25
        ) and word["text"][0:1].isalpha()
        if join:
            parts[-1] += word["text"]
        else:
            parts.append(word["text"])
        previous = word
    return normalized_name(" ".join(parts))


def audit(pdf_path, xlsx_path, manifest_path=None):
    import openpyxl
    import pdfplumber
    workbook = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    source = []
    headings = []
    for sheet in workbook:
        for row_index, row in enumerate(sheet.values, 1):
            for column in (0, 2):
                identifier = str(row[column] or "").strip()
                name = str(row[column + 1] or "").strip()
                if re.fullmatch(r"[1-8]\d{3}#?", identifier):
                    number = identifier.rstrip("#")
                    source.append({"number": number, "name": name,
                                   "restricted": identifier.endswith("#"),
                                   "row": row_index, "column": column + 1})
                elif re.fullmatch(r"[1-8]\d?", identifier):
                    headings.append(identifier)
    # Read EVERY PDF page, including both posting-account columns. Position
    # evidence avoids mistaking years within descriptions for identifiers.
    pdf_accounts = []
    with pdfplumber.open(pdf_path) as pdf:
        pages = len(pdf.pages)
        for page_index, page in enumerate(pdf.pages, 1):
            words = page.extract_words()
            for word in words:
                token = word["text"]
                if re.fullmatch(r"[1-8]\d{3}#?", token) and (
                    30 <= word["x0"] <= 55 or 275 <= word["x0"] <= 340
                ):
                    number = token.rstrip("#")
                    left = word["x0"] < 275
                    # Full labels can begin ABOVE a vertically centered number.
                    # Compare the complete XLS label in a bounded same-column
                    # PDF region, preserving punctuation and Swedish characters.
                    region = [w for w in words if
                              (90 <= w["x0"] < 294 if left else w["x0"] >= 340)
                              and word["top"] - 65 <= w["top"] <= word["top"] + 65]
                    region_text = normalized_name(" ".join(w["text"] for w in region))
                    joined_text = layout_text(region)
                    candidates = [e for e in source if e["number"] == number
                                  and e["column"] == (1 if left else 3)]
                    pdf_accounts.append({"number": number,
                                         "restricted": token.endswith("#"),
                                         "page": page_index, "x": round(word["x0"], 2),
                                         "nameMatched": any(normalized_name(e["name"]) in region_text or normalized_name(e["name"]) in joined_text
                                                            for e in candidates),
                                         "sourceColumn": 1 if left else 3})
        first_page_version = pdf.pages[0].extract_text().splitlines()[:3]
    workbook.close()
    numbers = Counter(entry["number"] for entry in source)
    pdf_numbers = Counter(entry["number"] for entry in pdf_accounts)
    unique = {entry["number"]: entry for entry in source}
    contradictory = [number for number, count in numbers.items() if count > 1 and
                     len({(entry["name"], entry["restricted"]) for entry in source
                          if entry["number"] == number}) > 1]
    category = lambda number: "group" if number.endswith("00") else (
        "main" if number.endswith("0") else "sub")
    counts = Counter((category(entry["number"]), entry["restricted"])
                     for entry in unique.values())
    missing_parents = [number for number in unique if category(number) == "sub"
                       and number[:3] + "0" not in unique]
    with open(pdf_path, "rb") as stream:
        pdf_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    with open(xlsx_path, "rb") as stream:
        xlsx_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    name_failures = [e for e in pdf_accounts if not e["nameMatched"]]
    identical_duplicates = sorted(number for number, count in numbers.items()
                                  if count > 1 and number not in contradictory)
    # Identical, independently matched occurrences are one identity. Contradictory
    # names have no last-row-wins canonicalization and remain an import blocker.
    manifest_comparison = None
    if manifest_path:
        with open(manifest_path, encoding="utf-8") as stream:
            manifest = json.load(stream)
        manifest_rows = manifest.get("accounts", [])
        manifest_numbers = Counter(e.get("number") for e in manifest_rows)
        mismatched = [e.get("number") for e in manifest_rows if
                      e.get("number") not in unique or
                      normalized_name(e.get("officialName", "")) not in
                      {normalized_name(s["name"]) for s in source if s["number"] == e.get("number")}]
        marker_mismatches = [e.get("number") for e in manifest_rows if
                             e.get("number") in unique and
                             e.get("isK2Restricted") != unique[e["number"]]["restricted"]]
        source_matches = manifest.get("sourceSha256") in (pdf_hash, xlsx_hash)
        manifest_comparison = {"missingNumbers": sorted(set(unique) - set(manifest_numbers)),
                               "extraNumbers": sorted(set(manifest_numbers) - set(unique)),
                               "duplicateNumbers": sorted(n for n, count in manifest_numbers.items() if count > 1),
                               "nameMismatchNumbers": sorted(mismatched),
                               "restrictionMismatchNumbers": sorted(marker_mismatches),
                               "officialSourceHashMatches": source_matches,
                               "unresolvedSourceConflicts": contradictory,
                               "approved": source_matches and not (mismatched or marker_mismatches or contradictory or name_failures)
                               and set(unique) == set(manifest_numbers)
                               and all(count == 1 for count in manifest_numbers.values())}
    return {
        "sourceVersionLines": first_page_version, "pdfPagesRead": pages,
        "pdfSha256": pdf_hash, "xlsxSha256": xlsx_hash,
        "xlsxPostingOccurrences": len(source), "uniqueNumbers": len(unique),
        "pdfPostingOccurrences": len(pdf_accounts),
        "standardGroupAccounts": counts[("group", False)],
        "restrictedGroupAccounts": counts[("group", True)],
        "standardMainAccounts": counts[("main", False)],
        "restrictedMainAccounts": counts[("main", True)],
        "standardSubaccounts": counts[("sub", False)],
        "restrictedSubaccounts": counts[("sub", True)],
        "duplicateOccurrences": sum(count - 1 for count in numbers.values()),
        "duplicateNumbers": sorted(number for number, count in numbers.items() if count > 1),
        "contradictoryDuplicateNumbers": contradictory,
        "identicalDuplicateNumbers": identical_duplicates,
        "duplicateResolution": {number: "IDENTICAL_OCCURRENCES_SINGLE_IDENTITY" for number in identical_duplicates},
        "fullLabelOccurrenceMatches": len(pdf_accounts) - len(name_failures),
        "fullLabelMismatchCount": len(name_failures),
        "fullLabelMismatchPositions": [{"number": e["number"], "page": e["page"], "column": e["sourceColumn"]} for e in name_failures],
        "nameComparisonMethod": "Complete XLS label in bounded same-column PDF region, NFC/whitespace and coordinate-proven line-break hyphen joins only; not independent professional review",
        "manifestComparison": manifest_comparison,
        "hierarchyReview": [{"number": n, "derivedMainExists": False,
                             "existingGroupAccount": n[:2] + "00" if n[:2] + "00" in unique else None,
                             "decision": "REVIEW_EXPLICIT_GROUP_PARENT"} for n in missing_parents],
        "missingNames": sum(not entry["name"] for entry in source),
        "longestNameLength": max(len(entry["name"]) for entry in source),
        "subaccountsWithoutNumberDerivedMain": missing_parents,
        "pdfVsXlsxNumberOccurrencesEqual": pdf_numbers == numbers,
        "pdfMissingOccurrences": dict(numbers - pdf_numbers),
        "pdfExtraOccurrences": dict(pdf_numbers - numbers),
        "k2MarkerOccurrencesEqual": Counter((e["number"], e["restricted"]) for e in source)
        == Counter((e["number"], e["restricted"]) for e in pdf_accounts),
        "knownReferenceChecks": {
            "1010RestrictedMain": unique.get("1010", {}).get("restricted") is True
            and category("1010") == "main",
            "1011RestrictedSub": unique.get("1011", {}).get("restricted") is True
            and category("1011") == "sub",
            "1020ExactName": unique.get("1020", {}).get("name") == "Koncessioner m.m.",
            "1028OptionalSub": "1028" in unique and not unique["1028"]["restricted"]
            and category("1028") == "sub" and "1020" in unique,
            "6200Group6210Main6211Sub": all(number in unique for number in ("6200", "6210", "6211"))
            and [category(number) for number in ("6200", "6210", "6211")] == ["group", "main", "sub"]
        },
        "classificationReview": "NOT_COMPLETED",
        "commercialRights": "NOT_ESTABLISHED", "importedRecords": 0,
        "productionReadiness": "BLOCKED"
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--xlsx", required=True)
    parser.add_argument("--manifest", help="Optional private normalized manifest for complete name/number comparison")
    args = parser.parse_args()
    print(json.dumps(audit(args.pdf, args.xlsx, args.manifest), ensure_ascii=True, indent=2))
