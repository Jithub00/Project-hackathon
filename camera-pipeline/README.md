# Camera pipeline

The camera section on the homepage plays 120 Blender renders, scrubbed by scroll. This folder holds everything needed to rebuild them: the Blender scene, the scripts, the render settings, the reference photographs, and the licence records for every downloaded asset.

## Tools actually used

| Tool | Used for | Notes |
| --- | --- | --- |
| Blender 5.3.0 (portable, Windows x64) | Modelling, materials, lights, animation and rendering | Run headless with `blender -b --factory-startup -P <script>`. Installed to `%USERPROFILE%\tools`, outside the repository. |
| Cycles with OptiX | Rendering | NVIDIA GeForce RTX 4070 Laptop GPU. OpenImageDenoise for the final frames. |
| Blender MCP | Not used | The MCP server is not connected in this session, so nothing here relies on it. |
| Poly Haven (CC0) | Studio HDRI for reflections and a little fill light | `studio_small_09`, 2K. See `licenses/`. |
| Sketchfab | Not used | No licensed camera model was downloaded. The model is built from primitives in `blender/camera_model.py`. |
| Pillow (Python 3.13) | WebP export of the frames | `tools/export_frames.py` |
| Playwright | Verification of the website | `tests/e2e/motion.spec.ts` and the screenshots |

## The model

`blender/camera_model.py` builds the camera at real-world scale, in metres (the script works in millimetres and converts).

- **Body:** 120 mm wide, 67 mm high, 43 mm deep, with 9 mm rounded edges. The grip protrudes 14.5 mm forward of the mount face and carries a pebbled rubber texture.
- **Top:** a domed shutter button on a metal ring, a knurled mode dial, a power lever, a hot shoe with a contact slot, three microphone holes, and a pop-up flash on a rear hinge.
- **Viewfinder and rear:** an electronic viewfinder hump on the top right with a rubber eyecup, a tilting rear screen, and four rear buttons.
- **Lens:** a 16 to 50 mm kit lens, 64.7 mm across, extended 30 mm from the mount. It has a stepped barrel, a ridged zoom ring (96 ridges), narrow retaining rings, a 40.5 mm filter-thread ring, a recessed convex front element 39 mm across (smaller than the 63 mm barrel), and dark internal baffles.
- **Materials:** Principled BSDF materials with object-space grain. The coated front element is opaque and glossy with thin-film-like colour in its reflections (violet, blue, green).
- **Branding:** none. There is no text, logo or model name anywhere in the scene.

The model is an original build. It matches the proportions of the reference photographs as closely as I could measure them. It is not a scan.

### Reference dimensions and where they came from

- Body: 120 × 66.9 × 59.4 mm, including the grip. Sources: [PetaPixel spec table](https://petapixel.com/pixelmeter/sony-a6100/) and [Cameradecision](https://cameradecision.com/compare/Sony-Alpha-a6100-vs-Sony-Alpha-a6100), which both list the body at about 120 × 67 × 59 mm.
- Lens (E PZ 16-50 mm F3.5-5.6 OSS, SELP1650): 64.7 mm diameter, 29.9 mm long when collapsed, 40.5 mm filters. Sources: [Sony Malaysia store specifications](https://store.sony.com.my/blogs/4331287380002_31102680006690/4331287380002_specifications), [Imaging Resource](https://old.imaging-resource.com/lenses/sony/e-16-50mm-f3.5-5.6-pz-oss-selp1650/specifications) and [Michael Hohner's lens data](https://www.mhohner.de/sony-minolta/onelens/e16-50f35). The extended length is not published, so the 30 mm extension is an assumption.

## Animation

`blender/sequence.py` keyframes the scene for each frame. Progress runs from 0 to 1 over the 120 frames. Each track is smooth-stepped between its keys.

| Progress | Movement |
| --- | --- |
| 0.00 to 0.25 | Reveal: the camera starts at a three-quarter view (yaw −26°, pitch 7°) and slides in 26 mm, settling to the front. |
| 0.25 to 0.55 | Position and focus: the camera turns to face the viewer. The inner lens elements move forward 0.8 mm and back to 0.45 mm. The outer barrel never telescopes. |
| 0.44 to 0.72 | Flash: the pop-up flash rises 70° on its hinge at 0.52, stays up through the capture, and returns to the body by 0.72. |
| 0.55 to 0.62 | Capture: the shutter button depresses 1.2 mm and returns. |
| 0.92 to 1.00 | The camera slides 26 mm to the left to make room for the photograph, which the website reveals on the right. |

The flash emission and the reflection across the lens are not rendered. They are a timed overlay in the browser, positioned from `blender/anchors.py`, so they finish even if scrolling stops.

## Render settings

- Engine: Cycles, GPU (OptiX), 1152 × 1152 px, 96 samples, adaptive sampling at threshold 0.01, 8 bounces, OpenImageDenoise.
- Colour: Khronos PBR Neutral view transform, exposure 0, PNG at 8 bits.
- Camera: 70 mm focal length on a 36 mm sensor, 0.38 m from the body centre, aimed at the origin.
- Background: camera rays see pure black. The HDRI only lights and reflects the scene, so the frames sit on true black.
- Lights (area lights, watts): key 40 W, fill 12 W, right rim 70 W, left rim 30 W, top 10 W, red accent 4 W. The powers are low on purpose: dark materials turn grey under studio power.
- World: HDRI at strength 0.12.

## Rebuilding

From the repository root, with Blender 5.3.0 on the path given in `sequence.py`:

```bash
blender -b --factory-startup -P camera-pipeline/blender/sequence.py -- build --out camera-pipeline/blender/camera.blend
blender -b --factory-startup -P camera-pipeline/blender/sequence.py -- still --progress 0.6 --size 800 --samples 32 --out still.png
blender -b --factory-startup -P camera-pipeline/blender/sequence.py -- sequence --frames 120 --size 1152 --samples 96 --dir <master-dir>
blender -b --factory-startup -P camera-pipeline/blender/anchors.py
python camera-pipeline/tools/export_frames.py <master-dir>
```

`sequence` skips frames that already exist, so an interrupted run resumes. The export writes `public/camera/frames/desktop` (1152 px, WebP quality 84) and `public/camera/frames/mobile` (640 px, quality 82).

## Files

- `blender/camera_model.py`: the model and its materials.
- `blender/studio.py`: render settings, the black background, the camera and the lights.
- `blender/sequence.py`: the animation tracks, keyframing, and the `build`, `still` and `sequence` commands.
- `blender/anchors.py`: projects the flash and the lens into frame coordinates.
- `blender/camera.blend`: the editable scene with the keyframes. The HDRI is referenced by path, so keep `assets/` beside it.
- `tools/export_frames.py`: PNG to WebP.
- `references/`: the two reference photographs supplied for this work.
- `assets/studio_small_09_2k.hdr`: the Poly Haven HDRI.
- `licenses/`: the licence records.

## Known limits

- The model is built from primitives. It reads as a studio render, but it is not photorealistic in the way a scan or an artist-made model would be. Panel seams, the rear screen's contents and the coating colour on the glass are simplified.
- The comparison with the reference photographs is visual, not measured.
- The website does not verify frame rate on real phones.
