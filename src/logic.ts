// Pure rules for Nomie Pulse, as plain functions, so they can be tested without the app.
export type Checkin = { day: string; energy: number; at: number; score?: number };

export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const addDays = (date: Date, n: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

// The check-in made on a day, if there is one (the last one, when there are several)
export const checkinOn = (checkins: Checkin[], day: Date): Checkin | null =>
  checkins.filter((c) => c.day === dayKey(day)).pop() ?? null;

// The average energy over the last `days` days, or null when there is nothing to average
export const averageEnergy = (checkins: Checkin[], today: Date, days = 7): number | null => {
  const from = dayKey(addDays(today, -(days - 1)));
  const to = dayKey(today);
  const recent = checkins.filter((c) => c.day >= from && c.day <= to);
  if (!recent.length) return null;
  return Math.round((recent.reduce((sum, c) => sum + c.energy, 0) / recent.length) * 10) / 10;
};

// Days in a row with a check-in, counted back from today. A missing check-in today does not break it yet.
export const checkinStreak = (checkins: Checkin[], today: Date): number => {
  const days = new Set(checkins.map((c) => c.day));
  let count = 0;
  let day = days.has(dayKey(today)) ? today : addDays(today, -1);
  while (days.has(dayKey(day))) {
    count++;
    day = addDays(day, -1);
  }
  return count;
};

// One value per day for the last `days` days, oldest first, for the small chart
export const energySeries = (checkins: Checkin[], today: Date, days = 7) =>
  Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    const found = checkins.filter((c) => c.day === dayKey(date)).pop();
    return { date, energy: found ? found.energy : 0 };
  });

// A typed energy value on the 1 to 10 scale, or null when it is not one
export const parseEnergy = (text: string): number | null => {
  const n = Math.round(Number(String(text).trim()));
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
};
