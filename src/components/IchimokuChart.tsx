/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { 
  ComposedChart, 
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  ReferenceLine,
  Line,
} from 'recharts';
import { ZoomIn, ZoomOut, Maximize, Target, Loader2 } from 'lucide-react';
import { Candle, IchimokuData, WaveTargets } from '../types';
import { calculateIchimoku } from '../utils/ichimoku';

interface IchimokuChartProps {
  data: Candle[];
  timeframe: '1M' | '5M' | '15M' | '30M' | '1H' | '4H' | '1D' | '1W';
  targets?: WaveTargets;
  isRefreshing?: boolean;
}

const CandlestickShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (!payload || payload.open === null || payload.close === null || payload.high === null || payload.low === null) return null;

  const { open, close, low, high } = payload;
  const isUp = close >= open;
  const color = isUp ? '#10b981' : '#ef4444';
  
  // x, y, width, height are pixels from Recharts Bar
  const bodyTop = y;
  const bodyBottom = y + height;
  
  // To draw wicks, we need the scale. Recharts doesn't provide it easily.
  // We'll estimate it from the body.
  const priceBodyMax = Math.max(open, close);
  const priceBodyMin = Math.min(open, close);
  const priceBodyRange = Math.abs(open - close) || 0.000001;
  const pixelsPerUnit = height / priceBodyRange;
  
  const highWickY = bodyTop - (high - priceBodyMax) * pixelsPerUnit;
  const lowWickY = bodyBottom + (priceBodyMin - low) * pixelsPerUnit;

  return (
    <g>
      <line
        x1={x + width / 2}
        y1={isNaN(highWickY) ? bodyTop : highWickY}
        x2={x + width / 2}
        y2={isNaN(lowWickY) ? bodyBottom : lowWickY}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(1, height)}
        fill={color}
      />
    </g>
  );
};

export const IchimokuChart: React.FC<IchimokuChartProps> = ({ data, timeframe, targets, isRefreshing }) => {
  const ZOOM_LEVELS = [257, 226, 172, 129, 76, 65, 52, 42, 33, 26, 17, 13, 9];
  const [viewWindow, setViewWindow] = useState(172);

  const handleZoom = (direction: 'in' | 'out') => {
    const currentIndex = ZOOM_LEVELS.indexOf(viewWindow);
    // Zoom In: Move toward RIGHT (fewer bars)
    if (direction === 'in' && currentIndex < ZOOM_LEVELS.length - 1) {
      setViewWindow(ZOOM_LEVELS[currentIndex + 1]);
    } 
    // Zoom Out: Move toward LEFT (more bars)
    else if (direction === 'out' && currentIndex > 0) {
      setViewWindow(ZOOM_LEVELS[currentIndex - 1]);
    }
  };

  // 1. Pre-calculate indicators for the entire dataset to avoid lag during zoom
  const fullIchiData = useMemo(() => {
    if (data.length === 0) return [];
    
    // Future estimation
    const lastPoint = data[data.length - 1];
    const lastPriceTime = new Date(lastPoint.time).getTime();
    let timeStep = 30 * 60000;
    if (timeframe === '1M') timeStep = 1 * 60000;
    if (timeframe === '5M') timeStep = 5 * 60000;
    if (timeframe === '15M') timeStep = 15 * 60000;
    if (timeframe === '1H') timeStep = 60 * 60000;
    if (timeframe === '4H') timeStep = 240 * 60000;
    if (timeframe === '1D') timeStep = 1440 * 60000;

    const futureData = Array.from({ length: 26 }).map((_, i) => ({
      time: new Date(lastPriceTime + (i + 1) * timeStep).toISOString(),
      open: null as any,
      high: null as any,
      low: null as any,
      close: null as any,
      volume: 0,
      isFuture: true
    }));

    const sourceData = [...data, ...futureData];

    return sourceData.map((candle, idx) => {
      const ichi = calculateIchimoku(sourceData, idx);
      const chikouIdx = idx + 26;
      const targetForChikou = sourceData[chikouIdx];
      const chikouVal = targetForChikou && targetForChikou.close !== null ? targetForChikou.close : null;

      return {
        ...candle,
        ...ichi,
        chikou: chikouVal,
        dataIndex: idx, // Unique index for X-axis
        timeLabel: new Date(candle.time).toLocaleTimeString('en-GB', { 
          timeZone: 'Africa/Addis_Ababa', 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: true 
        })
      };
    });
  }, [data, timeframe]);

  // 2. Slice the pre-calculated data for the current view window
  const chartData = useMemo(() => {
    if (fullIchiData.length === 0) return [];
    // Show exactly 26 future bars to perfectly fit the cloud projection to the right edge
    return fullIchiData.slice(-(viewWindow + 26));
  }, [fullIchiData, viewWindow]);

  const currentPrice = data.length > 0 ? data[data.length - 1].close : 0;

  const yDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    // Use only visible data for domain calculation to ensure tight fit
    chartData.forEach(d => {
      // @ts-ignore - access row properties
      const vals = [d.close, d.high, d.low, d.tenkan, d.kijun, d.spanA, d.spanB, d.equilibrium, d.masterIndex].filter(v => v !== null && v !== undefined && !isNaN(v) && typeof v === 'number');
      if (vals.length > 0) {
        min = Math.min(min, ...vals);
        max = Math.max(max, ...vals);
      }
    });

    if (targets) {
      const activeTargets = [targets.n, targets.v, targets.e, targets.nt, targets.stopLoss].filter(v => v !== null && v !== undefined && !isNaN(v) && typeof v === 'number');
      if (activeTargets.length > 0) {
        min = Math.min(min, ...activeTargets);
        max = Math.max(max, ...activeTargets);
      }
    }

    if (min === Infinity || max === -Infinity || isNaN(min) || isNaN(max)) return ['auto', 'auto'];

    const range = max - min;
    const padding = range * 0.05; // Tightened padding to 5%
    return [min - padding, max + padding];
  }, [chartData, targets]);

    const isForex = data.length > 0 && (targets?.n || 0) < 10; // Simple heuristic or better pass symbol
    const formatPrice = (v: number | null | undefined) => {
      if (v === null || v === undefined) return 'N/A';
      return isForex ? v.toFixed(5) : v.toLocaleString(undefined, { minimumFractionDigits: 2 });
    };

    const formatTargetTime = (time: number | null | undefined) => {
      if (!time || isNaN(time) || time === 0) return '';
      return new Date(time).toLocaleTimeString('en-GB', { 
        timeZone: 'Africa/Addis_Ababa', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true // Set to true to match candle timeLabel
      });
    };

    const targetTimeStr = formatTargetTime(targets?.timeTarget);

    const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload;
      return (
        <div className="bg-bento-bg border border-gray-700 p-2 shadow-2xl rounded text-[10px] font-mono">
          <div className="text-gray-500 mb-2 border-b border-gray-800 pb-1">{p.timeLabel}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div className="text-gray-400">Price: <span className="text-white font-bold">{p.close ? formatPrice(p.close) : 'N/A'}</span></div>
            <div className="text-gold font-bold">Omni-EQ: <span>{formatPrice(p.equilibrium)}</span></div>
            <div className="text-yellow-400 font-bold">Master-EQ: <span>{formatPrice(p.masterIndex)}</span></div>
            <div className="text-blue-400 font-bold">Tenkan: <span>{formatPrice(p.tenkan)}</span></div>
            <div className="text-purple-400 font-bold">Kijun: <span>{formatPrice(p.kijun)}</span></div>
            <div className="text-emerald-400 font-bold">Span A: <span>{formatPrice(p.spanA)}</span></div>
            <div className="text-rose-400 font-bold">Span B: <span>{formatPrice(p.spanB)}</span></div>
          </div>
          {p.deviation !== undefined && p.deviation !== null && (
            <div className="mt-2 pt-1 border-t border-gray-800 flex justify-between">
              <span className="text-gray-500">Deviation:</span>
              <span className={Math.abs(p.deviation) > 2 ? 'text-rose-500' : 'text-emerald-500'}>{p.deviation.toFixed(2)}%</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 bg-[#14161C] relative overflow-hidden flex flex-col group w-full">
      {data.length === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 text-gold animate-spin mb-4" />
          <p className="text-gold text-[10px] font-black tracking-widest animate-pulse">AWAITING MARKET SYNC...</p>
        </div>
      )}
      {/* Top Controls Overlay */}
      <div className="absolute top-2 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 border border-white/5 backdrop-blur-md pointer-events-auto shadow-lg">
          <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500`} />
          <span className={`text-[8px] font-black tracking-widest text-gray-400`}>
            LIVENODE
          </span>
        </div>

        <div className="flex gap-4 pointer-events-auto items-center bg-black/40 backdrop-blur-md border border-gray-800 rounded px-2 py-0.5">
          <div className="flex items-center gap-1 border-r border-gray-700 pr-2 mr-1">
            <button 
              onClick={() => handleZoom('in')}
              disabled={viewWindow === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              className="p-1 hover:text-gold text-gray-400 disabled:opacity-30 transition-colors"
              title="Zoom In (Decrease bars)"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button 
              onClick={() => setViewWindow(172)}
              className={`p-1 transition-colors ${viewWindow === 172 ? 'text-gold' : 'text-gray-400 hover:text-white'}`}
              title="Reset to 172 Macro"
            >
              <Maximize className="w-3 h-3" />
            </button>
            <button 
              onClick={() => handleZoom('out')}
              disabled={viewWindow === ZOOM_LEVELS[0]}
              className="p-1 hover:text-gold text-gray-400 disabled:opacity-30 transition-colors"
              title="Zoom Out (Increase bars)"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
          </div>
          <span className="text-[8px] text-gold font-black tracking-widest uppercase">
            {viewWindow}-CANDLE {viewWindow > 100 ? 'MACRO' : 'MICRO'} VIEW
          </span>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden w-full">
        <ResponsiveContainer width="100%" height="100%" minHeight={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 0, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="cloudGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="cloudRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="goldenZone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFD700" stopOpacity={0.2}/>
                <stop offset="100%" stopColor="#FFD700" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.2} />
            <XAxis 
              dataKey="dataIndex" 
              fontSize={7} 
              tick={{ fill: '#4b5563', fontWeight: 600 }} 
              axisLine={false}
              tickLine={false}
              height={15}
              interval="preserveStartEnd"
              minTickGap={45}
              tickFormatter={(val, idx) => {
                const item = chartData.find(d => d.dataIndex === val);
                return item ? item.timeLabel : '';
              }}
            />
            {/* Golden Entry Zone (Tenkan-Kijun Gap) */}
            {targets?.isGoldenEntry && (
              <Area 
                type="monotone" 
                dataKey={(d) => {
                  if (d.tenkan === null || d.kijun === null) return null;
                  return [Math.min(d.tenkan, d.kijun), Math.max(d.tenkan, d.kijun)];
                }}
                stroke="none"
                fill="url(#goldenZone)"
                animationDuration={0}
                isAnimationActive={false}
              />
            )}
            {/* Cycle Period Markers (Hosoda Numbers) */}
            {ZOOM_LEVELS.filter(num => num <= viewWindow).map(num => (
              <ReferenceLine 
                key={num}
                x={chartData[Math.max(0, chartData.length - 26 - num)]?.dataIndex} 
                stroke={num === viewWindow || num === 26 ? '#FFD700' : '#475569'} 
                strokeDasharray={num === viewWindow ? '3 3' : '5 5'} 
                opacity={num === viewWindow || num === 26 ? 0.4 : 0.2} 
              />
            ))}
            
            <YAxis 
              domain={yDomain} 
              fontSize={8} 
              tick={{ fill: '#94a3b8', fontWeight: 'bold' }} 
              orientation="right"
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(v) => formatPrice(v)}
              allowDataOverflow={false}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Bullish Cloud */}
            <Area 
              type="monotone" 
              dataKey={(d) => d.spanA >= d.spanB ? [d.spanA, d.spanB] : [d.spanB, d.spanB]} 
              stroke="none" 
              fill="url(#cloudGreen)" 
              animationDuration={0}
              isAnimationActive={false}
            />

            {/* Bearish Cloud */}
            <Area 
              type="monotone" 
              dataKey={(d) => d.spanB > d.spanA ? [d.spanA, d.spanB] : [d.spanA, d.spanA]} 
              stroke="none" 
              fill="url(#cloudRed)" 
              animationDuration={0}
              isAnimationActive={false}
            />
            
            {/* Price Line Overlay */}
            <ReferenceLine 
              y={currentPrice} 
              stroke="#FFD700" 
              strokeDasharray="2 2" 
              opacity={0.3} 
            />

            {/* Tome 3: S-Range Potential Levels */}
            {targets?.sRangeLevels?.map((lvl, idx) => (
              <ReferenceLine 
                key={`sr-${idx}`}
                y={lvl}
                stroke="#475569"
                strokeDasharray="2 4"
                opacity={0.3}
                label={{ value: 'S-R', position: 'insideRight', fill: '#475569', fontSize: 6 }}
              />
            ))}

            {/* Tome 3: Pivot Markers (A, B, C) */}
            {targets?.pivotA_idx !== undefined && targets.pivotA_idx !== -1 && (
              <ReferenceLine 
                x={fullIchiData[targets.pivotA_idx]?.dataIndex}
                stroke="#60a5fa"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.8}
                label={{ value: 'A', position: 'insideBottom', fill: '#60a5fa', fontSize: 14, fontWeight: '900', offset: 10 }}
              />
            )}
            {targets?.pivotB_idx !== undefined && targets.pivotB_idx !== -1 && (
              <ReferenceLine 
                x={fullIchiData[targets.pivotB_idx]?.dataIndex}
                stroke="#c084fc"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.8}
                label={{ value: 'B', position: 'insideBottom', fill: '#c084fc', fontSize: 14, fontWeight: '900', offset: 10 }}
              />
            )}
            {targets?.pivotC_idx !== undefined && targets.pivotC_idx !== -1 && (
              <ReferenceLine 
                x={fullIchiData[targets.pivotC_idx]?.dataIndex}
                stroke="#34d399"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.8}
                label={{ value: 'C', position: 'insideBottom', fill: '#34d399', fontSize: 14, fontWeight: '900', offset: 10 }}
              />
            )}

            {/* Tome 3: Kakon Suchi (Equalization) */}
            {targets?.equalizationTime && (
              <ReferenceLine 
                x={fullIchiData.find(d => new Date(d.time).getTime() === new Date(targets.equalizationTime!).getTime())?.dataIndex}
                stroke="#fbbf24"
                strokeDasharray="10 10"
                opacity={0.6}
                label={{ value: 'EQ-TIME', position: 'top', fill: '#fbbf24', fontSize: 8, fontWeight: 'black' }}
              />
            )}

            {/* Wave Projection Targets */}
            {targets?.nTime && (
              <ReferenceLine 
                x={fullIchiData.find(d => new Date(d.time).getTime() === new Date(targets.nTime!).getTime())?.dataIndex}
                stroke="#3b82f6"
                strokeDasharray="5 5"
                opacity={0.3}
              />
            )}
            {targets?.vTime && (
              <ReferenceLine 
                x={fullIchiData.find(d => new Date(d.time).getTime() === new Date(targets.vTime!).getTime())?.dataIndex}
                stroke="#a855f7"
                strokeDasharray="5 5"
                opacity={0.3}
              />
            )}
            {targets?.eTime && (
              <ReferenceLine 
                x={fullIchiData.find(d => new Date(d.time).getTime() === new Date(targets.eTime!).getTime())?.dataIndex}
                stroke="#f97316"
                strokeDasharray="5 5"
                opacity={0.3}
              />
            )}
            {targets?.ntTime && (
              <ReferenceLine 
                x={fullIchiData.find(d => new Date(d.time).getTime() === new Date(targets.ntTime!).getTime())?.dataIndex}
                stroke="#f59e0b"
                strokeDasharray="5 5"
                opacity={0.3}
              />
            )}
            {targets?.n && (
              <ReferenceLine 
                y={targets.n} 
                stroke="#3b82f6" 
                strokeDasharray="5 5" 
                label={{ value: `N: ${formatPrice(targets.n)}`, position: 'insideLeft', fill: '#60a5fa', fontSize: 8, fontWeight: 'bold' }} 
              />
            )}
            {targets?.v && (
              <ReferenceLine 
                y={targets.v} 
                stroke="#a855f7" 
                strokeDasharray="5 5" 
                label={{ value: `V: ${formatPrice(targets.v)}`, position: 'insideLeft', fill: '#c084fc', fontSize: 8, fontWeight: 'bold' }} 
              />
            )}
            {targets?.e && (
              <ReferenceLine 
                y={targets.e} 
                stroke="#f97316" 
                strokeDasharray="5 5" 
                label={{ value: `E: ${formatPrice(targets.e)}`, position: 'insideLeft', fill: '#fb923c', fontSize: 8, fontWeight: 'bold' }} 
              />
            )}
            {targets?.nt && (
              <ReferenceLine 
                y={targets.nt} 
                stroke="#f59e0b" 
                strokeDasharray="5 5" 
                label={{ value: `NT: ${formatPrice(targets.nt)}`, position: 'insideLeft', fill: '#fbbf24', fontSize: 8, fontWeight: 'bold' }} 
              />
            )}
            
            {targets?.stopLoss && (
              <ReferenceLine 
                y={targets.stopLoss} 
                stroke="#ef4444" 
                strokeWidth={1}
                strokeDasharray="3 3" 
                label={{ value: 'SL', position: 'insideRight', fill: '#ef4444', fontSize: 8, fontWeight: 'black' }} 
              />
            )}

            {/* Ichimoku Lines */}
            <Line type="stepAfter" dataKey="masterIndex" stroke="#FFD700" strokeWidth={2} dot={false} opacity={0.8} animationDuration={0} isAnimationActive={false} />
            <Line type="monotone" dataKey="equilibrium" stroke="#FFD700" strokeWidth={1} dot={false} strokeDasharray="5 5" opacity={0.6} animationDuration={0} isAnimationActive={false} />
            <Line type="monotone" dataKey="tenkan" stroke="#60a5fa" strokeWidth={1} dot={false} opacity={1} animationDuration={0} isAnimationActive={false} />
            <Line type="monotone" dataKey="kijun" stroke="#c084fc" strokeWidth={1} dot={false} opacity={1} animationDuration={0} isAnimationActive={false} />
            <Line type="monotone" dataKey="spanA" stroke="#34d399" strokeWidth={1} dot={false} strokeDasharray="4 4" opacity={0.5} animationDuration={0} isAnimationActive={false} />
            <Line type="monotone" dataKey="spanB" stroke="#f87171" strokeWidth={1} dot={false} strokeDasharray="4 4" opacity={0.5} animationDuration={0} isAnimationActive={false} />
            <Line type="monotone" dataKey="chikou" stroke="#FFD700" strokeWidth={1.5} dot={false} opacity={1} animationDuration={0} isAnimationActive={false} />

            {/* Candlestick Body & Wick */}
            <Bar 
              dataKey={(d) => d.open !== null ? [Math.min(d.open, d.close), Math.max(d.open, d.close)] : null}
              shape={<CandlestickShape />}
              animationDuration={0}
              isAnimationActive={false}
            />

          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="py-1.5 border-t border-gray-800/50 flex items-center justify-between px-4 bg-black/20 text-[7px] font-black uppercase tracking-widest text-gray-400 shrink-0">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-gold" /> MASTER-EQ</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-gold/50" /> OMNI-EQ</div>
          <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-indigo-500" /> KIJUN-26</div>
        </div>
        <div className="text-gold/60">EQUILIBRIUM ANALYSIS</div>
      </div>
    </div>
  );
};
