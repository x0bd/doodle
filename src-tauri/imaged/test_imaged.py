"""
The picture maker's protocol, on its stand-in model (no weights needed):
steps said as they are drawn, the picture written, a cancel honoured
within a second (PLAN.md M4.4), and a wrong command answered, not fatal.

  python src-tauri/imaged/test_imaged.py   (with the environment's python, which has PIL)
"""

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


class Maker:
    def __init__(self):
        env = {**os.environ, "DOODLE_IMAGED_FAKE": "1", "PYTHONUNBUFFERED": "1"}
        self.p = subprocess.Popen([sys.executable, os.path.join(HERE, "doodle_imaged.py")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)

    def send(self, obj):
        self.p.stdin.write(json.dumps(obj) + "\n")
        self.p.stdin.flush()

    def read(self):
        line = self.p.stdout.readline()
        return json.loads(line) if line else None

    def until(self, event, id=None):
        seen = []
        while True:
            m = self.read()
            if m is None:
                raise AssertionError(f"it stopped; saw {seen}")
            seen.append(m)
            if m.get("event") == event and (id is None or m.get("id") == id):
                return seen

    def close(self):
        self.send({"op": "quit"})
        self.p.wait(timeout=5)
        self.p.stdin.close()
        self.p.stdout.close()


class Protocol(unittest.TestCase):
    def setUp(self):
        self.m = Maker()
        self.out = tempfile.mkdtemp()

    def tearDown(self):
        self.m.close()

    def test_hello_then_a_picture_step_by_step(self):
        self.m.send({"op": "hello"})
        self.assertEqual(self.m.read()["event"], "ready")
        path = os.path.join(self.out, "a.png")
        self.m.send({"id": "a", "op": "generate", "prompt": "a lighthouse", "seed": 3, "steps": 5, "width": 300, "height": 200, "out": path})
        seen = self.m.until("done", "a")
        steps = [m["step"] for m in seen if m.get("event") == "progress"]
        self.assertEqual(steps, [1, 2, 3, 4, 5])
        done = seen[-1]
        self.assertTrue(os.path.isfile(path))
        # the model draws in 16-pixel cells
        self.assertEqual((done["width"], done["height"]), (288, 256))

    def test_a_cancel_stops_within_a_second(self):
        self.m.send({"id": "b", "op": "generate", "prompt": "x", "seed": 1, "steps": 50, "width": 256, "height": 256, "out": os.path.join(self.out, "b.png")})
        while True:
            m = self.m.read()
            if m.get("event") == "progress" and m["step"] >= 2:
                break
        t0 = time.time()
        self.m.send({"op": "cancel", "id": "b"})
        seen = self.m.until("cancelled", "b")
        self.assertLess(time.time() - t0, 1.0)
        self.assertFalse(os.path.exists(os.path.join(self.out, "b.png")))
        self.assertLess(max(m["step"] for m in seen if m.get("event") == "progress") if any(m.get("event") == "progress" for m in seen) else 0, 50)
        # and it draws again after
        self.m.send({"id": "c", "op": "generate", "prompt": "y", "seed": 2, "steps": 2, "out": os.path.join(self.out, "c.png")})
        self.m.until("done", "c")

    def test_a_wrong_command_is_answered_not_fatal(self):
        self.m.send({"op": "fly"})
        self.assertEqual(self.m.read()["event"], "error")
        self.m.send({"op": "hello"})
        self.assertEqual(self.m.read()["event"], "ready")


if __name__ == "__main__":
    unittest.main(verbosity=2)
