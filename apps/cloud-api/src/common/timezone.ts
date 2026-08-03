/** Partes de data/hora no timezone IANA do device. */
export function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/Manaus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    day: weekdayMap[parts.weekday] ?? date.getUTCDay(),
    hhmm: `${parts.hour}:${parts.minute}`,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Início e fim do dia civil no timezone, em Date UTC. */
export function zonedDayBounds(date: Date, timeZone: string) {
  const { ymd } = zonedParts(date, timeZone);
  // Aproxima o offset testando meio-dia UTC do dia civil
  const probe = new Date(`${ymd}T12:00:00.000Z`);
  const local = zonedParts(probe, timeZone);
  // Diferença em minutos entre "relógio local" e UTC no probe
  const [lh, lm] = local.hhmm.split(':').map(Number);
  const utcMinutes = probe.getUTCHours() * 60 + probe.getUTCMinutes();
  const localMinutes = lh * 60 + lm;
  const offsetMin = localMinutes - utcMinutes;

  const startUtc = new Date(`${ymd}T00:00:00.000Z`);
  startUtc.setUTCMinutes(startUtc.getUTCMinutes() - offsetMin);
  const endUtc = new Date(startUtc);
  endUtc.setUTCDate(endUtc.getUTCDate() + 1);
  return { start: startUtc, end: endUtc, ymd };
}
