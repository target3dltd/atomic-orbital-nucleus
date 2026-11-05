#!/usr/bin/env python3
"""Rebrand the Target3D operations checklists to Atomic Orbital (v1.0.0).

Usage:  python3 build/rebrand_checklists.py <folder of original .docx> <output folder>
Needs python-docx. Keeps every table, tick box and field; changes only the branding:
  - the TARGET3D wordmark becomes the Atomic Orbital logo,
  - Arial becomes IBM Plex Sans (body) and Space Grotesk (titles and section headings),
  - navy and light-blue become Atomic Orbital teal and neutral grey,
  - "T3D" / "Target3D" in field labels become "Atomic Orbital",
  - pages become A4 with 2 cm margins and the legal footer.
"""
import sys, re, pathlib, copy
import docx
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

LOGO = pathlib.Path(__file__).resolve().parent / "atomic-orbital-logo-docs.png"  # 900 px copy of the lockup, keeps files small
TEXT, MUTED, TEAL_TEXT, TEAL, ORANGE_TEXT = "0E1620", "4A5A6B", "03797F", "04959B", "B23A10"
COLOUR_MAP = {"003366": TEAL_TEXT, "505050": TEXT, "646464": MUTED, "B40000": ORANGE_TEXT}
FILL_MAP = {"003366": TEAL_TEXT, "D5E8F0": "EAEEF2"}
BODY, DISPLAY = "IBM Plex Sans", "Space Grotesk"
FOOTER = "Atomic Orbital Limited · Registered in England and Wales, company number 17518955 · 66 Paul Street, London EC2A 4NA · info@atomicorbital.co.uk"

def set_font(run, name):
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts"); rpr.insert(0, fonts)
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(a), name)

def relabel(text):
    text = re.sub(r"\bT3D side\b", "our side", text)
    text = re.sub(r"\bT3D\b", "Atomic Orbital", text)
    text = re.sub(r"\bTarget3D\b", "Atomic Orbital", text)
    return text

def is_heading(p):
    runs = [r for r in p.runs if r.text.strip()]
    return bool(runs) and all(r.font.bold for r in runs) and len(p.text) < 80 and not p.text.strip().startswith("⚠")

def rebrand(src, dst):
    d = docx.Document(src)
    # A4, 2 cm margins
    for s in d.sections:
        s.page_width, s.page_height = Cm(21), Cm(29.7)
        s.left_margin = s.right_margin = Cm(2); s.top_margin = Cm(1.8); s.bottom_margin = Cm(1.8)
        fp = s.footer.paragraphs[0] if s.footer.paragraphs else s.footer.add_paragraph()
        fp.text = ""; r = fp.add_run(FOOTER); r.font.size = Pt(7.5); r.font.color.rgb = RGBColor.from_string(MUTED); set_font(r, BODY)
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    normal = d.styles["Normal"]; normal.font.name = BODY
    normal.element.get_or_add_rPr()
    # colours and fills everywhere (body, tables)
    xml_root = d.element
    for el in xml_root.iter(qn("w:color")):
        v = (el.get(qn("w:val")) or "").upper()
        if v in COLOUR_MAP: el.set(qn("w:val"), COLOUR_MAP[v])
    for el in xml_root.iter(qn("w:shd")):
        v = (el.get(qn("w:fill")) or "").upper()
        if v in FILL_MAP: el.set(qn("w:fill"), FILL_MAP[v])
    for el in xml_root.iter(qn("w:rFonts")):
        for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            if el.get(qn(a)) == "Arial": el.set(qn(a), BODY)
    # paragraphs: logo, title, headings, labels
    paras = list(d.paragraphs)
    title_done = False
    for i, p in enumerate(paras):
        t = p.text.strip()
        if i == 0 and t.upper() == "TARGET3D":
            for r in p.runs: r._element.getparent().remove(r._element)
            p.add_run().add_picture(str(LOGO), height=Cm(1.15))
            continue
        for r in p.runs:
            if r.text: r.text = relabel(r.text)
            set_font(r, BODY)
        if not title_done and t and i <= 2:
            for r in p.runs:
                set_font(r, DISPLAY); r.font.size = Pt(20); r.font.bold = False; r.font.color.rgb = RGBColor.from_string(TEXT)
            p.paragraph_format.space_before = Pt(10)
            title_done = True
            continue
        if is_heading(p):
            for r in p.runs:
                set_font(r, DISPLAY); r.font.color.rgb = RGBColor.from_string(TEAL_TEXT)
                r.font.size = Pt(12.5)
    for t in d.tables:
        for row in t.rows:
            for c in row.cells:
                for p in c.paragraphs:
                    for r in p.runs:
                        if r.text: r.text = relabel(r.text)
                        set_font(r, BODY)
    d.core_properties.author = "Atomic Orbital"
    d.core_properties.company = "Atomic Orbital Limited" if hasattr(d.core_properties, "company") else None
    d.save(dst)

if __name__ == "__main__":
    src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.glob("*.docx")):
        name = re.sub(r"^\d+_", "", f.stem).replace("_", "-").lower()
        dst = out / f"atomic-orbital-{name}.docx"
        rebrand(f, dst)
        print("rebranded", f.name, "->", dst.name)
