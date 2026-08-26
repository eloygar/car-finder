import {
  ArrowSquareOut,
  BracketsCurly,
  CarProfile,
  MagnifyingGlass,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import type { ListingsResponse, ListingRecord } from './types.js';

const EXIT_DURATION = 240;

export function ListingsPage() {
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [brand, setBrand] = useState('');
  const [classification, setClassification] = useState('classified');
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
      if (classification === 'classified' && item.classifiedAt == null) return false;
      if (classification === 'unclassified' && item.classifiedAt != null) return false;
      if (term) {
        const haystack = `${item.title} ${item.brand} ${item.model}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [data, search, status, brand, classification]);

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
            Lista completa de los anuncios reconciliados en la base de datos. Filtra,
            revisa la foto y expande cualquier fila para ver su JSON completo.
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
          <ListingsTable
            loading={loading}
            count={data?.count ?? 0}
            items={filtered}
            brands={brands}
            search={search}
            status={status}
            brand={brand}
            classification={classification}
            expanded={expanded}
            removingId={removingId}
            deleting={deleting}
            onSearch={setSearch}
            onStatus={setStatus}
            onBrand={setBrand}
            onClassification={setClassification}
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

function ListingsTable({
  loading,
  count,
  items,
  brands,
  search,
  status,
  brand,
  classification,
  expanded,
  removingId,
  deleting,
  onSearch,
  onStatus,
  onBrand,
  onClassification,
  onToggle,
  onDelete,
}: {
  loading: boolean;
  count: number;
  items: ListingRecord[];
  brands: string[];
  search: string;
  status: string;
  brand: string;
  classification: string;
  expanded: string | null;
  removingId: string | null;
  deleting: boolean;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onBrand: (value: string) => void;
  onClassification: (value: string) => void;
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
          {brands.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={classification} onChange={(event) => onClassification(event.target.value)}>
          <option value="classified">Clasificados</option>
          <option value="unclassified">Sin clasificar</option>
          <option value="">Todos</option>
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
                <th aria-label="Foto" />
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
              {items.map((item, index) => (
                <ListingRow
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListingRow({
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
  return (
    <>
      <tr
        className={[removing ? 'row-removing' : '', open ? 'row-open' : ''].filter(Boolean).join(' ') || undefined}
        style={index < 14 ? { animationDelay: `${Math.min(index, 13) * 28}ms` } : undefined}
      >
        <td className="cell-photo">
          <div className="thumb">
            {thumbnail ? (
              <img src={thumbnail} alt={item.title} loading="lazy" />
            ) : (
              <span className="thumb-empty"><CarProfile size={20} weight="duotone" aria-hidden="true" /></span>
            )}
          </div>
        </td>
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
          <div className="action-cluster">
            <button
              type="button"
              className="delete-button"
              aria-label={`Eliminar ${item.title}`}
              disabled={disabled}
              onClick={onDelete}
            >
              <Trash size={16} weight="bold" />
            </button>
            <button
              type="button"
              className={`json-toggle ${open ? 'is-open' : ''}`}
              aria-expanded={open}
              onClick={onToggle}
            >
              <BracketsCurly size={16} weight="bold" />
              {open ? 'Cerrar' : 'JSON'}
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr className={removing ? 'row-removing row-json' : 'row-json'}>
          <td colSpan={8}>
            <div className="json-panel">
              <div className="json-panel-head">
                <span>JSON completo</span>
                <button
                  type="button"
                  className="json-toggle is-open"
                  aria-expanded={open}
                  onClick={onToggle}
                >
                  <X size={16} weight="bold" />
                  Cerrar
                </button>
              </div>
              <pre className="json-view"><code>{JSON.stringify(item, null, 2)}</code></pre>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
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
