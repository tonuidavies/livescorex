#!/usr/bin/env python3
"""
Generate every icon and store graphic LivescoreX ships, from vector maths.

One source of truth beats a folder of hand-exported PNGs: re-run this and the
launcher icon, the Android 13 themed icon, the status-bar notification icon and
the Play listing graphics all move together. Everything is drawn at 4x and
downsampled once, which is what keeps the seams crisp at 48dp.

Palette is taken from the app's own theme (src/theme/index.ts), not invented.
"""
from PIL import Image, ImageDraw, ImageFilter
import math, pathlib, sys

SS = 4  # supersample factor

BG_DEEP   = (0x1C, 0x1B, 0x20)
BG_LIFT   = (0x32, 0x30, 0x39)
BALL      = (0xFF, 0xFF, 0xFF)
SEAM      = (0x1C, 0x1B, 0x20)
LIVE_HOT  = (0xFD, 0x0F, 0x00)   # livePill
LIVE_WARM = (0xC9, 0x40, 0x38)   # accent


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def poly(cx, cy, r, n=5, rot=-90.0):
    """Vertices of a regular n-gon, `rot` degrees from +x axis."""
    return [
        (cx + r * math.cos(math.radians(rot + i * 360.0 / n)),
         cy + r * math.sin(math.radians(rot + i * 360.0 / n)))
        for i in range(n)
    ]


def ball_masks(size, R, cx, cy, r_c=0.30, seam=0.038, rim_d=0.72, rim_r=0.28,
               clip=0.88):
    """
    Return (disc, pattern) masks for a football.

    The classic truncated-icosahedron read comes from a central pentagon, five
    rim pentagons clipped by the ball edge, and seams joining them. Drawing the
    pattern as a *mask* rather than filled shapes is what lets the same geometry
    produce both the colour icon and the punched-out monochrome one.
    """
    disc = Image.new('L', (size, size), 0)
    ImageDraw.Draw(disc).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)

    pat = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(pat)

    r_c = r_c * R                        # central pentagon
    d.polygon(poly(cx, cy, r_c), fill=255)

    seam_w = max(1, int(seam * R))
    for k in range(5):
        a = math.radians(-90 + k * 72)
        vx, vy = cx + r_c * math.cos(a), cy + r_c * math.sin(a)
        ex, ey = cx + R * 1.02 * math.cos(a), cy + R * 1.02 * math.sin(a)
        d.line([(vx, vy), (ex, ey)], fill=255, width=seam_w)

    for k in range(5):                   # rim pentagons, point-inward
        a = -54 + k * 72
        ar = math.radians(a)
        px, py = cx + rim_d * R * math.cos(ar), cy + rim_d * R * math.sin(ar)
        d.polygon(poly(px, py, rim_r * R, rot=a + 180), fill=255)

    # Clip the pattern *inside* the silhouette, not to it. On a dark ground the
    # black pentagons otherwise merge with the background and the ball reads as
    # a five-pointed star; the surviving white rim is what keeps it a football.
    inner = Image.new('L', (size, size), 0)
    ri = R * clip
    ImageDraw.Draw(inner).ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=255)
    pat = Image.composite(pat, Image.new('L', (size, size), 0), inner)
    return disc, pat


def tapered_arc(draw, cx, cy, r, a0, a1, w0, w1, c0, c1, steps=420):
    """
    A comet-tail arc: stamping circles gives smooth round caps and a genuine
    taper, which `ImageDraw.arc` cannot do (uniform width, square ends).
    """
    for i in range(steps + 1):
        t = i / steps
        a = math.radians(a0 + (a1 - a0) * t)
        w = w0 + (w1 - w0) * t
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        col = lerp(c0, c1, t)
        draw.ellipse([x - w, y - w, x + w, y + w], fill=col + (255,))


def radial_bg(size, inner, outer):
    """Soft radial lift so the dark ground has depth instead of reading flat."""
    img = Image.new('RGB', (size, size), outer)
    d = ImageDraw.Draw(img)
    steps = 64
    for i in range(steps, 0, -1):
        t = i / steps
        rr = size * 0.78 * t
        d.ellipse([size / 2 - rr, size / 2 - rr, size / 2 + rr, size / 2 + rr],
                  fill=lerp(outer, inner, (1 - t) ** 1.6))
    return img.filter(ImageFilter.GaussianBlur(size * 0.03))


def build_mark(concept, S, mono=False):
    """
    Draw the mark on an S-square canvas, transparent ground.

    Framing is deliberately not attempted here — `fit` measures the result and
    centres it. Hand-tuned offsets are how the first pass ended up optically
    off-centre in every size at once.
    """
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    ink = BALL if mono else None

    if concept == 'signal':
        R = S * 0.20
        ball_c = cx - S * 0.06
        disc, pat = ball_masks(S, R, ball_c, cy)
        for i, rr in enumerate((1.38, 1.78, 2.18)):
            col = ink or lerp(LIVE_HOT, LIVE_WARM, i / 2)
            tapered_arc(d, ball_c, cy, R * rr, -38, 38,
                        0.055 * R, 0.055 * R, col, col, steps=220)
    else:  # 'pulse'
        R = S * 0.22
        ball_c = cx
        disc, pat = ball_masks(S, R, ball_c, cy)
        tapered_arc(d, ball_c, cy, R * 1.30, 152, -104,
                    0.022 * R, 0.115 * R,
                    ink or LIVE_WARM, ink or LIVE_HOT)

    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.paste(BALL + (255,), (0, 0), disc)
    if mono:
        # Punch the seams out so the flat white silhouette still reads as a
        # football — a solid white disc would just look like a dot.
        a = layer.split()[3]
        layer.putalpha(Image.composite(Image.new('L', (S, S), 0), a, pat))
    else:
        layer.paste(SEAM + (255,), (0, 0), pat)

    return Image.alpha_composite(img, layer)


def fit(m, S, frac):
    """Centre the mark's true ink bounds and scale it to `frac` of the canvas."""
    bb = m.getbbox()
    if bb:
        m = m.crop(bb)
    w, h = m.size
    k = (S * frac) / max(w, h)
    m = m.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(m, ((S - m.width) // 2, (S - m.height) // 2), m)
    return out


def render(concept, size, bg=True, mono=False, frac=0.70):
    S = size * SS
    m = fit(build_mark(concept, S, mono=mono), S, frac)
    if bg:
        m = Image.alpha_composite(radial_bg(S, BG_LIFT, BG_DEEP).convert('RGBA'), m)
    return m.resize((size, size), Image.LANCZOS)



# ---------------------------------------------------------------- store art

def _font(size):
    """First available of a few reliable bold faces."""
    from PIL import ImageFont
    for path, idx in (
        ('/System/Library/Fonts/Supplemental/Arial Black.ttf', None),
        ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', None),
        ('/System/Library/Fonts/Avenir Next.ttc', 1),
        ('/System/Library/Fonts/SFNS.ttf', None),
    ):
        try:
            return (ImageFont.truetype(path, size, index=idx) if idx is not None
                    else ImageFont.truetype(path, size))
        except Exception:
            continue
    return ImageFont.load_default()


def _fit_font(draw, text, max_w, start):
    """Largest size at which `text` fits `max_w`. Guessing sizes overflows."""
    size = start
    while size > 8:
        f = _font(size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return _font(8)


def feature_graphic(w=1024, h=500):
    """
    Play Store feature graphic: mark, wordmark, one honest line of promise.

    Every dimension is measured rather than assumed — the first pass hard-coded
    point sizes and ran the wordmark clean off the right edge.
    """
    S = 2
    W, H = w * S, h * S
    img = Image.new('RGB', (W, H), BG_DEEP)
    d = ImageDraw.Draw(img)

    for x in range(0, W, 4):
        d.rectangle([x, 0, x + 4, H], fill=lerp(BG_LIFT, BG_DEEP, min(1, x / W * 1.35)))

    mark_box = int(H * 0.62)
    m = fit(build_mark('pulse', mark_box), mark_box, 0.94)
    mx, my = int(W * 0.07), (H - mark_box) // 2
    img.paste(m, (mx, my), m)

    x = mx + mark_box + int(W * 0.05)
    right = int(W * 0.95)
    avail = right - x

    f1 = _fit_font(d, 'LivescoreX', avail, int(H * 0.22))
    tag = 'Live football scores, second by second'
    f2 = _fit_font(d, tag, avail, int(H * 0.085))

    d.text((x, H * 0.42), 'LivescoreX', font=f1, fill=BALL, anchor='ls')
    d.text((x, H * 0.55), tag, font=f2, fill=(0x8E, 0x8D, 0x94), anchor='ls')

    pill_h = int(H * 0.105)
    pill_w = int(pill_h * 2.9)
    py = int(H * 0.63)
    d.rounded_rectangle([x, py, x + pill_w, py + pill_h],
                        radius=pill_h // 2, fill=LIVE_HOT)
    d.text((x + pill_w / 2, py + pill_h * 0.54), 'LIVE',
           font=_font(int(pill_h * 0.50)), fill=BALL, anchor='mm')

    return img.resize((w, h), Image.LANCZOS)


if __name__ == '__main__':
    root = pathlib.Path(__file__).resolve().parent.parent
    assets = root / 'app' / 'assets'
    store = root / 'assets' / 'store'
    assets.mkdir(parents=True, exist_ok=True)
    store.mkdir(parents=True, exist_ok=True)

    jobs = [
        # Full-bleed launcher/iOS icon.
        (assets / 'icon.png',             lambda: render('pulse', 1024, frac=0.68)),
        # Adaptive foreground: ink stays inside the 66% circular safe zone.
        (assets / 'adaptive-icon.png',    lambda: render('pulse', 1024, bg=False, frac=0.66)),
        # Android 13 themed icon — system tints this, so it must be flat white.
        (assets / 'monochrome-icon.png',  lambda: render('pulse', 1024, bg=False, mono=True, frac=0.66)),
        (assets / 'splash-icon.png',      lambda: render('pulse', 1024, bg=False, frac=0.55)),
        # Status bar strips colour and keeps alpha; white-only is mandatory.
        (assets / 'notification-icon.png',lambda: render('pulse', 256, bg=False, mono=True, frac=0.86)),
        (assets / 'favicon.png',          lambda: render('pulse', 64, frac=0.72)),
        # Play listing icon must be 512 square with no alpha.
        (store / 'icon-512.png',          lambda: render('pulse', 512, frac=0.68).convert('RGB')),
        (store / 'feature-graphic.png',   feature_graphic),
    ]
    for path, fn in jobs:
        fn().save(path)
        print(f'  {path.relative_to(root)}')
