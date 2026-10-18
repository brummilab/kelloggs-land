// Ghidra-Skript (headless): Funktionsliste und Pseudocode für START.EXE exportieren.
//
//   analyzeHeadless <projektordner> kellogg -process START.EXE -noanalysis \
//     -scriptPath tools/ghidra -postScript ExportKellogg.java <ausgabeordner> [seg:off ...]
//
// Ohne Adressen: functions.json (alle Funktionen mit NE-Segment und Offset) und memory.json.
// Mit Adressen (z. B. 3:1a10 = seg3, Offset 1a10): decompile_<seg>_<off>.c für jede Funktion.
// @category Kellogg

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Reference;

import java.io.File;
import java.io.FileWriter;
import java.util.ArrayList;
import java.util.List;

public class ExportKellogg extends GhidraScript {

    // NE-Segment n liegt in Ghidra in einem Block namens "Code<n>"/"Data<n>" oder mit Segmentbasis.
    private MemoryBlock blockForSeg(int seg) {
        MemoryBlock[] blocks = currentProgram.getMemory().getBlocks();
        List<MemoryBlock> real = new ArrayList<>();
        for (MemoryBlock b : blocks) if (!b.getName().startsWith("HEADER") && !b.isExternalBlock()) real.add(b);
        for (MemoryBlock b : real) {
            String n = b.getName().replaceAll("[^0-9]", "");
            if (!n.isEmpty() && Integer.parseInt(n) == seg) return b;
        }
        return seg - 1 < real.size() ? real.get(seg - 1) : null;
    }

    private String esc(String s) { return s.replace("\\", "\\\\").replace("\"", "\\\""); }

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        File out = new File(args.length > 0 ? args[0] : "ghidra-out");
        out.mkdirs();

        // Speicherblöcke
        try (FileWriter w = new FileWriter(new File(out, "memory.json"))) {
            w.write("[\n");
            boolean first = true;
            for (MemoryBlock b : currentProgram.getMemory().getBlocks()) {
                if (!first) w.write(",\n");
                first = false;
                w.write(String.format("  {\"name\": \"%s\", \"start\": \"%s\", \"end\": \"%s\", \"size\": %d, \"exec\": %b}",
                    esc(b.getName()), b.getStart(), b.getEnd(), b.getSize(), b.isExecute()));
            }
            w.write("\n]\n");
        }

        if (args.length <= 1) {
            try (FileWriter w = new FileWriter(new File(out, "functions.json"))) {
                w.write("[\n");
                boolean first = true;
                FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
                while (it.hasNext()) {
                    Function f = it.next();
                    MemoryBlock b = currentProgram.getMemory().getBlock(f.getEntryPoint());
                    int callers = 0;
                    for (Reference r : getReferencesTo(f.getEntryPoint())) if (r.getReferenceType().isCall()) callers++;
                    if (!first) w.write(",\n");
                    first = false;
                    w.write(String.format("  {\"name\": \"%s\", \"addr\": \"%s\", \"block\": \"%s\", \"off\": \"%x\", \"size\": %d, \"callers\": %d}",
                        esc(f.getName()), f.getEntryPoint(), b == null ? "" : esc(b.getName()),
                        b == null ? 0 : f.getEntryPoint().subtract(b.getStart()), f.getBody().getNumAddresses(), callers));
                }
                w.write("\n]\n");
            }
            println("functions.json geschrieben");
            return;
        }

        DecompInterface dec = new DecompInterface();
        dec.openProgram(currentProgram);
        for (int i = 1; i < args.length; i++) {
            String[] p = args[i].split(":");
            int seg = Integer.parseInt(p[0]);
            long off = Long.parseLong(p[1], 16);
            MemoryBlock b = blockForSeg(seg);
            if (b == null) { println("kein Block für Segment " + seg); continue; }
            Address a = b.getStart().add(off);
            Function f = getFunctionContaining(a);
            if (f == null) { createFunction(a, null); f = getFunctionAt(a); }
            if (f == null) { println("keine Funktion bei " + a); continue; }
            DecompileResults r = dec.decompileFunction(f, 120, monitor);
            String code = r.decompileCompleted() ? r.getDecompiledFunction().getC() : ("// Fehler: " + r.getErrorMessage());
            StringBuilder callers = new StringBuilder();
            for (Reference ref : getReferencesTo(f.getEntryPoint())) {
                Function cf = getFunctionContaining(ref.getFromAddress());
                callers.append("//   ").append(ref.getFromAddress()).append(" in ").append(cf == null ? "?" : cf.getName()).append("\n");
            }
            try (FileWriter w = new FileWriter(new File(out, String.format("decompile_%d_%s.c", seg, p[1])))) {
                w.write("// " + f.getName() + " @ " + f.getEntryPoint() + " (NE seg" + seg + ":" + p[1] + ")\n// Aufrufer:\n" + callers + "\n" + code);
            }
            println("dekompiliert: " + args[i] + " -> " + f.getName());
        }
        dec.dispose();
    }
}
