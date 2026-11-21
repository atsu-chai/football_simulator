#!/usr/bin/env python3
"""実測XMLから連続90秒・5Hzを役割だけの匿名クリップへ変換する。"""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from extract_tracking import ROLES, SOURCE

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input',type=Path,required=True)
    ap.add_argument('--match',default='DFL-COM-000001_DFL-MAT-J03WMX.xml')
    ap.add_argument('--section',choices=['firstHalf','secondHalf'],default='firstHalf')
    ap.add_argument('--start',type=int,default=300,help='ハーフ開始からの秒数')
    ap.add_argument('--output',type=Path,default=Path('/tmp/behaviour-real-clip.json'))
    args=ap.parse_args()
    info=ET.parse(args.input / ('DFL_02_01_matchinformation_'+args.match)).getroot()
    teams,people={},{}
    for team in info.iter('Team'):
        teams[team.get('TeamId')]=1 if team.get('Role')=='home' else 2
        for p in team.iter('Player'):
            people[p.get('PersonId')]=ROLES.get(p.get('PlayingPosition'),'unknown')
    frames=[{'b':None,'live':0,'poss':0,'p':{}} for _ in range(450)]
    meta={};cur=None;stack=[];first=None
    for ev,el in ET.iterparse(args.input/('DFL_04_03_positions_raw_observed_'+args.match),events=('start','end')):
        if ev=='start':
            stack.append(el)
            if el.tag=='FrameSet': cur=dict(el.attrib)
            continue
        if el.tag=='Frame':
            if cur['GameSection']==args.section:
                n=int(el.get('N'))
                if first is None: first=n
                offset=n-first-25*args.start
                if 0<=offset<450*5 and offset%5==0:
                    f=frames[offset//5]
                    pos=[round(float(el.get('X'))+52.5,2),round(34+float(el.get('Y')),2)]
                    tid=cur.get('TeamId');pid=cur.get('PersonId')
                    if tid=='BALL': f.update(b=pos,live=int(el.get('BallStatus','0')),poss=int(el.get('BallPossession','0')))
                    elif tid in teams:
                        f['p'][pid]=pos;meta[pid]={'team':teams[tid],'role':people.get(pid,'unknown')}
            stack[-2].remove(el)
        elif el.tag=='FrameSet': stack[-2].remove(el)
        stack.pop()
    ids=sorted(meta)
    if any(f['b'] is None or len(f['p'])!=22 for f in frames) or len(ids)!=22:
        raise ValueError('全450フレームで同じ22人が揃うクリップを指定してください')
    if any(meta[k]['role']=='unknown' for k in ids): raise ValueError('役割が欠損しています')
    blue_keeper=next(k for k in ids if meta[k]['team']==1 and meta[k]['role']=='gk')
    rotated=sum(f['p'][blue_keeper][0] for f in frames)/len(frames)>52.5
    if rotated:
        for f in frames:
            f['b']=[round(105-f['b'][0],2),round(68-f['b'][1],2)]
            f['p']={k:[round(105-p[0],2),round(68-p[1],2)] for k,p in f['p'].items()}
    out={'source':SOURCE,'section':args.section,'start':args.start,'hz':5,'rotated180':rotated,'meta':[meta[k] for k in ids], 'frames':[{**f,'p':[f['p'][k] for k in ids]} for f in frames]}
    args.output.write_text(json.dumps(out,separators=(',',':'))+'\n')
    print(len(frames),'frames; 22 anonymous players;',sum(f['live'] for f in frames),'live')

if __name__=='__main__': main()
