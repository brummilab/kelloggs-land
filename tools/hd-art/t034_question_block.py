#!/usr/bin/env python3
"""HD art: question-mark block (level 1, tile 034) -> web/hd/t_8648e59f.png (64x64).
    python3 tools/hd-art/t034_question_block.py web/hd/t_8648e59f.png preview.png
Drawn as shapes (signed distance) with a fixed palette, no AA; finished in LibreSprite."""
import math, json, sys
from PIL import Image
N=64
PINK_HI=(255,170,180); PINK=(238,93,109); RED=(157,0,0); RED_D=(118,0,0)
BROWN=(76,28,0); BROWN_D=(42,14,0); BLACK=(0,0,0)
PURP_D=(120,62,140); PURP=(190,125,206); LILAC=(222,157,238); WHITE=(238,238,238)
C=(30,21); R=14; T=6.5
def sd_q(x,y):
    dx,dy=x-C[0],-(y-C[1]); a=math.degrees(math.atan2(dy,dx))
    if -90<=a<=180: d_arc=abs(math.hypot(dx,dy)-R)-T
    else:
        e1=(C[0]-R,C[1]); e2=(C[0],C[1]+R)
        d_arc=min(math.hypot(x-e1[0],y-e1[1]),math.hypot(x-e2[0],y-e2[1]))-T
    # stem capsule
    ax,ay,bx,by=30,35,30,42
    t=max(0,min(1,(y-ay)/(by-ay))); d_stem=math.hypot(x-ax,y-(ay+t*(by-ay)))-T
    d_dot=math.hypot(x-30,y-58)-7.5
    return min(d_arc,d_stem,d_dot)
def grad(x,y,h=.5):
    return ((sd_q(x+h,y)-sd_q(x-h,y))/(2*h),(sd_q(x,y+h)-sd_q(x,y-h))/(2*h))
img=Image.new('RGB',(N,N))
for y in range(N):
  for x in range(N):
    px,py=x+.5,y+.5
    # block: wie im Original oben/links rosa, rechts/unten braun
    if y<4 and x<N-4: c=PINK_HI if y<2 else PINK
    elif x<8 and y<N-4: c=PINK_HI if x<2 else PINK
    elif x>=N-4 or y>=N-4: c=BROWN_D if (x>=N-2 or y>=N-2) else BROWN
    else: c=RED_D if (x<10 or y<6) else RED
    d=sd_q(px,py); ds=sd_q(px-3.5,py-3.5)
    if d>0 and ds<=0: c=BLACK
    if d<=0:
        if d>-1.6: c=PURP_D
        else:
            gx,gy=grad(px,py); n=math.hypot(gx,gy) or 1; gx/=n; gy/=n
            lit=-(gx*-0.7071+gy*-0.7071)  # direction to light (upper-left) vs outward normal
            lit=gx*-0.7071+gy*-0.7071
            if d>-3.2 and lit>0.35: c=WHITE
            elif d>-3.2 and lit<-0.35: c=PURP
            else: c=LILAC
    img.putpixel((x,y),c)
img.save(sys.argv[1])
img.resize((N*6,N*6),Image.NEAREST).save(sys.argv[2])
