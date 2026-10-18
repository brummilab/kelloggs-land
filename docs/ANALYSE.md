# Analyse und Fahrplan

Stand: 17.10.2026

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
| 1 | NE-Loader + Interpreter | START.EXE läuft im Interpreter (Node), Log aller INT/IN/OUT |
| 2 | DOS/DPMI/KERNEL-Stubs | Spiel lädt PCKELL.DAT, Titelbild im Framebuffer (PNG-Dump) |
| 3 | Browser-Shell | VGA-Ausgabe im Canvas, Tastatur, Spiel läuft (noch interpretiert) |
| 4 | Recompiler | Funktionen nach JS übersetzen, Interpreter nur noch als Fallback |
| 5 | Sound | SB-DSP, DMA, AudioWorklet |
| 6 | HD | Tilemap/Sprites abgreifen, WebGL-Neuzeichnen, Breitbild, Interpolation |

Der Interpreter aus Phase 1 bleibt dauerhaft drin: als Referenz für Tests (Recomp und Interpreter müssen dieselben Frames liefern) und für den selbst erzeugten Zeichencode.

## Offene Fragen

- Was machen `RTM.ord5`, `ord6`, `ord21`?
- Welcher Grafikmodus: Mode 13h oder Mode X (unchained)? Die EGA-Pixelreihenfolge der .ICO-Tiles spricht für Mode X.
- Nutzt der Code 386-Befehle (32-Bit-Register in 16-Bit-Code)?
