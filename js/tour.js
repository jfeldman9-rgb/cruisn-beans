// WORLD TOUR: every stage back to back with arcade points per finishing
// place. Pure state helpers so the scoring is testable without a browser.

export const TOUR_POINTS = [10, 8, 6, 5, 4, 3, 2];

export function createTour(stageIds) {
  return {
    stageIds: [...stageIds],
    index: 0,
    standings: {},   // racerId -> { racer, points, wins, bestPlace, playerTime }
    legs: [],        // per-stage summaries for the finale
    playerTime: 0,
    over: false,
  };
}

export function currentStageId(tour) {
  return tour.stageIds[tour.index];
}

export function isFinalStage(tour) {
  return tour.index >= tour.stageIds.length - 1;
}

export function pointsForPlace(place) {
  return TOUR_POINTS[place - 1] || 1;
}

// results: finish-event rows ordered by place ([{ racer, isPlayer, finished, time }]).
export function recordLeg(tour, results, playerRaceTime) {
  const leg = { stageId: currentStageId(tour), rows: [] };
  results.forEach((row, i) => {
    const place = i + 1;
    const pts = pointsForPlace(place);
    const id = row.racer.id;
    const entry = tour.standings[id] || {
      racer: row.racer, points: 0, wins: 0, bestPlace: 99, isPlayer: !!row.isPlayer,
    };
    entry.points += pts;
    if (place === 1) entry.wins++;
    entry.bestPlace = Math.min(entry.bestPlace, place);
    tour.standings[id] = entry;
    leg.rows.push({ racer: row.racer, place, points: pts, isPlayer: !!row.isPlayer });
  });
  tour.playerTime += playerRaceTime || 0;
  tour.legs.push(leg);
  return leg;
}

export function standings(tour) {
  return Object.values(tour.standings).sort((a, b) => b.points - a.points
    || b.wins - a.wins || a.bestPlace - b.bestPlace);
}

export function playerStanding(tour) {
  const rows = standings(tour);
  const idx = rows.findIndex((r) => r.isPlayer);
  return idx < 0 ? null : { place: idx + 1, ...rows[idx], total: rows.length };
}

// Advance to the next stage; returns false when the tour is complete.
export function advance(tour) {
  if (isFinalStage(tour)) {
    tour.over = true;
    return false;
  }
  tour.index++;
  return true;
}
