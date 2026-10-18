# Recompiler: was wir von Stunts HD übernehmen können

Stand: 18.10.2026. Grundlage: [mr-finster/stunts-hd](https://github.com/mr-finster/stunts-hd) (MIT, © 2026 mr-finster), Commit `4f17af1`. mr-finster hat in [Issue #19](https://github.com/mr-finster/stunts-hd/issues/19) ausdrücklich erlaubt, `translate.js` und weiteren Code mit Nennung von Stunts HD zu verwenden.

## So arbeitet der Übersetzer von Stunts HD

| Datei | Aufgabe |
|---|---|
| `stunts/x86dec.js` (145 Zeilen) | dekodiert einen 8086/286-Befehl aus GAME.EXE in TASM-Text |
| `stunts/translate.js` (475 Zeilen) | setzt jede Prozedur aus der `map.json` zusammen und übersetzt den Assembler-Text Zeile für Zeile in JavaScript |
| `stunts/cpu.js` (150 Zeilen) | Laufzeit für den übersetzten Code: Register, Flags-Helfer (`add16`, `sub8` …), Real-Mode-Speicher (`seg·16 + off`), Stack |
| `stunts/tools/mkmap.py` | baut `map.json` aus der **Restunts-Disassembly**: Prozeduren, Sprungmarken, Namen, Strukturen, Sprungtabellen, nur Adressen, keine Bytes des Spiels |
| `stunts/drv86.js` | kleiner Interpreter nur für den Soundtreiber, der zur Laufzeit geladen wird |

Kernideen:

1. **Eine Prozedur wird eine JS-Funktion** mit `for (;;) switch (pc)`: Jede Sprungmarke ist ein `case`, Sprünge setzen `pc` und `continue`.
2. **Aufrufe sind echte JS-Aufrufe** (`m.call(r, P, name)`), auf dem Stack liegen nur Markierungen statt echter Rücksprungadressen.
3. **Rückwärtssprünge zählen ein Budget** (`if (--m.budget < 0) m.poll(...)`): Dort bekommt die Laufzeit Gelegenheit für Timer und Eingaben.
4. **Übersetzt wird im Browser aus der Kopie des Spielers**: Im Repo liegen nur Namen und Adressen (`map.json`), nie Code des Spiels.
5. **Ports und Interrupts** kommen in der übersetzten Spiellogik von Stunts nicht vor (`m.io` ist leer); Grafik und Ton laufen über eigene Wege.

## Was davon auf Kellogg's Land passt

| Idee | Übertragbar? | Anmerkung |
|---|---|---|
| Prozedur → Funktion mit `switch (pc)` | ja | gutes Grundmuster |
| Flags-Helfer | ja | erweitern um 32 Bit |
| Budget/Poll an Rückwärtssprüngen | ja, angepasst | bei uns kommen dort auch Timer-IRQ (Raster-Timing!), Tastatur und Sound-Blaster-IRQ dran |
| Übersetzung im Browser aus der eigenen EXE, Repo enthält nur Adressen | ja | haben wir schon so (`docs/map.json` aus Ghidra) |
| Dekoder `x86dec.js` | nein | nur 8086/286; Kellogg's Land braucht 386-Präfixe (`0x66`/`0x67`, über 1500× in seg3), 32-Bit-Adressierung, FS/GS |
| Real-Mode-Speicher `seg·16` | nein | bei uns Protected Mode mit Selektoren (LDT), Basis pro Segmentregister |
| Stack mit Markierungen statt Rücksprungadressen | nein | Borland Pascal und unsere Interrupt-Handler arbeiten mit echten `CS:IP` auf dem Stack; außerdem muss übersetzter Code nahtlos mit dem Interpreter mischen (kompilierte .BOB-Sprites laufen zur Laufzeit aus Datensegmenten) |
| `m.io` leer | nein | unsere Zeichenroutinen schreiben ständig VGA-Register, der Timer-Handler den PIT, der Mischer liest den DMA |
| `map.json` aus Restunts | nein | gibt es für Kellogg's Land nicht; Ersatz: Ghidra-Export (`docs/map.json`, 398 Funktionen) plus zur Laufzeit entdeckte Sprungziele |

## Vorschlag für unseren Recompiler

**Blockweise Übersetzung zur Laufzeit** (wie ein einfacher JIT), mit den Mustern aus Stunts HD:

1. Beim ersten Erreichen einer Adresse `CS:IP` dekodiert unser vorhandener Interpreter-Dekoder den **Basisblock** (bis zum nächsten Sprung/Aufruf/Rücksprung/Interrupt/Port-Befehl) und erzeugt dafür JavaScript (`new Function`). Ergebnis wird je Selektor:Offset gecacht.
2. Der Block arbeitet auf **denselben Registern und demselben Speicher** wie der Interpreter (`cpu.r`, `cpu.sbase`, `mem`). Damit können Interpreter und übersetzter Code an jeder Blockgrenze wechseln.
3. **Flags lazy**: nur die Flags berechnen, die ein späterer Befehl im Block oder der Blockausgang braucht (größter Gewinn gegenüber dem Interpreter).
4. **Speicherzugriffe**: schneller Pfad für normale RAM-Adressen, VGA (A0000–BFFFF) über den bestehenden Weg.
5. **Blockgrenzen = Interrupt-Punkte**: Zwischen zwei Blöcken prüft die Hauptschleife Timer, Tastatur, Sound Blaster, wie heute nach jeder Zeitscheibe. Das hält das Raster-Timing genau genug.
6. **Später** (Ausbaustufe): Blöcke einer Ghidra-Funktion zu einer Funktion mit `switch (pc)` zusammenfassen (Muster aus `translate.js`), Ketten von Blöcken ohne Rückkehr in die Hauptschleife.
7. **Sicherheitsnetz**: Ein Testmodus lässt Interpreter und übersetzten Code dieselben Bilder rechnen und vergleicht Register und Bildspeicher (wie der `gaps`/`qa`-Test in Stunts HD).

Erwartung: 3–8× schneller als der Interpreter, ohne dass etwas vom Spiel im Repo landet.

## Nennung

Bei Übernahme von Code oder Mustern aus Stunts HD: Hinweis im Dateikopf und in der README („based on Stunts HD by mr-finster, MIT“).
