import React from "react";
import * as d3 from "d3";

export type LinePoint = {
    ts: number;     // timestamp ms
    value: number;  // sensor value
};

type Props = {
    data: LinePoint[];
    width?: number;
    height?: number;
};

export const LineChart: React.FC<Props> = ({ data, width = 600, height = 300 }) => {
    if (!data.length) {
        return <div>No data</div>;
    }

    const padding = 40;

    const xDomain = d3.extent(data, (d) => new Date(d.ts)) as [Date, Date];
    const yMin = d3.min(data, (d) => d.value) ?? 0;
    const yMax = d3.max(data, (d) => d.value) ?? 1;

    const xScale = d3
        .scaleTime()
        .domain(xDomain)
        .range([padding, width - padding]);

    const yScale = d3
        .scaleLinear()
        .domain([yMin, yMax])
        .nice()
        .range([height - padding, padding]);

    const line = d3
        .line<LinePoint>()
        .x((d) => xScale(new Date(d.ts)))
        .y((d) => yScale(d.value));

    const pathD = line(data) ?? "";

    return (
        <svg width={width} height={height}>
            <path d={pathD} fill="none" stroke="currentColor" strokeWidth={2} />
            {data.map((d, i) => (
                <circle
                    key={i}
                    cx={xScale(new Date(d.ts))}
                    cy={yScale(d.value)}
                    r={2}
                />
            ))}
        </svg>
    );
};