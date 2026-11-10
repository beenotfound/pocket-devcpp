from PIL import Image, ImageDraw, ImageFont

def make(size, path):
    img = Image.new("RGBA", (size, size), (10, 36, 106, 255))
    d = ImageDraw.Draw(img)
    # 底部渐变
    for y in range(size):
        t = y / size
        c = (int(10 + 26 * t), int(36 + 70 * t), int(106 + 90 * t), 255)
        d.line([(0, y), (size, y)], fill=c)
    # 圆角遮罩
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
    img.putalpha(mask)
    # 文字
    font = None
    for cand in [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\segoeuib.ttf"]:
        try:
            font = ImageFont.truetype(cand, int(size * 0.30))
            break
        except Exception:
            pass
    text = "C++"
    if font:
        box = d.textbbox((0, 0), text, font=font)
        w, h = box[2] - box[0], box[3] - box[1]
        d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), text, font=font, fill=(255, 255, 255, 255))
    # 底部小字
    small = None
    try:
        small = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", int(size * 0.085))
    except Exception:
        pass
    if small:
        t2 = "iPAD"
        box = d.textbbox((0, 0), t2, font=small)
        w = box[2] - box[0]
        d.text(((size - w) / 2 - box[0], size * 0.70), t2, font=small, fill=(190, 215, 255, 255))
    img.save(path)

for s in (180, 192, 512):
    make(s, f"icons/icon-{s}.png")
print("icons ok")
