/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { WaveTargets, Candle } from '../types';
import { TrendingUp, Zap, Activity, Crosshair, ChevronRight, AlertCircle, ShieldAlert, BarChart3, Target } from 'lucide-react';
import { motion } from 'motion/react';

interface WavePanelProps {
  targets: WaveTargets;
  data: Candle[];
  ticker?: string;
  timeframe?: string;
  isBacktestMode?: boolean;
  backtestTime?: string;
  timeOffset?: number;
}

export const WavePanel: React.FC<WavePanelProps> = ({ 
  targets, 
  data, 
  ticker = 'PAXGUSDT', 
  timeframe = '30m',
  isBacktestMode = false,
  backtestTime = '',
  timeOffset = 0
}) => {
  const isForex = ticker.startsWith('EUR') || ticker.startsWith('GBP') || ticker.startsWith('JPY');
  
  const formatCurrency = (val: number | null) => {
    if (!val) return '---';
    return isForex 
      ? val.toFixed(5) 
      : `${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const kijunPrediction = useMemo(() => {
    if (data.length < 26) return { status: 'INITIALIZING', color: 'text-gray-500' };
    if (targets.isYWave) return { status: 'INSTABILITY', color: 'text-rose-500' };
    if (targets.spanBFlattening) return { status: 'FLATTENING', color: 'text-gold' };
    return { status: 'EQUILIBRIUM', color: 'text-blue-400' };
  }, [data, targets.isYWave, targets.spanBFlattening]);

  const countdownText = useMemo(() => {
    if (!targets.timeTarget || isNaN(targets.timeTarget)) return null;
    const diff = targets.timeTarget - Date.now();
    if (diff <= 0) return "REACHED";
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    return `${m}m ${s}s`;
  }, [targets.timeTarget]);

  const [currentTime, setCurrentTime] = React.useState(new Date(Date.now() + timeOffset));

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date(Date.now() + timeOffset));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeOffset]);

  const currentCandleTimer = useMemo(() => {
    const tf = timeframe?.toUpperCase() || '30M';
    const secondsInTf: Record<string, number> = {
      '1M': 60,
      '5M': 300,
      '15M': 900,
      '30M': 1800,
      '1H': 3600,
      '4H': 14400,
      '1D': 86400
    };
    
    const periodSeconds = secondsInTf[tf] || 1800;
    
    // In backtest mode, the countdown is relative to the simulated "current" candle
    if (isBacktestMode && backtestTime && data.length > 0) {
      // Find the last candle in data
      const lastCandle = data[data.length - 1];
      const candleStartMs = new Date(lastCandle.time).getTime();
      const candleEndMs = candleStartMs + (periodSeconds * 1000);
      
      // In backtest, the countdown is just 0 since we move by full candles
      // unless we want to show the full candle duration?
      // Re-evaluating: In backtest, the clock stops at the candle's close.
      return "00:00:00"; 
    }

    const nowMs = currentTime.getTime();
    const periodStartMs = Math.floor(nowMs / (periodSeconds * 1000)) * (periodSeconds * 1000);
    const nextPeriodMs = periodStartMs + (periodSeconds * 1000);
    const diffSec = Math.max(0, Math.floor((nextPeriodMs - nowMs) / 1000));

    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    const s = diffSec % 60;
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [timeframe, currentTime, isBacktestMode, backtestTime, data]);

  const items = [
    { label: 'EQUALIZATION', value: null, time: targets.equalizationTime, color: 'border-gold/20 bg-gold/5', text: 'text-gold', icon: Activity },
    { label: 'N-TARGET', value: targets.n, time: targets.nTime, color: 'border-blue-500/30 bg-blue-500/5', text: 'text-blue-400', icon: TrendingUp },
    { label: 'V-TARGET', value: targets.v, time: targets.vTime, color: 'border-purple-500/30 bg-purple-500/5', text: 'text-purple-400', icon: Zap },
    { label: 'E-TARGET', value: targets.e, time: targets.eTime, color: 'border-orange-500/30 bg-orange-500/5', text: 'text-orange-400', icon: Crosshair },
    { label: 'NT-TARGET', value: targets.nt, time: targets.ntTime, color: 'border-amber-500/30 bg-amber-500/5', text: 'text-amber-400', icon: Target },
  ];

  const upcomingCycles = [
    targets.cycleCountdown9, targets.cycleCountdown17, targets.cycleCountdown26,
    targets.cycleCountdown33, targets.cycleCountdown42, targets.cycleCountdown52,
    targets.cycleCountdown65, targets.cycleCountdown76, targets.cycleCountdown129
  ].filter(v => v >= 0);
  
  const nearestCycle = Math.min(...upcomingCycles);
  const isTargetHit = nearestCycle === 0;

  return (
    <div className="flex flex-col gap-3 pb-8 lg:pb-0">
      {/* Wave Summary Info */}
      <div className="bg-black/60 border border-gray-800 rounded-xl p-3 flex justify-between items-center overflow-hidden relative" title="Shows current wave duration and countdown to next Hosoda change day">
        <div className="absolute inset-0 bg-gold/5 opacity-20 pointer-events-none" />
        <div className="flex flex-col z-10">
          <span className="text-[7px] font-black text-gray-500 tracking-[0.2em] mb-1">CURRENT WAVE DURATION</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-mono font-black text-white">{targets.candleCounter}</span>
            <span className="text-[8px] font-bold text-gray-500 uppercase">Candles</span>
          </div>
        </div>
        <div className="flex items-center gap-2 z-10">
          <div className="h-8 w-[1px] bg-gray-800 mx-2" />
          <div className="flex flex-col items-end">
            <span className="text-[7px] font-black text-gray-500 tracking-[0.2em] mb-1">HENKA-BI CYCLE</span>
            <span className={`text-xs font-black ${isTargetHit ? 'text-emerald-400 animate-pulse' : 'text-gold'}`}>
              {isTargetHit ? 'CHANGE DAY' : `IN ${nearestCycle}c`}
            </span>
          </div>
        </div>
      </div>

      {/* Cycle Countdown Grid - Expanded for Hosoda Vol 1 */}
      <div className="grid grid-cols-5 gap-1.5 px-0.5" title="Hosoda Kihon Suchi: Countdown to potential market reaction points">
        {[
          { label: '9', val: targets.cycleCountdown9, color: 'text-blue-400' },
          { label: '17', val: targets.cycleCountdown17, color: 'text-purple-400' },
          { label: '26', val: targets.cycleCountdown26, color: 'text-emerald-400' },
          { label: '33', val: targets.cycleCountdown33, color: 'text-gold' },
          { label: '42', val: targets.cycleCountdown42, color: 'text-orange-400' },
          { label: '52', val: targets.cycleCountdown52, color: 'text-rose-400' },
          { label: '65', val: targets.cycleCountdown65, color: 'text-pink-400' },
          { label: '76', val: targets.cycleCountdown76, color: 'text-amber-500' },
          { label: '129', val: targets.cycleCountdown129, color: 'text-cyan-400' },
          { label: 'CORE', val: targets.candleCounter, color: 'text-white' }
        ].map((c) => {
          const isFinished = c.val === 0;
          return (
            <div key={c.label} className={`rounded-lg py-1.5 text-center transition-all duration-300 ${
              isFinished 
                ? 'bg-emerald-500/20 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                : 'bg-gray-900/40 border border-gray-800/60'
            }`}>
              <p className={`text-[5px] font-bold mb-0.5 ${isFinished ? 'text-emerald-400' : 'text-gray-600'}`}>{c.label}</p>
              <p className={`text-[9px] font-mono font-black ${isFinished ? 'text-white' : c.color}`}>
                {c.label === 'CORE' ? c.val : (isFinished ? 'HIT' : `-${c.val}`)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Point Zero Analysis (Tome 2) */}
      <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-3 mb-4" title="Tome 2 Rule 0-1-2-3: Significant pivot levels and their touch frequency">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Point Zero Analysis</h3>
          <span className="text-[8px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">Rule 0-1-2-3</span>
        </div>
        <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1 custom-scrollbar">
          {targets?.pointZeros && [...targets.pointZeros].slice(-3).sort((a,b) => b.touches - a.touches).map((pz, idx) => (
            <div key={idx} className="flex items-center justify-between bg-black/20 p-2 rounded-lg border border-gray-800/40 translate-z-0" title={`Historical boundary with ${pz.touches} validated reactions`}>
              <div className="flex items-center gap-2">
                <div className={`w-1 h-3 rounded-full ${pz.type === 'RES' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <span className="text-[10px] font-mono font-black text-gray-300">${pz.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[7px] text-gray-600 font-bold uppercase">Touch</span>
                <span className={`text-[10px] font-mono font-black ${pz.touches >= 3 ? 'text-gold animate-pulse' : 'text-emerald-400'}`}>{pz.touches}</span>
              </div>
            </div>
          ))}
          {(!targets?.pointZeros || targets.pointZeros.length === 0) && (
            <p className="text-[8px] text-gray-700 text-center py-2 uppercase font-black italic">Seeking Point Zero...</p>
          )}
        </div>
      </div>

      {/* S-Range Potential Levels (Tome 3 Support/Resistance) */}
      {targets.sRangeLevels && targets.sRangeLevels.length > 0 && (
        <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-3" title="S-Range: Historical price levels where waves frequently pivot">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[8px] font-black text-gray-500 uppercase tracking-widest">S-Range Support/Resistance</h3>
            <span className="text-[8px] font-black text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase">Tome 3</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {targets.sRangeLevels.slice(0, 3).map((lvl, idx) => (
              <div key={idx} className="flex-1 bg-black/20 p-2 rounded-lg border border-gray-800/40 text-center">
                <span className="text-[9px] font-mono font-black text-gray-300">${lvl.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flatness Projection */}
      <div className="grid grid-cols-2 gap-2" title="How many candles the lines will remain flat unless a new high/low is formed font-mono">
        <div className="bg-black/30 border border-gray-800 rounded-lg p-2 flex justify-between items-center" title="Duration of Tenkan-sen (9 periods) flatness">
          <span className="text-[6px] font-bold text-gray-500 uppercase">Tenkan Flat</span>
          <span className="text-[9px] font-mono font-black text-blue-300">{targets.tenkanFlatness}c</span>
        </div>
        <div className="bg-black/30 border border-gray-800 rounded-lg p-2 flex justify-between items-center" title="Duration of Kijun-sen (26 periods) flatness - acts as a strong price magnet">
          <span className="text-[6px] font-bold text-gray-500 uppercase">Kijun Flat</span>
          <span className="text-[9px] font-mono font-black text-purple-300">{targets.kijunFlatness}c</span>
        </div>
      </div>

      {/* Hosoda Master Metrics */}
      <div className="bg-gray-900/30 border border-gray-850 p-2.5 rounded-xl space-y-2">
        <div className="flex items-center justify-between border-b border-gray-900 pb-1">
          <span className="text-[7.5px] font-black text-gold tracking-widest uppercase">⛩️ የሆሶዳ ጥልቅ መለኪያዎች / MASTER METRICS</span>
          <span className="text-[6.5px] text-gray-550 font-bold uppercase font-mono">Vol 1-7 Advanced</span>
        </div>
        
        <div className="grid grid-cols-2 gap-1.5 text-[8.5px]">
          {/* Col 1: Future Pivots */}
          <div className="bg-black/40 border border-gray-850/50 p-1.5 rounded-lg space-y-1 flex flex-col justify-center">
            <span className="text-[6px] font-black text-gray-500 uppercase tracking-widest block">ቀጣይ ሻማ ፒቮት (NEXT CANDLE)</span>
            <div className="flex justify-between font-mono">
              <span className="text-blue-300">T-Sen:</span>
              <span className="text-gray-200 font-bold">{formatCurrency(targets.predictedTenkan)}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-purple-300 font-semibold">K-Sen:</span>
              <span className="text-gray-200 font-bold">{formatCurrency(targets.predictedKijun)}</span>
            </div>
          </div>

          {/* Col 2: Symmetry & Reversion */}
          <div className="bg-black/40 border border-gray-850/50 p-1.5 rounded-lg space-y-1 flex flex-col justify-center">
            <span className="text-[6px] font-black text-gray-500 uppercase tracking-widest block">ሞገድ ስምምነትና ግፊት (WAVE STATUS)</span>
            <div className="flex justify-between font-mono">
              <span className="text-gray-400">Symmetry:</span>
              <span className="text-gold font-bold">{(targets.waveSymmetry * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-gray-400 font-bold">K-Angle:</span>
              <span className={`font-bold ${targets.kijunAngle > 10 ? 'text-emerald-400' : targets.kijunAngle < -10 ? 'text-rose-400' : 'text-gray-400'}`}>
                {targets.kijunAngle > 0 ? '+' : ''}{targets.kijunAngle.toFixed(1)}°
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Alerts row (Chikou Escaped, Span B Magnet) */}
        <div className="grid grid-cols-2 gap-1 text-[7.5px] font-black">
          <div className={`p-1 px-1.5 rounded border flex items-center justify-center gap-1 ${
            targets.chikouBullish 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-black/20 border-gray-900 text-gray-600'
          }`}>
            <span>Chikou:</span>
            <span>{targets.chikouBullish ? 'FREE (BULLISH) 🟢' : 'CONFINED 🔒'}</span>
          </div>
          <div className={`p-1 px-1.5 rounded border flex items-center justify-center gap-1 ${
            targets.spanBMagnet 
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse' 
              : 'bg-black/20 border-gray-900 text-gray-600'
          }`}>
            <span>Span B Pull:</span>
            <span>{targets.spanBMagnet ? 'REVERSION 🧲' : 'BALANCED ✅'}</span>
          </div>
        </div>
      </div>

      {/* Targets */}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className={`px-3 py-2 rounded-lg border border-dashed flex justify-between items-center ${item.color}`}>
            <div className="flex items-center gap-2">
              <item.icon className={`w-3.5 h-3.5 ${item.text}`} />
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-tighter">{item.label}</span>
            </div>
            
            {item.time && (
              <div className="flex flex-col items-center opacity-70">
                <span className="text-[6px] font-bold text-gray-600 uppercase">Est. Time</span>
                <span className="text-[9px] font-mono font-black text-gray-400">
                  {new Date(item.time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
              </div>
            )}

            <span className={`text-[12px] font-mono font-black ${item.text}`}>
              {item.value !== null && ticker.includes('USDT') && !isForex ? '$' : ''}{formatCurrency(item.value)}
            </span>
          </div>
        ))}
      </div>

      {/* Golden Confluence Section (Tome 1-7 Strategy) */}
      <div className={`p-3 rounded-xl border text-left flex flex-col gap-2 relative overflow-hidden transition-all duration-300 ${
        targets.isGoldenEntry 
          ? 'bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.25)]' 
          : 'bg-black/30 border-gray-800'
      }`}>
        <div className="flex justify-between items-center">
          <span className="text-[8px] font-black text-gold tracking-widest uppercase">የጊዜና ዋጋ መጋጠም (CONFLUENCE)</span>
          <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded uppercase ${targets.isGoldenEntry ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-gray-800 text-gray-500'}`}>
            {targets.isGoldenEntry ? '★ ወርቃማ መጋጠሚያ (GOLDEN)' : 'መጋጠሚያ ፍለጋ'}
          </span>
        </div>
        
        {targets.isGoldenEntry ? (
          <div className="space-y-1">
            <p className="text-[12px] font-black text-white leading-tight">
              የቀናት ዑደት ({nearestCycle === 0 ? 'Change Day' : `በ${nearestCycle} ሻማ`}) ከዋጋ መዳረሻ ({targets.approachingTarget || 'Target'}) ጋር በትክክል ገጥሟል!
            </p>
            <p className="text-[10px] text-emerald-400 font-medium">
              🚀 ሆሶዳ በታላቁ መጽሃፋቸው እንዳረጋገጡት፡ ጊዜ እና ዋጋ የሚገናኙበት በዚህ ወሳኝ ነጥብ ላይ ጠንካራ የለውጥ (Reversal) ወይም የመቀጠል ፍንዳታ ይኖራል።
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] text-gray-400 font-medium leading-relaxed">
              የማዕበል ዑደት እና የጊዜ ስሌት በመተንተን ላይ ነው። የ Change Day ዑደት እና የታርጌት መዳረሻ ሲቃረብ አውቶማቲክ ወርቃማ ሲግናል እዚህ ይበራል።
            </p>
            {targets.approachingTarget && (
              <p className="text-[9px] text-amber-400">
                ⚠️ ዝግጅት፡ {targets.approachingTarget} (የዋጋው ኢላማ እየቀረበ ነው)።
              </p>
            )}
          </div>
        )}
      </div>

      {/* Status Box */}
      <div className="bg-black/40 border border-gray-800 rounded-xl p-3 space-y-3">
        <div className="flex justify-between items-center border-b border-gray-800/50 pb-2">
          <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">Hado Ron (Wave Theory)</span>
          <span className={`text-[10px] font-black ${targets.waveType === 'N' ? 'text-emerald-400' : 'text-white'}`}>
            {targets.waveType}-Wave Pattern
          </span>
        </div>

        {targets.swingFilterActive && (
          <div className="flex justify-between items-center border-b border-gray-800/50 pb-2">
            <span className="text-[7px] text-gray-500 font-black tracking-widest">SWING FILTER (መልህቅ ማረጋጊያ)</span>
            <span className="text-[9px] font-mono font-black text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              {targets.swingConfirmation}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center pt-1">
          <div className="flex flex-col">
            <span className="text-[7px] text-gray-600 font-bold uppercase tracking-widest">WAVE STATUS</span>
            <span className="text-[10px] font-black text-emerald-500 uppercase">{targets.approachingTarget || targets.waveStatus}</span>
          </div>
          <div className="text-right flex flex-col">
            <span className="text-[7px] text-gray-600 font-bold uppercase tracking-widest">BOT LOGIC</span>
            <span className="text-[8px] font-black text-gray-400 uppercase italic">Active Nodes</span>
          </div>
        </div>
      </div>

      {/* Take Profit Highlight */}
      {targets.takeProfitSignal && (
        <div className="bg-rose-500 px-3 py-2 rounded-xl text-center animate-pulse">
           <p className="text-[10px] font-black text-white tracking-[0.2em] uppercase">Take Profit Zone reached</p>
        </div>
      )}
    </div>
  );
};
