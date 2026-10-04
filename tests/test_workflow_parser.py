"""Unit tests for workflow_parser.py."""

import unittest
from pydantic import BaseModel

from workflow_parser import parse_agent_output, clean_json_syntax, extract_json_candidate


class MockOpportunityModel(BaseModel):
    company_name: str
    confidence: float
    is_explicit: bool = True


class TestWorkflowParser(unittest.TestCase):

    def test_none_returns_none(self):
        self.assertIsNone(parse_agent_output(None))

    def test_empty_string_returns_none(self):
        self.assertIsNone(parse_agent_output(""))
        self.assertIsNone(parse_agent_output("   \n\t  "))

    def test_dict_returns_dict(self):
        sample = {"company_name": "Notion", "confidence": 0.95}
        result = parse_agent_output(sample)
        self.assertEqual(result, sample)

    def test_pydantic_model_returns_dict(self):
        model = MockOpportunityModel(company_name="Linear", confidence=0.88)
        result = parse_agent_output(model)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["company_name"], "Linear")
        self.assertEqual(result["confidence"], 0.88)
        self.assertTrue(result["is_explicit"])

    def test_valid_json_string(self):
        raw = '{"company_name": "Supabase", "status": "COMPLETED", "score": 90}'
        result = parse_agent_output(raw)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["company_name"], "Supabase")
        self.assertEqual(result["score"], 90)

    def test_markdown_fenced_json(self):
        raw = """```json
{
  "company_name": "Raycast",
  "category": "Productivity"
}
```"""
        result = parse_agent_output(raw)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["company_name"], "Raycast")

    def test_markdown_fenced_with_surrounding_text(self):
        raw = """Here is the structured research output for the company:
```json
{
  "company_name": "Vercel",
  "summary": "Cloud platform for frontend developers."
}
```
Please let me know if you need further adjustments."""
        result = parse_agent_output(raw)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["company_name"], "Vercel")
        self.assertEqual(result["summary"], "Cloud platform for frontend developers.")

    def test_trailing_comma_syntax_recovery(self):
        raw = """{
  "company_name": "Figma",
  "tags": ["design", "ui", "collaboration",],
  "verified": true,
}"""
        result = parse_agent_output(raw)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["company_name"], "Figma")
        self.assertEqual(len(result["tags"]), 3)

    def test_python_dict_literal_with_single_quotes(self):
        raw = "{'company_name': 'Postman', 'is_explicit_opportunity': True, 'why_now': None}"
        result = parse_agent_output(raw)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["company_name"], "Postman")
        self.assertIs(result["is_explicit_opportunity"], True)
        self.assertIsNone(result["why_now"])

    def test_bare_list_wraps_in_opportunities(self):
        raw_list = [{"company_name": "Stripe"}, {"company_name": "Adyen"}]
        result_from_list = parse_agent_output(raw_list)
        self.assertEqual(result_from_list, {"opportunities": raw_list})

        raw_str_list = '[{"company_name": "Stripe"}, {"company_name": "Adyen"}]'
        result_from_str = parse_agent_output(raw_str_list)
        self.assertEqual(result_from_str, {"opportunities": raw_list})

    def test_unparseable_string_returns_none(self):
        raw = "I apologize, but I could not find any relevant information for this request."
        result = parse_agent_output(raw)
        self.assertIsNone(result)

    def test_clean_json_syntax(self):
        self.assertEqual(clean_json_syntax('{"a": 1,}'), '{"a": 1}')
        self.assertEqual(clean_json_syntax('[1, 2, 3, ]'), '[1, 2, 3]')

    def test_extract_json_candidate_out_of_prose(self):
        text = "Random preamble { \"key\": \"value\" } trailing remarks"
        candidate = extract_json_candidate(text)
        self.assertEqual(candidate, '{ "key": "value" }')


if __name__ == "__main__":
    unittest.main()
