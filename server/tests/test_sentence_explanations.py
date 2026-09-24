"""Offline checks for the whole-line AI response boundary."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as service  # noqa: E402


class SentenceExplanationTests(unittest.TestCase):
    def setUp(self):
        self.request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})
        self.payload = service.ExplainSentenceBatchRequest(lines=[
            service.SentenceContextLine(id=1, text="君が持ってきた漫画", translation="你带来的漫画"),
            service.SentenceContextLine(id=2, text="夢ならば", translation="如果是梦"),
        ])

    def test_only_requested_valid_explanations_are_returned(self):
        response = {"explanations": [
            {"line_id": 1, "meaning": "你带来的漫画", "grammar": ["持ってきた：带来了"],
             "vocabulary": [{"surface": "漫画", "meaning": "漫画"}], "pronunciation_tip": ""},
            {"line_id": 999, "meaning": "不应出现"},
            {"line_id": 2, "meaning": ""},
        ]}
        with patch.object(service, "call_deepseek_json", return_value=response) as mocked:
            result = service.explain_sentences_with_ai(self.payload, self.request)
        self.assertEqual([item["line_id"] for item in result["explanations"]], [1])
        self.assertEqual(result["explanations"][0]["vocabulary"][0]["surface"], "漫画")
        self.assertEqual(mocked.call_args.args[2]["lines"][0]["translation"], "你带来的漫画")

    def test_unusable_response_is_rejected(self):
        with patch.object(service, "call_deepseek_json", return_value={"explanations": []}):
            with self.assertRaises(HTTPException) as raised:
                service.explain_sentences_with_ai(self.payload, self.request)
        self.assertEqual(raised.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
