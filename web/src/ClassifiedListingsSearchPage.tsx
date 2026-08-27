import {
  ArrowSquareOut,
  CarProfile,
  CaretDown,
  CaretUp,
  MapPin,
  MagnifyingGlass,
  WarningCircle,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ClassificationDetails, ListingPrice } from './ListingsPage.js';
import type {
  ClassifiedListingsSearchResponse,
  ClassifiedSearchOptions,
  ListingRanking,
  ListingRecord,
  RankingFactor,
} from './types.js';

const PAGE_SIZE = 20;

export type ClassifiedSearchForm = {
  brand: string;
  vehicleModelId: string;
  priceTargetMax: string;
  mileageTargetMax: string;
  locationId: 'vigo';
};

export function ClassifiedListingsSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<ClassifiedSearchOptions | null>(null);
  const [form, setForm] = useState<ClassifiedSearchForm>(() => classifiedSearchFormFromUrl(searchParams));
  const [result, setResult] = useState<ClassifiedListingsSearchResponse | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/classified-listings/search-options', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('options');
        return response.json() as Promise<ClassifiedSearchOptions>;
      })
      .then((payload) => {
        setOptions(payload);
        setForm((current) => validFormSelection(current, payload));
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError('No se han podido cargar los modelos clasificados disponibles.');
      })
      .finally(() => setLoadingOptions(false));
    return () => controller.abort();
  }, []);

  const models = useMemo(
    () => options?.brands.find(({ brand }) => brand === form.brand)?.models ?? [],
    [options, form.brand],
  );

  useEffect(() => {
    if (!options || !hasCompleteUrlSearch(searchParams)) return;
    const parsed = validFormSelection(classifiedSearchFormFromUrl(searchParams), options);
    setForm(parsed);
    void runSearch(parsed, classifiedSearchPageFromUrl(searchParams), false);
    // The URL is the trigger; options only changes once after loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  async function runSearch(nextForm: ClassifiedSearchForm, page: number, updateUrl: boolean) {
    const priceTargetMax = Number(nextForm.priceTargetMax);
    const mileageTargetMax = Number(nextForm.mileageTargetMax);
    if (!nextForm.vehicleModelId || !Number.isFinite(priceTargetMax) || priceTargetMax <= 0
      || !Number.isFinite(mileageTargetMax) || mileageTargetMax <= 0) {
      setError('Selecciona marca y modelo e indica objetivos válidos de precio y kilometraje.');
      return;
    }
    if (updateUrl) setSearchParams(classifiedSearchUrlFromForm(nextForm, page));
    setSearching(true);
    setError(null);
    try {
      const response = await fetch('/api/classified-listings/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleModelId: nextForm.vehicleModelId,
          priceTargetMax,
          mileageTargetMax,
          locationId: nextForm.locationId,
          page,
          pageSize: PAGE_SIZE,
        }),
      });
      const payload = await response.json() as ClassifiedListingsSearchResponse | { message?: string };
      if (!response.ok) {
        throw new Error('message' in payload && payload.message
          ? payload.message
          : 'No se ha podido completar la búsqueda.');
      }
      setResult(payload as ClassifiedListingsSearchResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se ha podido completar la búsqueda.');
    } finally {
      setSearching(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(form, 1, true);
  }

  function selectBrand(brand: string) {
    const vehicleModelId = options?.brands.find((entry) => entry.brand === brand)?.models[0]?.id ?? '';
    setForm((current) => ({ ...current, brand, vehicleModelId }));
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="min-h-[100dvh] bg-[var(--page)] text-[var(--text)]">
      <AppHeader />
      <main className="app-shell py-7 md:py-10">
        <div className="mb-8 max-w-3xl">
          <p className="recommendation-kicker">Ranking sobre tu base de datos</p>
          <h1 className="text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Encuentra tu mejor candidato</h1>
          <p className="mt-3 max-w-[65ch] text-base leading-relaxed text-[var(--muted)]">
            Compara anuncios ya clasificados según presupuesto, kilometraje, cercanía a Vigo e incidencias detectadas.
          </p>
        </div>

        <form className="recommendation-form panel" onSubmit={submit}>
          <label>
            <span>Marca</span>
            <select value={form.brand} onChange={(event) => selectBrand(event.target.value)} disabled={loadingOptions || searching} required>
              <option value="">Selecciona una marca</option>
              {(options?.brands ?? []).map(({ brand }) => <option key={brand} value={brand}>{brand}</option>)}
            </select>
          </label>
          <label>
            <span>Modelo</span>
            <select
              value={form.vehicleModelId}
              onChange={(event) => setForm((current) => ({ ...current, vehicleModelId: event.target.value }))}
              disabled={!form.brand || loadingOptions || searching}
              required
            >
              <option value="">Selecciona un modelo</option>
              {models.map((model) => <option key={model.id} value={model.id}>{model.model}</option>)}
            </select>
          </label>
          <NumberField
            label="Precio máximo objetivo"
            value={form.priceTargetMax}
            suffix="€"
            disabled={searching}
            onChange={(priceTargetMax) => setForm((current) => ({ ...current, priceTargetMax }))}
          />
          <NumberField
            label="Kilometraje máximo objetivo"
            value={form.mileageTargetMax}
            suffix="km"
            disabled={searching}
            onChange={(mileageTargetMax) => setForm((current) => ({ ...current, mileageTargetMax }))}
          />
          <label>
            <span>Tu ubicación</span>
            <select value={form.locationId} disabled aria-label="Tu ubicación">
              <option value="vigo">Vigo</option>
            </select>
          </label>
          <button className="recommendation-submit" type="submit" disabled={loadingOptions || searching || !form.vehicleModelId}>
            <MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
            {searching ? 'Puntuando…' : 'Buscar candidatos'}
          </button>
        </form>

        {error ? (
          <div className="status-error recommendation-error" role="alert">
            <WarningCircle size={18} weight="bold" aria-hidden="true" /> {error}
          </div>
        ) : null}

        {result ? (
          <section className="recommendation-results" aria-live="polite">
            <div className="recommendation-results-head">
              <div>
                <p className="recommendation-kicker">Resultados ordenados por afinidad</p>
                <h2>{result.total} candidato{result.total === 1 ? '' : 's'}</h2>
              </div>
              <span>Página {result.page} de {totalPages}</span>
            </div>
            {result.items.length === 0 ? (
              <div className="empty-state">
                <CarProfile size={42} weight="duotone" aria-hidden="true" />
                <h3>No hay candidatos clasificados</h3>
                <p>Prueba otro modelo o clasifica más anuncios antes de repetir la búsqueda.</p>
              </div>
            ) : (
              <div className="ranked-listings-grid">
                {result.items.map((item, index) => (
                  <RankedListingCard
                    key={item.listing.id}
                    {...item}
                    position={(result.page - 1) * result.pageSize + index + 1}
                    listingIssueAssessmentsEnabled={result.features?.listingIssueAssessments ?? false}
                  />
                ))}
              </div>
            )}
            {result.total > result.pageSize ? (
              <nav className="recommendation-pagination" aria-label="Paginación de resultados">
                <button
                  type="button"
                  disabled={searching || result.page <= 1}
                  onClick={() => void runSearch(form, result.page - 1, true)}
                >Anterior</button>
                <span>{result.page} / {totalPages}</span>
                <button
                  type="button"
                  disabled={searching || result.page >= totalPages}
                  onClick={() => void runSearch(form, result.page + 1, true)}
                >Siguiente</button>
              </nav>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export function RankedListingCard({
  listing,
  ranking,
  position,
  listingIssueAssessmentsEnabled = true,
}: {
  listing: ListingRecord;
  ranking: ListingRanking;
  position: number;
  listingIssueAssessmentsEnabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const principalReasons = [...ranking.breakdown]
    .filter(({ factor }) => factor !== 'base')
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 2);
  return (
    <article className="ranked-listing-card">
      <div className="ranked-listing-media">
        {listing.images[0] ? <img src={listing.images[0]} alt="" /> : <CarProfile size={44} weight="duotone" aria-hidden="true" />}
        <span className="ranking-position">#{position}</span>
        <div className="ranking-score" aria-label={`Puntuación ${ranking.score} sobre 100`}>
          <strong>{ranking.score}</strong><span>/100</span>
        </div>
      </div>
      <div className="ranked-listing-body">
        <div>
          <p className="recommendation-kicker">{listing.brand} · {listing.model}</p>
          <h2 className="ranked-listing-title"><a href={listing.url} target="_blank" rel="noreferrer">{listing.title}</a></h2>
        </div>
        <ListingPrice
          item={listing}
          listingIssueAssessmentsEnabled={listingIssueAssessmentsEnabled}
        />
        <div className="ranked-listing-facts">
          <span>{listing.mileage == null ? 'Kilometraje sin datos' : `${listing.mileage.toLocaleString('es-ES')} km`}</span>
          <span><MapPin size={15} weight="fill" aria-hidden="true" /> {ranking.distanceKm == null ? 'Distancia sin datos' : `${ranking.distanceKm.toLocaleString('es-ES')} km de Vigo`}</span>
        </div>
        <ul className="ranking-reasons">
          {principalReasons.map((entry) => (
            <li key={entry.factor}>
              <ScoreDelta delta={entry.delta} />
              <span>{entry.reason}</span>
            </li>
          ))}
        </ul>
        <button type="button" className={`details-toggle ${expanded ? 'is-open' : ''}`} onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          {expanded ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
          {expanded ? 'Ocultar análisis' : 'Ver análisis completo'}
        </button>
        {expanded ? (
          <div className="ranking-expanded">
            <RankingBreakdown ranking={ranking} />
            <ClassificationDetails
              item={listing}
              modelIssueAssessmentsEnabled={false}
              listingIssueAssessmentsEnabled={listingIssueAssessmentsEnabled}
            />
            <a className="listing-link" href={listing.url} target="_blank" rel="noreferrer">
              <ArrowSquareOut size={16} weight="bold" aria-hidden="true" /> Ver anuncio en Wallapop
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function RankingBreakdown({ ranking }: { ranking: ListingRanking }) {
  return (
    <div className="ranking-breakdown">
      <h3>Desglose de puntuación · {ranking.version}</h3>
      <ul>
        {ranking.breakdown.map((entry) => (
          <li key={entry.factor}>
            <div><span>{factorLabel(entry.factor)}</span><ScoreDelta delta={entry.delta} /></div>
            <p>{entry.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-shell flex h-full items-center justify-between gap-4">
        <a className="brand" href="/" aria-label="Car Finder, inicio">
          <span className="brand-mark"><CarProfile size={25} weight="fill" /></span><span>Car Finder</span>
        </a>
        <nav className="app-nav">
          <a className="nav-link" href="/">Búsqueda</a>
          <a className="nav-link" href="/buscar-anuncios">Recomendador</a>
          <a className="nav-link" href="/anuncios">Anuncios guardados</a>
        </nav>
      </div>
    </header>
  );
}

function NumberField({ label, value, suffix, disabled, onChange }: {
  label: string;
  value: string;
  suffix: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <div className="recommendation-number">
        <input type="number" min="1" step="1" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required />
        <span>{suffix}</span>
      </div>
    </label>
  );
}

function ScoreDelta({ delta }: { delta: number }) {
  return <strong className={`score-delta ${delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}`}>{delta > 0 ? '+' : ''}{delta}</strong>;
}

function factorLabel(factor: RankingFactor): string {
  return {
    base: 'Elegibilidad', price: 'Precio', mileage: 'Kilometraje', distance: 'Distancia',
    listing_issues: 'Incidencias del anuncio', model_issues: 'Problemas del modelo',
  }[factor];
}

export function classifiedSearchFormFromUrl(params: URLSearchParams): ClassifiedSearchForm {
  return {
    brand: params.get('brand') ?? '',
    vehicleModelId: params.get('model') ?? '',
    priceTargetMax: params.get('priceMax') ?? '',
    mileageTargetMax: params.get('mileageMax') ?? '',
    locationId: 'vigo',
  };
}

function validFormSelection(form: ClassifiedSearchForm, options: ClassifiedSearchOptions): ClassifiedSearchForm {
  const brandEntry = options.brands.find(({ brand }) => brand === form.brand) ?? options.brands[0];
  const model = brandEntry?.models.find(({ id }) => id === form.vehicleModelId) ?? brandEntry?.models[0];
  return { ...form, brand: brandEntry?.brand ?? '', vehicleModelId: model?.id ?? '', locationId: 'vigo' };
}

export function classifiedSearchUrlFromForm(form: ClassifiedSearchForm, page: number): URLSearchParams {
  const params = new URLSearchParams({
    brand: form.brand,
    model: form.vehicleModelId,
    priceMax: form.priceTargetMax,
    mileageMax: form.mileageTargetMax,
    location: form.locationId,
  });
  if (page > 1) params.set('page', String(page));
  return params;
}

function hasCompleteUrlSearch(params: URLSearchParams): boolean {
  return Boolean(params.get('model') && params.get('priceMax') && params.get('mileageMax'));
}

export function classifiedSearchPageFromUrl(params: URLSearchParams): number {
  const page = Number(params.get('page') ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
