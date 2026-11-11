"""Ponto de entrada: ``python3 -m lede_edge`` (o lançador roda dentro do cage)."""

from __future__ import annotations

import logging
import sys

from . import __version__, config
from .controller import EdgeController, sd_notify


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    log = logging.getLogger("lede_edge")
    cfg = config.load()
    log.info("LEDE Edge Linux v%s (flavor=%s, api=%s)", __version__, cfg.flavor, cfg.api_base_url)

    # Só GTK antes da primeira tela; GStreamer e troca de resolução depois do logo
    from . import system, telemetry, ui

    def after_logo():
        # Resolução 1280×720 (igual ao Android). O cage sobe no modo preferido do
        # monitor; trocar depois do logo evita mais segundos de tela preta.
        applied = system.set_output_mode(cfg.output_mode)
        if applied:
            telemetry.CURRENT_SCREEN = applied
        from . import video

        video.init()

    controller = EdgeController(cfg, post=ui.post_to_main)
    sd_notify(f"READY=1\nSTATUS=v{__version__}")
    return ui.run(controller, on_shown=after_logo)


if __name__ == "__main__":
    sys.exit(main())
