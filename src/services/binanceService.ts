
export interface BinanceKLine {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const klineCache = new Map<string, { data: BinanceKLine[]; addedAt: number }>();

export const fetchBinanceData = async (symbol: string, interval: string, limit: number = 100, endTime?: number): Promise<BinanceKLine[]> => {
  const cacheKey = `${symbol.toUpperCase()}_${interval}_${limit}_${endTime || 'latest'}`;
  if (klineCache.has(cacheKey)) {
    const cached = klineCache.get(cacheKey)!;
    // Indefinite/long caching for historical data with endTime (since historical bars do not change)
    // 8-second caching for live latest poll to prevent rapid redundant execution
    if (endTime || (Date.now() - cached.addedAt < 8000)) {
      return cached.data;
    }
  }

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    
    // 1. Try Proxy Fetch first
    const proxyController = new AbortController();
    const proxyTimeoutId = setTimeout(() => proxyController.abort(), 12000); // 12s is plenty

    let proxySucceeded = false;
    let proxyData: BinanceKLine[] | null = null;

    try {
      const customUrl = typeof window !== 'undefined' ? (localStorage.getItem('BINANCE_CUSTOM_BASE_URL') || '') : '';
      const customUrlQuery = customUrl ? `&customBaseUrl=${encodeURIComponent(customUrl)}` : '';
      const url = `/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}${customUrlQuery}`;
      console.log(`[BinanceService] Proxy fetch attempt ${attempt}/${maxRetries} for ${symbol} @ ${interval}`);
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: proxyController.signal
      });

      clearTimeout(proxyTimeoutId);

      if (response && response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          proxyData = data.map((d: any) => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
          }));
          proxySucceeded = true;
        }
      }
    } catch (proxyErr: any) {
      clearTimeout(proxyTimeoutId);
      console.warn(`[BinanceService] Proxy fetch attempt ${attempt} failed for ${symbol}:`, proxyErr.message || proxyErr);
    }

    if (proxySucceeded && proxyData) {
      klineCache.set(cacheKey, { data: proxyData, addedAt: Date.now() });
      return proxyData;
    }

    // 2. Client-side Fallback to CryptoCompare (Direct from browser, bypassing CORS-blocked binance.com)
    console.warn(`[BinanceService] Proxy failed/timed out. Trying client CryptoCompare fallback for ${symbol}`);
    
    const ccController = new AbortController();
    const ccTimeoutId = setTimeout(() => ccController.abort(), 8000); // 8s timeout

    try {
      const symStr = symbol.toUpperCase();
      let fsym = "BTC";
      let tsym = "USDT";
      
      if (symStr.endsWith("USDT")) {
        fsym = symStr.replace(/USDT$/, "");
        tsym = "USDT";
      } else if (symStr.endsWith("USDC")) {
        fsym = symStr.replace(/USDC$/, "");
        tsym = "USDC";
      } else if (symStr.endsWith("BTC")) {
        fsym = symStr.replace(/BTC$/, "");
        tsym = "BTC";
      } else if (symStr.endsWith("USD")) {
        fsym = symStr.replace(/USD$/, "");
        tsym = "USD";
      } else {
        fsym = symStr.substring(0, Math.max(3, symStr.length - 4));
        tsym = symStr.substring(fsym.length) || "USDT";
      }

      let histoType = "histominute";
      let aggregate = 1;
      if (interval === "1m") { histoType = "histominute"; aggregate = 1; }
      else if (interval === "5m") { histoType = "histominute"; aggregate = 5; }
      else if (interval === "15m") { histoType = "histominute"; aggregate = 15; }
      else if (interval === "30m") { histoType = "histominute"; aggregate = 30; }
      else if (interval === "1h") { histoType = "histohour"; aggregate = 1; }
      else if (interval === "4h") { histoType = "histohour"; aggregate = 4; }
      else if (interval === "1d") { histoType = "histoday"; aggregate = 1; }
      else if (interval === "1w") { histoType = "histoday"; aggregate = 7; }

      const toTsBlock = endTime ? `&toTs=${Math.floor(Number(endTime) / 1000)}` : '';
      let ccUrl = `https://min-api.cryptocompare.com/data/v2/${histoType}?fsym=${fsym}&tsym=${tsym}&limit=${limit}&aggregate=${aggregate}${toTsBlock}`;

      let ccResponse = await fetch(ccUrl, { signal: ccController.signal });
      let ccJson = ccResponse.ok ? await ccResponse.json() : null;

      // Fallback from USDT to USD if CryptoCompare doesn't have the USDT pair listed/succeeded
      if ((!ccJson || ccJson.Response !== "Success") && tsym === "USDT") {
        console.log(`[BinanceService] CryptoCompare USDT failed for ${fsym}, retrying with USD...`);
        try {
          const altCcUrl = `https://min-api.cryptocompare.com/data/v2/${histoType}?fsym=${fsym}&tsym=USD&limit=${limit}&aggregate=${aggregate}${toTsBlock}`;
          const altCcResponse = await fetch(altCcUrl, { signal: ccController.signal });
          if (altCcResponse.ok) {
            ccJson = await altCcResponse.json();
          }
        } catch (altErr: any) {
          console.warn(`[BinanceService] Client CryptoCompare USD fallback fetch failed:`, altErr.message || altErr);
        }
      }

      clearTimeout(ccTimeoutId);

      if (ccJson && ccJson.Response === "Success" && ccJson.Data && Array.isArray(ccJson.Data.Data)) {
        console.log(`[BinanceService] Client CryptoCompare query succeeded for ${symbol}`);
        const ccParsed = ccJson.Data.Data.map((d: any) => ({
          time: d.time * 1000,
          open: parseFloat(d.open),
          high: parseFloat(d.high),
          low: parseFloat(d.low),
          close: parseFloat(d.close),
          volume: parseFloat(d.volumefrom)
        }));
        klineCache.set(cacheKey, { data: ccParsed, addedAt: Date.now() });
        return ccParsed;
      }
    } catch (ccDirectErr: any) {
      clearTimeout(ccTimeoutId);
      const isAborted = ccDirectErr && (ccDirectErr.name === 'AbortError' || ccDirectErr.message?.includes('abort') || ccController.signal.aborted);
      if (isAborted) {
        console.warn(`[BinanceService] Client CryptoCompare fallback connection timed out (8s limit reached for ${symbol})`);
      } else {
        console.warn(`[BinanceService] Client CryptoCompare fallback failed for ${symbol}:`, ccDirectErr.message || ccDirectErr);
      }
    }

    // Exponential backoff
    if (attempt < maxRetries) {
      const backoff = 1000 * Math.pow(1.5, attempt - 1);
      console.log(`[BinanceService] Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  throw new Error(`Failed to load data for ${symbol} after ${maxRetries} attempts (all proxy and client fallbacks exhausted).`);
};
