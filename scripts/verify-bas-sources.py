"""Read-only source audit. No catalog output, download, or production import.

Use operator-provided local official PDF/XLSX. Full source content is kept out
of distributed assets. Counts are evidence, not a license or classification.
"""
import argparse
import hashlib
import json
import re
from collections import Counter

import openpyxl
import pdfplumber


def audit(pdf_path, xlsx_path):
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
            for word in page.extract_words():
                token = word["text"]
                if re.fullmatch(r"[1-8]\d{3}#?", token) and (
                    30 <= word["x0"] <= 55 or 275 <= word["x0"] <= 340
                ):
                    pdf_accounts.append({"number": token.rstrip("#"),
                                         "restricted": token.endswith("#"),
                                         "page": page_index, "x": round(word["x0"], 2)})
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
    args = parser.parse_args()
    print(json.dumps(audit(args.pdf, args.xlsx), ensure_ascii=True, indent=2))
