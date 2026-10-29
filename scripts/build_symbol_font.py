"""Builds public/fonts/pc-symbols.ttf, the single symbol font used on screen and in PDFs.

Every glyph is scaled to fit the same square and centred on a 1000-unit advance, so renderers can
centre any symbol in a cell without per-glyph metrics: the glyph centre sits 0.38 em above the
baseline (see GLYPH_CENTER_Y). Sources are OFL fonts, downloaded once into .cache/ and checked.

Usage: npm run build:font   (needs Python 3 with fontTools)
"""
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.roundingPen import RoundingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "font-sources"
FAMILY = "PuntoCroce Symbols"
UPM = 1000
ADVANCE = 1000
ASCENT, DESCENT = 880, -120
GLYPH_CENTER_Y = 380  # = (ASCENT + DESCENT) / 2
BOX = 720  # glyphs fit in a BOX x BOX square

GF = "https://raw.githubusercontent.com/google/fonts"
SOURCES = {
    "atk": (
        f"{GF}/95f4904fc8bcf26d3420fe315560c96417c6dec7/ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Bold.ttf",
        "5a3b0c8cc8ca545155150b4512a1fa248298df121c50d6557e651e61fbdab92f",
    ),
    "atk-ofl": (
        f"{GF}/95f4904fc8bcf26d3420fe315560c96417c6dec7/ofl/atkinsonhyperlegible/OFL.txt",
        "f32d22b3908fcad2c86a74000614ec22e6a7f66ea7e867e616026a27aebdc143",
    ),
    "noto": (
        f"{GF}/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notosanssymbols2/NotoSansSymbols2-Regular.ttf",
        "7d5fb73b7ca67a6798101741f5d280a3d016a56a197afcd4199dbb57b4b82a21",
    ),
    "noto-ofl": (
        f"{GF}/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notosanssymbols2/OFL.txt",
        "b118dd41337806a5d4797052c77caf3bd096aed783e5eb21b4d11154351e1ac0",
    ),
}


def fetch(key: str) -> Path:
    url, sha = SOURCES[key]
    path = CACHE / f"{key}-{url.rsplit('/', 1)[-1]}"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}")
        with urllib.request.urlopen(url) as resp:
            path.write_bytes(resp.read())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != sha:
        path.unlink()
        sys.exit(f"checksum mismatch for {url}: {digest}")
    return path


def normalized_glyph(font: TTFont, char: str):
    glyph_set = font.getGlyphSet()
    name = font.getBestCmap()[ord(char)]
    rec = DecomposingRecordingPen(glyph_set)
    glyph_set[name].draw(rec)
    bounds_pen = BoundsPen(None)
    rec.replay(bounds_pen)
    x_min, y_min, x_max, y_max = bounds_pen.bounds
    scale = BOX / max(x_max - x_min, y_max - y_min)
    dx = ADVANCE / 2 - (x_min + x_max) / 2 * scale
    dy = GLYPH_CENTER_Y - (y_min + y_max) / 2 * scale
    tt_pen = TTGlyphPen(None)
    rec.replay(TransformPen(RoundingPen(tt_pen), (scale, 0, 0, scale, dx, dy)))
    return tt_pen.glyph()


def notdef_glyph():
    pen = TTGlyphPen(None)
    for (x0, y0, x1, y1) in ((150, 20, 850, 740), (210, 80, 790, 680)):
        pts = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
        if x0 == 210:
            pts.reverse()
        pen.moveTo(pts[0])
        for p in pts[1:]:
            pen.lineTo(p)
        pen.closePath()
    return pen.glyph()


def main() -> None:
    fonts = {"atk": TTFont(fetch("atk")), "noto": TTFont(fetch("noto"))}
    licences = [fetch("atk-ofl").read_text(), fetch("noto-ofl").read_text()]
    spec = json.loads((ROOT / "scripts" / "symbols.json").read_text())

    symbols, glyphs, cmap = [], {".notdef": notdef_glyph(), "space": TTGlyphPen(None).glyph()}, {32: "space"}
    for tier in spec["tiers"]:
        font = fonts[tier["font"]]
        for char in tier["chars"]:
            if char in symbols:
                sys.exit(f"duplicate symbol {char}")
            if ord(char) not in font.getBestCmap():
                sys.exit(f"{tier['font']} has no glyph for {char} (U+{ord(char):04X})")
            name = f"uni{ord(char):04X}"
            glyphs[name] = normalized_glyph(font, char)
            cmap[ord(char)] = name
            symbols.append(char)

    order = list(glyphs)
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font["glyf"]
    fb.setupHorizontalMetrics({n: (ADVANCE, getattr(glyf[n], "xMin", 0)) for n in order})
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    fb.setupNameTable(
        {
            "familyName": FAMILY,
            "styleName": "Regular",
            "uniqueFontIdentifier": f"{FAMILY} Regular",
            "fullName": f"{FAMILY} Regular",
            "psName": "PuntoCroceSymbols-Regular",
            "copyright": "Copyright 2020 Braille Institute of America, Inc.; Copyright 2022 The Noto Project Authors. Modified for PuntoCroce.",
            "licenseDescription": "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
            "licenseInfoURL": "https://openfontlicense.org",
        }
    )
    fb.setupOS2(
        sTypoAscender=ASCENT,
        sTypoDescender=DESCENT,
        sTypoLineGap=0,
        usWinAscent=ASCENT,
        usWinDescent=-DESCENT,
        fsType=0,
        achVendID="PNTC",
    )
    fb.setupPost()
    out = ROOT / "public" / "fonts" / "pc-symbols.ttf"
    out.parent.mkdir(parents=True, exist_ok=True)
    fb.save(out)

    (out.parent / "OFL.txt").write_text(
        "PuntoCroce Symbols (pc-symbols.ttf) is a modified version of Atkinson Hyperlegible Bold and\n"
        "Noto Sans Symbols 2: glyphs were selected, scaled and re-centred. It is distributed under the\n"
        "SIL Open Font License 1.1, reproduced below for each source font.\n\n"
        + "\n\n".join(licences)
    )
    (ROOT / "src" / "core" / "model" / "symbolSet.json").write_text(
        json.dumps({"font": FAMILY, "glyphCenterY": GLYPH_CENTER_Y / UPM, "symbols": symbols}, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"{out.relative_to(ROOT)}: {len(symbols)} symbols, {out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
