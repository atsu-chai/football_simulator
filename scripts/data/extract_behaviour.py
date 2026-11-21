#!/usr/bin/env python3
"""全試合・両ハーフの匿名1Hz追跡。入力XMLは読み取り専用。共通TS計測へ渡す。"""
import argparse
import hashlib
from collections import defaultdict
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from extract_tracking import ROLES, SOURCE

def extract(root, output):
    manifests = []
    partial=output.with_suffix(output.suffix+'.partial')
    with partial.open('w') as out:
        for path in sorted(root.glob('DFL_04_03*.xml')):
            suffix = path.name.split('observed_')[1]
            info = ET.parse(root / ('DFL_02_01_matchinformation_' + suffix)).getroot()
            teams, people = {}, {}
            for t in info.iter('Team'):
                teams[t.get('TeamId')] = 0 if t.get('Role') == 'home' else 1
                for p in t.iter('Player'):
                    people[p.get('PersonId')] = ROLES.get(p.get('PlayingPosition'))
            frames = defaultdict(lambda: {'b': None, 'live': False, 'poss': -1, 'p': []})
            stack, cur = [], None
            ids = {}
            for event, el in ET.iterparse(path, events=('start', 'end')):
                if event == 'start':
                    stack.append(el)
                    if el.tag == 'FrameSet': cur = dict(el.attrib)
                    continue
                if el.tag == 'Frame':
                    n = int(el.get('N'))
                    if n % 25 == 0 and cur['GameSection'] in ('firstHalf', 'secondHalf'):
                        f = frames[(cur['GameSection'], n)]
                        x, y = float(el.get('X'))+52.5, 34+float(el.get('Y'))
                        if cur.get('TeamId') == 'BALL':
                            f.update(b=[x,y], live=el.get('BallStatus') == '1', poss=int(el.get('BallPossession', '0'))-1)
                        elif cur.get('TeamId') in teams:
                            pid = cur.get('PersonId')
                            if pid not in ids: ids[pid] = len(ids)
                            f['p'].append([ids[pid], teams[cur['TeamId']], people.get(pid), x, y])
                    stack[-2].remove(el)
                elif el.tag == 'FrameSet': stack[-2].remove(el)
                stack.pop()
            # 欠損した交代選手の役割だけ同チームの平均位置から補完（既存抽出と同じ）。
            for section in ('firstHalf', 'secondHalf'):
                rows = [(n,f) for (s,n),f in sorted(frames.items()) if s == section]
                positions = defaultdict(list)
                for _,f in rows:
                    for p in f['p']: positions[p[0]].append(p)
                known = []
                for ps in positions.values():
                    p = ps[0]
                    if p[2] and p[2] != 'gk': known.append((p[1],p[2],sum(q[3] for q in ps)/len(ps),sum(q[4] for q in ps)/len(ps)))
                roles = {}
                for pid,ps in positions.items():
                    p = ps[0]
                    if p[2]: roles[pid] = p[2]; continue
                    mx,my = sum(q[3] for q in ps)/len(ps),sum(q[4] for q in ps)/len(ps)
                    candidates = [((mx-x)**2+(my-y)**2,r) for t,r,x,y in known if t == p[1]]
                    roles[pid] = min(candidates)[1] if candidates else 'unknown'
                directions=[1,-1]
                for team in [0,1]:
                    keepers=[p for ps in positions.values() for p in ps if p[1]==team and p[2]=='gk']
                    if keepers: directions[team]=1 if sum(p[3] for p in keepers)/len(keepers)<52.5 else -1
                for n,f in rows:
                    f['directions']=directions
                    if not f['b']: continue
                    for p in f['p']: p[2] = roles[p[0]]
                    out.write(json.dumps(dict(match=path.stem, section=section, t=n/25, **f),separators=(',',':'))+'\n')
            with path.open('rb') as raw: digest=hashlib.file_digest(raw,'sha256').hexdigest()
            manifests.append({'file':path.name,'sha256':digest,'informationSha256':hashlib.sha256((root/('DFL_02_01_matchinformation_'+suffix)).read_bytes()).hexdigest()})
            print(path.name, len(frames), flush=True)
    partial.replace(output)
    Path(str(output)+'.source.json').write_text(json.dumps({'source':SOURCE,'inputs':manifests},ensure_ascii=False))

if __name__ == '__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input',type=Path,required=True)
    ap.add_argument('--output',type=Path,default=Path('/tmp/behaviour-real.jsonl'))
    a=ap.parse_args(); extract(a.input,a.output)
