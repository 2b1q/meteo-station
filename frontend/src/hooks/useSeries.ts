import { useCallback, useState } from "react"
import type { LinePoint } from "../helpers/chart"
import { appendPoint, MAX_POINTS } from "../helpers/chart"

// hook for managing a series of data points
export function useSeries(limit: number = MAX_POINTS) {
    const [points, setPoints] = useState<LinePoint[]>([])

    const addPoint = useCallback(
        (ts: number, value: number | null) => {
            setPoints(prev => appendPoint(prev, { ts, value }, limit))
        },
        [limit],
    )

    return { points, addPoint }
}