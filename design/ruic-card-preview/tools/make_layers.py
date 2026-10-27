"""Derive RuiC layered artwork from flat cover art.

Input: nothing (the three covers are drawn here, so the preview is reproducible).
Output: <out>/assets/{background,subject,text,lineart}.png + card-config.json

The layers are PROGRAMMATIC derivations of a flat cover, not hand-painted
character art: background = cover, subject = emblem glyph with real alpha,
lineart = edge pass over that glyph, text = typography layer. That limit is
stated in the preview README and must not be described as upstream-quality layers.
"""
import argparse, json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1024, 1536
FONT = "C:/Windows/Fonts/simsun.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"

COVERS = [
    {
        "slug": "night",
        "title": "霜落之城",
        "en": "FROSTFALL",
        "sub": "北境第七夜",
        "edition": "001 / 120",
        "line": "雪落在没有人的钟楼上。",
        "top": (11, 13, 18),
        "bottom": (26, 32, 44),
        "ink": (232, 192, 122),
        "paper": (247, 243, 235),
        "glyph": "霜",
    },
    {
        "slug": "dusk",
        "title": "潮汐档案",
        "en": "TIDAL ARCHIVE",
        "sub": "退潮之后",
        "edition": "017 / 080",
        "line": "海水退去，露出写满字的礁石。",
        "top": (24, 48, 47),
        "bottom": (12, 24, 26),
        "ink": (196, 226, 214),
        "paper": (240, 244, 240),
        "glyph": "潮",
    },
    {
        "slug": "dawn",
        "title": "白昼书房",
        "en": "DAYLIGHT STUDY",
        "sub": "清晨的第四封信",
        "edition": "003 / 060",
        "line": "光从窗帘缝隙里慢慢挪过来。",
        "top": (243, 236, 224),
        "bottom": (224, 210, 190),
        "ink": (42, 38, 34),
        "paper": (255, 252, 246),
        "glyph": "昼",
    },
]


def gradient(top, bottom):
    im = Image.new("RGB", (1, H))
    px = im.load()
    for y in range(H):
        t = y / (H - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return im.resize((W, H), Image.BILINEAR)


def cover_base(c):
    im = gradient(c["top"], c["bottom"]).convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")
    # concentric rings, very low contrast: paper-like structure under the foil
    cx, cy = W * 0.5, H * 0.42
    for i in range(14):
        r = 120 + i * 52
        d.ellipse([cx - r, cy - r * 1.02, cx + r, cy + r * 1.02],
                  outline=c["ink"] + (14,), width=1)
    # corner hairlines
    d.rectangle([48, 48, W - 48, H - 48], outline=c["ink"] + (46,), width=2)
    return im


def emblem(c):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    size = 470
    font = ImageFont.truetype(FONT, size, index=0)
    text = c["glyph"]
    box = d.textbbox((0, 0), text, font=font)
    x = (W - (box[2] - box[0])) / 2 - box[0]
    y = H * 0.42 - (box[3] - box[1]) / 2 - box[1]
    # soft glow first, then the solid glyph so the alpha edge stays real
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).text((x, y), text, font=font, fill=c["ink"] + (90,))
    layer = Image.alpha_composite(layer, glow.filter(ImageFilter.GaussianBlur(26)))
    ImageDraw.Draw(layer).text((x, y), text, font=font, fill=c["ink"] + (255,))
    return layer


def lineart(subject):
    alpha = subject.getchannel("A")
    edges = alpha.filter(ImageFilter.FIND_EDGES)
    edges = edges.point(lambda v: max(0, 255 - int(v * 1.6)))
    line = Image.new("RGB", (W, H), (255, 255, 255))
    line.paste(Image.merge("RGB", (edges, edges, edges)), (0, 0))
    return line


def typography(c):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    ink = c["ink"] + (255,)
    f_title = ImageFont.truetype(FONT_BOLD, 86, index=0)
    f_en = ImageFont.truetype(FONT_BOLD, 26, index=0)
    f_sub = ImageFont.truetype(FONT, 30, index=0)
    f_meta = ImageFont.truetype(FONT, 24, index=0)
    left = 96
    d.text((left, H - 400), c["title"], font=f_title, fill=ink)
    d.text((left, H - 296), c["en"], font=f_en, fill=c["ink"] + (190,))
    d.line([left, H - 250, left + 320, H - 250], fill=c["ink"] + (120,), width=2)
    d.text((left, H - 226), c["sub"], font=f_sub, fill=c["paper"] + (215,))
    d.text((left, 96), c["edition"], font=f_meta, fill=c["ink"] + (200,))
    d.text((W - 96, H - 96), "栖域 / QIYU", font=f_meta, fill=c["ink"] + (150,), anchor="rs")
    return layer


def build(c, out):
    assets = out / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    base = cover_base(c)
    subject = emblem(c)
    text = typography(c)
    base.convert("RGB").save(assets / "background.png")
    subject.save(assets / "subject.png")
    text.save(assets / "text.png")
    lineart(subject).save(assets / "lineart.png")
    cfg = {
        "title": c["title"],
        "subtitle": c["sub"],
        "technique": "分层视差 · 镭射膜",
        "tagline": c["line"],
        "edition": c["edition"],
        "collection": "栖域 · 卡面试作",
        "description": c["line"],
        "appearance": {"background": "#101216"},
        "assets": {
            "model": "./assets/card.glb",
            "subject": "./assets/subject.png",
            "background": "./assets/background.png",
            "text": "./assets/text.png",
            "lineart": "./assets/lineart.png",
        },
        "parameters": {"subjectScale": 1.18, "subjectDepth": 0.3,
                       "backgroundDepth": -0.22, "foil": 0.62},
        "safeArea": {"scale": 1.1, "offset": [0, 0]},
    }
    flat = Image.alpha_composite(Image.alpha_composite(base, subject), text)
    flat.convert("RGB").save(out / "cover.png")

    (out / "card-config.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf8")
    print("built", c["slug"], "->", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="parent dir; one subdir per cover is created")
    a = ap.parse_args()
    root = Path(a.out).resolve()
    for c in COVERS:
        build(c, root / c["slug"])