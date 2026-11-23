import bpy, sys
sys.argv = [sys.argv[0], "--", "--shot", "door", "--still", "60"]
exec(open(r"D:/Claude/launches/2026-11-23-consil/video/teaser/shots.py").read().split("{\"door\": shot_door")[0])
shot_door()
sc = bpy.context.scene; sc.frame_set(60); bpy.context.view_layer.update()
for o in bpy.data.objects:
    if o.type == "MESH": print(o.name, [round(v,2) for v in o.matrix_world.translation], [round(v,2) for v in o.dimensions], o.data.materials[0].name if o.data.materials else "")
sc.render.resolution_x, sc.render.resolution_y = 640, 360
for o in bpy.data.objects:
    if o.name.startswith("mark-"): o.hide_render = True
sc.render.filepath = r"D:/Claude/launches/2026-11-23-consil/video/teaser/stills/dbg-nomark.png"
bpy.ops.render.render(write_still=True)
