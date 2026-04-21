"""Rule engine for scanning source code against SESIP rules."""

import re
import yaml
from pathlib import Path
from typing import List, Dict, Optional, Any


class RuleEngine:
    """Scan source code against SESIP security rules."""

    def __init__(self, rules_file: Optional[str] = None):
        if rules_file is None:
            rules_file = self._get_default_rules_path()
        self.rules = self._load_rules(rules_file)

    def _get_default_rules_path(self) -> str:
        """Get default rules file path."""
        plugin_dir = Path(__file__).parent
        return str(plugin_dir / "sesip_rules.yaml")

    def _load_rules(self, rules_file: str) -> List[Dict[str, Any]]:
        """Load rules from YAML file."""
        try:
            with open(rules_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                return data.get("rules", [])
        except (IOError, yaml.YAMLError):
            return []

    def scan(self, content: str, file_path: str, rule_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Scan content against rules.

        Args:
            content: Source file content
            file_path: Path to source file (for error reporting)
            rule_ids: Optional list of rule IDs to check (None = all rules)

        Returns:
            List of rule match results
        """
        results = []
        lines = content.split("\n")

        for rule in self.rules:
            if rule_ids and rule["id"] not in rule_ids:
                continue

            for pattern in rule.get("patterns", []):
                matches = self._find_pattern_matches(content, lines, pattern, rule, file_path)
                results.extend(matches)

        return results

    def _find_pattern_matches(
        self,
        content: str,
        lines: List[str],
        pattern: str,
        rule: Dict[str, Any],
        file_path: str
    ) -> List[Dict[str, Any]]:
        """Find all matches of a pattern in content."""
        matches = []
        regex = re.compile(pattern, re.IGNORECASE)

        for line_num, line in enumerate(lines, 1):
            match = regex.search(line)
            if match:
                # Check false positives
                if self._is_false_positive(rule, line, match.group()):
                    continue

                # Get context lines
                start_line = max(0, line_num - 4)
                end_line = min(len(lines), line_num + 2)
                context = "\n".join(lines[start_line:end_line])

                matches.append({
                    "rule_id": rule["id"],
                    "title": rule["name"],
                    "severity": rule.get("severity", "medium"),
                    "confidence": self._determine_confidence(rule, line),
                    "description": rule.get("description", ""),
                    "file": file_path,
                    "line": line_num,
                    "snippet": line.strip(),
                    "context": context,
                    "remediation": rule.get("remediation", ""),
                    "category": rule.get("category", "")
                })

        return matches

    def _is_false_positive(self, rule: Dict[str, Any], line: str, match: str) -> bool:
        """Check if match is a false positive."""
        false_positives = rule.get("false_positives", [])
        for fp in false_positives:
            if fp in line:
                return True
        return False

    def _determine_confidence(self, rule: Dict[str, Any], line: str) -> str:
        """Determine confidence level of match."""
        # Check if context indicators are present
        if "in_security_context" in rule:
            context_required = rule["in_security_context"]
            for indicator in context_required:
                if indicator.lower() in line.lower():
                    return "likely"
            return "possible"

        if rule.get("requires_context"):
            return "possible"

        # Check for clear vulnerable patterns
        if any(p in line.lower() for p in ["hardcoded", "password", "key", "secret"]):
            return "likely"

        return "possible"

    def check_sesip(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Run full SESIP compliance check."""
        return self.scan(content, file_path)