import React from "react";
import type { LinePoint } from "../helpers/chart";
import { formatTime, formatValue } from "../helpers/chart";
import { useElementSize } from "../hooks/useElementSize";

type LineChartSeries = {
    id: string;
    label: string;
    unit?: string;
    color: string;
    points: LinePoint[];
};

type ReferenceLine = {
    value: number;
    label: string;
    color?: string;
};

type LineChartProps = {
    title: string;
    yLabel?: string;
    series: LineChartSeries[];
    height?: number;
    reference?: ReferenceLine;
};

// one chart, multiple lines + baseline from the first series + optional reference line
const LineChart: React.FC<LineChartProps> = ({
    title,
    yLabel,
    series,
    height = 240,
    reference,
}) => {
    const { ref, width } = useElementSize<HTMLDivElement>();

    const margin = { top: 30, right: 20, bottom: 40, left: 60 };
    const innerWidth = Math.max(width - margin.left - margin.right, 50);
    const innerHeight = height - margin.top - margin.bottom;

    const flattened = series.flatMap((s: LineChartSeries) =>
        s.points.map((p: LinePoint) => ({ ...p, seriesId: s.id })),
    );

    const nonNull = flattened.filter(
        (p) => p.value !== null,
    ) as Array<LinePoint & { seriesId: string }>;

    const hasData = nonNull.length > 1;

    if (!hasData) {
        return (
            <section className="chart-card">
                <div className="chart-header">
                    <h2 className="chart-title">{title}</h2>
                    <div className="chart-current-block">
                        <div className="chart-current-row">
                            <span className="chart-current-value">—</span>
                        </div>
                    </div>
                </div>
                <div className="chart-empty">No data yet</div>
            </section>
        );
    }

    const values = nonNull.map((p) => p.value as number);
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const paddingY = (maxY - minY || 1) * 0.1;
    const domainMinY = minY - paddingY;
    const domainMaxY = maxY + paddingY;

    const minTs = nonNull[0].ts;
    const maxTs = nonNull[nonNull.length - 1].ts;
    const domainSpan = maxTs - minTs || 1;

    const scaleX = (ts: number) =>
        margin.left + ((ts - minTs) / domainSpan) * innerWidth;

    const scaleY = (v: number) =>
        margin.top +
        (1 - (v - domainMinY) / (domainMaxY - domainMinY || 1)) * innerHeight;

    const firstWithData = series.find((s) => s.points.some((p) => p.value !== null));
    let baselineY: number | null = null;
    let baselineMean: number | null = null;
    let baselineUnit: string | undefined;

    if (firstWithData) {
        const vals = firstWithData.points
            .map((p) => p.value)
            .filter((v): v is number => v !== null);

        if (vals.length > 0) {
            const mean = vals.reduce((acc, v) => acc + v, 0) / vals.length;
            baselineMean = mean;
            baselineY = scaleY(mean);
            baselineUnit = firstWithData.unit;
        }
    }

    const latestBySeries = series.map((s) => {
        const nonNullPoints = [...s.points].filter(
            (p) => p.value !== null,
        ) as { ts: number; value: number }[];

        if (!nonNullPoints.length) {
            return {
                id: s.id,
                label: s.label,
                unit: s.unit,
                ts: null as number | null,
                value: null as number | null,
            };
        }

        const last = nonNullPoints[nonNullPoints.length - 1];
        return { id: s.id, label: s.label, unit: s.unit, ts: last.ts, value: last.value };
    });

    const lastTs =
        latestBySeries.find((x) => x.ts !== null)?.ts ??
        nonNull[nonNull.length - 1].ts;

    const xTicksCount = 4;
    const xTicks: number[] = [];
    for (let i = 0; i <= xTicksCount; i += 1) {
        xTicks.push(minTs + (domainSpan * i) / xTicksCount);
    }

    const yTicksValues = [domainMinY, (domainMinY + domainMaxY) / 2, domainMaxY];

    return (
        <section className="chart-card">
            <div className="chart-header">
                <div>
                    <h2 className="chart-title">{title}</h2>
                    <div className="chart-meta">
                        {yLabel && <span className="chart-meta-label">Y: {yLabel}</span>}
                        {lastTs && (
                            <span className="chart-meta-time">Last: {formatTime(lastTs)}</span>
                        )}
                    </div>
                </div>
                <div className="chart-current-block">
                    {latestBySeries.map((s) => (
                        <div className="chart-current-row" key={s.id}>
                            <span
                                className="chart-current-dot"
                                style={{
                                    backgroundColor: series.find((x) => x.id === s.id)?.color,
                                }}
                            />
                            <span className="chart-current-name">{s.label}</span>
                            <span className="chart-current-value">
                                {formatValue(s.value, s.unit)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div ref={ref}>
                <svg width={width} height={height} className="chart-svg">
                    {/* background */}
                    <rect
                        x={margin.left}
                        y={margin.top}
                        width={innerWidth}
                        height={innerHeight}
                        className="chart-plot-bg"
                    />

                    {/* Y axis + grid */}
                    <line
                        x1={margin.left}
                        y1={margin.top}
                        x2={margin.left}
                        y2={margin.top + innerHeight}
                        className="chart-axis"
                    />
                    {yTicksValues.map((v, index) => {
                        const y = scaleY(v);
                        return (
                            <g key={index}>
                                <line
                                    x1={margin.left}
                                    y1={y}
                                    x2={margin.left + innerWidth}
                                    y2={y}
                                    className="chart-grid"
                                />
                                <text
                                    x={margin.left - 8}
                                    y={y + 3}
                                    textAnchor="end"
                                    className="chart-axis-label"
                                >
                                    {formatValue(v, baselineUnit)}
                                </text>
                            </g>
                        );
                    })}
                    {yLabel && (
                        <text
                            x={18}
                            y={margin.top + innerHeight / 2}
                            transform={`rotate(-90 18 ${margin.top + innerHeight / 2})`}
                            textAnchor="middle"
                            className="chart-axis-title"
                        >
                            {yLabel}
                        </text>
                    )}

                    {/* X axis */}
                    <line
                        x1={margin.left}
                        y1={margin.top + innerHeight}
                        x2={margin.left + innerWidth}
                        y2={margin.top + innerHeight}
                        className="chart-axis"
                    />
                    {xTicks.map((ts, idx) => {
                        const x = scaleX(ts);
                        return (
                            <g key={idx}>
                                <line
                                    x1={x}
                                    y1={margin.top + innerHeight}
                                    x2={x}
                                    y2={margin.top + innerHeight + 4}
                                    className="chart-axis"
                                />
                                <text
                                    x={x}
                                    y={margin.top + innerHeight + 16}
                                    textAnchor="middle"
                                    className="chart-axis-label"
                                >
                                    {formatTime(ts)}
                                </text>
                            </g>
                        );
                    })}

                    {/* baseline  */}
                    {baselineY !== null && baselineMean !== null && (
                        <>
                            <line
                                x1={margin.left}
                                y1={baselineY}
                                x2={margin.left + innerWidth}
                                y2={baselineY}
                                className="chart-baseline"
                            />
                            <text
                                x={margin.left + innerWidth - 6}
                                y={baselineY - 5}
                                textAnchor="end"
                                className="chart-baseline-label"
                            >
                                mean {formatValue(baselineMean, baselineUnit)}
                            </text>
                        </>
                    )}

                    {/* reference line  */}
                    {reference && (
                        <>
                            <line
                                x1={margin.left}
                                y1={scaleY(reference.value)}
                                x2={margin.left + innerWidth}
                                y2={scaleY(reference.value)}
                                className="chart-refline"
                                stroke={reference.color}
                            />
                            <text
                                x={margin.left + 6}
                                y={scaleY(reference.value) - 4}
                                textAnchor="start"
                                className="chart-refline-label"
                            >
                                {reference.label}
                            </text>
                        </>
                    )}

                    {/* dataseries lines */}
                    {series.map((s) => {
                        const data = s.points.filter(
                            (p) => p.value !== null,
                        ) as { ts: number; value: number }[];

                        if (data.length < 2) return null;

                        const pathD = data
                            .map((p, idx) => {
                                const x = scaleX(p.ts);
                                const y = scaleY(p.value);
                                return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                            })
                            .join(" ");

                        const last = data[data.length - 1];

                        return (
                            <g key={s.id}>
                                <path
                                    d={pathD}
                                    fill="none"
                                    stroke={s.color}
                                    strokeWidth={1.8}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <circle
                                    cx={scaleX(last.ts)}
                                    cy={scaleY(last.value)}
                                    r={3}
                                    fill={s.color}
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>
        </section>
    );
};

export default LineChart;