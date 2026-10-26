"""Render every page and verify text margins; retain compact contact sheets."""
from pathlib import Path
import json
import pymupdf as fitz
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[2]
out=root/'evidences/layout';out.mkdir(parents=True,exist_ok=True)
doc=fitz.open(root/'kleym-comprehensive-test-plan-v2.pdf')
tiles=[];outside=[]
for i,page in enumerate(doc):
    pix=page.get_pixmap(matrix=fitz.Matrix(.5,.5))
    im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
    im.thumbnail((238,337));tile=Image.new('RGB',(250,360),'#eee');tile.paste(im,(6,6));ImageDraw.Draw(tile).text((8,343),str(i+1),fill='black');tiles.append(tile)
    if i in [0,3,8,30,60,90,len(doc)-1]:page.get_pixmap(matrix=fitz.Matrix(1,1)).save(out/f'page-{i+1:03}.png')
    for b in page.get_text('blocks'):
        if b[0]<35 or b[2]>page.rect.width-35 or b[1]<30 or b[3]>page.rect.height-12:outside.append(dict(page=i+1,bounds=b[:4]))
for start in range(0,len(tiles),12):
    canvas=Image.new('RGB',(1000,1080),'white')
    for n,im in enumerate(tiles[start:start+12]):canvas.paste(im,((n%4)*250,(n//4)*360))
    canvas.save(out/f'contact-sheet-{start//12+1:02}.png')
result=dict(rendered_pages=len(doc),outside_margin_blocks=outside,contact_sheets=(len(doc)+11)//12)
(out/'layout-check.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));assert not outside
