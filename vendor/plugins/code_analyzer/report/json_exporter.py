"""JSON exporter for analysis results."""

import json
from typing import Any, Dict
from ..plugin import AnalysisResult


class JsonExporter:
    """Export analysis results to JSON format."""

    def export(self, result: AnalysisResult) -> str:
        """Export result to JSON string.

        Args:
            result: AnalysisResult to export

        Returns:
            JSON string
        """
        data = {
            "scan_id": result.scan_id,
            "timestamp": result.timestamp,
            "target_path": result.target_path,
            "analysis_rounds": result.analysis_rounds,
            "summary": result.summary,
            "findings": [
                {
                    "vuln_id": f.vuln_id,
                    "title": f.title,
                    "confidence": f.confidence,
                    "severity": f.severity,
                    "severity_rationale": f.severity_rationale,
                    "description": f.description,
                    "evidence": f.evidence,
                    "files_affected": f.files_affected,
                    "attack_scenario": f.attack_scenario,
                    "impact": f.impact,
                    "preconditions": f.preconditions,
                    "fix_recommendation": f.fix_recommendation,
                    "patch_direction": f.patch_direction,
                    "verification": f.verification,
                    "tags": f.tags
                }
                for f in result.findings
            ]
        }
        return json.dumps(data, indent=2, ensure_ascii=False)

    def export_to_file(self, result: AnalysisResult, file_path: str):
        """Export result to JSON file."""
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(self.export(result))