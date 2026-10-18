#!/usr/bin/env python3
"""Analyse von START.EXE (Tony & Friends in Kellogg's Land, 1994).

Liest den NE-Header (16-Bit Protected Mode, Borland RTM/DPMI16) und gibt
Segmente, Einsprungpunkt und importierte Systemfunktionen aus.

Aufruf:  python3 tools/neinfo.py <pfad>/START.EXE [--json out.json]
"""
import json
import struct
import sys
from collections import Counter

# Bekannte KERNEL-Ordinals (Win16-API, die Borland RTM unter DOS nachbildet)
KERNEL_NAMES = {
    15: "GlobalAlloc", 16: "GlobalReAlloc", 17: "GlobalFree", 18: "GlobalLock",
    19: "GlobalUnlock", 20: "GlobalSize", 91: "InitTask", 102: "DOS3Call",
    113: "__AHSHIFT", 114: "__AHINCR", 170: "AllocCStoDSAlias",
    171: "AllocDStoCSAlias", 172: "AllocAlias", 173: "__ROMBIOS", 174: "__A000H",
    175: "AllocSelector", 176: "FreeSelector", 177: "PrestoChangoSelector",
    178: "__WINFLAGS", 179: "__D000H", 180: "LongPtrAdd", 181: "__B000H",
    182: "__B800H", 183: "__0000H", 184: "GlobalDOSAlloc", 185: "GlobalDOSFree",
    186: "GetSelectorBase", 187: "SetSelectorBase", 188: "GetSelectorLimit",
    189: "SetSelectorLimit", 190: "__E000H", 193: "__0040H", 194: "__F000H",
    195: "__C000H",
}


def parse(path):
    d = open(path, "rb").read()
    if d[:2] != b"MZ":
        raise SystemExit("keine MZ-Datei")
    ne, = struct.unpack_from("<I", d, 0x3C)
    if d[ne:ne + 2] != b"NE":
        raise SystemExit("kein NE-Header")
    ip, cs = struct.unpack_from("<HH", d, ne + 0x14)
    sp, ss = struct.unpack_from("<HH", d, ne + 0x18)
    segcnt, modcnt = struct.unpack_from("<HH", d, ne + 0x1C)
    segtab, = struct.unpack_from("<H", d, ne + 0x22)
    modref, impn = struct.unpack_from("<HH", d, ne + 0x28)
    align, = struct.unpack_from("<H", d, ne + 0x32)

    def modname(i):
        o, = struct.unpack_from("<H", d, ne + modref + (i - 1) * 2)
        n = d[ne + impn + o]
        return d[ne + impn + o + 1:ne + impn + o + 1 + n].decode()

    segs, imports = [], Counter()
    for s in range(segcnt):
        off, ln, fl, minalloc = struct.unpack_from("<HHHH", d, ne + segtab + s * 8)
        seg = {
            "nr": s + 1,
            "file_offset": off << align if off else None,
            "size": ln or (0x10000 if off else 0),
            "alloc": minalloc or 0x10000,
            "type": "DATA" if fl & 1 else "CODE",
            "relocs": 0,
        }
        if off and fl & 0x100:
            r = (off << align) + seg["size"]
            n, = struct.unpack_from("<H", d, r)
            seg["relocs"] = n
            for k in range(n):
                _, fx, _, a, b = struct.unpack_from("<BBHHH", d, r + 2 + k * 8)
                if fx & 3 == 1:
                    mod = modname(a)
                    name = KERNEL_NAMES.get(b, f"ord{b}") if mod == "KERNEL" else f"ord{b}"
                    imports[f"{mod}.{name}"] += 1
                elif fx & 3 == 2:
                    n2 = d[ne + impn + b]
                    imports[f"{modname(a)}.{d[ne + impn + b + 1:ne + impn + b + 1 + n2].decode()}"] += 1
        segs.append(seg)

    return {
        "file": path,
        "size": len(d),
        "entry": {"cs": cs, "ip": ip},
        "stack": {"ss": ss, "sp": sp},
        "segments": segs,
        "code_bytes": sum(s["size"] for s in segs if s["type"] == "CODE"),
        "imports": dict(sorted(imports.items())),
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    info = parse(sys.argv[1])
    print(f"{info['file']}  ({info['size']} Bytes)")
    print(f"Einsprung  CS:IP = seg{info['entry']['cs']}:{info['entry']['ip']:04x}")
    print(f"Stack      SS:SP = seg{info['stack']['ss']}:{info['stack']['sp']:04x}")
    for s in info["segments"]:
        fo = f"{s['file_offset']:#07x}" if s["file_offset"] is not None else "   (bss)"
        print(f"  seg{s['nr']}  {s['type']}  datei {fo}  größe {s['size']:#06x}  relocs {s['relocs']}")
    print(f"Code gesamt: {info['code_bytes']} Bytes")
    print("Importe:")
    for k, v in info["imports"].items():
        print(f"  {k:32} {v}x")
    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        json.dump(info, open(out, "w"), indent=2)
        print(f"-> {out}")


if __name__ == "__main__":
    main()
