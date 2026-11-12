"""単位・方向・停止・保持交代の抽出規約を小さなXMLで検証する。"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

SCRIPT = Path(__file__).with_name('extract_tracking.py')

class TrackingExtractionTest(unittest.TestCase):
    def test_units_direction_and_phases(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); suffix = 'fixture.xml'
            info = ET.Element('MatchInformation')
            labels = ['TW','LV','IVL','IVR','RV','DML','DMR','OLM','ZO','ORM','STZ']
            for side,role in [(1,'home'),(2,'guest')]:
                team = ET.SubElement(info,'Team',TeamId=str(side),Role=role,LineUp='4-2-3-1')
                for i,label in enumerate(labels): ET.SubElement(team,'Player',PersonId=f'{side}-{i}',PlayingPosition=label)
            ET.ElementTree(info).write(root/('DFL_02_01_matchinformation_'+suffix))
            events = ET.Element('Events')
            ET.ElementTree(events).write(root/('DFL_03_02_events_raw_'+suffix))
            positions = ET.Element('Positions')
            for side in [1,2]:
                direction = 1 if side==1 else -1
                for i in range(11):
                    fs = ET.SubElement(positions,'FrameSet',GameSection='firstHalf',TeamId=str(side),PersonId=f'{side}-{i}')
                    for n in range(0,151,5):
                        ET.SubElement(fs,'Frame',N=str(n),X=str((-50 if i==0 else -30+i*3)*direction),Y=str((i-5)*4*direction),S='7.2')
            ball = ET.SubElement(positions,'FrameSet',GameSection='firstHalf',TeamId='ball')
            for n in range(0,151,5):
                ET.SubElement(ball,'Frame',N=str(n),T=f'2025-01-01T00:00:{n/25:06.3f}+00:00',X='0',Y='0',BallPossession='1' if n<25 else '2',BallStatus='0' if n==0 else '1')
            ET.ElementTree(positions).write(root/('DFL_04_03_positions_raw_observed_'+suffix))
            output = root/'result.json'
            subprocess.run([sys.executable,str(SCRIPT),'--input',str(root),'--output',str(output)],check=True,capture_output=True)
            data = json.loads(output.read_text())
            self.assertEqual(data['kinematics']['meanSpeed'],2)
            self.assertAlmostEqual(data['kinematics']['distanceKmPer90'],10.8)
            self.assertEqual(data['excluded']['deadOrUnknown'],1)
            self.assertEqual(data['samples']['firstHalf'],30)
            self.assertEqual(data['validation']['win']['n'],15)
            self.assertEqual(data['validation']['loss']['n'],15)
            # 同じ形を180度回転した両チームは、保持/非保持でも同じ座標・寸法になる。
            self.assertEqual(data['validation']['attack']['values'][:7],data['validation']['defend']['values'][:7])
            self.assertEqual(data['validation']['attack']['values'][1:3],[27,36])
            # 保持交代直後の短い停止でも、再開後に古い切り替え局面を引き継がない。
            next(f for f in ball if f.get('N')=='50').set('BallStatus','0')
            ET.ElementTree(positions).write(root/('DFL_04_03_positions_raw_observed_'+suffix))
            subprocess.run([sys.executable,str(SCRIPT),'--input',str(root),'--output',str(output)],check=True,capture_output=True)
            stopped = json.loads(output.read_text())
            self.assertEqual(stopped['samples']['firstHalf'],29)
            self.assertEqual(stopped['validation']['win']['n'],5)
            self.assertEqual(stopped['validation']['loss']['n'],5)

if __name__ == '__main__': unittest.main()
