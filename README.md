# Kellogg's Land HD

Static Recompilation von **Tony & Friends in Kellogg's Land** (Factor 5 / Rauser Advertainment, DOS 1994) für den Browser, nach dem Vorbild von [Stunts HD](https://github.com/mr-finster/stunts-hd).

Die originale `START.EXE` wird Befehl für Befehl nach JavaScript übersetzt und auf einem kleinen emulierten PC ausgeführt. Ein WebGL-Renderer zeichnet das Bild danach neu, in HD, Breitbild und ohne Ruckeln. Weil der echte Spielcode läuft, verhalten sich Steuerung, Gegner und Level genau wie im Original.

> **Status:** Phase 1 erledigt. START.EXE läuft im Interpreter (Node): Factor-5-Logo, Kellogg's-Intro, Titelbild (360×480) und Hauptmenü erscheinen, Tastatureingaben funktionieren. Noch kein Browser, kein Ton, noch nicht im Level getestet.

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
| Compiler | Borland Pascal 7 (DPMI-Ziel), viel 386-Assembler |
| Grafik | Mode 13h, Mode 12h und getrickstes Mode X 360×480 (Titelbild) |
| Timer | Raster-Timing: Kanal 0 wird bei jedem IRQ neu programmiert, Kanal 2 misst die Zeit |

Die Importe beschränken sich auf Speicher (`GlobalAlloc`, `GlobalDOSAlloc` …), feste Selektoren für Video-RAM und BIOS-Daten (`__A000H`, `__B800H`, `__0040H`) und einen Code-Alias. Das ist eine kleine Fläche, die wir nachbauen müssen. Details stehen in [docs/ANALYSE.md](docs/ANALYSE.md).

## Aufbau

| Datei | Aufgabe | Stand |
|---|---|---|
| `tools/neinfo.py` | NE-Header, Segmente, Importe auslesen | ✅ |
| `web/ne.js` | NE-Loader: Segmente, Relocation-Ketten, Entry-Tabelle | ✅ |
| `web/cpu.js` | x86-Interpreter: 16-Bit Protected Mode, 386-Befehle (0x66/0x67) | ✅ |
| `web/machine.js` | emulierter PC: Selektoren/LDT, KERNEL- und RTM-Funktionen, DOS INT 21h, DPMI INT 31h, BIOS, PIC, Tastatur, Sound-Blaster-Stub | ✅ |
| `web/pit.js` | Timer-Chip (Kanal 0 und 2, Latch, Gate über Port 61h) | ✅ |
| `web/vga.js` | VGA mit 4 Planes, Schreibmodi 0–3, Mode 13h / 12h / Mode X, DAC | ✅ |
| `tools/run.mjs` | startet das Spiel ohne Browser, simuliert Tasten, speichert PNGs | ✅ |
| `web/translate.js` | übersetzt Funktionen nach JavaScript (Recompiler) | Phase 4 |
| `web/index.html` | Browser-Version mit Canvas und Tastatur | Phase 3 |
| Sound | Sound-Blaster-DSP, DMA, AudioWorklet | Phase 5 |
| `web/hires-view.js` | HD-Renderer (WebGL) | Phase 6 |

## Lokal starten

Voraussetzung: Node.js 18+ und die Spieldateien in `game/`.

```
node tools/run.mjs game --seconds 40 --shots 12,20,40 --out out
```

| Option | Bedeutung |
|---|---|
| `--seconds N` | so viele Sekunden virtuelle Zeit laufen lassen |
| `--shots t1,t2` | zu diesen Zeitpunkten ein PNG speichern (4:3 skaliert, `--raw` für Originalgröße) |
| `--keys t:taste` | Taste zum Zeitpunkt t drücken (`enter`, `space`, `esc`, `up`, `down`, `left`, `right`, `ctrl`, `alt` oder Scancode hex) |
| `--verbose` | Speicheranforderungen protokollieren |

Ablauf im Original: Factor-5-Logo (ca. 6 s), Kellogg's-Intro (12–20 s), Titelbild (ab ca. 24 s), Hinweistext, Hauptmenü (ab ca. 65 s). Der Interpreter schafft etwa 20 Mio. Befehle pro Sekunde, also mehr als Echtzeit (virtuell 15 Mio./s).

## Danksagung

Die Dateiformat-Analyse von [movAX13h](https://github.com/movAX13h/tony-and-friends-in-kelloggs-land) ist die wichtigste Vorarbeit. Sein Code ist nicht in diesem Repo (keine Lizenz). Das Spiel stammt von Factor 5 und Rauser Advertainment, die Figuren gehören Kellogg's. Dieses Projekt ist mit keinem davon verbunden.

## Lizenz

MIT für den eigenen Code dieses Projekts, siehe [LICENSE](LICENSE).
