"""Reprodução de vídeo com decodificação por hardware (cedrus / V4L2 stateless).

Medido no SB3000 (H313): H.264 1080p30 → 0 quadros perdidos, ~14% CPU total
com ``v4l2slh264dec``; em software (``avdec_h264``) perde ~10% dos quadros.

Os decoders ``v4l2sl*`` têm rank baixo por padrão — :func:`prefer_hw_decoders`
os promove para que ``uridecodebin3`` os escolha automaticamente
(H.264, H.265, VP8, VP9, MPEG-2), com fallback para software se falharem.

LIMITAÇÃO DO DRIVER (cedrus staging, kernel 7.3 no H313): a saída só é
correta quando ``largura % 32 == 0`` e ``altura % 16 == 0``. Fora disso o
driver grava o plano de cor (UV) em outro offset do que informa ao V4L2 →
cores lavadas, riscos coloridos e lixo na última linha. Medido em 27
resoluções (PSNR HW×SW = ∞ só nesses casos). 1920×1080, 1080×1920 e
720×1280 — os tamanhos mais comuns — caem no caso ruim. Por isso cada vídeo
é inspecionado e, se não for "seguro", decodifica em software.
"""

from __future__ import annotations

import logging

import gi

gi.require_version("Gst", "1.0")
gi.require_version("GstPbutils", "1.0")
gi.require_version("Gdk", "4.0")
from gi.repository import GLib, Gst, GstPbutils  # noqa: E402

log = logging.getLogger(__name__)

_HW_DECODERS = (
    "v4l2slh264dec",
    "v4l2slh265dec",
    "v4l2slvp8dec",
    "v4l2slvp9dec",
    "v4l2slmpeg2dec",
)


_SAFE_CACHE: dict[str, bool] = {}


def hw_safe_dimensions(width: int, height: int) -> bool:
    """O cedrus só decodifica corretamente nessas dimensões (ver docstring)."""
    return width > 0 and height > 0 and width % 32 == 0 and height % 16 == 0


def can_use_hw(uri: str) -> bool:
    """Inspeciona o vídeo (uma vez por arquivo) e decide HW × software."""
    cached = _SAFE_CACHE.get(uri)
    if cached is not None:
        return cached
    safe = False
    try:
        info = GstPbutils.Discoverer.new(5 * Gst.SECOND).discover_uri(uri)
        streams = info.get_video_streams()
        if streams:
            w, h = streams[0].get_width(), streams[0].get_height()
            safe = hw_safe_dimensions(w, h)
            log.info(
                "Vídeo %dx%d → decoder %s (%s)",
                w, h, "HW" if safe else "software",
                uri.rsplit("/", 1)[-1][:12],
            )
    except GLib.Error as err:
        log.warning("Não foi possível inspecionar %s: %s — usando software", uri, err.message)
    _SAFE_CACHE[uri] = safe
    return safe


def init():
    Gst.init(None)
    prefer_hw_decoders()


def prefer_hw_decoders():
    registry = Gst.Registry.get()
    for name in _HW_DECODERS:
        feature = registry.lookup_feature(name)
        if feature is not None:
            feature.set_rank(Gst.Rank.PRIMARY + 100)
            log.info("Decoder HW habilitado: %s", name)


class LoopingVideo:
    """Vídeo em loop (como o REPEAT_MODE_ONE do ExoPlayer), sem áudio.

    Expõe ``paintable`` para um ``Gtk.Picture``.
    """

    def __init__(self, uri: str, hardware: bool | None = None):
        self.uri = uri
        self.hardware = can_use_hw(uri) if hardware is None else hardware
        self.sink = Gst.ElementFactory.make("gtk4paintablesink", None)
        if self.sink is None:
            raise RuntimeError("gtk4paintablesink indisponível (instale gst-plugin-gtk4)")
        self.paintable = self.sink.get_property("paintable")

        # uridecodebin3 → queue → gtk4paintablesink, SEM playbin3: o playsink do
        # playbin3 insere videoconvert entre o v4l2sl*dec (DMABuf DMA_DRM) e o
        # sink, e o resultado na tela é PRETO no SB3000. Ligação direta = zero-copy.
        self.pipeline = Gst.Pipeline.new(None)
        if self.hardware:
            self.decode = Gst.ElementFactory.make("uridecodebin3", None)
        else:
            # uridecodebin (v2) permite vetar fábricas por pipeline via
            # autoplug-select — o rank global dos v4l2sl* continua alto
            # para os outros vídeos que tocam ao mesmo tempo.
            self.decode = Gst.ElementFactory.make("uridecodebin", None)
            self.decode.connect("autoplug-select", self._skip_hw_decoders)
        self.decode.set_property("uri", uri)
        self.queue = Gst.ElementFactory.make("queue", None)
        self.queue.set_property("max-size-buffers", 4)
        for el in (self.decode, self.queue, self.sink):
            self.pipeline.add(el)
        self.queue.link(self.sink)
        self._video_linked = False
        self.decode.connect("pad-added", self._on_pad_added)

        self._bus = self.pipeline.get_bus()
        self._bus.add_signal_watch()
        self._handler = self._bus.connect("message", self._on_message)
        self._released = False

    @staticmethod
    def _skip_hw_decoders(_bin, _pad, _caps, factory):
        # GstAutoplugSelectResult: 0 = TRY, 2 = SKIP
        return 2 if factory.get_name() in _HW_DECODERS else 0

    def _on_pad_added(self, _decode, pad):
        caps = pad.get_current_caps() or pad.query_caps(None)
        name = caps.get_structure(0).get_name() if caps and caps.get_size() else ""
        if name.startswith("video/") and not self._video_linked:
            if pad.link(self.queue.get_static_pad("sink")) == Gst.PadLinkReturn.OK:
                self._video_linked = True
                return
        # Áudio/legenda/vídeo extra: descarta (criativos são mudos; evita not-linked)
        drop = Gst.ElementFactory.make("fakesink", None)
        drop.set_property("sync", False)
        drop.set_property("async", False)
        self.pipeline.add(drop)
        drop.sync_state_with_parent()
        pad.link(drop.get_static_pad("sink"))

    def play(self):
        self.pipeline.set_state(Gst.State.PLAYING)

    def release(self):
        if self._released:
            return
        self._released = True
        self._bus.disconnect(self._handler)
        self._bus.remove_signal_watch()
        self.pipeline.set_state(Gst.State.NULL)

    def _on_message(self, _bus, msg):
        if msg.type == Gst.MessageType.EOS:
            # Loop sem recriar pipeline (sem flash preto)
            self.pipeline.seek_simple(
                Gst.Format.TIME, Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT, 0
            )
        elif msg.type == Gst.MessageType.ERROR:
            err, dbg = msg.parse_error()
            log.warning("Vídeo %s: %s (%s)", self.uri, err.message, dbg)
            # Tenta de novo em 5 s (ex.: arquivo ainda sendo trocado)
            GLib.timeout_add_seconds(5, self._retry)

    def _retry(self):
        if not self._released:
            self.pipeline.set_state(Gst.State.NULL)
            self.pipeline.set_state(Gst.State.PLAYING)
        return False
