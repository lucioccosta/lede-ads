#!/usr/bin/env python3
"""Aplica pacotes Arch (.pkg.tar.*) num rootfs extraído, sem pacman e sem root.

Reproduz o que o pacman faz na instalação/atualização (exceto scriptlets e
hooks, que rodam no primeiro boot — ver firstboot):
  - atualização: remove arquivos da versão antiga ausentes na nova;
  - arquivos de configuração (%BACKUP%): se o da base foi MODIFICADO, mantém e
    grava o novo como .pacnew; se não foi, substitui;
  - banco local (/var/lib/pacman/local/<pkg>-<ver>/): usa as entradas do box
    (desc/files/mtree), para o pacman do box saber o que está instalado.

Rodar dentro de fakeroot (donos/setuid dos pacotes ficam registrados):

    fakeroot -i S -s S -- apply-packages.py ROOTFS PKGS_DIR LOCALDB_DIR
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

META = (".PKGINFO", ".BUILDINFO", ".MTREE", ".INSTALL", ".CHANGELOG")


def parse_db(path: Path) -> dict[str, list[str]]:
    """Lê arquivos desc/files do pacman: %SECAO%\\nvalor\\nvalor\\n\\n"""
    out: dict[str, list[str]] = {}
    key = None
    for line in path.read_text().splitlines():
        if line.startswith("%") and line.endswith("%"):
            key = line.strip("%")
            out[key] = []
        elif key and line:
            out[key].append(line)
    return out


def md5(path: Path) -> str | None:
    try:
        return hashlib.md5(path.read_bytes()).hexdigest()
    except OSError:
        return None


def main() -> int:
    root, pkgs_dir, localdb = (Path(p) for p in sys.argv[1:4])
    dbroot = root / "var/lib/pacman/local"

    # Entradas antigas da base, por nome
    old_entries: dict[str, Path] = {}
    for d in dbroot.iterdir():
        if d.is_dir() and (d / "desc").exists():
            name = parse_db(d / "desc")["NAME"][0]
            old_entries[name] = d

    pkg_files = sorted(p for p in pkgs_dir.iterdir() if ".pkg.tar" in p.name and not p.name.endswith(".sig"))
    installs: list[str] = []
    pacnew: list[str] = []

    for entry in sorted(localdb.iterdir()):
        desc = parse_db(entry / "desc")
        name, ver = desc["NAME"][0], desc["VERSION"][0]
        files = parse_db(entry / "files")
        new_files = set(files.get("FILES", []))
        new_backup = {line.split("\t")[0] for line in files.get("BACKUP", [])}
        pkg = next((p for p in pkg_files if p.name.startswith(f"{name}-{ver}-")), None)
        if pkg is None:
            print(f"ERRO: pacote ausente para {name} {ver}", file=sys.stderr)
            return 1

        old = old_entries.get(name)
        old_backup_md5: dict[str, str] = {}
        if old:
            old_files = parse_db(old / "files")
            for line in old_files.get("BACKUP", []):
                path, _, digest = line.partition("\t")
                old_backup_md5[path] = digest
            # remove arquivos que saíram do pacote (não diretórios, não configs)
            for f in old_files.get("FILES", []):
                if f.endswith("/") or f in new_files or f in old_backup_md5:
                    continue
                target = root / f
                if target.is_symlink() or target.is_file():
                    target.unlink()
            shutil.rmtree(old)

        # Configurações modificadas pelo usuário: preserva (novo vira .pacnew)
        keep: list[tuple[Path, Path]] = []
        for b in new_backup:
            target = root / b
            if not target.exists():
                continue
            current = md5(target)
            if b in old_backup_md5 and current == old_backup_md5[b]:
                continue  # não modificado: pacman substitui pelo novo
            if not old and b not in old_backup_md5:
                pass  # arquivo de outro pacote/base (ex.: lm_sensors x miniarch-meta)
            saved = target.with_name(target.name + ".lede-keep")
            target.rename(saved)
            keep.append((target, saved))

        subprocess.run(
            ["tar", "-xpf", str(pkg), "-C", str(root), "--numeric-owner", "--same-owner",
             *[f"--exclude={m}" for m in META]],
            check=True,
        )

        for target, saved in keep:
            if target.exists():
                target.rename(target.with_name(target.name + ".pacnew"))
                pacnew.append(str(target.relative_to(root)) + ".pacnew")
            saved.rename(target)

        shutil.copytree(entry, dbroot / entry.name, dirs_exist_ok=True)
        if (entry / "install").exists():
            installs.append(name)

    print(f"{len(list(localdb.iterdir()))} pacotes aplicados")
    print("scriptlets (.INSTALL) a cobrir no 1º boot:", ", ".join(sorted(installs)) or "-")
    print(".pacnew:", ", ".join(pacnew) or "-")
    return 0


if __name__ == "__main__":
    sys.exit(main())
