"""The still of the CDs on their plinth for the homepage's music section (and /music's share card):
src/assets/music/crate-still.png, a transparent PNG so it sits on any dark spread.

Renders the real scene: run the dev server first (PUBLIC_MUSIC=true, `npx astro dev --port 4330`),
then `python scripts/crate-still.py`. It loads /music, lifts the front CD a little (the pose the
page shows when you point at it), draws one frame and reads the canvas back, cropped to what was
drawn. Re-run it when the cases, the jackets or the plinth change.

usage: python scripts/crate-still.py [--url http://127.0.0.1:4330/music] [--lift 0]"""
import argparse, base64, io, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'music' / 'crate-still.png'

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://127.0.0.1:4330/music')
ap.add_argument('--lift', type=int, default=0, help='the slot pointed at (-1: none)')
a = ap.parse_args()

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-angle=default', '--enable-gpu'])
    pg = b.new_page(viewport={'width': 1400, 'height': 1000}, device_scale_factor=2)
    pg.goto(a.url + ('&' if '?' in a.url else '?') + 'tick=timer')
    pg.wait_for_function("document.getElementById('crate')?.dataset.gl === 'on' && window.__crate")
    pg.wait_for_timeout(2500)  # jackets, spines and the booklet arrive when the page is idle
    data = pg.evaluate(
        """async (lift) => {
          const c = window.__crate;
          if (lift >= 0) c.row.focus(lift);
          for (let i = 0; i < 160; i++) c.stage.step(1 / 60);  // let the springs settle
          c.stage.renderer.render(c.stage.scene, c.stage.camera);
          return c.canvas.toDataURL('image/png');
        }""",
        a.lift,
    )
    b.close()

img = Image.open(io.BytesIO(base64.b64decode(data.split(',', 1)[1]))).convert('RGBA')
# crop to what was drawn (the shadow's faint edge counts), with a margin
alpha = img.getchannel('A').point(lambda v: 255 if v > 6 else 0)
box = alpha.getbbox()
pad = 40
img = img.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(img.width, box[2] + pad), min(img.height, box[3] + pad)))
img.save(OUT, optimize=True)
print('wrote', OUT, img.size)
