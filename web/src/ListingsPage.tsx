import {
  ArrowSquareOut,
  BracketsCurly,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import type { ListingsResponse, ListingRecord } from './types.js';

export function ListingsPage() {
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [brand, setBrand] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const brands = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.items.map((item) => item.brand)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (status && item.status !== status) return false;
      if (brand && item.brand !== brand) return false;
      if (term) {
        const haystack = `${item.title} ${item.brand} ${item.model}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [data, search, status, brand]);

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
            Lista completa de los anuncios reconciliados en la base de datos. Filtra y
            expande cualquier fila para ver su JSON completo.
          </p>
        </div>

        {error ? (
          <div className="status-error" role="alert">{error}</div>
        ) : (
          <ListingsTable
            loading={loading}
            count={data?.count ?? 0}
            items={filtered}
            brands={brands}
            search={search}
            status={status}
            brand={brand}
            expanded={expanded}
            onSearch={setSearch}
            onStatus={setStatus}
            onBrand={setBrand}
            onToggle={setExpanded}
          />
        )}
      </main>
    </div>
  );
}

function ListingsTable({
  loading,
  count,
  items,
  brands,
  search,
  status,
  brand,
  expanded,
  onSearch,
  onStatus,
  onBrand,
  onToggle,
}: {
  loading: boolean;
  count: number;
  items: ListingRecord[];
  brands: string[];
  search: string;
  status: string;
  brand: string;
  expanded: string | null;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onBrand: (value: string) => void;
  onToggle: (id: string | null) => void;
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
          {brands.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div className="listings-meta">
        {loading
          ? 'Cargando anuncios…'
          : `${items.length.toLocaleString('es-ES')} de ${count.toLocaleString('es-ES')} anuncios`}
      </div>

      {loading ? (
        <div className="listings-loading">
          {Array.from({ length: 6 }, (_, index) => <div className="skeleton h-10" key={index} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <MagnifyingGlass size={44} weight="duotone" />
          <h3>Sin resultados</h3>
          <p>Ajusta los filtros o limpia la búsqueda para ver más anuncios.</p>
        </div>
      ) : (
        <div className="listings-scroll">
          <table className="listings-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Marca / Modelo</th>
                <th>Precio</th>
                <th>Provincia</th>
                <th>Estado</th>
                <th>Primera vez visto</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ListingRow
                  key={item.id}
                  item={item}
                  open={expanded === item.id}
                  onToggle={() => onToggle(expanded === item.id ? null : item.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListingRow({
  item,
  open,
  onToggle,
}: {
  item: ListingRecord;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={open ? 'row-open' : undefined}>
        <td className="cell-title">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
          ) : (
            <span>{item.title}</span>
          )}
        </td>
        <td>{`${item.brand} ${item.model}`.trim() || '—'}</td>
        <td className="cell-price">{formatPrice(item.price)}</td>
        <td>{item.province ?? '—'}</td>
        <td>
          <span className={`status-pill status-${item.status}`}>{item.status}</span>
        </td>
        <td className="cell-date">{formatDate(item.firstSeenAt)}</td>
        <td className="cell-action">
          <button
            className={`json-toggle ${open ? 'is-open' : ''}`}
            aria-expanded={open}
            onClick={onToggle}
          >
            <BracketsCurly size={16} weight="bold" />
            {open ? 'Cerrar' : 'JSON'}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="row-json">
          <td colSpan={7}>
            <pre className="json-view"><code>{JSON.stringify(item, null, 2)}</code></pre>
          </td>
        </tr>
      ) : null}
    </>
  );
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
