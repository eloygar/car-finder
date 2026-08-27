import {
  ArrowSquareOut,
  CarProfile,
  CaretDown,
  CaretUp,
  MagnifyingGlass,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import type {
  ListingClassification,
  ListingsResponse,
  ListingRecord,
  VehicleOperabilityClassification,
} from './types.js';
import { taxonomyBrands, taxonomyModels } from './taxonomy.js';

const EXIT_DURATION = 240;

export function ListingsPage() {
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [classification, setClassification] = useState('classified');
  const [operability, setOperability] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ListingRecord | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/listings', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('listings');
        return (await response.json()) as ListingsResponse;
      })
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('No se ha podido cargar la lista de anuncios guardados.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const [facets, setFacets] = useState<{ brands: Record<string, number>; models: Record<string, number> }>({
    brands: {},
    models: {},
  });

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (brand) params.set('brand', brand);
    if (classification) params.set('classification', classification);
    if (operability) params.set('operability', operability);
    fetch(`/api/listings/facets?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('facets');
        return (await response.json()) as {
          brands: Array<{ brand: string; count: number }>;
          models: Array<{ brand: string; model: string; count: number }>;
        };
      })
      .then((payload) => {
        setFacets({
          brands: Object.fromEntries(payload.brands.map((entry) => [entry.brand, entry.count])),
          models: Object.fromEntries(payload.models.map((entry) => [entry.model, entry.count])),
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFacets({ brands: {}, models: {} });
      });
    return () => controller.abort();
  }, [status, brand, classification, operability]);

  const brands = useMemo(() => {
    const available = Object.keys(facets.brands);
    const source = available.length
      ? available
      : (data
        ? (Array.from(new Set(data.items.map((item) => item.brand).filter(Boolean))) as string[])
        : []);
    return taxonomyBrands.filter((name) => source.includes(name));
  }, [facets.brands, data]);

  const modelOptions = useMemo(() => {
    if (!brand) return [];
    const fromFacets = Object.entries(facets.models);
    if (fromFacets.length) {
      return fromFacets
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
    }
    const fromTaxonomy = taxonomyModels[brand] ?? [];
    const fromData = new Set(
      (data?.items ?? [])
        .filter((item) => item.brand === brand && item.model)
        .map((item) => item.model as string),
    );
    return Array.from(new Set([...fromTaxonomy, ...fromData]))
      .map((name) => ({ name, count: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [brand, facets.models, data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (status && item.status !== status) return false;
      if (brand && item.brand !== brand) return false;
      if (model && item.model !== model) return false;
      if (classification === 'classified' && item.classifiedAt == null) return false;
      if (classification === 'unclassified' && item.classifiedAt != null) return false;
      if (operability) {
        const c = asOperabilityClassification(item.classification);
        if (!c || c.status !== operability) return false;
      }
      if (term) {
        const haystack = `${item.title} ${item.brand} ${item.model}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [data, search, status, brand, model, classification, operability]);

  function requestDelete(item: ListingRecord) {
    if (item.classifiedAt != null) {
      setClosing(false);
      setPendingDelete(item);
      return;
    }
    void performDelete(item.id);
  }

  async function performDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    setRemovingId(id);
    await new Promise((resolve) => setTimeout(resolve, EXIT_DURATION));
    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? 'No se ha podido eliminar el anuncio.');
      }
      setData((previous) =>
        previous
          ? {
              count: previous.count - 1,
              items: previous.items.filter((item) => item.id !== id),
            }
          : previous,
      );
      setExpanded((current) => (current === id ? null : current));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se ha podido eliminar el anuncio.');
    } finally {
      setRemovingId(null);
      setDeleting(false);
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    closeConfirm();
    void performDelete(id);
  }

  function closeConfirm() {
    setClosing(true);
    window.setTimeout(() => {
      setPendingDelete(null);
      setClosing(false);
    }, 180);
  }

  useEffect(() => {
    if (!pendingDelete) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeConfirm();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDelete]);

  return (
    <div className="min-h-[100dvh] bg-[var(--page)] text-[var(--text)]">
      <header className="app-header">
        <div className="app-shell flex h-full items-center justify-between gap-4">
          <a className="brand" href="/" aria-label="Car Finder, inicio">
            <span className="brand-mark"><ArrowSquareOut size={25} weight="fill" /></span>
            <span>Car Finder</span>
          </a>
          <a className="brand-link" href="/">← Volver a la búsqueda</a>
        </div>
      </header>

      <main className="app-shell py-7 md:py-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
            Anuncios guardados
          </h1>
          <p className="mt-3 max-w-[58ch] text-base leading-relaxed text-[var(--muted)]">
            Tus anuncios reconciliados, con foto y datos clave. Filtra por marca o
            estado, revisa cada coche y elimínalo cuando ya no te interese.
          </p>
        </div>

        {deleteError ? (
          <div className="status-error mb-4 flex items-center gap-2" role="alert">
            <WarningCircle size={18} weight="bold" aria-hidden="true" />
            <span>{deleteError}</span>
          </div>
        ) : null}

        {error ? (
          <div className="status-error" role="alert">{error}</div>
        ) : (
          <ListingsGrid
            loading={loading}
            count={data?.count ?? 0}
            items={filtered}
            brands={brands}
            brandCounts={facets.brands}
            modelOptions={modelOptions}
            search={search}
            status={status}
            brand={brand}
            model={model}
            classification={classification}
            operability={operability}
            expanded={expanded}
            removingId={removingId}
            deleting={deleting}
            onSearch={setSearch}
            onStatus={setStatus}
            onBrand={(value) => {
              setBrand(value);
              setModel('');
            }}
            onModel={setModel}
            onClassification={setClassification}
            onOperability={setOperability}
            onToggle={setExpanded}
            onDelete={requestDelete}
          />
        )}
      </main>

      {pendingDelete ? (
        <ConfirmDialog
          item={pendingDelete}
          closing={closing}
          onConfirm={confirmDelete}
          onCancel={closeConfirm}
        />
      ) : null}
    </div>
  );
}

function ListingsGrid({
  loading,
  count,
  items,
  brands,
  brandCounts,
  modelOptions,
  search,
  status,
  brand,
  model,
  classification,
  operability,
  expanded,
  removingId,
  deleting,
  onSearch,
  onStatus,
  onBrand,
  onModel,
  onClassification,
  onOperability,
  onToggle,
  onDelete,
}: {
  loading: boolean;
  count: number;
  items: ListingRecord[];
  brands: string[];
  brandCounts: Record<string, number>;
  modelOptions: Array<{ name: string; count: number }>;
  search: string;
  status: string;
  brand: string;
  model: string;
  classification: string;
  operability: string;
  expanded: string | null;
  removingId: string | null;
  deleting: boolean;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onBrand: (value: string) => void;
  onModel: (value: string) => void;
  onClassification: (value: string) => void;
  onOperability: (value: string) => void;
  onToggle: (id: string | null) => void;
  onDelete: (item: ListingRecord) => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="listings-toolbar">
        <div className="listings-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar por título, marca o modelo"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
          {search ? (
            <button className="clear-button" aria-label="Limpiar búsqueda" onClick={() => onSearch('')}>
              <X size={16} />
            </button>
          ) : null}
        </div>
        <select value={status} onChange={(event) => onStatus(event.target.value)}>
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <select value={brand} onChange={(event) => onBrand(event.target.value)}>
          <option value="">Todas las marcas</option>
          {brands.map((name) => (
            <option key={name} value={name}>
              {name}{brandCounts[name] != null ? ` (${brandCounts[name]})` : ''}
            </option>
          ))}
        </select>
        <select
          value={model}
          disabled={!brand || modelOptions.length === 0}
          onChange={(event) => onModel(event.target.value)}
        >
          <option value="">
            {brand
              ? `Todos los modelos${modelOptions.length ? ` (${modelOptions.reduce((sum, option) => sum + option.count, 0)})` : ''}`
              : 'Elige marca'}
          </option>
          {modelOptions.map((option) => (
            <option key={option.name} value={option.name}>
              {option.name} ({option.count})
            </option>
          ))}
        </select>
        <select value={classification} onChange={(event) => onClassification(event.target.value)}>
          <option value="classified">Clasificados</option>
          <option value="unclassified">Sin clasificar</option>
          <option value="">Todos</option>
        </select>
        <select value={operability} onChange={(event) => onOperability(event.target.value)}>
          <option value="">Toda operatividad</option>
          <option value="operational">Operativos</option>
          <option value="non_operational">No operativos</option>
          <option value="unknown">Sin verificar</option>
        </select>
      </div>

      <div className="listings-meta">
        {loading
          ? 'Cargando anuncios…'
          : `${items.length.toLocaleString('es-ES')} de ${count.toLocaleString('es-ES')} anuncios`}
      </div>

      {loading ? (
        <div className="listings-loading">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="skeleton-card" key={index}>
              <div className="skeleton" style={{ aspectRatio: '16 / 10' }} />
              <div className="listing-body">
                <div className="skeleton" style={{ height: '1rem', width: '72%' }} />
                <div className="skeleton" style={{ height: '1.35rem', width: '42%' }} />
                <div className="skeleton" style={{ height: '.8rem', width: '88%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <MagnifyingGlass size={44} weight="duotone" />
          <h3>Sin resultados</h3>
          <p>Ajusta los filtros o limpia la búsqueda para ver más anuncios.</p>
        </div>
      ) : (
        <div className="listings-grid">
          {items.map((item, index) => (
            <ListingCard
              key={item.id}
              item={item}
              index={index}
              open={expanded === item.id}
              removing={removingId === item.id}
              disabled={deleting}
              onToggle={() => onToggle(expanded === item.id ? null : item.id)}
              onDelete={() => onDelete(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingCard({
  item,
  index,
  open,
  removing,
  disabled,
  onToggle,
  onDelete,
}: {
  item: ListingRecord;
  index: number;
  open: boolean;
  removing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const thumbnail = item.images?.[0];
  const heading = `${item.brand} ${item.model}`.trim() || item.title;
  const subtitle = item.title !== heading ? item.title : null;
  const specs = buildSpecs(item);

  return (
    <article
      className={['listing-card', removing ? 'is-removing' : '', open ? 'is-open' : '']
        .filter(Boolean)
        .join(' ')}
      style={index < 14 ? { animationDelay: `${Math.min(index, 13) * 28}ms` } : undefined}
    >
      <div className="listing-media">
        {thumbnail ? (
          <img src={thumbnail} alt={item.title} loading="lazy" />
        ) : (
          <span className="listing-media-empty"><CarProfile size={42} weight="duotone" aria-hidden="true" /></span>
        )}
        <span className={`listing-status status-pill status-${item.status}`}>
          {item.status === 'active' ? 'Activo' : 'Inactivo'}
        </span>
        <button
          type="button"
          className="delete-button"
          aria-label={`Eliminar ${item.title}`}
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash size={16} weight="bold" />
        </button>
      </div>

      <div className="listing-body">
        <h3 className="listing-title">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer">{heading}</a>
          ) : (
            <span>{heading}</span>
          )}
        </h3>
        {subtitle ? <p className="listing-subtitle">{subtitle}</p> : null}
        <div className="listing-price">{formatPrice(item.price)}</div>
        <ClassificationSummary item={item} />

        {specs.length > 0 ? (
          <dl className="listing-specs">
            {specs.map((spec) => (
              <div key={spec.label}>
                <dt>{spec.label}</dt>
                <dd>{spec.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="listing-footer">
          <span className="listing-seen">Visto por 1ª vez {formatDate(item.firstSeenAt)}</span>
          <button
            type="button"
            className={`details-toggle ${open ? 'is-open' : ''}`}
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
            {open ? 'Ocultar' : 'Detalles'}
          </button>
        </div>
      </div>

      {open ? <ListingDetails item={item} /> : null}
    </article>
  );
}

function ListingDetails({ item }: { item: ListingRecord }) {
  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) rows.push({ label, value });
  };

  push('Marca', item.brand);
  push('Modelo', item.model);
  if (item.year != null) push('Año', String(item.year));
  if (item.mileage != null) {
    push('Kilometraje', `${item.mileage.toLocaleString('es-ES')} km`);
  }
  push('Combustible', capitalize(item.fuelType));
  push('Cambio', capitalize(item.transmission));
  if (item.power != null) push('Potencia', `${item.power.toLocaleString('es-ES')} CV`);
  push('Carrocería', capitalize(item.bodyType));
  push('Provincia', item.province);
  if (item.sellerType || item.sellerName) {
    push('Vendedor', [capitalize(item.sellerType), item.sellerName].filter(Boolean).join(' · '));
  }
  push('Primera vez visto', formatDate(item.firstSeenAt));
  push('Última vez visto', formatDate(item.lastSeenAt));
  push('Estado', item.status === 'active' ? 'Activo' : 'Inactivo');
  push('Clasificado', item.classifiedAt ? `Sí (${item.classificationVersion ?? '—'})` : 'No');

  return (
    <div className="listing-details">
      <ClassificationDetails item={item} />
      <dl className="listing-details-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {item.url ? (
        <a className="listing-link" href={item.url} target="_blank" rel="noreferrer">
          <ArrowSquareOut size={16} weight="bold" aria-hidden="true" />
          Ver anuncio en Wallapop
        </a>
      ) : null}
    </div>
  );
}

function ClassificationSummary({ item }: { item: ListingRecord }) {
  const classification = asOperabilityClassification(item.classification);

  if (classification) {
    return (
      <div className="classification-summary">
        <div className="classification-heading">
          <span className={`operability-pill operability-${classification.status}`}>
            {operabilityLabel(classification.status)}
          </span>
          <span className="classification-confidence">
            Confianza {confidenceLabel(classification.confidence)}
          </span>
        </div>
        <p className="classification-reason" title={classification.reason}>
          {classification.reason}
        </p>
      </div>
    );
  }

  if (item.classifiedAt) {
    return (
      <div className="classification-summary">
        <span className="operability-pill operability-legacy">Versión anterior</span>
        <p className="classification-reason">Pendiente de reclasificar a operatividad.</p>
      </div>
    );
  }

  return <span className="classification-pending">Sin clasificar</span>;
}

function ClassificationDetails({ item }: { item: ListingRecord }) {
  const classification = asOperabilityClassification(item.classification);
  const knownIssues = asListingClassification(item.classification)?.knownIssuesWeb;

  if (classification) {
    return (
      <section className="classification-details" aria-label="Detalle de la operatividad">
        <div className="classification-details-head">
          <span className={`operability-pill operability-${classification.status}`}>
            {operabilityLabel(classification.status)}
          </span>
          <span className="classification-confidence">
            Confianza {confidenceLabel(classification.confidence)}
          </span>
          {item.classificationVersion ? (
            <span className="classification-version">{item.classificationVersion}</span>
          ) : null}
        </div>
        <p className="classification-reason-full">{classification.reason}</p>
        {classification.evidence.length > 0 ? (
          <div className="evidence">
            <p className="evidence-title">Evidencias</p>
            <ul className="evidence-list">
              {classification.evidence.map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {knownIssues?.status === 'completed' ? (
          <div className="evidence">
            <p className="evidence-title">Problemas conocidos del modelo</p>
            <p className="classification-reason-full">{knownIssues.summary}</p>
            {knownIssues.sources.length > 0 ? (
              <ul className="evidence-list">
                {knownIssues.sources.map((source) => (
                  <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : knownIssues?.status === 'skipped' ? (
          <p className="classification-reason-full">Búsqueda web omitida porque el vehículo no se clasificó como operativo.</p>
        ) : null}
      </section>
    );
  }

  if (item.classifiedAt) {
    return (
      <section className="classification-details" aria-label="Detalle de la operatividad">
        <div className="classification-details-head">
          <span className="operability-pill operability-legacy">Versión anterior</span>
        </div>
        <p className="classification-reason-full">Clasificación de una versión previa, pendiente de reclasificar a operatividad.</p>
      </section>
    );
  }

  return (
    <section className="classification-details" aria-label="Detalle de la operatividad">
      <span className="classification-pending">Sin clasificar</span>
      <p className="classification-reason-full">Este anuncio aún no ha sido clasificado respecto a su operatividad.</p>
    </section>
  );
}

function asOperabilityClassification(
  value: ListingRecord['classification'],
): VehicleOperabilityClassification | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const nested = Reflect.get(value, 'operability');
  const candidate = (
    typeof nested === 'object' && nested !== null && !Array.isArray(nested) ? nested : value
  ) as Partial<VehicleOperabilityClassification>;
  if (
    !['operational', 'non_operational', 'unknown'].includes(candidate.status ?? '')
    || !['low', 'medium', 'high'].includes(candidate.confidence ?? '')
    || !Array.isArray(candidate.evidence)
    || typeof candidate.reason !== 'string'
  ) return null;
  return candidate as VehicleOperabilityClassification;
}

function asListingClassification(value: ListingRecord['classification']): ListingClassification | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const operability = asOperabilityClassification(value);
  const knownIssuesWeb = Reflect.get(value, 'knownIssuesWeb');
  if (!operability || typeof knownIssuesWeb !== 'object' || knownIssuesWeb === null) return null;
  const status = Reflect.get(knownIssuesWeb, 'status');
  if (status === 'skipped') {
    const reason = Reflect.get(knownIssuesWeb, 'reason');
    if (reason !== 'non_operational') return null;
  } else if (status === 'completed') {
    if (
      typeof Reflect.get(knownIssuesWeb, 'found') !== 'boolean'
      || typeof Reflect.get(knownIssuesWeb, 'summary') !== 'string'
      || !Array.isArray(Reflect.get(knownIssuesWeb, 'sources'))
    ) return null;
  } else return null;
  return value as ListingClassification;
}

function operabilityLabel(status: VehicleOperabilityClassification['status']): string {
  if (status === 'operational') return 'Operativo';
  if (status === 'non_operational') return 'No operativo';
  return 'Sin verificar';
}

function confidenceLabel(confidence: VehicleOperabilityClassification['confidence']): string {
  if (confidence === 'high') return 'alta';
  if (confidence === 'medium') return 'media';
  return 'baja';
}

function ConfirmDialog({
  item,
  closing,
  onConfirm,
  onCancel,
}: {
  item: ListingRecord;
  closing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const classified = item.classifiedAt != null;
  return (
    <div
      className={`modal-backdrop ${closing ? 'is-closing' : ''}`}
      onClick={onCancel}
      role="presentation"
    >
      <div
        className={`modal ${closing ? 'is-closing' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-icon" aria-hidden="true">
          <WarningCircle size={26} weight="fill" />
        </div>
        <h2 id="confirm-title" className="modal-title">
          ¿Eliminar este anuncio?
        </h2>
        <p id="confirm-body" className="modal-body">
          {classified
            ? 'Este anuncio ya está clasificado. Al eliminarlo se borrará también su clasificación y no se podrá recuperar.'
            : 'Esta acción no se puede deshacer.'}
        </p>
        <p className="modal-target" title={item.title}>{item.title}</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn-danger" onClick={onConfirm} autoFocus>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function buildSpecs(item: ListingRecord): Array<{ label: string; value: string }> {
  const specs: Array<{ label: string; value: string }> = [];
  if (item.year != null) specs.push({ label: 'Año', value: String(item.year) });
  if (item.mileage != null) {
    specs.push({ label: 'Kilometraje', value: `${item.mileage.toLocaleString('es-ES')} km` });
  }
  const fuel = capitalize(item.fuelType);
  if (fuel) specs.push({ label: 'Combustible', value: fuel });
  const transmission = capitalize(item.transmission);
  if (transmission) specs.push({ label: 'Cambio', value: transmission });
  if (item.province) specs.push({ label: 'Provincia', value: item.province });
  return specs;
}

function capitalize(value: string | null): string | null {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatPrice(price: number | string): string {
  const value = typeof price === 'string' ? Number(price) : price;
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' });
}
