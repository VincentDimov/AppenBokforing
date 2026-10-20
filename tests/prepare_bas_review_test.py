"""Original source-layout fixtures; never distribute the official chart."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "prepare_bas_review", Path(__file__).parents[1] / "scripts" / "prepare-bas-review.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class PrepareBasReviewTest(unittest.TestCase):
    def run_source(self, extra):
        return review.prepare([("Source", [
            ("1", "Original test class"), ("12", "Original test group"),
            ("1200", "Test group account"), ("1210#", "Test restricted main"),
            *extra])], "a" * 64, "TEST-1", "synthetic independent fixture")

    def test_complete_names_and_all_occurrences_retained(self):
        result = self.run_source([(None, None, "1211#", "A\u030a ä\nö - full label")])
        self.assertEqual(result["expectedAccounts"], 3)
        sub = result["accounts"][2]
        self.assertEqual(sub["officialName"], "Å ä ö - full label")
        self.assertEqual(sub["sourcePosition"], "Source!C5")
        self.assertTrue(sub["isK2Restricted"])
        self.assertEqual(sub["parentCandidates"], ["1210", "1200"])

    def test_identical_duplicates_have_one_identity_and_both_positions(self):
        result = self.run_source([(None, None, "1200", "Test group account")])
        row = result["accounts"][0]
        self.assertEqual(result["expectedAccounts"], 2)
        self.assertEqual(len(row["sourceOccurrences"]), 2)
        self.assertEqual(row["officialName"], "Test group account")
        self.assertEqual(result["verification"]["unresolvedDuplicates"], 0)

    def test_different_names_never_last_row_wins(self):
        result = self.run_source([(None, None, "1210#", "Different test label")])
        row = result["accounts"][1]
        self.assertIsNone(row["officialName"])
        self.assertEqual(len(row["sourceNameVariants"]), 2)
        self.assertEqual(result["verification"]["unresolvedNames"], 1)
        self.assertEqual(result["verification"]["unresolvedDuplicates"], 1)

    def test_conflicting_markers_remain_unresolved(self):
        result = self.run_source([(None, None, "1210", "Test restricted main")])
        self.assertIsNone(result["accounts"][1]["isK2Restricted"])
        self.assertEqual(result["verification"]["unresolvedDuplicates"], 1)

    def test_missing_main_proposes_only_existing_group_not_invented_parent(self):
        result = self.run_source([(None, None, "1231", "Test optional sub")])
        self.assertEqual(result["accounts"][2]["parentCandidates"], ["1200"])
        self.assertIsNone(result["accounts"][2]["parentAccountNumber"])

    def test_never_attests_rights_review_or_financial_values(self):
        result = self.run_source([])
        self.assertFalse(result["rightsConfirmed"])
        self.assertFalse(result["verification"]["allSourceEntriesReviewed"])
        self.assertEqual(result["verification"]["unresolvedClassifications"], 2)
        for row in result["accounts"]:
            for field in ("type", "normalBalance", "isBookable", "classificationReference"):
                self.assertIsNone(row[field])

    def test_malformed_account_marker_and_missing_name_fail_closed(self):
        for row in (("1212*", "Test name"), ("1212", None)):
            with self.subTest(row=row), self.assertRaises(ValueError):
                self.run_source([row])

    def test_combined_source_section_not_mistaken_for_every_numeric_group(self):
        result = self.run_source([("1300", "Another numeric group")])
        row = result["accounts"][-1]
        self.assertIsNone(row["groupName"])
        self.assertEqual(row["accountGroup"], "13")
        self.assertEqual(row["sourceOccurrences"][0]["sourceSection"]["number"], "12")

    def test_source_headings_required(self):
        with self.assertRaises(ValueError):
            review.prepare([("Source", [("1210", "Test name")])], "a" * 64, "T", "T")

    def test_explicit_rights_attestation_does_not_approve_accounting(self):
        result = review.prepare([("Source", [("12", "Test group"), ("1210", "Test name")])],
                                "a" * 64, "T", "T", "Synthetic operator attestation")
        self.assertTrue(result["rightsConfirmed"])
        self.assertEqual(result["licenseReference"], "Synthetic operator attestation")
        self.assertFalse(result["verification"]["allSourceEntriesReviewed"])
        self.assertIsNone(result["classificationReviewReference"])

    def test_source_may_omit_class_heading_without_inventing_one(self):
        result = review.prepare([("Source", [("12", "Test group"),
                                               ("1210", "Test name")])],
                                "a" * 64, "T", "T")
        self.assertIsNone(result["accounts"][0]["className"])
        self.assertEqual(result["accounts"][0]["accountClass"], "1")
        self.assertEqual(result["accounts"][0]["accountGroup"], "12")

    def test_invalid_provenance_rejected(self):
        for digest, version, reference in (("bad", "T", "T"), ("a" * 64, "", "T"),
                                           ("a" * 64, "T", "")):
            with self.assertRaises(ValueError):
                review.prepare([], digest, version, reference)

    def test_no_source_accounts_rejected(self):
        with self.assertRaises(ValueError):
            review.prepare([], "a" * 64, "T", "T")


if __name__ == "__main__":
    unittest.main()
