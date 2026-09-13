(function (root) {
  "use strict";
  const ENCODING = "ohlcv-provenance-v1";
  const META = ["source", "sourceTier", "fetchedAt", "fallbackUsed", "confidence", "sourceConflict"];
  function encode(rows) {
    const provenance = [], indices = new Map();
    const data = (Array.isArray(rows) ? rows : []).map((row) => {
      const meta = Object.fromEntries(META.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));
      const key = JSON.stringify(meta);
      if (!indices.has(key)) { indices.set(key, provenance.length); provenance.push(meta); }
      return [row.date, row.open, row.high, row.low, row.close, row.volume, row.turnover ?? null, indices.get(key), row.asOf || row.date];
    });
    return { encoding: ENCODING, provenance, rows: data };
  }
  function decode(value) {
    if (Array.isArray(value)) return value; // v19 snapshots remain readable.
    if (value?.encoding !== ENCODING || !Array.isArray(value.rows) || !Array.isArray(value.provenance)) return [];
    if (value.rows.length > 2000 || value.provenance.length > 2000) return [];
    return value.rows.filter((row) => Array.isArray(row) && /^\d{4}-\d{2}-\d{2}$/.test(row[0])
      && typeof row[4] === "number" && Number.isFinite(row[4])
      && Number.isInteger(row[7]) && row[7] >= 0 && row[7] < value.provenance.length).map((row) => ({
      ...Object.fromEntries(META.filter((key) => value.provenance[row[7]]?.[key] !== undefined).map((key) => [key, value.provenance[row[7]][key]])),
      date: row[0], open: row[1], high: row[2], low: row[3], close: row[4], volume: row[5], turnover: row[6], asOf: row[8] || row[0]
    }));
  }
  const api = Object.freeze({ encoding: ENCODING, encode, decode });
  root.TwStockKlineSnapshotCodec = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
