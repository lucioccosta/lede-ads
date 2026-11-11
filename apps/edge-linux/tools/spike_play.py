#!/usr/bin/env python3
"""Spike: toca um vídeo em tela cheia (GTK4 + gtk4paintablesink) e mede fps/drops.

Uso (dentro do cage):  cage -- python3 spike_play.py arquivo.mp4 [hw|sw]
Imprime no stdout: rendered, dropped, fps médio e CPU do processo.
"""

import os
import sys
import time

import gi

gi.require_version("Gst", "1.0")
gi.require_version("Gtk", "4.0")
from gi.repository import GLib, Gst, Gtk  # noqa: E402

Gst.init(None)

path = os.path.abspath(sys.argv[1])
mode = sys.argv[2] if len(sys.argv) > 2 else "hw"
decoder = "v4l2slh264dec" if mode == "hw" else "avdec_h264"

pipeline = Gst.parse_launch(
    f'filesrc location="{path}" ! qtdemux ! h264parse ! {decoder} ! queue max-size-buffers=4 '
    "! fpsdisplaysink name=fps text-overlay=false signal-fps-measurements=true sync=true "
    "video-sink=gtk4paintablesink"
)
fps_sink = pipeline.get_by_name("fps")
paintable = fps_sink.get_property("video-sink").get_property("paintable")

stats = {"last": None}


def on_fps(_sink, fps, droprate, avgfps):
    stats["last"] = (fps, droprate, avgfps)


fps_sink.connect("fps-measurements", on_fps)

app = Gtk.Application(application_id="br.tv.lede.spike")
t0 = {"wall": 0.0, "cpu": 0.0}


def finish(app_):
    pipeline.set_state(Gst.State.NULL)
    wall = time.monotonic() - t0["wall"]
    cpu = time.process_time() - t0["cpu"]
    rendered = fps_sink.get_property("frames-rendered")
    dropped = fps_sink.get_property("frames-dropped")
    print(
        f"RESULT decoder={decoder} rendered={rendered} dropped={dropped} "
        f"avg_fps={rendered / wall:.1f} wall={wall:.1f}s proc_cpu={100 * cpu / wall:.0f}% (de 1 núcleo)",
        flush=True,
    )
    app_.quit()


def on_bus(_bus, msg):
    if msg.type == Gst.MessageType.EOS:
        finish(app)
    elif msg.type == Gst.MessageType.ERROR:
        err, dbg = msg.parse_error()
        print(f"ERROR {err.message} | {dbg}", flush=True)
        finish(app)


def on_activate(app_):
    win = Gtk.ApplicationWindow(application=app_)
    pic = Gtk.Picture.new_for_paintable(paintable)
    pic.set_content_fit(Gtk.ContentFit.COVER)
    win.set_child(pic)
    win.fullscreen()
    win.present()
    bus = pipeline.get_bus()
    bus.add_signal_watch()
    bus.connect("message", on_bus)
    t0["wall"] = time.monotonic()
    t0["cpu"] = time.process_time()
    pipeline.set_state(Gst.State.PLAYING)


app.connect("activate", on_activate)
app.run([])
