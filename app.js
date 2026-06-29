const STORAGE_KEYS = {
  apiUrl: 'juko_v2_api_url',
  apiToken: 'juko_v2_api_token',
  chartDays: 'juko_v2_chart_days',
};

const sampleData = {
  updatedAt: new Date().toISOString(),
  config: { vixOk: 25, vixStop: 30, vxnOk: 30, vxnStop: 35 },
  cockpit: {
    mainSignal: 'KAUFEN',
    systemStatus: 'BULLENMARKT',
    latestVix: 18.7,
    latestVxn: 22.1,
  },
  signals: [
    { rank: 1, ticker: 'NASDAQ:MU', name: 'Micron Technology', momentumAdjusted: 0.71, price: 141, signal: 'KAUFEN' },
    { rank: 2, ticker: 'NASDAQ:AMD', name: 'Advanced Micro Devices', momentumAdjusted: 0.48, price: 166, signal: 'KAUFEN' },
    { rank: 10, ticker: 'NASDAQ:AVGO', name: 'Broadcom', momentumAdjusted: 0.33, price: 382, signal: 'KAUFEN' },
    { rank: 11, ticker: 'NASDAQ:MSFT', name: 'Microsoft', momentumAdjusted: 0.08, price: 391, signal: 'KAUFEN' },
    { rank: 12, ticker: 'NASDAQ:GOOGL', name: 'Alphabet', momentumAdjusted: 0.07, price: 360, signal: 'KAUFEN' },
    { rank: null, ticker: 'NASDAQ:AAPL', name: 'Apple', momentumAdjusted: 0.05, price: 201, signal: 'GESPERRT' },
  ],
  depot: [
    { ticker: 'NASDAQ:AMD', rank: 2, daysOutsideTop12: 0, action: 'HALTEN' },
    { ticker: 'NASDAQ:AAPL', rank: 13, daysOutsideTop12: 8, action: 'BEOBACHTEN' },
  ],
  charts: {
    history: Array.from({ length: 30 }, (_, index) => ({
      date: new Date(Date.now() - (29 - index) * 86400000).toISOString(),
      nasdaq: 24000 + index * 80 + Math.sin(index / 2) * 250,
      sma200: 23200 + index * 28,
      buyLine: 23500 + index * 32,
      sellLine: 22800 + index * 18,
      signal: index > 7 ? 'KAUFEN' : 'WARTEN',
      vix: 27 - index * 0.25 + Math.sin(index) * 1.2,
      vxn: 32 - index * 0.3 + Math.cos(index) * 1.4,
    })),
  },
  evaluation: {
    trendDays: 5,
    buyDays: 5,
    waitDays: 0,
    sellDays: 0,
    weeklySignal: 'KAUFEN',
    nextAction: 'Kauf ausführen per Marktorder',
    executionTime: 'Montag 10 Uhr',
    actionReason: 'Montage sind historisch häufig schwächere Börsentage.',
    developmentAbs: 920,
    developmentPct: 0.038,
  },
};

let currentData = sampleData;
let charts = {};
let weeklySummaries = [];
let selectedWeekIndex = -1;
let selectedDepotTicker = '';
let activeSuggestionIndex = -1;
let tickerSuggestions = [];

function getApiUrl() {
  return localStorage.getItem(STORAGE_KEYS.apiUrl) || '';
}

function getApiToken() {
  return localStorage.getItem(STORAGE_KEYS.apiToken) || '';
}

function setError(message) {
  const element = document.querySelector('#errorMessage');
  element.hidden = !message;
  element.textContent = message || '';
}

function loadJsonp(url, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `juko_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const query = new URLSearchParams({ ...params, callback: callbackName });
    const separator = url.includes('?') ? '&' : '?';
    const script = document.createElement('script');

    window[callbackName] = payload => {
      resolve(payload);
      script.remove();
      delete window[callbackName];
    };

    script.onerror = () => {
      reject(new Error('API nicht erreichbar'));
      script.remove();
      delete window[callbackName];
    };

    script.src = `${url}${separator}${query.toString()}`;
    document.body.append(script);
  });
}

async function readApi() {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    currentData = sampleData;
    render(currentData);
    setError('API-URL fehlt. Öffne den Tab Setup und trage die Apps-Script Web-App-URL ein. Sample-Daten werden angezeigt.');
    return;
  }

  const payload = await loadJsonp(apiUrl, { action: 'read' });
  if (!payload.ok) throw new Error(payload.error || 'API-Fehler');
  currentData = payload.result;
  render(currentData);
  setError('');
}

async function mutateDepot(action, ticker) {
  const apiUrl = getApiUrl();
  const token = getApiToken();
  if (!apiUrl || !token) throw new Error('API-URL oder Depot-Token fehlt.');

  const payload = await loadJsonp(apiUrl, { action, ticker, token });
  if (!payload.ok) throw new Error(payload.error || 'Depot-Änderung fehlgeschlagen');
  await readApi();
}

function render(data) {
  renderSettings();
  renderHero(data);
  renderDepot(data.depot || []);
  renderRanking(data.signals || []);
  renderWeeklySummary(data.charts?.history || []);
  if (document.querySelector('#tab-charts').classList.contains('active')) renderCharts(data);
}

function renderSettings() {
  document.querySelector('#apiUrlInput').value = getApiUrl();
  document.querySelector('#apiTokenInput').value = getApiToken();
}

function renderHero(data) {
  const signal = data.cockpit?.mainSignal || 'WARTEN';
  const config = data.config || {};
  const vix = data.cockpit?.latestVix;
  const vxn = data.cockpit?.latestVxn;
  const statusCard = document.querySelector('#statusCard');
  statusCard.className = 'hero-card';
  statusCard.classList.add(signal === 'KAUFEN' ? 'state-green' : signal === 'VERKAUFEN' ? 'state-red' : 'state-yellow');

  document.querySelector('#mainSignal').textContent = signal;
  document.querySelector('#systemStatus').textContent = data.cockpit?.systemStatus || '—';
  document.querySelector('#updatedAt').textContent = data.updatedAt ? formatDateTime(data.updatedAt) : '—';
  document.querySelector('#signalCount').textContent = `${(data.signals || []).filter(item => !item.isMarketTicker).length} Aktien`;

  renderRiskCard('vix', vix, config.vixOk || 25, config.vixStop || 30);
  renderRiskCard('vxn', vxn, config.vxnOk || 30, config.vxnStop || 35);
}

function renderRiskCard(prefix, value, okLimit, stopLimit) {
  const risk = getRiskStatus(value, okLimit, stopLimit);
  const idPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  const card = document.querySelector(`#${prefix}Card`);
  card.className = `risk-card risk-${risk.level}`;
  document.querySelector(`#latest${idPrefix}`).textContent = formatNumber(value);
  document.querySelector(`#latest${idPrefix}Status`).textContent = risk.label;
  document.querySelector(`#latest${idPrefix}Limits`).textContent = `OK ≤ ${formatNumber(okLimit)} · STOP ≥ ${formatNumber(stopLimit)}`;
}

function getRiskStatus(value, okLimit, stopLimit) {
  const number = Number(value);
  if (value === null || value === undefined || Number.isNaN(number)) {
    return { level: 'unknown', label: 'Keine Daten' };
  }
  if (number >= Number(stopLimit)) return { level: 'stop', label: 'STOP' };
  if (number > Number(okLimit)) return { level: 'watch', label: 'Erhöht' };
  return { level: 'ok', label: 'OK' };
}

function renderDepot(items) {
  const list = document.querySelector('#depotList');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<p class="muted">Noch keine Depot-Ticker hinterlegt.</p>';
    return;
  }

  [...items]
    .sort(compareDepotRows)
    .forEach(item => {
    const action = String(item.action || 'PRÜFEN').toLowerCase();
    const rank = Number(item.rank);
    const hasRank = hasNumericRank(item.rank);
    const isOutsideTop12 = !hasRank || rank > 12;
    const details = [
      `Rang ${hasRank ? rank : 'nicht Top'}`,
      `Hinzugefügt seit ${formatDate(item.capturedSince)}`,
    ];
    if (isOutsideTop12) details.push(`${item.daysOutsideTop12 || 0} Tage außerhalb Top 12`);
    const div = document.createElement('div');
    div.className = 'decision-item';
    div.innerHTML = `
      <div>
        <div class="ticker">${item.ticker}</div>
        <div class="subtext depot-meta">${details.map(detail => `<span>${detail}</span>`).join('')}</div>
      </div>
      <span class="badge badge-${action}">${item.action || 'PRÜFEN'}</span>
      <button class="remove-button" type="button" data-ticker="${item.ticker}">×</button>
    `;
    list.append(div);
  });
}

function compareDepotRows(left, right) {
  const leftRank = hasNumericRank(left.rank) ? Number(left.rank) : Number.POSITIVE_INFINITY;
  const rightRank = hasNumericRank(right.rank) ? Number(right.rank) : Number.POSITIVE_INFINITY;
  return leftRank - rightRank || String(left.ticker).localeCompare(String(right.ticker));
}

function updateTickerSuggestions(query) {
  selectedDepotTicker = '';
  activeSuggestionIndex = -1;
  document.querySelector('#addTickerButton').disabled = true;
  const normalizedQuery = String(query || '').trim().toUpperCase();
  const depotTickers = new Set((currentData.depot || []).map(item => String(item.ticker)));
  tickerSuggestions = normalizedQuery
    ? (currentData.signals || [])
      .filter(item => !item.isMarketTicker && !depotTickers.has(item.ticker))
      .filter(item => item.ticker.includes(normalizedQuery) || String(item.name || '').toUpperCase().includes(normalizedQuery))
      .sort((left, right) => compareTickerSuggestion(left, right, normalizedQuery))
      .slice(0, 6)
    : [];
  renderTickerSuggestions();
}

function compareTickerSuggestion(left, right, query) {
  const leftSymbol = String(left.ticker).split(':').pop();
  const rightSymbol = String(right.ticker).split(':').pop();
  const leftStarts = leftSymbol.startsWith(query) || String(left.name || '').toUpperCase().startsWith(query);
  const rightStarts = rightSymbol.startsWith(query) || String(right.name || '').toUpperCase().startsWith(query);
  if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
  return leftSymbol.localeCompare(rightSymbol);
}

function renderTickerSuggestions() {
  const input = document.querySelector('#tickerInput');
  const list = document.querySelector('#tickerSuggestions');
  list.innerHTML = '';
  list.hidden = tickerSuggestions.length === 0;
  input.setAttribute('aria-expanded', String(tickerSuggestions.length > 0));
  tickerSuggestions.forEach((item, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `ticker-suggestion${index === activeSuggestionIndex ? ' active' : ''}`;
    option.dataset.ticker = item.ticker;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === activeSuggestionIndex));
    option.innerHTML = `<strong>${item.ticker}</strong><span class="ticker-suggestion-name">${item.name || '—'}</span>`;
    list.append(option);
  });
}

function selectTickerSuggestion(index) {
  const item = tickerSuggestions[index];
  if (!item) return;
  selectedDepotTicker = item.ticker;
  activeSuggestionIndex = index;
  const input = document.querySelector('#tickerInput');
  input.value = `${item.ticker} · ${item.name || ''}`.trim();
  input.setAttribute('aria-expanded', 'false');
  document.querySelector('#tickerSuggestions').hidden = true;
  document.querySelector('#addTickerButton').disabled = false;
}

function moveActiveTickerSuggestion(direction) {
  if (!tickerSuggestions.length) return;
  activeSuggestionIndex = Math.max(0, Math.min(tickerSuggestions.length - 1, activeSuggestionIndex + direction));
  renderTickerSuggestions();
}

function renderRanking(items) {
  const query = document.querySelector('#rankingSearch').value.trim().toUpperCase();
  const list = document.querySelector('#rankingList');
  list.innerHTML = '';

  buildDisplayRanking(items)
    .filter(item => !query || item.ticker.includes(query) || (item.name || '').toUpperCase().includes(query))
    .forEach(item => {
      const momentum = item.momentumAdjusted ?? item.momentum90;
      const blockReason = getBlockReason(item);
      const div = document.createElement('div');
      div.className = `ranking-row ${getRankZoneClass(item.rank)}`;
      div.innerHTML = `
        <span class="rank">${item.displayRank}</span>
        <div>
          <div class="ticker">${item.ticker}</div>
          <div class="subtext">${item.name || '—'} · ${formatCurrency(item.price)}</div>
          ${blockReason ? `<div class="block-reason">${blockReason}</div>` : ''}
        </div>
        <div class="score ${getMomentumClass(momentum)}">${formatPercent(momentum)}</div>
      `;
      list.append(div);
    });
}

function buildDisplayRanking(items) {
  const stocks = items.filter(item => !item.isMarketTicker);
  const ranked = stocks
    .filter(item => hasNumericRank(item.rank))
    .sort((left, right) => Number(left.rank) - Number(right.rank));
  const blocked = stocks
    .filter(item => !hasNumericRank(item.rank))
    .sort(compareMomentumDescending);
  return ranked.concat(blocked).map((item, index) => ({ ...item, displayRank: index + 1 }));
}

function compareMomentumDescending(left, right) {
  const leftMomentum = Number(left.momentumAdjusted ?? left.momentum90);
  const rightMomentum = Number(right.momentumAdjusted ?? right.momentum90);
  const safeLeft = Number.isFinite(leftMomentum) ? leftMomentum : Number.NEGATIVE_INFINITY;
  const safeRight = Number.isFinite(rightMomentum) ? rightMomentum : Number.NEGATIVE_INFINITY;
  return safeRight - safeLeft || String(left.ticker).localeCompare(String(right.ticker));
}

function getBlockReason(item) {
  if (item.anomaly || item.signal === 'ANOMALIE') return 'Anomalie';
  if (item.price === null || item.sma200 === null || (item.momentumAdjusted ?? item.momentum90) === null) return 'Keine Daten';
  if (item.signal === 'GESPERRT' || item.aboveSma === false) return 'Unter SMA200';
  return hasNumericRank(item.rank) ? '' : 'Nicht kaufbar';
}

function getRankZoneClass(rank) {
  if (!hasNumericRank(rank)) return 'rank-out';
  if (Number(rank) <= 10) return 'rank-buy';
  if (Number(rank) <= 12) return 'rank-buffer';
  return 'rank-out';
}

function hasNumericRank(rank) {
  return rank !== null && rank !== '' && rank !== undefined && Number.isFinite(Number(rank));
}

function getMomentumClass(momentum) {
  const value = Number(momentum);
  if (!Number.isFinite(value) || value === 0) return 'momentum-neutral';
  return value > 0 ? 'momentum-positive' : 'momentum-negative';
}
function renderWeeklySummary(history) {
  weeklySummaries = buildWeeklySummaries(history);
  const currentWeekKey = getIsoWeekInfo(new Date()).key;
  const currentIndex = weeklySummaries.findIndex(week => week.key === currentWeekKey);
  selectedWeekIndex = currentIndex >= 0 ? currentIndex : weeklySummaries.length - 1;
  renderSelectedWeek();
}

function buildWeeklySummaries(history) {
  const weeksByKey = new Map();
  history.forEach(point => {
    if (!point.date) return;
    const weekInfo = getIsoWeekInfo(new Date(point.date));
    if (!weeksByKey.has(weekInfo.key)) {
      weeksByKey.set(weekInfo.key, { ...weekInfo, signals: [] });
    }
    weeksByKey.get(weekInfo.key).signals.push(String(point.signal || 'WARTEN').toUpperCase());
  });

  const currentWeek = getIsoWeekInfo(new Date());
  if (!weeksByKey.has(currentWeek.key)) {
    weeksByKey.set(currentWeek.key, { ...currentWeek, signals: [] });
  }

  return Array.from(weeksByKey.values())
    .sort((left, right) => left.startDate - right.startDate)
    .map(week => {
      const buyDays = week.signals.filter(signal => signal === 'KAUFEN').length;
      const waitDays = week.signals.filter(signal => signal === 'WARTEN').length;
      const sellDays = week.signals.filter(signal => signal === 'VERKAUFEN').length;
      return {
        ...week,
        buyDays,
        waitDays,
        sellDays,
        weeklySignal: calculateWeeklySignal(buyDays, waitDays, sellDays),
      };
    });
}

function calculateWeeklySignal(buyDays, waitDays, sellDays) {
  if (buyDays > 0 && sellDays > 0) return 'WARTEN';
  if (sellDays > waitDays) return 'VERKAUFEN';
  if (buyDays > waitDays) return 'KAUFEN';
  return 'WARTEN';
}

function renderSelectedWeek() {
  if (!weeklySummaries.length || selectedWeekIndex < 0) return;
  const week = weeklySummaries[selectedWeekIndex];
  const currentWeekKey = getIsoWeekInfo(new Date()).key;
  const isArchive = week.key !== currentWeekKey;
  const summary = document.querySelector('#weeklySummary');
  summary.className = `weekly-summary signal-${week.weeklySignal.toLowerCase()}${isArchive ? ' is-archive' : ''}`;

  document.querySelector('#weekState').textContent = isArchive ? 'Wochenarchiv' : 'Aktuelle Woche';
  document.querySelector('#weekTitle').textContent = `KW ${week.week}`;
  document.querySelector('#weekRange').textContent = formatWeekRange(week.startDate, week.endDate);
  document.querySelector('#weekSignal').textContent = week.weeklySignal;
  document.querySelector('#weekBuyDays').textContent = week.buyDays;
  document.querySelector('#weekWaitDays').textContent = week.waitDays;
  document.querySelector('#weekSellDays').textContent = week.sellDays;

  document.querySelector('#previousWeekButton').disabled = selectedWeekIndex === 0;
  document.querySelector('#nextWeekButton').disabled = selectedWeekIndex === weeklySummaries.length - 1;
}

function getIsoWeekInfo(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const year = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthWeekday = januaryFourth.getUTCDay() || 7;
  const startDate = new Date(januaryFourth);
  startDate.setUTCDate(januaryFourth.getUTCDate() - januaryFourthWeekday + 1 + ((week - 1) * 7));
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);
  return {
    key: `${year}-W${String(week).padStart(2, '0')}`,
    year,
    week,
    startDate,
    endDate,
  };
}

function formatWeekRange(startDate, endDate) {
  const start = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(startDate);
  const end = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(endDate);
  return `${start}–${end}`;
}

function renderCharts(data) {
  if (!window.Chart) return;
  const fullHistory = data.charts?.history || [];
  const history = getVisibleChartHistory(fullHistory);
  const labels = history.map(point => formatShortDate(point.date));
  renderChartRangeControl(fullHistory, history);

  charts.nasdaq = replaceChart(charts.nasdaq, 'nasdaqChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        lineDataset('NASDAQ-100', history.map(point => point.nasdaq), '#ffc247', 3),
        lineDataset('SMA200', history.map(point => point.sma200), '#9b8961', 2),
        lineDataset('Kauf-Linie', history.map(point => point.buyLine), '#78b83e', 2),
        lineDataset('Verkaufs-Linie', history.map(point => point.sellLine), '#d9553f', 2),
      ],
    },
  });

  charts.signalHistory = replaceChart(charts.signalHistory, 'signalHistoryChart', signalHistoryChartConfig(labels, history));

  charts.vix = replaceChart(charts.vix, 'vixChart', thresholdChartConfig(labels, history.map(point => point.vix), 'VIX', data.config?.vixOk || 25, data.config?.vixStop || 30));
  charts.vxn = replaceChart(charts.vxn, 'vxnChart', thresholdChartConfig(labels, history.map(point => point.vxn), 'VXN', data.config?.vxnOk || 30, data.config?.vxnStop || 35));
}

function signalHistoryChartConfig(labels, history) {
  const values = history.map(point => signalToChartValue(point.signal));
  const pointColors = history.map(point => signalColor(point.signal));
  return {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Tages-Signal',
        data: values,
        borderColor: '#e7d7ad',
        backgroundColor: '#e7d7ad',
        borderWidth: 2,
        stepped: true,
        tension: 0,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => chartValueToSignal(context.raw),
          },
        },
      },
      scales: {
        y: {
          min: -1,
          max: 1,
          ticks: {
            stepSize: 1,
            callback: value => chartValueToSignal(value),
          },
        },
      },
    },
  };
}

function signalToChartValue(signal) {
  if (signal === 'KAUFEN') return 1;
  if (signal === 'VERKAUFEN') return -1;
  return 0;
}

function chartValueToSignal(value) {
  if (Number(value) === 1) return 'KAUFEN';
  if (Number(value) === -1) return 'VERKAUFEN';
  return 'WARTEN';
}

function signalColor(signal) {
  if (signal === 'KAUFEN') return '#78b83e';
  if (signal === 'VERKAUFEN') return '#d9553f';
  return '#e6a400';
}

function getVisibleChartHistory(history) {
  const selectedRange = localStorage.getItem(STORAGE_KEYS.chartDays) || '30';
  if (selectedRange === 'all') return history;
  return history.slice(-Number(selectedRange));
}

function renderChartRangeControl(fullHistory, visibleHistory) {
  const selectedRange = localStorage.getItem(STORAGE_KEYS.chartDays) || '30';
  document.querySelectorAll('[data-chart-days]').forEach(button => {
    button.classList.toggle('active', button.dataset.chartDays === selectedRange);
  });

  const summary = document.querySelector('#chartRangeSummary');
  if (!visibleHistory.length) {
    summary.textContent = 'Keine Daten';
    return;
  }

  const firstValue = Number(visibleHistory[0].nasdaq);
  const lastValue = Number(visibleHistory[visibleHistory.length - 1].nasdaq);
  const development = firstValue ? (lastValue / firstValue) - 1 : null;
  const rangeLabel = selectedRange === 'all' ? 'Alle' : `${visibleHistory.length} Handelstage`;
  summary.textContent = `${rangeLabel} · ${formatPercent(development)}`;
}

function thresholdChartConfig(labels, values, label, ok, stop) {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        lineDataset(label, values, '#ffc247', 3),
        lineDataset('OK', values.map(() => ok), '#78b83e', 2),
        lineDataset('STOP', values.map(() => stop), '#d9553f', 2),
      ],
    },
  };
}

function lineDataset(label, data, color, width) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: width,
    tension: 0.28,
    pointRadius: 2,
  };
}

function replaceChart(existing, canvasId, config) {
  if (existing) existing.destroy();
  const context = document.querySelector(`#${canvasId}`);
  const customOptions = config.options || {};
  const customPlugins = customOptions.plugins || {};
  const customScales = customOptions.scales || {};
  return new Chart(context, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...customOptions,
      plugins: {
        legend: { labels: { color: '#e7d7ad', font: { family: 'IBM Plex Mono' } } },
        ...customPlugins,
      },
      scales: {
        x: {
          ...customScales.x,
          ticks: {
            color: '#9b8961',
            maxTicksLimit: window.matchMedia('(max-width: 560px)').matches ? 5 : 8,
            ...(customScales.x?.ticks || {}),
          },
          grid: { color: 'rgba(230,164,0,0.10)', ...(customScales.x?.grid || {}) },
        },
        y: {
          ...customScales.y,
          ticks: { color: '#9b8961', ...(customScales.y?.ticks || {}) },
          grid: { color: 'rgba(230,164,0,0.10)', ...(customScales.y?.grid || {}) },
        },
      },
    },
  });
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value));
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(Number(value));
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Number(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return 'unbekannt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unbekannt';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(value));
}

function bindEvents() {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      document.querySelector(`#tab-${button.dataset.tab}`).classList.add('active');
      if (button.dataset.tab === 'charts') {
        requestAnimationFrame(() => renderCharts(currentData));
      }
    });
  });

  document.querySelector('#saveSettingsButton').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEYS.apiUrl, document.querySelector('#apiUrlInput').value.trim());
    localStorage.setItem(STORAGE_KEYS.apiToken, document.querySelector('#apiTokenInput').value.trim());
    readApi().catch(error => setError(error.message));
  });

  document.querySelector('#clearSettingsButton').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.apiUrl);
    localStorage.removeItem(STORAGE_KEYS.apiToken);
    readApi().catch(error => setError(error.message));
  });

  document.querySelector('#addTickerForm').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.querySelector('#tickerInput');
    if (!selectedDepotTicker) return;
    mutateDepot('addTicker', selectedDepotTicker)
      .then(() => {
        input.value = '';
        selectedDepotTicker = '';
        tickerSuggestions = [];
        document.querySelector('#addTickerButton').disabled = true;
        renderTickerSuggestions();
      })
      .catch(error => setError(error.message));
  });

  document.querySelector('#tickerInput').addEventListener('input', event => {
    updateTickerSuggestions(event.target.value);
  });

  document.querySelector('#tickerInput').addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveTickerSuggestion(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveTickerSuggestion(-1);
    } else if (event.key === 'Enter' && activeSuggestionIndex >= 0 && !selectedDepotTicker) {
      event.preventDefault();
      selectTickerSuggestion(activeSuggestionIndex);
    } else if (event.key === 'Escape') {
      tickerSuggestions = [];
      renderTickerSuggestions();
    }
  });

  document.querySelector('#tickerSuggestions').addEventListener('pointerdown', event => {
    const option = event.target.closest('[data-ticker]');
    if (!option) return;
    event.preventDefault();
    const index = tickerSuggestions.findIndex(item => item.ticker === option.dataset.ticker);
    selectTickerSuggestion(index);
  });

  document.addEventListener('pointerdown', event => {
    if (event.target.closest('.ticker-autocomplete')) return;
    tickerSuggestions = [];
    renderTickerSuggestions();
  });

  document.querySelector('#depotList').addEventListener('click', event => {
    if (!event.target.matches('.remove-button')) return;
    mutateDepot('removeTicker', event.target.dataset.ticker).catch(error => setError(error.message));
  });

  document.querySelector('#rankingSearch').addEventListener('input', () => {
    renderRanking(currentData.signals || []);
  });

  document.querySelector('#chartRangeControl').addEventListener('click', event => {
    const button = event.target.closest('[data-chart-days]');
    if (!button) return;
    localStorage.setItem(STORAGE_KEYS.chartDays, button.dataset.chartDays);
    renderCharts(currentData);
  });

  document.querySelector('#previousWeekButton').addEventListener('click', () => {
    if (selectedWeekIndex <= 0) return;
    selectedWeekIndex -= 1;
    renderSelectedWeek();
  });

  document.querySelector('#nextWeekButton').addEventListener('click', () => {
    if (selectedWeekIndex >= weeklySummaries.length - 1) return;
    selectedWeekIndex += 1;
    renderSelectedWeek();
  });
}

bindEvents();
readApi().catch(error => {
  currentData = sampleData;
  render(sampleData);
  setError(error.message);
});
