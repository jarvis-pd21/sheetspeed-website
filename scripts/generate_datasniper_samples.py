#!/usr/bin/env python3
"""Generate synthetic capital-call PDFs that share one template.

Values are drawn in embedded Liberation Mono so a page-relative snip clips
by character. The long investor name is wider than the other four on purpose.
"""

from pathlib import Path

from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "datasniper" / "samples"
ASSETS = ROOT / "datasniper" / "assets"

SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"

PAGE_W, PAGE_H = letter
VALUE_SIZE = 10
LABEL_SIZE = 10
VALUE_X = 156

DOCS = [
    {
        "file": "capital-call-01.pdf",
        "notice": "CC-2026-101",
        "fund": "Northwind Growth Fund III, L.P.",
        "investor": "Harborview Pension Trust",
        "amount": "$1,250,000.00",
    },
    {
        "file": "capital-call-02.pdf",
        "notice": "CC-2026-102",
        "fund": "Northwind Growth Fund III, L.P.",
        "investor": "Cedar & Pine Family Office LLC",
        "amount": "$875,400.50",
    },
    {
        "file": "capital-call-03.pdf",
        "notice": "CC-2026-103",
        "fund": "Blackpine Opportunistic Credit Fund II",
        "investor": "Meridian University Endowment",
        "amount": "$2,100,000.00",
    },
    {
        "file": "capital-call-04.pdf",
        "notice": "CC-2026-104",
        "fund": "Blackpine Opportunistic Credit Fund II",
        "investor": "The Johnathan Q. Abernathy Revocable Living Trust dated March 14, 1998",
        "amount": "$640,250.75",
    },
    {
        "file": "capital-call-05.pdf",
        "notice": "CC-2026-105",
        "fund": "Sable Ridge Venture Partners IV, L.P.",
        "investor": "Oak Street Capital Advisors",
        "amount": "$3,450,000.00",
    },
]

# Baselines from the bottom of the page. Identical on every notice.
ROWS = {
    "fund": 612,
    "investor": 584,
    "commitment": 556,
    "unfunded": 528,
    "percent": 500,
    "amount": 472,
    "due": 444,
}


def register_fonts():
    pdfmetrics.registerFont(TTFont("BodySans", SANS))
    pdfmetrics.registerFont(TTFont("BodySans-Bold", SANS_BOLD))
    pdfmetrics.registerFont(TTFont("BodyMono", MONO))


def mono_width(text, size=VALUE_SIZE):
    return pdfmetrics.stringWidth(text, "BodyMono", size)


def draw_notice(path, doc):
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle(f"Capital Call Notice {doc['notice']}")
    c.setAuthor("DataSniper sample generator")
    c.setSubject("Synthetic capital call notice for DataSniper. Not a real demand for payment.")

    c.setFillColorRGB(0.12, 0.16, 0.15)
    c.rect(0, 742, PAGE_W, 50, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("BodySans-Bold", 16)
    c.drawString(48, 762, "NORTHWIND ADMINISTRATION")
    c.setFont("BodySans", 9)
    c.drawRightString(PAGE_W - 48, 764, doc["notice"])

    c.setFillColorRGB(0.12, 0.16, 0.15)
    c.setFont("BodySans-Bold", 18)
    c.drawString(48, 708, "Capital Call Notice")
    c.setFont("BodySans", 10)
    c.setFillColorRGB(0.25, 0.28, 0.27)
    c.drawString(48, 688, "Notice date  October 20, 2026")
    c.drawRightString(PAGE_W - 48, 688, "Due date  November 6, 2026")

    c.setFillColorRGB(0.18, 0.2, 0.19)
    text = c.beginText(48, 666)
    text.setFont("BodySans", 10)
    text.setLeading(13)
    for line in [
        "Synthetic notice for testing document snips. Not a request for payment.",
        "Every sample uses the same coordinates for the fields below.",
    ]:
        text.textLine(line)
    c.drawText(text)

    # Value column guide. A path only, so it does not enter the text layer.
    c.setStrokeColorRGB(0.82, 0.84, 0.83)
    c.setLineWidth(0.6)
    c.line(VALUE_X - 12, 438, VALUE_X - 12, 646)

    labels = [
        ("fund", "Fund name"),
        ("investor", "Investor"),
        ("commitment", "Commitment"),
        ("unfunded", "Unfunded"),
        ("percent", "Call percentage"),
        ("amount", "Amount called"),
        ("due", "Due date"),
    ]
    values = {
        "fund": doc["fund"],
        "investor": doc["investor"],
        "commitment": "$10,000,000.00",
        "unfunded": "$4,750,000.00",
        "percent": "12.50%",
        "amount": doc["amount"],
        "due": "November 6, 2026",
    }
    for key, label in labels:
        y = ROWS[key]
        c.setFillColorRGB(0.33, 0.36, 0.35)
        c.setFont("BodySans", LABEL_SIZE)
        c.drawString(48, y, label)
        c.setFillColorRGB(0.08, 0.1, 0.09)
        c.setFont("BodyMono", VALUE_SIZE)
        c.drawString(VALUE_X, y, values[key])

    c.setFillColorRGB(0.18, 0.2, 0.19)
    c.setFont("BodySans-Bold", 11)
    c.drawString(48, 400, "Wire instructions")
    c.setFont("BodySans", 10)
    wires = [
        "Bank  First Harbor Bank, N.A.",
        "ABA  021000021",
        "Account  883621904",
        "Reference  Investor name and notice number",
    ]
    y = 380
    for line in wires:
        c.drawString(48, y, line)
        y -= 16

    c.setFillColorRGB(0.4, 0.42, 0.41)
    c.setFont("BodySans", 8)
    c.drawString(48, 36, "Sample data for DataSniper. Same template on every file. Not a real capital call.")
    c.showPage()
    c.save()


def draw_icons():
    ASSETS.mkdir(parents=True, exist_ok=True)

    def icon(size):
        image = Image.new("RGBA", (size, size), (15, 90, 82, 255))
        draw = ImageDraw.Draw(image)
        margin = max(1, round(size * 0.16))
        draw.rounded_rectangle(
            [margin, round(margin * 0.85), size - margin, size - round(margin * 0.7)],
            radius=max(1, size // 10),
            fill=(255, 252, 246, 255),
        )
        cx = cy = size / 2
        arm = size * 0.28
        ring = size * 0.13
        width = max(1, round(size / 14))
        ink = (15, 90, 82, 255)
        draw.line([cx, cy - arm, cx, cy + arm], fill=ink, width=width)
        draw.line([cx - arm, cy, cx + arm, cy], fill=ink, width=width)
        draw.ellipse([cx - ring, cy - ring, cx + ring, cy + ring], outline=ink, width=width)
        return image

    for size, name in [(16, "icon-16.png"), (32, "icon-32.png"), (64, "icon-64.png"), (80, "icon-80.png")]:
        icon(size).save(ASSETS / name)

    # Image twin of the first notice, for the optional image upload path.
    preview = Image.new("RGB", (612, 792), (255, 252, 246))
    draw = ImageDraw.Draw(preview)
    draw.rectangle([0, 0, 612, 50], fill=(31, 41, 38))
    draw.text((48, 18), "Capital call image sample", fill=(255, 255, 255))
    draw.text((48, 120), "Fund name", fill=(80, 80, 80))
    draw.text((176, 120), DOCS[0]["fund"], fill=(20, 20, 20))
    draw.text((48, 160), "Investor", fill=(80, 80, 80))
    draw.text((176, 160), DOCS[0]["investor"], fill=(20, 20, 20))
    draw.text((48, 200), "Amount called", fill=(80, 80, 80))
    draw.text((176, 200), DOCS[0]["amount"], fill=(20, 20, 20))
    draw.text((48, 740), "PNG sample. Text comes from OCR, not a PDF text layer.", fill=(90, 90, 90))
    preview.save(OUT / "capital-call-image.png")


def main():
    register_fonts()
    char_width = mono_width("M")
    widths = {ch: mono_width(ch) for ch in set("".join(d["investor"] + d["fund"] + d["amount"] for d in DOCS))}
    uneven = {ch: w for ch, w in widths.items() if abs(w - char_width) > 0.01}
    if uneven:
        raise SystemExit(f"Liberation Mono is not treating these as monospace: {uneven}")

    longest = max(DOCS, key=lambda doc: len(doc["investor"]))
    longest_width = mono_width(longest["investor"])
    if VALUE_X + longest_width > PAGE_W - 24:
        raise SystemExit(
            f"Long investor overflows the page: x {VALUE_X} width {longest_width:.1f} page {PAGE_W}"
        )

    OUT.mkdir(parents=True, exist_ok=True)
    for doc in DOCS:
        draw_notice(OUT / doc["file"], doc)
        print(f"wrote {doc['file']} investor_len={len(doc['investor'])} width={mono_width(doc['investor']):.2f}")

    draw_icons()
    print(f"char_width={char_width:.4f} value_x={VALUE_X} value_size={VALUE_SIZE}")
    for key, y in ROWS.items():
        print(f"row {key} baseline={y}")


if __name__ == "__main__":
    main()
