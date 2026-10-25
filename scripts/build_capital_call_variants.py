#!/usr/bin/env python3
"""Build the extra capital-call fixtures. The original five notices stay as they are."""

from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

ROOT = Path(__file__).resolve().parents[1] / "datasniper" / "samples"
SHIFT = 36 / 792


def put(pdf, text, x_norm, y_top, size=11):
    width, height = letter
    pdf.setFont("Times-Roman", size)
    pdf.drawString(x_norm * width, (1 - y_top) * height, text)


def notice(path, fund, investor, amount, extra_line=False):
    pdf = canvas.Canvas(str(path), pagesize=letter)
    shift = SHIFT if extra_line else 0
    put(pdf, "NORTHWIND ADMINISTRATION", 0.078, 0.038, 10)
    put(pdf, "Capital Call Notice", 0.078, 0.106, 16)
    put(pdf, "Notice date October 20, 2026", 0.078, 0.131, 11)
    put(pdf, "Synthetic notice for testing document snips. Not a request for payment.", 0.078, 0.159, 10)
    put(pdf, "Every sample uses the same coordinates for the fields below.", 0.078, 0.176, 10)
    if extra_line:
        put(pdf, "Please remit according to the revised schedule below.", 0.078, 0.205, 11)
    rows = [
        (0.227, "Fund name", fund),
        (0.263, "Investor", investor),
        (0.298, "Commitment", "$10,000,000.00"),
        (0.333, "Unfunded", "$4,750,000.00"),
        (0.369, "Call percentage", "12.50%"),
        (0.404, "Amount called", amount),
        (0.439, "Due date", "November 6, 2026"),
    ]
    for y, label, value in rows:
        put(pdf, label, 0.078, y + shift)
        put(pdf, value, 0.255, y + shift)
    put(pdf, "Sample data for DataSniper. Same template on every file. Not a real capital call.", 0.078, 0.955, 8)
    pdf.save()


def main():
    notice(
        ROOT / "capital-call-06.pdf",
        "Sable Ridge Venture Partners IV, L.P.",
        "Alexandra Catherine Pemberton Worthington III",
        "$424,242.42",
    )
    notice(
        ROOT / "capital-call-07.pdf",
        "Northwind Growth Fund III, L.P.",
        "Northline Municipal Pension Plan",
        "$424,242.00",
        extra_line=True,
    )
    print("wrote capital-call-06.pdf and capital-call-07.pdf")


if __name__ == "__main__":
    main()
