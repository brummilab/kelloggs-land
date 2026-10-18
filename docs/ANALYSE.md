# Analyse und Fahrplan

Stand: 18.10.2026

## START.EXE im Detail

```
Einsprung  CS:IP = seg1:13a1
Stack      SS:SP = seg7:7530
  seg1  CODE  0x3e99 Bytes  497 Relocations
  seg2  CODE  0x430d Bytes  381 Relocations
  seg3  CODE  0xb6b6 Bytes  668 Relocations   (größtes Segment, vermutlich Spiellogik)
  seg4  CODE  0x3501 Bytes  251 Relocations
  seg5  CODE  0x1ba5 Bytes   21 Relocations   (kaum Abhängigkeiten, vermutlich Grafik-/Sound-Routinen)
  seg6  DATA  0x7048 Bytes  initialisiert (DGROUP)
  seg7  DATA  64 KB, nicht initialisiert (Stack)
```

Importe (nur diese müssen nachgebaut werden):

| Funktion | Zweck im Recomp |
|---|---|
| `InitTask` | Startregister setzen, Rückgabe OK |
| `GlobalAlloc/Lock/Unlock/Free` | Speicherblöcke mit Selektor |
| `GlobalDOSAlloc/Free` | Speicher unter 1 MB (für Sound-Blaster-DMA) |
| `AllocDStoCSAlias` | Code-Alias auf Datensegment (wahrscheinlich selbst erzeugter Zeichencode, siehe .BOB) |
| `__AHINCR` | Selektor-Abstand für große Blöcke (8) |
| `__A000H`, `__B000H`, `__B800H`, `__0040H` | feste Selektoren für VGA-RAM, Text-RAM, BIOS-Daten |
| `RTM.ord5/6/21` | noch zu klären (Borland RTM-API) |

## Besonderheiten gegenüber Stunts HD

1. **Protected Mode statt Real Mode.** Adressen sind Selektor:Offset. Wir brauchen eine kleine Deskriptortabelle statt `seg*16+off`. Das ist eher einfacher, weil jeder Speicherblock seinen eigenen Selektor hat.
2. **Keine fertige Disassembly.** Stunts HD baut auf Restunts auf. Hier gibt es nur `START.idb` von movAX13h (IDA, nicht frei lesbar). Wir erzeugen die Funktionsliste (`map.json`) selbst, per rekursivem Abstieg ab dem Einsprung und allen Relocation-Zielen.
3. **Selbst erzeugter Code.** Die .BOB-Sprites enthalten x86-Zeichencode, und `AllocDStoCSAlias` deutet darauf hin, dass das Spiel diesen Code ausführt. Diese Stellen können nicht vorab übersetzt werden. Lösung: Interpreter-Fallback (wie ein Mini-Emulator) für Code, der zur Laufzeit aus Daten kommt.
4. **Sound.** TFMX-Musik und Samples über Sound Blaster (KELLOGG.INI: Port 220h, IRQ 7, DMA 1). Wir emulieren SB-DSP + DMA und mischen im AudioWorklet.

## Fahrplan

| Phase | Ziel | Ergebnis |
|---|---|---|
| 0 | Analyse | `neinfo.py`, dieses Dokument ✅ |
| 1 | NE-Loader + Interpreter | START.EXE läuft im Interpreter (Node) ✅ |
| 2 | DOS/DPMI/KERNEL-Stubs | Spiel lädt PCKELL.DAT, Titelbild und Menü als PNG ✅ |
| 3 | Browser-Shell | VGA-Ausgabe im Canvas, Tastatur, Spiel läuft (noch interpretiert) |
| 4 | Recompiler | Funktionen nach JS übersetzen, Interpreter nur noch als Fallback |
| 5 | Sound | SB-DSP, DMA, AudioWorklet |
| 6 | HD | Tilemap/Sprites abgreifen, WebGL-Neuzeichnen, Breitbild, Interpolation |

Der Interpreter aus Phase 1 bleibt dauerhaft drin: als Referenz für Tests (Recomp und Interpreter müssen dieselben Frames liefern) und für den selbst erzeugten Zeichencode.

## Erkenntnisse aus Phase 1/2

- **Compiler:** Borland Pascal 7, DPMI-Ziel. seg5 ist die System-Unit (Laufzeitbibliothek), seg1 das Hauptprogramm. Die Units werden am Einsprung per Far-Call initialisiert.
- **386-Code:** seg3 enthält über 1500 `0x66`-Präfixe (handgeschriebener 32-Bit-Assembler in 16-Bit-Segmenten).
- **RTM-Ordinals** (aus den Aufrufmustern abgeleitet): `ord5` = MemAllocateBlock(Size, Attr, EventProc, var Selector), `ord6` = MemFreeBlock(Selector), `ord21` = MemQueryFreeMem → DX:AX. Die Heap-Verwaltung von BP7 fordert darüber Blöcke an.
- **Code-Alias:** BP7 erwartet, dass hinter jedem Code-Selektor ein beschreibbarer Daten-Alias liegt (`CS + __AHINCR`). RTM macht das so, unser Loader jetzt auch. Ohne das überschreibt die System-Unit das Datensegment.
- **Interrupts:** Das Programm hängt sich selbst in INT 21h (System-Unit), INT 9 (Tastatur) und INT 8 (Timer) ein.
- **Timer:** Der INT-8-Handler (seg3:aa19) programmiert Kanal 0 bei jedem Aufruf neu und liest Kanal 2 als freilaufende Uhr. Das ist ein Raster-Zeitplan (Ereignisse zu bestimmten Zeitpunkten im Frame). Der Emulator läuft deshalb bis zum jeweils nächsten Timer-Ereignis, statt feste Zeitscheiben zu verwenden.
- **Grafik:** Intro in Mode 12h (640×480, 16 Farben, mit Hardware-Scrolling: Offset 0x36, Startadresse wandert), Logos und Menü in Mode 13h, Titelbild in Mode X **360×480** (Misc 0xC7/0xE7, CRTC 1 = 0x59, Offset 0x2D).
- **Tastatur:** Das Menü fragt den Tastenzustand pro Frame ab. Ein Druck muss rund 150 ms gehalten werden.
- **Dateien:** PCKELL.DAT (≈ 13 000 Lesezugriffe beim Start), KELLOGG.INI, HISCORE.DAT (fehlt beim ersten Start, das ist normal).

## Offene Fragen

- Wie spielt das Spiel Musik und Effekte? (Sound-Blaster-DSP-Befehle mitschneiden, Phase 5)
- Wird im Level Code aus den .BOB-Dateien ausgeführt (`AllocDStoCSAlias`)?
- Welcher Grafikmodus im Level selbst?
