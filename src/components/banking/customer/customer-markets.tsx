'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react';

type Category = 'Crypto' | 'Forex' | 'Stocks' | 'Commodities';

const SYMBOLS: Record<Category, { label: string; symbol: string; binance?: string }[]> = {
  Crypto: [
    { label: 'Bitcoin', symbol: 'BINANCE:BTCUSDT', binance: 'BTCUSDT' },
    { label: 'Ethereum', symbol: 'BINANCE:ETHUSDT', binance: 'ETHUSDT' },
    { label: 'Solana', symbol: 'BINANCE:SOLUSDT', binance: 'SOLUSDT' },
    { label: 'BNB', symbol: 'BINANCE:BNBUSDT', binance: 'BNBUSDT' },
    { label: 'XRP', symbol: 'BINANCE:XRPUSDT', binance: 'XRPUSDT' },
    { label: 'Cardano', symbol: 'BINANCE:ADAUSDT', binance: 'ADAUSDT' },
  ],
  Forex: [
    { label: 'EUR/USD', symbol: 'FX:EURUSD' },
    { label: 'GBP/USD', symbol: 'FX:GBPUSD' },
    { label: 'USD/JPY', symbol: 'FX:USDJPY' },
    { label: 'USD/CHF', symbol: 'FX:USDCHF' },
    { label: 'AUD/USD', symbol: 'FX:AUDUSD' },
    { label: 'USD/CAD', symbol: 'FX:USDCAD' },
  ],
  Stocks: [
    { label: 'Apple', symbol: 'NASDAQ:AAPL' },
    { label: 'Microsoft', symbol: 'NASDAQ:MSFT' },
    { label: 'Nvidia', symbol: 'NASDAQ:NVDA' },
    { label: 'Amazon', symbol: 'NASDAQ:AMZN' },
    { label: 'Tesla', symbol: 'NASDAQ:TSLA' },
    { label: 'JPMorgan', symbol: 'NYSE:JPM' },
  ],
  Commodities: [
    { label: 'Gold', symbol: 'OANDA:XAUUSD' },
    { label: 'Silver', symbol: 'OANDA:XAGUSD' },
    { label: 'Crude Oil', symbol: 'TVC:USOIL' },
    { label: 'Natural Gas', symbol: 'TVC:NATGAS' },
    { label: 'Copper', symbol: 'TVC:COPPER' },
    { label: 'Platinum', symbol: 'TVC:PLATINUM' },
  ],
};

interface CryptoPrice {
  symbol: string; price: number; change: number;
}

export function CustomerMarkets() {
  const [category, setCategory] = useState<Category>('Crypto');
  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS.Crypto[0].symbol);
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  // Load TradingView tv.js once
  useEffect(() => {
    if (scriptLoadedRef.current) return;
    const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
    if (existing) {
      scriptLoadedRef.current = true;
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => { scriptLoadedRef.current = true; };
    script.onerror = () => { toast.error('Failed to load chart library'); };
    document.body.appendChild(script);
  }, []);

  // Render widget when symbol changes or script becomes available
  useEffect(() => {
    let cancelled = false;
    function tryRender() {
      const w = (window as any).TradingView;
      if (!w) { setTimeout(tryRender, 250); return; }
      if (cancelled) return;
      // Clear container
      if (containerRef.current) containerRef.current.innerHTML = '';
      new w.widget({
        autosize: true,
        symbol: activeSymbol,
        interval: '60',
        timezone: 'Etc/UTC',
        theme: 'light',
        style: '1',
        locale: 'en',
        allow_symbol_change: true,
        container_id: 'tradingview_live_chart',
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
      });
    }
    tryRender();
    return () => { cancelled = true; };
  }, [activeSymbol]);

  // Poll Binance for crypto prices when in Crypto category
  useEffect(() => {
    if (category !== 'Crypto') return;
    let cancelled = false;
    async function fetchPrices() {
      try {
        const symbols = SYMBOLS.Crypto.map((s) => s.binance!).filter(Boolean);
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data: any[] = await res.json();
        if (cancelled) return;
        const mapped = data.map((d) => ({
          symbol: d.symbol,
          price: parseFloat(d.lastPrice),
          change: parseFloat(d.priceChangePercent),
        }));
        setPrices(mapped);
      } catch {
        // Silent fail — prices are decorative
      }
    }
    fetchPrices();
    const t = setInterval(fetchPrices, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [category]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl mb-1 flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" /> Markets
        </h1>
        <p className="text-sm text-muted-foreground">Live market quotes and charts. Powered by TradingView and Binance.</p>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{SYMBOLS[category].find(s => s.symbol === activeSymbol)?.label || 'Live Chart'}</span>
            <Badge variant="outline" className="text-[10px]">{activeSymbol}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">Real-time chart · click any symbol below to switch</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            id="tradingview_live_chart"
            ref={containerRef}
            style={{ height: 450, width: '100%' }}
            className="rounded-md overflow-hidden border border-border"
          />
        </CardContent>
      </Card>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(SYMBOLS) as Category[]).map((c) => (
          <button
            key={c}
            onClick={() => {
              setCategory(c);
              setActiveSymbol(SYMBOLS[c][0].symbol);
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              category === c
                ? 'arvest-gradient text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Asset buttons */}
      <div className="flex flex-wrap gap-2">
        {SYMBOLS[category].map((s) => (
          <button
            key={s.symbol}
            onClick={() => setActiveSymbol(s.symbol)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              activeSymbol === s.symbol
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:bg-muted'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Crypto price tiles */}
      {category === 'Crypto' && prices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {prices.map((p) => {
            const info = SYMBOLS.Crypto.find((s) => s.binance === p.symbol);
            const up = p.change >= 0;
            return (
              <Card key={p.symbol}>
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground">{info?.label || p.symbol}</div>
                  <div className="font-serif-display text-base mt-0.5">
                    ${p.price < 1 ? p.price.toFixed(4) : p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </div>
                  <div className={`text-[11px] flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-red-600'}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? '+' : ''}{p.change.toFixed(2)}%
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-4 rounded-md bg-muted/40 border border-border text-[11px] text-muted-foreground">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <strong className="text-foreground">Market data is provided for informational purposes only and is not investment advice.</strong>{' '}
          Arvest Private Banking does not offer investment advisory services through this platform. Quotes may be delayed and are sourced
          from third-party providers. Past performance is not indicative of future results. Please consult a licensed financial advisor
          before making investment decisions.
        </div>
      </div>
    </div>
  );
}
