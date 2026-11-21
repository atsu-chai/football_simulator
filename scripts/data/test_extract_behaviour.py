import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from extract_behaviour import extract
from extract_behaviour_clip import main as extract_clip
from unittest.mock import patch

class BehaviourExtractionTest(unittest.TestCase):
    def test_both_halves_coordinates_sampling_and_anonymity(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);suffix='fixture.xml'
            (root/('DFL_02_01_matchinformation_'+suffix)).write_text('''<Root>
              <Team TeamId="home" Role="home"><Player PersonId="private-home" PlayingPosition="TW"/></Team>
              <Team TeamId="away" Role="away"><Player PersonId="private-away" PlayingPosition="IVL"/></Team>
            </Root>''')
            sets=[]
            for section in ['firstHalf','secondHalf']:
                for tid,pid in [('home','private-home'),('away','private-away'),('BALL','ball')]:
                    extra=' BallStatus="1" BallPossession="2"' if tid=='BALL' else ''
                    rows=''.join(f'<Frame N="{n}" X="-10" Y="5"{extra}/>' for n in [10000,10001])
                    sets.append(f'<FrameSet GameSection="{section}" TeamId="{tid}" PersonId="{pid}">{rows}</FrameSet>')
            (root/('DFL_04_03_positions_raw_observed_'+suffix)).write_text('<Root>'+''.join(sets)+'</Root>')
            output=root/'anonymous.jsonl'
            with contextlib.redirect_stdout(io.StringIO()): extract(root,output)
            rows=[json.loads(s) for s in output.read_text().splitlines()]
            self.assertEqual(len(rows),2)
            self.assertEqual({r['section'] for r in rows},{'firstHalf','secondHalf'})
            self.assertEqual(rows[0]['b'],[42.5,39])
            self.assertEqual(rows[0]['poss'],1)
            self.assertEqual(rows[0]['p'][0][2],'gk')
            self.assertEqual(rows[0]['p'][1][2],'cb')
            self.assertNotIn('private-',output.read_text())
            self.assertFalse(root.joinpath('anonymous.jsonl.partial').exists())
            self.assertEqual(len(json.loads(Path(str(output)+'.source.json').read_text())['inputs'][0]['sha256']),64)

class BehaviourClipTest(unittest.TestCase):
    def test_continuous_clip_is_anonymous_and_blue_attacks_right(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);suffix='fixture.xml';roles=['TW','IVL','IVR','LV','RV','DML','DMR','LM','RM','ZO','STZ']
            teams=[];sets=[]
            for team in ['home','away']:
                people=[]
                for i,role in enumerate(roles):
                    pid=f'private-{team}-{i}'
                    people.append(f'<Player PersonId="{pid}" PlayingPosition="{role}"/>')
                    x=(40 if i==0 else 10) * (1 if team=='home' else -1)
                    frames=''.join(f'<Frame N="{10000+k*5}" X="{x}" Y="5"/>' for k in range(450))
                    sets.append(f'<FrameSet GameSection="firstHalf" TeamId="{team}" PersonId="{pid}">{frames}</FrameSet>')
                teams.append(f'<Team TeamId="{team}" Role="{team}">'+''.join(people)+'</Team>')
            ball=''.join(f'<Frame N="{10000+k*5}" X="0" Y="5" BallStatus="1" BallPossession="1"/>' for k in range(450))
            sets.append('<FrameSet GameSection="firstHalf" TeamId="BALL" PersonId="ball">'+ball+'</FrameSet>')
            (root/('DFL_02_01_matchinformation_'+suffix)).write_text('<Root>'+''.join(teams)+'</Root>')
            (root/('DFL_04_03_positions_raw_observed_'+suffix)).write_text('<Root>'+''.join(sets)+'</Root>')
            output=root/'clip.json'
            with patch('sys.argv',['extract_behaviour_clip','--input',str(root),'--match',suffix,'--start','0','--output',str(output)]),contextlib.redirect_stdout(io.StringIO()):
                extract_clip()
            clip=json.loads(output.read_text())
            self.assertTrue(clip['rotated180']);self.assertEqual(len(clip['frames']),450)
            keeper=next(i for i,p in enumerate(clip['meta']) if p=={'team':1,'role':'gk'})
            self.assertEqual(clip['frames'][0]['p'][keeper],[12.5,29])
            self.assertTrue(all(len(f['p'])==22 for f in clip['frames']))
            self.assertNotIn('private-',output.read_text())

if __name__=='__main__': unittest.main()
