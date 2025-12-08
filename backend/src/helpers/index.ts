import { Point } from "@influxdata/influxdb-client";
import { MetricField } from "../types";

// normalize to number | null
export function toNumber(value: unknown): number | null {
    if (!value && value !== 0) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

// add numeric field only if it is valid
export function addField(p: Point, name: string, value: number | null): void {
    if (value === null) return;
    if (!Number.isFinite(value)) return;
    p.floatField(name, value);
}