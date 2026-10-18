// Minimaler ZIP-Leser für den Browser (stored + deflate über DecompressionStream).

export async function readZip(buf) {
  const d = new Uint8Array(buf);
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let eocd = -1;
  for (let i = d.length - 22; i >= Math.max(0, d.length - 0x10000 - 22); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('keine gültige ZIP-Datei');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = {};
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder('latin1').decode(d.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const lstart = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = d.subarray(lstart, lstart + csize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out[name] = data;
  }
  return out;
}
