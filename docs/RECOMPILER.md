# Recompiler: Plan

Stand: 18.10.2026. Ziel: den Spielcode aus `START.EXE` zur Laufzeit nach JavaScript übersetzen, damit er schneller läuft als im Interpreter (`web/cpu.js`).

## Anforderungen aus dem Spiel

| Punkt | Folge für den Recompiler |
|---|---|
| 386-Befehle (Präfixe `0x66`/`0x67`, über 1500× in seg3), 32-Bit-Adressierung, FS/GS | Dekoder muss 386 können; wir verwenden den vorhandenen Dekoder des Interpreters |
| Protected Mode mit Selektoren (LDT) | Speicherzugriffe über die Basis je Segmentregister (`cpu.sbase`), nicht `seg·16` |
| Borland Pascal und Interrupt-Handler legen echte `CS:IP` auf den Stack | übersetzter Code nutzt denselben Stack wie der Interpreter, keine Ersatz-Markierungen |
| kompilierte .BOB-Sprites laufen zur Laufzeit aus Datensegmenten | Interpreter und übersetzter Code müssen sich an jeder Blockgrenze abwechseln können |
| Zeichenroutinen schreiben ständig VGA-Register, Timer-Handler den PIT, der Mischer liest den DMA | Port-Befehle beenden einen Block und laufen über die bestehende Emulation |
| Raster-Timing (Kanal 0 wird bei jedem IRQ neu programmiert) | Interrupts müssen zwischen Blöcken zeitnah ankommen |
| keine fertige Disassembly | Funktionsliste aus Ghidra (`docs/map.json`, 398 Funktionen) plus zur Laufzeit entdeckte Sprungziele |

## Ansatz: blockweise Übersetzung zur Laufzeit

1. Beim ersten Erreichen einer Adresse `CS:IP` wird der **Basisblock** (bis zum nächsten Sprung, Aufruf, Rücksprung, Interrupt oder Port-Befehl) dekodiert und als JavaScript erzeugt (`new Function`). Das Ergebnis wird je Selektor:Offset gecacht.
2. Der Block arbeitet auf **denselben Registern und demselben Speicher** wie der Interpreter (`cpu.r`, `cpu.sbase`, `mem`). Damit können beide an jeder Blockgrenze wechseln.
3. **Flags lazy**: Nur die Flags werden berechnet, die ein späterer Befehl im Block oder der Blockausgang braucht. Das ist der größte Gewinn gegenüber dem Interpreter.
4. **Speicherzugriffe**: schneller Pfad für normales RAM, VGA (A0000–BFFFF) über den bestehenden Weg.
5. **Blockgrenzen sind Interrupt-Punkte**: Zwischen zwei Blöcken prüft die Hauptschleife Timer, Tastatur und Sound Blaster, wie heute nach jeder Zeitscheibe. Das hält das Raster-Timing genau genug.
6. **Ausbaustufe**: Blöcke einer Funktion zu einer JS-Funktion mit `switch (pc)` zusammenfassen und Rückwärtssprünge mit einem Zähler versehen, an dem die Laufzeit Timer und Eingaben abarbeitet.
7. **Sicherheitsnetz**: Ein Testmodus lässt Interpreter und übersetzten Code dieselben Bilder rechnen und vergleicht Register und Bildspeicher.

Übersetzt wird immer im Browser aus der Kopie des Spielers. Im Repo liegen nur Adressen und Namen (`docs/map.json`), nie Code des Spiels.

Erwartung: 3–8× schneller als der Interpreter.
