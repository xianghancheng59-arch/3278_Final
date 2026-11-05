"""Rebuild the classroom Chen ER diagram. SVG: standard library; PNG: Pillow.

Run from any directory: python scripts/render_er_diagram.py [--png]
Coordinates and all notation are editable below. No Graphviz/browser required.
"""
from pathlib import Path
from html import escape
import argparse
import math

W, H = 2150, 1470
RED = '#e52b20'
BLACK = '#171717'
parts = []
primitives = []


def line(points, color=BLACK, width=2, arrow=False):
    parts.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in points)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>')
    primitives.append(('line', points, color, width))
    if arrow:
        x,y=points[-1]; a,b=points[-2]; angle=math.atan2(y-b,x-a)
        pts=[(x,y),(x-17*math.cos(angle-.37),y-17*math.sin(angle-.37)),(x-17*math.cos(angle+.37),y-17*math.sin(angle+.37))]
        parts.append(f'<polygon points="{" ".join(f"{a},{b}" for a,b in pts)}" fill="{color}"/>')
        primitives.append(('polygon',pts,color,True))


def text(x,y,label,size=25,underline=False,color=BLACK):
    parts.append(f'<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="700" fill="{color}"'+(' text-decoration="underline"' if underline else '')+f'>{escape(label)}</text>')
    primitives.append(('text',(x,y),label,size,underline,color))


def shape(kind,x,y,rx,ry,label,size=30,key=False):
    if kind=='rect':
        parts.append(f'<rect x="{x-rx}" y="{y-ry}" width="{2*rx}" height="{2*ry}" fill="white" stroke="{RED}" stroke-width="2"/>')
    elif kind=='ellipse':
        parts.append(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="white" stroke="{RED}" stroke-width="2"/>')
    else:
        pts=[(x-rx,y),(x,y-ry),(x+rx,y),(x,y+ry)]
        parts.append(f'<polygon points="{" ".join(f"{a},{b}" for a,b in pts)}" fill="white" stroke="{RED}" stroke-width="2"/>')
    primitives.append(('shape',kind,(x,y,rx,ry)))
    text(x,y,label,size,key)


def attr(entity,center,label,key=False):
    ex,ey=entity; x,y=center
    dx=x-ex; dy=y-ey
    rscale=1/max(abs(dx)/130,abs(dy)/45)
    rx=70 if key else max(90,len(label)*12+24); ry=36
    escale=1/math.sqrt((dx/rx)**2+(dy/ry)**2)
    line([(ex+dx*rscale,ey+dy*rscale),(x-dx*escale,y-dy*escale)],RED)
    shape('ellipse',x,y,rx,ry,label,44 if key else 40,key)


def fan(entity,labels,angles,radius=500):
    for label,angle in zip(labels,angles):
        a=math.radians(angle)
        attr(entity,(round(entity[0]+radius*math.cos(a)),round(entity[1]+radius*math.sin(a))),label,label=='id')


def double(a,b):
    dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy)
    ox=-dy/length*4;oy=dx/length*4
    line([(a[0]+ox,a[1]+oy),(b[0]+ox,b[1]+oy)])
    line([(a[0]-ox,a[1]-oy),(b[0]-ox,b[1]-oy)])


def build():
    parts.clear();primitives.clear()
    U=(580,460); I=(1390,460); O=(650,1110); C=(1710,1190)

    line([(895,460),(710,460)],arrow=True)
    double((1135,460),(1260,460))

    line([(710,435),(895,220)])
    line([(1135,220),(1260,435)])
    line([(1015,160),(1015,146)],RED)

    line([(580,760),(580,505)],arrow=True)
    double((580,880),(650,1065))

    double((780,1110),(895,1110))
    line([(1135,1110),(1260,490)],arrow=True)

    double((1390,505),(1390,990))
    line([(1390,1110),(1580,1190)],arrow=True)

    for pos,label in [(U,'Users'),(I,'Items'),(O,'Orders'),(C,'Categories')]:
        shape('rect',*pos,130,45,label,46)
    for pos,label in [((1015,460),'sells'),((1015,220),'favorites'),((580,820),'places'),((1015,1110),'for_item'),((1390,1050),'classifies')]:
        shape('diamond',*pos,120,60,label,38)
    shape('ellipse',1015,110,144,36,'created_at',40)

    # Compact, manually placed fans: large type, short spokes, no hidden attributes.
    for name,xy in [
        ('id',(690,180)),('full_name',(480,140)),('email',(250,190)),
        ('password_hash',(210,340)),('contact_phone',(210,430)),
        ('avatar_url',(170,560)),('status',(140,680)),
        ('created_at',(180,790)),('updated_at',(350,900))]:
        attr(U,xy,name,name=='id')
    for name,xy in [
        ('id',(1320,150)),('title',(1530,130)),('description',(1760,180)),
        ('price',(1920,300)),('item_condition',(1930,430)),('status',(1960,560)),
        ('location',(1930,690)),('image_url',(1860,820)),
        ('created_at',(1720,910)),('updated_at',(1570,990))]:
        attr(I,xy,name,name=='id')
    for name,xy in [
        ('id',(180,1030)),('agreed_amount',(210,1180)),('pickup_location',(290,1390)),
        ('status',(650,1420)),('created_at',(1000,1370)),('updated_at',(1100,1220))]:
        attr(O,xy,name,name=='id')
    for name,xy in [('id',(1890,1060)),('name',(1970,1190)),('created_at',(1900,1360))]:
        attr(C,xy,name,name=='id')


def png(path):
    from PIL import Image,ImageDraw,ImageFont
    # Supersample all strokes and glyphs, then downsample for smooth slide images.
    scale=3
    canvas=Image.new('RGB',(W*scale,H*scale),'white');d=ImageDraw.Draw(canvas)
    def coords(points): return [(x*scale,y*scale) for x,y in points]
    def font(size):
        for f in ['C:/Windows/Fonts/arialbd.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
            if Path(f).is_file():return ImageFont.truetype(f,size*scale)
        raise SystemExit('PNG requires Arial Bold or DejaVu Sans Bold; SVG remains available.')
    for p in primitives:
        if p[0]=='line':d.line(coords(p[1]),fill=p[2],width=p[3]*scale,joint='curve')
        elif p[0]=='polygon':d.polygon(coords(p[1]),fill=p[2])
        elif p[0]=='text':
            _,xy,label,size,under,color=p;f=font(size)
            d.text((xy[0]*scale,xy[1]*scale),label,font=f,fill=color,anchor='mm')
            if under:
                length=d.textlength(label,font=f)/scale
                d.line(coords([(xy[0]-length/2,xy[1]+size*.48),(xy[0]+length/2,xy[1]+size*.48)]),fill=color,width=3*scale)
        else:
            _,kind,(x,y,rx,ry)=p;b=((x-rx)*scale,(y-ry)*scale,(x+rx)*scale,(y+ry)*scale)
            if kind=='rect':d.rectangle(b,fill='white',outline=RED,width=2*scale)
            elif kind=='ellipse':d.ellipse(b,fill='white',outline=RED,width=2*scale)
            else:d.polygon(coords([(x-rx,y),(x,y-ry),(x+rx,y),(x,y+ry)]),fill='white',outline=RED,width=2*scale)
    canvas.resize((W,H),Image.Resampling.LANCZOS).save(path)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--png',action='store_true')
    args=parser.parse_args()
    out=Path(__file__).resolve().parents[1]/'docs'/'diagrams';out.mkdir(parents=True,exist_ok=True)
    build()
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="2150" height="1470" viewBox="0 0 2150 1470">\n<title>CampusSwap conceptual ER diagram</title>\n<desc>Four entity sets and five relationships, including favorites mapped to the fifth SQL table. See docs/er-diagram.md for cardinalities and schema mapping.</desc>\n<rect width="100%" height="100%" fill="white"/>\n'+'\n'.join(parts)+'\n</svg>\n'
    (out/'campusswap-chen.svg').write_text(svg,encoding='utf-8')
    if args.png:png(out/'campusswap-chen.png')
    print(out)
