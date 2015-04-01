bl_info = {
    "name": "Export for Revision",
    "author": "Jonathan Giroux (Bloutiouf)",
    "version": (0, 1),
    "blender": (2, 68, 0),
    "location": "File > Export > DGE",
    "description": "Export for use in DGE",
    "warning": "",
    "wiki_url": "",
    "tracker_url": "",
    "category": "Import-Export"
}

import bpy

from bpy.props import StringProperty
from bpy_extras.io_utils import ExportHelper
import json
from operator import itemgetter, attrgetter, methodcaller

class RevisionExporter(bpy.types.Operator, ExportHelper):
    """Export for Revision"""
    bl_idname = "export.revision"
    bl_label = "Export for Revision"

    filename_ext = ".js"
    filter_glob = StringProperty(default="*.js", options={'HIDDEN'})

    def execute(self, context):
        scene = bpy.context.scene
        spf = scene.render.fps_base / scene.render.fps
        
        animations = {}
        notes = []
        tracks = []
        
        def animation(fcu):
            r = []
            for keyframe in fcu.keyframe_points:
                r.append({
                    "inter": keyframe.interpolation,
                    "co": (keyframe.co.x * spf, keyframe.co.y),
                    "left": (keyframe.handle_left.x * spf, keyframe.handle_left.y),
                    "right": (keyframe.handle_right.x * spf, keyframe.handle_right.y)
                })
            return r
            
        for object in scene.objects:
            if object.users > 0:
                name_parts = object.name.split("_")
                
                if name_parts[0] == "Camera":
                    action = object.animation_data.action
                    for fcu in action.fcurves:
                        if fcu.data_path == "location" and fcu.array_index == 0:
                            animations["cameraX"] = animation(fcu)
                        if fcu.data_path == "location" and fcu.array_index == 1:
                            animations["cameraY"] = animation(fcu)
                        if fcu.data_path == "location" and fcu.array_index == 2:
                            animations["cameraZ"] = animation(fcu)
                            
                if name_parts[0] == "CamTarget":
                    action = object.animation_data.action
                    for fcu in action.fcurves:
                        if fcu.data_path == "location" and fcu.array_index == 0:
                            animations["camTargetX"] = animation(fcu)
                        if fcu.data_path == "location" and fcu.array_index == 1:
                            animations["camTargetY"] = animation(fcu)
                        if fcu.data_path == "location" and fcu.array_index == 2:
                            animations["camTargetZ"] = animation(fcu)
                            
                if name_parts[0] == "CamTilt":
                    action = object.animation_data.action
                    for fcu in action.fcurves:
                        if fcu.data_path == "rotation_euler" and fcu.array_index == 2:
                            animations["camTilt"] = animation(fcu)
                            
                if name_parts[0] == "Slide":
                    spline = object.data.splines[0]
                    points = spline.bezier_points
                    parts = len(points) - 1
                    segments = []
                    for i in range(0, parts):
                        segments.append({
                            "resolution": spline.resolution_u,
                            "from": float(name_parts[i+1]),
                            "to": float(name_parts[i+2]),
                            "p0": list(points[i].co + object.location),
                            "p1": list(points[i].handle_right + object.location),
                            "p2": list(points[i+1].handle_left + object.location),
                            "p3": list(points[i+1].co + object.location),
                        })
                    notes.append({
                        "time": float(name_parts[1]),
                        "position": list(object.data.splines[0].bezier_points[0].co + object.location),
                        "segments": segments
                    })
                    
                if name_parts[0] == "Touch":
                    notes.append({
                        "time": float(name_parts[1]),
                        "position": list(object.location)
                    })
                    
                if name_parts[0] == "Track":
                    for spline in object.data.splines:
                        points = spline.bezier_points
                        parts = len(points) - 1
                        for i in range(0, parts):
                            tracks.append({
                                "resolution": spline.resolution_u,
                                "from": float(name_parts[i+1]),
                                "to": float(name_parts[i+2]),
                                "p0": list(points[i].co + object.location),
                                "p1": list(points[i].handle_right + object.location),
                                "p2": list(points[i+1].handle_left + object.location),
                                "p3": list(points[i+1].co + object.location),
                            })

        data = {
            "animations": animations,
            "notes": sorted(notes, key=itemgetter('time')),
            "tracks": tracks
        }
        
        with open(self.filepath, "w") as file:
            file.write("var song = " + json.dumps(data) + "; if (typeof module !== 'undefined') module.exports = song;")
        
        return {'FINISHED'}

def menu_export(self, context):
    self.layout.operator(RevisionExporter.bl_idname, text="Revision")

def register():
    bpy.utils.register_module(__name__)
    bpy.types.INFO_MT_file_export.append(menu_export)

def unregister():
    bpy.utils.unregister_module(__name__)
    bpy.types.INFO_MT_file_export.remove(menu_export)

if __name__ == "__main__":
    register()
