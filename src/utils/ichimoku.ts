/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, IchimokuData, IndexWeights, WaveTargets } from '../types';

export const calculateIchimoku = (candles: Candle[], index: number): IchimokuData => {
  const getHighLow = (len: number, idx: number) => {
    if (idx < 0 || idx >= candles.length) return { h: null, l: null };
    // Strict requirement: the point from which we calculate must have a valid price
    if (candles[idx] === undefined || candles[idx].close === null) return { h: null, l: null };

    const start = Math.max(0, idx - len + 1);
    let h = -Infinity;
    let l = Infinity;
    let count = 0;
    for (let i = start; i <= idx; i++) {
      if (!candles[i] || candles[i].close === null) continue;
      h = Math.max(h, candles[i].high);
      l = Math.min(l, candles[i].low);
      count++;
    }
    return (h === -Infinity || count < 1) ? { h: null, l: null } : { h, l };
  };

  const currentCandle = candles[index];
  const hasPrice = currentCandle && currentCandle.close !== null;
  
  const tVals = getHighLow(9, index);
  const kVals = getHighLow(26, index);
  const mVals = getHighLow(172, index);
  
  const tenkan = (hasPrice && tVals.h) ? (tVals.h + tVals.l!) / 2 : null;
  const kijun = (hasPrice && kVals.h) ? (kVals.h + kVals.l!) / 2 : null;
  const masterIndex = (hasPrice && mVals.h) ? (mVals.h + mVals.l!) / 2 : null;

  const lookbackIndex = index - 26;
  let spanA = null;
  let spanB = null;

  if (lookbackIndex >= 0) {
    const pTVals = getHighLow(9, lookbackIndex);
    const pKVals = getHighLow(26, lookbackIndex);
    const pSBVals = getHighLow(52, lookbackIndex);

    const pT = pTVals.h ? (pTVals.h + pTVals.l!) / 2 : null;
    const pK = pKVals.h ? (pKVals.h + pKVals.l!) / 2 : null;
    
    if (pT && pK) spanA = (pT + pK) / 2;
    if (pSBVals.h) spanB = (pSBVals.h + pSBVals.l!) / 2;
  }

  // Omni-Equilibrium: (T + K + Sa + Sb) / 4
  let equilibrium = null;
  let deviation = null;
  if (tenkan && kijun && spanA && spanB) {
    equilibrium = (tenkan + kijun + spanA + spanB) / 4;
    if (hasPrice) {
      deviation = ((currentCandle.close - equilibrium) / equilibrium) * 100;
    }
  }

  // Convergence Level (Standard Deviation among the 4 lines)
  let convergence = 0;
  if (tenkan && kijun && spanA && spanB) {
    const values = [tenkan, kijun, spanA, spanB];
    const mean = (tenkan + kijun + spanA + spanB) / 4;
    const squareDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / 4;
    const stdDev = Math.sqrt(avgSquareDiff);
    // High-precision scale: smaller stdDev = higher convergence
    convergence = Math.max(0, 100 - (stdDev / mean * 8000));
  }

  // Calculate Chikou Freedom at the current index
  let chikouFree = false;
  if (index >= 26) {
    const currentPrice = candles[index].close;
    const histPrice = candles[index - 26].close;
    
    const cloudHistIndex = index - 52;
    let hSA = null;
    let hSB = null;
    
    if (cloudHistIndex >= 0) {
      const v = getHighLow(9, cloudHistIndex);
      const k = getHighLow(26, cloudHistIndex);
      const s = getHighLow(52, cloudHistIndex);
      
      if (v.h && k.h) hSA = ((v.h + v.l!) / 2 + (k.h + k.l!) / 2) / 2;
      if (s.h) hSB = (s.h + s.l!) / 2;
    }

    if (histPrice !== null && hSA !== null && hSB !== null) {
      chikouFree = (currentPrice > Math.max(hSA, hSB, histPrice)) || (currentPrice < Math.min(hSA, hSB, histPrice));
    }
  }

  const chikouSpan = index + 26 < candles.length ? candles[index + 26].close : null;

  // Predictive Calculations: Angles
  const getAngle = (len: number, idx: number) => {
    if (idx < 5) return 0;
    const prevIdx = idx - 5;
    const currentHL = getHighLow(len, idx);
    const prevHL = getHighLow(len, prevIdx);
    if (!currentHL.h || !prevHL.h) return 0;
    const curr = (currentHL.h + currentHL.l!) / 2;
    const prev = (prevHL.h + prevHL.l!) / 2;
    const dy = curr - prev;
    const dx = 5;
    return Math.atan2(dy, dx * (currentCandle.close * 0.0001)) * (180 / Math.PI);
  };

  const angles = {
    tenkan: getAngle(9, index),
    kijun: getAngle(26, index),
    spanA: getAngle(26, index - 26), 
    spanB: getAngle(52, index - 26),
    chikou: index >= 5 ? Math.atan2(candles[index].close - candles[index-5].close, 5 * (candles[index].close * 0.0001)) * (180 / Math.PI) : 0
  };

  // Equilibrium Divergence
  const divergence = kijun ? ((currentCandle.close - kijun) / kijun) * 100 : 0;

  return { tenkan, kijun, spanA, spanB, chikou: chikouFree ? 1 : 0, chikouSpan, masterIndex, equilibrium, deviation, convergence, angles, divergence };
};

export const calculateIndexWeights = (currentPrice: number, ichi: IchimokuData, waveTargets: WaveTargets): IndexWeights => {
  // New Refined 100% Formula:
  // 1. Line Position (50%): Price vs (T, K, Sa, Sb, Chikou)
  // 2. Wave Structure (30%): Based on currentWave
  // 3. Target Gap (20%): Distance to N/E
  
  const isAbove = (val: number | null) => (val !== null && currentPrice > val) ? 1 : 0;
  const isBelow = (val: number | null) => (val !== null && currentPrice < val) ? 1 : 0;
  
  const bullSignals = [
    isAbove(ichi.tenkan),
    isAbove(ichi.kijun),
    isAbove(ichi.spanA),
    isAbove(ichi.spanB),
    ichi.chikou // Freedom is 0 or 1
  ];
  
  const positionScore = (bullSignals.reduce((a, b) => a + b, 0) / 5) * 50;
  
  // Wave Score (30% max)
  let waveScore = 0;
  if (waveTargets.currentWave === 3) waveScore = 30;
  else if (waveTargets.currentWave === 2) waveScore = 15;
  else waveScore = 5;

  // Target Gap Score (20% max)
  // Confidence scale already includes some target-based logic
  const targetGapScore = Math.min(20, waveTargets.confidenceScale - waveScore);

  const total = Math.round(positionScore + waveScore + targetGapScore);

  return {
    tenkan: (bullSignals[0] * 10),
    kijun: (bullSignals[1] * 10),
    spanA: (bullSignals[2] * 10),
    spanB: (bullSignals[3] * 10),
    chikou: (bullSignals[4] * 10),
    total: Math.min(100, Math.max(0, total))
  };
};

export const calculateWaveTargets = (candles: Candle[], symbol?: string): WaveTargets => {
  if (candles.length < 52) return { 
    v: null, n: null, e: null, nt: null, pIndex: 0, yIndex: 0, 
    isPWave: false, isYWave: false, 
    currentWave: 0, waveStatus: 'INITIALIZING', 
    timeTarget: null, 
    stopLoss: null,
    riskReward: null,
    volumeValidation: 'NEUTRAL',
    confidenceScale: 0,
    waveSymmetry: 0,
    kijunAngle: 0,
    takeProfitSignal: false,
    candleCounter: 0,
    cycleCountdown9: 9,
    cycleCountdown17: 17,
    cycleCountdown26: 26,
    cycleCountdown33: 33,
    cycleCountdown42: 42,
    cycleCountdown52: 52,
    cycleCountdown65: 65,
    cycleCountdown76: 76,
    cycleCountdown129: 129,
    cycleCountdown172: 172,
    pointZeros: [],
    convergenceScore: 0,
    pivotA_idx: -1,
    pivotB_idx: -1,
    pivotC_idx: -1,
    equalizationTime: null,
    sRangeLevels: [],
    waveType: 'NONE'
  };
  
  const lastIdx = candles.length - 1;
  const lastC = candles[lastIdx].close;
  const lastH = candles[lastIdx].high;
  const lastL = candles[lastIdx].low;

  const getHighLowAt = (len: number, idx: number) => {
    if (idx < 0 || idx >= candles.length) return { h: null, l: null };
    const start = Math.max(0, idx - len + 1);
    let h = -Infinity;
    let l = Infinity;
    let count = 0;
    for (let i = start; i <= idx; i++) {
      if (!candles[i] || candles[i].close === null) continue;
      h = Math.max(h, candles[i].high);
      l = Math.min(l, candles[i].low);
      count++;
    }
    return (h === -Infinity || count < 1) ? { h: null, l: null } : { h, l };
  };

  // --- TOME 2 & 3: S-RANGE & POINT ZERO ---
  const pZeros: { price: number; type: 'RES' | 'SUP'; touches: number }[] = [];
  const pzThreshold = lastC * 0.005; 
  const pzStart = Math.max(5, candles.length - 150);
  const pzEnd = Math.max(5, candles.length - 5);

  for (let i = pzStart; i < pzEnd; i++) {
    const c = candles[i];
    const window = candles.slice(i - 5, i + 5);
    if (window.length === 0) continue;
    
    const isPeak = c.high >= Math.max(...window.map(v => v.high));
    const isTrough = c.low <= Math.min(...window.map(v => v.low));
    
    if (isPeak || isTrough) {
      const moveAfter = isPeak ? 
        (c.high - Math.min(...candles.slice(i, i + 20).map(v => v.low))) :
        (Math.max(...candles.slice(i, i + 20).map(v => v.high)) - c.low);
      
      if (moveAfter >= pzThreshold) {
        const price = isPeak ? c.high : c.low;
        const type = isPeak ? 'RES' : 'SUP';
        let touches = 0;
        for (let j = i + 1; j < candles.length; j++) {
          if (Math.abs(candles[j].high - price) / price < 0.001 || 
              Math.abs(candles[j].low - price) / price < 0.001) {
            touches++;
          }
        }
        pZeros.push({ price, type, touches });
      }
    }
  }

  // S-Range: price levels where multiple Point Zeros cluster
  const sRangeLevels: number[] = [];
  if (pZeros.length > 2) {
    const sortedPZ = [...pZeros].sort((a,b) => a.price - b.price);
    for (let i = 0; i < sortedPZ.length - 1; i++) {
      if (Math.abs(sortedPZ[i].price - sortedPZ[i+1].price) / sortedPZ[i].price < 0.002) {
        sRangeLevels.push((sortedPZ[i].price + sortedPZ[i+1].price) / 2);
      }
    }
  }

  // Helper for flatness duration
  const getFlatnessDuration = (len: number) => {
    const window = candles.slice(-len);
    const h = Math.max(...window.map(c => c.high));
    const l = Math.min(...window.map(c => c.low));
    let maxPos = 0, minPos = 0;
    for (let i = 0; i < window.length; i++) {
      if (window[i].high === h) maxPos = i;
      if (window[i].low === l) minPos = i;
    }
    return Math.min(maxPos + 1, minPos + 1);
  };

  const tenkanFlatness = getFlatnessDuration(9);
  const kijunFlatness = getFlatnessDuration(26);

  // --- TOME 3: HOSODA PIVOT VALIDATION (T26 STRATEGY WITH SWING CONFIRMATION FILTER) ---
  let pivotA: number | null = null;
  let pivotB: number | null = null;
  let pivotC: number | null = null;
  let pivotA_idx = -1;
  let pivotB_idx = -1;
  let pivotC_idx = -1;
  let trendDir: 'UP' | 'DOWN' = 'UP';
  let swingFilterActive = false;
  let swingConfirmation = 'INACTIVE';

  for (let i = candles.length - 30; i >= Math.max(0, candles.length - 172); i--) {
    const potentialA_L = candles[i].low;
    const potentialA_H = candles[i].high;
    const windowUp = candles.slice(i, i + 26);
    
    // Swing Confirmation Filter: Left-side lookback of 9 periods (8 candles)
    const leftWindow = candles.slice(Math.max(0, i - 8), i);
    const isLeftLowConfirmed = leftWindow.length === 0 || leftWindow.every(c => c.low >= potentialA_L);
    const isLeftHighConfirmed = leftWindow.length === 0 || leftWindow.every(c => c.high <= potentialA_H);

    if (isLeftLowConfirmed && windowUp.every(c => c.low >= potentialA_L)) {
      pivotA = potentialA_L;
      pivotA_idx = i;
      trendDir = 'UP';
      swingFilterActive = true;
      swingConfirmation = '9L/26R STABILIZED (BULLISH)';
      break;
    }
    if (isLeftHighConfirmed && windowUp.every(c => c.high <= potentialA_H)) {
      pivotA = potentialA_H;
      pivotA_idx = i;
      trendDir = 'DOWN';
      swingFilterActive = true;
      swingConfirmation = '9L/26R STABILIZED (BEARISH)';
      break;
    }
  }

  // Backup fallback without left-confirmation if absolutely no swing matches (keeps the chart alive and safe)
  if (pivotA_idx === -1) {
    for (let i = candles.length - 30; i >= Math.max(0, candles.length - 172); i--) {
      const potentialA_L = candles[i].low;
      const potentialA_H = candles[i].high;
      const windowUp = candles.slice(i, i + 26);
      if (windowUp.every(c => c.low >= potentialA_L)) {
        pivotA = potentialA_L;
        pivotA_idx = i;
        trendDir = 'UP';
        swingConfirmation = '26R ONLY (FALLBACK)';
        break;
      }
      if (windowUp.every(c => c.high <= potentialA_H)) {
        pivotA = potentialA_H;
        pivotA_idx = i;
        trendDir = 'DOWN';
        swingConfirmation = '26R ONLY (FALLBACK)';
        break;
      }
    }
  }

  if (pivotA_idx !== -1) {
    const afterA = candles.slice(pivotA_idx + 5, Math.min(candles.length, pivotA_idx + 65));
    if (afterA.length > 5) {
      if (trendDir === 'UP') {
        pivotB = Math.max(...afterA.map(c => c.high));
        pivotB_idx = (pivotA_idx + 5) + afterA.findIndex(c => c.high === pivotB);
        const afterB = candles.slice(pivotB_idx + 1);
        if (afterB.length > 0) {
          pivotC = Math.min(...afterB.map(c => c.low));
          pivotC_idx = (pivotB_idx + 1) + afterB.findIndex(c => c.low === pivotC);
        }
      } else {
        pivotB = Math.min(...afterA.map(c => c.low));
        pivotB_idx = (pivotA_idx + 5) + afterA.findIndex(c => c.low === pivotB);
        const afterB = candles.slice(pivotB_idx + 1);
        if (afterB.length > 0) {
          pivotC = Math.max(...afterB.map(c => c.high));
          pivotC_idx = (pivotB_idx + 1) + afterB.findIndex(c => c.high === pivotC);
        }
      }
    }
  }

  // Ensure C hasn't been surpassed yet
  if (pivotC_idx !== -1 && pivotB_idx !== -1) {
    const isInvalidated = trendDir === 'UP' ? lastC < pivotC! : lastC > pivotC!;
    if (isInvalidated) {
       // Search for a newer extreme
       const searchNewC = candles.slice(pivotB_idx + 1);
       if (searchNewC.length > 0) {
         if (trendDir === 'UP') {
           pivotC = Math.min(...searchNewC.map(c => c.low));
           pivotC_idx = (pivotB_idx + 1) + searchNewC.findIndex(c => c.low === pivotC);
         } else {
           pivotC = Math.max(...searchNewC.map(c => c.high));
           pivotC_idx = (pivotB_idx + 1) + searchNewC.findIndex(c => c.high === pivotC);
         }
       }
    }
  }

  // --- TOME 3: TIME EQUALIZATION & HENKA-BI (TIME TARGETS) ---
  let equalizationTime: number | null = null;
  let vTime: number | null = null;
  let nTime: number | null = null;
  let eTime: number | null = null;
  let ntTime: number | null = null;
  
  const intervalMs = (candles.length > 1) 
    ? (new Date(candles[candles.length - 1].time).getTime() - new Date(candles[candles.length - 2].time).getTime()) 
    : 0;
  
  const cIdx = pivotC_idx !== -1 ? pivotC_idx : lastIdx;

  if (pivotA_idx !== -1 && pivotB_idx !== -1) {
    const t1 = pivotB_idx - pivotA_idx; // Distance A to B
    const t2 = cIdx - pivotB_idx; // Distance B to C
    const t3 = cIdx - pivotA_idx; // Distance A to C
    
    const baseTime = new Date(candles[cIdx].time).getTime();
    const pivotBTime = new Date(candles[pivotB_idx].time).getTime();
    
    if (!isNaN(baseTime) && intervalMs > 0) {
      const snapToInterval = (t: number) => {
        return Math.round(t / intervalMs) * intervalMs;
      };

      equalizationTime = snapToInterval(baseTime + (26 * intervalMs)); 
      vTime = snapToInterval(pivotBTime + (t1 * intervalMs));         
      nTime = snapToInterval(baseTime + (t1 * intervalMs));           
      eTime = snapToInterval(pivotBTime + (t3 * intervalMs));         
      ntTime = snapToInterval(baseTime + (t2 * intervalMs));          

      // Ensure times are at least 1 bar after current time to correctly place on chart
      const lastCandleTime = new Date(candles[candles.length - 1].time).getTime();
      const minFutureTime = lastCandleTime + intervalMs;
      
      equalizationTime = Math.max(equalizationTime || 0, minFutureTime);
      nTime = Math.max(nTime || 0, minFutureTime);
      vTime = Math.max(vTime || 0, minFutureTime);
      eTime = Math.max(eTime || 0, minFutureTime);
      ntTime = Math.max(ntTime || 0, minFutureTime);
    }
  }

  const isUpTrend = trendDir === 'UP';
  const a_val = pivotA || lastC;
  const b_val = pivotB || lastC;
  const c_val = pivotC || lastC;

  let v = null, n = null, e = null, nt = null;
  if (isUpTrend) {
    v = b_val + (b_val - c_val);
    n = c_val + (b_val - a_val);
    e = b_val + (b_val - a_val);
    nt = c_val + (c_val - a_val);
  } else {
    v = b_val - (c_val - b_val);
    n = c_val - (a_val - b_val);
    e = b_val - (a_val - b_val);
    nt = c_val - (a_val - c_val);
  }

  let waveType: 'I' | 'V' | 'N' | 'P' | 'Y' | 'NONE' = 'NONE';
  const p1 = candles.slice(-17); 
  const p2 = candles.slice(-33, -17);
  let isPWave = false, isYWave = false;
  if (p1.length >= 17 && p2.length >= 16) {
    const h1 = Math.max(...p1.map(c => c.high));
    const l1 = Math.min(...p1.map(c => c.low));
    const h2 = Math.max(...p2.map(c => c.high));
    const l2 = Math.min(...p2.map(c => c.low));
    isPWave = h1 < h2 && l1 > l2;
    isYWave = h1 > h2 && l1 < l2;
  }

  if (isPWave) waveType = 'P';
  else if (isYWave) waveType = 'Y';
  else if (pivotC_idx !== -1) waveType = 'N';
  else if (pivotB_idx !== -1) waveType = 'V';
  else if (pivotA_idx !== -1) waveType = 'I';

  const barsSinceA = pivotA_idx !== -1 ? (candles.length - 1 - pivotA_idx) : 0;
  const barsSinceB = pivotB_idx !== -1 ? (candles.length - 1 - pivotB_idx) : 0;
  const isB_Broken = isUpTrend ? lastC > b_val : lastC < b_val;
  const isC_Validated = isB_Broken && barsSinceB <= 26;

  let waveStatus = isUpTrend ? 'I-Wave: ክምችት (Bullish)' : 'I-Wave: ክምችት (Bearish)';
  let currentWave = 1;
  if (waveType === 'Y') waveStatus = 'የዑደት መጨረሻ: Y-Wave (መስፋፋት)';
  else if (waveType === 'P') waveStatus = 'መረጋጋት: P-Wave (መኮማተር)';
  else if (isC_Validated) {
    currentWave = 3;
    waveStatus = isUpTrend ? 'N-Wave: እንቅስቃሴ 3 ፍንዳታ (G-Bullish)' : 'N-Wave: እንቅስቃሴ 3 ፍንዳታ (G-Bearish)';
  } else if (pivotC_idx !== -1) {
    currentWave = 2;
    waveStatus = 'V-Wave: ወደ ኋላ መመለስ (B-Wait)';
  }

  const candleCounter = barsSinceA + 1;
  const getCountdown = (target: number, current: number) => (target - (current % target)) % target;

  const cycleCountdown9 = getCountdown(9, candleCounter);
  const cycleCountdown17 = getCountdown(17, candleCounter);
  const cycleCountdown26 = getCountdown(26, candleCounter);
  const cycleCountdown33 = getCountdown(33, candleCounter);
  const cycleCountdown42 = getCountdown(42, candleCounter);
  const cycleCountdown52 = getCountdown(52, candleCounter);
  const cycleCountdown65 = getCountdown(65, candleCounter);
  const cycleCountdown76 = getCountdown(76, candleCounter);
  const cycleCountdown129 = getCountdown(129, candleCounter);
  const cycleCountdown172 = getCountdown(172, candleCounter);

  const stopLoss = c_val;
  const distToN = Math.abs((n || lastC) - lastC) / (lastC || 1);
  const targetGapScore = Math.min(50, (1 / (distToN + 0.01)) * 5); 
  const confidenceScale = Math.min(100, (currentWave === 3 ? 40 : 10) + targetGapScore);

  // --- HOSODA TIME & PRICE CONFLUENCE (THE ULTIMATE ENTRY STRATEGY) ---
  let isGoldenEntry = false;
  let approachingTarget: string | undefined = undefined;
  let takeProfitSignal = false;
  
  if (pivotA_idx !== -1 && pivotB_idx !== -1 && pivotC_idx !== -1) {
    const targetsList = [
      { name: 'N-Target ($N$)', val: n },
      { name: 'E-Target ($E$)', val: e },
      { name: 'V-Target ($V$)', val: v },
      { name: 'NT-Target ($NT$)', val: nt }
    ];
    
    // Dynamic asset specific tolerance:
    let tolerance = 0.005; // default 0.5%
    if (symbol) {
      const s = symbol.toUpperCase();
      if (s.includes('PAXG') || s.includes('GOLD')) {
        tolerance = 0.002; // Very tight 0.2% for Gold (about $8-9 range at $4500)
      } else if (s.includes('EUR') || s.includes('GBP') || s.includes('JPY') || s.includes('USDC') || s.includes('DXY')) {
        tolerance = 0.0005; // 0.05% for Forex and Stablecoins/Fiat indices
      } else if (s.includes('BTC') || s.includes('ETH')) {
        tolerance = 0.008; // 0.8% for Bitcoin & Ethereum
      } else {
        tolerance = 0.012; // 1.2% for other major volatile assets
      }
    } else {
      tolerance = 0.008; // default fallback 0.8%
    }
    
    // Get direction slope of current candle to verify price is moving towards the target
    const prevC = candles.length >= 2 ? candles[candles.length - 2].close : lastC;
    const isPriceFalling = lastC < prevC;
    const isPriceRising = lastC > prevC;
    
    const closeTarget = targetsList.find(t => {
      if (!t.val) return false;
      const pctDistance = Math.abs(t.val - lastC) / t.val;
      if (pctDistance > tolerance) return false;
      
      // Verification logic: Is the price flow aligned with the target's relative status?
      if (t.val > lastC) {
        // Target is ABOVE: we are only approaching it if the price is NOT falling down
        return !isPriceFalling;
      } else if (t.val < lastC) {
        // Target is BELOW: we are only approaching it if the price is NOT rising up
        return !isPriceRising;
      }
      return true;
    });
    
    if (closeTarget) {
      approachingTarget = `${closeTarget.name} Approaching`;
      
      // Is current candle a change day relative to A, B, or C? (Within +/- 1 can be counted, or exact)
      const isChangeDay = 
        cycleCountdown9 <= 1 || 
        cycleCountdown17 <= 1 || 
        cycleCountdown26 <= 1 ||
        cycleCountdown33 <= 1 ||
        cycleCountdown42 <= 1 ||
        cycleCountdown52 <= 1 ||
        cycleCountdown65 <= 1 ||
        cycleCountdown76 <= 1;
        
      if (isChangeDay) {
        isGoldenEntry = true;
        takeProfitSignal = true; // Signals confluence high-priority alert
      }
    }
  }

  // 1. Span B Flattening & Magnet Calculations
  const getSpanBAtIndex = (idx: number) => {
    const lookbackIndex = idx - 26;
    if (lookbackIndex < 0) return null;
    const start = Math.max(0, lookbackIndex - 52 + 1);
    let h = -Infinity;
    let l = Infinity;
    let count = 0;
    for (let i = start; i <= lookbackIndex; i++) {
      if (!candles[i] || candles[i].close === null) continue;
      h = Math.max(h, candles[i].high);
      l = Math.min(l, candles[i].low);
      count++;
    }
    return (h === -Infinity || count < 1) ? null : (h + l) / 2;
  };

  let spanBFlattening = false;
  let spanBMagnet = false;
  
  const spanBValues: number[] = [];
  for (let offset = 0; offset < 9; offset++) {
    const val = getSpanBAtIndex(lastIdx - offset);
    if (val !== null) {
      spanBValues.push(val);
    }
  }
  
  if (spanBValues.length >= 5) {
    const firstVal = spanBValues[0];
    const flatTolerance = firstVal * 0.00015; // 0.015% very tight variance
    const isFlat = spanBValues.every(v => Math.abs(v - firstVal) <= flatTolerance);
    
    if (isFlat) {
      spanBFlattening = true;
      const currentPrice = candles[lastIdx].close;
      const percentDist = Math.abs(currentPrice - firstVal) / firstVal;
      
      let magnetDeviation = 0.012; // 1.2% base
      if (symbol) {
        const s = symbol.toUpperCase();
        if (s.includes('EUR') || s.includes('GBP') || s.includes('JPY') || s.includes('DXY')) {
          magnetDeviation = 0.0025; // tight for forex
        } else if (s.includes('BTC') || s.includes('ETH')) {
          magnetDeviation = 0.022; // higher for BTC
        } else if (s.includes('GOLD') || s.includes('XAU')) {
          magnetDeviation = 0.007; // 0.7% for gold
        }
      }
      
      if (percentDist >= magnetDeviation) {
        spanBMagnet = true;
      }
    }
  }

  // 2. Future Predictive Pivots for next candle
  const getPredictedLine = (len: number) => {
    const currentClose = candles[lastIdx].close;
    const startIdx = Math.max(0, lastIdx - len + 2); // Slide window by 1 period forward
    let h = currentClose;
    let l = currentClose;
    for (let i = startIdx; i <= lastIdx; i++) {
      if (!candles[i]) continue;
      h = Math.max(h, candles[i].high);
      l = Math.min(l, candles[i].low);
    }
    return (h + l) / 2;
  };
  
  const predictedTenkan = getPredictedLine(9);
  const predictedKijun = getPredictedLine(26);

  // 3. Dynamic Chikou Bullish / Bearish validations
  let chikouBullish = false;
  if (lastIdx >= 26) {
    const currentPrice = candles[lastIdx].close;
    const histPrice = candles[lastIdx - 26].close;
    
    const cloudHistIndex = lastIdx - 52;
    let hSA = null;
    let hSB = null;
    
    if (cloudHistIndex >= 0) {
      const v = getHighLowAt(9, cloudHistIndex);
      const k = getHighLowAt(26, cloudHistIndex);
      const s = getHighLowAt(52, cloudHistIndex);
      
      if (v.h && k.h) hSA = ((v.h + v.l!) / 2 + (k.h + k.l!) / 2) / 2;
      if (s.h) hSB = (s.h + s.l!) / 2;
    }
    
    if (histPrice !== null) {
      const topLimit = (hSA !== null && hSB !== null) ? Math.max(hSA, hSB) : -Infinity;
      chikouBullish = (currentPrice > histPrice) && (topLimit === -Infinity || currentPrice > topLimit);
    }
  }

  // 4. Wave Symmetry Ratio (AB duration vs BC duration)
  let waveSymmetry = 1;
  if (pivotA_idx !== -1 && pivotB_idx !== -1 && pivotC_idx !== -1) {
    const t1 = pivotB_idx - pivotA_idx;
    const t2 = cIdx - pivotB_idx;
    if (t1 > 0 && t2 > 0) {
      waveSymmetry = parseFloat((Math.min(t1, t2) / Math.max(t1, t2)).toFixed(2));
    }
  }

  // 5. Volume Validation breakout check
  let volumeValidation: 'STRONG' | 'NEUTRAL' | 'WEAK' = 'NEUTRAL';
  const volWindow = candles.slice(-20);
  if (volWindow.length >= 10) {
    const avgVolume = volWindow.reduce((sum, c) => sum + (c.volume || 0), 0) / volWindow.length;
    const currentVol = candles[lastIdx].volume || 0;
    if (currentVol > avgVolume * 1.4) {
      volumeValidation = 'STRONG';
    } else if (currentVol < avgVolume * 0.6) {
      volumeValidation = 'WEAK';
    }
  }

  // 6. Dynamic Kijun Angle
  const lastIchi = calculateIchimoku(candles, lastIdx);
  const kijunAngle = lastIchi.angles?.kijun || 0;

  return { 
    v: isFinite(v!) ? v : null, 
    n: isFinite(n!) ? n : null, 
    e: isFinite(e!) ? e : null, 
    nt: isFinite(nt!) ? nt : null,
    pIndex: isPWave ? 1 : 0, 
    yIndex: isYWave ? 1 : 0, 
    isPWave, 
    isYWave,
    spanBFlattening,
    spanBMagnet,
    predictedTenkan,
    predictedKijun,
    chikouBullish,
    currentWave,
    waveStatus,
    timeTarget: null,
    stopLoss,
    riskReward: null,
    volumeValidation,
    confidenceScale,
    waveSymmetry,
    kijunAngle,
    takeProfitSignal,
    isGoldenEntry,
    approachingTarget,
    candleCounter,
    cycleCountdown9,
    cycleCountdown17,
    cycleCountdown26,
    cycleCountdown33,
    cycleCountdown42,
    cycleCountdown52,
    cycleCountdown65,
    cycleCountdown76,
    cycleCountdown129,
    cycleCountdown172,
    pointZeros: pZeros,
    convergenceScore: Math.round(lastIchi.convergence || 0),
    pivotA_idx,
    pivotB_idx,
    pivotC_idx,
    equalizationTime,
    vTime,
    nTime,
    eTime,
    ntTime,
    sRangeLevels,
    waveType,
    tenkanFlatness,
    kijunFlatness,
    pointB: b_val,
    isB_Broken,
    trendDir: isUpTrend ? 'UP' : 'DOWN',
    swingFilterActive,
    swingConfirmation
  };
};


export const generateWaveTargets = (candles: Candle[], symbol?: string): WaveTargets => {
  return calculateWaveTargets(candles, symbol);
};
