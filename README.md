# Kellogg's Land HD

Static Recompilation von **Tony & Friends in Kellogg's Land** (Factor 5 / Rauser Advertainment, DOS 1994) für den Browser, nach dem Vorbild von [Stunts HD](https://github.com/mr-finster/stunts-hd).

Die originale `START.EXE` wird Befehl für Befehl nach JavaScript übersetzt und auf einem kleinen emulierten PC ausgeführt. Ein WebGL-Renderer zeichnet das Bild danach neu, in HD, Breitbild und ohne Ruckeln. Weil der echte Spielcode läuft, verhalten sich Steuerung, Gegner und Level genau wie im Original.

> **Status:** Phase 0, Analyse. Noch nichts spielbar.

## Keine Spieldaten im Repo

Dieses Repository enthält **keine** Dateien des Spiels. Du brauchst deine eigene Kopie (Freeware, z. B. `kelloggs.zip`) mit `START.EXE`, `PCKELL.DAT`, `RTM.EXE` und `DPMI16BI.OVL`. Lege sie lokal in `game/` ab, der Ordner steht in `.gitignore`. Im fertigen Port wird die Kopie im Browser gelesen und nie hochgeladen.

## Was wir über START.EXE wissen

`python3 tools/neinfo.py game/START.EXE`

| Eigenschaft | Wert |
|---|---|
| Format | NE (16-Bit Protected Mode), Borland RTM / DPMI16 |
| Code | 5 Segmente, 100 610 Bytes |
| Daten | seg6 (28 KB initialisiert) + seg7 (64 KB Stack/BSS) |
| Einsprung | `seg1:13a1` |
| Importe | 13 KERNEL-Funktionen + 3 RTM-Ordinals |

Die Importe beschränken sich auf Speicher (`GlobalAlloc`, `GlobalDOSAlloc` …), feste Selektoren für Video-RAM und BIOS-Daten (`__A000H`, `__B800H`, `__0040H`) und einen Code-Alias. Das ist eine kleine Fläche, die wir nachbauen müssen. Details stehen in [docs/ANALYSE.md](docs/ANALYSE.md).

## Aufbau (geplant, analog zu Stunts HD)

| Datei | Aufgabe |
|---|---|
| `tools/neinfo.py` | NE-Header, Segmente, Importe auslesen ✅ |
| `web/ne.js` | NE-Loader: Segmente laden, Relocations auflösen |
| `web/x86dec.js` | 16-Bit-x86-Decoder (inkl. 386-Präfixe) |
| `web/translate.js` | übersetzt Funktionen nach JavaScript, mit `map.json` |
| `web/cpu.js`, `dos.js`, `dpmi.js` | emulierter PC: Selektoren, DOS INT 21h, DPMI INT 31h, KERNEL/RTM-Stubs |
| `web/vga.js`, `sb.js` | VGA, Sound Blaster (TFMX-Musik, Samples) |
| `web/hires-view.js` | HD-Renderer (WebGL) |
| `tools/serve.py` | lokaler Server mit den nötigen Headern |

## Lokal starten

Noch nicht möglich. Bis dahin: `python3 tools/neinfo.py game/START.EXE`.

## Danksagung

Die Dateiformat-Analyse von [movAX13h](https://github.com/movAX13h/tony-and-friends-in-kelloggs-land) ist die wichtigste Vorarbeit. Sein Code ist nicht in diesem Repo (keine Lizenz). Das Spiel stammt von Factor 5 und Rauser Advertainment, die Figuren gehören Kellogg's. Dieses Projekt ist mit keinem davon verbunden.

## Lizenz

MIT für den eigenen Code dieses Projekts, siehe [LICENSE](LICENSE).
