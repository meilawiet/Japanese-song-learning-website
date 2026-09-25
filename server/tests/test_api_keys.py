"""Offline checks for request-local DeepSeek credentials and safe errors."""

import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib import error as urllib_error

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as service  # noqa: E402


class DeepSeekApiKeyTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"DEEPSEEK_API_KEY": "server-test-key"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        service.AI_CACHE.clear()
        service.AI_REQUESTS.clear()
        self.addCleanup(service.AI_CACHE.clear)
        self.addCleanup(service.AI_REQUESTS.clear)

    @staticmethod
    def upstream_response(*_args, **_kwargs):
        result = {
            "suggestions": [],
            "explanations": [{"line_id": 1, "meaning": "梦"}],
            "term": "夢",
        }
        return io.BytesIO(json.dumps({
            "choices": [{"message": {"content": json.dumps(result)}}],
        }).encode("utf-8"))

    @staticmethod
    def call_ai(api_key=None, payload=None):
        return service.call_deepseek_json(
            "test", "Explain this word", payload or {"word": "夢"},
            client_host="127.0.0.1", max_tokens=100, api_key=api_key,
        )

    @staticmethod
    def request(api_key=None):
        headers = [] if api_key is None else [(b"x-deepseek-api-key", api_key.encode("latin-1"))]
        return Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": headers})

    @staticmethod
    def routes():
        return [
            (service.review_song_with_ai, service.SongReviewRequest(
                song_id="test", title="Test song", lines=[service.LyricLine(id=1, text="夢")],
            )),
            (service.explain_sentences_with_ai, service.ExplainSentenceBatchRequest(
                lines=[service.SentenceContextLine(id=1, text="夢")],
            )),
            (service.explain_selection_with_ai, service.ExplainSelectionRequest(
                selection="夢", line_text="夢",
            )),
        ]

    @staticmethod
    def annotation():
        return [service.AnnotationToken(
            index=0, surface="夢", reading="ゆめ", base="夢", ruby="ゆめ", suffix="",
            part_of_speech="名詞", dictionary_form="夢", normalized_form="夢",
            inflection_type="無活用", inflection_form="基本形", needs_review=False,
        )]

    def test_browser_key_overrides_environment_for_one_request_only(self):
        with patch.object(service.urllib_request, "urlopen", side_effect=self.upstream_response) as upstream:
            self.call_ai("  browser-test-key  ")
            self.call_ai(payload={"word": "空"})
            self.call_ai("another-browser-key", payload={"word": "花"})
        requests = [call.args[0] for call in upstream.call_args_list]
        self.assertEqual([request.get_header("Authorization") for request in requests], [
            "Bearer browser-test-key", "Bearer server-test-key", "Bearer another-browser-key",
        ])
        self.assertEqual(os.environ["DEEPSEEK_API_KEY"], "server-test-key")
        for request in requests:
            self.assertEqual(request.full_url, "https://api.deepseek.com/chat/completions")
            self.assertNotIn(b"test-key", request.data)
        self.assertNotIn("browser-test-key", repr(service.AI_CACHE))
        self.assertNotIn("browser-test-key", repr(service.AI_REQUESTS))

    def test_absent_and_blank_browser_keys_fall_back_to_environment(self):
        for browser_key in (None, "", "   "):
            with self.subTest(browser_key=browser_key):
                service.AI_CACHE.clear()
                with patch.object(service.urllib_request, "urlopen", side_effect=self.upstream_response) as upstream:
                    self.call_ai(browser_key)
                self.assertEqual(upstream.call_args.args[0].get_header("Authorization"), "Bearer server-test-key")

    def test_browser_key_works_without_server_configuration(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}):
            with patch.object(service.urllib_request, "urlopen", side_effect=self.upstream_response) as upstream:
                self.call_ai("browser-test-key")
        self.assertEqual(upstream.call_args.args[0].get_header("Authorization"), "Bearer browser-test-key")

    def test_missing_key_error_explains_both_configuration_options(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}):
            with patch.object(service.urllib_request, "urlopen") as upstream:
                with self.assertRaises(HTTPException) as raised:
                    self.call_ai()
        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("设置", raised.exception.detail)
        self.assertIn("server/.env", raised.exception.detail)
        upstream.assert_not_called()

    def test_malformed_keys_are_rejected_without_echoing_or_calling_upstream(self):
        for browser_key in ("secret\r\nInjected: value", "secret\x00value", "secret\tvalue", "secret value", "secret-é", "s" * 513):
            with self.subTest(browser_key=repr(browser_key)):
                with patch.object(service.urllib_request, "urlopen") as upstream:
                    with self.assertRaises(HTTPException) as raised:
                        self.call_ai(browser_key)
                self.assertEqual(raised.exception.status_code, 422)
                self.assertNotIn(browser_key, raised.exception.detail)
                upstream.assert_not_called()

    def test_maximum_length_key_is_accepted(self):
        with patch.object(service.urllib_request, "urlopen", side_effect=self.upstream_response) as upstream:
            self.call_ai("s" * 512)
        self.assertEqual(upstream.call_args.args[0].get_header("Authorization"), "Bearer " + "s" * 512)

    def test_cached_result_does_not_skip_key_validation(self):
        service.set_cached_ai_result(service.ai_cache_key("test", {"word": "夢"}), {"cached": True})
        with patch.object(service.urllib_request, "urlopen") as upstream:
            with self.assertRaises(HTTPException) as raised:
                self.call_ai("secret\x00value")
        self.assertEqual(raised.exception.status_code, 422)
        upstream.assert_not_called()

    def test_all_ai_routes_forward_browser_key_and_keep_it_out_of_results(self):
        for route, payload in self.routes():
            with self.subTest(route=route.__name__):
                service.AI_CACHE.clear()
                with patch.object(service, "annotate_text", return_value=self.annotation()):
                    with patch.object(service.urllib_request, "urlopen", side_effect=self.upstream_response) as upstream:
                        result = route(payload, self.request("browser-test-key"))
                self.assertEqual(upstream.call_args.args[0].get_header("Authorization"), "Bearer browser-test-key")
                self.assertNotIn("browser-test-key", json.dumps(result))
                self.assertNotIn("server-test-key", json.dumps(result))

    def test_all_ai_routes_reject_malformed_header(self):
        for route, payload in self.routes():
            with self.subTest(route=route.__name__):
                with patch.object(service, "annotate_text", return_value=self.annotation()):
                    with patch.object(service.urllib_request, "urlopen") as upstream:
                        with self.assertRaises(HTTPException) as raised:
                            route(payload, self.request("secret\x00value"))
                self.assertEqual(raised.exception.status_code, 422)
                self.assertNotIn("secret", raised.exception.detail)
                upstream.assert_not_called()

    def test_upstream_errors_and_health_do_not_expose_credentials(self):
        errors = [
            (urllib_error.HTTPError(service.DEEPSEEK_API_URL, status, "browser-test-key", {}, None), expected)
            for status, expected in ((401, 503), (403, 503), (429, 429), (500, 502))
        ]
        errors.append((urllib_error.URLError("browser-test-key"), 502))
        for error, expected_status in errors:
            with self.subTest(error=type(error).__name__, status=expected_status):
                with patch.object(service.urllib_request, "urlopen", side_effect=error):
                    with self.assertRaises(HTTPException) as raised:
                        self.call_ai("browser-test-key")
                self.assertEqual(raised.exception.status_code, expected_status)
                self.assertNotIn("browser-test-key", raised.exception.detail)
                self.assertNotIn("server-test-key", raised.exception.detail)
        self.assertEqual(set(service.health()), {"status", "tomoshi_dictionary"})
        self.assertNotIn("test-key", json.dumps(service.health()))


if __name__ == "__main__":
    unittest.main()
