"""Local model client for deep code analysis."""

import json
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class LocalModelClient:
    """Client for local LLM integration."""

    def __init__(self, endpoint: Optional[str] = None, model: str = "local"):
        self.endpoint = endpoint or "http://localhost:11434"
        self.model = model
        self.available = self._check_availability()

    def _check_availability(self) -> bool:
        """Check if local model is available."""
        try:
            import requests
            response = requests.get(f"{self.endpoint}/api/tags", timeout=5)
            return response.status_code == 200
        except Exception:
            logger.warning("Local model not available, will use rule engine only")
            return False

    def analyze_context(
        self,
        code_snippet: str,
        context: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Analyze code snippet for security issues.

        Args:
            code_snippet: Code to analyze
            context: Context information (file, rule, etc)

        Returns:
            Analysis result or None if model unavailable
        """
        if not self.available:
            return None

        try:
            prompt = self._build_analysis_prompt(code_snippet, context)
            response = self._call_model(prompt)
            return self._parse_analysis_response(response, context)
        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            return None

    def detect_pattern(
        self,
        code: str,
        pattern_type: str
    ) -> Optional[Dict[str, Any]]:
        """Detect specific pattern type in code.

        Args:
            code: Code to analyze
            pattern_type: Type of pattern (e.g., "crypto_usage", "memory_safety")

        Returns:
            Detection result or None
        """
        if not self.available:
            return None

        try:
            prompt = f"""Analyze this code for {pattern_type} issues:

```{code}```

Return JSON with:
- findings: list of issues found
- severity: overall severity
- confidence: confidence level (likely/possible/unclear)
"""
            response = self._call_model(prompt)
            return json.loads(response)
        except Exception as e:
            logger.error(f"Pattern detection failed: {e}")
            return None

    def _build_analysis_prompt(
        self,
        code_snippet: str,
        context: Dict[str, Any]
    ) -> str:
        """Build analysis prompt for the model."""
        rule_id = context.get("rule", "unknown")
        file_path = context.get("file", "unknown")

        return f"""You are a security expert analyzing C/C++ code for SESIP compliance.

Rule triggered: {rule_id}
File: {file_path}

Code snippet:
```{code_snippet}```

Analyze this code and return a JSON object with:
{{
    "confidence": "likely" | "possible" | "unclear",
    "severity": "critical" | "high" | "medium" | "low" | "informational",
    "description": "What the issue is and why it's a concern",
    "impact": {{"confidentiality": "...", "integrity": "...", "availability": "..."}},
    "attack_scenario": {{"entry_point": "...", "trigger_steps": [...]}},
    "preconditions": ["list of required conditions"],
    "remediation": "How to fix this issue",
    "verification": {{"tests": [], "code_checks": [], "runtime_checks": []}}
}}

If no issue found, return:
{{"confidence": "unlikely", "severity": "informational", "description": "Code appears safe", "remediation": ""}}
"""

    def _call_model(self, prompt: str) -> str:
        """Call local model API."""
        import requests

        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 512}
        }

        response = requests.post(
            f"{self.endpoint}/api/generate",
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        return response.json().get("response", "")

    def _parse_analysis_response(
        self,
        response: str,
        context: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Parse model response into finding format."""
        try:
            # Try to extract JSON from response
            import re
            json_match = re.search(r"\{.*\}", response, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

        # Fallback: create finding from raw response
        return {
            "confidence": "possible",
            "severity": "medium",
            "description": response[:500],
            "remediation": "Review manually",
            "context": context
        }

    def validate_finding(
        self,
        finding: Dict[str, Any],
        source_code: str
    ) -> Dict[str, Any]:
        """Validate a finding against source code for false positives.

        Args:
            finding: The finding to validate
            source_code: Original source code

        Returns:
            Validation result with revised confidence/severity
        """
        if not self.available:
            return finding

        prompt = f"""Review this security finding for false positives:

Finding:
{json.dumps(finding, indent=2)}

Source code snippet:
{source_code}

Check:
1. Does the evidence (file, symbol, lines) exist in the code?
2. Can untrusted input actually reach this code?
3. Is the API used as claimed, or are there mitigations?
4. Are preconditions realistic?

Return JSON:
{{
    "validation_result": "confirmed" | "partially_supported" | "false_positive" | "hallucination",
    "revised_confidence": "likely" | "possible" | "unclear",
    "revised_severity": "critical" | "high" | "medium" | "low" | "informational",
    "reasoning": "explanation",
    "failed_assumptions": ["list of assumptions that failed"]
}}
"""
        try:
            response = self._call_model(prompt)
            return json.loads(response)
        except Exception:
            return finding