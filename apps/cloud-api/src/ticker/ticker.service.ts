import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TickerItem = {
  key: string;
  label: string;
  value: string;
  changePct?: number | null;
  /** Glifo/emoji enviado pelo Cloud — o Edge não precisa conhecer o índice. */
  icon?: string;
};

export type TickerPayload = {
  updatedAt: string;
  items: TickerItem[];
  text: string;
};

export type TickerCatalogEntry = {
  key: string;
  label: string;
  description: string;
  /** Texto curto na tarja */
  shortLabel: string;
  /** Ícone (emoji/símbolo) renderizado pelo Edge */
  icon: string;
};

type YahooMeta = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
};

const SETTING_KEY = 'ticker.enabledKeys';

export const TICKER_CATALOG: TickerCatalogEntry[] = [
  {
    key: 'weather_mao',
    label: 'Clima Manaus',
    description: 'Temperatura atual em Manaus',
    shortLabel: 'Manaus',
    icon: '☀',
  },
  {
    key: 'ibov',
    label: 'Ibovespa',
    description: 'Índice Bovespa (B3)',
    shortLabel: 'Ibovespa',
    icon: '📈',
  },
  {
    key: 'ifix',
    label: 'IFIX',
    description: 'Índice de Fundos Imobiliários',
    shortLabel: 'IFIX',
    icon: '🏘',
  },
  {
    key: 'usd',
    label: 'Dólar',
    description: 'Cotação USD/BRL',
    shortLabel: 'Dólar',
    icon: '$',
  },
  {
    key: 'eur',
    label: 'Euro',
    description: 'Cotação EUR/BRL',
    shortLabel: 'Euro',
    icon: '€',
  },
  {
    key: 'btc',
    label: 'Bitcoin',
    description: 'Cotação BTC/BRL',
    shortLabel: 'BTC',
    icon: '₿',
  },
];

const CATALOG_BY_KEY = new Map(TICKER_CATALOG.map((c) => [c.key, c]));

/** Chaves do catálogo anterior — novas entram ligadas por padrão se a config salva ainda não as conhece. */
const LEGACY_KEYS = new Set([
  'weather_mao',
  'ibov',
  'ifix',
  'usd',
  'eur',
  'btc',
]);

const DEFAULT_KEYS = TICKER_CATALOG.map((c) => c.key);

@Injectable()
export class TickerService {
  private readonly logger = new Logger(TickerService.name);
  private cache: { at: number; payload: TickerPayload } | null = null;
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async getTicker(): Promise<TickerPayload> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.ttlMs) {
      return this.cache.payload;
    }
    try {
      const payload = await this.fetchFresh();
      this.cache = { at: now, payload };
      return payload;
    } catch (err) {
      this.logger.warn(
        `Falha ao atualizar ticker: ${err instanceof Error ? err.message : err}`,
      );
      if (this.cache) return this.cache.payload;
      return {
        updatedAt: new Date().toISOString(),
        items: [],
        text: 'LEDE Ads — cotações temporariamente indisponíveis',
      };
    }
  }

  async getConfig() {
    const enabledKeys = await this.getEnabledKeys();
    return {
      catalog: TICKER_CATALOG,
      enabledKeys,
    };
  }

  async setConfig(enabledKeys: string[]) {
    if (!Array.isArray(enabledKeys)) {
      throw new BadRequestException('enabledKeys deve ser um array');
    }
    const valid = new Set(TICKER_CATALOG.map((c) => c.key));
    const cleaned = [
      ...new Set(
        enabledKeys
          .map((k) => String(k))
          .filter((k) => valid.has(k)),
      ),
    ];
    // Preserva ordem do catálogo para estabilidade na tarja
    const ordered = DEFAULT_KEYS.filter((k) => cleaned.includes(k));

    await this.prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: ordered },
      update: { value: ordered },
    });
    this.cache = null;
    return this.getConfig();
  }

  private async getEnabledKeys(): Promise<string[]> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTING_KEY },
    });
    if (!row) return [...DEFAULT_KEYS];
    const raw = row.value;
    if (!Array.isArray(raw)) return [...DEFAULT_KEYS];
    const valid = new Set(DEFAULT_KEYS);
    const saved = raw.map(String).filter((k) => valid.has(k));
    if (!saved.length) return [...DEFAULT_KEYS];
    // Novos indicadores do catálogo entram ligados até o operador desligar no dashboard
    const newcomers = DEFAULT_KEYS.filter(
      (k) => !LEGACY_KEYS.has(k) && !saved.includes(k),
    );
    const merged = [...saved, ...newcomers];
    return DEFAULT_KEYS.filter((k) => merged.includes(k));
  }

  private async fetchFresh(): Promise<TickerPayload> {
    const enabled = await this.getEnabledKeys();
    const need = new Set(enabled);

    const [weather, ibov, ifix, usd, eur, btc] = await Promise.all([
      need.has('weather_mao') ? this.fetchWeatherManaus() : null,
      need.has('ibov') ? this.fetchYahoo('^BVSP') : null,
      need.has('ifix') ? this.fetchYahoo('IFIX.SA') : null,
      need.has('usd') ? this.fetchFx('USD') : null,
      need.has('eur') ? this.fetchFx('EUR') : null,
      need.has('btc') ? this.fetchBtc() : null,
    ]);

    const byKey = new Map<string, TickerItem>();

    if (weather != null) {
      byKey.set(
        'weather_mao',
        this.buildItem('weather_mao', `${weather.toFixed(0)}°C`, null),
      );
    }

    if (ibov?.regularMarketPrice != null) {
      byKey.set(
        'ibov',
        this.buildItem(
          'ibov',
          this.formatIndex(ibov.regularMarketPrice),
          ibov.regularMarketChangePercent ?? null,
        ),
      );
    }

    if (ifix?.regularMarketPrice != null) {
      byKey.set(
        'ifix',
        this.buildItem(
          'ifix',
          this.formatIndex(ifix.regularMarketPrice),
          ifix.regularMarketChangePercent ?? null,
        ),
      );
    }

    if (usd) {
      byKey.set('usd', this.buildItem('usd', this.formatFx(usd.price), usd.changePct));
    }

    if (eur) {
      byKey.set('eur', this.buildItem('eur', this.formatFx(eur.price), eur.changePct));
    }

    if (btc) {
      byKey.set('btc', this.buildItem('btc', this.formatBtc(btc.price), btc.changePct));
    }

    const items = enabled
      .map((k) => byKey.get(k))
      .filter((i): i is TickerItem => Boolean(i));

    const text = items
      .map((i) => {
        const ch =
          i.changePct == null
            ? ''
            : ` ${i.changePct >= 0 ? '▲' : '▼'}${Math.abs(i.changePct).toFixed(2)}%`;
        return `${i.label} ${i.value}${ch}`;
      })
      .join('   ·   ');

    return {
      updatedAt: new Date().toISOString(),
      items,
      text: text || 'LEDE Ads',
    };
  }

  private buildItem(
    key: string,
    value: string,
    changePct: number | null,
  ): TickerItem {
    const meta = CATALOG_BY_KEY.get(key);
    return {
      key,
      label: meta?.shortLabel ?? key,
      value,
      changePct,
      icon: meta?.icon ?? '•',
    };
  }

  private async fetchWeatherManaus(): Promise<number | null> {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=-3.119&longitude=-60.0217&current=temperature_2m&timezone=America%2FManaus';
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number };
    };
    return data.current?.temperature_2m ?? null;
  }

  /** Yahoo primeiro; fallback AwesomeAPI (mais estável p/ USD/EUR no BR). */
  private async fetchFx(
    currency: 'USD' | 'EUR',
  ): Promise<{ price: number; changePct: number | null } | null> {
    const yahooSymbol = currency === 'USD' ? 'USDBRL=X' : 'EURBRL=X';
    const yahoo = await this.fetchYahoo(yahooSymbol);
    if (yahoo?.regularMarketPrice != null) {
      return {
        price: yahoo.regularMarketPrice,
        changePct: yahoo.regularMarketChangePercent ?? null,
      };
    }

    try {
      const url = `https://economia.awesomeapi.com.br/json/last/${currency}-BRL`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<
        string,
        { bid?: string; pctChange?: string }
      >;
      const row = data[`${currency}BRL`];
      const price = row?.bid ? Number(row.bid) : NaN;
      if (!Number.isFinite(price)) return null;
      const pct = row?.pctChange != null ? Number(row.pctChange) : null;
      return {
        price,
        changePct: pct != null && Number.isFinite(pct) ? pct : null,
      };
    } catch (err) {
      this.logger.warn(
        `FX ${currency} falhou: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /** Yahoo BTC-BRL → AwesomeAPI → CoinGecko. */
  private async fetchBtc(): Promise<{
    price: number;
    changePct: number | null;
  } | null> {
    const yahoo = await this.fetchYahoo('BTC-BRL=X');
    if (yahoo?.regularMarketPrice != null) {
      return {
        price: yahoo.regularMarketPrice,
        changePct: yahoo.regularMarketChangePercent ?? null,
      };
    }

    try {
      const res = await fetch(
        'https://economia.awesomeapi.com.br/json/last/BTC-BRL',
        { signal: AbortSignal.timeout(8_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as Record<
          string,
          { bid?: string; pctChange?: string }
        >;
        const row = data.BTCBRL;
        const price = row?.bid ? Number(row.bid) : NaN;
        if (Number.isFinite(price)) {
          const pct = row?.pctChange != null ? Number(row.pctChange) : null;
          return {
            price,
            changePct: pct != null && Number.isFinite(pct) ? pct : null,
          };
        }
      }
    } catch (err) {
      this.logger.warn(
        `AwesomeAPI BTC: ${err instanceof Error ? err.message : err}`,
      );
    }

    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true',
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        bitcoin?: { brl?: number; brl_24h_change?: number };
      };
      const price = data.bitcoin?.brl;
      if (price == null || !Number.isFinite(price)) return null;
      const pct = data.bitcoin?.brl_24h_change;
      return {
        price,
        changePct: pct != null && Number.isFinite(pct) ? pct : null,
      };
    } catch (err) {
      this.logger.warn(
        `CoinGecko BTC: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async fetchYahoo(symbol: string): Promise<YahooMeta | null> {
    try {
      const encoded = encodeURIComponent(symbol);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; LEDE-Ads-Ticker/1.1; +https://lede.tv.br)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.logger.warn(`Yahoo ${symbol} HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        chart?: { result?: Array<{ meta?: YahooMeta }> };
      };
      return data.chart?.result?.[0]?.meta ?? null;
    } catch (err) {
      this.logger.warn(
        `Yahoo ${symbol}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private formatIndex(n: number) {
    return n.toLocaleString('pt-BR', {
      maximumFractionDigits: n >= 1000 ? 0 : 2,
    });
  }

  /** Formato compacto para caber na tarja (ex.: R$ 5,09). */
  private formatFx(n: number) {
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /** BTC em BRL sem centavos (ex.: R$ 612.450). */
  private formatBtc(n: number) {
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
}
