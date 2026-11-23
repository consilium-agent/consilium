import bpy
p = bpy.context.preferences.addons['cycles'].preferences
for t in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
    try:
        p.compute_device_type = t; p.get_devices()
        d = [x.name for x in p.devices if x.type == t]
        if d: print("GPU", t, d)
    except Exception as e: pass
print("engines", [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items])
