"""Projects the flash head and the front element into the render frame, so the website's flash overlay lines up.

Run headless from the repository root:
  blender -b --factory-startup -P camera-pipeline/blender/anchors.py

Prints JSON: for each progress value, the flash head and the lens centre as percentages of the frame, measured from the
top left. The coordinates come from the same camera and animation that render the frames.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

import sequence  # noqa: E402

FRAME_COUNT = 120
# The front element sits 27.5 mm forward of the lens group origin (the mount face), along the lens axis.
GLASS_LOCAL = Vector((0.0, 0.0, 0.0275))


def to_percent(point_world, camera, scene):
    x, y, _ = world_to_camera_view(scene, camera, point_world)
    return [round(x * 100.0, 2), round((1.0 - y) * 100.0, 2)]


def main():
    objects = sequence.prepare(size=512, samples=1, frame_count=FRAME_COUNT)
    scene = bpy.context.scene
    camera = objects["camera"]
    lens = objects["lens"]
    head = bpy.data.objects["flash_head"]
    result = {}
    for progress in (0.50, 0.56, 0.60, 0.64):
        frame = round(progress * (FRAME_COUNT - 1)) + 1
        scene.frame_set(frame)
        flash_world = head.matrix_world.translation.copy()
        glass_world = lens.matrix_world @ GLASS_LOCAL
        result[str(progress)] = {
            "frame_index": frame - 1,
            "flash": to_percent(flash_world, camera, scene),
            "lens": to_percent(glass_world, camera, scene),
        }
    print("ANCHORS " + json.dumps(result))


if __name__ == "__main__":
    main()
