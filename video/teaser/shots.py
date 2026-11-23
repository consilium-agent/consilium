# CONSILIUM pre-launch teaser: monochrome cinematic shots of the voxel C mark (no name, no ticker, no site).
# The only colour is the ember centre block.
#   blender -b --factory-startup -P shots.py -- --shot door [--still 120] [--res 1280] [--samples 32] [--out dir]
# Shots: door, sand, peak, mirror, sphere, glyph, end
import bpy, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
SHOT = arg("--shot", "door")
STILL = arg("--still")
RES = int(arg("--res", "1280"))
SAMPLES = int(arg("--samples", "32"))
OUT = arg("--out", os.path.join(os.path.dirname(os.path.abspath(__file__)), "frames"))
LENGTH = {"door": 225, "sand": 120, "peak": 120, "mirror": 105, "sphere": 120, "glyph": 120, "end": 108}

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 1, LENGTH[SHOT]
sc.render.fps = 30
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = RES, RES * 9 // 16
sc.render.film_transparent = False
ee = sc.eevee
ee.taa_render_samples = SAMPLES
for k, v in (("use_raytracing", True), ("use_shadows", True), ("volumetric_tile_size", "4"), ("volumetric_samples", 96), ("volumetric_end", 120.0), ("use_volumetric_shadows", True)):
    try: setattr(ee, k, v)
    except Exception: pass
sc.view_settings.view_transform = "AgX"
try: sc.view_settings.look = "AgX - High Contrast"
except Exception: pass

# ---------- materials ----------
def mat(name, base=(0.8, 0.8, 0.8), rough=0.4, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m

WHITE = mat("white", (0.82, 0.82, 0.82), 0.32)
BLACK = mat("black", (0.012, 0.012, 0.012), 0.35)
CHROME = mat("chrome", (0.95, 0.95, 0.95), 0.04, 1.0)
EMBER_RGB = (0.89, 0.26, 0.06)
EMBER = mat("ember", EMBER_RGB, 0.3, 0.0, EMBER_RGB, 6.0)
GLOW = mat("glow", (1, 1, 1), 0.5, 0.0, (1, 1, 1), 30.0)
SIL = mat("silhouette", (0.0, 0.0, 0.0), 1.0)           # matte black, no highlights: reads as a cut-out against light
try: SIL.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.0
except KeyError: pass

def volume_mat(name, density, noise_scale=None, anisotropy=0.3):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    pv = nt.nodes.new("ShaderNodeVolumePrincipled")
    pv.inputs["Density"].default_value = density
    pv.inputs["Anisotropy"].default_value = anisotropy
    pv.inputs["Color"].default_value = (0.9, 0.9, 0.9, 1)
    if noise_scale:
        nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = noise_scale; nz.inputs["Detail"].default_value = 6
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].position = 0.45; ramp.color_ramp.elements[1].position = 0.7
        mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = density
        nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], mul.inputs[0]); nt.links.new(mul.outputs[0], pv.inputs["Density"])
    nt.links.new(pv.outputs[0], out.inputs["Volume"])
    return m

def world(color=(0.0, 0.0, 0.0), strength=1.0, fog=0.0, horizon=None):
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes["Background"]
    bg.inputs["Strength"].default_value = strength
    if horizon:  # vertical gradient: bright at the horizon, dark above
        tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (*horizon, 1)
        ramp.color_ramp.elements[1].position = 0.35; ramp.color_ramp.elements[1].color = (*color, 1)
        nt.links.new(tc.outputs["Generated"], sep.inputs[0]); nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (*color, 1)
    if fog:
        pv = nt.nodes.new("ShaderNodeVolumePrincipled"); pv.inputs["Density"].default_value = fog; pv.inputs["Anisotropy"].default_value = 0.4
        nt.links.new(pv.outputs[0], nt.nodes["World Output"].inputs["Volume"])

def box(name, size, loc, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bv = o.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = 3
    o.data.materials.append(material)
    return o

def plane(size, loc=(0, 0, 0), material=None, subdiv=0):
    bpy.ops.mesh.primitive_plane_add(size=size, location=loc)
    o = bpy.context.object
    if subdiv:
        m = o.modifiers.new("sub", "SUBSURF"); m.subdivision_type = "SIMPLE"; m.levels = m.render_levels = subdiv
    if material: o.data.materials.append(material)
    return o

CELLS = [(0, 0), (1, 0), (2, 0), (0, 1), (0, 2), (1, 2), (2, 2)]  # (column, row from top); centre (1,1) is ember
def mark(loc=(0, 0, 0), s=1.0, white=WHITE, ember=EMBER, depth=None, parent_name="mark"):
    """The voxel C: 7 blocks + an ember centre, facing -Y, centred on loc. Animate the returned empty."""
    root = bpy.data.objects.new(parent_name, None); sc.collection.objects.link(root); root.location = loc
    bpy.context.view_layer.update()
    d = depth or 0.9 * s
    for c, r in CELLS + [(1, 1)]:
        world_loc = (loc[0] + (c - 1) * s, loc[1], loc[2] + (1 - r) * s)
        o = box(f"{parent_name}-{c}{r}", (0.9 * s, d, 0.9 * s), world_loc, ember if (c, r) == (1, 1) else white, bevel=0.035 * s)
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()
    return root

def camera(loc, target, lens=35):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = lens; cam.location = loc
    tgt = bpy.data.objects.new("target", None); sc.collection.objects.link(tgt); tgt.location = target
    tc = cam.constraints.new("TRACK_TO"); tc.target = tgt; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
    cam.data.dof.use_dof = False
    return cam, tgt

def key(o, path, frames_values, index=-1):
    for f, v in frames_values:
        setattr(o, path, v) if index < 0 else getattr(o, path).__setitem__(index, v)
        o.keyframe_insert(path, frame=f, index=index)

def light(kind, loc, energy, rot=(0, 0, 0), size=1.0, color=(1, 1, 1), size_y=None):
    data = bpy.data.lights.new(kind, kind); data.energy = energy; data.color = color
    if kind == "AREA":
        data.shape = "RECTANGLE"; data.size = size; data.size_y = size_y or size
    if kind == "SUN": data.angle = math.radians(1.5)
    o = bpy.data.objects.new(kind, data); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = [math.radians(a) for a in rot]
    return o

# ---------- shots ----------
def shot_door():
    world((0.012, 0.012, 0.014), 1.0, fog=0.012)
    floor = plane(400, material=mat("wet", (0.01, 0.01, 0.01), 0.12))
    L = 225
    gap = [(1, 0.02), (110, 0.07), (150, 0.35), (205, 3.4), (L, 4.2)]
    left = box("left", (2.4, 0.8, 8), (0, 0, 4), BLACK); right = box("right", (2.4, 0.8, 8), (0, 0, 4), BLACK)
    for f, g in gap:
        left.location = (-(1.2 + g / 2), 0, 4); left.keyframe_insert("location", frame=f)
        right.location = (1.2 + g / 2, 0, 4); right.keyframe_insert("location", frame=f)
    slab = box("slab", (1, 0.05, 8), (0, 0.15, 4), GLOW)
    for f, g in ((1, 0.02), (110, 0.07), (150, 0.3), (168, 0.0)):   # the seam of light; gone once the doors part
        slab.scale = (max(g, 0.0001), 1, 1); slab.keyframe_insert("scale", frame=f)
    back = plane(80, (0, 40, 10), mat("backlight", (1, 1, 1), 1, 0, (1, 1, 1), 0.0)); back.rotation_euler = (math.radians(90), 0, 0)
    em = back.active_material.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    for f, v in ((1, 0.0), (140, 0.0), (190, 6.0), (L, 9.0)):
        em.default_value = v; em.keyframe_insert("default_value", frame=f)
    seam = light("AREA", (0, 0.6, 4), 900, rot=(90, 0, 0), size=0.05, size_y=8)
    for f, g, e in ((1, 0.02, 600), (110, 0.07, 1400), (150, 0.35, 4000), (205, 3.4, 20000), (L, 4.2, 30000)):
        seam.data.size = max(0.02, g); seam.data.energy = e
        seam.data.keyframe_insert("size", frame=f); seam.data.keyframe_insert("energy", frame=f)
    mark((0, 9, 1.5), 1.1, white=SIL)              # a black silhouette standing in the light behind the doors
    fogbox = box("fog", (80, 80, 2.2), (0, 0, 0.9), volume_mat("lowfog", 0.22, noise_scale=0.35)); fogbox.display_type = "BOUNDS"
    cam, tgt = camera((0, -16, 1.4), (0, 0, 3.2), 32)
    key(cam, "location", [(1, (0, -16, 1.4)), (L, (0, -5.5, 2.4))])
    key(tgt, "location", [(1, (0, 0, 3.2)), (L, (0, 6, 2.2))])

def shot_sand():
    world((0.05, 0.05, 0.05), 1.0)
    sand = plane(40, material=mat("sand", (0.55, 0.55, 0.55), 0.95), subdiv=8)
    tex = bpy.data.textures.new("ripples", "WOOD"); tex.wood_type = "BANDNOISE"; tex.noise_basis_2 = "SIN"; tex.noise_scale = 0.55; tex.turbulence = 2.5
    d = sand.modifiers.new("disp", "DISPLACE"); d.texture = tex; d.strength = 0.07; d.texture_coords = "GLOBAL"
    tex2 = bpy.data.textures.new("dunes", "CLOUDS"); tex2.noise_scale = 9
    d2 = sand.modifiers.new("disp2", "DISPLACE"); d2.texture = tex2; d2.strength = 0.9; d2.texture_coords = "GLOBAL"
    bpy.ops.object.shade_smooth()
    m = mark((0, 0, -1.2), 1.0, depth=0.9)
    m.rotation_euler = (math.radians(-90), 0, 0)      # lying flat, face up
    key(m, "location", [(1, (0, 0, -1.25)), (100, (0, 0, 0.15)), (120, (0, 0, 0.2))])
    light("SUN", (0, 0, 10), 5.5, rot=(78, 0, 62))      # low raking sun: long shadows across the ripples
    cam, tgt = camera((0.2, -0.3, 11), (0, 0, 0), 40)
    key(cam, "location", [(1, (0.6, -1.2, 12.5)), (120, (-0.3, 0.6, 9.5))])

def shot_peak():
    world((0.06, 0.06, 0.07), 1.0, horizon=(0.95, 0.95, 0.97))
    bpy.ops.mesh.primitive_cone_add(vertices=96, radius1=16, radius2=0.6, depth=12, location=(0, 0, 0))
    peak = bpy.context.object
    sub = peak.modifiers.new("sub", "SUBSURF"); sub.subdivision_type = "SIMPLE"; sub.levels = sub.render_levels = 5
    rock = bpy.data.textures.new("rock", "CLOUDS"); rock.noise_scale = 1.6; rock.noise_depth = 4
    d = peak.modifiers.new("disp", "DISPLACE"); d.texture = rock; d.strength = 1.6
    peak.data.materials.append(mat("rock", (0.18, 0.18, 0.18), 0.85))
    mark((0, 0, 7.6), 1.2)
    light("AREA", (0, -6, 9), 1500, rot=(70, 0, 0), size=4)   # key on the monument's face
    clouds = box("clouds", (120, 120, 3.5), (0, 0, 2.2), volume_mat("clouds", 1.6, noise_scale=0.08, anisotropy=0.55)); clouds.display_type = "BOUNDS"
    light("SUN", (0, 0, 10), 7.0, rot=(84, 0, 180))     # backlight just above the horizon
    light("AREA", (0, -20, 12), 2000, rot=(60, 0, 0), size=12)
    cam, tgt = camera((10, -24, 8.5), (0, 0, 6.6), 50)
    key(cam, "location", [(1, (12, -24, 8.2)), (120, (2, -26.5, 8.8))])

def shot_mirror():
    world((0.02, 0.02, 0.022), 1.0, fog=0.01, horizon=(0.9, 0.9, 0.92))
    plane(400, material=mat("mirror", (0.9, 0.9, 0.9), 0.02, 1.0))
    m = mark((0, 0, 2.4), 0.9)
    key(m, "rotation_euler", [(1, (0, 0, math.radians(-14))), (105, (0, 0, math.radians(10)))])
    key(m, "location", [(1, (0, 0, 2.2)), (105, (0, 0, 2.6))])
    halo = light("AREA", (0, 30, 2), 60000, rot=(90, 0, 180), size=30, size_y=4)
    light("AREA", (0, -6, 6), 400, rot=(50, 0, 0), size=4)
    cam, tgt = camera((0, -10, 0.55), (0, 0, 2.2), 40)
    key(cam, "location", [(1, (0, -11, 0.5)), (105, (0, -7.5, 0.7))])

def shot_sphere():
    """Chrome voxel C turning under a single spotlight in thin fog (the interpres-style hero object)."""
    world((0.004, 0.004, 0.005), 1.0, fog=0.035)
    plane(200, material=mat("floor", (0.01, 0.01, 0.01), 0.16))
    m = mark((0, 0, 2.4), 1.0, white=CHROME)
    key(m, "rotation_euler", [(1, (0, 0, math.radians(-38))), (120, (0, 0, math.radians(22)))])
    spot = bpy.data.lights.new("spot", "SPOT"); spot.energy = 9000; spot.spot_size = math.radians(34); spot.spot_blend = 0.35
    so = bpy.data.objects.new("spot", spot); sc.collection.objects.link(so); so.location = (0, 0, 13)
    light("AREA", (-7, -5, 3), 300, rot=(80, 0, -55), size=6)
    light("AREA", (6, 6, 4), 500, rot=(70, 0, 140), size=4, color=(1.0, 0.75, 0.6))
    cam, tgt = camera((0, -11, 2.0), (0, 0, 2.5), 45)
    key(cam, "location", [(1, (-1.5, -11.5, 1.6)), (120, (1.5, -10.0, 2.3))])

def shot_glyph():
    world((0.01, 0.01, 0.012), 1.0, fog=0.02)
    plane(200, material=mat("wet", (0.01, 0.01, 0.01), 0.12))
    box("monolith", (6, 1.2, 12), (0, 0.6, 6), BLACK)
    ring_w = mat("ringw", (1, 1, 1), 0.5, 0.0, (1, 1, 1), 0.0); ring_e = mat("ringe", EMBER_RGB, 0.5, 0.0, EMBER_RGB, 0.0)
    for c, r in CELLS + [(1, 1)]:
        o = box(f"ring{c}{r}", (1.15, 0.05, 1.15), ((c - 1) * 1.35, -0.02, 6 + (1 - r) * 1.35), ring_e if (c, r) == (1, 1) else ring_w)
        w = o.modifiers.new("wire", "WIREFRAME"); w.thickness = 0.06
    for m_, peak_ in ((ring_w, 9.0), (ring_e, 12.0)):
        s = m_.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
        for f, v in ((1, 0.0), (20, 0.0), (70, peak_), (120, peak_)):
            s.default_value = v; s.keyframe_insert("default_value", frame=f)
    seam = box("seam", (0.05, 0.02, 12), (0, -0.62, 6), GLOW)
    light("AREA", (0, -3, 6), 300, rot=(90, 0, 0), size=0.2, size_y=12)
    cam, tgt = camera((0, -9, 1.2), (0, 0, 4.5), 30)
    key(cam, "location", [(1, (0, -9.5, 0.8)), (120, (0, -8.5, 3.2))])
    key(tgt, "location", [(1, (0, 0, 3.8)), (120, (0, 0, 6.0))])

def shot_end():
    world((0.0, 0.0, 0.0), 1.0)
    m = mark((0, 0, 0), 0.55)
    e = EMBER.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    for f, v in ((1, 0.0), (30, 0.0), (60, 9.0), (108, 9.0)):
        e.default_value = v; e.keyframe_insert("default_value", frame=f)
    light("AREA", (0, -6, 4), 260, rot=(55, 0, 0), size=5)
    light("AREA", (4, 4, 2), 120, rot=(70, 0, 135), size=3)
    cam, tgt = camera((0, -12, 0.1), (0, 0, 0), 60)
    key(cam, "location", [(1, (0, -12.5, 0.1)), (108, (0, -11, 0.1))])

{"door": shot_door, "sand": shot_sand, "peak": shot_peak, "mirror": shot_mirror, "sphere": shot_sphere, "glyph": shot_glyph, "end": shot_end}[SHOT]()

for fc in (getattr(o.animation_data, "action", None) for o in bpy.data.objects if o.animation_data):
    pass  # default Bezier easing is what we want for slow camera moves

os.makedirs(OUT, exist_ok=True)
if STILL:
    sc.frame_set(int(STILL))
    sc.render.filepath = os.path.join(OUT, f"{SHOT}-still-{STILL}.png")
    bpy.ops.render.render(write_still=True)
else:
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = os.path.join(OUT, SHOT, "f_")
    bpy.ops.render.render(animation=True)
print("done", SHOT)
