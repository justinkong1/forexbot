"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from "lightweight-charts";

export interface ChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function CandleChart({ candles }: { candles: ChartCandle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#3a5258",
        fontFamily: "IBM Plex Mono, monospace",
      },
      grid: {
        vertLines: { color: "rgba(12,27,30,0.06)" },
        horzLines: { color: "rgba(12,27,30,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(12,27,30,0.12)" },
      timeScale: { borderColor: "rgba(12,27,30,0.12)" },
      crosshair: { mode: 1 },
      height: 420,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#1f7a4d",
      downColor: "#b83a3a",
      borderUpColor: "#1f7a4d",
      borderDownColor: "#b83a3a",
      wickUpColor: "#1f7a4d",
      wickDownColor: "#b83a3a",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const data: CandlestickData<Time>[] = candles
      .filter((c) => c.time)
      .map((c) => ({
        time: (Math.floor(new Date(c.time).getTime() / 1000) as Time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
    seriesRef.current.setData(data);
    chartRef.current.timeScale().fitContent();
  }, [candles]);

  return <div ref={containerRef} className="w-full" />;
}
