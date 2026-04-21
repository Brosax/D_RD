"""HTML exporter for analysis results."""

from pathlib import Path
from typing import Optional
from ..plugin import AnalysisResult


class HtmlExporter:
    """Export analysis results to HTML format."""

    HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SESIP Security Analysis Report</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }}
        .header {{
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            color: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 20px;
        }}
        .header h1 {{ margin: 0 0 10px 0; }}
        .meta {{ opacity: 0.8; font-size: 14px; }}
        .summary {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }}
        .summary-card {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .summary-card .number {{
            font-size: 36px;
            font-weight: bold;
        }}
        .summary-card .label {{
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
        }}
        .critical {{ color: #dc2626; }}
        .high {{ color: #ea580c; }}
        .medium {{ color: #ca8a04; }}
        .low {{ color: #65a30d; }}
        .finding {{
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid {severity_color};
        }}
        .finding-header {{
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 10px;
        }}
        .vuln-id {{
            background: #e5e7eb;
            padding: 4px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
        }}
        .severity-badge {{
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            color: white;
            background: {severity_color};
        }}
        .confidence {{
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }}
        .evidence {{
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 10px;
            font-family: monospace;
            font-size: 12px;
            overflow-x: auto;
        }}
        .remediation {{
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 4px;
            padding: 10px;
            margin-top: 10px;
        }}
        .remediation h4 {{ margin: 0 0 5px 0; color: #059669; }}
        .tags {{ margin-top: 10px; }}
        .tag {{
            display: inline-block;
            background: #dbeafe;
            color: #1e40af;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            margin-right: 5px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>SESIP Security Analysis Report</h1>
        <div class="meta">
            <div>Scan ID: {scan_id}</div>
            <div>Target: {target_path}</div>
            <div>Generated: {timestamp}</div>
        </div>
    </div>

    <div class="summary">
        <div class="summary-card">
            <div class="number">{total}</div>
            <div class="label">Total Findings</div>
        </div>
        <div class="summary-card">
            <div class="number critical">{critical}</div>
            <div class="label">Critical</div>
        </div>
        <div class="summary-card">
            <div class="number high">{high}</div>
            <div class="label">High</div>
        </div>
        <div class="summary-card">
            <div class="number medium">{medium}</div>
            <div class="label">Medium</div>
        </div>
        <div class="summary-card">
            <div class="number low">{low}</div>
            <div class="label">Low</div>
        </div>
    </div>

    <div class="findings">
        {findings_html}
    </div>
</body>
</html>"""

    FINDING_TEMPLATE = """
    <div class="finding">
        <div class="finding-header">
            <div>
                <span class="vuln-id">{vuln_id}</span>
                <h3>{title}</h3>
            </div>
            <span class="severity-badge">{severity}</span>
        </div>
        <div class="confidence">Confidence: {confidence}</div>
        <p>{description}</p>
        <h4>Evidence:</h4>
        <div class="evidence">
            <div><strong>File:</strong> {file}</div>
            <div><strong>Line:</strong> {line}</div>
            <pre>{snippet}</pre>
        </div>
        {remediation_html}
        <div class="tags">
            {tags_html}
        </div>
    </div>
    """

    SEVERITY_COLORS = {
        "critical": "#dc2626",
        "high": "#ea580c",
        "medium": "#ca8a04",
        "low": "#65a30d",
        "informational": "#6b7280"
    }

    def export(self, result: AnalysisResult, output_path: Optional[str] = None) -> str:
        """Export result to HTML.

        Args:
            result: AnalysisResult to export
            output_path: Optional path to save HTML file

        Returns:
            HTML string
        """
        findings_html = self._render_findings(result.findings)

        html = self.HTML_TEMPLATE.format(
            scan_id=result.scan_id,
            target_path=result.target_path,
            timestamp=result.timestamp,
            total=result.summary.get("total", 0),
            critical=result.summary.get("critical", 0),
            high=result.summary.get("high", 0),
            medium=result.summary.get("medium", 0),
            low=result.summary.get("low", 0),
            findings_html=findings_html
        )

        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(html)

        return html

    def _render_findings(self, findings) -> str:
        """Render findings as HTML."""
        if not findings:
            return "<p>No findings.</p>"

        html_parts = []
        for f in findings:
            severity_color = self.SEVERITY_COLORS.get(f.severity, "#6b7280")

            remediation_html = ""
            if f.fix_recommendation:
                remediation_html = f"""
                <div class="remediation">
                    <h4>Remediation</h4>
                    <p>{f.fix_recommendation}</p>
                </div>
                """

            tags_html = "".join(f'<span class="tag">{tag}</span>' for tag in f.tags)

            evidence = f.evidence[0] if f.evidence else {}

            finding_html = self.FINDING_TEMPLATE.format(
                vuln_id=f.vuln_id,
                title=f.title,
                severity=f.severity.upper(),
                severity_color=severity_color,
                confidence=f.confidence,
                description=f.description or "No description provided.",
                file=evidence.get("file", "unknown"),
                line=evidence.get("lines", "?"),
                snippet=evidence.get("snippet", ""),
                remediation_html=remediation_html,
                tags_html=tags_html
            )
            html_parts.append(finding_html)

        return "\n".join(html_parts)