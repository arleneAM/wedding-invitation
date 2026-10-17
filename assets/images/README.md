# Image assets

| File | Used for | Notes |
|---|---|---|
| `gallery/01.jpg` … `gallery/09.jpg` | Full-size view (click the centre photo) | 2400px on the long edge, cinematic-graded |
| `gallery/stage/01.jpg` … `09.jpg` | The gallery carousel | 1400px on the long edge |
| `hero-bg.jpg` *(optional)* | Full-screen hero background | 1920x1280 landscape; shows a pastel gradient until added |
| `og-image.jpg` *(optional)* | Social share preview (Facebook/Messenger link preview) | 1200x630 |
| `favicon.svg` | Browser tab icon | Included |

The gallery is a carousel: the current photo is sharp, the neighbouring photos sit smaller and blurred until you move to them (arrows, dots, swipe, arrow keys, or auto-advance). Clicking the centre photo opens the full-size view, which blur-transitions between photos.

## Changing gallery photos

The photo list and captions live in `GALLERY_ITEMS` at the top of the gallery section in `js/main.js` (file number, width, height, caption). To swap or add a photo, add a 2400px copy to `gallery/` and a 1400px copy to `gallery/stage/` with the same filename, then add or edit that entry (width/height lay out the carousel).

The un-resized 4K masters (3840px, graded) are kept outside the website folder, in `Enhanced 4K Photos - Pic weds` on the Desktop.

Tip: compress photos (e.g. with Squoosh) to keep the site fast.
