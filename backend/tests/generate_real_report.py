"""
Generate test_report.pdf from REAL pytest output.

Workflow:
  1. Run pytest with --junitxml to capture real results
  2. Parse the XML — every test name, status, duration is real
  3. Render PDF (no hardcoded PASSED strings anywhere)

Run from backend/:
    /Users/wcy/miniconda3/envs/code/bin/python tests/generate_real_report.py
"""
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

BACKEND  = Path(__file__).resolve().parent.parent
JUNIT    = BACKEND / "tests" / "junit_results.xml"
PDF_OUT  = BACKEND / "tests" / "test_report.pdf"
PYTEST   = "/Users/wcy/miniconda3/envs/code/bin/pytest"


# ── 1. Run pytest, capture real junit XML ───────────────────────────
def run_pytest():
    print(f"[1/3] Running pytest → {JUNIT}")
    cmd = [
        PYTEST,
        "tests/",
        f"--junitxml={JUNIT}",
        "--tb=no", "-q",
        "--ignore=tests/test_ai_accuracy.py",   # opt-in, $$
    ]
    proc = subprocess.run(cmd, cwd=BACKEND, capture_output=True, text=True)
    print(proc.stdout[-2000:])
    if proc.returncode not in (0, 1):     # 1 = some tests failed (still want report)
        print("pytest crashed:", proc.stderr[-1000:])
        sys.exit(proc.returncode)
    return proc


# ── 2. Parse XML ────────────────────────────────────────────────────
def parse_junit():
    print(f"[2/3] Parsing {JUNIT}")
    tree = ET.parse(JUNIT)
    root = tree.getroot()
    suite = root.find("testsuite") if root.tag == "testsuites" else root

    summary = {
        "tests":    int(suite.get("tests", 0)),
        "failures": int(suite.get("failures", 0)),
        "errors":   int(suite.get("errors", 0)),
        "skipped":  int(suite.get("skipped", 0)),
        "time":     float(suite.get("time", 0)),
        "timestamp": suite.get("timestamp", ""),
    }
    summary["passed"] = (
        summary["tests"] - summary["failures"]
        - summary["errors"] - summary["skipped"]
    )

    cases = []
    for tc in suite.findall("testcase"):
        status = "PASSED"
        if tc.find("failure") is not None: status = "FAILED"
        elif tc.find("error")   is not None: status = "ERROR"
        elif tc.find("skipped") is not None: status = "SKIPPED"
        cases.append({
            "file":      tc.get("classname", ""),
            "name":      tc.get("name", ""),
            "time":      float(tc.get("time", 0)),
            "status":    status,
        })
    return summary, cases


# ── 3. Render PDF ───────────────────────────────────────────────────
def render_pdf(summary, cases):
    print(f"[3/3] Rendering {PDF_OUT}")
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

    styles = getSampleStyleSheet()
    H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="STSong-Light",
                        fontSize=18, spaceAfter=12)
    H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="STSong-Light",
                        fontSize=14, spaceAfter=8, textColor=colors.HexColor("#1F4E79"))
    BODY = ParagraphStyle("Body", parent=styles["BodyText"], fontName="STSong-Light",
                          fontSize=10, leading=14)
    DIM = ParagraphStyle("Dim", parent=BODY, textColor=colors.grey, fontSize=9)

    doc = SimpleDocTemplate(
        str(PDF_OUT), pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm,
    )
    story = []

    # ── Header ──
    story.append(Paragraph("CampusTrade Backend Test Report", H1))
    story.append(Paragraph(
        f"Generated automatically from pytest --junitxml output<br/>"
        f"Run timestamp: <b>{summary['timestamp'] or datetime.now().isoformat()}</b><br/>"
        f"Source XML: <font face='Courier'>{JUNIT.name}</font>",
        DIM))
    story.append(Spacer(1, 12))

    # ── Summary ──
    story.append(Paragraph("1. Run Summary", H2))
    pass_pct = (summary["passed"] / summary["tests"] * 100) if summary["tests"] else 0
    summary_data = [
        ["Metric", "Count"],
        ["Total tests collected", str(summary["tests"])],
        ["Passed",   str(summary["passed"])],
        ["Failed",   str(summary["failures"])],
        ["Errors",   str(summary["errors"])],
        ["Skipped",  str(summary["skipped"])],
        ["Pass rate", f"{pass_pct:.2f}%"],
        ["Wall-clock duration", f"{summary['time']:.2f} s"],
    ]
    t = Table(summary_data, colWidths=[6*cm, 4*cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "STSong-Light"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D5E8F0")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TEXTCOLOR", (1, 2), (1, 2), colors.green),
        ("TEXTCOLOR", (1, 3), (1, 4),
         colors.red if (summary["failures"] + summary["errors"]) else colors.grey),
        ("TEXTCOLOR", (1, 5), (1, 5), colors.orange),
    ]))
    story.append(t)
    story.append(Spacer(1, 16))

    # ── Per-file breakdown ──
    by_file = {}
    for c in cases:
        f = c["file"].split(".")[-1] + ".py" if "." in c["file"] else c["file"]
        by_file.setdefault(f, []).append(c)

    story.append(Paragraph("2. Per-file Breakdown", H2))
    file_rows = [["Test file", "Tests", "Passed", "Failed", "Skipped", "Time (s)"]]
    for fname in sorted(by_file):
        items = by_file[fname]
        passed = sum(1 for x in items if x["status"] == "PASSED")
        failed = sum(1 for x in items if x["status"] in ("FAILED", "ERROR"))
        skipped = sum(1 for x in items if x["status"] == "SKIPPED")
        total_t = sum(x["time"] for x in items)
        file_rows.append([
            fname, str(len(items)), str(passed),
            str(failed), str(skipped), f"{total_t:.2f}"
        ])
    t = Table(file_rows, colWidths=[6*cm, 1.6*cm, 1.6*cm, 1.6*cm, 1.6*cm, 2*cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "STSong-Light"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D5E8F0")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
    ]))
    story.append(t)
    story.append(PageBreak())

    # ── All test cases (real, parsed) ──
    story.append(Paragraph("3. All Test Cases (parsed from JUnit XML)", H2))
    story.append(Paragraph(
        "Every row below was extracted from the pytest run. "
        "<b>No PASSED string is hardcoded</b> — the status column reflects the actual "
        "outcome reported by pytest.", BODY))
    story.append(Spacer(1, 8))

    case_rows = [["#", "File", "Test name", "Status", "Time (s)"]]
    for i, c in enumerate(cases, 1):
        fname = c["file"].split(".")[-1]
        case_rows.append([
            str(i), fname, c["name"], c["status"], f"{c['time']:.3f}"
        ])
    t = Table(case_rows, colWidths=[0.8*cm, 4*cm, 8*cm, 1.8*cm, 1.4*cm], repeatRows=1)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "STSong-Light"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D5E8F0")),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    # Color status column by real status
    for i, c in enumerate(cases, 1):
        if c["status"] == "PASSED":
            style.append(("TEXTCOLOR", (3, i), (3, i), colors.green))
        elif c["status"] in ("FAILED", "ERROR"):
            style.append(("TEXTCOLOR", (3, i), (3, i), colors.red))
        elif c["status"] == "SKIPPED":
            style.append(("TEXTCOLOR", (3, i), (3, i), colors.orange))
    t.setStyle(TableStyle(style))
    story.append(t)

    doc.build(story)
    print(f"      ✓ Wrote {PDF_OUT}  ({PDF_OUT.stat().st_size//1024} KB)")


if __name__ == "__main__":
    run_pytest()
    summary, cases = parse_junit()
    render_pdf(summary, cases)
    print()
    print(f"DONE. Real numbers:")
    print(f"  passed  : {summary['passed']}")
    print(f"  failed  : {summary['failures']}")
    print(f"  errors  : {summary['errors']}")
    print(f"  skipped : {summary['skipped']}")
    print(f"  total   : {summary['tests']}")
    print(f"  duration: {summary['time']:.2f}s")
