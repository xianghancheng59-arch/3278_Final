"""Rebuild the classroom Chen ER diagram. SVG: standard library; PNG: Pillow.

Run from any directory: python scripts/render_er_diagram.py [--png]
Coordinates and all notation are editable below. No Graphviz/browser required.
"""
from pathlib import Path
from html import escape
import argparse
import math

W, H = 3000, 2300
RED = '#e52b20'
BLACK = '#171717'
parts = []
primitives = []


def line(points, color=BLACK, width=2, arrow=False):
    parts.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in points)}" fill="none" stroke="{color}" stroke-width="{width}"/>')
    primitives.append(('line', points, color, width))
    if arrow:
        x,y=points[-1]; a,b=points[-2]; angle=math.atan2(y-b,x-a)
        pts=[(x,y),(x-17*math.cos(angle-.37),y-17*math.sin(angle-.37)),(x-17*math.cos(angle+.37),y-17*math.sin(angle+.37))]
        parts.append(f'<polygon points="{" ".join(f"{a},{b}" for a,b in pts)}" fill="{color}"/>')
        primitives.append(('polygon',pts,color,True))


def text(x,y,label,size=25,underline=False,color=BLACK):
    parts.append(f'<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="{size}" fill="{color}"'+(' text-decoration="underline"' if underline else '')+f'>{escape(label)}</text>')
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
    rscale=1/max(abs(dx)/110,abs(dy)/45)
    rx=60 if key else max(85,len(label)*7.4); ry=32
    escale=1/math.sqrt((dx/rx)**2+(dy/ry)**2)
    line([(ex+dx*rscale,ey+dy*rscale),(x-dx*escale,y-dy*escale)],RED)
    shape('ellipse',x,y,rx,ry,label,24,key)


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
    text(1500,55,'CampusSwap - Conceptual E-R Diagram',44)
    text(1500,110,'Classroom notation aligned with Assignment 1, Question 1',25)
    U=(650,700); I=(1950,700); O=(650,1620); C=(2480,1640)

    # Relationships first, so entity/diamond outlines remain crisp.
    line([(1180,700),(760,700)],arrow=True) # sells -> user (one)
    double((1420,700),(1840,700))
    text(995,665,'seller: 0..N items',22)
    text(1625,665,'each item: 1 seller',22)

    line([(760,670),(880,540),(1050,350),(1180,350)])
    line([(1420,350),(1550,350),(1720,540),(1840,670)])
    text(1010,490,'0..N',22)
    text(1590,490,'0..N',22)
    line([(1300,290),(1300,242)],RED)

    line([(650,1115),(650,745)],arrow=True)
    double((650,1245),(650,1575))
    text(790,1000,'buyer: 0..N orders',22)
    text(820,1390,'each order: 1 buyer',22)

    double((760,1620),(1180,1620))
    line([(1420,1620),(1640,1620),(1750,1180),(1750,820),(1840,730)],arrow=True)
    text(980,1585,'each order: 1 item',22)
    text(1500,1745,'item: 0..N historical orders',22)

    double((1950,745),(1950,1235))
    line([(1950,1365),(1950,1510),(2370,1640)],arrow=True)
    text(2240,1330,'each item: 1 category',22)
    text(2190,1470,'category: 0..N items',22)

    for pos,label in [(U,'Users'),(I,'Items'),(O,'Orders'),(C,'Categories')]:
        shape('rect',*pos,110,45,label,32)
    for pos,label in [((1300,700),'sells'),((1300,350),'favorites'),((650,1180),'places'),((1300,1620),'for_item'),((1950,1300),'classifies')]:
        shape('diamond',*pos,120,65,label,29)
    shape('ellipse',1300,210,125,32,'created_at',24)

    # Every non-FK SQL attribute is shown; FKs are represented by relationships.
    fan(U,['updated_at','created_at','status','avatar_url','contact_phone','password_hash','email','full_name','id'],
        [125,143,161,179,197,215,233,251,269])
    fan(I,['id','title','description','price','item_condition','status','location','image_url','created_at','updated_at'],
        [-89,-71,-53,-35,-17,1,19,37,55,73],530)
    fan(O,['updated_at','created_at','status','pickup_location','agreed_amount','id'],
        [35,63,91,119,147,175],490)
    attr(C,(2700,1440),'id',True)
    attr(C,(2800,1640),'name')
    attr(C,(2670,1850),'created_at')

    # Legend at full width, outside the diagram's graph.
    line([(100,2200),(2900,2200)],'#cccccc',1)
    text(1500,2240,'Rectangle = entity  |  Diamond = relationship  |  Ellipse = attribute  |  Underline = primary key',23)
    text(1500,2280,'Arrow toward entity = at most one  |  Double line = total participation  |  Single line = partial participation',23)


def png(path):
    from PIL import Image,ImageDraw,ImageFont
    canvas=Image.new('RGB',(W,H),'white');d=ImageDraw.Draw(canvas)
    def font(size):
        for f in ['C:/Windows/Fonts/arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
            if Path(f).is_file():return ImageFont.truetype(f,size)
        raise SystemExit('PNG requires Arial or DejaVu Sans; SVG remains available.')
    for p in primitives:
        if p[0]=='line':d.line(p[1],fill=p[2],width=p[3])
        elif p[0]=='polygon':d.polygon(p[1],fill=p[2])
        elif p[0]=='text':
            _,xy,label,size,under,color=p;f=font(size)
            d.text(xy,label,font=f,fill=color,anchor='mm')
            if under:
                length=d.textlength(label,font=f)
                d.line([(xy[0]-length/2,xy[1]+size*.48),(xy[0]+length/2,xy[1]+size*.48)],fill=color,width=2)
        else:
            _,kind,(x,y,rx,ry)=p;b=(x-rx,y-ry,x+rx,y+ry)
            if kind=='rect':d.rectangle(b,fill='white',outline=RED,width=2)
            elif kind=='ellipse':d.ellipse(b,fill='white',outline=RED,width=2)
            else:d.polygon([(x-rx,y),(x,y-ry),(x+rx,y),(x,y+ry)],fill='white',outline=RED,width=2)
    canvas.save(path)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--png',action='store_true')
    args=parser.parse_args()
    out=Path(__file__).resolve().parents[1]/'docs'/'diagrams';out.mkdir(parents=True,exist_ok=True)
    build()
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2300" viewBox="0 0 3000 2300">\n<title>CampusSwap conceptual ER diagram</title>\n<desc>Four entity sets and five relationships, including favorites mapped to the fifth SQL table. See docs/er-diagram.md for cardinalities and schema mapping.</desc>\n<rect width="100%" height="100%" fill="white"/>\n'+'\n'.join(parts)+'\n</svg>\n'
    (out/'campusswap-chen.svg').write_text(svg,encoding='utf-8')
    if args.png:png(out/'campusswap-chen.png')
    print(out)
