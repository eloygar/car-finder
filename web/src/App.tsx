import {
  ArrowSquareOut,
  CarProfile,
  FunnelSimple,
  MapPin,
  MagnifyingGlass,
  SlidersHorizontal,
  WarningCircle,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SearchItem, SearchResponse, TaxonomyResponse } from './types.js';

type FormState = {
  brand: string;
  model: string;
  locationId: string;
  distanceMeters: string;
  engine: string;
  transmission: string;
  bodyType: string;
  priceMin: string;
  priceMax: string;
  yearMin: string;
  yearMax: string;
  mileageMax: string;
  maxPages: string;
};

export function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => formFromUrl(searchParams));
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/taxonomy', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('taxonomy');
        return response.json() as Promise<TaxonomyResponse>;
      })
      .then((data) => {
        setTaxonomy(data);
        setForm((current) => ({
          ...current,
          brand: data.brands.includes(current.brand) ? current.brand : 'Toyota',
          locationId: data.locations.some(({ id }) => id === current.locationId)
            ? current.locationId
            : 'madrid',
        }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setTaxonomyError('No se ha podido cargar la taxonomía capturada.');
      });
    return () => controller.abort();
  }, []);

  const models = useMemo(
    () => taxonomy?.models[form.brand] ?? [],
    [taxonomy, form.brand],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    setResult(null);
    setSearchParams(urlFromForm(form));

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toRequest(form)),
      });
      const payload = await response.json() as SearchResponse | { message?: string };
      if (!response.ok) {
        throw new Error('message' in payload && payload.message
          ? payload.message
          : 'La búsqueda no se ha podido completar.');
      }
      setResult(payload as SearchResponse);
    } catch (error) {
      setSearchError(error instanceof Error
        ? error.message
        : 'La búsqueda no se ha podido completar.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--page)] text-[var(--text)]">
      <header className="app-header">
        <div className="app-shell flex h-full items-center justify-between gap-4">
          <a className="brand" href="/" aria-label="Car Finder, inicio">
            <span className="brand-mark"><CarProfile size={25} weight="fill" /></span>
            <span>Car Finder</span>
          </a>
          <nav className="app-nav">
            <a className="nav-link" href="/">Búsqueda</a>
            <a className="nav-link" href="/anuncios">Anuncios guardados</a>
          </nav>
        </div>
      </header>

      <main className="app-shell py-7 md:py-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
            Encuentra el coche que buscas
          </h1>
          <p className="mt-3 max-w-[58ch] text-base leading-relaxed text-[var(--muted)]">
            Configura los filtros, consulta Wallapop y guarda una captura lista para reconciliar.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="panel lg:sticky lg:top-24">
            <div className="panel-heading">
              <FunnelSimple size={20} weight="bold" />
              <h2>Filtros</h2>
            </div>

            {taxonomyError ? (
              <div className="status-error" role="alert">{taxonomyError}</div>
            ) : (
              <SearchForm
                form={form}
                taxonomy={taxonomy}
                models={models}
                searching={searching}
                onUpdate={update}
                onSubmit={submit}
              />
            )}
          </aside>

          <section aria-labelledby="results-title" className="min-w-0">
            <ResultsHeader result={result} searching={searching} />
            <div aria-live="polite">
              {searching ? <LoadingResults /> : null}
              {searchError ? <ErrorState message={searchError} /> : null}
              {!searching && !searchError && result ? (
                <>
                  <ReconciliationStatus reconciliation={result.reconciliation} />
                  {result.warning ? <SearchWarning message={result.warning} /> : null}
                  <Results result={result} />
                </>
              ) : null}
              {!searching && !searchError && !result ? <InitialState /> : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function SearchForm({
  form,
  taxonomy,
  models,
  searching,
  onUpdate,
  onSubmit,
}: {
  form: FormState;
  taxonomy: TaxonomyResponse | null;
  models: string[];
  searching: boolean;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="space-y-6 p-5" onSubmit={onSubmit}>
      <fieldset className="form-section">
        <legend>Coche</legend>
        <label className="field">
          <span>Marca</span>
          <select
            value={form.brand}
            onChange={(event) => {
              onUpdate('brand', event.target.value);
              onUpdate('model', '');
            }}
            disabled={!taxonomy || searching}
            required
          >
            {(taxonomy?.brands ?? []).map((brand) => <option key={brand}>{brand}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Modelo</span>
          <select
            value={form.model}
            onChange={(event) => onUpdate('model', event.target.value)}
            disabled={!taxonomy || searching}
          >
            <option value="">Todos los modelos</option>
            {models.map((model) => <option key={model}>{model}</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Ubicación</legend>
        <label className="field">
          <span>Ciudad</span>
          <select
            value={form.locationId}
            onChange={(event) => onUpdate('locationId', event.target.value)}
            disabled={!taxonomy || searching}
            required
          >
            {(taxonomy?.locations ?? []).map((location) => (
              <option key={location.id} value={location.id}>{location.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Radio</span>
          <select
            value={form.distanceMeters}
            onChange={(event) => onUpdate('distanceMeters', event.target.value)}
            disabled={searching}
          >
            <option value="10000">10 km</option>
            <option value="25000">25 km</option>
            <option value="50000">50 km</option>
            <option value="100000">100 km</option>
            <option value="200000">200 km</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Precio</legend>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Desde" suffix="€" value={form.priceMin} onChange={(value) => onUpdate('priceMin', value)} disabled={searching} />
          <NumberField label="Hasta" suffix="€" value={form.priceMax} onChange={(value) => onUpdate('priceMax', value)} disabled={searching} />
        </div>
      </fieldset>

      <details className="advanced-filters">
        <summary><SlidersHorizontal size={18} /> Más filtros</summary>
        <div className="space-y-5 pt-5">
          <label className="field">
            <span>Combustible</span>
            <select value={form.engine} onChange={(event) => onUpdate('engine', event.target.value)} disabled={!taxonomy || searching}>
              <option value="">Cualquier combustible</option>
              {(taxonomy?.filters.fuel ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Cambio</span>
            <select value={form.transmission} onChange={(event) => onUpdate('transmission', event.target.value)} disabled={!taxonomy || searching}>
              <option value="">Cualquier cambio</option>
              {(taxonomy?.filters.transmission ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Carrocería</span>
            <select value={form.bodyType} onChange={(event) => onUpdate('bodyType', event.target.value)} disabled={!taxonomy || searching}>
              <option value="">Cualquier carrocería</option>
              {(taxonomy?.filters.bodyType ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Año desde" value={form.yearMin} min="1980" max="2026" onChange={(value) => onUpdate('yearMin', value)} disabled={searching} />
            <NumberField label="Año hasta" value={form.yearMax} min="1980" max="2026" onChange={(value) => onUpdate('yearMax', value)} disabled={searching} />
          </div>
          <NumberField label="Kilómetros máximos" suffix="km" value={form.mileageMax} onChange={(value) => onUpdate('mileageMax', value)} disabled={searching} />
          <label className="field">
            <span>Páginas a consultar</span>
            <select value={form.maxPages} onChange={(event) => onUpdate('maxPages', event.target.value)} disabled={searching}>
              <option value="">Todas las páginas</option>
              <option value="1">1 página</option>
              <option value="3">3 páginas</option>
              <option value="5">5 páginas</option>
              <option value="10">10 páginas</option>
            </select>
            <small>La búsqueda completa termina cuando Wallapop deja de devolver un cursor.</small>
          </label>
        </div>
      </details>

      <button className="primary-button" disabled={!taxonomy || searching} type="submit">
        <MagnifyingGlass size={20} weight="bold" />
        {searching ? 'Buscando...' : 'Buscar coches'}
      </button>
    </form>
  );
}

function NumberField({ label, suffix, value, min = '0', max, onChange, disabled }: {
  label: string;
  suffix?: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="number-input">
        <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
        {suffix ? <span aria-hidden="true">{suffix}</span> : null}
      </div>
    </label>
  );
}

function ResultsHeader({ result, searching }: { result: SearchResponse | null; searching: boolean }) {
  return (
    <div className="mb-4 flex min-h-10 flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="results-title" className="text-xl font-bold tracking-tight">Resultados</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {searching
            ? 'Consultando páginas de forma secuencial.'
            : result
              ? `${result.matched.toLocaleString('es-ES')} anuncios coinciden con los filtros.`
              : 'La búsqueda mostrará hasta 100 anuncios.'}
        </p>
      </div>
      {result ? <span className="artifact-label">Guardado en {result.outputPath}</span> : null}
    </div>
  );
}

function Results({ result }: { result: SearchResponse }) {
  if (result.items.length === 0) {
    return <EmptyState />;
  }
  return (
    <>
      <div className="results-grid">
        {result.items.map((item) => <ResultCard key={item.id} item={item} />)}
      </div>
      {result.matched > result.displayed ? (
        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          La vista previa muestra {result.displayed} de {result.matched}. El JSON contiene todos los resultados.
        </p>
      ) : null}
    </>
  );
}

function ReconciliationStatus({
  reconciliation,
}: {
  reconciliation: SearchResponse['reconciliation'];
}) {
  if (reconciliation.status === 'failed') {
    return (
      <div className="reconciliation-status reconciliation-status-error" role="status">
        <strong>Captura guardada, base de datos pendiente</strong>
        <span>{reconciliation.message}</span>
      </div>
    );
  }

  const { summary } = reconciliation;
  return (
    <div className="reconciliation-status" role="status">
      <strong>Base de datos actualizada</strong>
      <span>
        {summary.created} nuevos · {summary.changed} modificados · {summary.unchanged} sin cambios
        {summary.reactivated > 0 ? ` · ${summary.reactivated} reactivados` : ''}
      </span>
    </div>
  );
}

function ResultCard({ item }: { item: SearchItem }) {
  const content = (
    <article className="result-card">
      <figure className="result-image">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} loading="lazy" />
        ) : (
          <CarProfile size={42} aria-hidden="true" />
        )}
      </figure>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-bold leading-snug">{item.title}</h3>
          {item.url ? <ArrowSquareOut className="mt-0.5 shrink-0 text-[var(--muted)]" size={18} aria-hidden="true" /> : null}
        </div>
        <p className="mt-3 text-xl font-extrabold tracking-tight">{formatPrice(item)}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {[item.year, item.mileage === null ? null : `${item.mileage.toLocaleString('es-ES')} km`]
            .filter(Boolean).join(' | ') || 'Datos técnicos no disponibles'}
        </p>
        {item.location ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-[var(--muted)]">
            <MapPin size={16} weight="bold" aria-hidden="true" /> {item.location}
          </p>
        ) : null}
      </div>
    </article>
  );
  return item.url
    ? <a className="block focus-visible:outline-none" href={item.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${item.title} en Wallapop`}>{content}</a>
    : content;
}

function InitialState() {
  return (
    <div className="empty-state">
      <MagnifyingGlass size={44} weight="duotone" />
      <h3>Configura tu primera búsqueda</h3>
      <p>Elige una marca y una ubicación. Puedes afinar los resultados con los filtros adicionales.</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <CarProfile size={44} weight="duotone" />
      <h3>No hay coincidencias</h3>
      <p>Amplía el radio, consulta más páginas o elimina alguno de los filtros.</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-state" role="alert">
      <h3>La búsqueda se ha detenido</h3>
      <p>{message}</p>
    </div>
  );
}

function SearchWarning({ message }: { message: string }) {
  return (
    <div className="search-warning" role="status">
      <WarningCircle size={18} weight="bold" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function LoadingResults() {
  return (
    <div className="results-grid" aria-label="Cargando resultados">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton h-44" />
          <div className="space-y-3 p-4">
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-6 w-2/5" />
            <div className="skeleton h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formFromUrl(params: URLSearchParams): FormState {
  return {
    brand: params.get('brand') ?? 'Toyota',
    model: params.get('model') ?? '',
    locationId: params.get('location') ?? 'madrid',
    distanceMeters: params.get('distance') ?? '50000',
    engine: params.get('engine') ?? '',
    transmission: params.get('transmission') ?? '',
    bodyType: params.get('bodyType') ?? '',
    priceMin: params.get('priceMin') ?? '',
    priceMax: params.get('priceMax') ?? '',
    yearMin: params.get('yearMin') ?? '',
    yearMax: params.get('yearMax') ?? '',
    mileageMax: params.get('mileageMax') ?? '',
    maxPages: params.get('maxPages') ?? '',
  };
}

function urlFromForm(form: FormState): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(form).forEach(([key, value]) => {
    if (value) params.set(key === 'locationId' ? 'location' : key, value);
  });
  return params;
}

function toRequest(form: FormState) {
  return {
    brand: form.brand,
    ...(form.model ? { model: form.model } : {}),
    locationId: form.locationId,
    distanceMeters: Number(form.distanceMeters),
    ...(form.engine ? { engine: form.engine } : {}),
    ...(form.transmission ? { transmission: form.transmission } : {}),
    ...(form.bodyType ? { bodyType: form.bodyType } : {}),
    ...rangePayload('price', form.priceMin, form.priceMax),
    ...rangePayload('year', form.yearMin, form.yearMax),
    ...rangePayload('mileage', '', form.mileageMax),
    ...(form.maxPages ? { maxPages: Number(form.maxPages) } : {}),
  };
}

function rangePayload(name: string, min: string, max: string) {
  return min || max
    ? { [name]: { ...(min ? { min: Number(min) } : {}), ...(max ? { max: Number(max) } : {}) } }
    : {};
}

function formatPrice(item: SearchItem): string {
  if (item.price === null) return 'Precio no disponible';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: item.currency || 'EUR',
    maximumFractionDigits: 0,
  }).format(item.price);
}
