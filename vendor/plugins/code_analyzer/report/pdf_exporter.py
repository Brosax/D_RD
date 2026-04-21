"""PDF exporter for analysis results."""

from typing import Optional
from pathlib import Path
from ..plugin import AnalysisResult


class PdfExporter:
    """Export analysis results to PDF format."""

    def export(self, result: AnalysisResult, output_path: Optional[str] = None) -> bytes:
        """Export result to PDF.

        Args:
            result: AnalysisResult to export
            output_path: Optional path to save PDF file

        Returns:
            PDF as bytes
        """
        try:
            from reportlab.lib.pagesizes import letter, A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.lib.colors import HexColor
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
            from reportlab.lib import colors
        except ImportError:
            raise ImportError("reportlab is required for PDF export: pip install reportlab")

        if output_path:
            doc = SimpleDocTemplate(output_path, pagesize=A4)
        else:
            doc = SimpleDocTemplate(None, pagesize=A4)

        styles = getSampleStyleSheet()
        story = []

        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=HexColor('#1a1a2e'),
            spaceAfter=20
        )
        story.append(Paragraph("SESIP Security Analysis Report", title_style))
        story.append(Spacer(1, 0.2 * inch))

        # Meta info
        meta_style = styles['Normal']
        meta_style.textColor = HexColor('#666666')
        story.append(Paragraph(f"Scan ID: {result.scan_id}", meta_style))
        story.append(Paragraph(f"Target: {result.target_path}", meta_style))
        story.append(Paragraph(f"Generated: {result.timestamp}", meta_style))
        story.append(Spacer(1, 0.3 * inch))

        # Summary table
        summary_data = [
            ['Total', 'Critical', 'High', 'Medium', 'Low'],
            [
                str(result.summary.get('total', 0)),
                str(result.summary.get('critical', 0)),
                str(result.summary.get('high', 0)),
                str(result.summary.get('medium', 0)),
                str(result.summary.get('low', 0))
            ]
        ]
        summary_table = Table(summary_data, colWidths=[1.2 * inch] * 5)
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#e5e7eb')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('BACKGROUND', (1, 1), (1, 1), HexColor('#dc2626')),  # critical
            ('BACKGROUND', (2, 1), (2, 1), HexColor('#ea580c')),  # high
            ('BACKGROUND', (3, 1), (3, 1), HexColor('#ca8a04')),  # medium
            ('BACKGROUND', (4, 1), (4, 1), HexColor('#65a30d')),  # low
            ('TEXTCOLOR', (1, 1), (1, 1), colors.white),
            ('TEXTCOLOR', (2, 1), (2, 1), colors.white),
            ('TEXTCOLOR', (3, 1), (3, 1), colors.white),
            ('TEXTCOLOR', (4, 1), (4, 1), colors.white),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 0.3 * inch))

        # Findings
        for finding in result.findings:
            severity_colors = {
                'critical': HexColor('#dc2626'),
                'high': HexColor('#ea580c'),
                'medium': HexColor('#ca8a04'),
                'low': HexColor('#65a30d'),
                'informational': HexColor('#6b7280')
            }
            severity_color = severity_colors.get(finding.severity, colors.grey)

            # Finding header
            finding_style = ParagraphStyle(
                'Finding',
                parent=styles['Heading2'],
                fontSize=14,
                textColor=severity_color,
                spaceBefore=15,
                spaceAfter=5
            )
            story.append(Paragraph(
                f"{finding.vuln_id}: {finding.title}",
                finding_style
            ))

            # Severity and confidence
            story.append(Paragraph(
                f"<b>Severity:</b> {finding.severity.upper()} | <b>Confidence:</b> {finding.confidence}",
                styles['Normal']
            ))

            # Description
            if finding.description:
                story.append(Paragraph(f"<b>Description:</b> {finding.description}", styles['Normal']))

            # Evidence
            if finding.evidence:
                evidence = finding.evidence[0]
                story.append(Spacer(1, 0.1 * inch))
                story.append(Paragraph("<b>Evidence:</b>", styles['Normal']))
                evidence_text = f"File: {evidence.get('file', 'unknown')}, Line: {evidence.get('lines', '?')}"
                story.append(Paragraph(evidence_text, styles['Normal']))
                if evidence.get('snippet'):
                    snippet_style = ParagraphStyle(
                        'Snippet',
                        parent=styles['Code'],
                        fontSize=9,
                        backColor=HexColor('#f8fafc'),
                        borderColor=HexColor('#e2e8f0'),
                        borderWidth=1,
                        borderPadding=5
                    )
                    story.append(Paragraph(evidence.get('snippet')[:200], snippet_style))

            # Remediation
            if finding.fix_recommendation:
                story.append(Spacer(1, 0.1 * inch))
                story.append(Paragraph("<b>Remediation:</b>", styles['Normal']))
                story.append(Paragraph(finding.fix_recommendation, styles['Normal']))

            story.append(Spacer(1, 0.2 * inch))

        # Build PDF
        import io
        buffer = io.BytesIO()
        doc.build(buffer)
        pdf_bytes = buffer.getvalue()

        if output_path:
            with open(output_path, 'wb') as f:
                f.write(pdf_bytes)

        return pdf_bytes