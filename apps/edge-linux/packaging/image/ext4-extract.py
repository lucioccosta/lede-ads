#!/usr/bin/env python3
"""Extrai um ext4 (imagem) para um diretório SEM montar e SEM root.

Usa `debugfs rdump` e depois reaplica modo/dono EXATOS de cada inode (o rdump
perde setuid/setgid/sticky — ex.: su 04755, unix_chkpwd 06755). Deve rodar
dentro de uma sessão fakeroot para chown/setuid ficarem registrados:

    fakeroot -i S -s S -- ext4-extract.py root.ext4 rootfs/
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

LINE = re.compile(r"^/(\d+)/(\d+)/(\d+)/(\d+)/(.*)/(\d*)/$")


def ls_dir(image: str, path: str) -> list[tuple[int, int, int, str]]:
    """`ls -p` do debugfs: /inode/mode/uid/gid/name/size/"""
    out = subprocess.run(
        ["debugfs", "-R", f'ls -p "{path}"', image],
        capture_output=True, text=True, check=True,
    ).stdout
    entries = []
    for line in out.splitlines():
        m = LINE.match(line)
        if not m:
            continue
        _ino, mode, uid, gid, name, _size = m.groups()
        if name in (".", ".."):
            continue
        entries.append((int(mode, 8), int(uid), int(gid), name))
    return entries


def main() -> int:
    image, dest = sys.argv[1], Path(sys.argv[2])
    dest.mkdir(parents=True, exist_ok=True)
    subprocess.run(["debugfs", "-R", f"rdump / {dest}", image], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    fixed = 0
    dirs = [("/", 0o40755, 0, 0)]
    # BFS pelos diretórios: reaplica dono e modo de cada entrada
    queue = ["/"]
    seen = 0
    while queue:
        d = queue.pop()
        for mode, uid, gid, name in ls_dir(image, d):
            src = (d.rstrip("/") + "/" + name)
            real = dest / src.lstrip("/")
            ftype = mode & 0o170000
            if ftype == 0o040000:
                queue.append(src)
            if ftype == 0o120000:  # symlink: só dono
                try:
                    os.lchown(real, uid, gid)
                except FileNotFoundError:
                    pass
                continue
            try:
                os.lchown(real, uid, gid)
                os.chmod(real, mode & 0o7777)  # depois do chown (chown limpa setuid)
                fixed += 1
            except FileNotFoundError:
                print(f"aviso: {src} não extraído", file=sys.stderr)
            seen += 1
    print(f"{seen} entradas, modos/donos reaplicados em {fixed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
