import { describe, expect, it } from 'vitest';
import { addDays, averageEnergy, checkinOn, checkinStreak, dayKey, energySeries, parseEnergy, type Checkin } from '../logic';

const today = new Date(2026, 9, 24);
const at = (n: number) => dayKey(addDays(today, n));
const c = (n: number, energy: number): Checkin => ({ day: at(n), energy, at: 0 });

describe('the check-ins', () => {
  it('finds the check-in of a day', () => {
    expect(checkinOn([c(0, 6), c(0, 8)], today)?.energy).toBe(8);
    expect(checkinOn([c(-1, 6)], today)).toBeNull();
  });

  it('averages the last seven days, rounded to one decimal', () => {
    expect(averageEnergy([c(0, 6), c(-1, 7), c(-8, 1)], today)).toBe(6.5);
    expect(averageEnergy([], today)).toBeNull();
  });

  it('counts the streak from today, or from yesterday until today is done', () => {
    expect(checkinStreak([c(0, 5), c(-1, 5), c(-2, 5)], today)).toBe(3);
    expect(checkinStreak([c(-1, 5), c(-2, 5)], today)).toBe(2);
    expect(checkinStreak([c(-2, 5)], today)).toBe(0);
  });

  it('gives one value per day for the chart, oldest first', () => {
    const series = energySeries([c(0, 9)], today);
    expect(series).toHaveLength(7);
    expect(series[6].energy).toBe(9);
    expect(series[0].energy).toBe(0);
  });
});

describe('typed energy', () => {
  it('accepts 1 to 10 and refuses the rest', () => {
    expect(parseEnergy('7')).toBe(7);
    expect(parseEnergy(' 10 ')).toBe(10);
    expect(parseEnergy('0')).toBeNull();
    expect(parseEnergy('11')).toBeNull();
    expect(parseEnergy('tired')).toBeNull();
  });
});
