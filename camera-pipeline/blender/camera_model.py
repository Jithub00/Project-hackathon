"""Model of a compact mirrorless camera with a 16-50 mm power-zoom kit lens, built at real-world scale in Blender.

Units: all dimensions below are millimetres and are converted to metres (Blender's unit) by MM.

Reference proportions (manufacturer and retailer figures, see camera-pipeline/README.md):
  body 120 x 66.9 x 59.4 mm including the grip, lens 64.7 mm across, 29.9 mm collapsed, 40.5 mm filter thread.

Frame of the body: X to the viewer's right, Y positive toward the rear, Z up. The lens mount faces -Y, so the
camera's front faces the default front camera in studio.py. The lens is built along local +Z and rotated so that it
points out of the front (-Y).

Nothing here carries a logo, a model name or a manufacturer mark. Every part is a plain shape.
"""

import math

import bmesh
import bpy
from mathutils import Matrix

MM = 0.001
COLLECTION = "Camera"

# Dimensions for the body (millimetres).
BODY_W, BODY_H, BODY_D = 120.0, 67.0, 43.0
BODY_EDGE_RADIUS = 9.0
GRIP = dict(x=-45.5, y=-18.0, z=0.0, w=30.0, d=36.0, h=63.0, radius=9.0)
MOUNT_Y = -BODY_D / 2  # the lens mount sits on the front face.
TOP_Z = BODY_H / 2

# The lens sits on the mount and extends by LENS_EXTENSION_MM (zoomed out to 16 mm, not collapsed).
LENS_EXTENSION_MM = 30.0
GLASS_RADIUS = 19.5


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_color, alpha=1.0):
    value = hex_color.lstrip("#")
    red, green, blue = (int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(red), srgb_to_linear(green), srgb_to_linear(blue), alpha)


# ----------------------------------------------------------------------------------------------------------------------
# Materials. Each is a Principled BSDF with small procedural detail, in object space so the grain is at real size.
# ----------------------------------------------------------------------------------------------------------------------


def _principled(name, base_hex, roughness, metallic=0.0, specular=0.5, coat=0.0, coat_roughness=0.1,
                transmission=0.0, ior=1.45, anisotropic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_to_linear(base_hex)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Specular IOR Level"].default_value = specular
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    bsdf.inputs["Transmission Weight"].default_value = transmission
    bsdf.inputs["IOR"].default_value = ior
    bsdf.inputs["Anisotropic"].default_value = anisotropic
    return material, tree, bsdf


def _object_noise(tree, scale, detail=8.0, roughness=0.55):
    coord = tree.nodes.new("ShaderNodeTexCoord")
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    noise.inputs["Roughness"].default_value = roughness
    tree.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    return noise


def _bump(tree, bsdf, height_output, strength, distance=0.0008):
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    tree.links.new(height_output, bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def _roughness_variation(tree, bsdf, noise_output, low, high):
    span = tree.nodes.new("ShaderNodeMapRange")
    span.inputs["To Min"].default_value = low
    span.inputs["To Max"].default_value = high
    tree.links.new(noise_output, span.inputs["Value"])
    tree.links.new(span.outputs["Result"], bsdf.inputs["Roughness"])


def _coating_tint(tree, bsdf):
    """Thin-film style colour: violet at grazing angles, blue and green in the middle, as on a coated front element."""
    facing = tree.nodes.new("ShaderNodeLayerWeight")
    facing.inputs["Blend"].default_value = 0.35
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    stops = ramp.color_ramp.elements
    stops[0].position = 0.0
    stops[0].color = (0.30, 0.20, 0.45, 1.0)
    second = stops.new(0.45)
    second.color = (0.10, 0.30, 0.55, 1.0)
    third = stops.new(0.75)
    third.color = (0.12, 0.55, 0.40, 1.0)
    tree.links.new(facing.outputs["Facing"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Specular Tint"])


def build_materials():
    materials = {}

    material, tree, bsdf = _principled("body_matte", "#111112", roughness=0.5, specular=0.45, coat=0.05)
    _roughness_variation(tree, bsdf, _object_noise(tree, 260.0, 4.0).outputs["Fac"], 0.42, 0.62)
    _bump(tree, bsdf, _object_noise(tree, 1400.0, 10.0).outputs["Fac"], strength=0.08)
    materials["body_matte"] = material

    material, tree, bsdf = _principled("grip_rubber", "#161617", roughness=0.78, specular=0.4)
    pebble = tree.nodes.new("ShaderNodeTexVoronoi")
    pebble.feature = "F1"
    pebble.inputs["Scale"].default_value = 330.0
    coord = tree.nodes.new("ShaderNodeTexCoord")
    tree.links.new(coord.outputs["Object"], pebble.inputs["Vector"])
    _bump(tree, bsdf, pebble.outputs["Distance"], strength=0.55, distance=0.0015)
    _roughness_variation(tree, bsdf, _object_noise(tree, 180.0, 3.0).outputs["Fac"], 0.68, 0.86)
    materials["grip_rubber"] = material

    material, tree, bsdf = _principled("barrel_plastic", "#0e0e10", roughness=0.35, specular=0.5)
    _bump(tree, bsdf, _object_noise(tree, 900.0, 8.0).outputs["Fac"], strength=0.025)
    materials["barrel_plastic"] = material

    material, tree, bsdf = _principled("rubber_ribbed", "#101012", roughness=0.72, specular=0.4)
    _bump(tree, bsdf, _object_noise(tree, 600.0, 6.0).outputs["Fac"], strength=0.08)
    materials["rubber_ribbed"] = material

    material, tree, bsdf = _principled("metal_satin", "#8a8e95", roughness=0.22, metallic=1.0, anisotropic=0.3)
    materials["metal_satin"] = material

    material, tree, bsdf = _principled("metal_dark", "#2a2b2f", roughness=0.38, metallic=1.0)
    materials["metal_dark"] = material

    material, tree, bsdf = _principled("plastic_dark", "#0b0b0c", roughness=0.46, specular=0.5)
    materials["plastic_dark"] = material

    material, tree, bsdf = _principled("screen_glass", "#050608", roughness=0.03, coat=1.0, coat_roughness=0.02)
    materials["screen_glass"] = material

    # Opaque and very glossy: a coated front element reads as dark glass that reflects its surroundings, and
    # transmission would otherwise swamp the reflections.
    material, tree, bsdf = _principled("glass_coated", "#0b0d11", roughness=0.025, ior=1.5, specular=1.0,
                                       coat=0.25, coat_roughness=0.03)
    _coating_tint(tree, bsdf)
    materials["glass_coated"] = material

    material, tree, bsdf = _principled("glass_inner", "#0b0c10", roughness=0.12, metallic=0.3)
    materials["glass_inner"] = material

    material, tree, bsdf = _principled("lens_interior", "#040405", roughness=0.9, specular=0.3)
    materials["lens_interior"] = material

    material, tree, bsdf = _principled("hole_dark", "#000000", roughness=1.0, specular=0.0)
    materials["hole_dark"] = material

    return materials


# ----------------------------------------------------------------------------------------------------------------------
# Geometry helpers. Every part is a BMesh, so the model has clean, closed topology.
# ----------------------------------------------------------------------------------------------------------------------


def _rounded_box(size_mm, radius_mm, segments=4):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((size_mm[0] * MM, size_mm[1] * MM, size_mm[2] * MM, 1.0)))
    if radius_mm > 0:
        bmesh.ops.bevel(
            bm,
            geom=bm.edges[:],
            offset=radius_mm * MM,
            offset_type="OFFSET",
            segments=segments,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    return bm


def _cylinder(radius_mm, depth_mm, segments=96):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius_mm * MM,
        radius2=radius_mm * MM,
        depth=depth_mm * MM,
    )
    return bm


def _revolve(contour_mm, segments=96):
    """Solid of revolution about Z from a closed (radius, height) contour in millimetres."""
    bm = bmesh.new()
    verts = [bm.verts.new((r * MM, 0.0, z * MM)) for r, z in contour_mm]
    count = len(verts)
    edges = []
    for i in range(count):
        start_r, end_r = contour_mm[i][0], contour_mm[(i + 1) % count][0]
        if start_r == 0 and end_r == 0:
            continue  # an edge that lies on the axis would spin into a degenerate face
        edges.append(bm.edges.new((verts[i], verts[(i + 1) % count])))
    bmesh.ops.spin(bm, geom=edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segments, use_merge=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def _ring_contour(r_inner, r_outer, z0, z1):
    return [(r_inner, z0), (r_outer, z0), (r_outer, z1), (r_inner, z1)]


def _knurl(bm, radius_mm, count, z_center_mm, length_mm, radial_mm, width_mm):
    """Adds ridges around a cylinder, each one a small box standing proud of the surface."""
    for index in range(count):
        angle = math.tau * index / count
        position = (radius_mm * MM * math.cos(angle), radius_mm * MM * math.sin(angle), z_center_mm * MM)
        matrix = (
            Matrix.Translation(position)
            @ Matrix.Rotation(angle, 4, "Z")
            @ Matrix.Diagonal((radial_mm * MM, width_mm * MM, length_mm * MM, 1.0))
        )
        bmesh.ops.create_cube(bm, size=1.0, matrix=matrix)


def _soften_edges(bm, offset_mm=0.25, angle_degrees=35.0):
    """Adds a tiny physical bevel where two faces meet at a sharp angle, so highlights roll off like real moulding."""
    threshold = math.radians(angle_degrees)
    edges = []
    for edge in bm.edges:
        if len(edge.link_faces) == 2 and edge.calc_face_angle() > threshold:
            edges.append(edge)
    if edges:
        bmesh.ops.bevel(bm, geom=edges, offset=offset_mm * MM, offset_type="OFFSET", segments=2, profile=0.5,
                        affect="EDGES", clamp_overlap=True)


def _part(name, bm, material, collection, location_mm=(0, 0, 0), rotation=(0, 0, 0), parent=None, smooth=True,
          soften=True):
    if soften:
        _soften_edges(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = tuple(v * MM for v in location_mm)
    obj.rotation_euler = rotation
    if parent is not None:
        obj.parent = parent
    collection.objects.link(obj)
    return obj


def _empty(name, collection, location_mm=(0, 0, 0), rotation=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.02
    obj.location = tuple(v * MM for v in location_mm)
    obj.rotation_euler = rotation
    if parent is not None:
        obj.parent = parent
    collection.objects.link(obj)
    return obj


# ----------------------------------------------------------------------------------------------------------------------
# The camera body.
# ----------------------------------------------------------------------------------------------------------------------


def build_body(materials, collection, root):
    parts = {}
    parts["body"] = _part("body", _rounded_box((BODY_W, BODY_D, BODY_H), BODY_EDGE_RADIUS), materials["body_matte"],
                          collection, parent=root)

    # Lens mount: a dark face inside a metal bayonet ring, on the front (-Y) face.
    mount_face = _cylinder(25.5, 1.0, 96)
    _part("mount_face", mount_face, materials["plastic_dark"], collection, location_mm=(0, MOUNT_Y, 0),
          rotation=(math.radians(90), 0, 0), parent=root, soften=False)
    mount_ring = _revolve(_ring_contour(25.5, 28.0, -0.7, 0.7))
    _part("mount_ring", mount_ring, materials["metal_dark"], collection, location_mm=(0, MOUNT_Y, 0),
          rotation=(math.radians(90), 0, 0), parent=root, soften=False)

    # Grip: a rounded block on the viewer's left, projecting forward of the mount.
    grip = _rounded_box((GRIP["w"], GRIP["d"], GRIP["h"]), GRIP["radius"], segments=5)
    parts["grip"] = _part("grip", grip, materials["grip_rubber"], collection,
                          location_mm=(GRIP["x"], GRIP["y"], GRIP["z"]), parent=root)

    # Top of the grip: shutter button on a metal ring, with a domed cap.
    grip_top = GRIP["h"] / 2
    _part("shutter_ring", _revolve(_ring_contour(9.0, 11.5, 0.0, 2.2)), materials["metal_satin"], collection,
          location_mm=(-41.0, -10.0, grip_top), parent=root, soften=False)
    shutter_contour = [(0, 0), (9.0, 0), (9.0, 4.5), (8.2, 6.3), (6.0, 7.4), (3.0, 7.9), (0, 8.0)]
    parts["shutter"] = _part("shutter_button", _revolve(shutter_contour), materials["plastic_dark"], collection,
                             location_mm=(-41.0, -10.0, grip_top + 2.2), parent=root, soften=False)

    # Top plate: knurled mode dial, power lever, hot shoe and microphone holes.
    dial = _cylinder(15.0, 5.0, 72)
    _knurl(dial, 15.0, 72, 0.0, 5.0, 0.35, 0.9)
    _part("mode_dial", dial, materials["plastic_dark"], collection, location_mm=(-12.0, -8.0, TOP_Z + 2.5),
          parent=root)
    _part("mode_dial_insert", _cylinder(11.0, 0.8, 48), materials["metal_dark"], collection,
          location_mm=(-12.0, -8.0, TOP_Z + 5.4), parent=root, soften=False)
    _part("power_lever", _rounded_box((6.0, 16.0, 2.4), 1.0, 2), materials["metal_dark"], collection,
          location_mm=(-29.0, -4.0, TOP_Z + 1.2), rotation=(0, 0, math.radians(14)), parent=root)

    hot_shoe = _rounded_box((16.0, 26.0, 2.2), 0.7, 2)
    _part("hot_shoe", hot_shoe, materials["metal_satin"], collection, location_mm=(2.0, -14.0, TOP_Z + 1.1),
          parent=root)
    _part("hot_shoe_slot", _rounded_box((6.0, 13.0, 0.6), 0.2, 1), materials["hole_dark"], collection,
          location_mm=(2.0, -14.0, TOP_Z + 2.3), parent=root, soften=False)
    for index, x in enumerate((-4.0, -2.6, -1.2)):
        _part(f"microphone_{index + 1}", _cylinder(0.65, 0.4, 16), materials["hole_dark"], collection,
              location_mm=(x, -17.0, TOP_Z + 0.1), parent=root, soften=False)

    # Pop-up flash: a hinge at the rear edge. The head rotates about the hinge, so it rises above the body.
    hinge = _empty("flash_hinge", collection, location_mm=(6.0, 5.0, TOP_Z), parent=root)
    _part("flash_head", _rounded_box((18.0, 14.0, 5.0), 1.0, 2), materials["plastic_dark"], collection,
          location_mm=(0.0, -7.0, 0.5), parent=hinge)
    parts["flash"] = hinge

    # Electronic viewfinder hump on the top right, toward the rear, with a rubber eyecup on its back.
    _part("viewfinder_housing", _rounded_box((34.0, 24.0, 8.0), 3.5, 4), materials["body_matte"], collection,
          location_mm=(24.0, 4.0, TOP_Z + 4.0), parent=root)
    _part("eyecup", _cylinder(8.5, 3.0, 64), materials["plastic_dark"], collection,
          location_mm=(24.0, 17.5, TOP_Z + 4.0), rotation=(math.radians(90), 0, 0), parent=root, soften=False)

    # Tilting rear screen (shown flat, angled a little away from the body) and four rear buttons.
    parts["screen"] = _part("rear_screen", _rounded_box((62.0, 1.4, 38.0), 0.8, 2), materials["screen_glass"],
                            collection, location_mm=(4.0, BODY_D / 2 + 1.6, -2.0), rotation=(math.radians(-14), 0, 0),
                            parent=root, soften=False)
    for index, (x, z) in enumerate(((44.0, 14.0), (44.0, -12.0), (52.0, 2.0), (36.0, -26.0))):
        _part(f"rear_button_{index + 1}", _cylinder(3.5, 2.0, 40), materials["plastic_dark"], collection,
              location_mm=(x, BODY_D / 2 + 0.6, z), rotation=(math.radians(90), 0, 0), parent=root, soften=False)

    # Base: tripod plate, slightly recessed, which is seen only from below.
    _part("tripod_plate", _rounded_box((24.0, 22.0, 2.0), 0.6, 2), materials["metal_satin"], collection,
          location_mm=(3.0, 0.0, -TOP_Z - 0.4), parent=root)
    return parts


# ----------------------------------------------------------------------------------------------------------------------
# The lens. Built along local +Z from the mount face (z = 0) to the front element; the group then points it out of
# the front of the body.
# ----------------------------------------------------------------------------------------------------------------------


def _front_element_contour(radius, edge_z, sagitta, back_z, steps=24):
    """A thick, convex front element: a flat back, a curved front that rises from the edge to the centre."""
    contour = [(0.0, back_z), (radius, back_z), (radius, edge_z)]
    for index in range(steps + 1):
        t = index / steps
        r = radius * (1.0 - t)
        z = edge_z + sagitta * (1.0 - (r / radius) ** 2)
        contour.append((r, z))
    return contour


def build_lens(materials, collection, root):
    lens = _empty("lens_group", collection, location_mm=(0, MOUNT_Y, 0), rotation=(math.radians(90), 0, 0),
                  parent=root)
    parts = {"lens": lens}

    _part("lens_collar", _revolve(_ring_contour(27.5, 30.5, 0.0, 2.5)), materials["metal_dark"], collection,
          parent=lens, soften=False)
    _part("barrel_base", _revolve(_ring_contour(30.0, 31.2, 2.5, 10.0)), materials["barrel_plastic"], collection,
          parent=lens, soften=False)

    # The zoom ring: a band with fine ridges around its outside.
    zoom = _revolve(_ring_contour(30.5, 32.35, 10.0, 20.0))
    _knurl(zoom, 32.35, 96, 15.0, 8.6, 0.55, 0.42)
    _part("zoom_ring", zoom, materials["rubber_ribbed"], collection, parent=lens)

    _part("barrel_front", _revolve(_ring_contour(30.0, 31.4, 20.0, 27.0)), materials["barrel_plastic"], collection,
          parent=lens, soften=False)
    _part("front_retaining_ring", _revolve(_ring_contour(30.6, 32.35, 27.0, 28.6)), materials["metal_dark"], collection,
          parent=lens, soften=False)
    _part("front_lip", _revolve(_ring_contour(31.6, 32.35, 28.6, LENS_EXTENSION_MM)), materials["barrel_plastic"],
          collection, parent=lens, soften=False)
    _part("filter_thread", _revolve(_ring_contour(20.25, 21.6, 26.0, 27.4)), materials["metal_satin"], collection,
          parent=lens, soften=False)

    # The interior: a dark tube behind the glass, then the internal elements. These move forward and back for focus,
    # so the outside barrel never telescopes.
    _part("lens_interior", _revolve(_ring_contour(21.0, 29.6, 2.5, 27.0)), materials["lens_interior"], collection,
          parent=lens, soften=False)
    focus = _empty("focus_group", collection, parent=lens)
    parts["focus"] = focus
    _part("baffle_rear", _revolve(_ring_contour(12.0, 18.0, 22.0, 22.6)), materials["lens_interior"], collection,
          parent=focus, soften=False)
    _part("baffle_front", _revolve(_ring_contour(10.0, 16.0, 17.5, 18.1)), materials["lens_interior"], collection,
          parent=focus, soften=False)
    _part("element_rear", _revolve(_ring_contour(0.0, 17.5, 13.0, 13.4)), materials["glass_inner"], collection,
          parent=focus, soften=False)
    _part("element_middle", _revolve(_ring_contour(0.0, 18.8, 19.0, 19.4)), materials["glass_inner"], collection,
          parent=focus, soften=False)
    _part("element_retainer", _revolve(_ring_contour(9.0, 17.0, 23.5, 24.1)), materials["metal_dark"], collection,
          parent=focus, soften=False)

    # The front element: thick, convex, recessed into the barrel, and smaller than the barrel.
    front_back_z = 26.2
    front_edge_z = 27.0
    front = _revolve(_front_element_contour(GLASS_RADIUS, front_edge_z, 0.8, front_back_z))
    _part("front_element", front, materials["glass_coated"], collection, parent=lens, soften=False)
    return parts


def build(materials=None):
    """Builds the whole camera in the current Blender file and returns the named objects that animation drives."""
    materials = materials or build_materials()
    collection = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(collection)
    root = _empty("camera_root", collection)
    body = build_body(materials, collection, root)
    lens = build_lens(materials, collection, root)
    return {"root": root, "shutter": body["shutter"], "flash": body["flash"], "focus": lens["focus"],
            "lens": lens["lens"]}
