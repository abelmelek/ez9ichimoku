/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IchimokuData {
  tenkan: number | null;
  kijun: number | null;
  spanA: number | null;
  spanB: number | null;
  chikou: number | null;
  chikouSpan: number | null;
  masterIndex: number | null;
  equilibrium?: number | null;
  deviation?: number | null;
  convergence?: number;
  angles?: {
    tenkan: number;
    kijun: number;
    spanA: number;
    spanB: number;
    chikou: number;
  };
  divergence?: number;
}

export interface WaveTargets {
  v: number | null;
  n: number | null;
  e: number | null;
  nt: number | null;
  pIndex: number;
  yIndex: number;
  isPWave?: boolean;
  isYWave?: boolean;
  spanBFlattening?: boolean;
  spanBMagnet?: boolean;
  predictedTenkan?: number | null;
  predictedKijun?: number | null;
  chikouBullish?: boolean;
  currentWave: number;
  waveStatus: string;
  timeTarget: number | null;
  stopLoss: number | null;
  riskReward: number | null;
  volumeValidation: 'STRONG' | 'WEAK' | 'NEUTRAL';
  confidenceScale: number;
  waveSymmetry: number; 
  kijunAngle: number;    
  takeProfitSignal: boolean;
  candleCounter: number;
  cycleCountdown9: number;
  cycleCountdown17: number;
  cycleCountdown26: number;
  cycleCountdown33: number;
  cycleCountdown42: number;
  cycleCountdown52: number;
  cycleCountdown65: number;
  cycleCountdown76: number;
  cycleCountdown129: number;
  cycleCountdown172: number;
  pointZeros: { price: number; type: 'RES' | 'SUP'; touches: number }[];
  convergenceScore: number;
  approachingTarget?: string;
  isGoldenEntry?: boolean;
  magnetEffect?: boolean;
  tenkanFlatness?: number;
  kijunFlatness?: number;
  pivotA_idx?: number;
  pivotB_idx?: number;
  pivotC_idx?: number;
  equalizationTime?: number | null;
  vTime?: number | null;
  nTime?: number | null;
  eTime?: number | null;
  ntTime?: number | null;
  sRangeLevels?: number[];
  waveType?: 'I' | 'V' | 'N' | 'P' | 'Y' | 'NONE';
  pointB?: number | null;
  isB_Broken?: boolean;
  trendDir?: 'UP' | 'DOWN';
  swingFilterActive?: boolean;
  swingConfirmation?: string;
}

export interface IndexWeights {
  tenkan: number;
  kijun: number;
  spanA: number;
  spanB: number;
  chikou: number;
  total: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  timestamp: string;
  createdAt?: number; // Epoch time in ms for auto-expiration check
  isRead: boolean;
  category: 'SIGNAL' | 'SYSTEM' | 'PRICE';
  asset?: string;
}
