/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { IndexWeights, IchimokuData, WaveTargets } from '../types';
import { motion } from 'motion/react';
import { Activity, ShieldCheck, Crosshair, HelpCircle, Target, TrendingUp, Compass, AlertCircle, ShieldAlert } from 'lucide-react';

interface IndicatorPanelProps {
  weights: IndexWeights;
  ichi: IchimokuData;
  targets: WaveTargets;
  ticker?: string;
  mtfTrends?: { timeframe: string; trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; price: number; tenkan: number; Kijun: number }[];
  mtfLoading?: boolean;
}

export const IndicatorPanel: React.FC<IndicatorPanelProps> = ({ 
  weights, 
  ichi, 
  targets, 
  ticker = 'PAXGUSDT',
  mtfTrends = [],
  mtfLoading = false
}) => {
  const isForex = ticker.startsWith('EUR') || ticker.startsWith('GBP') || ticker.startsWith('JPY');
  
  const formatCurrency = (val: number | null) => {
    if (!val) return '---';
    return isForex 
      ? val.toFixed(5) 
      : `${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const lines = [
    { label: 'TENKAN', val: weights.tenkan, color: 'bg-blue-400', angle: ichi.angles?.tenkan },
    { label: 'KIJUN', val: weights.kijun, color: 'bg-purple-400', angle: ichi.angles?.kijun },
    { label: 'SENKOU A', val: weights.spanA, color: 'bg-emerald-400', angle: ichi.angles?.spanA },
    { label: 'SENKOU B', val: weights.spanB, color: 'bg-rose-400', angle: ichi.angles?.spanB },
    { label: 'CHIKOU', val: weights.chikou, color: 'bg-yellow-400', angle: ichi.angles?.chikou },
  ];

  const getAngleIcon = (angle: number) => {
    if (angle > 10) return '↗';
    if (angle < -10) return '↘';
    return '→';
  };

  return (
    <div className="bg-bento-card border border-gray-800 rounded-xl flex flex-col shadow-2xl overflow-hidden pb-8 lg:pb-0">
      <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-black/20">
        <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> System Matrix
        </h2>
        <div className={`px-2 py-0.5 rounded text-[8px] font-black border border-dashed ${targets.chikouBullish ? 'border-emerald-500 text-emerald-400' : 'border-rose-500 text-rose-400'}`}>
          {targets.chikouBullish ? 'CHIKOU-BULL' : 'CHIKOU-BEAR'}
        </div>
      </div>

      <div className="p-4 space-y-3">
          {targets.magnetEffect && (
            <div className="w-full bg-amber-500/20 border-2 border-amber-500 text-amber-500 text-[10px] font-black px-3 py-2 rounded-lg flex items-center justify-between animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.4)] mb-2">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> 
                STRONG MAGNET WARNING: SPAN B ATTRACTION
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-4">
            {targets.isGoldenEntry && (
              <span className="bg-gold/10 border border-gold/30 text-gold text-[8px] font-black px-2 py-1 rounded-full">
                OPTIMAL ENTRY
              </span>
            )}
          {Math.abs(ichi.divergence || 0) > 5 && (
            <span className="bg-orange-500/20 border border-orange-500 text-orange-500 text-[8px] font-black px-2 py-1 rounded-full animate-pulse">
              CAUTION: HIGH DIVERGENCE
            </span>
          )}
          {targets.takeProfitSignal && (
            <span className="bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[8px] font-black px-2 py-1 rounded-full animate-bounce">
              DANGER / EXIT
            </span>
          )}
        </div>

        {lines.map((line) => (
          <div key={line.label} className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-gray-500 tracking-tighter uppercase">{line.label}</span>
                <span className="text-[8px] font-black text-gray-400 font-mono">
                  {line.angle !== undefined ? `${Math.round(line.angle)}° ${getAngleIcon(line.angle)}` : ''}
                </span>
              </div>
              <span className={`text-[10px] font-mono font-bold ${line.val > 0 ? 'text-white' : 'text-gray-700'}`}>{line.val}%</span>
            </div>
            <div className="h-1 bg-gray-900 rounded-full overflow-hidden">
              <div style={{ width: `${line.val}%` }} className={`h-full ${line.color} transition-all duration-1000`} />
            </div>
          </div>
        ))}

        <div className="pt-4 grid grid-cols-2 gap-2">
          <div className="p-2 bg-black/30 rounded border border-gray-800">
            <p className="text-[7px] text-gray-600 font-bold uppercase mb-1">Equilibrium</p>
            <p className="text-[11px] font-mono text-gold font-black">
              ${ichi.equilibrium?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '---'}
            </p>
          </div>
          <div className="p-2 bg-black/30 rounded border border-gray-800">
            <p className="text-[7px] text-gray-600 font-bold uppercase mb-1">Deviation</p>
            <p className={`text-[11px] font-mono font-black ${Math.abs(ichi.deviation || 0) > 2 ? 'text-rose-500' : 'text-emerald-500'}`}>
              {Math.abs(ichi.deviation || 0) > 3 ? 'OVEREXT' : ichi.deviation?.toFixed(2) + '%'}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-800/50">
          {/* Multi-Timeframe Confluence Matrix */}
          <div className="mb-4 py-2.5 px-3 rounded-lg bg-black/20 border border-gray-800/30">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                <Compass className="w-3.5 h-3.5 text-gold animate-[spin_60s_linear_infinite]" /> MTF Confluence Matrix
              </span>
              {mtfLoading && (
                <span className="text-[7px] text-gold font-bold animate-pulse font-mono">
                  SCANNING...
                </span>
              )}
            </div>
            
            {mtfTrends.length === 0 ? (
              <div className="text-[8px] text-gray-600 bg-black/10 py-2 px-2 rounded text-center font-bold tracking-tight">
                {mtfLoading ? 'Gathering timeframe matrix...' : 'No HTF trend data available'}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {mtfTrends.map((t) => (
                  <div key={t.timeframe} className="p-1 px-2 rounded bg-black/40 border border-gray-800/40 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-black text-white/90 font-mono w-6">{t.timeframe}</span>
                      <span className="text-[7px] text-gray-500 font-mono">P: {t.price ? t.price.toFixed(1) : '---'}</span>
                    </div>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 leading-none tracking-tight font-sans ${
                      t.trend === 'BULLISH' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : t.trend === 'BEARISH' 
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                          : 'bg-gray-800 text-gray-400'
                    }`}>
                      {t.trend === 'BULLISH' ? '🐂 BULL' : t.trend === 'BEARISH' ? '🐻 BEAR' : '⚪ NEUTRAL'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
           <div className="mb-4">
             <div className="flex justify-between text-[8px] font-black text-gray-500 mb-1 tracking-tighter">
               <span>IDEAL CONVERGENCE (TOME 2)</span>
               <span className={(targets?.convergenceScore || 0) > 60 ? 'text-emerald-400' : 'text-orange-400'}>{targets?.convergenceScore || 0}%</span>
             </div>
             <div className="w-full bg-gray-900 h-1 rounded-full overflow-hidden">
               <div 
                 className={`h-full transition-all duration-1000 ${(targets?.convergenceScore || 0) > 60 ? 'bg-emerald-500' : 'bg-orange-500'}`}
                 style={{ width: `${targets?.convergenceScore || 0}%` }}
               />
             </div>
           </div>

           <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] font-black text-white uppercase tracking-widest">Confidence Score</span>
              <span className={`text-xl font-mono font-black ${weights.total >= 80 ? 'text-gold' : 'text-white'}`}>{weights.total}%</span>
           </div>
           <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden mb-4">
              <div 
                style={{ width: `${weights.total}%` }} 
                className={`h-full transition-all duration-1000 ${weights.total >= 80 ? 'bg-gold' : 'bg-emerald-500'}`} 
              />
           </div>
           
           <div className={`text-center py-2 border border-dashed rounded text-[9px] font-black tracking-widest ${weights.total >= 80 ? 'border-gold/50 text-gold bg-gold/5' : 'border-gray-800 text-gray-600'}`}>
              {weights.total >= 80 ? 'HIGH PROBABILITY SYNC' : 'SYNCING NEURAL MATRIX...'}
           </div>
        </div>

        {/* Risk Guard Integration (Moved from Left to Right) */}
        <div className="mt-2 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 relative overflow-hidden group/risk">
          <div className="absolute top-0 right-0 p-1 opacity-20 group-hover/risk:opacity-100 transition-opacity">
            <ShieldAlert className="w-8 h-8 text-rose-500/10" />
          </div>
          <div className="flex justify-between items-center mb-3 relative z-10">
            <h3 className="text-[9px] font-black text-rose-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              Risk Guard
            </h3>
            <div className="flex flex-col items-end">
              <span className="text-[6px] text-gray-600 font-black mb-0.5">YIELD RATIO</span>
              <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded ${targets.riskReward && targets.riskReward > 2 ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'}`}>
                {targets.riskReward?.toFixed(1) || '0.0'} RR
              </span>
            </div>
          </div>
          <div className="flex justify-between items-end relative z-10">
            <div className="flex flex-col">
              <p className="text-[6px] text-gray-600 font-black uppercase mb-1 tracking-widest">Stop Loss Node</p>
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-3 bg-rose-500 rounded-full" />
                <p className="text-xs font-mono font-black text-rose-500 tabular-nums">
                  {formatCurrency(targets.stopLoss)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[6px] text-gray-600 font-black uppercase mb-1 tracking-widest">Matrix Validation</p>
              <p className={`text-[9px] font-black tracking-tighter ${targets.volumeValidation === 'STRONG' ? 'text-emerald-400' : 'text-gray-500'}`}>
                {targets.volumeValidation}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
