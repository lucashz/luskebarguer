export function selectSearchTargets({ cities = [], segments = [], history = [], count = 6, maxPopulation = 55000 } = {}) {
  const historyByTarget = new Map(history.map((row) => [targetKey(row), row]));
  const eligibleCities = cities.filter((row) => {
    const population = Number(row.population);
    return row.city && row.state && Number.isInteger(population) && population > 0 && population <= maxPopulation;
  });
  const eligibleSegments = [...new Set(segments.map((segment) => String(segment || '').trim()).filter(Boolean))];
  const candidates = [];

  for (const city of eligibleCities) {
    for (const segment of eligibleSegments) {
      const previous = historyByTarget.get(targetKey({ ...city, segment }));
      candidates.push({
        city: String(city.city),
        state: String(city.state).toUpperCase(),
        population: Number(city.population),
        segment,
        search_count: Number(previous?.search_count || 0),
        last_searched_at: previous?.last_searched_at || null
      });
    }
  }

  candidates.sort((a, b) => (
    a.search_count - b.search_count
    || timestamp(a.last_searched_at) - timestamp(b.last_searched_at)
    || a.city.localeCompare(b.city, 'pt-BR')
    || a.segment.localeCompare(b.segment, 'pt-BR')
  ));

  const selected = [];
  const remaining = [...candidates];
  while (selected.length < Math.max(0, Number(count) || 0) && remaining.length) {
    const previous = selected.at(-1);
    const differentCityAndSegment = remaining.findIndex((row) => row.city !== previous?.city && row.segment !== previous?.segment);
    const differentSegment = remaining.findIndex((row) => row.segment !== previous?.segment);
    const index = differentCityAndSegment >= 0 ? differentCityAndSegment : differentSegment >= 0 ? differentSegment : 0;
    selected.push(remaining.splice(index, 1)[0]);
  }
  return selected;
}

export function resolveSearchTargetOverride({ city, state, segment, cities = [], segments = [], maxPopulation = 55000 } = {}) {
  const supplied = [city, state, segment].filter((value) => String(value || '').trim()).length;
  if (!supplied) return null;
  if (supplied !== 3) throw new Error('Informe cidade, estado e segmento para o alvo operacional.');
  const normalizedCity = normalize(city);
  const normalizedState = String(state).trim().toUpperCase();
  const matchedCity = cities.find((item) => normalize(item.city) === normalizedCity && String(item.state).trim().toUpperCase() === normalizedState);
  if (!matchedCity || !Number.isInteger(Number(matchedCity.population)) || Number(matchedCity.population) > maxPopulation) {
    throw new Error('O alvo operacional precisa ser uma cidade pequena cadastrada, com até 55 mil habitantes.');
  }
  const matchedSegment = segments.find((item) => normalize(item) === normalize(segment));
  if (!matchedSegment) throw new Error('Segmento inválido para o alvo operacional.');
  return { city: String(matchedCity.city), state: normalizedState, population: Number(matchedCity.population), segment: String(matchedSegment) };
}

function targetKey(row) {
  return `${String(row.city || '').trim().toLocaleLowerCase('pt-BR')}|${String(row.state || '').trim().toUpperCase()}|${String(row.segment || '').trim().toLocaleLowerCase('pt-BR')}`;
}

function timestamp(value) {
  const result = value ? new Date(value).getTime() : 0;
  return Number.isFinite(result) ? result : 0;
}

function normalize(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
