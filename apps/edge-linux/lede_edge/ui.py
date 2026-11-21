"""UI GTK4 do Edge Linux — equivalente a PlayerActivity + ZoneComposer +
CondoStoriesView + PairingActivity do app Android.

Árvore de widgets::

    Window (fullscreen, sem cursor)
     └─ RotatedBin (orientação do Cloud: 0/90/180/270)
         └─ Gtk.Stack
             ├─ "pairing"  RegistrationView (logo + código do auto-registro)
             └─ "player"   Gtk.Box vertical
                  ├─ Gtk.Overlay  (área de anúncio)
                  │    ├─ ZoneArea      (zonas da cena, escala do layout lógico)
                  │    ├─ IdleView      (logo "Anuncie agora mesmo!")
                  │    └─ toast
                  └─ TickerSlot    (faixa fixa 36/1080 da altura — sempre reservada)
"""

from __future__ import annotations

import logging
import socket
import time
from datetime import datetime
from importlib import resources
from typing import Any, Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("Gsk", "4.0")
gi.require_version("Graphene", "1.0")
gi.require_version("GdkPixbuf", "2.0")
from gi.repository import Gdk, GdkPixbuf, Gio, GLib, Graphene, Gsk, Gtk  # noqa: E402

from .controller import EdgeController, now_iso  # noqa: E402
from .media_cache import playlist_fingerprint, story_playlist  # noqa: E402
# .video (GStreamer) é importado sob demanda: não atrasa a primeira tela

log = logging.getLogger(__name__)

# Mesmas constantes do ZoneComposer.kt / activity_player.xml
TICKER_BAR_DP = 36
TICKER_REF_HEIGHT = 1080
TICKER_PAGE_MS = 10_000
REPAIR_WINDOW_S = 5.0
REPAIR_PRESSES = 10
IDLE_HEADLINE = "Anuncie agora mesmo!"
IDLE_PHONE = "(92) 2020-1003"

ORIENTATION_DEGREES = {
    "landscape": 0,
    "portrait": 90,
    "landscape_reverse": 180,
    "portrait_reverse": 270,
}

CSS = """
window, .black { background-color: #000000; }
.registration { background-color: #000000; }
.registration .reg-code { color: #ffffff; font-size: 64pt; font-weight: bold;
                          font-family: monospace; letter-spacing: 10px; }
.idle .headline { color: #ffffff; font-size: 28pt; font-weight: bold; }
.idle .phone { color: #cccccc; font-size: 22pt; }
.toast { background-color: rgba(0,0,0,0.75); color: #ffffff; padding: 10px 16px;
         border-radius: 8px; font-size: 14pt; margin: 24px; }
.ticker { background-color: #F8FAFC; border-top: 2px solid #F97316; }
.ticker .tag { color: #64748B; font-weight: bold; }
.ticker .item-icon { color: #475569; }
.ticker .item-label { color: #64748B; font-weight: bold; }
.ticker .item-value { color: #1E293B; font-weight: bold; }
.ticker .up { color: #16A34A; font-weight: bold; }
.ticker .down { color: #DC2626; font-weight: bold; }
.ticker .code { color: #94A3B8; font-family: monospace; font-weight: bold; }
.ticker .clock { color: #1E293B; font-weight: bold; }
.code-badge { background-color: rgba(0,0,0,0.4); color: rgba(255,255,255,0.8);
              font-family: monospace; font-weight: bold; padding: 2px 6px; }
.stories-track { background-color: rgba(255,255,255,0.4); border-radius: 2px; }
.stories-fill { background-color: #ffffff; border-radius: 2px; }
"""


def _asset(name: str) -> str:
    return str(resources.files("lede_edge") / "assets" / name)


def _hide_cursor(widget: Gtk.Widget):
    """Kiosk: sem cursor (o Gtk.Text do Entry define o I-beam por conta própria)."""
    widget.set_cursor_from_name("none")
    child = widget.get_first_child()
    while child:
        _hide_cursor(child)
        child = child.get_next_sibling()


def _point(x: float, y: float) -> Graphene.Point:
    p = Graphene.Point()
    p.init(x, y)
    return p


# ---------------------------------------------------------------- containers


class RotatedBin(Gtk.Widget):
    """Rotaciona o filho (orientação do device) sem depender do compositor."""

    def __init__(self, on_content_size: Callable[[int, int], None] | None = None):
        super().__init__()
        self._child: Gtk.Widget | None = None
        self.degrees = 0
        # Avisado (fora da alocação) quando o tamanho do conteúdo rotacionado
        # muda de verdade: 1ª alocação, troca de modo HDMI, troca de orientação.
        self._on_content_size = on_content_size
        self._content_size = (0, 0)

    def set_child(self, child: Gtk.Widget):
        if self._child:
            self._child.unparent()
        self._child = child
        child.set_parent(self)

    def set_degrees(self, degrees: int):
        if degrees != self.degrees:
            self.degrees = degrees
            self.queue_allocate()

    def do_measure(self, orientation, for_size):
        return 0, 0, -1, -1

    def do_size_allocate(self, width, height, baseline):
        if not self._child:
            return
        d = self.degrees
        if d in (90, 270):
            cw, ch = height, width
        else:
            cw, ch = width, height
        t = Gsk.Transform.new()
        if d == 90:
            t = t.translate(_point(width, 0)).rotate(90)
        elif d == 180:
            t = t.translate(_point(width, height)).rotate(180)
        elif d == 270:
            t = t.translate(_point(0, height)).rotate(270)
        self._child.allocate(cw, ch, -1, t)
        if (cw, ch) != self._content_size and cw > 0 and ch > 0:
            self._content_size = (cw, ch)
            if self._on_content_size:
                # Não redimensiona dentro da alocação: aplica no próximo ciclo
                GLib.idle_add(lambda: (self._on_content_size(*self._content_size), False)[1])

    def do_dispose(self):
        if self._child:
            self._child.unparent()
            self._child = None


class ZoneArea(Gtk.Widget):
    """Posiciona as zonas escalando x/y/w/h do layout lógico (ZoneComposer.kt).

    A altura lógica útil desconta a reserva da tarja (layoutH × 36/1080),
    exatamente como no Android, para o criativo nunca ficar sob a barra.
    """

    def __init__(self):
        super().__init__()
        self.add_css_class("black")
        self.layout_w = 1920
        self.layout_h = 1080
        self._zones: list[tuple[Gtk.Widget, dict[str, Any]]] = []

    def set_layout(self, w: int | None, h: int | None):
        self.layout_w = max(1, int(w or 1920))
        self.layout_h = max(1, int(h or 1080))
        self.queue_allocate()

    def set_zones(self, zones: list[tuple[Gtk.Widget, dict[str, Any]]]):
        keep = {id(w) for w, _ in zones}
        for w, _ in self._zones:
            if id(w) not in keep and w.get_parent() is self:
                w.unparent()
        for w, _ in zones:
            if w.get_parent() is not self:
                if w.get_parent() is not None:
                    w.unparent()
                w.set_parent(self)
        self._zones = zones
        self.queue_allocate()

    def do_measure(self, orientation, for_size):
        return 0, 0, -1, -1

    def do_size_allocate(self, width, height, baseline):
        lw = self.layout_w
        content_lh = max(1, self.layout_h - ticker_reserve_px(self.layout_h))
        sx = width / lw
        sy = height / content_lh
        for widget, z in self._zones:
            zx = min(max(int(z.get("x") or 0), 0), lw - 1)
            zy = min(max(int(z.get("y") or 0), 0), content_lh - 1)
            zw = max(1, min(int(z.get("width") or lw), lw - zx))
            zh = max(1, min(int(z.get("height") or content_lh), content_lh - zy))
            left = min(max(round(zx * sx), 0), width)
            top = min(max(round(zy * sy), 0), height)
            w = max(1, min(round(zw * sx), width - left))
            h = max(1, min(round(zh * sy), height - top))
            widget.allocate(w, h, -1, Gsk.Transform.new().translate(_point(left, top)))

    def do_dispose(self):
        for w, _ in self._zones:
            if w.get_parent() is self:
                w.unparent()
        self._zones = []


def ticker_reserve_px(layout_h: int) -> int:
    return max(1, round(layout_h * TICKER_BAR_DP / TICKER_REF_HEIGHT))


class FixedTexture(Gtk.Widget):
    """Imagem com tamanho EXATO (sem reescalar pela altura do pai).

    Gtk.Picture é height-for-width: numa faixa horizontal ele cresce para
    preencher a altura e o logo largo vira ~227 px. Aqui a medida é fixa,
    como o ImageView 64dp + fitCenter do Android.
    """

    def __init__(self):
        super().__init__()
        self._texture: Gdk.Texture | None = None
        self._w = 0
        self._h = 0

    def set_texture(self, texture: Gdk.Texture, width: int, height: int):
        self._texture = texture
        self._w, self._h = width, height
        self.queue_resize()

    def do_measure(self, orientation, for_size):
        size = self._w if orientation == Gtk.Orientation.HORIZONTAL else self._h
        return size, size, -1, -1

    def do_snapshot(self, snapshot):
        if not self._texture:
            return
        rect = Graphene.Rect()
        rect.init(0, (self.get_height() - self._h) / 2, self._w, self._h)
        snapshot.append_texture(self._texture, rect)


# ---------------------------------------------------------------- mídias


class MediaView(Gtk.Overlay):
    """Uma mídia (imagem ou vídeo em loop), preenchendo a zona (CENTER_CROP)."""

    def __init__(self, media: dict[str, Any] | None):
        super().__init__()
        self.add_css_class("black")
        self.media = media
        self.video = None
        picture = Gtk.Picture()
        picture.set_content_fit(Gtk.ContentFit.COVER)
        picture.set_can_shrink(True)
        if media and media.get("path"):
            if media.get("type") == "video":
                try:
                    from .video import LoopingVideo

                    self.video = LoopingVideo(media["url"])
                    picture.set_paintable(self.video.paintable)
                    self.video.play()
                except Exception as err:
                    log.warning("Vídeo indisponível: %s", err)
            else:
                picture.set_filename(media["path"])
        self.set_child(picture)

    def current_media(self) -> dict[str, Any] | None:
        return self.media

    def release(self):
        if self.video:
            self.video.release()
            self.video = None


class StoriesView(Gtk.Overlay):
    """Zona condo estilo Stories (CondoStoriesView.kt): ciclo com barrinhas."""

    def __init__(self):
        super().__init__()
        self.add_css_class("black")
        self.playlist: list[dict[str, Any]] = []
        self.fingerprint = ""
        self.index = 0
        self._current: MediaView | None = None
        self._timer = 0
        self._tick = 0
        self._started = 0.0
        self._duration = 10.0

        self._content = Gtk.Box()
        self._content.add_css_class("black")
        self.set_child(self._content)
        self._bars = Gtk.Box(spacing=4)
        self._bars.set_valign(Gtk.Align.START)
        self._bars.set_margin_top(8)
        self._bars.set_margin_start(10)
        self._bars.set_margin_end(10)
        self.add_overlay(self._bars)
        self._fills: list[Gtk.Widget] = []

    def bind(self, items: list[dict[str, Any]], fingerprint: str):
        if not items:
            self.stop()
            self.playlist, self.fingerprint = [], ""
            return
        if fingerprint == self.fingerprint and self.playlist:
            if not self._timer:
                self._show_current()
            return
        self.fingerprint = fingerprint
        self.playlist = items
        self.index = 0
        self._rebuild_bars()
        self._show_current()

    def current_media(self) -> dict[str, Any] | None:
        return self.playlist[self.index] if self.playlist else None

    def stop(self):
        if self._timer:
            GLib.source_remove(self._timer)
            self._timer = 0
        if self._tick:
            self.remove_tick_callback(self._tick)
            self._tick = 0
        if self._current:
            self._current.release()

    def release(self):
        self.stop()

    def _rebuild_bars(self):
        child = self._bars.get_first_child()
        while child:
            nxt = child.get_next_sibling()
            self._bars.remove(child)
            child = nxt
        self._fills = []
        show = len(self.playlist) > 1
        self._bars.set_visible(show)
        for _ in self.playlist:
            track = Gtk.Overlay()
            track.set_hexpand(True)
            bg = Gtk.Box()
            bg.add_css_class("stories-track")
            bg.set_size_request(-1, 3)
            track.set_child(bg)
            fill = Gtk.Box()
            fill.add_css_class("stories-fill")
            fill.set_halign(Gtk.Align.START)
            fill.set_size_request(0, 3)
            track.add_overlay(fill)
            self._bars.append(track)
            self._fills.append(fill)

    def _show_current(self):
        self.stop()
        media = self.current_media()
        if not media:
            return
        old = self._current
        self._current = MediaView(media)
        self._current.set_hexpand(True)
        self._current.set_vexpand(True)
        self._content.append(self._current)
        if old:
            old.release()
            self._content.remove(old)

        self._duration = max(1.0, (media.get("durationMs") or 10000) / 1000)
        self._started = time.monotonic()
        if len(self.playlist) > 1:
            self._tick = self.add_tick_callback(self._on_tick)
        self._timer = GLib.timeout_add(int(self._duration * 1000), self._advance)

    def _on_tick(self, _widget, _clock):
        frac = min(1.0, (time.monotonic() - self._started) / self._duration)
        for i, fill in enumerate(self._fills):
            track_w = fill.get_parent().get_width() if fill.get_parent() else 0
            if i < self.index:
                w = track_w
            elif i == self.index:
                w = int(track_w * frac)
            else:
                w = 0
            fill.set_size_request(w, 3)
        return GLib.SOURCE_CONTINUE

    def _advance(self):
        self._timer = 0
        self.index = (self.index + 1) % len(self.playlist)
        self._show_current()
        return GLib.SOURCE_REMOVE


class Composer:
    """Reaproveita widgets entre cenas (mesma zona + mesma mídia/playlist).

    No Android só os Stories persistem; aqui toda zona com o mesmo conteúdo
    persiste — evita flash preto na zona condo a cada troca de anúncio.
    """

    def __init__(self, area: ZoneArea):
        self.area = area
        self._views: dict[str, tuple[str, Gtk.Widget]] = {}

    def clear(self):
        for _, view in self._views.values():
            view.release()
        self._views.clear()
        self.area.set_zones([])

    def compose(self, scene: dict[str, Any]):
        layout = scene.get("layout") or {}
        self.area.set_layout(layout.get("width"), layout.get("height"))
        placed: list[tuple[Gtk.Widget, dict[str, Any]]] = []
        used: set[str] = set()
        for zone in scene.get("zones") or []:
            key = zone.get("key") or zone.get("id")
            playlist = story_playlist(zone)
            stories = bool(zone.get("items")) and len(playlist) > 0
            sig = ("S:" + playlist_fingerprint(zone)) if stories else (
                "M:" + ((zone.get("media") or (playlist[0] if playlist else {}) or {}).get("checksum") or "")
            )
            existing = self._views.get(key)
            if existing and existing[0] == sig:
                view = existing[1]
            else:
                if existing:
                    existing[1].release()
                if stories:
                    view = StoriesView()
                    view.bind(playlist, playlist_fingerprint(zone))
                else:
                    view = MediaView(zone.get("media") or (playlist[0] if playlist else None))
                self._views[key] = (sig, view)
            used.add(key)
            placed.append((view, zone))
        for key in [k for k in self._views if k not in used]:
            self._views.pop(key)[1].release()
        self.area.set_zones(placed)

    def visible_media(self, scene: dict[str, Any]) -> list[tuple[str, str]]:
        out = []
        for zone in scene.get("zones") or []:
            key = zone.get("key") or zone.get("id")
            entry = self._views.get(key)
            media = entry[1].current_media() if entry else None
            if media is None:
                playlist = story_playlist(zone)
                media = zone.get("media") or (playlist[0] if playlist else None)
            if media and media.get("id"):
                out.append((media["id"], media.get("checksum", "")))
        return out


# ---------------------------------------------------------------- tarja


class ClipBin(Gtk.Widget):
    """Área dos índices: pede largura mínima 0 e corta o que sobrar.

    Sem isso, uma página mais larga que a faixa elevava o mínimo da tela do
    player acima da largura disponível e o Gtk.Stack centralizava o conteúdo,
    cortando as duas pontas da tarja (tag "ÍNDICES" e relógio na borda).
    """

    def __init__(self, child: Gtk.Widget, on_width: Callable[[int], None]):
        super().__init__()
        self._child = child
        child.set_parent(self)
        self.set_overflow(Gtk.Overflow.HIDDEN)
        self._width = 0
        self._on_width = on_width

    def do_measure(self, orientation, for_size):
        mn, nat, _, _ = self._child.measure(orientation, for_size)
        if orientation == Gtk.Orientation.HORIZONTAL:
            return 0, nat, -1, -1
        return mn, nat, -1, -1

    def do_size_allocate(self, width, height, baseline):
        mn, _, _, _ = self._child.measure(Gtk.Orientation.HORIZONTAL, height)
        self._child.allocate(max(width, mn), height, -1, None)
        if width != self._width:
            self._width = width
            GLib.idle_add(lambda: (self._on_width(self._width), False)[1])

    def do_dispose(self):
        if self._child:
            self._child.unparent()
            self._child = None


class TickerSlot(Gtk.Overlay):
    """Faixa inferior sempre reservada; mostra a tarja ou só o badge do código."""

    def __init__(self):
        super().__init__()
        self.add_css_class("black")
        self.items: list[dict[str, Any]] = []
        self.pages: list[list[dict[str, Any]]] = []
        self.page = 0
        self.tz: ZoneInfo | None = None
        self.code = ""

        self.bar = Gtk.Box(spacing=0)
        self.bar.add_css_class("ticker")
        self.bar.set_visible(False)
        self.set_child(self.bar)

        self.tag = Gtk.Label(label="ÍNDICES")
        self.tag.add_css_class("tag")
        self.items_box = Gtk.Box(spacing=0)
        self.items_area = ClipBin(self.items_box, lambda _w: self._repaginate())
        self.items_area.set_hexpand(True)
        self.logo = FixedTexture()
        self.logo.set_valign(Gtk.Align.FILL)
        self.logo.set_margin_start(6)
        self.code_label = Gtk.Label()
        self.code_label.add_css_class("code")
        self.clock = Gtk.Label(label="00:00")
        self.clock.add_css_class("clock")
        for w in (self.tag, self.items_area, self.logo, self.code_label, self.clock):
            self.bar.append(w)

        self.badge = Gtk.Label()
        self.badge.add_css_class("code-badge")
        self.badge.set_halign(Gtk.Align.END)
        self.badge.set_valign(Gtk.Align.CENTER)
        self.badge.set_margin_end(10)
        self.badge.set_visible(False)
        self.add_overlay(self.badge)

        self._css = Gtk.CssProvider()
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), self._css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1
        )
        self._scale_px = 0
        self._repaginate_pending = False
        # Já nasce com tamanho/fontes/margens de 1080p; a janela reaplica pela
        # altura real assim que o conteúdo rotacionado tiver tamanho.
        self.apply_height(TICKER_BAR_DP)
        GLib.timeout_add_seconds(1, self._tick_clock)
        GLib.timeout_add(TICKER_PAGE_MS, self._next_page)

    def apply_height(self, px: int):
        """Fontes proporcionais à altura da faixa (36dp ≈ 36/1080 da tela)."""
        px = max(16, px)
        self.set_size_request(-1, px)
        self.set_vexpand(False)
        self.set_overflow(Gtk.Overflow.HIDDEN)
        if px == self._scale_px:
            return
        self._scale_px = px
        f = px / 36.0
        self._css.load_from_string(
            f"""
            .ticker .tag {{ font-size: {9 * f:.1f}px; }}
            .ticker .item-icon {{ font-size: {13 * f:.1f}px; }}
            .ticker .item-label {{ font-size: {9 * f:.1f}px; }}
            .ticker .item-value {{ font-size: {11 * f:.1f}px; }}
            .ticker .up, .ticker .down {{ font-size: {10 * f:.1f}px; }}
            .ticker .code {{ font-size: {10 * f:.1f}px; }}
            .ticker .clock {{ font-size: {14 * f:.1f}px; }}
            .code-badge {{ font-size: {10 * f:.1f}px; }}
            """
        )
        # Android: ImageView 64dp × match_parent (faixa − 2dp da linha), fitCenter
        pix = GdkPixbuf.Pixbuf.new_from_file_at_scale(
            _asset("lede_logo_dark.png"), int(64 * f), max(8, px - int(2 * f)), True
        )
        self.logo.set_texture(Gdk.Texture.new_for_pixbuf(pix), pix.get_width(), pix.get_height())
        # Margens do activity_player.xml (dp → px pela escala da faixa).
        # As laterais da faixa vão como margem dos widgets das pontas: o
        # padding via CSS no .ticker não era respeitado e o texto colava na borda.
        self.tag.set_margin_start(int(12 * f))
        self.clock.set_margin_end(int(12 * f))
        self.items_area.set_margin_start(int(4 * f))
        self.logo.set_margin_start(int(6 * f))
        self.code_label.set_margin_start(int(8 * f))
        self.clock.set_margin_start(int(8 * f))
        self._repaginate()

    def set_timezone(self, tz: str):
        try:
            self.tz = ZoneInfo(tz)
        except (ZoneInfoNotFoundError, ValueError):
            return
        self._tick_clock()

    def set_code(self, code: str | None):
        self.code = (code or "").strip()
        self.code_label.set_label(self.code.upper())
        self.badge.set_label(self.code.upper())
        self._sync_badge()

    def show_payload(self, payload: dict[str, Any] | None):
        if not payload:
            self.items = []
            self.pages = []
            self.bar.set_visible(False)
        else:
            self.items = list(payload.get("items") or [])
            self.bar.set_visible(True)
            self._repaginate()
        self._sync_badge()
        self._tick_clock()

    def _sync_badge(self):
        self.badge.set_visible(bool(self.code) and not self.bar.get_visible())

    def _tick_clock(self):
        now = datetime.now(self.tz) if self.tz else datetime.now()
        self.clock.set_label(now.strftime("%H:%M"))
        return GLib.SOURCE_CONTINUE

    def _item_widget(self, item: dict[str, Any]) -> Gtk.Widget:
        f = max(self._scale_px, 16) / 36.0
        box = Gtk.Box(spacing=int(5 * f))
        box.set_margin_start(int(8 * f))
        box.set_margin_end(int(8 * f))
        box.set_valign(Gtk.Align.CENTER)
        icon = Gtk.Label(label=(item.get("icon") or "•").strip() or "•")
        icon.add_css_class("item-icon")
        icon.set_size_request(int(18 * f), -1)
        col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        label = Gtk.Label(label=(item.get("label") or "").upper(), xalign=0)
        label.add_css_class("item-label")
        row = Gtk.Box(spacing=int(3 * f))
        pct = item.get("changePct")
        if pct is not None:
            up = pct >= 0
            change = Gtk.Label(label=f"{'▲' if up else '▼'} {'+' if up else ''}{pct:.2f}%")
            change.add_css_class("up" if up else "down")
            row.append(change)
        value = Gtk.Label(label=item.get("value") or "")
        value.add_css_class("item-value")
        row.append(value)
        col.append(label)
        col.append(row)
        box.append(icon)
        box.append(col)
        return box

    def _repaginate(self):
        if not self.bar.get_visible():
            return  # show_payload repagina quando a tarja aparecer
        avail = self.items_area.get_width()
        if avail <= 0:
            # Ainda sem alocação (tarja recém-exibida ou tela do player oculta).
            # Antes era um idle_add que se reagendava a cada iteração do main
            # loop: com a faixa sem largura isso girava a 100% de CPU sem fim.
            if not self._repaginate_pending:
                self._repaginate_pending = True
                GLib.timeout_add(250, self._repaginate_retry)
            return
        pages: list[list[dict[str, Any]]] = []
        cur: list[dict[str, Any]] = []
        used = 0
        for item in self.items:
            _, nat, _, _ = self._item_widget(item).measure(Gtk.Orientation.HORIZONTAL, -1)
            if cur and used + nat > avail:
                pages.append(cur)
                cur, used = [], 0
            cur.append(item)
            used += nat
        if cur:
            pages.append(cur)
        self.pages = pages
        self.page = 0
        self._show_page()

    def _repaginate_retry(self):
        self._repaginate_pending = False
        self._repaginate()
        return GLib.SOURCE_REMOVE

    def _show_page(self):
        child = self.items_box.get_first_child()
        while child:
            nxt = child.get_next_sibling()
            self.items_box.remove(child)
            child = nxt
        if not self.pages:
            return
        for item in self.pages[self.page % len(self.pages)]:
            self.items_box.append(self._item_widget(item))

    def _next_page(self):
        if self.bar.get_visible() and len(self.pages) > 1:
            self.page = (self.page + 1) % len(self.pages)
            self._show_page()
        return GLib.SOURCE_CONTINUE


# ---------------------------------------------------------------- telas


class IdleView(Gtk.Box):
    def __init__(self):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.add_css_class("black")
        self.add_css_class("idle")
        self.set_halign(Gtk.Align.FILL)
        self.set_valign(Gtk.Align.FILL)
        inner = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        inner.set_halign(Gtk.Align.CENTER)
        inner.set_valign(Gtk.Align.CENTER)
        inner.set_vexpand(True)
        logo = Gtk.Picture.new_for_filename(_asset("lede_logo.png"))
        logo.set_content_fit(Gtk.ContentFit.CONTAIN)
        logo.set_size_request(320, 120)
        headline = Gtk.Label(label=IDLE_HEADLINE)
        headline.add_css_class("headline")
        headline.set_margin_top(28)
        phone = Gtk.Label(label=IDLE_PHONE)
        phone.add_css_class("phone")
        for w in (logo, headline, phone):
            inner.append(w)
        self.append(inner)


# Mesmo tamanho do splash do boot (packaging/image/splash): logo com 360 px de
# largura, centralizado em 1280×720 — a passagem boot → app fica contínua.
SPLASH_LOGO_WIDTH = 360


class SplashView(Gtk.Box):
    """Primeira tela do app: só o logo, idêntico ao splash do framebuffer."""

    def __init__(self):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.add_css_class("black")
        pix = GdkPixbuf.Pixbuf.new_from_file_at_scale(
            _asset("lede_logo.png"), SPLASH_LOGO_WIDTH, -1, True
        )
        logo = FixedTexture()
        logo.set_texture(Gdk.Texture.new_for_pixbuf(pix), pix.get_width(), pix.get_height())
        logo.set_halign(Gtk.Align.CENTER)
        logo.set_valign(Gtk.Align.CENTER)
        logo.set_vexpand(True)
        self.append(logo)


class RegistrationView(Gtk.Box):
    """Box ainda não aceito no Cloud: só o logo e o código da tela.

    O código é calculado localmente a partir do hardwareId (mesmo algoritmo da
    API), então aparece desde o primeiro boot, mesmo sem rede.
    """

    def __init__(self):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.add_css_class("registration")
        inner = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=36)
        inner.set_halign(Gtk.Align.CENTER)
        inner.set_valign(Gtk.Align.CENTER)
        inner.set_vexpand(True)
        logo = Gtk.Picture.new_for_filename(_asset("lede_logo.png"))
        logo.set_content_fit(Gtk.ContentFit.CONTAIN)
        logo.set_can_shrink(True)
        logo.set_size_request(360, 90)
        self.code = Gtk.Label()
        self.code.add_css_class("reg-code")
        inner.append(logo)
        inner.append(self.code)
        self.append(inner)

    def set_code(self, code: str | None):
        if code:
            self.code.set_label(code)
        _hide_cursor(self)


# ---------------------------------------------------------------- janela


class PlayerWindow(Gtk.ApplicationWindow):
    """Implementa controller.View."""

    def __init__(self, app: Gtk.Application, controller: EdgeController):
        super().__init__(application=app, title="LEDE Edge")
        self.app = app
        self.controller = controller
        self.exit_code = 0
        self.scenes: list[dict[str, Any]] = []
        self.index = 0
        self._advance_token = 0
        self._repair_presses: list[float] = []

        self.set_cursor_from_name("none")
        self.set_decorated(False)

        self.rotated = RotatedBin(on_content_size=self._on_content_size)
        self.set_child(self.rotated)
        self.stack = Gtk.Stack()
        self.stack.set_transition_type(Gtk.StackTransitionType.NONE)
        self.rotated.set_child(self.stack)

        self.splash = SplashView()
        self.stack.add_named(self.splash, "splash")
        self.registration = RegistrationView()
        self.stack.add_named(self.registration, "pairing")

        player = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        player.add_css_class("black")
        self.overlay = Gtk.Overlay()
        self.overlay.set_vexpand(True)
        self.area = ZoneArea()
        self.overlay.set_child(self.area)
        self.idle = IdleView()
        self.overlay.add_overlay(self.idle)
        self.toast_label = Gtk.Label()
        self.toast_label.add_css_class("toast")
        self.toast_label.set_halign(Gtk.Align.CENTER)
        self.toast_label.set_valign(Gtk.Align.END)
        self.toast_label.set_visible(False)
        self.overlay.add_overlay(self.toast_label)
        self.ticker = TickerSlot()
        player.append(self.overlay)
        player.append(self.ticker)
        self.stack.add_named(player, "player")
        self.stack.set_visible_child_name("splash")

        self.composer = Composer(self.area)

        keys = Gtk.EventControllerKey()
        keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        keys.connect("key-pressed", self._on_key)
        self.add_controller(keys)


    # ---- tamanho da tarja (proporcional à altura do conteúdo rotacionado)

    def _on_content_size(self, width: int, height: int):
        # Chamado pelo RotatedBin sempre que o conteúdo (já rotacionado) muda
        # de tamanho. Antes dependia de notify::default-height (não muda em
        # fullscreen), notify::height (não existe no GTK4) e de um timer de
        # 500 ms: no boot lento nenhum acertava e a tarja ficava sem escala.
        px = round(height * TICKER_BAR_DP / TICKER_REF_HEIGHT)
        log.info("Tela %dx%d (rotação %d°) → tarja %dpx", width, height, self.rotated.degrees, px)
        self.ticker.apply_height(px)

    # ---- View

    def show_pairing(self, code: str):
        self._stop_playback()
        self.stack.set_visible_child_name("pairing")
        self.registration.set_code(code)

    def show_registration(self, status: str, code: str | None, message: str | None):
        # Só logo + código na TV; status/motivo ficam no log e no Cloud
        log.info("Registro: %s%s", status, f" ({message})" if message else "")
        self.registration.set_code(code)

    def show_scenes(self, scenes: list[dict[str, Any]]):
        self.stack.set_visible_child_name("player")
        was_playing = bool(self.scenes) and self._advance_token > 0 and not self.idle.get_visible()
        self.scenes = scenes
        if self.index >= len(scenes):
            self.index = 0
        if not was_playing:
            self._play_current()
        # Se já está tocando, a lista nova vale a partir do próximo advance

    def show_idle(self, message: str):
        log.info("Idle: %s", message)
        self.stack.set_visible_child_name("player")
        self._stop_playback()
        self.idle.set_visible(True)

    def show_ticker(self, payload: dict[str, Any] | None):
        self.ticker.show_payload(payload)

    def set_device_code(self, code: str | None):
        self.ticker.set_code(code)

    def set_orientation(self, orientation: str):
        self.rotated.set_degrees(ORIENTATION_DEGREES.get(orientation, 0))

    def set_clock_timezone(self, tz: str):
        self.ticker.set_timezone(tz)

    def toast(self, message: str):
        self.toast_label.set_label(message)
        self.toast_label.set_visible(True)
        GLib.timeout_add_seconds(4, lambda: (self.toast_label.set_visible(False), False)[1])

    def quit(self, code: int):
        self.exit_code = code
        self._stop_playback()
        self.app.quit()

    # ---- loop de cenas (playCurrent / advance da PlayerActivity)

    def _stop_playback(self):
        self._advance_token += 1
        self.scenes = []
        self.composer.clear()

    def _play_current(self):
        if not self.scenes:
            return
        scene = self.scenes[self.index % len(self.scenes)]
        started_at = now_iso()
        self._advance_token += 1
        token = self._advance_token
        self.idle.set_visible(False)
        self.composer.compose(scene)
        duration = max(1000, int(scene.get("durationMs") or 10000))

        def advance():
            if token != self._advance_token:
                return GLib.SOURCE_REMOVE
            entries = self.composer.visible_media(scene)
            self.controller.record_play(scene.get("id", ""), entries, started_at, now_iso())
            if self.scenes:
                self.index = (self.index + 1) % len(self.scenes)
                self._play_current()
            return GLib.SOURCE_REMOVE

        GLib.timeout_add(duration, advance)

    # ---- teclas: re-parear com Volume− ×10 em 5 s (igual ao Android)

    def _on_key(self, _ctrl, keyval, _code, _state):
        if keyval in (Gdk.KEY_AudioLowerVolume, Gdk.KEY_minus, Gdk.KEY_KP_Subtract) and (
            self.stack.get_visible_child_name() == "player"
        ):
            now = time.monotonic()
            self._repair_presses = [t for t in self._repair_presses if now - t <= REPAIR_WINDOW_S]
            self._repair_presses.append(now)
            n = len(self._repair_presses)
            if n in (5, 8):
                self.toast(f"Re-parear: {n}/{REPAIR_PRESSES}")
            if n >= REPAIR_PRESSES:
                self._repair_presses = []
                self.toast("Re-pareando… digite o novo código")
                self.controller.unpair("gesto local Volume− ×10")
            return True
        return False


def run(controller: EdgeController, on_shown: Callable[[], None] | None = None) -> int:
    app = Gtk.Application(
        application_id="br.tv.lede.edge", flags=Gio.ApplicationFlags.NON_UNIQUE
    )
    state: dict[str, Any] = {}

    def on_activate(app_):
        provider = Gtk.CssProvider()
        provider.load_from_string(CSS)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        win = PlayerWindow(app_, controller)
        state["win"] = win
        controller.attach(win)
        win.idle.set_visible(False)
        started = {"done": False}

        def start_heavy():
            # Inicialização pesada (GStreamer, registro…) só depois do logo na tela
            if on_shown:
                on_shown()
            controller.start()
            return GLib.SOURCE_REMOVE

        def on_after_paint(clock):
            if started["done"]:
                return
            started["done"] = True
            clock.disconnect(state["paint_handler"])
            log.info("Janela exibida (logo na tela)")
            _close_boot_splash()  # o imv da sessão já pode sair: o app cobre a tela
            GLib.idle_add(start_heavy)

        def on_realize(widget):
            clock = widget.get_frame_clock()
            state["paint_handler"] = clock.connect("after-paint", on_after_paint)

        win.connect("realize", on_realize)
        win.fullscreen()
        win.present()

    app.connect("activate", on_activate)
    app.run([])
    controller.stop()
    win = state.get("win")
    return win.exit_code if win else 1


def _close_boot_splash():
    """Encerra o imv do splash (session) — a janela do app já cobre a tela."""
    import os
    import signal
    from pathlib import Path

    pid_file = Path(os.environ.get("XDG_RUNTIME_DIR", "/run/lede-edge")) / "splash.pid"
    try:
        pid = int(pid_file.read_text().strip())
        os.kill(pid, signal.SIGTERM)
    except (OSError, ValueError):
        pass
    pid_file.unlink(missing_ok=True)


def post_to_main(fn: Callable[[], None]):
    def wrapper():
        try:
            fn()
        except Exception:
            log.exception("Erro em callback de UI")
        return GLib.SOURCE_REMOVE

    GLib.idle_add(wrapper)
