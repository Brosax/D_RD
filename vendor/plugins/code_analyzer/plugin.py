"""Code Analyzer Plugin entry point.

This plugin provides /analyze command for security audit of C/C++ firmware code.
AI drives the analysis workflow with multi-round verification.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
import uuid

from .scanner.file_discovery import FileDiscovery
from .scanner.file_parser import FileParser
from .rules.engine import RuleEngine
from .llm.local_client import LocalModelClient
from .report.json_exporter import JsonExporter
from .report.html_exporter import HtmlExporter
from .report.pdf_exporter import PdfExporter


@dataclass
class AnalysisConfig:
    target_path: str
    rules: Optional[List[str]] = None
    output_format: str = "json"
    output_path: Optional[str] = None
    severity_filter: Optional[str] = None


@dataclass
class Finding:
    vuln_id: str
    title: str
    confidence: str
    severity: str
    severity_rationale: str = ""
    description: str = ""
    evidence: List[Dict[str, str]] = field(default_factory=list)
    files_affected: List[str] = field(default_factory=list)
    attack_scenario: Dict[str, Any] = field(default_factory=dict)
    impact: Dict[str, str] = field(default_factory=dict)
    preconditions: List[str] = field(default_factory=list)
    fix_recommendation: str = ""
    patch_direction: str = ""
    verification: Dict[str, List[str]] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


@dataclass
class AnalysisResult:
    scan_id: str
    timestamp: str
    target_path: str
    analysis_rounds: List[Dict[str, Any]]
    summary: Dict[str, int]
    findings: List[Finding]


class CodeAnalyzerPlugin:
    """Main plugin class for code analysis."""

    def __init__(self):
        self.scanner = FileDiscovery()
        self.parser = FileParser()
        self.rule_engine = RuleEngine()
        self.llm_client = LocalModelClient()
        self.findings: List[Finding] = []
        self._vuln_counter = 1

    def command(self, args: List[str], context: Dict[str, Any]) -> Dict[str, Any]:
        """Main entry point for /analyze command.

        Args:
            args: Command arguments (first arg should be code path)
            context: Execution context including user info, session etc

        Returns:
            Dict with analysis results and suggested follow-up actions
        """
        if not args:
            return {
                "status": "error",
                "message": "Usage: /analyze <path_to_code>",
                "action_required": "Ask user to provide code path"
            }

        target_path = args[0]
        config = AnalysisConfig(target_path=target_path)

        # Phase 1: Discover and scan
        discovered_files = self.scanner.scan(target_path)
        if not discovered_files:
            return {
                "status": "error",
                "message": f"No C/C++ files found in {target_path}",
                "action_required": "Ask user to verify path"
            }

        # Phase 2: Rule engine scan (round 1)
        round1_results = []
        for file_path in discovered_files:
            content = self.parser.parse(file_path)
            if content:
                matches = self.rule_engine.scan(content, file_path, config.rules)
                round1_results.extend(matches)

        # Phase 3: LLM deep analysis (round 2) for suspicious findings
        round2_results = []
        if round1_results:
            for match in round1_results[:5]:  # Limit to avoid token overflow
                llm_analysis = self.llm_client.analyze_context(
                    code_snippet=match.get("snippet", ""),
                    context={"file": match.get("file"), "rule": match.get("rule_id")}
                )
                if llm_analysis:
                    round2_results.append(llm_analysis)

        # Convert to Findings
        self._convert_to_findings(round1_results, round2_results)

        # Generate summary
        summary = self._generate_summary()

        # Export results
        result = AnalysisResult(
            scan_id=str(uuid.uuid4()),
            timestamp=datetime.now().iso8601(),
            target_path=target_path,
            analysis_rounds=[
                {"round": 1, "tool": "rule_engine.scan", "findings": len(round1_results)},
                {"round": 2, "tool": "local_model.analyze_context", "findings": len(round2_results)}
            ],
            summary=summary,
            findings=self.findings
        )

        return self._format_response(result, config)

    def _convert_to_findings(self, round1: List[Dict], round2: List[Dict]):
        """Convert raw matches to Finding objects."""
        for match in round1:
            finding = Finding(
                vuln_id=f"VULN-S1-{self._vuln_counter:03d}",
                title=match.get("title", "Unknown issue"),
                confidence=match.get("confidence", "possible"),
                severity=match.get("severity", "medium"),
                severity_rationale=f"Detected by rule {match.get('rule_id')}",
                description=match.get("description", ""),
                evidence=[{
                    "file": match.get("file", ""),
                    "symbol": match.get("symbol", ""),
                    "lines": str(match.get("line", "")),
                    "snippet": match.get("snippet", "")
                }],
                files_affected=[match.get("file", "")],
                tags=[match.get("rule_id", "")]
            )
            self.findings.append(finding)
            self._vuln_counter += 1

    def _generate_summary(self) -> Dict[str, int]:
        """Generate summary counts by severity."""
        summary = {"total": len(self.findings), "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
        for f in self.findings:
            if f.severity in summary:
                summary[f.severity] += 1
        return summary

    def _format_response(self, result: AnalysisResult, config: AnalysisConfig) -> Dict[str, Any]:
        """Format analysis result for output."""
        if config.output_format == "json" or not config.output_path:
            exporter = JsonExporter()
            output = exporter.export(result)
            return {"status": "success", "data": output, "format": "json"}
        elif config.output_format == "html":
            exporter = HtmlExporter()
            output = exporter.export(result, config.output_path)
            return {"status": "success", "output_file": config.output_path, "format": "html"}
        elif config.output_format == "pdf":
            exporter = PdfExporter()
            output = exporter.export(result, config.output_path)
            return {"status": "success", "output_file": config.output_path, "format": "pdf"}
        return {"status": "error", "message": f"Unsupported format: {config.output_format}"}


# Plugin instance for CLI integration
plugin = CodeAnalyzerPlugin()


def execute(args: List[str], context: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the analyze command."""
    return plugin.command(args, context)