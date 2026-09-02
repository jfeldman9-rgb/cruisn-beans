// Cabinet-style local records: top times per stage and the best World Tour,
// each tagged with three arcade initials. Storage is injected so the module
// runs unchanged in node tests and degrades to memory when localStorage is
// blocked (private mode, sandboxed iframes).

export const RECORDS_KEY = 'cruisn-beans.records.v1';
export const TOP_N = 3;

export function sanitizeInitials(raw, fallback = 'AAA') {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return (clean + fallback).slice(0, 3);
}

export function defaultInitials(racerName) {
  return sanitizeInitials(String(racerName || '').replace(/[^A-Z0-9]/gi, ''), 'AAA');
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

export class Records {
  constructor(storage) {
    this.storage = storage || memoryStorage();
    this.data = { stages: {}, tour: null };
    this.load();
  }

  load() {
    try {
      const raw = this.storage.getItem(RECORDS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.data.stages = parsed.stages && typeof parsed.stages === 'object' ? parsed.stages : {};
        this.data.tour = parsed.tour || null;
      }
    } catch (error) {
      this.data = { stages: {}, tour: null };
    }
  }

  save() {
    try {
      this.storage.setItem(RECORDS_KEY, JSON.stringify(this.data));
      return true;
    } catch (error) {
      return false;
    }
  }

  list(stageId) {
    const rows = this.data.stages[stageId];
    return Array.isArray(rows) ? rows.slice(0, TOP_N) : [];
  }

  best(stageId) {
    return this.list(stageId)[0] || null;
  }

  // 1-based rank a time would earn on this stage's board, or 0 if it misses.
  rankFor(stageId, time) {
    if (!(time > 0)) return 0;
    const rows = this.list(stageId);
    let rank = 1;
    for (const row of rows) {
      if (time < row.time) break;
      rank++;
    }
    return rank <= TOP_N ? rank : 0;
  }

  qualifies(stageId, time) {
    return this.rankFor(stageId, time) > 0;
  }

  submit(stageId, entry) {
    const rank = this.rankFor(stageId, entry.time);
    if (!rank) return 0;
    const row = {
      time: Number(entry.time),
      initials: sanitizeInitials(entry.initials),
      racerId: entry.racerId || null,
      at: entry.at || Date.now(),
    };
    const rows = this.list(stageId);
    rows.splice(rank - 1, 0, row);
    this.data.stages[stageId] = rows.slice(0, TOP_N);
    this.save();
    return rank;
  }

  // World Tour: more points wins; total time breaks ties.
  tourBest() {
    return this.data.tour || null;
  }

  tourQualifies(points, time) {
    const best = this.tourBest();
    if (!best) return points > 0;
    if (points !== best.points) return points > best.points;
    return time < best.time;
  }

  submitTour(entry) {
    if (!this.tourQualifies(entry.points, entry.time)) return false;
    this.data.tour = {
      points: Number(entry.points),
      time: Number(entry.time),
      initials: sanitizeInitials(entry.initials),
      racerId: entry.racerId || null,
      at: entry.at || Date.now(),
    };
    this.save();
    return true;
  }
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
