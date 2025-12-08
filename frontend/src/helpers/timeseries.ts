// Generic helpers for time-series transformations and stats
import { SeriesStats, TimePoint } from "../types";

export function computeStats(points: TimePoint[]): SeriesStats | null {
    if (!points.length) return null;

    let min = points[0].value;
    let max = points[0].value;
    let sum = 0;

    for (const p of points) {
        const v = p.value;
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
    }

    return {
        min,
        max,
        avg: sum / points.length,
    };
}

/**
 * Downsample series to a reasonable number of points for drawing.
 * Keeps overall shape while avoiding 5s points on 12h range.
 */
export function downsampleSeries(points: TimePoint[], maxPoints = 240): TimePoint[] {
    if (points.length <= maxPoints) return points;

    const bucketSize = Math.ceil(points.length / maxPoints);
    const result: TimePoint[] = [];

    for (let i = 0; i < points.length; i += bucketSize) {
        const slice = points.slice(i, i + bucketSize);
        if (!slice.length) continue;

        let sumTs = 0;
        let sumVal = 0;
        for (const p of slice) {
            sumTs += p.ts;
            sumVal += p.value;
        }

        result.push({
            ts: sumTs / slice.length,
            value: sumVal / slice.length,
        });
    }

    return result;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
    }
    return value.toFixed(digits);
}