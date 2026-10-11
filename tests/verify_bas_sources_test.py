"""Original layout fixtures only; no official source assets or dependencies."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("source_audit", Path(__file__).parents[1] / "scripts" / "verify-bas-sources.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class SourceLayoutTest(unittest.TestCase):
    def test_nfc_whitespace_preserves_letters_and_punctuation(self):
        self.assertEqual(audit.normalized_name("A\u030a\t ä\nö - i"), "Å ä ö - i")

    def test_coordinate_proven_wrap_keeps_printed_hyphen(self):
        self.assertEqual(audit.layout_text([{"text": "EU-", "top": 10}, {"text": "land", "top": 25}]), "EU-land")

    def test_no_same_line_or_distant_hyphen_join(self):
        for top in (10, 50):
            self.assertEqual(audit.layout_text([{"text": "syntetiskt-", "top": 10}, {"text": "ord", "top": top}]), "syntetiskt- ord")

    def test_printed_space_variant_remains_available_for_comparison(self):
        words = [{"text": "syntetiskt-", "top": 10}, {"text": "och", "top": 25}]
        self.assertEqual(audit.normalized_name(" ".join(w["text"] for w in words)), "syntetiskt- och")
