"""Local layout proof using installed system PyMuPDF/Pillow; no network."""
from pathlib import Path
import json
import fitz
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
doc = fitz.open(root / 'kleym-testnet-test-plan-v1.pdf')
out = root / 'evidences/layout'
out.mkdir(parents=True, exist_ok=True)
tiles, outside = [], []
for i, page in enumerate(doc):
    target = out / f'page-{i+1:02}.png'
    page.get_pixmap(matrix=fitz.Matrix(1, 1)).save(target)
    im = Image.open(target)
    im.thumbnail((238, 337))
    tile = Image.new('RGB', (250, 360), '#ddd')
    tile.paste(im, (6, 6))
    ImageDraw.Draw(tile).text((8, 343), str(i+1), fill='black')
    tiles.append(tile)
    for block in page.get_text('blocks'):
        if block[0] < 35 or block[2] > page.rect.width - 35 or block[1] < 30 or block[3] > page.rect.height - 12:
            outside.append(dict(page=i+1, bounds=block[:4]))
for start in range(0, len(tiles), 12):
    canvas = Image.new('RGB', (1000, 1080), 'white')
    for n, im in enumerate(tiles[start:start+12]):
        canvas.paste(im, ((n % 4) * 250, (n // 4) * 360))
    canvas.save(out / f'contact-sheet-{start//12+1}.png')
result = dict(rendered_pages=len(doc), outside_margin_blocks=outside)
(out / 'layout-check.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(result)
assert not outside
