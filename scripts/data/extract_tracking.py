#!/usr/bin/env python3
"""DFL の25Hz XMLを逐次読み取り、5Hzの匿名集計だけを書き出す。標準ライブラリのみ使用。"""
import argparse
from array import array
from collections import defaultdict
from datetime import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import xml.etree.ElementTree as ET

SOURCE = 'Bassek, Rein, Weber & Memmert (2025), DFL / IDSSE; CC BY 4.0; https://doi.org/10.6084/m9.figshare.28196177; https://doi.org/10.1038/s41597-025-04505-y'
BANDS = [0.5, 2, 4, 5.5, 7]
ROLES = {'TW':'gk','IVL':'cb','IVR':'cb','IVZ':'cb','LV':'fb','RV':'fb','DLM':'wb','DRM':'wb','DML':'dm','DMR':'dm','DMZ':'dm','HL':'cm','HR':'cm','LM':'wg','RM':'wg','OLM':'wg','ORM':'wg','LA':'wg','RA':'wg','ZO':'am','STL':'st','STR':'st','STZ':'st'}

def family(formation):
    if formation.startswith('3'): return 'three'
    if formation.startswith('4-2-3'): return '4231'
    if formation.startswith('4-3-3'): return '433'
    return '442'

class Mean:
    def __init__(self): self.n = 0; self.s = None
    def add(self, values):
        if self.s is None: self.s = [0.] * len(values)
        self.n += 1
        for i, v in enumerate(values): self.s[i] += v
    def result(self): return [round(x / self.n, 4) for x in self.s] if self.n else []

def quantile(hist, q, step=0.1):
    target = sum(hist) * q; s = 0
    for i, n in enumerate(hist):
        s += n
        if s >= target: return round((i + .5) * step, 3)
    return 0

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input', default=os.environ.get('IDSSE_DIR'))
    ap.add_argument('--output', default='src/data/tracking.json')
    args = ap.parse_args()
    if not args.input: ap.error('--input または IDSSE_DIR が必要です')
    root = Path(args.input)
    team_cells = defaultdict(Mean); grids = defaultdict(Mean); roles = defaultdict(Mean); metrics = defaultdict(Mean)
    hist = defaultdict(lambda: [0]*121); bands = [0]*6; manifest = []; formation_counts = defaultdict(int)
    counts = defaultdict(int); acceleration = [0]*121; positive_accel = [0]*121; negative_accel = [0]*121; turns = [0]*181; role_motion = defaultdict(Mean)
    restarts = defaultdict(Mean); full_motion = defaultdict(Mean); lag_pairs = [Mean() for _ in range(16)]; exclusions = defaultdict(int)
    paths = sorted(root.glob('DFL_04_03*.xml'))
    if not paths: ap.error('入力ディレクトリにトラッキングXMLがありません')
    for path in paths:
        suffix = path.name.split('observed_')[1]
        info = ET.parse(root / ('DFL_02_01_matchinformation_' + suffix)).getroot()
        teams = {}; people = {}
        for t in info.iter('Team'):
            tid = t.get('TeamId'); teams[tid] = (1 if t.get('Role') == 'home' else 2, family(t.get('LineUp', '')))
            formation_counts[t.get('LineUp')] += 1
            for p in t.iter('Player'): people[p.get('PersonId')] = (tid, ROLES.get(p.get('PlayingPosition')))
        # 半分ごと・選手ごとの小さな数値配列。XML要素は各Frame直後に親から除去する。
        tracks = {}; balls = {}; stack = []; current = None; digest = hashlib.sha256()
        with path.open('rb') as raw:
            for event, el in ET.iterparse(raw, events=('start','end')):
                if event == 'start':
                    stack.append(el)
                    if el.tag == 'FrameSet':
                        current = dict(el.attrib); current['rows'] = array('f')
                    continue
                if el.tag == 'Frame':
                    a = el.attrib; n = int(a['N'])
                    if n % 5 == 0 and current is not None:
                        if 'BallStatus' in a:
                            sec = current['GameSection']
                            balls.setdefault(sec, {})[n] = (float(a['X']),float(a['Y']),int(a.get('BallPossession','0')),int(a['BallStatus']),datetime.fromisoformat(a['T']).timestamp())
                        elif current.get('TeamId') in teams:
                            current['rows'].extend((n,float(a['X']),float(a['Y']),float(a.get('S',0))/3.6))
                    stack[-2].remove(el)
                elif el.tag == 'FrameSet':
                    if current.get('TeamId') in teams:
                        tracks[(current['GameSection'],current.get('PersonId'))] = (current['TeamId'],current['rows'])
                    current = None; stack[-2].remove(el)
                stack.pop()
        # 入力の同一性を記録。大きなXMLをメモリへ取り込まない。
        with path.open('rb') as raw:
            for chunk in iter(lambda: raw.read(1024*1024), b''): digest.update(chunk)
        entry = {'file':path.name,'sha256':digest.hexdigest()}
        for label,prefix in [('information','DFL_02_01_matchinformation_'),('events','DFL_03_02_events_raw_')]:
            entry[label+'Sha256'] = hashlib.sha256((root/(prefix+suffix)).read_bytes()).hexdigest()
        manifest.append(entry)
        for sec, ball_frames in balls.items():
            frames = defaultdict(list); dirs = {}; means = {}
            for (section,pid),(tid,rows) in tracks.items():
                if section != sec or not rows: continue
                mx = sum(rows[1::4])/ (len(rows)//4); my = sum(rows[2::4])/(len(rows)//4)
                means[pid] = (tid,mx,my)
                if people.get(pid,(None,None))[1] == 'gk': dirs[tid] = 1 if mx < 0 else -1
            known = [(pid,*v) for pid,v in means.items() if people.get(pid,(None,None))[1] not in (None,'gk')]
            for (section,pid),(tid,rows) in tracks.items():
                if section != sec: continue
                role = people.get(pid,(None,None))[1]
                if role is None and pid in means:
                    # 交代選手のラベル欠損は同チームの平均位置が最も近い既知選手で補う。
                    _,mx,my = means[pid]
                    candidates = [(math.hypot(mx-x,my-y),p) for p,t,x,y in known if t == tid]
                    if candidates: role = people[min(candidates)[1]][1]
                if role is None: continue
                prev = None; prev_v = None
                for i in range(0,len(rows),4):
                    n,x,y,s = rows[i:i+4]; n = int(n)
                    a = None; turn = None
                    if prev is not None and n-prev[0] == 5:
                        vx = (x-prev[1])/.2; vy = (y-prev[2])/.2
                        # 提供速度を使用し、旋回は5Hzの位置差分で求める。
                        a = (s-prev[3])/.2
                        if prev_v and s > 2 and math.hypot(*prev_v) > 2:
                            turn = abs(math.atan2(vx*prev_v[1]-vy*prev_v[0],vx*prev_v[0]+vy*prev_v[1]))*180/math.pi
                        prev_v = (vx,vy)
                    else: prev_v = None
                    frames[n].append((tid,role,x,y,s,a,turn)); prev = (n,x,y,s)
                    if role != 'gk' and abs(x)<53 and abs(y)<35: full_motion[role].add([s])
            last = None; changed = -1e9; last_n = -100; valid = 0; lateral = {}
            for n,b in sorted(ball_frames.items()):
                bx,by,pos,active,timestamp = b
                if not active or pos not in (1,2):
                    exclusions['deadOrUnknown'] += 1; last = None; changed = -1e9; last_n = n; continue
                if last is not None and pos != last and n-last_n == 5: changed = n
                last = pos; last_n = n
                roster = frames.get(n,[])
                if any(sum(t == tid for t,*_ in roster) != 11 for tid in teams):
                    exclusions['not11v11OrMissing'] += 1; continue
                if len(dirs) != 2 or abs(bx)>52.5 or abs(by)>34: continue
                valid += 1
                for tid in teams:
                    lateral[(tid,n)] = (by, sum(y for t,r,x,y,*_ in roster if t==tid and r!='gk')/10)
                for tid,(pos_id,fam) in teams.items():
                    direction = dirs[tid]
                    players = [(r,52.5+x*direction,34+y*direction,s,a,tr) for t,r,x,y,s,a,tr in roster if t == tid and r != 'gk']
                    if len(players)!=10: continue
                    ballx,bally = 52.5+bx*direction,34+by*direction
                    phase = ('win' if pos==pos_id else 'loss') if n-changed<75 else ('attack' if pos==pos_id else 'defend')
                    xs = sorted(p[1] for p in players); ys = [p[2] for p in players]
                    line = sum(xs[:4])/4; length = xs[-1]-xs[0]; width = max(ys)-min(ys); cy = sum(ys)/10
                    values = [xs[0],length,width,cy,line,sum(xs[4:7])/3,sum(xs[7:])/3]
                    ix = min(11,int(ballx/105*12)); iy = min(7,int(bally/68*8))
                    for f in ['all',fam]: grids[(f,phase,ix,iy)].add(values)
                    team_cells[(len(manifest),pos_id,phase,ix,iy)].add(values)
                    for r,x,y,s,a,tr in players:
                        for f in ['all',fam]: roles[(f,phase,r)].add([(x-xs[0])/max(length,1),abs(y-cy)/max(width,1)])
                        bands[sum(s>=v for v in BANDS)] += 1; hist['speed'][min(120,int(s*10))] += 1
                        role_motion[r].add([s])
                        if a is not None and abs(a)<12.1:
                            acceleration[int(abs(a)*10)] += 1
                            (positive_accel if a>=0 else negative_accel)[int(abs(a)*10)] += 1
                        if tr is not None: turns[min(180,int(tr))] += 1
                    dists = [math.hypot(x-ballx,y-bally) for _,x,y,*_ in players]
                    spacing = sum(min(math.hypot(p[1]-q[1],p[2]-q[2]) for j,q in enumerate(players) if j!=i) for i,p in enumerate(players))/10
                    # 保持者の代理はボールに最も近い保持側選手。3m以内の場合だけ圧力を測る。
                    own_roster = [(t,r,x,y) for t,r,x,y,*_ in roster if teams[t][0]==pos]
                    carrier = min(own_roster,key=lambda p:math.hypot(p[2]-bx,p[3]-by))
                    pressure = min(math.hypot(x-carrier[2],y-carrier[3]) for t,r,x,y,*_ in roster if teams[t][0]!=pos)
                    metrics[phase].add(values + [sum(d<10 for d in dists),sum(d<20 for d in dists),spacing])
                    if pos==pos_id and math.hypot(carrier[2]-bx,carrier[3]-by)<3: metrics['pressure'].add([pressure])
            # ボールの横移動とチーム重心の1秒差分の相関を、0〜3秒の遅れで測る。
            for (tid,n),(by,cy) in lateral.items():
                old = lateral.get((tid,n-25))
                if old is None: continue
                bv = by-old[0]
                for lag,acc in enumerate(lag_pairs):
                    later = lateral.get((tid,n+lag*5)); earlier = lateral.get((tid,n+lag*5-25))
                    if later is None or earlier is None: continue
                    cv = later[1]-earlier[1]
                    acc.add([bv,cv,bv*bv,cv*cv,bv*cv])
            # イベント時刻と5Hzトラッキングの最近傍を対応。再開直後の形を別集計する。
            events = ET.parse(root / ('DFL_03_02_events_raw_' + suffix)).getroot()
            time_index = {round(b[4]*5):n for n,b in ball_frames.items()}
            for ev in events.iter('Event'):
                stamp = ev.get('EventTime')
                if not stamp: continue
                k = round(datetime.fromisoformat(stamp).timestamp()*5)
                n = time_index.get(k)
                if n is None: continue
                kind = next((e.tag for e in ev.iter() if e.tag in ('CornerKick','GoalKick','ThrowIn','FreeKick')),None)
                if not kind: continue
                roster = frames.get(n,[])
                for tid in teams:
                    out = [(x,y) for t,r,x,y,*_ in roster if t==tid and r!='gk']
                    if len(out)==10: restarts[kind].add([max(x for x,y in out)-min(x for x,y in out),max(y for x,y in out)-min(y for x,y in out)])
            counts[sec] += valid
        print(path.name, 'sampled',dict(counts),flush=True)
    if not bands or not sum(bands): ap.error('有効な11対11のインプレー標本がありません')
    # ボール位置を揃えてチーム間の形の残差を測る。戦術の因果効果ではなく変形量の参考幅。
    residuals = {}
    for (match,team,phase,ix,iy),cell in team_cells.items():
        base = grids[('all',phase,ix,iy)].result()
        key = (match,team,phase)
        n,sums = residuals.setdefault(key,[0,[0.]*7])
        residuals[key][0] += cell.n
        for j,value in enumerate(cell.result()): sums[j] += (value-base[j])*cell.n
    variation = {}
    for phase in ['attack','defend','win','loss']:
        rows = [[x/n for x in values] for (_,_,p),(n,values) in residuals.items() if p==phase and n>=500]
        def percentile(values,q):
            values = sorted(values)
            return values[round((len(values)-1)*q)] if values else 0
        variation[phase] = {'teams':len(rows),'p10':[round(percentile([r[j] for r in rows],.1),4) for j in range(7)],'p90':[round(percentile([r[j] for r in rows],.9),4) for j in range(7)]}
    correlations = []
    for v in lag_pairs:
        bx,cy,b2,c2,bc = v.result() if v.n else [0]*5
        correlations.append((bc-bx*cy)/max(1e-9,math.sqrt(max(0,b2-bx*bx)*max(0,c2-cy*cy))))
    best_lag = max(range(len(correlations)),key=lambda i:correlations[i])*.2
    output = {'_comment':'派生・匿名集計。出典: '+SOURCE,'schema':1,'hz':5,'grid':[12,8],
        'columns':['back','length','width','cy','defensiveLine','midfieldLine','frontLine'],
        'method':{'shape':'11対11・インプレーのみ、GK除外、攻撃方向を180度回転して正規化。win/lossは保持交代後3秒。','speed':'提供S(km/h)を3.6で除算。全インプレー局面のフィールド選手。','fallback':'セル平均を全体平均へ縮約、役割平均と編成スロットを併用。交代後の布陣変更は未同定。','pressure':'最寄り保持側選手がボール3m以内の時の最寄り相手距離。','distance':'停止込みの追跡期間の平均速度×5400秒。交代選手は出場時間換算。インプレー速度×90分も別記。','lag':'ボールとチーム重心の横方向1秒差分の相関最大点。因果的な反応時間の同定ではない。'},
        'inputs':manifest,'formations':dict(formation_counts),'samples':dict(counts),'excluded':dict(exclusions),
        'styleVariation':variation,
        'cells':{'|'.join(map(str,k)):[v.n,*v.result()] for k,v in sorted(grids.items())},
        'roles':{'|'.join(k):[v.n,*v.result()] for k,v in sorted(roles.items())},
        'validation':{k:{'n':v.n,'values':v.result()} for k,v in sorted(metrics.items())},
        'kinematics':{'bands':BANDS,'shares':[round(n/sum(bands),5) for n in bands], 'meanSpeed':round(sum(v.s[0] for v in role_motion.values())/sum(v.n for v in role_motion.values()),4),'distanceKmPer90':round(sum(v.s[0] for v in full_motion.values())/sum(v.n for v in full_motion.values())*5.4,4),'fullDistanceByRole':{r:round(v.result()[0]*5.4,3) for r,v in full_motion.items()},'responseLagSeconds':round(best_lag,2),'responseCorrelation':[round(v,4) for v in correlations],'speedP999':quantile(hist['speed'],.999),'speedP95':quantile(hist['speed'],.95),'speedP99':quantile(hist['speed'],.99),'accelP90':quantile(acceleration,.90),'accelP99':quantile(acceleration,.99),'positiveAccelP90':quantile(positive_accel,.9),'decelerationP90':quantile(negative_accel,.9),'turnP90DegreesPerSample':quantile(turns,.9,1),'byRole':{r:v.result()[0] for r,v in sorted(role_motion.items())}},
        'restarts':{k:{'n':v.n,'lengthWidth':v.result()} for k,v in restarts.items()}}
    out = Path(args.output); out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
    print('written',out,out.stat().st_size,'bytes',flush=True)

if __name__ == '__main__': main()
