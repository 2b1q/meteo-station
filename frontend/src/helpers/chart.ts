
export type LinePoint = {
    ts: number
    value: number | null
}

export const MAX_POINTS = 200

export function toNumberOrNull(value: unknown): number | null {
    if (typeof value !== "number") return null
    if (!Number.isFinite(value)) return null
    return value
}

export function appendPoint(list: LinePoint[], point: LinePoint, maxPoints: number = MAX_POINTS): LinePoint[] {
    const next = [...list, point]
    if (next.length > maxPoints) {
        next.shift()
    }
    return next
}

export function formatTime(ts: number): string {
    const d = new Date(ts)
    const hh = d.getHours().toString().padStart(2, "0")
    const mm = d.getMinutes().toString().padStart(2, "0")
    const ss = d.getSeconds().toString().padStart(2, "0")
    return `${hh}:${mm}:${ss}`
}

export function formatValue(v: number | null, unit?: string): string {
    if (v === null) return "—"

    let fixed: string
    const abs = Math.abs(v)

    if (abs >= 100) fixed = v.toFixed(0)
    else if (abs >= 10) fixed = v.toFixed(1)
    else fixed = v.toFixed(2)

    return unit ? `${fixed} ${unit}` : fixed
}

// hPa -> mmHg (≈ 0.75006)
export function hPaToMmHg(v: number | null): number | null {
    if (v === null) return null
    return v * 0.75006
}