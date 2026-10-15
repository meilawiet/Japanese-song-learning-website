"""AI word-boundary proposals must match the user's current, complete lyric tokens."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as service  # noqa: E402


class SegmentationReviewTests(unittest.TestCase):
    def setUp(self):
        self.request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})
        self.payload = service.SongReviewRequest(song_id="local-test", title="测试歌曲", lines=[
            service.ReviewLyricLine(id=0, text="学校へ帰る。", tokens=[
                service.ReviewToken(index=0, surface="学校", reading="がっこう"),
                service.ReviewToken(index=1, surface="へ", reading="へ"),
                service.ReviewToken(index=2, surface="帰る", reading="かえる"),
                service.ReviewToken(index=3, surface="。", is_symbol=True),
            ]),
        ])

    def test_uses_current_tokens_and_accepts_only_exact_contiguous_proposals(self):
        suggestions = [
            {"line_id": 0, "start_token_index": 0, "end_token_index": 0,
             "suggested_segments": ["学", "校"], "confidence": 0.9, "reason": "按上下文分别读"},
            {"line_id": 0, "start_token_index": 0, "end_token_index": 1,
             "suggested_segments": ["学校", "へ"], "confidence": 0.9, "reason": "原样不应重复"},
            {"line_id": 0, "start_token_index": 2, "end_token_index": 3,
             "suggested_segments": ["帰る。"], "confidence": 0.9, "reason": "不应跨过标点"},
            {"line_id": 0, "start_token_index": 0, "end_token_index": 0,
             "suggested_segments": ["学", "園"], "confidence": 0.9, "reason": "不得篡改原文"},
        ]
        with patch.object(service, "annotate_text", side_effect=AssertionError("must use supplied tokens")):
            with patch.object(service, "call_deepseek_json", return_value={"suggestions": [], "segmentation_suggestions": suggestions}) as ai:
                result = service.review_song_with_ai(self.payload, self.request)
        self.assertEqual(len(result["segmentation_suggestions"]), 1)
        self.assertEqual(result["segmentation_suggestions"][0]["original_segments"], ["学校"])
        self.assertEqual(result["segmentation_suggestions"][0]["suggested_segments"], ["学", "校"])
        self.assertEqual(ai.call_args.args[2]["lines"][0]["tokens"][0]["reading"], "がっこう")

    def test_locked_or_mismatched_current_tokens_are_not_reviewed_as_new_boundaries(self):
        self.payload.lines[0].tokens[0].segmentation_locked = True
        with patch.object(service, "call_deepseek_json", return_value={"segmentation_suggestions": [
            {"line_id": 0, "start_token_index": 0, "end_token_index": 0,
             "suggested_segments": ["学", "校"], "confidence": 0.9},
        ]}):
            result = service.review_song_with_ai(self.payload, self.request)
        self.assertEqual(result["segmentation_suggestions"], [])
        self.payload.lines[0].tokens[0].surface = "学園"
        with self.assertRaises(HTTPException) as raised:
            service.review_song_with_ai(self.payload, self.request)
        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
