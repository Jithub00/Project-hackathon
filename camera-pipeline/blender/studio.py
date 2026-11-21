"""Studio for the camera: render settings, a pure black background, a camera with a real focal length, and soft lights.

The HDRI (Poly Haven studio_small_09, CC0) supplies reflections and a little fill, but it is never seen: camera rays
hit a black background instead, so the frames sit on true black like the website.
"""

import math
import os

import bpy
from mathutils import Vector

HDRI_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "studio_small_09_2k.hdr")

# Powers are chosen so that near-black materials read as near-black. A dark, matte surface lit at full studio power
# turns grey, so the key is about 26 W at this distance rather than hundreds.
LIGHT_SPECS = [
    # name,          shape size (m),       location (m),           watts, colour
    ("key",          (1.00, 0.70),        (-0.55, -0.45, 0.35),     40.0, (1.00, 0.97, 0.93)),
    ("fill",         (0.90, 0.90),        (0.65, -0.45, 0.05),      12.0, (0.96, 0.98, 1.00)),
    ("rim_right",    (0.20, 0.90),        (0.45, 0.60, 0.40),       70.0, (1.00, 1.00, 1.00)),
    ("rim_left",     (0.15, 0.80),        (-0.60, 0.55, 0.20),      30.0, (0.90, 0.95, 1.00)),
    ("top",          (0.80, 0.50),        (0.00, -0.10, 0.70),      10.0, (1.00, 1.00, 1.00)),
    ("accent_red",   (0.12, 0.12),        (-0.75, -0.25, -0.20),     4.0, (0.89, 0.14, 0.14)),
]


def configure_render(size, samples, device="OPTIX"):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    preferences = bpy.context.preferences.addons["cycles"].preferences
    preferences.compute_device_type = device
    preferences.refresh_devices()
    for device_entry in preferences.devices:
        device_entry.use = device_entry.type == device
    scene.cycles.device = "GPU"

    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.cycles.max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False

    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.view_settings.view_transform = "Khronos PBR Neutral"
    except TypeError:
        scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def build_world(strength=0.12):
    world = bpy.data.worlds.new("Studio")
    bpy.context.scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()

    output = tree.nodes.new("ShaderNodeOutputWorld")
    light_path = tree.nodes.new("ShaderNodeLightPath")
    environment = tree.nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(os.path.abspath(HDRI_PATH))
    hdri_background = tree.nodes.new("ShaderNodeBackground")
    hdri_background.inputs["Strength"].default_value = strength
    black_background = tree.nodes.new("ShaderNodeBackground")
    black_background.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    black_background.inputs["Strength"].default_value = 0.0
    mix = tree.nodes.new("ShaderNodeMixShader")

    tree.links.new(environment.outputs["Color"], hdri_background.inputs["Color"])
    # Camera rays see black; every other ray (reflections, bounce light) sees the HDRI.
    tree.links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    tree.links.new(hdri_background.outputs["Background"], mix.inputs[1])
    tree.links.new(black_background.outputs["Background"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return world


def _aim(obj, target):
    constraint = obj.constraints.new("TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    return constraint


def build_studio(distance_m=0.38, focal_mm=70.0):
    collection = bpy.data.collections.new("Studio")
    bpy.context.scene.collection.children.link(collection)

    target = bpy.data.objects.new("camera_target", None)
    target.location = (0.0, 0.0, 0.0)
    collection.objects.link(target)

    camera_data = bpy.data.cameras.new("Camera")
    camera_data.lens = focal_mm
    camera_data.sensor_width = 36.0
    camera_data.clip_start = 0.01
    camera_data.clip_end = 20.0
    camera = bpy.data.objects.new("Camera", camera_data)
    camera.location = (0.0, -distance_m, 0.0)
    collection.objects.link(camera)
    _aim(camera, target)
    bpy.context.scene.camera = camera

    lights = {}
    for name, (width, height), location, watts, colour in LIGHT_SPECS:
        light_data = bpy.data.lights.new(name=f"light_{name}", type="AREA")
        light_data.shape = "RECTANGLE"
        light_data.size = width
        light_data.size_y = height
        light_data.energy = watts
        light_data.color = colour
        light = bpy.data.objects.new(f"light_{name}", light_data)
        light.location = location
        collection.objects.link(light)
        _aim(light, target)
        lights[name] = light
    return {"camera": camera, "target": target, "lights": lights}


def build_all(render_size, samples, distance_m=0.38, focal_mm=70.0, device="OPTIX"):
    configure_render(render_size, samples, device)
    build_world()
    return build_studio(distance_m, focal_mm)
