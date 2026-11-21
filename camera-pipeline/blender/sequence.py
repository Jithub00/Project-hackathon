"""Builds the camera scene, keyframes the shooting sequence, and renders stills or the full frame sequence.

Run headless from the repository root (Blender 5.3):

  blender -b --factory-startup -P camera-pipeline/blender/sequence.py -- build --frames 120 --out camera-pipeline/camera.blend
  blender -b --factory-startup -P camera-pipeline/blender/sequence.py -- still --progress 0.55 --size 800 --samples 48 --out still.png
  blender -b --factory-startup -P camera-pipeline/blender/sequence.py -- sequence --frames 120 --size 1152 --samples 96 --dir frames

Progress runs from 0 to 1 over the frame range. The website maps scroll progress to a frame with
round(progress * (frames - 1)), so frame i always corresponds to progress i / (frames - 1).
"""

import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import camera_model  # noqa: E402
import studio  # noqa: E402

MM = 0.001

# Each track is (progress, value) with smoothstep easing between keys, so every movement starts and ends softly.
# Values: yaw and pitch in degrees, slide and focus and shutter in millimetres, flash hinge in degrees.
YAW_DEG = [(0.00, -26.0), (0.25, -14.0), (0.55, 0.0), (1.00, 0.0)]
PITCH_DEG = [(0.00, 7.0), (0.25, 4.0), (0.55, 0.0), (1.00, 0.0)]
SLIDE_MM = [(0.00, 26.0), (0.25, 0.0), (0.65, 0.0), (0.92, -26.0), (1.00, -26.0)]
FOCUS_MM = [(0.28, 0.0), (0.45, 0.8), (0.55, 0.45), (1.00, 0.45)]
FLASH_DEG = [(0.44, 0.0), (0.52, -70.0), (0.66, -70.0), (0.72, 0.0), (1.00, 0.0)]
SHUTTER_MM = [(0.55, 0.0), (0.58, 1.2), (0.62, 0.0), (1.00, 0.0)]


def sample(track, progress):
    if progress <= track[0][0]:
        return track[0][1]
    for index in range(1, len(track)):
        end_progress, end_value = track[index]
        if progress <= end_progress:
            start_progress, start_value = track[index - 1]
            t = (progress - start_progress) / (end_progress - start_progress)
            eased = t * t * (3.0 - 2.0 * t)
            return start_value + (end_value - start_value) * eased
    return track[-1][1]


def pose_at(progress):
    progress = min(1.0, max(0.0, progress))
    return {
        "yaw": sample(YAW_DEG, progress),
        "pitch": sample(PITCH_DEG, progress),
        "slide": sample(SLIDE_MM, progress),
        "focus": sample(FOCUS_MM, progress),
        "flash": sample(FLASH_DEG, progress),
        "shutter": sample(SHUTTER_MM, progress),
    }


def keyframe_sequence(objects, frame_count):
    root, focus, shutter, flash = objects["root"], objects["focus"], objects["shutter"], objects["flash"]
    rest_shutter_z = shutter.location.z
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frame_count
    for index in range(frame_count):
        progress = index / (frame_count - 1)
        pose = pose_at(progress)
        frame = index + 1
        root.rotation_euler = (math.radians(pose["pitch"]), 0.0, math.radians(pose["yaw"]))
        root.location = (pose["slide"] * MM, 0.0, 0.0)
        root.keyframe_insert(data_path="rotation_euler", frame=frame)
        root.keyframe_insert(data_path="location", index=0, frame=frame)
        focus.location = (0.0, 0.0, pose["focus"] * MM)
        focus.keyframe_insert(data_path="location", index=2, frame=frame)
        flash.rotation_euler = (math.radians(pose["flash"]), 0.0, 0.0)
        flash.keyframe_insert(data_path="rotation_euler", index=0, frame=frame)
        shutter.location.z = rest_shutter_z - pose["shutter"] * MM
        shutter.keyframe_insert(data_path="location", index=2, frame=frame)


def prepare(size, samples, frame_count, device="OPTIX"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = camera_model.build_materials()
    objects = camera_model.build(materials)
    studio_objects = studio.build_all(size, samples, device=device)
    keyframe_sequence(objects, frame_count)
    return {**objects, **studio_objects}


def render_frame(frame_number, path):
    scene = bpy.context.scene
    scene.frame_set(frame_number)
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)

    build = commands.add_parser("build")
    build.add_argument("--frames", type=int, default=120)
    build.add_argument("--size", type=int, default=800)
    build.add_argument("--samples", type=int, default=64)
    build.add_argument("--out", required=True)

    still = commands.add_parser("still")
    still.add_argument("--progress", type=float, required=True)
    still.add_argument("--frames", type=int, default=120)
    still.add_argument("--size", type=int, default=800)
    still.add_argument("--samples", type=int, default=48)
    still.add_argument("--out", required=True)

    sequence = commands.add_parser("sequence")
    sequence.add_argument("--frames", type=int, default=120)
    sequence.add_argument("--size", type=int, default=1152)
    sequence.add_argument("--samples", type=int, default=96)
    sequence.add_argument("--dir", required=True)

    args = parser.parse_args(argv)
    started = time.time()

    if args.command == "build":
        prepare(args.size, args.samples, args.frames)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.out))
        print(f"saved {args.out} in {time.time() - started:.1f}s")
        return

    if args.command == "still":
        prepare(args.size, args.samples, args.frames)
        frame_number = round(args.progress * (args.frames - 1)) + 1
        render_frame(frame_number, args.out)
        print(f"rendered progress {args.progress} (frame {frame_number}) to {args.out} in {time.time() - started:.1f}s")
        return

    if args.command == "sequence":
        prepare(args.size, args.samples, args.frames)
        os.makedirs(args.dir, exist_ok=True)
        for index in range(args.frames):
            path = os.path.join(args.dir, f"frame-{index:03d}.png")
            if os.path.exists(path):
                continue  # resume: frames already rendered are kept
            frame_started = time.time()
            render_frame(index + 1, path)
            print(f"frame {index:03d} rendered in {time.time() - frame_started:.1f}s")
        print(f"sequence finished in {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
