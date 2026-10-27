import React, { useMemo } from 'react';
import { SparklinePoint } from '../../types/home.types';

interface SparklineProps {
  points: SparklinePoint[];
  /** Stroke color (any valid CSS color) */
  color: string;
  /** Fill color for the soft area under the line */
  fillColor: string;
  width?: number;
  height?: number;
  className?: string;
}

/** Fallback sample curve so the card still looks polished when API returns no data */
const SAMPLE_VALUES = [42, 46, 44, 52, 58, 55, 63, 68, 66, 74];

/**
 * Lightweight, dependency-free smooth SVG sparkline (area + line).
 * Uses a Catmull-Rom -> cubic Bezier conversion for a natural curve.
 */
const buildSmoothPath = (coords: Array<{ x: number; y: number }>): string => {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
};

export const Sparkline: React.FC<SparklineProps> = ({
  points,
  color,
  fillColor,
  width = 108,
  height = 40,
  className = '',
}) => {
  const hasRealData = useMemo(
    () => Array.isArray(points) && points.length >= 2 && points.some((p) => Number(p?.value) > 0),
    [points]
  );

  const values = useMemo(
    () => (hasRealData ? points.map((p) => Number(p.value) || 0) : SAMPLE_VALUES),
    [hasRealData, points]
  );

  const { linePath, areaPath } = useMemo(() => {
    const padding = 3;
    const usableW = width - padding * 2;
    const usableH = height - padding * 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = values.length > 1 ? usableW / (values.length - 1) : usableW;

    const coords = values.map((v, i) => ({
      x: padding + i * stepX,
      y: padding + usableH - ((v - min) / span) * usableH,
    }));

    const line = buildSmoothPath(coords);
    const last = coords[coords.length - 1];
    const first = coords[0];
    const area = `${line} L ${last.x.toFixed(2)} ${height} L ${first.x.toFixed(2)} ${height} Z`;

    return { linePath: line, areaPath: area };
  }, [values, width, height]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path d={areaPath} fill={fillColor} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
