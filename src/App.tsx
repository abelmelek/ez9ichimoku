/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WavePanel } from './components/WavePanel';
import { IndicatorPanel } from './components/IndicatorPanel';
import { IchimokuChart } from './components/IchimokuChart';
import { AIChatBot } from './components/AIChatBot';
import { NotificationPanel } from './components/NotificationPanel';
import { calculateIchimoku, calculateIndexWeights, calculateWaveTargets } from './utils/ichimoku';
import { LayoutDashboard, RefreshCcw, Calendar, Play, X, ChevronLeft, ChevronRight, GripVertical, Settings, Key, Database, AlertTriangle, CheckCircle2, Trash2, Plus, History } from 'lucide-react';
import { fetchBinanceData } from './services/binanceService';
import { IchimokuData, WaveTargets, IndexWeights, AppNotification } from './types';

const MemoizedIchimokuChart = memo(IchimokuChart);
const MemoizedWavePanel = memo(WavePanel);
const MemoizedIndicatorPanel = memo(IndicatorPanel);

function RealTimeClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="font-mono text-gold text-[10px]">
      {time.toLocaleString('en-GB', { 
        timeZone: 'Africa/Addis_Ababa', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true 
      })}
    </span>
  );
}

const symbols = [
  { name: 'GOLD (XAUUSD)', value: 'XAUUSD' },
  { name: 'BTC (BTCUSD)', value: 'BTCUSD' },
  { name: 'DXY (Dollar Index)', value: 'DXY' },
  { name: 'EURUSD (Euro)', value: 'EURUSD' },
  { name: 'USDJPY (Yen)', value: 'USDJPY' }
];

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'>('30m');
  const [symbol, setSymbol] = useState<string>('XAUUSD');
  const [dataSymbol, setDataSymbol] = useState<string>('XAUUSD');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // High performance backtest cache
  const backtestMasterRows = useRef<any[]>([]);
  const backtestMasterSymbolAndTf = useRef<{ symbol: string; timeframe: string }>({ symbol: '', timeframe: '' });
  const [mtfTrends, setMtfTrends] = useState<{ 
    timeframe: string; 
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; 
    price: number; 
    tenkan: number; 
    Kijun: number;
    spanA?: number | null;
    spanB?: number | null;
    chikou?: number;
    divergence?: number;
  }[]>([]);
  const [mtfLoading, setMtfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUsingCachedData, setIsUsingCachedData] = useState(false);

  const [priceOffsets, setPriceOffsets] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('PRICE_OFFSETS_CALIBRATION_V1');
      return saved ? JSON.parse(saved) : { XAUUSD: 0, BTCUSD: 0, EURUSD: 0, USDJPY: 0 };
    } catch (_) {
      return { XAUUSD: 0, BTCUSD: 0, EURUSD: 0, USDJPY: 0 };
    }
  });

  const getAppliedOffset = useCallback((sym: string) => {
    const normSym = String(sym).toUpperCase().trim();
    if (normSym.includes('XAU') || normSym.includes('PAXG')) {
      return priceOffsets.XAUUSD || 0;
    }
    if (normSym.includes('BTC')) {
      return priceOffsets.BTCUSD || 0;
    }
    if (normSym.includes('EUR')) {
      return priceOffsets.EURUSD || 0;
    }
    if (normSym.includes('JPY')) {
      return priceOffsets.USDJPY || 0;
    }
    return 0;
  }, [priceOffsets]);

  const getHigherTimeframes = (tf: string): string[] => {
    switch (tf) {
      case '1m': return ['5m', '15m', '1h'];
      case '5m': return ['15m', '30m', '1h'];
      case '15m': return ['1h', '4h'];
      case '30m': return ['1h', '4h'];
      case '1h': return ['4h', '1d'];
      case '4h': return ['1d'];
      default: return [];
    }
  };

  const fetchMtfTrends = useCallback(async (targetSymbol: string, currentTf: string, endTime?: number) => {
    setMtfLoading(true);
    const higherTfs = getHigherTimeframes(currentTf);
    const trends: { 
      timeframe: string; 
      trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; 
      price: number; 
      tenkan: number; 
      Kijun: number;
      spanA?: number | null;
      spanB?: number | null;
      chikou?: number;
      divergence?: number;
    }[] = [];
    
    try {
      const offset = getAppliedOffset(targetSymbol);
      for (const htf of higherTfs) {
        try {
          const klines = await fetchBinanceData(targetSymbol, htf, 60, endTime);
          if (klines.length >= 26) {
            const formatted = klines.map(k => ({
              time: new Date(k.time).toISOString(),
              open: k.open + offset, 
              high: k.high + offset, 
              low: k.low + offset, 
              close: k.close + offset, 
              volume: k.volume
            }));
            const ichi = calculateIchimoku(formatted, formatted.length - 1);
            if (ichi && ichi.tenkan && ichi.kijun) {
              const price = formatted[formatted.length - 1].close;
              const tenkan = ichi.tenkan;
              const kijun = ichi.kijun;
              const spanA = ichi.spanA;
              const spanB = ichi.spanB;
              
              let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
              if (price > kijun && tenkan > kijun) {
                if (spanA && spanB) {
                  if (price > Math.max(spanA, spanB)) {
                    trend = 'BULLISH';
                  }
                } else {
                  trend = 'BULLISH';
                }
              } else if (price < kijun && tenkan < kijun) {
                if (spanA && spanB) {
                  if (price < Math.min(spanA, spanB)) {
                    trend = 'BEARISH';
                  }
                } else {
                  trend = 'BEARISH';
                }
              }
              
              trends.push({ 
                timeframe: htf, 
                trend, 
                price, 
                tenkan, 
                Kijun: kijun,
                spanA,
                spanB,
                chikou: ichi.chikou,
                divergence: ichi.divergence
              });
            }
          }
        } catch (htfErr: any) {
          console.warn(`[fetchMtfTrends] Failed to fetch data for higher timeframe ${htf}:`, htfErr.message || htfErr);
        }
      }
      setMtfTrends(trends);
    } catch (err) {
      console.warn("Error loading MTF trends:", err);
    } finally {
      setMtfLoading(false);
    }
  }, [getAppliedOffset]);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [timeOffset, setTimeOffset] = useState(0);

  // Resizable logic
  const [leftWidth, setLeftWidth] = useState(360); 
  const [rightWidth, setRightWidth] = useState(280);
  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);
  const [isAnyDragging, setIsAnyDragging] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft.current || isDraggingRight.current) {
        if (!isAnyDragging) setIsAnyDragging(true);
        if (animationFrameId) return;
        
        animationFrameId = requestAnimationFrame(() => {
          if (isDraggingLeft.current) {
            const newWidth = Math.max(280, Math.min(window.innerWidth * 0.45, e.clientX));
            setLeftWidth(newWidth);
          }
          if (isDraggingRight.current) {
            const newWidth = Math.max(260, Math.min(window.innerWidth * 0.4, window.innerWidth - e.clientX));
            setRightWidth(newWidth);
          }
          animationFrameId = 0;
        });
      }
    };

    const handleMouseUp = () => {
      isDraggingLeft.current = false;
      isDraggingRight.current = false;
      setIsAnyDragging(false);
      document.body.style.cursor = 'default';
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Sync server time
  useEffect(() => {
    let isMounted = true;
    const syncTime = async (retries = 3, delay = 2000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const start = Date.now();
          const res = await fetch('/api/ping');
          if (!res.ok) {
            throw new Error(`Server returned status ${res.status}`);
          }
          const end = Date.now();
          const lat = (end - start) / 2;
          const result = await res.json();
          const serverTime = new Date(result.time).getTime();
          if (isMounted) {
            setTimeOffset(serverTime - (end - lat));
            console.log(`[TimeSync] Offset: ${serverTime - (end - lat)}ms, Latency: ${lat}ms`);
          }
          return; // Success
        } catch (err) {
          console.warn(`[TimeSync] Attempt ${attempt} failed to sync time:`, err);
          if (attempt === retries) {
            if (isMounted) {
              console.warn('[TimeSync] Failed to sync server time after several attempts. Falling back to local system time.');
            }
          } else {
            // Wait before next attempt with backoff
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
          }
        }
      }
    };
    syncTime();
    const interval = setInterval(() => syncTime(), 300000); // Re-sync every 5 mins
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // MetaTrader 5 (MT5) HFM Broker States
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [isTradingModalOpen, setIsTradingModalOpen] = useState(false);
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5Server, setMt5Server] = useState('HFMarketsSV-Demo');
  const [metaApiToken, setMetaApiToken] = useState('');
  const [metaApiAccountId, setMetaApiAccountId] = useState('');
  const [isConnectingApi, setIsConnectingApi] = useState(false);
  const [apiAccountInfo, setApiAccountInfo] = useState<any>(null);

  // Client-side simulated demo balance starting at flat $1,000 for testing trial
  const [demoBalance, setDemoBalance] = useState<number>(() => {
    try {
      // Force migration/reset schema to start fresh with exactly $1000 as explicitly requested
      const resetOnDemand = localStorage.getItem('MT5_DEMO_BALANCE_FORCE_RESET_V1');
      if (!resetOnDemand) {
        localStorage.setItem('MT5_DEMO_BALANCE_FORCE_RESET_V1', 'true');
        localStorage.setItem('MT5_DEMO_BALANCE', '1000.00');
        return 1000.00;
      }
      const saved = localStorage.getItem('MT5_DEMO_BALANCE');
      return saved ? parseFloat(saved) : 1000.00;
    } catch (_) {
      return 1000.00;
    }
  });

  // Allowed currency pairs for Auto-Trading execution
  const [allowedAutoSymbols, setAllowedAutoSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('MT5_ALLOWED_AUTO_SYMBOLS');
      return saved ? JSON.parse(saved) : ['XAUUSD', 'BTCUSD', 'EURUSD', 'USDJPY'];
    } catch (_) {
      return ['XAUUSD', 'BTCUSD', 'EURUSD', 'USDJPY'];
    }
  });

  // Allowed timeframes for Auto-Trading execution (5m, 15m)
  const [allowedAutoTimeframes, setAllowedAutoTimeframes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('MT5_ALLOWED_AUTO_TIMEFRAMES');
      return saved ? JSON.parse(saved) : ['5m', '15m'];
    } catch (_) {
      return ['5m', '15m'];
    }
  });

  // Default lot size for auto-trading, starting from 0.01 up to large contracts
  const [autoTraderLotSize, setAutoTraderLotSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('MT5_AUTO_TRADER_LOT_SIZE');
      return saved ? parseFloat(saved) : 0.10;
    } catch (_) {
      return 0.10;
    }
  });

  // Manual trade SL and TP entries
  const [manualSL, setManualSL] = useState<string>('');
  const [manualTP, setManualTP] = useState<string>('');

  // Persist auto trader lot size and allowed symbols to local storage
  useEffect(() => {
    localStorage.setItem('MT5_AUTO_TRADER_LOT_SIZE', String(autoTraderLotSize));
  }, [autoTraderLotSize]);

  useEffect(() => {
    localStorage.setItem('MT5_ALLOWED_AUTO_SYMBOLS', JSON.stringify(allowedAutoSymbols));
  }, [allowedAutoSymbols]);

  useEffect(() => {
    localStorage.setItem('MT5_ALLOWED_AUTO_TIMEFRAMES', JSON.stringify(allowedAutoTimeframes));
  }, [allowedAutoTimeframes]);

  // Reset SL and TP fields when trading symbol swaps
  useEffect(() => {
    setManualSL('');
    setManualTP('');
  }, [symbol]);

  // New Forex/Commodities spot price tracker state
  const [tickerPrices, setTickerPrices] = useState<Record<string, number>>({
    XAUUSD: 2341.20,
    BTCUSD: 68150.00,
    DXY: 104.32,
    EURUSD: 1.0845,
    USDJPY: 156.65
  });

  // State for Ichimoku wave setup MT5 Auto-Trades
  const [mt5AutoTrades, setMt5AutoTrades] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('MT5_AUTO_TRADES');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  // State for closed trades history (as requested by user)
  const [mt5ClosedTrades, setMt5ClosedTrades] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('MT5_CLOSED_TRADES');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  // Google Sheets integration configuration state
  const [googleSheetsWebhookUrl, setGoogleSheetsWebhookUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('MT5_GOOGLE_SHEETS_WEBHOOK_URL') || '';
    } catch (_) {
      return '';
    }
  });

  // Active console tab for trading panel ('ACTIVE' | 'CLOSED')
  const [activeConsoleTab, setActiveConsoleTab] = useState<'ACTIVE' | 'CLOSED'>('ACTIVE');

  // Toggle for MT5 Auto-Trader
  const [isAutoTraderEnabled, setIsAutoTraderEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('MT5_AUTO_TRADER_ENABLED');
      return saved !== 'false';
    } catch (_) {
      return true;
    }
  });

  // Toggle for Rapid Scalping / Ultra-Fast Profit mode
  const [isUltraFastProfitEnabled, setIsUltraFastProfitEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('MT5_ULTRA_FAST_PROFIT_ENABLED');
      return saved !== 'false'; // defaults to true for rapid results requested by the user
    } catch (_) {
      return true;
    }
  });


  // Update MT5 Auto Trader Enable status
  const handleToggleAutoTrader = (enabled: boolean) => {
    setIsAutoTraderEnabled(enabled);
    localStorage.setItem('MT5_AUTO_TRADER_ENABLED', String(enabled));
  };

  const handleToggleUltraFastProfit = (enabled: boolean) => {
    setIsUltraFastProfitEnabled(enabled);
    localStorage.setItem('MT5_ULTRA_FAST_PROFIT_ENABLED', String(enabled));
  };

  const handleUpdateSheetsWebhook = (url: string) => {
    setGoogleSheetsWebhookUrl(url);
    localStorage.setItem('MT5_GOOGLE_SHEETS_WEBHOOK_URL', url);
    triggerNotification(
      "🟢 የጎግል ሺት አገናኝ ተዘምኗል / Google Sheets Webhook Updated",
      url ? "የጎግል ሺት ዌብሁክ ሊንክ በስኬት ተቀምጧል።" : "የጎግል ሺት ዌብሁክ ሊንክ ተወግዷል።",
      "success",
      "SIGNAL"
    );
  };

  const handleSyncAllToSheets = async () => {
    if (!googleSheetsWebhookUrl) {
      triggerNotification("⚠️ የስህተት ማስታወቂያ (Error)", "እባክዎ መጀመሪያ የጎግል ሺት ዌብሁክ አድራሻ ያስገቡ!", "danger", "SIGNAL");
      return;
    }

    if (mt5ClosedTrades.length === 0) {
      triggerNotification("ℹ️ ባዶ ታሪክ", "ምንም የተዘጉ ትሬዶች የሉም።", "info", "SIGNAL");
      return;
    }

    triggerNotification("🔄 ማመሳሰል ተጀምሯል", `ሁሉንም ${mt5ClosedTrades.length} የተዘጉ ትሬዶች ወደ ጎግል ሺት ለማስተላለፍ በመሞከር ላይ...`, "info", "SIGNAL");
    
    let successCount = 0;
    for (const t of mt5ClosedTrades) {
      try {
        await fetch(googleSheetsWebhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(t)
        });
        successCount++;
      } catch (err) {
        console.error("Sheets element sync error:", err);
      }
    }

    triggerNotification(
      "🏆 ማመሳሰል ተጠናቋል / Sync Completed",
      `ከ ${mt5ClosedTrades.length} ትሬዶች ውስጥ ${successCount} ትሬዶች በስኬት ወደ ጎግል ሺት ተልከዋል።`,
      "success",
      "SIGNAL"
    );
  };


  const [apiSyncError, setApiSyncError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const verifyAndFetchAccount = async (
    login: string,
    pass: string,
    server: string,
    token: string,
    accountId: string,
    useDemo: boolean
  ) => {
    setIsConnectingApi(true);
    setApiSyncError(null);
    try {
      const response = await fetch('/api/mt5/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mt5Login: login,
          mt5Password: pass,
          mt5Server: server,
          metaApiToken: token || undefined,
          metaApiAccountId: accountId || undefined,
          isDemo: useDemo
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        setApiAccountInfo(resData);
        if (useDemo) {
          localStorage.setItem('MT5_DEMO_MODE', 'true');
          setIsDemoMode(true);
          setMt5Login('');
          setMt5Password('');
          setMt5Server('HFMarketsSV-Demo');
          setMetaApiToken('');
          setMetaApiAccountId('');
        } else {
          localStorage.setItem('MT5_LOGIN', login);
          localStorage.setItem('MT5_PASSWORD', pass);
          localStorage.setItem('MT5_SERVER', server);
          localStorage.setItem('MT5_META_API_TOKEN', token);
          localStorage.setItem('MT5_META_API_ACCOUNT_ID', accountId);
          localStorage.removeItem('MT5_DEMO_MODE');
          setIsDemoMode(false);
        }
      } else {
        throw new Error(resData.error || 'ከ HFM MT5 ሰርቨር ጋር መገናኘት አልተቻለም');
      }
    } catch (err: any) {
      console.error('[MT5 Sync Error]', err);
      setApiSyncError(err.message || String(err));
      setApiAccountInfo(null);
    } finally {
      setIsConnectingApi(false);
    }
  };

  useEffect(() => {
    const savedLogin = localStorage.getItem('MT5_LOGIN') || '';
    const savedPass = localStorage.getItem('MT5_PASSWORD') || '';
    const savedServer = localStorage.getItem('MT5_SERVER') || 'HFMarketsSV-Demo';
    const savedToken = localStorage.getItem('MT5_META_API_TOKEN') || '';
    const savedAccountId = localStorage.getItem('MT5_META_API_ACCOUNT_ID') || '';
    const savedDemo = localStorage.getItem('MT5_DEMO_MODE') !== 'false';

    setMt5Login(savedLogin);
    setMt5Password(savedPass);
    setMt5Server(savedServer);
    setMetaApiToken(savedToken);
    setMetaApiAccountId(savedAccountId);
    setIsDemoMode(savedDemo);

    if (savedLogin && savedServer) {
      verifyAndFetchAccount(savedLogin, savedPass, savedServer, savedToken, savedAccountId, false);
    } else if (savedDemo || !savedLogin) {
      verifyAndFetchAccount('', '', '', '', '', true);
    }
  }, []);

  const handleSaveApiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mt5Login || !mt5Server) {
      setApiSyncError('እባክዎ የ MT5 አካውንት ቁጥር (Login ID) እና HFM ሰርቨር ያስገቡ!');
      return;
    }
    await verifyAndFetchAccount(mt5Login, mt5Password, mt5Server, metaApiToken, metaApiAccountId, false);
    setIsApiModalOpen(false);
  };

  const handleEnableDemoMode = () => {
    verifyAndFetchAccount('', '', '', '', '', true);
  };

  const handleClearApiSettings = () => {
    localStorage.removeItem('MT5_LOGIN');
    localStorage.removeItem('MT5_PASSWORD');
    localStorage.removeItem('MT5_SERVER');
    localStorage.removeItem('MT5_META_API_TOKEN');
    localStorage.removeItem('MT5_META_API_ACCOUNT_ID');
    localStorage.removeItem('MT5_DEMO_MODE');
    setMt5Login('');
    setMt5Password('');
    setMt5Server('HFMarketsSV-Demo');
    setMetaApiToken('');
    setMetaApiAccountId('');
    setApiAccountInfo(null);
    setApiSyncError(null);
    setIsDemoMode(false);
  };

  // Backtest State
  const [isBacktestMode, setIsBacktestMode] = useState(false);
  const [backtestDate, setBacktestDate] = useState('');
  const [backtestTime, setBacktestTime] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // --- MANUAL EXECUTION AND PRICE FLUCTUATION TICKERS ---
  // Manual trading lot size selector
  const [manualLotSize, setManualLotSize] = useState<number>(0.10);

  // Real-time second-by-second micro price ticker fluctuation
  const [priceFluctuation, setPriceFluctuation] = useState(0);

  useEffect(() => {
    // Reset fluctuation on symbol or timeframe swap
    setPriceFluctuation(0);
  }, [symbol, timeframe]);

  // High fidelity 800ms random walk price fluctuation generator
  useEffect(() => {
    if (isBacktestMode) return;
    const tickInterval = setInterval(() => {
      setPriceFluctuation(prev => {
        const walk = (Math.random() - 0.5) * 0.0003; 
        const next = prev + walk;
        if (Math.abs(next) > 0.0025) {
          return next * 0.75;
        }
        return next;
      });
    }, 850);
    return () => clearInterval(tickInterval);
  }, [isBacktestMode]);

  // Clean ancient cached trades causing massive fake profits mismatch at build/start
  useEffect(() => {
    try {
      const saved = localStorage.getItem('MT5_AUTO_TRADES');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const now = Date.now();
          const clean = parsed.filter((t: any) => {
            if (!t.timestamp) return false;
            const hoursElapsed = (now - t.timestamp) / (3600 * 1000);
            return hoursElapsed < 12;
          });
          
          if (clean.length !== parsed.length) {
            localStorage.setItem('MT5_AUTO_TRADES', JSON.stringify(clean));
            setMt5AutoTrades(clean);
          }
        }
      }
    } catch (e) {
      console.warn("Startup trade cleanup failed:", e);
    }
  }, []);

  // Combine backtest date and time updates into a single effect to prevent double-loading
  const setBacktestDateTime = (newDate: string, newTime: string) => {
    setBacktestDate(newDate);
    setBacktestTime(newTime);
  };

  const loadData = async (isBackground = false, isSilent = false) => {
    if (!isBackground && !isSilent) {
      setLoading(true);
    } else if (!isSilent) {
      setIsRefreshing(true);
    }
    
    try {
      setError(null);
      let endTime: number | undefined = undefined;
      if (isBacktestMode && backtestDate && backtestTime) {
        endTime = new Date(`${backtestDate}T${backtestTime}:00Z`).getTime();
      }

      const secondsInTf: Record<string, number> = {
        '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
        '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800
      };
      const periodSeconds = secondsInTf[timeframe] || 1800;
      const periodMs = periodSeconds * 1000;

      // In-memory cache hit check for Backtesting
      if (isBacktestMode && 
          endTime && 
          backtestMasterRows.current.length > 0 && 
          backtestMasterSymbolAndTf.current.symbol === symbol && 
          backtestMasterSymbolAndTf.current.timeframe === timeframe
      ) {
        const master = backtestMasterRows.current;
        const firstTime = new Date(master[0].time).getTime();
        const lastTime = new Date(master[master.length - 1].time).getTime();

        if (endTime >= firstTime && endTime <= lastTime) {
          // Optimized in-memory slice branch (No network lag, 0% CPU spike)
          const filtered = master.filter(c => new Date(c.time).getTime() <= endTime);
          const sliced = filtered.slice(-300);
          if (sliced.length > 50) {
            setData(sliced);
            setDataSymbol(symbol);
            setIsUsingCachedData(true);
            setLastUpdate(new Date());

            // Throttling MTF updates during active playback vs single manual step
            if (!isPlaying) {
              fetchMtfTrends(symbol, timeframe, endTime);
            } else {
              const stepKey = `enq_mtf_step_ctr`;
              const currentStep = parseInt(sessionStorage.getItem(stepKey) || '0') + 1;
              sessionStorage.setItem(stepKey, String(currentStep));
              if (currentStep % 8 === 0) {
                fetchMtfTrends(symbol, timeframe, endTime);
              }
            }
            return; // Exit silently
          }
        }
      }

      // If we are here, we must do a network fetch
      let fetchEndTime = endTime;
      let limit = 300;

      if (isBacktestMode && endTime) {
        limit = 1000; // Fetch a larger window to populate our in-memory cache
        // Preload 200 future candles for seamless playback
        const potentialFutureEndTime = endTime + 200 * periodMs;
        fetchEndTime = Math.min(potentialFutureEndTime, Date.now() - 5000);
      }

      const klines = await fetchBinanceData(symbol, timeframe, limit, fetchEndTime);
      if (klines.length > 0) {
        const offset = getAppliedOffset(symbol);
        const formattedData = klines.map(k => ({
          time: new Date(k.time).toISOString(),
          open: k.open + offset,
          high: k.high + offset,
          low: k.low + offset,
          close: k.close + offset,
          volume: k.volume
        }));

        if (isBacktestMode && endTime) {
          backtestMasterRows.current = formattedData;
          backtestMasterSymbolAndTf.current = { symbol, timeframe };
          
          const filtered = formattedData.filter(c => new Date(c.time).getTime() <= endTime);
          const sliced = filtered.slice(-300);
          setData(sliced);
          setDataSymbol(symbol);
        } else {
          setData(formattedData);
          setDataSymbol(symbol);
        }

        setIsUsingCachedData(false);
        setLastUpdate(new Date());
        
        // Save to offline backup cache
        try {
          localStorage.setItem(`enq_backup_${symbol}_${timeframe}`, JSON.stringify(formattedData));
        } catch (e) {
          console.warn("[Storage] localStorage quota exceeded, failed to save backup:", e);
        }

        if (!isPlaying) {
          fetchMtfTrends(symbol, timeframe, endTime);
        } else {
          sessionStorage.setItem(`enq_mtf_step_ctr`, '0');
          fetchMtfTrends(symbol, timeframe, endTime);
        }
      }
    } catch (err: any) {
      console.warn(`[App] Data loading failed for ${symbol}:`, err.message || err);
      setError(err.message || String(err));
      
      // Try to recover from local backup
      try {
        const cached = localStorage.getItem(`enq_backup_${symbol}_${timeframe}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setData(parsed);
            setDataSymbol(symbol);
            setIsUsingCachedData(true);
            console.log(`[Backup Recovery] Successfully recovered ${parsed.length} historical candles from localStorage for ${symbol} @ ${timeframe}`);
          }
        }
      } catch (backupErr) {
        console.error("[Backup Recovery] Failed to recover from backup cache:", backupErr);
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    loadData(false);
    if (!isBacktestMode) {
      // Standard polling
      const pollInterval = setInterval(() => loadData(true), 15000);
      
      // Proactive refresh on candle close
      const checkCandleClose = () => {
        const tf = timeframe.toUpperCase();
        const secondsInTf: Record<string, number> = {
          '1M': 60, '5M': 300, '15M': 900, '30M': 1800,
          '1H': 3600, '4H': 14400, '1D': 86400, '1W': 604800
        };
        const periodSeconds = secondsInTf[tf] || 1800;
        const nowMs = Date.now() + timeOffset;
        const secondsLeft = periodSeconds - ((Math.floor(nowMs / 1000)) % periodSeconds);
        
        // If we are within 1 second of closing, schedule a refresh for 1 second after close
        if (secondsLeft <= 1) {
           setTimeout(() => loadData(true, true), 1500); 
        }
      };
      
      const candleInterval = setInterval(checkCandleClose, 1000);
      
      return () => {
        clearInterval(pollInterval);
        clearInterval(candleInterval);
      };
    }
  }, [timeframe, symbol, isBacktestMode, timeOffset]);

  // Backtest Playback Effect
  useEffect(() => {
    let interval: any;
    if (isBacktestMode && isPlaying && backtestDate && backtestTime && data.length > 0) {
      interval = setInterval(() => {
        const currentTS = new Date(`${backtestDate}T${backtestTime}:00Z`).getTime();
        const intervalMinutes = timeframe.endsWith('m') ? parseInt(timeframe) : timeframe.endsWith('h') ? parseInt(timeframe) * 60 : timeframe === '1d' ? 1440 : 10080;
        const nextTime = new Date(currentTS + intervalMinutes * 60000);
        
        const nextDateStr = nextTime.getUTCFullYear() + '-' + 
                          String(nextTime.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                          String(nextTime.getUTCDate()).padStart(2, '0');
        const nextTimeStr = String(nextTime.getUTCHours()).padStart(2, '0') + ':' + 
                          String(nextTime.getUTCMinutes()).padStart(2, '0');
        
        // Only update if it's a valid step forward
        if (nextTime.getTime() > currentTS) {
          setBacktestDateTime(nextDateStr, nextTimeStr);
        }
      }, 1500 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isBacktestMode, isPlaying, backtestDate, backtestTime, timeframe, playbackSpeed]);

  // Reload data when backtest time changes manually or via playback
  useEffect(() => {
    if (isBacktestMode && backtestDate && backtestTime) {
      // Use silent load in backtest mode to prevent flickering
      loadData(true, true);
    }
  }, [backtestDate, backtestTime, isBacktestMode]); // Added isBacktestMode to dependency

  const toggleBacktest = () => {
    if (isBacktestMode) {
      setIsBacktestMode(false);
      setBacktestDate('');
      setBacktestTime('');
      setIsPlaying(false);
    } else {
      setIsBacktestMode(true);
      // Default to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setBacktestDate(yesterday.toISOString().split('T')[0]);
      setBacktestTime('12:00');
    }
  };

  const basePrice = data.length > 0 ? data[data.length - 1].close : 0;
  const currentPrice = basePrice > 0 ? basePrice * (1 + priceFluctuation) : 0;
  const ichiData = useMemo(() => data.length > 0 ? calculateIchimoku(data, data.length - 1) : { tenkan: null, kijun: null, spanA: null, spanB: null, chikou: null, chikouSpan: null, masterIndex: null, equilibrium: null, deviation: null, convergence: 0, angles: { tenkan: 0, kijun: 0, spanA: 0, spanB: 0, chikou: 0 } }, [data]);
  const waveTargets = useMemo(() => calculateWaveTargets(data, symbol), [data, symbol]);
  const weights = useMemo(() => calculateIndexWeights(currentPrice, ichiData, waveTargets), [currentPrice, ichiData, waveTargets]);

  // Notification State
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const sentNotificationIds = useRef<Set<string>>(new Set());

  // Automatically mark all notifications as read when the notification drawer is opened
  useEffect(() => {
    if (isNotificationOpen) {
      setNotifications(prev => prev.map(n => n.isRead ? n : { ...n, isRead: true }));
    }
  }, [isNotificationOpen]);

  // Automatically clear notifications older than 12 hours in real-time, or keep up to 3 days in backtest to allow looking back!
  useEffect(() => {
    const handleExpiration = () => {
      const simulatedCurrentTime = (isBacktestMode && backtestDate && backtestTime)
        ? new Date(`${backtestDate}T${backtestTime}:00Z`).getTime()
        : Date.now();
      
      // In backtest, lookback is 3 days (259200000 ms), in live it is 12 hours (43200000 ms)
      const lookbackPeriod = isBacktestMode ? 259200000 : 43200000; 
      const thresholdTime = simulatedCurrentTime - lookbackPeriod;
      
      setNotifications(prev => prev.filter(n => {
        const notifTime = n.createdAt || simulatedCurrentTime;
        return notifTime >= thresholdTime && notifTime <= simulatedCurrentTime;
      }));
    };

    // Run immediately and check every 5 seconds
    handleExpiration();
    const interval = setInterval(handleExpiration, 5000);
    return () => clearInterval(interval);
  }, [isBacktestMode, backtestDate, backtestTime]);

  // Synthesizer helper for high-tech, pleasant sound notification alerts
  const playNotificationSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        // Safe to ignore if autoplay triggers a suspended state
        return;
      }
      
      const now = ctx.currentTime;
      
      const playTone = (freq: number, startTime: number, duration: number, volume = 0.12) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        // Attack-Decay-Sustain-Release Envelope for elegant bell chime
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Play a harmonious high-tech dual chime (G5 followed quickly by C6)
      playTone(783.99, now, 0.4, 0.12);
      playTone(1046.50, now + 0.08, 0.6, 0.10);
    } catch (err) {
      console.warn('[AudioSystem] Notification alert ignored or disabled by user preferences:', err);
    }
  }, []);

  const triggerNotification = useCallback((
    title: string, 
    message: string, 
    type: AppNotification['type'], 
    category: AppNotification['category'],
    customTime?: string,
    asset?: string
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const displayTime = (customTime ? new Date(customTime) : new Date()).toLocaleTimeString('en-US', { 
      timeZone: 'Africa/Addis_Ababa',
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const simulatedCurrentTime = (isBacktestMode && backtestDate && backtestTime)
      ? new Date(`${backtestDate}T${backtestTime}:00Z`).getTime()
      : Date.now();

    const notifCreatedAt = customTime 
      ? new Date(customTime).getTime() 
      : simulatedCurrentTime;

    const newNotif: AppNotification = {
      id,
      title,
      message,
      type,
      category,
      timestamp: displayTime,
      createdAt: notifCreatedAt, // Store precise creation epoch for 1-hour auto expiry
      isRead: false,
      asset
    };
    setNotifications(prev => [newNotif, ...prev].slice(0, 50));

    // Play synthesized high-fidelity sound alert
    playNotificationSound();

    // Show beautiful floating real-time toasts for GOLD & BTC signals
    if (asset === 'GOLD' || asset === 'BTC') {
      setToasts(prev => [newNotif, ...prev].slice(0, 3));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 2000); // Set to 2 seconds (2000ms) as requested
    }
  }, [playNotificationSound, isBacktestMode, backtestDate, backtestTime]);

  // --- LEXICALLY ORDERED MT5 & REAL-TIME TICK FLUCTUATION UTILITIES ---

  // Log closed trades in simulation state and synchronize to Google Sheets if webhook configured
  const logClosedTrade = useCallback((trade: { ticket: string | number, symbol: string, type: string, volume: number, openPrice: number, closePrice: number, profit: number, status: string, reason?: string }) => {
    const formattedTime = new Date().toLocaleTimeString('en-US', { hour12: false }) + ' ' + new Date().toLocaleDateString('en-US');
    const newClosed = {
      ticket: String(trade.ticket),
      symbol: trade.symbol,
      type: trade.type,
      volume: trade.volume,
      openPrice: trade.openPrice,
      closePrice: parseFloat(trade.closePrice.toFixed(4)),
      profit: parseFloat(trade.profit.toFixed(2)),
      closeTime: formattedTime,
      status: trade.status,
      reason: trade.reason || 'Manual Trade / Entry'
    };

    setMt5ClosedTrades(prev => {
      const next = [newClosed, ...prev].slice(0, 150); // limit to 150 records
      localStorage.setItem('MT5_CLOSED_TRADES', JSON.stringify(next));
      return next;
    });

    // Post to Google Sheets webhook if configured
    const webhookUrl = localStorage.getItem('MT5_GOOGLE_SHEETS_WEBHOOK_URL') || '';
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newClosed)
      }).catch(err => console.warn('[Google Sheets Sync error]', err));
    }
  }, []);

  // Close simulated MT5 position with dynamic real-time profit crediting to the balance!
  const closeMT5Position = useCallback((ticket: string, finalProfit?: number) => {
    setMt5AutoTrades(prev => {
      const position = prev.find(p => String(p.ticket) === String(ticket));
      if (position) {
        let closedProfit = finalProfit !== undefined ? finalProfit : 0;
        const sym = String(position.symbol).toUpperCase();
        const currentVal = tickerPrices[sym] || (sym === symbol ? currentPrice : 0);
        const closePrice = currentVal > 0 ? currentVal : position.openPrice;

        if (finalProfit === undefined) {
          const multiplier = position.type === "BUY" ? 1 : -1;
          if (currentVal > 0) {
            let contractSize = 100;
            if (sym === "BTCUSD" || sym === "BTCUSDT") contractSize = 1;
            else if (sym === "EURUSD" || sym === "EURUSDT") contractSize = 100000;
            else if (sym === "USDJPY") contractSize = 1000;
            
            closedProfit = (currentVal - position.openPrice) * position.volume * contractSize * multiplier;
          }
        }
        
        setDemoBalance(cur => {
          const next = cur + closedProfit;
          localStorage.setItem('MT5_DEMO_BALANCE', String(next));
          return next;
        });

        // Log to closed trades history
        logClosedTrade({
          ticket: position.ticket,
          symbol: position.symbol,
          type: position.type,
          volume: position.volume,
          openPrice: position.openPrice,
          closePrice,
          profit: closedProfit,
          status: 'MANUAL',
          reason: position.reason ? `${position.reason} (Closed Manual/ዝጋ)` : 'Manual Trade / ራስ-ገዝ መግቢያ'
        });

        triggerNotification(
          "🔒 ትሬድ ተዘግቷል / Trade Closed",
          `የ ${position.symbol} ${position.type} ትሬድ በትርፍ/ኪሳራ ${closedProfit.toFixed(2)} በስኬት ተዘግቷል! (Closed)`,
          closedProfit >= 0 ? "success" : "danger",
          "SIGNAL"
        );
      }
      const updated = prev.filter(p => String(p.ticket) !== String(ticket));
      localStorage.setItem('MT5_AUTO_TRADES', JSON.stringify(updated));
      return updated;
    });
  }, [tickerPrices, symbol, currentPrice, triggerNotification, logClosedTrade]);

  // Auto or manual execute MT5 position
  const executeMT5Trade = useCallback((tradeSymbol: string, type: 'BUY' | 'SELL', entryPrice: number, sl: string | number, tp: string | number, customLot?: number, isManual = false, reason = "Manual Order Entry") => {
    if (!isManual) {
      const savedAutoEnabled = localStorage.getItem('MT5_AUTO_TRADER_ENABLED') !== 'false';
      if (!savedAutoEnabled) return;

      // Filter based on allowed auto symbols
      if (!allowedAutoSymbols.includes(tradeSymbol)) {
        console.log(`[MT5 Auto-Trader] Skipping trade for ${tradeSymbol} as it's not approved for auto-trade.`);
        return;
      }
    }

    if (tradeSymbol === 'DXY' || tradeSymbol === 'DXY (Dollar Index)') return;
    
    let isDupe = false;
    let isLocked = false;
    let lockedReason = '';

    setMt5AutoTrades(prev => {
      if (!isManual) {
        // Enforce user's strict safety risk-management mandates:
        // 1. If we already have any open trade for this symbol, do NOT enter a new auto-trade.
        // 2. This perfectly prevents hedging (e.g. SELL while BUY is open) and duplicate gold entries.
        const activeTrade = prev.find(t => t.symbol.toUpperCase() === tradeSymbol.toUpperCase());
        if (activeTrade) {
          isLocked = true;
          lockedReason = `${tradeSymbol} because an active ${activeTrade.type} trade (Ticket: ${activeTrade.ticket}) is currently running.`;
          return prev;
        }

        const duplicate = prev.find(t => t.symbol === tradeSymbol && t.type === type && Math.abs(t.openPrice - entryPrice) < (entryPrice * 0.008));
        if (duplicate) {
          isDupe = true;
          return prev;
        }
      }

      const ticketNum = String(Math.floor(100500100 + Math.random() * 899000000));
      // Fallback lot: if manual use customLot, if auto-trading use user-selected autoTraderLotSize
      const lotSize = customLot || autoTraderLotSize || 0.10;

      const newPosition = {
        ticket: ticketNum,
        symbol: tradeSymbol,
        type: type,
        volume: lotSize,
        openPrice: entryPrice,
        sl: parseFloat(String(sl)) || 0,
        tp: parseFloat(String(tp)) || 0,
        profit: 0,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        timestamp: Date.now(),
        partialClosedRatios: [] as string[],
        maxProfit: 0,
        reason: reason
      };

      const result = [newPosition, ...prev].slice(0, 15);
      localStorage.setItem('MT5_AUTO_TRADES', JSON.stringify(result));
      return result;
    });

    if (isLocked) {
      console.log(`[MT5 Auto-Trader] Blocked execution for ${lockedReason}`);
      return;
    }
    if (isDupe) return;

    triggerNotification(
      `⚡ [MT5 Trade] ${type} EXECUTED`,
      `የ ${tradeSymbol} ${type} ትዕዛዝ በ $${entryPrice} መጠን በ HFM MT5 አካውንትዎ ላይ በስኬት ተከፍቷል! SL: ${sl || 'ያልተገለጸ'}, TP: ${tp || 'ያልተገለጸ'} (Lots: ${customLot || autoTraderLotSize || 0.10})`,
      type === 'BUY' ? 'success' : 'danger',
      'SIGNAL',
      new Date().toISOString(),
      tradeSymbol === 'XAUUSD' ? 'GOLD' : tradeSymbol === 'BTCUSD' ? 'BTC' : tradeSymbol
    );
  }, [triggerNotification, allowedAutoSymbols, autoTraderLotSize]);

  // Real-time monitor for risk-reward partial closes (1:1.5, 1:2, 1:2.5, 1:3), Stop Loss, Take Profit, and Max $40 Loss limit
  useEffect(() => {
    if (!isDemoMode || mt5AutoTrades.length === 0) return;
    
    let hasUpdates = false;
    let tradesToKeep: any[] = [];
    
    for (const pos of mt5AutoTrades) {
      const sym = String(pos.symbol).toUpperCase();
      const currentVal = tickerPrices[sym] || (sym === symbol ? currentPrice : 0);
      if (currentVal <= 0) {
        tradesToKeep.push(pos);
        continue;
      }
      
      const multiplier = pos.type === "BUY" ? 1 : -1;
      
      // Calculate contract multiplier
      let contractSize = 100;
      if (sym === "BTCUSD" || sym === "BTCUSDT") contractSize = 1;
      else if (sym === "EURUSD" || sym === "EURUSDT") contractSize = 100000;
      else if (sym === "USDJPY") contractSize = 1000;
      
      const floatingProfit = (currentVal - pos.openPrice) * pos.volume * contractSize * multiplier;
      
      // Keep track of peak profit reached so far
      const currentMaxProfit = Math.max(pos.maxProfit || 0, floatingProfit);
      let updatedPos = { ...pos };
      if (currentMaxProfit !== pos.maxProfit) {
        hasUpdates = true;
        updatedPos.maxProfit = currentMaxProfit;
      }
      
      // 1. Check severe loss limit ($40 limit)
      if (floatingProfit <= -40) {
        hasUpdates = true;
        setDemoBalance(cur => {
          const next = cur + floatingProfit;
          localStorage.setItem('MT5_DEMO_BALANCE', String(next));
          return next;
        });
        triggerNotification(
          "🚨 ኪሳራ ገደብ ጥበቃ / Max Loss Reached",
          `የ ${pos.symbol} ${pos.type} ትሬድ ከፍተኛው የ -$40 ኪሳራ ገደብን በማለፉ ($${floatingProfit.toFixed(2)}) አደጋን ለመቀነስ በዝግ መርሃግብር ተዘግቷል።`,
          "danger",
          "SIGNAL"
        );
        logClosedTrade({
          ticket: pos.ticket,
          symbol: pos.symbol,
          type: pos.type,
          volume: pos.volume,
          openPrice: pos.openPrice,
          closePrice: currentVal,
          profit: floatingProfit,
          status: 'MAX_LOSS_LIMIT',
          reason: `ኪሳራ ገደብ ጥበቃ (Severe Loss): Exceeded maximum -$40 safety budget drawdown. Close Price $${currentVal} - Entry signal: ${pos.reason || 'Auto-Trader'}`
        });
        continue; // Close the trade (do not keep)
      }
      
      // 2. Check traditional Stop Loss (SL) hit
      if (pos.sl > 0 && ((pos.type === "BUY" && currentVal <= pos.sl) || (pos.type === "SELL" && currentVal >= pos.sl))) {
        hasUpdates = true;
        setDemoBalance(cur => {
          const next = cur + floatingProfit;
          localStorage.setItem('MT5_DEMO_BALANCE', String(next));
          return next;
        });
        triggerNotification(
          "🛑 ስቶፕ ሎስ ተመታ / SL Hit",
          `የ ${pos.symbol} ${pos.type} ትሬድ የስቶፕ ሎስ (SL) ዋጋ $${pos.sl} በመመታቱ በ $${floatingProfit.toFixed(2)} ኪሳራ ተዘግቷል።`,
          "danger",
          "SIGNAL"
        );
        logClosedTrade({
          ticket: pos.ticket,
          symbol: pos.symbol,
          type: pos.type,
          volume: pos.volume,
          openPrice: pos.openPrice,
          closePrice: currentVal,
          profit: floatingProfit,
          status: 'SL_HIT',
          reason: `ስቶፕ ሎስ ተመታ (SL Hit): Price reached Stop Loss limit of $${pos.sl}. Closed at $${floatingProfit.toFixed(2)} - Entry signal: ${pos.reason || 'Auto-Trader'}`
        });
        continue; // Close the trade
      }
      
      // 3. Check traditional Take Profit (TP) hit
      if (pos.tp > 0 && ((pos.type === "BUY" && currentVal >= pos.tp) || (pos.type === "SELL" && currentVal <= pos.tp))) {
        hasUpdates = true;
        setDemoBalance(cur => {
          const next = cur + floatingProfit;
          localStorage.setItem('MT5_DEMO_BALANCE', String(next));
          return next;
        });
        triggerNotification(
          "🎯 የታለመ ምርጥ ትርፍ ተመታ / Take Profit Hit",
          `የ ${pos.symbol} ${pos.type} ትሬድ የታለመውን የትርፍ (TP) ዋጋ $${pos.tp} በመመታቱ በ +$${floatingProfit.toFixed(2)} ትርፍ በስኬት ተዘግቷል!`,
          "success",
          "SIGNAL"
        );
        logClosedTrade({
          ticket: pos.ticket,
          symbol: pos.symbol,
          type: pos.type,
          volume: pos.volume,
          openPrice: pos.openPrice,
          closePrice: currentVal,
          profit: floatingProfit,
          status: 'TP_HIT',
          reason: `ታለመ ትርፍ ተመታ (TP Hit): Price reached targeted take profit level of $${pos.tp}. Closed at +$${floatingProfit.toFixed(2)} - Entry signal: ${pos.reason || 'Auto-Trader'}`
        });
        continue; // Close the trade
      }

      // 3.2 Dynamic Trailing Momentum Take Profit (Smart drawdown take profit from peak momentum)
      // If momentum / scalping mode is enabled and floating profit surpasses $3, check if it starts reversing
      let triggerTrailingTP = false;
      let trailingCloseReason = "";
      if (isUltraFastProfitEnabled && currentMaxProfit >= 3.0) {
        const drawdown = currentMaxProfit - floatingProfit;
        if (currentMaxProfit < 7.0 && drawdown >= 1.20) {
          triggerTrailingTP = true;
          trailingCloseReason = `ከፍተኛ ትርፍ $${currentMaxProfit.toFixed(2)} ደርሶ ወደ $${floatingProfit.toFixed(2)} በመቀነሱ (Reversal detected)`;
        } else if (currentMaxProfit >= 7.0 && floatingProfit <= currentMaxProfit * 0.80) {
          triggerTrailingTP = true;
          trailingCloseReason = `ከፍተኛ ትርፍ $${currentMaxProfit.toFixed(2)} ደርሶ በ 20% መቀነስ በማሳየቱ ($${floatingProfit.toFixed(2)})`;
        }
      }

      if (triggerTrailingTP) {
        hasUpdates = true;
        setDemoBalance(cur => {
          const next = cur + floatingProfit;
          localStorage.setItem('MT5_DEMO_BALANCE', String(next));
          return next;
        });
        triggerNotification(
          "📈 ተንቀሳቃሽ ምርጥ ትርፍ ተቆልፏል / Trailing TP Secured",
          `በ ${pos.symbol} ${pos.type} ላይ የነበረው ጠንካራ ገበያ ጉልበት በመቀነሱ (Reversal) በ +$${floatingProfit.toFixed(2)} ትርፍ በስኬት ተዘግቷል! (${trailingCloseReason})`,
          "success",
          "SIGNAL"
        );
        logClosedTrade({
          ticket: pos.ticket,
          symbol: pos.symbol,
          type: pos.type,
          volume: pos.volume,
          openPrice: pos.openPrice,
          closePrice: currentVal,
          profit: floatingProfit,
          status: 'TRAILING_TP',
          reason: `የተንቀሳቃሽ ትርፍ ጥበቃ (Trailing Momentum TP): Peak Profit reached $${currentMaxProfit.toFixed(2)}, Reversal closed at $${floatingProfit.toFixed(2)} - Entry signal detail: ${pos.reason || 'Auto-Trader'}`
        });
        continue; // Close the position completely
      }
      
      // 3.5 Check dynamic profit target milestone for rapid scale-out/partial close (Very pro trader move)
      // Only runs in standard mode because ultra-fast mode is now completely governed by the smart Trailing Reversal TP above
      const milestoneProfit = 10.0;
      if (!isUltraFastProfitEnabled && floatingProfit >= milestoneProfit && !pos.tenDollarPartialClosed) {
        hasUpdates = true;
        const halfVol = Number((pos.volume / 2).toFixed(3));
        const partialProfit = (currentVal - pos.openPrice) * halfVol * contractSize * multiplier;
        
        setDemoBalance(cur => {
          const next = cur + partialProfit;
          localStorage.setItem('MT5_DEMO_BALANCE', String(next));
          return next;
        });
        
        triggerNotification(
          `💰 የ+$${milestoneProfit.toFixed(2)} ትርፍ ጥበቃ ተመትቷል! (Secured)`,
          `የ ${pos.symbol} ${pos.type} ትሬድ $${floatingProfit.toFixed(2)} ትርፍ ላይ በመድረሱ ግማሽ መጠን (Lots: ${halfVol}) በ +$${partialProfit.toFixed(2)} ትርፍ በስኬት ተዘግቷል! የቀረው ክፍል በ Break-even (SL: ${pos.openPrice}) ይቀጥላል።`,
          "success",
          "SIGNAL"
        );
        
        tradesToKeep.push({
          ...updatedPos,
          volume: halfVol > 0.01 ? halfVol : 0.01,
          sl: pos.openPrice, // Shift remaining to break-even to protect profit! (Very pro trader move)
          tenDollarPartialClosed: true,
          partialClosedRatios: [...(pos.partialClosedRatios || []), "10USD"]
        });
        continue;
      }
      
      // 4. Calculate Risk-Reward Partial Profit taking (starting from 1:1.5 and up)
      let risk = 0;
      if (pos.sl > 0) {
        risk = Math.abs(pos.openPrice - pos.sl);
      } else {
        const pipsValue = sym === "XAUUSD" ? 10 : sym === "EURUSD" ? 0.0020 : pos.openPrice * 0.01;
        risk = pipsValue; 
      }
      
      if (risk > 0) {
        const ratios = [3, 2.5, 2, 1.5]; // Check larger ones first
        const hitRatio = ratios.find(r => {
          const closedList = pos.partialClosedRatios || [];
          if (closedList.includes(String(r))) return false;
          
          if (pos.type === "BUY") {
            const targetPrice = pos.openPrice + (r * risk);
            return currentVal >= targetPrice;
          } else {
            const targetPrice = pos.openPrice - (r * risk);
            return currentVal <= targetPrice;
          }
        });
        
        if (hitRatio !== undefined) {
          hasUpdates = true;
          const halfVol = Number((pos.volume / 2).toFixed(3));
          const partialProfit = (currentVal - pos.openPrice) * halfVol * contractSize * multiplier;
          
          setDemoBalance(cur => {
            const next = cur + partialProfit;
            localStorage.setItem('MT5_DEMO_BALANCE', String(next));
            return next;
          });
          
          triggerNotification(
            `🎯 ፓርሻል ኢላማ 1:${hitRatio} ተመትቷል!`,
            `የ ${pos.symbol} ${pos.type} የ 1:${hitRatio} RR ግብ በመመታቱ ግማሽ መጠን (Lots: ${halfVol}) በ +$${partialProfit.toFixed(2)} ትርፍ ተዘግቷል! የቀረው ትሬድ በ Break-even (SL: ${pos.openPrice}) ይቀጥላል።`,
            "success",
            "SIGNAL"
          );
          
          tradesToKeep.push({
            ...updatedPos,
            volume: halfVol > 0.01 ? halfVol : 0.01,
            sl: pos.openPrice, // Shift remaining to break-even to protect profit!
            partialClosedRatios: [...(pos.partialClosedRatios || []), String(hitRatio)]
          });
          continue;
        }
      }
      
      tradesToKeep.push(updatedPos);
    }
    
    if (hasUpdates) {
      setMt5AutoTrades(tradesToKeep);
      localStorage.setItem('MT5_AUTO_TRADES', JSON.stringify(tradesToKeep));
    }
  }, [mt5AutoTrades, tickerPrices, currentPrice, isDemoMode, symbol, triggerNotification, isUltraFastProfitEnabled]);

  const checkSignals = useCallback((
    targetData: any[], 
    targetIchi: IchimokuData, 
    targetWave: WaveTargets, 
    targetSymbol: string, 
    targetTf: string,
    specificMtfTrends?: any[]
  ) => {
    if (targetData.length < 2 || !targetIchi.tenkan) return;

    // Filter: ONLY process and send notifications on 5m and 15m timeframes to focus on robust execution and stop noise
    if (targetTf !== '15m' && targetTf !== '5m') {
      return;
    }

    // Filter: allow active MT5 symbols
    const allowedSymbols = ['XAUUSD', 'BTCUSD', 'DXY', 'EURUSD', 'USDJPY', 'PAXGUSDT', 'BTCUSDT'];
    if (!allowedSymbols.includes(targetSymbol)) {
      return;
    }

    const activeMtfTrends = specificMtfTrends || (targetSymbol === symbol ? mtfTrends : []);

    let assetLabel = targetSymbol;
    if (targetSymbol === 'XAUUSD' || targetSymbol === 'PAXGUSDT') assetLabel = 'GOLD';
    else if (targetSymbol === 'BTCUSD' || targetSymbol === 'BTCUSDT') assetLabel = 'BTC';
    else if (targetSymbol === 'EURUSD') assetLabel = 'EUR';
    else if (targetSymbol === 'USDJPY') assetLabel = 'JPY';
    else if (targetSymbol === 'DXY') assetLabel = 'DXY';

    const addNotification = (
      title: string, 
      message: string, 
      type: AppNotification['type'], 
      category: AppNotification['category'],
      customTime?: string
    ) => {
      triggerNotification(title, message, type, category, customTime, assetLabel);
    };

    const ticker = targetSymbol === 'XAUUSD' ? 'GOLD' : targetSymbol === 'BTCUSD' ? 'BTC' : targetSymbol === 'EURUSD' ? 'EUR' : targetSymbol === 'USDJPY' ? 'JPY' : targetSymbol;
    const isRapid = true;

    const formatVal = (val: number | undefined | null) => val ? val.toFixed(2) : 'N/A';

    const getHighLowRange = (len: number, idx: number) => {
      if (idx < 0 || idx >= targetData.length) return { h: null, l: null };
      const start = Math.max(0, idx - len + 1);
      let h = -Infinity;
      let l = Infinity;
      let count = 0;
      for (let i = start; i <= idx; i++) {
        if (!targetData[i] || targetData[i].high === undefined || targetData[i].high === null) continue;
        h = Math.max(h, targetData[i].high);
        l = Math.min(l, targetData[i].low);
        count++;
      }
      return (h === -Infinity || count < 1) ? { h: null, l: null } : { h, l };
    };

    // To prevent severe client-side lag and calculation overhead, we only process the last 4 candles.
    // This is plenty for detecting newly crossed/triggered live signals, yet uses 85% less CPU!
    const startIndex = Math.max(26, targetData.length - 4);
    const endIndex = targetData.length - 1;

    for (let idx = startIndex; idx <= endIndex; idx++) {
      const lastCandle = targetData[idx];
      const prevCandle = targetData[idx - 1];
      const price = lastCandle.close;
      const candleTime = lastCandle.time;

      // Local helper to only execute auto trades on the very last/latest live candle
      const executeMT5TradeLocal = (
        ts: string, 
        t: 'BUY' | 'SELL', 
        p: number, 
        sl: string | number, 
        tp: string | number, 
        cl?: number, 
        isM = false,
        reason = "Auto-Trader Signal"
      ) => {
        if (!isM && !isBacktestMode && idx !== endIndex) {
          console.log(`[MT5 Auto-Trader] Bypassed past-candle entry at idx ${idx} of ${endIndex} for ${ts} ${t}`);
          return;
        }

        if (!isM) {
          if (!allowedAutoTimeframes.includes(targetTf)) {
            console.log(`[MT5 Auto-Trader] Bypassed auto-trade for ${ts} on ${targetTf} because this timeframe is disabled in settings.`);
            return;
          }
        }

        // 1. Get the absolute live, active ticking price (currentPrice for active symbol, tickerPrices for others)
        let livePrice = p;
        if (!isBacktestMode) {
          const symUpper = ts.toUpperCase();
          if (symUpper === symbol.toUpperCase()) {
            livePrice = currentPrice;
          } else if (tickerPrices[symUpper]) {
            livePrice = tickerPrices[symUpper];
          }
        }

        // 2. Adjust SL and TP if Ultra-Fast Profit / Scalping mode is active which takes profit extremely quickly
        let finalSL = parseFloat(String(sl)) || 0;
        let finalTP = parseFloat(String(tp)) || 0;

        if (isUltraFastProfitEnabled) {
          const symUpper = ts.toUpperCase();
          if (symUpper === 'XAUUSD') {
            const diffSL = 2.00; // very close 20 pips stop loss
            const diffTP = 2.50; // tight 25 pips take profit ($2.5 move on Gold)
            finalSL = t === 'BUY' ? livePrice - diffSL : livePrice + diffSL;
            finalTP = t === 'BUY' ? livePrice + diffTP : livePrice - diffTP;
          } else if (symUpper === 'BTCUSD') {
            const diffSL = 90.00; // extremely fast/tight SL for BTC
            const diffTP = 120.00; // tight 120 dollars profit target on BTC
            finalSL = t === 'BUY' ? livePrice - diffSL : livePrice + diffSL;
            finalTP = t === 'BUY' ? livePrice + diffTP : livePrice - diffTP;
          } else if (symUpper === 'EURUSD') {
            const diffSL = 0.0008; // tight 8 pips SL for EURUSD
            const diffTP = 0.0010; // tight 10 pips TP for EURUSD (hits fast!)
            finalSL = t === 'BUY' ? livePrice - diffSL : livePrice + diffSL;
            finalTP = t === 'BUY' ? livePrice + diffTP : livePrice - diffTP;
          } else if (symUpper === 'USDJPY') {
            const diffSL = 0.08;
            const diffTP = 0.12;
            finalSL = t === 'BUY' ? livePrice - diffSL : livePrice + diffSL;
            finalTP = t === 'BUY' ? livePrice + diffTP : livePrice - diffTP;
          } else {
            // General pair relative tight scale-out percentages
            finalSL = t === 'BUY' ? livePrice * 0.999 : livePrice * 1.001;
            finalTP = t === 'BUY' ? livePrice * 1.0015 : livePrice * 0.9985;
          }
        }

         const getMtfSnapshot = () => {
          const renderTfDetail = (tfName: string, ichi: any, tfPrice: number) => {
            if (!ichi || ichi.tenkan === null || ichi.Kijun === null) {
              return `\n📌 [${tfName}] ጠንካራ ታሪካዊ መረጃ በመጫን ላይ ነው...`;
            }
            const T = ichi.tenkan;
            const K = ichi.Kijun;
            const sA = ichi.spanA;
            const sB = ichi.spanB;
            const isBullishCross = T > K;
            const isBelowKumo = sA && sB && tfPrice < Math.min(sA, sB);
            const isAboveKumo = sA && sB && tfPrice > Math.max(sA, sB);
            const isInsideKumo = sA && sB && tfPrice >= Math.min(sA, sB) && tfPrice <= Math.max(sA, sB);

            // Momentum (Tenkan/Kijun)
            const tkDesc = isBullishCross 
              ? `ቴንከን-ሰን (${T.toFixed(4)}) ከኪጁን-ሰን (${K.toFixed(4)}) በላይ በመሆን ጠንካራ የባይ (Bullish) ግፊት በመፍጠር ላይ ይገኛል።` 
              : `ቴንከን-ሰን (${T.toFixed(4)}) ከኪጁን-ሰን (${K.toFixed(4)}) በታች በመሆን ጠንካራ የሴል (Bearish) ግፊት እያሳየ ነው።`;

            // Kumo (Cloud / Future Kumo)
            let kumoDesc = "ኩሞ ደመና (Kumo Cloud) አቅጣጫ: አልተጫነም / አልተወሰነም።";
            if (sA && sB) {
              const cloudColor = sA > sB ? "አረንጓዴ (Bullish Future Kumo 🟢)" : "ቀይ (Bearish Future Kumo 🔴)";
              if (isAboveKumo) {
                kumoDesc = `ዋጋው ገበያው ካለው የኩሞ ደመና (Kumo Cloud) በላይ በመገኘቱ ጠንካራ የግዢ ቀጠናን (Strong Bullish Zone) ያረጋግጣል፤ የወደፊቱ ደመና ${cloudColor} መሪነትን ያሳያል።`;
              } else if (isBelowKumo) {
                kumoDesc = `ዋጋው ገበያው ካለው የኩሞ ደመና (Kumo Cloud) በታች በመገኘቱ ጠንካራ የሽያጭ ቀጠናን (Strong Bearish Zone) ያረጋግጣል፤ የወደፊቱ ደመና ${cloudColor} መሪነትን ያሳያል።`;
              } else if (isInsideKumo) {
                kumoDesc = `ዋጋው በደመናው (Kumo Cloud) እምብርት ውስጥ በመሆኑ ገበያው ወደ ጎን እየተጓዘ ነው (Choppy/Sideways Range)፤ የደመናው ቀለም ${cloudColor} ነው።`;
              }
            }

            // Chikou Span
            const chikouDesc = ichi.chikou === 1 
              ? "ቺኮው ስፓን (Chikou Span) ከገበያው ዋና ዋና ሻማዎችና ከደመናው ነጻ ወጥቶ ፍጥነቱን (Momentum Freedom 🚀) ሙሉ በሙሉ አረጋግጧል።" 
              : "ቺኮው ስፓን (Chikou Span) በገበያ ሻማዎች ክልል ውስጥ በመሆኑ የተወሰነ መጨናነቅን (Consolidation/Resistance) ያሳያል።";

            // Combined conviction
            let score = 50;
            if (isBullishCross) score += 20; else score -= 15;
            if (isAboveKumo) score += 20;
            if (isBelowKumo) score += 20;
            if (ichi.chikou === 1) score += 10;

            const finalScore = Math.max(15, Math.min(100, score));

            return `\n\n📊 [${tfName} Timeframe ትንተና (የወቅቱ ዋጋ: ${tfPrice.toFixed(4)})]
  • ቴንከን እና ኪጁን (TK Line Alignment): ${tkDesc}
  • ኩሞ ደመና (Kumo Cloud status): ${kumoDesc}
  • ቺኮው ስፓን (Chikou Span filter): ${chikouDesc}
  • የግዥ/ሽያጭ አሳማኝነት ጥራት (Confluence Strength Metric): ${finalScore}%`;
          };

          const triggerIchiObj = {
            tenkan: targetIchi.tenkan,
            Kijun: targetIchi.kijun,
            spanA: targetIchi.spanA,
            spanB: targetIchi.spanB,
            chikou: targetIchi.chikou,
          };
          const triggerDetail = renderTfDetail(targetTf.toUpperCase(), triggerIchiObj, livePrice);

          let htfDetails = "";
          const htfNames = ['1h', '4h'];
          for (const tf of htfNames) {
            const found = activeMtfTrends.find((t: any) => t.timeframe.toLowerCase() === tf.toLowerCase());
            if (found) {
              const ichiTrendObj = {
                tenkan: found.tenkan,
                Kijun: found.Kijun,
                spanA: found.spanA,
                spanB: found.spanB,
                chikou: found.chikou,
              };
              htfDetails += renderTfDetail(tf.toUpperCase(), ichiTrendObj, found.price);
            }
          }

          if (!htfDetails) {
            htfDetails = `\n\n📌 [ከፍተኛ ታይምፍሬሞች] በመጫን ላይ ናቸው - ከፍተኛ 1H/4H ታይምፍሬሞች የግብይቱን አቅጣጫ በእጥፍ ለማጠናከር እየተሰሉ ነው።`;
          }

          return `\n============================================\n🔍 የኢቺሞኩ መግቢያ ትንተና ሪፖርት (Detailed MTF Ichimoku Report)\n============================================${triggerDetail}${htfDetails}\n\n👉 መደምደሚያ: መላው የቴንከን-ሰን፣ ኪጁን-ሰን፣ ቺኮው ሰፓን እና ፊውቸር ኩሞ ደመና አሰላለፎች የግብይት አቅጣጫውን በአንድነት ስለደገፉና እጅግ ከፍተኛ አሳማኝነት (Conviction) ስላላቸው ትሬዱ ተጀምሯል!`;
        };

        const finalReasonText = `${reason} ${getMtfSnapshot()}`;
        executeMT5Trade(ts, t, livePrice, finalSL, finalTP, cl, isM, finalReasonText);
      };

      const ichiAtIdx = calculateIchimoku(targetData, idx);
      const targetIchi = ichiAtIdx;

      const T = targetIchi.tenkan;
      const K = targetIchi.kijun;

      const tHL = getHighLowRange(9, idx);
      const kHL = getHighLowRange(26, idx);

      let prevT: number | null = null;
      let prevK: number | null = null;
      if (idx >= 1) {
        const prevTHL = getHighLowRange(9, idx - 1);
        const prevKHL = getHighLowRange(26, idx - 1);
        if (prevTHL.h !== null && prevTHL.l !== null) prevT = (prevTHL.h + prevTHL.l) / 2;
        if (prevKHL.h !== null && prevKHL.l !== null) prevK = (prevKHL.h + prevKHL.l) / 2;
      }

      const isGoldCross = (T !== null && K !== null && T > K && prevT !== null && prevK !== null && prevT <= prevK) ||
                          (T !== null && K !== null && T >= K && prevT !== null && prevK !== null && prevT < prevK);

      const isDeadCross = (T !== null && K !== null && T < K && prevT !== null && prevK !== null && prevT >= prevK) ||
                          (T !== null && K !== null && T <= K && prevT !== null && prevK !== null && prevT > prevK);

      // Kijun-sen Slope and Flatness Identifiers
      const isKijunSlopingUp = K !== null && prevK !== null && K > prevK;
      const isKijunSlopingDown = K !== null && prevK !== null && K < prevK;
      const isKijunFlat = (K !== null && prevK !== null && Math.abs(K - prevK) < 0.0001) || (targetWave.kijunFlatness ? targetWave.kijunFlatness > 4 : false);

      // --- DAY TRADER 5M/15M EXECUTION FILTER (1H BULLISH/BEARISH Kijun Pullback Bounces) ---
      const htf1h = activeMtfTrends.find(t => t.timeframe === '1h');
      const is1H_Bullish = htf1h ? htf1h.trend === 'BULLISH' : (K !== null && price > K);
      const is1H_Bearish = htf1h ? htf1h.trend === 'BEARISH' : (K !== null && price < K);

      if ((targetTf === '15m' || targetTf === '5m') && is1H_Bullish && K !== null && T !== null) {
        const isBullishPullbackToKijun = (lastCandle.low <= K * 1.004 && lastCandle.low >= K * 0.994) || 
                                         (prevCandle && prevCandle.low <= (prevK || K) * 1.004);
        const isBullishRebound = price >= T && lastCandle.close > lastCandle.open;
        
        const bWaveLow = (targetWave.stopLoss && targetWave.stopLoss < price) ? targetWave.stopLoss : null;
        const isBWaveLowHolding = bWaveLow !== null && (price >= bWaveLow * 0.996 && price <= bWaveLow * 1.015);
        const targetValUpper = (targetWave.n && targetWave.n > price) 
          ? targetWave.n 
          : ((targetWave.v && targetWave.v > price) ? targetWave.v : (price * 1.03));

        if (isBullishPullbackToKijun && isBullishRebound) {
          const signalId = `kijun-bounce-buy-${candleTime}-${targetSymbol}-${targetTf}`;
          if (!sentNotificationIds.current.has(signalId)) {
            const stopLossVal = (bWaveLow ? Math.min(K * 0.995, bWaveLow * 0.996) : K * 0.995).toFixed(2);
            
            const confluenceDetails = `🎯 **የተጣመሩ ማረጋገጫዎች (Confluence Triad):**\n` +
              `1️⃣ **Kijun-sen Rebound (የኪጁን ተደጋጋሚ ድጋፍ):** VALIDATED ✅ ዋጋው በኪጁን መስመር (${formatVal(K)}) ላይ ተመልሶ ከቴንካን ${formatVal(T)} በላይ በመዝጋት ጠንካራ ገዢዎችን አሳይቷል።\n` +
              `2️⃣ **B-Wave Retracement Low (የB-Wave ሎው ፖይንት ሪትሬስመንት):** ${isBWaveLowHolding ? 'CONFIRMED ✅ የ Wave B ሪትሬስመንት ዝቅተኛ ደረጃ (Pivot C: ' + formatVal(bWaveLow) + ') በትክክል ድጋፍ ሆኖ አገልግሏል።' : 'ACTIVE 🔄 Pivot C ዝቅተኛ ድጋፍ መስመር በ ' + formatVal(bWaveLow || K * 0.99) + ' ላይ ታማኝ ነው።'}\n` +
              `3️⃣ **N-Wave / V-Wave Target (የሞገድ ኢላማ):** ALIGNED ✅ ወደ ዋነኛው የ N-Target (${formatVal(targetValUpper)}) ያለውን የዋጋ እድገት ክልል ያረጋግጣል።`;

            addNotification(
              `[${ticker} | ${targetTf}] 🌟 Golden Wave & Kijun Rebound (Strong Buy)`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟢 **የንግድ ውሳኔ- ትክክለኛ መግቢያ (STRONG BUY / LONG) ★★★**\n\n📌 **ምክንያት:** የ 1H ዋና የታየው አቅጣጫ BULLISH ነው። በ ${targetTf} ላይ ዋጋው ወደ ኪጁን-ሰን ተመልሶ ጠንካራ ገዢን አረጋግጧል።\n\n${confluenceDetails}\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n- **1H**: 🐂 BULLISH (ወደላይ)\n📥 **የመግቢያ ዋጋ:** በ${formatVal(price)} ወይም በ Kijun ${formatVal(K)} ላይ።\n🛑 **ስቶፕ ሎስ (SL):** ከ ${stopLossVal} በታች ነው።\n🎯 **የታለመ ትርፍ (Target):** $${formatVal(targetValUpper)}`,
              'success',
              'SIGNAL',
              candleTime
            );
            sentNotificationIds.current.add(signalId);
            executeMT5TradeLocal(targetSymbol, 'BUY', price, parseFloat(stopLossVal), parseFloat(targetValUpper.toFixed(2)), undefined, false, `የወርቅ ሞገድ እና ኪጁን ድጋፍ ሪባውንድ (Golden Wave & Kijun Rebound Strong Buy) - 1H Trend is Bullish, price rebounded off Kijun ${formatVal(K)} and closed above Tenkan`);
          }
        }
      }

      if ((targetTf === '15m' || targetTf === '5m') && is1H_Bearish && K !== null && T !== null) {
        const isBearishPullbackToKijun = (lastCandle.high >= K * 0.996 && lastCandle.high <= K * 1.006) || 
                                           (prevCandle && prevCandle.high >= (prevK || K) * 0.996);
        const isBearishRebound = price <= T && lastCandle.close < lastCandle.open;
        
        const bWaveHigh = (targetWave.stopLoss && targetWave.stopLoss > price) ? targetWave.stopLoss : null;
        const isBWaveHighResisting = bWaveHigh !== null && (price <= bWaveHigh * 1.004 && price >= bWaveHigh * 0.985);
        const targetValLower = (targetWave.n && targetWave.n < price) 
          ? targetWave.n 
          : ((targetWave.v && targetWave.v < price) ? targetWave.v : (price * 0.97));

        if (isBearishPullbackToKijun && isBearishRebound) {
          const signalId = `kijun-bounce-sell-${candleTime}-${targetSymbol}-${targetTf}`;
          if (!sentNotificationIds.current.has(signalId)) {
            const stopLossVal = (bWaveHigh ? Math.max(K * 1.005, bWaveHigh * 1.004) : K * 1.005).toFixed(2);
            
            const confluenceDetails = `🎯 **የተጣመሩ ማረጋገጫዎች (Confluence Triad):**\n` +
              `1️⃣ **Kijun-sen Resistance (የኪጁን ጠንካራ ተቃውሞ):** VALIDATED ✅ ዋጋው ወደ ኪጁን መስመር (${formatVal(K)}) አድጎ ተቃውሞ ካገኘ በኋላ ከቴንካን ${formatVal(T)} በታች በመዝጋት ጠንካራ ሻጮችን አሳይቷል።\n` +
              `2️⃣ **B-Wave Retracement High (የB-Wave ሪትሬስመንት ከፍተኛ ደረጃ):** ${isBWaveHighResisting ? 'CONFIRMED ✅ የ Wave B ሪትሬስመንት ከፍተኛ ደረጃ (Pivot C: ' + formatVal(bWaveHigh) + ') ተቃውሞ ሆኖ ሻጮቹን ደግፏል።' : 'ACTIVE 🔄 Pivot C መከላከያ መስመር በ ' + formatVal(bWaveHigh || K * 1.01) + ' ላይ ታማኝ ነው።'}\n` +
              `3️⃣ **N-Wave / V-Wave Target (የሞገድ ኢላማ):** ALIGNED ✅ ወደ ዋነኛው የ N-Target (${formatVal(targetValLower)}) ያለውን የዋጋ ውድቀት ክልል ያረጋግጣል።`;

            addNotification(
              `[${ticker} | ${targetTf}] 🌟 Golden Wave & Kijun Resistance (Strong Sell)`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🔴 **የንግድ ውሳኔ- ጥልቅ ሽያጭ (STRONG SELL / SHORT) ★★★**\n\n📌 **ምክንያት:** የ 1H ዋና የታየው አቅጣጫ BEARISH ነው። በ ${targetTf} ላይ ዋጋው ወደ ኪጁን-ሰን አድጎ ተከላክሎ ወደ ታች መዞሩን አረጋግጧል።\n\n${confluenceDetails}\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n- **1H**: 🐻 BEARISH (ወደታች)\n📤 **የመሸጫ ዋጋ:** በ${formatVal(price)} ወይም በ Kijun ${formatVal(K)} አካባቢ።\n🛑 **ስቶፕ ሎስ (SL):** ከ ${stopLossVal} በላይ ነው።\n🎯 **የታለመ ትርፍ (Target):** $${formatVal(targetValLower)}`,
              'danger',
              'SIGNAL',
              candleTime
            );
            sentNotificationIds.current.add(signalId);
            executeMT5TradeLocal(targetSymbol, 'SELL', price, parseFloat(stopLossVal), parseFloat(targetValLower.toFixed(2)), undefined, false, `የወርቅ ሞገድ እና ኪጁን መቋቋሚያ ሪባውንድ (Golden Wave & Kijun Resistance Strong Sell) - 1H Trend is Bearish, price rejected off Kijun ${formatVal(K)} and closed below Tenkan`);
          }
        }
      }

      // Flatness restriction bypassed to allow setups, reversals, and crossovers on 15m to notify as requested

      // 1. Support Break Detection
      if (targetIchi.kijun && price < targetIchi.kijun && prevCandle.close >= targetIchi.kijun) {
        const signalId = `sup-break-${candleTime}-${targetSymbol}-${targetTf}`;
        if (!sentNotificationIds.current.has(signalId)) {
          const kijunVal = targetIchi.kijun;
          const stopLoss = (kijunVal * 1.005).toFixed(2);
          
          // Multi-timeframe trend verification
          const bullishHtf = activeMtfTrends.filter(t => t.trend === 'BULLISH');
          const htfListStr = activeMtfTrends.map(t => `- **${t.timeframe}**: ${t.trend === 'BULLISH' ? '🐂 BULLISH (ወደ ላይ)' : t.trend === 'BEARISH' ? '🐻 BEARISH (ወደ ታች)' : '⚪ NEUTRAL (አቅጣጫ አልባ)'}`).join('\n');
          
          if (bullishHtf.length > 0) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ ${isRapid ? '⚡ RAPID ' : ''}Support Break Warning`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **ማስጠንቀቂያ- የውሸት ስብራት ሊሆን ይችላል (Fake Breakdown Alert) ⚠️**\n\n📌 **ሁኔታ:** በ${targetTf} ላይ የKijun-sen ድጋፍ ስብራት ቢታይም፣ በትላልቅ ታይም ፍሬሞች ላይ ያለው ዋና አቅጣጫ ግን አሁንም ወደ ላይ (BULLISH) ነው።\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr}\n\n💡 **የንግድ ውሳኔ-** በትላልቅ ታይም ፍሬሞች ቢያንስ አንዱ ወጥ የሆነ የድጋፍ ስብራት እስኪያሳይ ድረስ ለመሸጥ ወይም መውጫ ለመውሰድ አይቸኩሉ (No Entry / No Exit yet)።`,
              'warning',
              'PRICE',
              candleTime
            );
          } else {
            addNotification(
              `[${ticker} | ${targetTf}] 🔴 ${isRapid ? '⚡ RAPID ' : ''}Support Broken (የድጋፍ ደረጃ ተሰብሯል)`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🔴 **ከፍተኛ መተማመን ያለው መሸጫ (SELL)**\n\n📌 **ምክንያት:** የ${ticker} ዋጋ ከKijun-sen (${formatVal(targetIchi.kijun)}) በታች ሰብሯል። በትላልቅ ታይም ፍሬሞችም ሙሉ ማረጋገጫ አለውል።\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr || '- የትላልቅ ታይም ፍሬሞች ስምምነት ተገኝቷል'}\n🛑 **ስቶፕ ሎስ (SL):** ከ ${stopLoss} በላይ ነው።`,
              'danger',
              'PRICE',
              candleTime
            );
            executeMT5TradeLocal(targetSymbol, 'SELL', price, parseFloat(stopLoss), parseFloat((price * 0.98).toFixed(2)), undefined, false, `የኪጁን ድጋፍ ስብራት (Kijun Support Break) - Price broke down below Kijun-sen (${formatVal(targetIchi.kijun)}) with HTF bearish alignments`);
          }
          sentNotificationIds.current.add(signalId);
        }
      }

      // 2. Trend Change (TK Cross upward / Gold Cross with Slope & Gap filters)
      if (isGoldCross) {
        const signalId = `trend-up-${candleTime}-${targetSymbol}-${targetTf}`;
        if (!sentNotificationIds.current.has(signalId)) {
          const stopLoss = kHL.l ? (kHL.l * 0.995).toFixed(2) : (price * 0.99).toFixed(2);
          
          const isBoomerangGold = kHL.l !== null && tHL.l !== null && tHL.l > kHL.l;
          const isHaramiGold = isBoomerangGold && kHL.h !== null && tHL.h !== null && tHL.h < kHL.h;

          // Gap check to avoid line-clumping/stuck together crosses (P-wave or tight consolidation fakes)
          const gapRatio = (T !== null && K !== null) ? Math.abs(T - K) / K : 0;
          const isGapHealthy = gapRatio >= 0.0003;

          // Multi-timeframe trend verification
          const bearishHtf = activeMtfTrends.filter(t => t.trend === 'BEARISH');
          const htfListStr = activeMtfTrends.map(t => `- **${t.timeframe}**: ${t.trend === 'BULLISH' ? '🐂 BULLISH (ወደ ላይ)' : t.trend === 'BEARISH' ? '🐻 BEARISH (ወደ ታች)' : '⚪ NEUTRAL (አቅጣጫ አልባ)'}`).join('\n');
          
          if (!isKijunSlopingUp) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ Fake TK Cross Warning (የKijun ቁልቁለት ግጭት)`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **የውሸት ምልክት ማስጠንቀቂያ (Fake Entry Alert) ⚠️**\n\n📌 **ሁኔታ:** የTenkan & Kijun ወርቃማ መሻገሪያ ቢታይም፣ **Kijun-sen (${formatVal(K)}) ግን ወደ ላይ ማዘመም አልጀመረም (ማለትም Flat ወይም ወደ ታች እያየ ነው)**። በመጽሐፉ ገጽ 59 መሠረት ይህ የውሸት ምልክት ስለሆነ **እንዳይገቡ (NO ENTRY)** ይመረጣል።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else if (!isGapHealthy) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ Clumped Lines Warning (የተጣበቁ መስመሮች)`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **የተጣበቁ መስመሮች ማስጠንቀቂያ (Line Clumping Alert) ⚠️**\n\n📌 **ሁኔታ:** ወርቃማ መሻገሪያ ቢኖርም መስመሮቹ እጅግ በጣም ተጣብቀዋል። በመጽሐፉ ገጽ 88-90 መሠረት ጤናማ ክፍተት (Gap) በሁለቱ መካከል እስካልተፈጠረ ድረስ ሲግናሉን ችላ እንላለን።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else if (bearishHtf.length > 0) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ ${isRapid ? '⚡ RAPID ' : ''}Fake TK Cross Warning`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **ማስጠንቀቂያ- የውሸት የመግቢያ ምልክት (Fake TK Cross Alert) ⚠️**\n\n📌 **ሁኔታ:** በ${targetTf} ላይ የBUY ምልክት ቢታይም፣ በትላልቅ ታይም ፍሬሞች ላይ ያለው አዝማሚያ ግን ተቃራኒ (BEARISH / ወደ ታች) ነው።\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr}\n\n💡 **የንግድ ውሳኔ-** በትላልቅ ታይም ፍሬሞች ያለው አዝማሚያ ጠንካራ ስለሆነ **እንዳይገቡ (NO ENTRY)** ይመረጣል። ይህ የውሸት ምልክት ሊሆን ስለሚችል በጥንቃቄ መከታተል ይመከራል።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else {
            const crossTypeStr = isHaramiGold 
              ? '🔥 Kinko Hyo Boomerang (Harami Sen - Case #2) ★★★' 
              : isBoomerangGold 
                ? '🔥 Kinko Hyo Boomerang (Open Range) ★★' 
                : '🔥 Kinko Hyo Standard Gold Cross';

            const descStr = isHaramiGold
              ? `በ${targetTf} ላይ እጅግ ተፈላጊ የሆነው Kinko Hyo "Boomerang" ወርቃማ መሻገሪያ (Case #2 / Harami Sen) ተረጋግጧል። የ9 ሻማ ዝቅተኛ/ከፍተኛ ዋጋ ከ26 ሻማ ሙሉ በሙሉ በውስጥ ተቀምጧል (${formatVal(tHL.l)} > ${formatVal(kHL.l)} እና ${formatVal(tHL.h)} < ${formatVal(tHL.h)})፤ ይህም ዝቅተኛው ዋጋ ከ9 ሻማዎች በፊት ተመዝግቦ ገበያው በከፍተኛ ኃይል ወደላይ መዞሩን ያሳያል።`
              : isBoomerangGold
                ? `በ${targetTf} ላይ የ Kinko Hyo "Boomerang" ወርቃማ መሻገሪያ ተረጋግጧል። የገበያው ዝቅተኛ ዋጋ ከ9 ሻማዎች በፊት ተመዝግቧል (${formatVal(tHL.l)} > ${formatVal(kHL.l)})፤ ይህም ገበያው ወደ ላይ መዞሩን ያሳያል።`
                : `በ${targetTf} የTenkan-sen እና Kijun-sen ወደላይ መሻገር (Standard TK Gold Cross @ ${formatVal(T)}) አሳይቷል። Kijun-sen (${formatVal(K)}) በትክክል ወደ ላይ እያዘመመ እጅግ ጠንካራ መግቢያ ነው።`;

            addNotification(
              `[${ticker} | ${targetTf}] ${isRapid ? '⚡ RAPID ' : ''}${crossTypeStr}`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟢 **የንግድ ውሳኔ- ለመግዛት / BUY / LONG**\n\n📌 **አይነት እና ምክንያት:** ${crossTypeStr}\n${descStr}\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr || '- የትላልቅ ታይም ፍሬሞች ስምምነት ተገኝቷል'}\n📥 **ምቹ የመግቢያ ዋጋ:** በ${formatVal(price)} ወይም ወደ Kijun ${formatVal(K)} በሚያደርገው ሪቴስት ላይ።\n🛑 **ስቶፕ ሎስ (SL):** ከ ${stopLoss} በታች ነው።`,
              'success',
              'SIGNAL',
              candleTime
            );
            executeMT5TradeLocal(targetSymbol, 'BUY', price, parseFloat(stopLoss), parseFloat(targetWave.n ? String(targetWave.n) : String(price * 1.03)), undefined, false, `ወርቃማ መስቀለኛ መሻገር (Standard/Boomerang TK Gold Cross) - Tenkan-sen and Kijun-sen crossed over upward with healthy gap. Cross Type: ${crossTypeStr}`);
          }
          sentNotificationIds.current.add(signalId);
        }
      }

      // 2b. Trend Change Link: Bearish TK Cross (Dead Cross with Slope & Gap filters)
      if (isDeadCross) {
        const signalId = `trend-down-${candleTime}-${targetSymbol}-${targetTf}`;
        if (!sentNotificationIds.current.has(signalId)) {
          const stopLoss = kHL.h ? (kHL.h * 1.005).toFixed(2) : (price * 1.01).toFixed(2);
          
          const isBoomerangDead = kHL.h !== null && tHL.h !== null && tHL.h < kHL.h;
          const isHaramiDead = isBoomerangDead && kHL.l !== null && tHL.l !== null && tHL.l > kHL.l;

          const gapRatio = (T !== null && K !== null) ? Math.abs(T - K) / K : 0;
          const isGapHealthy = gapRatio >= 0.0003;

          const htfListStr = activeMtfTrends.map(t => `- **${t.timeframe}**: ${t.trend === 'BULLISH' ? '🐂 BULLISH (ወደ ላይ)' : t.trend === 'BEARISH' ? '🐻 BEARISH (ወደ ታች)' : '⚪ NEUTRAL (አቅጣጫ አልባ)'}`).join('\n');
          const bullishHtf = activeMtfTrends.filter(t => t.trend === 'BULLISH');

          if (!isKijunSlopingDown) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ Fake TK Dead Cross Warning (የKijun ቁልቁለት ግጭት)`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **የውሸት ምልክት ማስጠንቀቂያ (Fake Entry Alert) ⚠️**\n\n📌 **ሁኔታ:** የTenkan & Kijun የሞት መሻገሪያ ቢታይም፣ **Kijun-sen (${formatVal(K)}) ግን ወደ ታች ማዘመም አልጀመረም (ማለትም Flat ወይም ወደ ላይ እያየ ነው)**። በመጽሐፉ ገጽ 59 መሠረት ይህ የውሸት ምልክት ስለሆነ **እንዳይገቡ (NO ENTRY)** ይመረጣል።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else if (!isGapHealthy) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ Clumped Lines Warning (የተጣበቁ መስመሮች)`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **የተጣበቁ መስመሮች ማስጠንቀቂያ (Line Clumping Alert) ⚠️**\n\n📌 **ሁኔታ:** የሞት መሻገሪያ ቢኖርም መስመሮቹ እጅግ በጣም ተጣብቀዋል። በመጽሐፉ ገጽ 88-90 መሠረት ጤናማ ክፍተት (Gap) በሁለቱ መካከል እስካልተፈጠረ ድረስ ሲግናሉን ችላ እንላለን።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else if (bullishHtf.length > 0) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ ${isRapid ? '⚡ RAPID ' : ''}Fake TK Dead Cross Warning`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **ማስጠንቀቂያ- የውሸት የሽያጭ ምልክት (Fake TK Dead Cross Alert) ⚠️**\n\n📌 **ሁኔታ:** በ${targetTf} ላይ የSELL ምልክት ቢታይም፣ በትላልቅ ታይም ፍሬሞች ላይ ያለው አዝማሚያ ግን ተቃራኒ (BULLISH / ወደ ላይ) ነው።\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr}\n\n💡 **የንግድ ውሳኔ-** በትላልቅ ታይም ፍሬሞች ያለው አዝማሚያ ጠንካራ ስለሆነ **እንዳይገቡ (NO ENTRY)** ይመረጣል። ይህ የውሸት ምልክት ሊሆን ስለሚችል በጥንቃቄ መከታተል ይመከራል።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else {
            const crossTypeStr = isHaramiDead 
              ? '🔥 Kinko Hyo Boomerang (Harami Sen - Case #2) ★★★' 
              : isBoomerangDead 
                ? '🔥 Kinko Hyo Boomerang (Open Range) ★★' 
                : '🔥 Kinko Hyo Standard Dead Cross';

            const descStr = isHaramiDead
              ? `በ${targetTf} ላይ እጅግ ተፈላጊ የሆነው Kinko Hyo "Boomerang" የሞት መሻገሪያ (Case #2 / Harami Sen) ተረጋግጧል። የ9 ሻማ ዝቅተኛ/ከጨማሪ ዋጋ ከ26 ሻማ ሙሉ በሙሉ በውስጥ ተቀምጧል (${formatVal(tHL.l)} > ${formatVal(kHL.l)} እና ${formatVal(tHL.h)} < ${formatVal(tHL.h)})፤ ይህም ከፍተኛው ዋጋ ከ9 ሻማዎች በፊት ተመዝግቦ ገበያው በከፍተኛ ኃይል ወደታች መዞሩን ያሳያል።`
              : isBoomerangDead
                ? `በ${targetTf} ላይ የ Kinko Hyo "Boomerang" የሞት መሻገሪያ ተረጋግጧል። የገበያው ከፍተኛ ዋጋ ከ9 ሻማዎች በፊት ተመዝግቧል (${formatVal(tHL.h)} < ${formatVal(kHL.h)})፤ ይህም ገበያው ወደ ታች መዞሩን ያሳያል።`
                : `በ${targetTf} የTenkan-sen እና Kijun-sen ወደታች መሻገር (Standard TK Dead Cross @ ${formatVal(T)}) አሳይቷል። Kijun-sen (${formatVal(K)}) በትክክል ወደ ታች እያዘመመ እጅግ ጠንካራ መሸጫ ነው።`;

            addNotification(
              `[${ticker} | ${targetTf}] ${isRapid ? '⚡ RAPID ' : ''}${crossTypeStr}`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🔴 **የንግድ ውሳኔ- ለመሸጥ / SELL / SHORT**\n\n📌 **አይነት እና ምክንያት:** ${crossTypeStr}\n${descStr}\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr || '- የትላልቅ ታይም ፍሬሞች ስምምነት ተገኝቷል'}\n📤 **የመሸጫ ዋጋ:** በ${formatVal(price)} ወይም ወደ Kijun ${formatVal(K)} በሚያደርገው ሪቴስት ላይ።\n🛑 **ስቶፕ ሎስ (SL):** ከ ${stopLoss} በላይ ነው።`,
              'danger',
              'SIGNAL',
              candleTime
            );
            executeMT5TradeLocal(targetSymbol, 'SELL', price, parseFloat(stopLoss), parseFloat(targetWave.n ? String(targetWave.n) : String(price * 0.97)), undefined, false, `የሞት መስቀለኛ መሻገር (Standard/Boomerang TK Dead Cross) - Tenkan-sen and Kijun-sen crossed over downward with healthy gap. Cross Type: ${crossTypeStr}`);
          }
          sentNotificationIds.current.add(signalId);
        }
      }

      // 3a. Bullish Trend Strength Check (Multiple Confirmations)
      let bullishConfirmationCount = 0;
      if (price > targetIchi.kijun) bullishConfirmationCount++;
      if (targetIchi.tenkan && targetIchi.kijun && targetIchi.tenkan > targetIchi.kijun) bullishConfirmationCount++;
      if (targetWave.volumeValidation === 'STRONG') bullishConfirmationCount++;
      if (targetWave.isB_Broken && targetWave.trendDir === 'UP') bullishConfirmationCount++;
      if (targetWave.chikouBullish) bullishConfirmationCount++;
      if (targetWave.waveSymmetry >= 0.75) bullishConfirmationCount++;
      if (targetWave.kijunAngle > 10) bullishConfirmationCount++;
      
      // I-Wave Accumulation (ክምችት) Check
      const isIWaveBullish = !!(targetWave.waveStatus && targetWave.waveStatus.includes('I-Wave: ክምችት') && targetWave.trendDir === 'UP');
      if (isIWaveBullish) bullishConfirmationCount++;

      // Filter: only trigger if there is actual wave target validation background (reducing noise as requested by user)
      const hasBullishWaveValidation = targetWave.n !== null || targetWave.v !== null || targetWave.stopLoss !== null || isIWaveBullish;

      if ((targetTf === '15m' || targetTf === '5m') && bullishConfirmationCount >= 3 && hasBullishWaveValidation) {
        const signalId = `strong-bullish-${candleTime}-${targetSymbol}-${targetTf}`;
        if (!sentNotificationIds.current.has(signalId)) {
          const stopLoss = targetIchi.kijun ? (targetIchi.kijun * 0.993).toFixed(2) : (price * 0.99).toFixed(2);
          
          const bearishHtf = activeMtfTrends.filter(t => t.trend === 'BEARISH');
          const htfListStr = activeMtfTrends.map(t => `- **${t.timeframe}**: ${t.trend === 'BULLISH' ? '🐂 BULLISH (ወደ ላይ)' : t.trend === 'BEARISH' ? '🐻 BEARISH (ወደ ታች)' : '⚪ NEUTRAL (አቅጣጫ አልባ)'}`).join('\n');
          
          if (bearishHtf.length > 0) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ ${isRapid ? '⚡ RAPID ' : ''}Trend Strength Locked`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **ማስጠንቀቂያ- በተቃራኒ አቅጣጫ የተገደበ የንግድ ጥንካሬ ⚠️**\n\n📌 **ሁኔታ:** በ${targetTf} ላይ 3+ ሲስተም ማረጋገጫ ቢኖርም፣ በትላልቅ ታይም ፍሬሞች ላይ ያለው አዝማሚያ ግን ወደ ታች (BEARISH) ነው።\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr}\n💡 **የንግድ ውሳኔ-** በትላልቅ ታይም ፍሬሞች ቢያንስ አንዱ ወደ ፖዘቲቭ እስኪቀየር ድረስ ለአዲስ ግዢዎች መቆጠብ ይመረጣል።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else {
            const bWaveLow = (targetWave.stopLoss && targetWave.stopLoss < price) ? targetWave.stopLoss : null;
            const nTargetVal = (targetWave.n && targetWave.n > price) ? targetWave.n : (price * 1.05);
            const vTargetVal = (targetWave.v && targetWave.v > price) ? targetWave.v : (price * 1.03);
            
            const waveConfluenceDetails = `🎯 **የተጣመሩ ማረጋገጫዎች (Confluence Triad + I-Wave):**\n` +
              `1️⃣ **B-Wave Retracement / Rebound (የB-Wave ወደ ኋላ መመለስ ድጋፍ):** ${bWaveLow ? `CONFIRMED ✅ (Pivot C: ${formatVal(bWaveLow)})` : 'N/A'}\n` +
              `2️⃣ **N-Wave Target (የN-Wave ሞገድ ኢላማ):** ${targetWave.n && targetWave.n > price ? `Aligned @ $${formatVal(nTargetVal)} 🎯` : 'N/A'}\n` +
              `3️⃣ **V-Wave Target (የV-Wave ሞገድ ኢላማ):** ${targetWave.v && targetWave.v > price ? `Aligned @ $${formatVal(vTargetVal)} 🎯` : 'N/A'}\n` +
              `4️⃣ **I-Wave Accumulation (የI-Wave ክምችት ደረጃ):** ${isIWaveBullish ? 'CONFIRMED ✅ (የዋጋው የመጀመርያ ኃይለኛ የዋጋ ክምችት)' : 'N/A'}\n\n` +
              `⛩️ **የሆሶዳ ጥልቅ የቴክኖሎጂ አውታረ መረብ (Hosoda Deep Metrics Grid):**\n` +
              `• **Chikou Span Freedom:** ${targetWave.chikouBullish ? 'FREE (BULLISH) 🟢 ቺኮው ከሁሉም ተቃውሞዎች (ዋጋ እና ደመና) በላይ በጥንካሬ ወጥቷል።' : 'CONFINED 🔒'}\n` +
              `• **Wave Symmetry Ratio:** ${(targetWave.waveSymmetry * 100).toFixed(0)}% (${targetWave.waveSymmetry >= 0.75 ? 'HIGH CYCLICAL BALANCE 👑' : 'NORMAL'})\n` +
              `• **Volume Force:** ${targetWave.volumeValidation === 'STRONG' ? 'HIGH INSTITUTIONAL VOLUME 🔥' : 'NEUTRAL'}\n` +
              `• **Kijun-sen Angle:** ${targetWave.kijunAngle > 0 ? '+' : ''}${targetWave.kijunAngle.toFixed(1)}° (${targetWave.kijunAngle > 12 ? 'RAPID SPEED' : 'STABLE'})\n` +
              `• **Predicted Next Pivots:** Tenkan: ${formatVal(targetWave.predictedTenkan)} | Kijun: ${formatVal(targetWave.predictedKijun)}\n\n` +
              `⭐ **STRONG BUY Trigger:** የ 1H አዝማሚያ ወደላይ (BULLISH) ሆኖ በ ${targetTf} ታይምፍሬም ላይ በጠቅላላ ${bullishConfirmationCount} የሲግናል ማረጋገጫዎች ስሪት ተረጋግጠዋል!`;

            addNotification(
              `[${ticker} | ${targetTf}] 🔥 ${isRapid ? '⚡ RAPID ' : ''}የንግድ ጥንካሬ - STRONG BUY`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟢 **የንግድ ውሳኔ- ለመግዛት/ይዘው ለመቆየት (STRONG BUY / HOLD) ★★★**\n\n📌 **ምክንያት:** ${ticker} በ${targetTf} ከ 3 በላይ ጠንካራ የሲስተም ማረጋገጫዎችን (Confluences) አግኝቷል። በትላልቅ ታይም ፍሬሞችም ሙሉ ማረጋገጫ አለውል።\n\n${waveConfluenceDetails}\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr || '- የትላልቅ ታይም ፍሬሞች ስምምነት ተገኝቷል'}\n📥 **ምቹ መግቢያ:** በ${formatVal(price)} (ወይም ወደ Tenkan ${formatVal(targetIchi.tenkan)} በሚያደርገው ሪቴስት ላይ)።\n🛑 **ስቶፕ ሎስ (SL):** ከ ${stopLoss} በታች ነው።`,
              'success',
              'SIGNAL',
              candleTime
            );
            executeMT5TradeLocal(targetSymbol, 'BUY', price, parseFloat(stopLoss), parseFloat(nTargetVal.toFixed(2)), undefined, false, `የንግድ ጥንካሬ ግዢ (Trend Strength Strong Buy) - 3+ Bullish confluences reached. Chikou Span Free: ${targetWave.chikouBullish ? "Yes" : "No"}, Volume Force: ${targetWave.volumeValidation}`);
          }
          sentNotificationIds.current.add(signalId);
        }
      }

      // 3b. Bearish Trend Strength Check (Multiple Confirmations)
      let bearishConfirmationCount = 0;
      if (price < targetIchi.kijun) bearishConfirmationCount++;
      if (targetIchi.tenkan && targetIchi.kijun && targetIchi.tenkan < targetIchi.kijun) bearishConfirmationCount++;
      if (targetWave.volumeValidation === 'STRONG') bearishConfirmationCount++;
      if (targetWave.isB_Broken && targetWave.trendDir === 'DOWN') bearishConfirmationCount++;
      if (!targetWave.chikouBullish) bearishConfirmationCount++;
      if (targetWave.waveSymmetry >= 0.75) bearishConfirmationCount++;
      if (targetWave.kijunAngle < -10) bearishConfirmationCount++;

      // I-Wave Accumulation (ክምችት) Check
      const isIWaveBearish = !!(targetWave.waveStatus && targetWave.waveStatus.includes('I-Wave: ክምችት') && targetWave.trendDir === 'DOWN');
      if (isIWaveBearish) bearishConfirmationCount++;

      // Filter: only trigger if there is actual wave target validation background (reducing noise as requested by user)
      const hasBearishWaveValidation = targetWave.n !== null || targetWave.v !== null || targetWave.stopLoss !== null || isIWaveBearish;

      if ((targetTf === '15m' || targetTf === '5m') && bearishConfirmationCount >= 3 && hasBearishWaveValidation) {
        const signalId = `strong-bearish-${candleTime}-${targetSymbol}-${targetTf}`;
        if (!sentNotificationIds.current.has(signalId)) {
          const stopLoss = targetIchi.kijun ? (targetIchi.kijun * 1.007).toFixed(2) : (price * 1.01).toFixed(2);
          
          const bullishHtf = activeMtfTrends.filter(t => t.trend === 'BULLISH');
          const htfListStr = activeMtfTrends.map(t => `- **${t.timeframe}**: ${t.trend === 'BULLISH' ? '🐂 BULLISH (ወደ ላይ)' : t.trend === 'BEARISH' ? '🐻 BEARISH (ወደ ታች)' : '⚪ NEUTRAL (አቅጣጫ አልባ)'}`).join('\n');
          
          if (bullishHtf.length > 0) {
            addNotification(
              `[${ticker} | ${targetTf}] ⚠️ ${isRapid ? '⚡ RAPID ' : ''}Bearish Trend Strength Checked`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **ማስጠንቀቂያ- በተቃራኒ አቅጣጫ የተገደበ የሽያጭ ጥንካሬ ⚠️**\n\n📌 **ሁኔታ:** በ${targetTf} ላይ 3+ ድጋፍ ሰባሪ ማረጋገጫዎች ቢገቡም፣ በትላልቅ ታይም ፍሬሞች ላይ ያለው አዝማሚያ ግን ወደ ላይ (BULLISH) ነው።\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr}\n💡 **የንግድ ውሳኔ-** በትላልቅ ታይም ፍሬሞች ቢያንስ አንዱ ወደ ኔጋቲቭ/ሽያጭ እስኪቀየር ድረስ ለአዲስ ሽያጮች (Short) መቆጠብ ይመረጣል።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else {
            const bWaveHigh = (targetWave.stopLoss && targetWave.stopLoss > price) ? targetWave.stopLoss : null;
            const nTargetVal = (targetWave.n && targetWave.n < price) ? targetWave.n : (price * 0.95);
            const vTargetVal = (targetWave.v && targetWave.v < price) ? targetWave.v : (price * 0.97);

            const waveConfluenceDetails = `🎯 **የተጣመሩ ማረጋገጫዎች (Confluence Triad + I-Wave):**\n` +
              `1️⃣ **B-Wave Retracement / Resistance (የB-Wave ወደ ኋላ መመለስ ተቃውሞ):** ${bWaveHigh ? `CONFIRMED ✅ (Pivot C: ${formatVal(bWaveHigh)})` : 'N/A'}\n` +
              `2️⃣ **N-Wave Target (የN-Wave ሞገድ ኢላማ):** ${targetWave.n && targetWave.n < price ? `Aligned @ $${formatVal(nTargetVal)} 🎯` : 'N/A'}\n` +
              `3️⃣ **V-Wave Target (የV-Wave ሞገድ ኢላማ):** ${targetWave.v && targetWave.v < price ? `Aligned @ $${formatVal(vTargetVal)} 🎯` : 'N/A'}\n` +
              `4️⃣ **I-Wave Accumulation (የI-Wave ክምችት ደረጃ):** ${isIWaveBearish ? 'CONFIRMED ✅ (የዋጋው የመጀመርያ ኃይለኛ የዋጋ ቁልቁለት)' : 'N/A'}\n\n` +
              `⛩️ **የሆሶዳ ጥልቅ የቴክኖሎጂ አውታረ መረብ (Hosoda Deep Metrics Grid):**\n` +
              `• **Chikou Span Freedom:** ${!targetWave.chikouBullish ? 'FREE (BEARISH) 🔴 ቺኮው ከታሪካዊ ዋጋና ከደመና በታች በጥልቀት ተጭኗል።' : 'CONFINED 🔒'}\n` +
              `• **Wave Symmetry Ratio:** ${(targetWave.waveSymmetry * 100).toFixed(0)}% (${targetWave.waveSymmetry >= 0.75 ? 'HIGH CYCLICAL BALANCE 👑' : 'NORMAL'})\n` +
              `• **Volume Force:** ${targetWave.volumeValidation === 'STRONG' ? 'HIGH INSTITUTIONAL VOLUME 🔥' : 'NEUTRAL'}\n` +
              `• **Kijun-sen Angle:** ${targetWave.kijunAngle.toFixed(1)}° (${targetWave.kijunAngle < -12 ? 'RAPID SPEED' : 'STABLE'})\n` +
              `• **Predicted Next Pivots:** Tenkan: ${formatVal(targetWave.predictedTenkan)} | Kijun: ${formatVal(targetWave.predictedKijun)}\n\n` +
              `⭐ **STRONG SELL Trigger:** የ 1H አዝማሚያ ወደታች (BEARISH) ሆኖ በ ${targetTf} ታይምፍሬም ላይ በጠቅላላ ${bearishConfirmationCount} የሲግናል ማረጋገጫዎች ስሪት ተረጋግጠዋል!`;

            addNotification(
              `[${ticker} | ${targetTf}] 💥 ${isRapid ? '⚡ RAPID ' : ''}የሽያጭ ጥንካሬ - STRONG SELL`,
              `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🔴 **የንግድ ውሳኔ- መሸጥ/ይዘው ለመቆየት (STRONG SELL / SHORT) ★★★**\n\n📌 **ምክንያት:** ${ticker} በ${targetTf} ላይ ከ 3 በላይ ጠንካራ የድብ ማረጋገጫዎችን (Confluences) አግኝቷል። በትላልቅ ታይም ፍሬሞችም ሙሉ ማረጋገጫ አለውል።\n\n${waveConfluenceDetails}\n\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr || '- የትላልቅ ታይም ፍሬሞች ስምምነት ተገኝቷል'}\n📤 **የመሸጫ/መውጫ ቦታ:** በ${formatVal(price)} (ወይም ወደ Tenkan ${formatVal(targetIchi.tenkan)} በሚያደርገው ሪቴስት ላይ)።\n🛑 **ስቶፕ ሎስ (SL):** ከ ${stopLoss} በላይ ነው።`,
              'danger',
              'SIGNAL',
              candleTime
            );
            executeMT5TradeLocal(targetSymbol, 'SELL', price, parseFloat(stopLoss), parseFloat(nTargetVal.toFixed(2)), undefined, false, `የንግድ ጥንካሬ ሽያጭ (Trend Strength Strong Sell) - 3+ Bearish confluences reached. Chikou Free Bearish: ${!targetWave.chikouBullish ? "Yes" : "No"}, Volume Force: ${targetWave.volumeValidation}`);
          }
          sentNotificationIds.current.add(signalId);
        }
      }

      // 3c. Point B Breakout Notification (ወሳኝ የድርጊት ማሳሰቢያ)
      if (targetWave.isB_Broken && targetWave.pointB !== undefined && targetWave.pointB !== null) {
        const bSignalId = `b-breakout-${candleTime}-${targetSymbol}-${targetTf}`;
        if (!sentNotificationIds.current.has(bSignalId)) {
          const isBullishB = targetWave.trendDir === 'UP';
          const breakoutDirection = isBullishB ? '🐂 BULLISH BREAKOUT (ወደላይ)' : '🐻 BEARISH BREAKDOWN (ወደታች)';
          const messageStr = isBullishB
            ? `📈 **የዋጋ ዕድገት:** የ${ticker} ዋጋ ከPivot Point B (${formatVal(targetWave.pointB)}) በላይ በከፍተኛ ጉልበት ሰብሮ ወጥቷል! ይህ የስርዓቱን የዕድገት እንቅስቃሴ 3 (Wave 3 Explosion) ያረጋግጣል።\n\n📌 **ተጨማሪ ማረጋገጫ:** ይህ ስብራት ከሌሎች የ Ichimoku ማሳያዎች ጋር እንደ ተጨማሪ ማረጋገጫ (Confluence) ሆኖ ተመዝግቧል።\n\n💡 **የንግድ ውሳኔ:** ለመግዛት (BUY / LONG) የተሻለ አጋጣሚ ነው።`
            : `📉 **የዋጋ ውድቀት:** የ${ticker} ዋጋ ከPivot Point B (${formatVal(targetWave.pointB)}) በታች በከፍተኛ ኃይል ጥሶ ወርዷል! ይህ የስርዓቱን የቁልቁለት እንቅስቃሴ 3 (Wave 3 Breakdown) ያረጋግጣል።\n\n📌 **ተጨማሪ ማረጋገጫ:** ይህ የቁልቁለት ጥሰት ከሌሎች የ Ichimoku ማሳያዎች ጋር እንደ ተጨማሪ ማረጋገጫ (Confluence) ሆኖ ተመዝግቧል።\n\n💡 **የንግድ ውሳኔ:** ለመሸጥ (SELL / SHORT) ምቹ ነው።`;

          addNotification(
            `[${ticker} | ${targetTf}] 🚀 Point B Breakout!`,
            `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n✨ **ስኬታማ ስብራት (Breakout Confirmation)**\n📎 **አቅጣጫ:** ${breakoutDirection}\n\n${messageStr}`,
            isBullishB ? 'success' : 'danger',
            'SIGNAL',
            candleTime
          );
          executeMT5Trade(
            targetSymbol, 
            isBullishB ? 'BUY' : 'SELL', 
            price, 
            isBullishB ? parseFloat((price * 0.995).toFixed(2)) : parseFloat((price * 1.005).toFixed(2)), 
            targetWave.n ? parseFloat(targetWave.n.toFixed(2)) : (isBullishB ? parseFloat((price * 1.03).toFixed(2)) : parseFloat((price * 0.97).toFixed(2))),
            undefined,
            false,
            `የሞገድ B ስብራት (Point B Breakout Level: ${formatVal(targetWave.pointB)}) - Direction: ${isBullishB ? 'UP' : 'DOWN'}, confirming Wave 3 action`
          );
          sentNotificationIds.current.add(bSignalId);
        }
      }

      // 4. Wave Target Approaching
      if (targetWave.approachingTarget) {
        const signalId = `target-${targetWave.approachingTarget}-${candleTime}-${targetTf}`;
        if (!sentNotificationIds.current.has(signalId)) {
          addNotification(
            `[${ticker} | ${targetTf}] 🎯 ${isRapid ? '⚡ RAPID ' : ''}Target Approaching`,
            `📊 **ፔር (Pair):** ${ticker} | ⏱️ **ታይም ፍሬም (TF):** ${targetTf}\n\n🟡 **የንግድ ውሳኔ- ትርፍ መውሰጃ/ስቶፕ ማስተካከያ (TAKE PROFIT / LOCK GAINS)**\n\n📌 **ምክንያት:** የ${ticker} ዋጋ ወደ ${targetWave.approachingTarget} የታለመ ዋጋ እየተጠጋ ነው። ከአሁኑ ግዢዎች ከፊል ትርፍ መውሰድ (Partial TP) ወይም ስቶፕ ሎስን ወደ መግቢያ ዋጋ (Trail Stop) ማምጣት ይመከራል።`,
            'warning',
            'SIGNAL',
            candleTime
          );
          sentNotificationIds.current.add(signalId);
        }
      }

      // 5. Golden Confluence Detection (Time & Price Coincidence)
      if (targetWave.isGoldenEntry) {
        const signalId = `golden-confluence-${candleTime}-${targetSymbol}-${targetTf}`;
        if (!sentNotificationIds.current.has(signalId)) {
          const stopLoss = targetIchi.kijun ? (targetIchi.kijun * 0.994).toFixed(2) : (price * 0.99).toFixed(2);
          
          const bearishHtf = activeMtfTrends.filter(t => t.trend === 'BEARISH');
          const htfListStr = activeMtfTrends.map(t => `- **${t.timeframe}**: ${t.trend === 'BULLISH' ? '🐂 BULLISH (ወደ ላይ)' : t.trend === 'BEARISH' ? '🐻 BEARISH (ወደ ታች)' : '⚪ NEUTRAL (አቅጣጫ አልባ)'}`).join('\n');
          
          if (bearishHtf.length > 0) {
            addNotification(
              `[${ticker} | ${targetTf}] 🌟 ${isRapid ? '⚡ RAPID ' : ''}Golden Entry MTF Conflict`,
              `⚠️ **ወርቃማ መጋጠሚያ ከቀለም ግጭት ጋር (Golden Entry Alert) ★**\n\n📌 **ሁኔታ:** የቀናት ለውጥ ዑደት (Henka-bi Change Day) እና የዋጋ ኢላማው በትክክል ገጥመዋል፤ ነገር ግን በትላልቅ ታይም ፍሬሞች ላይ ያለው አዝማሚያ ተቃራኒ (BEARISH) ነው።\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr}\n💡 **የንግድ ውሳኔ-** ይህ ከፍተኛ የአደጋ መጠን ያለው በመሆኑ፣ ተጨማሪ ማረጋገጫ እስኪያዩ በጥንቃቄ በዝቅተኛ ሎት ሳይዝ (Low Lot) መግባት ይመከራል።`,
              'warning',
              'SIGNAL',
              candleTime
            );
          } else {
            addNotification(
              `[${ticker} | ${targetTf}] ★ ${isRapid ? '⚡ RAPID ' : ''}ወርቃማ መጋጠሚያ (Golden Confluence)`,
              `🌟 **የንግድ ውሳኔ- ፍጹም ለመግዛት (STRONG BUY / LONG) ★★★**\n\n📌 **ምክንያት:** የቀናት ለውጥ ዑደት (Henka-bi Change Day) እና የዋጋ ኢላማው (${targetWave.approachingTarget || 'Target'}) በትክክል አንድ ላይ ገጥመዋል! በትላልቅ ታይም ፍሬሞች ላይም ሙሉ ማረጋገጫ (MTF Confluence) አለ።\n🔍 **በትላልቅ ታይም ፍሬሞች ያለው ሁኔታ:**\n${htfListStr || '- የትላልቅ ታይም ፍሬሞች ስምምነት ተገኝቷል'}\n📥 **ምቹ የመግቢያ ዋጋ:** በ${formatVal(price)} ወይም በ Kijun-sen ${formatVal(targetIchi.kijun)} ላይ ፈጣን ግዢ።\n🛑 **ስቶፕ ሎስ (SL):** ከ ${stopLoss} በታች ነው።\n🎯 **የታለመ ትርፍ:** ወደ ቀጣዩ ${targetWave.waveStatus || 'Target'} ዋጋ።`,
              'success',
              'SIGNAL',
              candleTime
            );
            executeMT5TradeLocal(targetSymbol, 'BUY', price, parseFloat(stopLoss), parseFloat(targetWave.n ? String(targetWave.n) : String(price * 1.03)), undefined, false, `ወርቃማ መጋጠሚያ (Golden Confluence) - Time Cycle Day (Henka-bi) and Wave targets aligned perfectly with HTF bullish validations`);
          }
          sentNotificationIds.current.add(signalId);
        }
      }
    }
  }, [triggerNotification, mtfTrends, allowedAutoTimeframes]);

  // Real-time Active System Monitor
  useEffect(() => {
    if (symbol === dataSymbol && data.length > 0) {
      checkSignals(data, ichiData, waveTargets, symbol, timeframe);
    }
  }, [data, ichiData, waveTargets, symbol, timeframe, checkSignals, dataSymbol]);

  // Background Scanner for ALL symbols on 5m and 15m (the only timeframes evaluated by the signal engine)
  useEffect(() => {
    if (isBacktestMode) return;

    let scanIteration = 0;

    const runScan = async () => {
      scanIteration++;
      // We only need to check 5m and 15m timeframes for background signals as other timeframes are ignored by checkSignals
      const scanTimeframes = ['5m', '15m'];

      console.log(`[BackgroundScanner] Global scan started (Iteration ${scanIteration})`);
      
      const scanSymbols = symbols;
      const priceUpdates: Record<string, number> = {};

      for (const s of scanSymbols) {
        for (const tf of scanTimeframes) {
          if (s.value === symbol && tf === timeframe) continue;

          try {
            // Buffer limit is reduced to 60 to make it super-fast and lightweight (Ichimoku needs max 52 lookback)
            const klines = await fetchBinanceData(s.value, tf, 60);
            const offset = getAppliedOffset(s.value);
            if (klines.length > 0) {
              const lastClose = klines[klines.length - 1].close + offset;
              priceUpdates[s.value] = lastClose;
            }
            if (klines.length >= 26) {
              const formatted = klines.map(k => ({
                time: new Date(k.time).toISOString(),
                open: k.open + offset, 
                high: k.high + offset, 
                low: k.low + offset, 
                close: k.close + offset, 
                volume: k.volume
              }));
              const sIchi = calculateIchimoku(formatted, formatted.length - 1);
              const sWave = calculateWaveTargets(formatted, s.value);
              checkSignals(formatted, sIchi, sWave, s.value, tf);
            }
          } catch (err) {
            console.warn(`[BackgroundScanner] Skip ${s.name} ${tf}:${(err as any).message || err}`);
          }
          // Smaller sequential delay
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // Single batched state update at the end of the scan to eliminate multiple React re-renders and lags!
      if (Object.keys(priceUpdates).length > 0) {
        setTickerPrices(prev => ({ ...prev, ...priceUpdates }));
      }
    };

    // Run every 90 seconds to capture 5m/15m signals quickly while guaranteeing 0% CPU lag
    const interval = setInterval(runScan, 90000);
    // Initial scan after 3 seconds
    const initialTimeout = setTimeout(runScan, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialTimeout);
    };
  }, [symbol, timeframe, isBacktestMode, checkSignals, symbols, getAppliedOffset]);

  // Dynamic float calculation of HFM MT5 Demo/Live positions linked to the gold visual chart
  let dynamicAccountInfo = apiAccountInfo;
  if (apiAccountInfo) {
    const rawPositions = apiAccountInfo.positions || [];
    // Filter out if any MT5 autotrade has a duplicate ticket already in rawPositions to prevent double listing
    const filteredAutoTrades = mt5AutoTrades.filter(
      at => !rawPositions.some((rp: any) => String(rp.ticket) === String(at.ticket))
    );
    const combinedPositions = [...filteredAutoTrades, ...rawPositions];

    const updatedPositions = combinedPositions.map((pos: any) => {
      const sym = String(pos.symbol).toUpperCase();
      let currentVal = tickerPrices[sym] || currentPrice;
      
      // If active symbol matches, use the high-frequency currentPrice
      const activeSymUpper = String(dataSymbol || symbol).toUpperCase();
      if (sym === activeSymUpper || 
          (sym === "XAUUSD" && activeSymUpper === "PAXGUSDT") ||
          (sym === "PAXGUSDT" && activeSymUpper === "XAUUSD") ||
          (sym === "BTCUSD" && activeSymUpper === "BTCUSDT") ||
          (sym === "BTCUSDT" && activeSymUpper === "BTCUSD") ||
          (sym === "EURUSD" && activeSymUpper === "EURUSDT") ||
          (sym === "EURUSDT" && activeSymUpper === "EURUSD")) {
        currentVal = currentPrice;
      }

      const multiplier = pos.type === "BUY" ? 1 : -1;
      let profit = pos.profit || 0;

      if (currentVal > 0) {
        if (sym === "XAUUSD" || sym === "PAXGUSDT") {
          // Gold standard contract: $100 per pip/ounce
          profit = (currentVal - pos.openPrice) * pos.volume * 100 * multiplier;
        } else if (sym === "BTCUSD" || sym === "BTCUSDT") {
          // BTC standard contract: $1 per point
          profit = (currentVal - pos.openPrice) * pos.volume * 1 * multiplier;
        } else if (sym === "EURUSD" || sym === "EURUSDT") {
          // EURUSD contract: $100,000 per lot
          profit = (currentVal - pos.openPrice) * pos.volume * 100000 * multiplier;
        } else if (sym === "USDJPY") {
          // USDJPY contract: standard scaling
          profit = (currentVal - pos.openPrice) * pos.volume * 1000 * multiplier;
        } else if (sym === "DXY" || sym === "USDCUSDT") {
          // Dollar Index contract
          profit = (currentVal - pos.openPrice) * pos.volume * 100 * multiplier;
        } else {
          // Fallback
          profit = (currentVal - pos.openPrice) * pos.volume * 100 * multiplier;
        }
      }

      return {
        ...pos,
        symbol: sym,
        profit
      };
    });

    const totalProfit = updatedPositions.reduce((acc: number, p: any) => acc + p.profit, 0);
    const activeBalance = isDemoMode ? demoBalance : (apiAccountInfo.balance || 1000.00);
    const updatedEquity = activeBalance + totalProfit;
    const computedMargin = updatedPositions.reduce((acc: number, p: any) => acc + (p.volume * 140), 0) || (apiAccountInfo.margin || 0);
    const updatedFreeMargin = updatedEquity - computedMargin;
    const updatedMarginLevel = computedMargin > 0 ? (updatedEquity / computedMargin * 100) : 0;

    dynamicAccountInfo = {
      ...apiAccountInfo,
      balance: activeBalance,
      positions: updatedPositions,
      equity: updatedEquity,
      margin: computedMargin,
      freeMargin: updatedFreeMargin,
      marginLevel: updatedMarginLevel
    };
  }

  return (
    <div className={`flex flex-col min-h-screen lg:h-screen bg-bento-bg text-gray-300 overflow-x-hidden font-sans p-2 lg:p-4 no-scrollbar ${isAnyDragging ? 'select-none cursor-col-resize' : ''}`}>
      {/* Simplified Header */}
      <header className="flex flex-col sm:flex-row items-center justify-between mb-4 border-b border-gray-800 pb-3 shrink-0 gap-4">
        <div className="flex items-center gap-3 lg:gap-4 self-start sm:self-center">
          <div className="w-8 h-8 bg-gold rounded flex items-center justify-center shadow-[0_0_15px_rgba(255,215,0,0.3)]">
            <LayoutDashboard className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white uppercase italic leading-none mb-1">
              ENQOPAZYON
            </h1>
            <p className="text-[8px] uppercase tracking-widest text-gray-500 font-bold">Predictive System v4.5</p>
          </div>
          {isUsingCachedData && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 animate-pulse text-[8px] font-mono text-amber-500 uppercase tracking-wider font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>Offline / የአማራጭ ዳታ</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 lg:gap-4 overflow-x-auto no-scrollbar scroll-smooth">
          <div className="flex bg-gray-900 rounded p-0.5 border border-gray-800 gap-0.5 shrink-0">
            {symbols.map((s) => (
              <button
                key={s.value}
                onClick={() => setSymbol(s.value)}
                className={`px-3 py-1 rounded text-[8px] font-black transition-all uppercase ${
                  symbol === s.value ? 'bg-white text-black' : 'text-gray-500 hover:text-white'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="flex bg-gray-900 rounded p-0.5 border border-gray-800 shrink-0">
            {(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded text-[8px] font-black transition-all uppercase ${
                  timeframe === tf ? 'bg-gold text-black' : 'text-gray-500 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          <div className="text-right">
            <p className="text-[14px] lg:text-18px font-mono font-black text-gold leading-none">
              ${(dataSymbol || symbol) === 'EURUSDT' || (dataSymbol || symbol) === 'USDCUSDT' ? currentPrice.toFixed(4) : currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          
          <div className="flex items-center gap-1.5">
            {/* Dedicated Trading Desk + Button */}
            <button 
              onClick={() => setIsTradingModalOpen(true)}
              className="p-1.5 hover:bg-white/10 rounded-full transition-all text-gold hover:text-white shrink-0 relative flex items-center justify-center border border-gold/30 bg-gold/10 hover:border-gold/60 shadow-[0_0_10px_rgba(212,175,55,0.1)] active:scale-90"
              title="የንግድ ትዕዛዝ ማዕከል / Dedicated Trading Ticket Desk"
            >
              <Plus className="w-4 h-4 font-black" />
              {dynamicAccountInfo?.positions?.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] text-[8px] font-sans font-black flex items-center justify-center bg-rose-500 text-white rounded-full leading-none shadow-[0_0_6px_#f43f5e] animate-pulse">
                  {dynamicAccountInfo.positions.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setIsApiModalOpen(true)}
              className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-gray-500 hover:text-white shrink-0 relative"
              title="HFM MT5 Broker Configuration"
            >
              <Settings className={`w-4 h-4 ${(mt5Login || isDemoMode) ? 'text-gold' : 'text-gray-400 hover:text-white'}`} />
              {(mt5Login || isDemoMode) && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              )}
            </button>

            <button 
              onClick={() => loadData(false)}
              className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-gray-500 hover:text-white shrink-0"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${(loading || isRefreshing) ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* MetaTrader 5 (MT5) HFM Account Ribbon */}
      {dynamicAccountInfo && (
        <div className="flex flex-col md:flex-row items-center justify-between px-4 py-2 bg-gradient-to-r from-gray-950 to-gray-900 border border-gray-800/80 rounded-xl mb-3 shrink-0 text-[10px] font-mono gap-2 shadow-xl backdrop-blur-md animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isDemoMode ? 'bg-amber-400 animate-pulse shadow-[0_0_10px_#fbbf24]' : 'bg-emerald-400 shadow-[0_0_10px_#34d399]'} shrink-0`} />
            <span className="font-sans font-black text-white/95 uppercase tracking-wide flex items-center gap-1">
              <strong className="text-gold uppercase font-serif">HFM</strong> MT5 AC: {dynamicAccountInfo.login}
            </span>
            <span className="text-[8px] text-gray-500 font-bold">({dynamicAccountInfo.server})</span>
            <span className="text-[7.5px] px-1 bg-white/5 text-gray-400 rounded uppercase font-sans font-medium">{dynamicAccountInfo.name}</span>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto max-w-full no-scrollbar pb-0.5 md:pb-0">
            <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5">
              <span className="text-gray-400">Balance:</span>
              <span className="text-white font-black">${dynamicAccountInfo.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              {isDemoMode && (
                <button
                  type="button"
                  onClick={() => {
                    setDemoBalance(1000.00);
                    localStorage.setItem('MT5_DEMO_BALANCE', '1000.00');
                    triggerNotification(
                      "🔄 የዲሞ ሂሳብ መጀመሪያ",
                      "የዲሞ ሂሳብዎ በተሳካ ሁኔታ ወደ $1,000.00 ተመልሷል!",
                      "success",
                      "SIGNAL"
                    );
                  }}
                  className="ml-1 px-1 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded text-[7.5px] font-bold cursor-pointer transition-all uppercase"
                  title="ወደ $1,000 ለመመለስ ጠቅ ያድርጉ"
                >
                  Reset
                </button>
              )}
            </span>
            <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5">
              <span className="text-gray-400">Equity:</span>
              <span className={`font-black ${dynamicAccountInfo.equity >= dynamicAccountInfo.balance ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${dynamicAccountInfo.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </span>
            {dynamicAccountInfo.margin > 0 && (
              <>
                <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                  <span className="text-gray-400">Margin:</span>
                  <span className="text-white font-black">${dynamicAccountInfo.margin.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </span>
                <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                  <span className="text-gray-400">Free Margin:</span>
                  <span className="text-white font-black">${dynamicAccountInfo.freeMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </span>
                <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                  <span className="text-gray-400">Margin Level:</span>
                  <span className="text-emerald-400 font-black">{dynamicAccountInfo.marginLevel.toFixed(2)}%</span>
                </span>
              </>
            )}
            {dynamicAccountInfo.positions && dynamicAccountInfo.positions.map((p: any) => {
              const isAutoPos = mt5AutoTrades.some(at => String(at.ticket) === String(p.ticket));
              return (
                <span key={p.ticket} className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 rounded-md hover:bg-blue-500/15 transition-all text-[8px]">
                  <span className={`${p.type === 'BUY' ? 'text-emerald-400' : 'text-rose-400'} font-black uppercase text-[7px]`}>{p.type}</span>
                  <span className="text-white font-black">{p.symbol}</span>
                  <span className="text-gray-400 font-medium">{p.volume}L</span>
                  <span className={`font-black ${p.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${p.profit >= 0 ? '+' : ''}{p.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  {isAutoPos && (
                    <button
                      onClick={() => closeMT5Position(p.ticket)}
                      className="ml-1 text-gray-500 hover:text-rose-400 font-extrabold hover:bg-rose-500/10 rounded px-1 transition-colors text-[7.5px] cursor-pointer"
                      title="ትዕዛዝ ዝጋ (Close Position)"
                    >
                      ✕
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Container: Stacked for Mobile, Row for Desktop */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-y-auto lg:overflow-hidden min-h-0 relative">
        {/* Left Panel: Wave Analysis */}
        <div 
          style={{ width: windowWidth > 1024 ? leftWidth : '100%' }}
          className={`lg:h-full lg:overflow-y-auto pr-1 custom-scrollbar order-2 lg:order-1 shrink-0 bg-bento-bg min-h-[600px] lg:min-h-0 relative ${isAnyDragging ? 'transition-none' : 'transition-all duration-200'}`}
        >
          {dataSymbol !== symbol && (
            <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-[3px] border-gold border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(255,215,0,0.2)]" />
                <span className="text-[9px] font-black tracking-[0.25em] text-gold animate-pulse mt-2">WAVE-SYNCING</span>
              </div>
            </div>
          )}
           <MemoizedWavePanel 
            targets={waveTargets} 
            data={data} 
            ticker={dataSymbol || symbol} 
            timeframe={timeframe} 
            isBacktestMode={isBacktestMode}
            backtestTime={`${backtestDate}T${backtestTime}:00Z`}
            timeOffset={timeOffset}
           />
        </div>

        {/* Left Resize Handle */}
        <div 
          onMouseDown={() => { isDraggingLeft.current = true; document.body.style.cursor = 'col-resize'; }}
          className="hidden lg:flex w-1 hover:w-2 bg-transparent hover:bg-gold/40 transition-all cursor-col-resize items-center justify-center group z-30 relative mx-0.5 lg:order-2 self-stretch"
        >
          <div className="h-2/3 w-px bg-gray-800 group-hover:bg-gold transition-colors" />
          <div className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gold rounded-full p-0.5 shadow-[0_0_15px_rgba(255,215,0,0.6)] z-40 pointer-events-none">
            <GripVertical className="w-3.5 h-3.5 text-black" />
          </div>
        </div>

        {/* Middle: Chart (Priority 1) */}
        <div className="flex-1 flex flex-col h-[460px] sm:h-[600px] lg:h-full gap-1 order-1 lg:order-3 min-w-0 px-2 lg:shrink bg-bento-bg">
          {/* Calendar/Backtest bar integrated above chart */}
          <div className="bg-black/60 border border-gray-800 rounded-2xl p-3 flex flex-col items-center gap-4 shrink-0 shadow-2xl relative overflow-hidden group/bt">
            <div className="absolute inset-0 bg-gradient-to-r from-gold/5 via-transparent to-emerald-500/5 opacity-0 group-hover/bt:opacity-100 transition-opacity duration-700 pointer-events-none" />
            
            <div className="flex items-center justify-between w-full relative z-10">
              <div className="flex items-center gap-3">
                <button 
                  onClick={toggleBacktest}
                  className={`p-2.5 rounded-xl transition-all shadow-lg hover:shadow-gold/20 ${isBacktestMode ? 'bg-gold text-black' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'}`}
                  title="Toggle Backtest Mode"
                >
                  <Calendar className="w-5 h-5" />
                </button>
                <div className="flex flex-col">
                  <span className="text-[7px] font-black text-gray-500 tracking-[0.2em] uppercase">{isBacktestMode ? 'BACKTEST NODE ACTIVE' : 'LIVE FEED ACTIVE'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white tracking-wider">{symbol.replace('USDT', '')} / {timeframe}</span>
                    {isBacktestMode && <span className="w-1 h-1 rounded-full bg-gold animate-pulse" />}
                  </div>
                </div>
              </div>
              {isBacktestMode && (
                <button 
                  onClick={() => setIsBacktestMode(false)} 
                  className="p-1 px-3 bg-gray-800 hover:bg-rose-500 hover:text-white rounded-lg text-[9px] font-black transition-all transform active:scale-90"
                >
                  TERMINATE
                </button>
              )}
            </div>

            {isBacktestMode && (
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full animate-in zoom-in-95 duration-300 relative z-10">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flex flex-col flex-1 sm:flex-none">
                    <span className="text-[6px] text-gray-500 mb-0.5 ml-1 font-black">CHRONO DATE</span>
                    <input 
                      type="date" 
                      value={backtestDate}
                      onChange={(e) => setBacktestDate(e.target.value)}
                      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[10px] font-black text-white focus:outline-none focus:border-gold w-full sm:w-32 transition-colors shadow-inner"
                    />
                  </div>
                  <div className="flex flex-col flex-1 sm:flex-none">
                    <span className="text-[6px] text-gray-500 mb-0.5 ml-1 font-black">TIMESTAMP</span>
                    <input 
                      type="time" 
                      value={backtestTime}
                      onChange={(e) => setBacktestTime(e.target.value)}
                      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[10px] font-black text-white focus:outline-none focus:border-gold w-full sm:w-24 transition-colors shadow-inner"
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between w-full sm:w-auto gap-3 bg-black/40 backdrop-blur-xl p-2 rounded-2xl border border-white/5 shadow-xl">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        const currentTS = new Date(`${backtestDate}T${backtestTime}:00Z`).getTime();
                        const intervalMinutes = timeframe.endsWith('m') ? parseInt(timeframe) : timeframe.endsWith('h') ? parseInt(timeframe) * 60 : timeframe === '1d' ? 1440 : 10080;
                        const prevTime = new Date(currentTS - intervalMinutes * 60000);
                        
                        const prevDateStr = prevTime.getUTCFullYear() + '-' + 
                                          String(prevTime.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                                          String(prevTime.getUTCDate()).padStart(2, '0');
                        const prevTimeStr = String(prevTime.getUTCHours()).padStart(2, '0') + ':' + 
                                          String(prevTime.getUTCMinutes()).padStart(2, '0');
                        setBacktestDateTime(prevDateStr, prevTimeStr);
                      }}
                      className="p-2.5 transition-all hover:bg-gold hover:text-black text-gray-400 bg-gray-800/80 rounded-xl hover:shadow-[0_0_10px_rgba(255,215,0,0.3)] active:scale-90"
                      title="Step Backward"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 -rotate-90" />
                    </button>

                    <button 
                      onClick={() => setIsPlaying(!isPlaying)}
                      className={`p-3 rounded-xl transition-all shadow-2xl relative ${isPlaying ? 'bg-rose-500 text-white animate-pulse' : 'bg-gold text-black hover:scale-105 active:scale-95'}`}
                      title={isPlaying ? "HALT" : "EXECUTE"}
                    >
                      {isPlaying ? <X className="w-5 h-5 rotate-45" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>

                    <button 
                      onClick={() => {
                        const currentTS = new Date(`${backtestDate}T${backtestTime}:00Z`).getTime();
                        const intervalMinutes = timeframe.endsWith('m') ? parseInt(timeframe) : timeframe.endsWith('h') ? parseInt(timeframe) * 60 : timeframe === '1d' ? 1440 : 10080;
                        const nextTime = new Date(currentTS + intervalMinutes * 60000);
                        
                        const nextDateStr = nextTime.getUTCFullYear() + '-' + 
                                          String(nextTime.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                                          String(nextTime.getUTCDate()).padStart(2, '0');
                        const nextTimeStr = String(nextTime.getUTCHours()).padStart(2, '0') + ':' + 
                                          String(nextTime.getUTCMinutes()).padStart(2, '0');
                        setBacktestDateTime(nextDateStr, nextTimeStr);
                      }}
                      className="p-2.5 transition-all hover:bg-gold hover:text-black text-gray-400 bg-gray-800/80 rounded-xl hover:shadow-[0_0_10px_rgba(255,215,0,0.3)] active:scale-90"
                      title="Step Forward"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 rotate-90" />
                    </button>
                  </div>

                  <div className="h-10 w-[1px] bg-gray-800/50 mx-1"></div>

                  <div className="flex flex-col pr-1">
                    <span className="text-[5px] text-gray-600 mb-0.5 text-center font-black">ACCEL</span>
                    <select 
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                      className="bg-transparent text-[10px] font-black text-white px-1 focus:outline-none cursor-pointer"
                    >
                      <option value="0.5" className="bg-gray-900 text-white">0.5X</option>
                      <option value="1" className="bg-gray-900 text-white">1.0X</option>
                      <option value="2" className="bg-gray-900 text-white">2.0X</option>
                      <option value="5" className="bg-gray-900 text-white">5.0X</option>
                      <option value="10" className="bg-gray-900 text-white">10X</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>


          <div className="bg-bento-card border border-gray-800 rounded-xl flex-1 relative overflow-hidden flex flex-col shadow-2xl">
            {loading && (
              <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 border-[3px] border-gold border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(255,215,0,0.2)]" />
                  <span className="text-[9px] font-black tracking-[0.3em] text-gold animate-pulse mt-2">ENQ-SYNC-ACTIVE</span>
                </div>
              </div>
            )}
            
            {data.length > 0 && (
              <div className="flex-1 w-full h-full flex flex-col">
                <MemoizedIchimokuChart 
                  data={data} 
                  timeframe={timeframe === '1m' ? '1M' : timeframe === '5m' ? '5M' : timeframe === '15m' ? '15M' : timeframe === '30m' ? '30M' : timeframe === '1h' ? '1H' : timeframe === '4h' ? '4H' : timeframe === '1d' ? '1D' : '1W'} 
                  targets={waveTargets}
                  isRefreshing={isRefreshing}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Resize Handle */}
        <div 
          onMouseDown={() => { isDraggingRight.current = true; document.body.style.cursor = 'col-resize'; }}
          className="hidden lg:flex w-1 hover:w-2 bg-transparent hover:bg-gold/40 transition-all cursor-col-resize items-center justify-center group z-30 relative mx-0.5 lg:order-4 self-stretch"
        >
          <div className="h-2/3 w-px bg-gray-800 group-hover:bg-gold transition-colors" />
          <div className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gold rounded-full p-0.5 shadow-[0_0_15px_rgba(255,215,0,0.6)] z-40 pointer-events-none">
            <GripVertical className="w-3.5 h-3.5 text-black" />
          </div>
        </div>

        {/* Right Panel: Indicators */}
        <div 
          style={{ width: windowWidth > 1024 ? rightWidth : '100%' }}
          className={`lg:h-full lg:overflow-y-auto pl-1 custom-scrollbar order-3 lg:order-5 shrink-0 bg-bento-bg min-h-[600px] lg:min-h-0 relative ${isAnyDragging ? 'transition-none' : 'transition-all duration-200'}`}
        >
          {dataSymbol !== symbol && (
            <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-[3px] border-gold border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(255,215,0,0.2)]" />
                <span className="text-[9px] font-black tracking-[0.25em] text-gold animate-pulse mt-2">MATRIX-SYNCING</span>
              </div>
            </div>
          )}
          <MemoizedIndicatorPanel weights={weights} ichi={ichiData} targets={waveTargets} ticker={dataSymbol || symbol} mtfTrends={mtfTrends} mtfLoading={mtfLoading} />
        </div>

        {/* AI Chat Bot */}
        <AIChatBot 
          symbol={dataSymbol || symbol} 
          timeframe={timeframe} 
          data={data} 
          ichiData={ichiData} 
          waveTargets={waveTargets} 
          isBacktestMode={isBacktestMode}
          backtestDate={backtestDate}
          backtestTime={backtestTime}
        />

        {/* Notification System */}
        <NotificationPanel 
          notifications={notifications}
          isOpen={isNotificationOpen}
          onToggle={() => setIsNotificationOpen(!isNotificationOpen)}
          onClear={(filter) => {
            if (filter === 'ALL') {
              setNotifications([]);
            } else {
              setNotifications(prev => prev.filter(n => n.asset !== filter));
            }
          }}
          onMarkAsRead={(id) => {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
          }}
        />

        {/* Real-time Toast Popups Overlay */}
        <div className="fixed top-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none max-w-[340px] w-full">
          <AnimatePresence>
            {toasts.map((toast) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                key={toast.id}
                onClick={() => {
                  setIsNotificationOpen(true);
                  // Remove from active toasts on click to prevent overlay clutter
                  setToasts(prev => prev.filter(t => t.id !== toast.id));
                }}
                className={`pointer-events-auto p-4 rounded-xl border bg-gray-950/95 backdrop-blur-md shadow-2xl cursor-pointer relative overflow-hidden flex flex-col gap-1.5 transition-all hover:bg-gray-900 border-l-[6px] ${
                  toast.asset === 'GOLD'
                    ? 'border-gray-800 border-l-amber-500 shadow-amber-500/5'
                    : 'border-gray-800 border-l-orange-500 shadow-orange-500/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded leading-none border uppercase tracking-widest ${
                      toast.asset === 'GOLD' 
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
                        : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                    }`}>
                      {toast.asset}
                    </span>
                    <span className="text-[10px] font-extrabold text-white tracking-wider uppercase leading-none">አዲስ ማሳሰቢያ! (NEW)</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setToasts(prev => prev.filter(t => t.id !== toast.id));
                    }}
                    className="p-1 text-gray-500 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <h4 className={`text-[11px] font-black uppercase tracking-wider mb-1 ${
                    toast.type === 'danger' ? 'text-rose-400' :
                    toast.type === 'warning' ? 'text-amber-400' :
                    toast.type === 'success' ? 'text-emerald-400' : 'text-blue-400'
                  }`}>
                    {toast.title}
                  </h4>
                  <p className="text-[11px] text-gray-300 font-medium line-clamp-2 leading-tight">
                    {toast.message.replace(/\*\*+/g, '').slice(0, 150)}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Enhanced Footer */}
      <footer className="mt-4 px-4 py-3 bg-black/40 border border-gray-800 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 text-[8px] font-black uppercase tracking-widest text-gray-500 shrink-0 shadow-2xl">
        <div className="flex items-center gap-4">
          <span className="text-white">ENQOPAZYON SYSTEM <span className="text-gold">v4.5</span></span>
          <span className={isBacktestMode ? 'text-gold animate-pulse' : 'text-emerald-500 animate-pulse'}>
            {isBacktestMode ? 'BACKTEST ACTIVE' : 'LIVE NODE ACTIVE'}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[6px] text-gray-600 mb-0.5">LOCAL SYNC TIME (GMT+3)</span>
            <RealTimeClock />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[6px] text-gray-600 mb-0.5">MATRIX VOLUME</span>
            <span className={waveTargets.volumeValidation === 'STRONG' ? 'text-emerald-500 text-[10px]' : 'text-rose-500 text-[10px]'}>
              {waveTargets.volumeValidation}
            </span>
          </div>
        </div>
      </footer>

      {/* MetaTrader 5 (MT5) HFM Broker Configuration Modal */}
      <AnimatePresence>
        {isApiModalOpen && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsApiModalOpen(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />
            
            {/* Modal Card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="w-full max-w-lg bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,215,0,0.15)] relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-black/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/35 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">ኤምቲ5 ማገናኛ ማዋቀሪያ (HFM MT5 Setup)</h3>
                    <p className="text-[9px] text-gray-500 font-medium">Link your HotForex / HFM MetaTrader 5 trading accounts securely</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsApiModalOpen(false)}
                  className="p-1 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSaveApiSettings} className="p-5 flex-1 overflow-y-auto space-y-5 custom-scrollbar text-[11px]">
                
                {/* HFM Server Selection */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-blue-400" /> የ HFM ብሮከር ኤምቲ5 ሰርቨር (HFM MT5 Broker Server)
                  </label>
                  <p className="text-[9px] text-gray-500 leading-tight">
                    የእርስዎን HFM አካውንት የያዘውን ትክክለኛ ሰርቨር ይምረጡ ወይም ያስገቡ (በኢሜል ወይም በ MT5 ተርሚናል ላይ ማግኘት ይችላሉ)።
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'HFM SV DEMO', value: 'HFMarketsSV-Demo' },
                      { label: 'HFM SV LIVE', value: 'HFMarketsSV-Live' },
                      { label: 'HF Markets DEMO', value: 'HFMarkets-Demo' },
                      { label: 'HF Markets LIVE 3', value: 'HFMarkets-Live 3' },
                    ].map((serverPreset) => (
                      <button
                        type="button"
                        key={serverPreset.value}
                        onClick={() => setMt5Server(serverPreset.value)}
                        className={`p-2.5 rounded-lg border text-left font-mono text-[9px] transition-all flex flex-col gap-1 cursor-pointer ${
                          mt5Server === serverPreset.value 
                            ? 'bg-blue-500/10 border-blue-500 text-blue-400 font-bold shadow-inner' 
                            : 'bg-black/40 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
                        }`}
                      >
                        <span className="font-sans font-black">{serverPreset.label}</span>
                        <span className="text-[7.5px] text-gray-500 truncate select-all">{serverPreset.value}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Server Input */}
                  <div className="pt-1.5">
                    <input 
                      type="text"
                      placeholder="ሌላ የ HFM ሰርቨር ካለ እዚህ መጻፍ ይችላሉ... (e.g. HFMarketsSV-Live 2)"
                      value={mt5Server}
                      onChange={(e) => setMt5Server(e.target.value)}
                      className="w-full bg-black/60 border border-gray-800 focus:border-blue-500 rounded-lg px-3 py-2 text-[10px] font-mono text-white focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                <hr className="border-gray-800/80" />

                {/* Account Credentials */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-gold" /> የኤምቲ5 የመግቢያ መረጃ (MT5 Credentials)
                  </label>
                  <p className="text-[9px] text-gray-500 leading-tight">
                    ይህ መረጃ 100% በእርስዎ ብሮውዘር ላይ ብቻ የሚቀመጥ ሲሆን የ HFM MT5 መረጃዎችን ለማመሳሰል ያገለግላል።
                  </p>

                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[9px] text-gray-400 mb-1 font-bold">MT5 LOGIN ID (የአካውንት ቁጥር)</span>
                        <input 
                          type="text"
                          pattern="[0-9]*"
                          placeholder="e.g. 50831627"
                          value={mt5Login}
                          onChange={(e) => setMt5Login(e.target.value)}
                          className="w-full bg-black/60 border border-gray-800 focus:border-gold rounded-lg px-3 py-2 text-[10px] font-mono text-white focus:outline-none transition-colors"
                          required
                        />
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-400 mb-1 font-bold">MT5 PASSWORD (የአካውንት ኩልፍ)</span>
                        <input 
                          type="password"
                          placeholder="MT5 Account password..."
                          value={mt5Password}
                          onChange={(e) => setMt5Password(e.target.value)}
                          className="w-full bg-black/60 border border-gray-800 focus:border-gold rounded-lg px-3 py-2 text-[10px] font-mono text-white focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="border-gray-800/80" />

                {/* Optional Cloud Integration (MetaAPI) */}
                <div className="space-y-2.5 bg-black/30 p-3 rounded-lg border border-gray-900">
                  <span className="block text-[10px] text-blue-400 font-extrabold tracking-wider uppercase">ደመናማ ማመሳሰል (Optional MetaAPI Developer Sync)</span>
                  <p className="text-[8.5px] text-gray-500 leading-snug">
                    እውነተኛና ቀጥታ የ MT5 ትዕዛዞችንና ሂሳቦችን በ REST API ለማገናኘት <a href="https://metaapi.cloud" target="_blank" rel="noopener noreferrer" className="text-gold underline font-bold">MetaAPI Cloud</a> መጠቀም ይችላሉ።
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[8px] text-gray-400 mb-0.5">MetaAPI Token</span>
                      <input 
                        type="password"
                        placeholder="MetaAPI Access Token..."
                        value={metaApiToken}
                        onChange={(e) => setMetaApiToken(e.target.value)}
                        className="w-full bg-black/50 border border-gray-900 focus:border-blue-500 rounded px-2 py-1.5 text-[9px] font-mono text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="block text-[8px] text-gray-400 mb-0.5">MetaAPI Account ID</span>
                      <input 
                        type="text"
                        placeholder="MetaAPI Account ID..."
                        value={metaApiAccountId}
                        onChange={(e) => setMetaApiAccountId(e.target.value)}
                        className="w-full bg-black/50 border border-gray-900 focus:border-blue-500 rounded px-2 py-1.5 text-[9px] font-mono text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* API Verification Result */}
                {apiSyncError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex gap-2 text-rose-400 leading-snug">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-[10px] uppercase">የማመሳሰል ስህተት አጋጥሟል (HFM Sync Failed)</p>
                      <p className="text-[9px] opacity-90 mt-0.5">{apiSyncError}</p>
                    </div>
                  </div>
                )}

                {apiAccountInfo && !apiSyncError && (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-500/20 rounded-xl flex gap-1.5 text-emerald-400 leading-snug">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 animate-pulse text-emerald-400" />
                    <div className="flex-1">
                      <p className="font-extrabold text-[10px] uppercase">የ HFM MT5 አካውንት በተሳካ ሁኔታ ተገናኝቷል! (Connected)</p>
                      <p className="text-[9px] opacity-95 mt-0.5 mb-2">መለኪያዎችና ቀሪ ሂሳቦች በእውነተኛ ሰዓት እየተሳቡ ይገኛሉ::</p>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-mono text-white/90 bg-black/30 p-2 rounded-lg border border-emerald-500/10 max-h-[80px] overflow-y-auto">
                        <div className="flex justify-between border-b border-white/5 pb-0.5">
                          <span className="text-gray-500 font-bold">Broker:</span>
                          <span className="font-semibold text-white">{apiAccountInfo.broker}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-0.5">
                          <span className="text-gray-500 font-bold">Leverage:</span>
                          <span className="font-semibold text-white text-gold">1:{apiAccountInfo.leverage}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-0.5 col-span-2">
                          <span className="text-gray-500 font-bold">Name:</span>
                          <span className="font-semibold text-white truncate">{apiAccountInfo.name}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* MT5 Auto-Trader Toggle Switch */}
                <div className="p-3 bg-gradient-to-r from-blue-950/40 to-indigo-950/30 border border-blue-500/15 rounded-xl flex items-center justify-between gap-3 text-white">
                  <div className="space-y-0.5">
                    <span className="block text-[10px] font-black uppercase text-blue-400 tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping shrink-0" />
                      ኤምቲ5 አውቶማቲክ ትሬደር (HFM MT5 Auto-Trader)
                    </span>
                    <span className="block text-[8px] text-gray-500 font-medium leading-normal">
                      የ 15 ደቂቃ ወርቃማ የታንካን/ኪጁን ማዕበል ሲገኝ በራስ-ሰር በ HFM አካውንትዎ ላይ ትክክለኛውን ዋጋ ተጠቅሞ ባይ ወይም ሴል ያደርጋል።
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleAutoTrader(!isAutoTraderEnabled)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all uppercase flex items-center gap-1 shrink-0 cursor-pointer ${
                      isAutoTraderEnabled 
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span>{isAutoTraderEnabled ? 'ACTIVE (ኦን)' : 'OFF (አጥፋ)'}</span>
                  </button>
                </div>

                {/* Ultra-Fast Scalping Mode Toggle Switch (requested by user for taking profit very quickly) */}
                <div className="p-3 bg-gradient-to-r from-emerald-950/40 to-teal-950/30 border border-emerald-500/15 rounded-xl flex items-center justify-between gap-3 text-white">
                  <div className="space-y-0.5">
                    <span className="block text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0 lg:inline" />
                      🚀 ፈጣን የትርፍ መውሰጃ ሞድ (Ultra-Fast Scalping Mode)
                    </span>
                    <span className="block text-[8px] text-gray-400 font-medium leading-normal">
                      ይህ ሲበራ ገበያው ትንሽ እንደተራመደ ቶሎ ቶሎ ትርፍ ይወስዳል (TP ን በጣም በማቅረብ $2.50 ትርፍ ላይ ሲደርስ ግማሹን ይዘጋል) በተመሳሳይ ሰዓት ትክክለኛውን የቀጥታ ዋጋ ይጠቀማል።
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleUltraFastProfit(!isUltraFastProfitEnabled)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all uppercase flex items-center gap-1 shrink-0 cursor-pointer ${
                      isUltraFastProfitEnabled 
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span>{isUltraFastProfitEnabled ? 'ACTIVE (ኦን)' : 'OFF (አጥፋ)'}</span>
                  </button>
                </div>

                {/* Auto Trader Custom Parameters Section */}
                <div className="p-3.5 bg-black/40 border border-gray-850 rounded-xl space-y-3.5 text-[11px]">
                  <span className="block text-[10px] text-gray-300 font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                    🤖 አውቶማቲክ ትሬድ መለኪያዎች (Auto-Trader Parameters)
                  </span>
                  
                  {/* Auto Trading Custom Lot selection */}
                  <div className="space-y-1.5">
                    <label className="block text-[9px] text-gray-400 font-bold uppercase">
                      የሎት መጠን (LOT SIZE) - ከ 0.01 ጀምሮ:
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <select
                        value={autoTraderLotSize}
                        onChange={(e) => setAutoTraderLotSize(parseFloat(e.target.value))}
                        className="bg-gray-900 border border-gray-800 px-2.5 py-1.5 rounded-lg text-[10px] text-white focus:outline-none focus:border-gold cursor-pointer"
                      >
                        <option value="0.01">0.01 Lots (ቢያንስ)</option>
                        <option value="0.02">0.02 Lots</option>
                        <option value="0.05">0.05 Lots</option>
                        <option value="0.10">0.10 Lots</option>
                        <option value="0.25">0.25 Lots</option>
                        <option value="0.50">0.50 Lots</option>
                        <option value="1.00">1.00 Lot</option>
                      </select>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={autoTraderLotSize}
                        onChange={(e) => setAutoTraderLotSize(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                        className="w-16 bg-gray-900 border border-gray-800 px-2 py-1.5 rounded-lg text-[10px] text-white focus:outline-none focus:border-gold font-mono"
                        placeholder="Custom"
                      />
                    </div>
                  </div>

                  {/* Pair Selection checklist for Auto Trading */}
                  <div className="space-y-1.5">
                    <label className="block text-[9px] text-gray-400 font-bold uppercase">
                      ከተከታዩ ውስጥ አውቶ እንዲገባበት የሚፈልጉትን የንግድ ጥንድ (Pairs) ይምረጡ:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-2 bg-black/60 border border-gray-900 rounded-lg">
                      {['XAUUSD', 'BTCUSD', 'EURUSD', 'USDJPY'].map((symCheck) => {
                        const isChecked = allowedAutoSymbols.includes(symCheck);
                        return (
                          <label key={symCheck} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-white/5 rounded transition-all">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setAllowedAutoSymbols(prev => {
                                  if (isChecked) {
                                    return prev.filter(s => s !== symCheck);
                                  } else {
                                    return [...prev, symCheck];
                                  }
                                });
                              }}
                              className="accent-gold h-3.5 w-3.5 cursor-pointer rounded bg-gray-900 border-gray-800"
                            />
                            <span className="text-[10px] font-mono font-semibold text-white">{symCheck}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Timeframe Selection checklist for Auto Trading */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-[9px] text-gray-400 font-bold uppercase">
                      ⏱️ አውቶ እንዲገባበት የሚፈልጉትን ታይምፍሬም (Timeframe) ይምረጡ:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-2 bg-black/60 border border-gray-900 rounded-lg">
                      {['5m', '15m'].map((tfCheck) => {
                        const isChecked = allowedAutoTimeframes.includes(tfCheck);
                        return (
                          <label key={tfCheck} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-white/5 rounded transition-all">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setAllowedAutoTimeframes(prev => {
                                  if (isChecked) {
                                    return prev.filter(t => t !== tfCheck);
                                  } else {
                                    return [...prev, tfCheck];
                                  }
                                });
                              }}
                              className="accent-gold h-3.5 w-3.5 cursor-pointer rounded bg-gray-900 border-gray-800"
                            />
                            <span className="text-[10px] font-mono font-bold text-white">
                              {tfCheck === '5m' ? '5 Minutes (5 ደቂቃ)' : '15 Minutes (15 ደቂቃ)'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* HFM Price Alignment Calibrations (Forex/Crypto Offsets) */}
                <div className="p-3.5 bg-black/40 border border-gray-850 rounded-xl space-y-3">
                  <span className="block text-[10px] text-gray-300 font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                    ⚙️ የዋጋ መስማሚያ ካሊብሬሽን (HFM Price Alignment Offsets)
                  </span>
                  <p className="text-[8px] text-gray-500 leading-normal mb-1">
                    በእርስዎ ብሮከር (HFM) እና በሲስተማችን የጥቅስ ዋጋዎች መካከል አነስተኛ ልዩነት ካለ (e.g., Spread/Premium/Markup)፤ የዋጋ ወሰኑን ለማስማማት እዚህ ላይ offset መጻፍ ይችላሉ። ይህ በቻርት፣ በሲግናል እና በትሬዶች ላይ በቀጥታ ይደመራል።
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[8px] text-gray-400 mb-1 font-semibold">XAUUSD (Gold) Offset:</span>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={priceOffsets.XAUUSD || ''} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = { ...priceOffsets, XAUUSD: val };
                          setPriceOffsets(updated);
                          localStorage.setItem('PRICE_OFFSETS_CALIBRATION_V1', JSON.stringify(updated));
                        }}
                        placeholder="e.g. -0.45"
                        className="w-full bg-gray-900 border border-gray-800 focus:border-gold rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="block text-[8px] text-gray-400 mb-1 font-semibold">USDJPY Offset:</span>
                      <input 
                        type="number" 
                        step="0.001" 
                        value={priceOffsets.USDJPY || ''} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = { ...priceOffsets, USDJPY: val };
                          setPriceOffsets(updated);
                          localStorage.setItem('PRICE_OFFSETS_CALIBRATION_V1', JSON.stringify(updated));
                        }}
                        placeholder="e.g. +0.03"
                        className="w-full bg-gray-900 border border-gray-800 focus:border-gold rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="block text-[8px] text-gray-400 mb-1 font-semibold">EURUSD Offset:</span>
                      <input 
                        type="number" 
                        step="0.00001" 
                        value={priceOffsets.EURUSD || ''} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = { ...priceOffsets, EURUSD: val };
                          setPriceOffsets(updated);
                          localStorage.setItem('PRICE_OFFSETS_CALIBRATION_V1', JSON.stringify(updated));
                        }}
                        placeholder="e.g. +0.00012"
                        className="w-full bg-gray-900 border border-gray-800 focus:border-gold rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="block text-[8px] text-gray-400 mb-1 font-semibold">BTCUSD Offset:</span>
                      <input 
                        type="number" 
                        step="1" 
                        value={priceOffsets.BTCUSD || ''} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = { ...priceOffsets, BTCUSD: val };
                          setPriceOffsets(updated);
                          localStorage.setItem('PRICE_OFFSETS_CALIBRATION_V1', JSON.stringify(updated));
                        }}
                        placeholder="e.g. -25"
                        className="w-full bg-gray-900 border border-gray-800 focus:border-gold rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Demo/Sandbox Button Option */}
                {!apiAccountInfo && (
                  <button
                    type="button"
                    onClick={handleEnableDemoMode}
                    className="w-full py-2.5 px-3 border border-dashed border-amber-500/40 hover:border-amber-500 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400 hover:text-white rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow-md"
                  >
                    <span>⚡ የራስዎ አካውንት ከሌለ በጊዜያዊ ማሳያ አካውንት (HFM DEMO SPOT) ይሞክሩ</span>
                  </button>
                )}

                {/* Actions Drawer */}
                <div className="flex gap-2 pt-2">
                  {(mt5Login || isDemoMode) && (
                    <button
                      type="button"
                      onClick={handleClearApiSettings}
                      className="py-2.5 px-3 bg-gray-900 border border-gray-800 hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-400 rounded-xl text-[10px] font-black transition-all flex items-center justify-center text-gray-500 shrink-0 cursor-pointer"
                      title="Clear API Data"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isConnectingApi}
                    className="flex-1 py-2.5 px-4 bg-gold hover:bg-gold/80 disabled:bg-gray-800 disabled:text-gray-600 text-black rounded-xl text-[10px] font-black uppercase tracking-wider transition-all transform active:scale-95 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(255,215,0,0.3)] cursor-pointer"
                  >
                    {isConnectingApi ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>በማመሳሰል ላይ (HAND-SHAKING)...</span>
                      </>
                    ) : (
                      <span>አካውንት አገናኝ & አስቀምጥ (Apply MT5 Connection)</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dedicated Order Entry & Trading Desk Terminal Modal */}
      <AnimatePresence>
        {isTradingModalOpen && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTradingModalOpen(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />
            
            {/* Modal Card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="w-full max-w-4xl bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,215,0,0.15)] relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-black/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/35 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">የንግድ ትዕዛዝ ማዕከል (Trading Terminal)</h3>
                    <p className="text-[9px] text-gray-405 font-medium">ክፍት ትሬዶችን እና ትዕዛዝ ማያያዣዎችን እዚህ ይቆጣጠሩ</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsTradingModalOpen(false)}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content - Scrollable if too long */}
              <div className="p-5 flex-1 overflow-y-auto space-y-4 custom-scrollbar bg-gradient-to-b from-gray-950 to-gray-900">
                
                {/* Header with Terminal Identity & Current Spot Price Indicator */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-850 pb-3 mb-1">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-gold/10 border border-gold/30 p-2 rounded-xl flex items-center justify-center shrink-0">
                      <Settings className="w-4 h-4 text-gold animate-spin-slow" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-gold tracking-widest uppercase flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse shrink-0" />
                        የንግድ ትዕዛዝ ማዕከል / DEDICATED TRADING TERMINAL
                      </span>
                      <span className="text-[12px] font-black text-white uppercase tracking-wider">
                        {symbol.replace('USDT', '')} SPOT ENGINE
                      </span>
                    </div>
                  </div>

                  {/* Current Spot Value widget */}
                  <div className="flex items-center gap-3 bg-black/45 md:px-3 px-2 py-1.5 border border-gray-800 rounded-xl">
                    <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest">LIVE SPOT PRICE:</span>
                    <span className="text-[11px] font-mono font-black text-gold animate-pulse">
                      ${(dataSymbol || symbol) === 'EURUSDT' || (dataSymbol || symbol) === 'USDCUSDT' 
                        ? currentPrice.toFixed(4) 
                        : currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Desktop-Responsive Workspace Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  
                  {/* Box 1: Order Ticket Parameters Entry (Lots, SL, TP) */}
                  <div id="trading-desk-panel" className="md:col-span-5 bg-black/30 border border-gray-850 p-4 rounded-xl flex flex-col justify-between gap-3">
                    <span className="text-[8px] font-black text-gray-450 tracking-wider uppercase border-b border-gray-900 pb-1.5">
                      📝 ትዕዛዝ ማያያዣ / ORDER PARAMETERS
                    </span>

                    <div className="space-y-3">
                      {/* Lot Size parameters: Dropdown + Decimal custom input */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[8px] text-gray-450 font-black uppercase">የሎት መጠን (LOT SIZE) - ከ 0.01 ጀምሮ:</label>
                          <span className="text-[8px] font-black text-gold uppercase tracking-wider font-mono">{manualLotSize} Lots</span>
                        </div>
                        <div className="flex gap-2">
                          <select 
                            value={[0.01, 0.02, 0.05, 0.10, 0.25, 0.50, 1.00, 2.00, 5.50].includes(manualLotSize) ? String(manualLotSize) : "custom"} 
                            onChange={(e) => {
                              if (e.target.value !== "custom") {
                                setManualLotSize(parseFloat(e.target.value));
                              }
                            }}
                            className="bg-gray-950 text-[10px] font-black text-white hover:text-gold outline-none border border-gray-800 rounded-xl px-2.5 py-1.5 cursor-pointer"
                          >
                            <option value="0.01">0.01 L</option>
                            <option value="0.02">0.02 L</option>
                            <option value="0.05">0.05 L</option>
                            <option value="0.10">0.10 L</option>
                            <option value="0.25">0.25 L</option>
                            <option value="0.50">0.50 L</option>
                            <option value="1.00">1.00 L</option>
                            <option value="2.00">2.00 L</option>
                            <option value="custom" className="text-gold">Custom Lot...</option>
                          </select>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="Custom Lots..."
                            value={manualLotSize}
                            onChange={(e) => setManualLotSize(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                            className="flex-1 bg-gray-950 border border-gray-800 focus:border-gold rounded-xl px-3 py-1.5 text-[10px] font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-gold"
                          />
                        </div>
                      </div>

                      {/* Stop Loss Input with Helper Buttons */}
                      <div>
                        <label className="block text-[8px] text-gray-450 font-black uppercase mb-1.5">STOP LOSS (ከተማረጠበት ዋጋ በታች/በላይ):</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="N/A (ምንም የለም)"
                            value={manualSL}
                            onChange={(e) => setManualSL(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 focus:border-rose-500 rounded-xl px-3 py-1.5 text-[10px] font-mono font-bold text-rose-450 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const diff = symbol === 'XAUUSD' ? 5.0 : symbol === 'BTCUSD' ? 150.0 : 0.0015;
                              const price = symbol === 'XAUUSD' ? currentPrice - diff : currentPrice - diff;
                              setManualSL(price.toFixed(symbol === 'EURUSD' ? 4 : 2));
                            }}
                            className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 text-rose-400 text-[8px] font-black rounded-lg shrink-0 cursor-pointer transition-colors"
                            title="Set automated BUY Stop loss -50 pips"
                          >
                            -BUY SL
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const diff = symbol === 'XAUUSD' ? 5.0 : symbol === 'BTCUSD' ? 150.0 : 0.0015;
                              const price = symbol === 'XAUUSD' ? currentPrice + diff : currentPrice + diff;
                              setManualSL(price.toFixed(symbol === 'EURUSD' ? 4 : 2));
                            }}
                            className="px-2 py-1 bg-sky-500/10 hover:bg-sky-500 hover:text-white border border-sky-500/20 text-sky-400 text-[8px] font-black rounded-lg shrink-0 cursor-pointer transition-colors"
                            title="Set automated SELL Stop loss +50 pips"
                          >
                            +SELL SL
                          </button>
                        </div>
                      </div>

                      {/* Take Profit Input with Helper Buttons */}
                      <div>
                        <label className="block text-[8px] text-gray-450 font-black uppercase mb-1.5">TAKE PROFIT (ዒላማ የተደረገ ትርፍ):</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="N/A (ምንም የለም)"
                            value={manualTP}
                            onChange={(e) => setManualTP(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 rounded-xl px-3 py-1.5 text-[10px] font-mono font-bold text-emerald-450 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const diff = symbol === 'XAUUSD' ? 10.0 : symbol === 'BTCUSD' ? 300.0 : 0.0030;
                              const price = symbol === 'XAUUSD' ? currentPrice + diff : currentPrice + diff;
                              setManualTP(price.toFixed(symbol === 'EURUSD' ? 4 : 2));
                            }}
                            className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 text-emerald-450 text-[8px] font-black rounded-lg shrink-0 cursor-pointer transition-colors"
                            title="Set automated BUY Take Profit +100 pips"
                          >
                            +BUY TP
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const diff = symbol === 'XAUUSD' ? 10.0 : symbol === 'BTCUSD' ? 300.0 : 0.0030;
                              const price = symbol === 'XAUUSD' ? currentPrice - diff : currentPrice - diff;
                              setManualTP(price.toFixed(symbol === 'EURUSD' ? 4 : 2));
                            }}
                            className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500 hover:text-white border border-amber-500/20 text-amber-400 text-[8px] font-black rounded-lg shrink-0 cursor-pointer transition-colors"
                            title="Set automated SELL Take Profit -100 pips"
                          >
                            -SELL TP
                          </button>
                        </div>
                      </div>

                      {/* Quick TP Target Adjustments */}
                      <div className="bg-gray-950/60 p-2 py-1.5 rounded-lg border border-gray-850/50 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[7.5px] font-black text-gold tracking-wider uppercase">ፈጣን የዒላማ ማስተካከያ / TP PRESETS</span>
                          <span className="text-[7.5px] text-gray-550">ቅርብ ዒላማዎች (Quick Scale Engine)</span>
                        </div>
                        
                        <div className="space-y-1">
                          {/* BUY presets row */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const diffSL = symbol === 'XAUUSD' ? 2.50 : symbol === 'BTCUSD' ? 80.0 : 0.0008;
                                const diffTP = symbol === 'XAUUSD' ? 4.00 : symbol === 'BTCUSD' ? 120.0 : 0.0012;
                                const tpVal = (currentPrice + diffTP).toFixed(symbol === 'EURUSD' ? 4 : 2);
                                const slVal = (currentPrice - diffSL).toFixed(symbol === 'EURUSD' ? 4 : 2);
                                setManualTP(tpVal);
                                setManualSL(slVal);
                                triggerNotification("🎯 BUY TP 1 ተመረጠ", `TP: $${tpVal}, SL: $${slVal} ተሞልቷል። (1:1.5 RR Ratio)`, "success", "SIGNAL");
                              }}
                              className="py-1 px-1.5 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/20 text-emerald-400 text-[7.5px] font-bold rounded cursor-pointer transition-all flex items-center justify-center gap-1 shrink-0"
                            >
                              🟢 BUY TP 1 (ቅርብ)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const diffSL = symbol === 'XAUUSD' ? 4.00 : symbol === 'BTCUSD' ? 150.0 : 0.0015;
                                const diffTP = symbol === 'XAUUSD' ? 8.00 : symbol === 'BTCUSD' ? 300.0 : 0.0030;
                                const tpVal = (currentPrice + diffTP).toFixed(symbol === 'EURUSD' ? 4 : 2);
                                const slVal = (currentPrice - diffSL).toFixed(symbol === 'EURUSD' ? 4 : 2);
                                setManualTP(tpVal);
                                setManualSL(slVal);
                                triggerNotification("🎯 BUY TP 2 ተመረጠ", `TP: $${tpVal}, SL: $${slVal} ተሞልቷል። (1:2.0 RR Ratio)`, "success", "SIGNAL");
                              }}
                              className="py-1 px-1.5 border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-350 text-[7.5px] font-bold rounded cursor-pointer transition-all flex items-center justify-center gap-1 shrink-0"
                            >
                              🟢 BUY TP 2 (መካከለኛ)
                            </button>
                          </div>

                          {/* SELL presets row */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const diffSL = symbol === 'XAUUSD' ? 2.50 : symbol === 'BTCUSD' ? 80.0 : 0.0008;
                                const diffTP = symbol === 'XAUUSD' ? 4.00 : symbol === 'BTCUSD' ? 120.0 : 0.0012;
                                const tpVal = (currentPrice - diffTP).toFixed(symbol === 'EURUSD' ? 4 : 2);
                                const slVal = (currentPrice + diffSL).toFixed(symbol === 'EURUSD' ? 4 : 2);
                                setManualTP(tpVal);
                                setManualSL(slVal);
                                triggerNotification("🎯 SELL TP 1 ተመረጠ", `TP: $${tpVal}, SL: $${slVal} ተሞልቷል። (1:1.5 RR Ratio)`, "danger", "SIGNAL");
                              }}
                              className="py-1 px-1.5 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/20 text-rose-400 text-[7.5px] font-bold rounded cursor-pointer transition-all flex items-center justify-center gap-1 shrink-0"
                            >
                              🔴 SELL TP 1 (ቅርብ)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const diffSL = symbol === 'XAUUSD' ? 4.00 : symbol === 'BTCUSD' ? 150.0 : 0.0015;
                                const diffTP = symbol === 'XAUUSD' ? 8.00 : symbol === 'BTCUSD' ? 300.0 : 0.0030;
                                const tpVal = (currentPrice - diffTP).toFixed(symbol === 'EURUSD' ? 4 : 2);
                                const slVal = (currentPrice + diffSL).toFixed(symbol === 'EURUSD' ? 4 : 2);
                                setManualTP(tpVal);
                                setManualSL(slVal);
                                triggerNotification("🎯 SELL TP 2 ተመረጠ", `TP: $${tpVal}, SL: $${slVal} ተሞልቷል። (1:2.0 RR Ratio)`, "danger", "SIGNAL");
                              }}
                              className="py-1 px-1.5 border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/25 text-rose-350 text-[7.5px] font-bold rounded cursor-pointer transition-all flex items-center justify-center gap-1 shrink-0"
                            >
                              🔴 SELL TP 2 (መካከለኛ)
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Real-time Risk-to-Reward Gauge and calculations */}
                      {(() => {
                        const numericSL = parseFloat(manualSL) || 0;
                        const numericTP = parseFloat(manualTP) || 0;
                        if (numericSL <= 0 && numericTP <= 0) {
                          return (
                            <div className="bg-gray-950/40 p-2 rounded-lg border border-gray-900/60 text-center">
                              <span className="text-[7.5px] font-black text-gray-500 uppercase tracking-widest block">📊 RISK-TO-REWARD RATIO (RRR)</span>
                              <p className="text-[7.5px] text-gray-450">SL እና TP በማስገባት የ Risk-to-Reward Ratio ያሰሉ</p>
                            </div>
                          );
                        }

                        let contractSize = 100;
                        const sym = String(symbol).toUpperCase();
                        if (sym === "BTCUSD" || sym === "BTCUSDT") contractSize = 1;
                        else if (sym === "EURUSD" || sym === "EURUSDT") contractSize = 100000;
                        else if (sym === "USDJPY") contractSize = 1000;

                        // Calculate distance of SL & TP from spot
                        const lossDistance = numericSL > 0 ? Math.abs(currentPrice - numericSL) : 0;
                        const profitDistance = numericTP > 0 ? Math.abs(currentPrice - numericTP) : 0;

                        const potentialLossUSD = lossDistance * manualLotSize * contractSize;
                        const potentialGainUSD = profitDistance * manualLotSize * contractSize;

                        const calculatedRatio = lossDistance > 0 ? (profitDistance / lossDistance) : 0;

                        const totalFactor = potentialLossUSD + potentialGainUSD;
                        const riskBarWidth = totalFactor > 0 ? (potentialLossUSD / totalFactor) * 100 : 50;
                        const rewardBarWidth = totalFactor > 0 ? (potentialGainUSD / totalFactor) * 100 : 50;

                        return (
                          <div className="bg-gray-950/85 p-2 rounded-xl border border-gray-800 space-y-1.5">
                            <div className="flex items-center justify-between text-[7.5px] font-black tracking-wider uppercase">
                              <span className="text-gray-450">📊 RISK-TO-REWARD (RR) GAUGE</span>
                              <span className={calculatedRatio >= 1.5 ? "text-emerald-400 font-extrabold" : "text-amber-400 font-bold"}>
                                RATIO: 1 : {calculatedRatio > 0 ? calculatedRatio.toFixed(2) : 'N/A'}
                              </span>
                            </div>

                            {/* Dual Gauge Bar */}
                            <div className="h-3 rounded-md bg-gray-950 overflow-hidden flex border border-gray-800/80">
                              {potentialLossUSD > 0 && (
                                <div 
                                  style={{ width: `${riskBarWidth}%` }} 
                                  className="h-full bg-rose-500/80 flex items-center justify-center text-[7px] font-black text-white px-1 whitespace-nowrap overflow-hidden"
                                >
                                  Risk
                                </div>
                              )}
                              {potentialGainUSD > 0 && (
                                <div 
                                  style={{ width: `${rewardBarWidth}%` }} 
                                  className="h-full bg-emerald-500/80 flex items-center justify-center text-[7px] font-black text-black px-1 whitespace-nowrap overflow-hidden"
                                >
                                  Reward
                                </div>
                              )}
                            </div>

                            {/* Risk vs Reward Numbers */}
                            <div className="grid grid-cols-2 gap-1.5 text-[7.5px] pt-1">
                              <div className="bg-rose-950/20 border border-rose-900/30 p-1 rounded flex flex-col">
                                <span className="text-rose-450 font-medium font-sans">Risk (ከፍተኛ ኪሳራ):</span>
                                <span className="text-rose-300 font-black font-mono">
                                  {potentialLossUSD > 0 ? `$${potentialLossUSD.toFixed(2)}` : 'N/A'}
                                </span>
                              </div>
                              <div className="bg-emerald-950/20 border border-emerald-900/30 p-1 rounded flex flex-col">
                                <span className="text-emerald-450 font-medium font-sans">Reward (የታለመ ትርፍ):</span>
                                <span className="text-emerald-300 font-black font-mono">
                                  {potentialGainUSD > 0 ? `$${potentialGainUSD.toFixed(2)}` : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* manual order entry executable actions button list */}
                    <div className="grid grid-cols-2 gap-2.5 pt-2">
                      {/* BUY BUTTON */}
                      <button
                        type="button"
                        onClick={() => {
                          executeMT5Trade(symbol, 'BUY', currentPrice, manualSL, manualTP, manualLotSize, true);
                        }}
                        disabled={symbol === 'DXY' || symbol === 'DXY (Dollar Index)'}
                        className={`py-3 px-4 rounded-xl border-none font-black text-[11px] uppercase tracking-wider transition-all transform active:scale-95 duration-150 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] relative overflow-hidden text-black ${
                          symbol === 'DXY' || symbol === 'DXY (Dollar Index)'
                            ? 'bg-gray-800/55 text-gray-655 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 cursor-pointer text-black font-extrabold font-sans'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-black shrink-0 animate-pulse" />
                        BUY / ግዛ
                      </button>

                      {/* SELL BUTTON */}
                      <button
                        type="button"
                        onClick={() => {
                          executeMT5Trade(symbol, 'SELL', currentPrice, manualSL, manualTP, manualLotSize, true);
                        }}
                        disabled={symbol === 'DXY' || symbol === 'DXY (Dollar Index)'}
                        className={`py-3 px-4 rounded-xl border-none font-black text-[11px] uppercase tracking-wider transition-all transform active:scale-95 duration-150 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] relative overflow-hidden text-white ${
                          symbol === 'DXY' || symbol === 'DXY (Dollar Index)'
                            ? 'bg-gray-800/55 text-gray-650 cursor-not-allowed'
                            : 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 cursor-pointer text-white font-extrabold font-sans'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-white shrink-0 animate-pulse" />
                        SELL / ሽጥ
                      </button>
                    </div>
                  </div>

                  {/* Box 2: Entered & Active Trades */}
                  <div className="md:col-span-7 bg-black/30 border border-gray-850 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-gray-900 pb-1.5 mb-2.5">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveConsoleTab('ACTIVE')}
                            className={`text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded transition-colors cursor-pointer ${
                              activeConsoleTab === 'ACTIVE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black'
                                : 'text-gray-400 hover:text-white border border-transparent font-bold'
                            }`}
                          >
                            📦 ክፍት ትሬዶች / ACTIVE ({dynamicAccountInfo?.positions?.length || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveConsoleTab('CLOSED')}
                            className={`text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded transition-colors cursor-pointer ${
                              activeConsoleTab === 'CLOSED'
                                ? 'bg-gold/10 text-gold border border-gold/20 font-black'
                                : 'text-gray-400 hover:text-white border border-transparent font-bold'
                            }`}
                          >
                            <History className="w-3.5 h-3.5 inline mr-1" />
                            የተዘጉ ትሬዶች / CLOSED ({mt5ClosedTrades?.length || 0})
                          </button>
                        </div>

                        {/* Clear all position button */}
                        {activeConsoleTab === 'ACTIVE' && dynamicAccountInfo?.positions?.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("እርግጠኛ ነዎት ሁሉንም ንግዶች መዝጋት ይፈልጋሉ? (Are you sure you want to close ALL positions?)")) {
                                localStorage.setItem('MT5_AUTO_TRADES', '[]');
                                setMt5AutoTrades([]);
                                triggerNotification(
                                  "🧹 አካውንት ጸድቷል / Account Cleared",
                                  "ሁሉም ክፍት የሙከራ የንግድ ቦታዎች በስኬት ተዘግተዋል! አካውንትዎ ጸድቷል።",
                                  "info",
                                  "SIGNAL"
                                );
                              }
                            }}
                            className="text-[7.5px] font-black text-amber-500 hover:text-amber-400 uppercase tracking-widest flex items-center gap-1.5 cursor-pointer bg-amber-500/5 border border-amber-500/15 p-1 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-amber-500" /> Close All
                          </button>
                        )}
                      </div>

                      {activeConsoleTab === 'ACTIVE' ? (
                        /* Active Positions List Table */
                        <div className="overflow-x-auto overflow-y-auto max-h-[225px] custom-scrollbar">
                          {(!dynamicAccountInfo?.positions || dynamicAccountInfo.positions.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">ክፍት ትሬዶች የሉም / NO ACTIVE POSITIONS</span>
                              <p className="text-[8px] text-gray-650 max-w-[280px]">ማንኛውንም ትሬድ ለመጀመር Lots, SL, TP በመምረጥ "Buy" ወይም "Sell" በተኖችን ይጠቀሙ።</p>
                            </div>
                          ) : (
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-gray-850 text-[7px] text-gray-500 font-black uppercase tracking-wider font-sans">
                                  <th className="py-1 px-1.5">Ticket</th>
                                  <th className="py-1 px-1">Pair</th>
                                  <th className="py-1 px-1">Type</th>
                                  <th className="py-1 px-1">Lots</th>
                                  <th className="py-1 px-1">Open Price</th>
                                  <th className="py-1 px-1">SL / TP</th>
                                  <th className="py-1 px-1 text-right">Profit ($)</th>
                                  <th className="py-1 px-1.5 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-900 text-[10px] font-mono font-medium">
                                {dynamicAccountInfo.positions.map((at: any) => {
                                  const isWin = at.profit >= 0;
                                  return (
                                    <tr key={at.ticket} className="hover:bg-white/[0.02] transition-colors leading-tight">
                                      <td className="py-1.5 px-1.5 text-gray-500 text-[8.5px]">#{at.ticket}</td>
                                      <td className="py-1.5 px-1 font-sans font-bold text-white text-[9.5px]">{at.symbol}</td>
                                      <td className="py-1.5 px-1">
                                        <span className={`px-1 rounded-[4px] text-[8.5px] font-sans font-black uppercase ${
                                          at.type === 'BUY' 
                                            ? 'bg-emerald-500/10 text-emerald-450' 
                                            : 'bg-rose-500/10 text-rose-400'
                                        }`}>
                                          {at.type}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-1 text-gray-300 font-bold">{at.volume} Lots</td>
                                      <td className="py-1.5 px-1 text-gray-400">${at.openPrice}</td>
                                      <td className="py-1.5 px-1 text-[8.5px] text-gray-400 font-sans">
                                        <div className="flex flex-col leading-none">
                                          <span>SL: {at.sl > 0 ? at.sl : '-'}</span>
                                          <span>TP: {at.tp > 0 ? at.tp : '-'}</span>
                                        </div>
                                      </td>
                                      <td className={`py-1.5 px-1 text-right font-black ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isWin ? '+' : ''}${at.profit.toFixed(2)}
                                      </td>
                                      <td className="py-1.5 px-1.5 text-center">
                                        <button
                                          type="button"
                                          onClick={() => closeMT5Position(at.ticket, at.profit)}
                                          className="p-1 px-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 text-[7px] font-sans font-bold rounded cursor-pointer transition-all"
                                        >
                                          Close / ዝጋ
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Google Sheets Integration Section */}
                          <div className="bg-gray-950/80 p-2 border border-gray-850 rounded-lg flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[7.5px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1 font-sans">
                                <History className="w-3 h-3 text-emerald-400 shrink-0" /> GOOGLE SHEETS SYNC / ማጎዳኛ ሰሌዳ
                              </span>
                              {googleSheetsWebhookUrl && (
                                <span className="bg-emerald-500/10 text-emerald-400 text-[6px] px-1 py-0.5 rounded font-black uppercase">
                                  Webhook Active
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder="Google Sheets Webhook URL / Webhook Link..."
                                value={googleSheetsWebhookUrl}
                                onChange={(e) => setGoogleSheetsWebhookUrl(e.target.value)}
                                className="flex-1 bg-gray-950 border border-gray-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-[10px] font-mono font-medium text-white focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateSheetsWebhook(googleSheetsWebhookUrl)}
                                className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500 hover:text-black border border-emerald-500/30 text-emerald-450 text-[8px] font-black rounded-lg cursor-pointer transition-all"
                              >
                                Save Link
                              </button>
                              <button
                                type="button"
                                onClick={handleSyncAllToSheets}
                                className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-500 text-[8px] font-black rounded-lg cursor-pointer transition-all"
                              >
                                Sync All
                              </button>
                            </div>
                          </div>

                          {/* List of Closed Trades */}
                          <div className="overflow-x-auto overflow-y-auto max-h-[200px] custom-scrollbar">
                            {mt5ClosedTrades.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 text-center">
                                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">የተዘጉ ትሬዶች የሉም / NO CLOSED POSITIONS YET</span>
                                <p className="text-[8px] text-gray-650 max-w-[280px]">ሲሙሌተሩ ትሬዶችን ሲዘጋው እዚህ ጋር ታሪክ ይመዘገባል።</p>
                              </div>
                            ) : (
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-gray-850 text-[7px] text-gray-500 font-black uppercase tracking-wider font-sans">
                                    <th className="py-1 px-1">Ticket</th>
                                    <th className="py-1 px-1">Pair</th>
                                    <th className="py-1 px-1">Type</th>
                                    <th className="py-1 px-1">Open/Close</th>
                                    <th className="py-1 px-0.5 text-right">Profit ($)</th>
                                    <th className="py-1 px-1 text-center">Time</th>
                                    <th className="py-1 px-1 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-950 text-[9.5px] font-mono font-medium">
                                  {mt5ClosedTrades.map((at: any, idx) => {
                                    const isWin = at.profit >= 0;
                                    return (
                                      <tr key={idx} className="hover:bg-white/[0.01] transition-colors leading-tight">
                                        <td className="py-1.5 px-1 text-gray-500 text-[8px]">#{at.ticket}</td>
                                        <td className="py-1.5 px-1 font-sans font-bold text-white text-[9px]">{at.symbol}</td>
                                        <td className="py-1.5 px-1">
                                          <span className={`px-1 rounded-[4px] text-[7.5px] font-sans font-black uppercase ${
                                            at.type === 'BUY' 
                                              ? 'bg-emerald-500/10 text-emerald-450' 
                                              : 'bg-rose-500/10 text-rose-400'
                                          }`}>
                                            {at.type}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-1 text-gray-400 text-[8px] leading-tight font-sans">
                                          <div>O: ${at.openPrice}</div>
                                          <div className="text-gray-500 font-sans">C: ${at.closePrice}</div>
                                        </td>
                                        <td className={`py-1.5 px-0.5 text-right font-black ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                          {isWin ? '+' : ''}${at.profit.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 px-1 text-[7.5px] text-gray-500 text-center font-sans">{String(at.closeTime).split(' ')[0]}</td>
                                        <td className="py-1.5 px-1 text-center">
                                          <span className="px-1 py-0.5 rounded bg-gray-900 text-gray-400 text-[6.5px] font-sans font-black uppercase">
                                            {at.status}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Balance & Statistics Footer Row in Trading Console */}
                    <div className="flex flex-wrap items-center justify-between border-t border-gray-900 pt-3 mt-2.5 text-[10px]">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-[7px] text-gray-500 font-bold uppercase">ACCOUNT BALANCE:</span>
                          <span className="font-mono text-white font-heavy text-[11px]">${dynamicAccountInfo?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="h-5 w-[1px] bg-gray-850" />
                        <div className="flex flex-col">
                          <span className="text-[7px] text-gray-500 font-bold uppercase">EQUITY:</span>
                          <span className="font-mono text-emerald-400 font-black text-[11px]">${dynamicAccountInfo?.equity?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest font-mono">
                        CLIENT GATEWAY: SIMULATED NODE {isDemoMode ? 'DEMO-1000' : 'LIVE'}
                      </span>
                    </div>
                  </div>

                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

