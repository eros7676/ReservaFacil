import { CAPACITY, SLOTS, CONFIRMED, CANCELLED, ReservationError, validDate, normalizeCode } from './domain.js';

export const STORAGE_KEY = 'reservafacil.v1';
export const STORAGE_VERSION = 1;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

export class StorageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StorageError';
  }
}

export function validateStoredData(data) {
  if (!data || data.version !== STORAGE_VERSION || !Array.isArray(data.reservas)) return false;
  const codes = new Set();
  const occupation = new Map();
  for (const item of data.reservas) {
    if (!item || typeof item !== 'object' || typeof item.codigo !== 'string' || !uuidPattern.test(item.codigo)
      || normalizeCode(item.codigo) !== item.codigo || codes.has(item.codigo)
      || typeof item.nombreCompleto !== 'string' || item.nombreCompleto.trim() !== item.nombreCompleto
      || item.nombreCompleto.length < 3 || item.nombreCompleto.length > 80
      || typeof item.telefono !== 'string' || !/^\d{8,15}$/.test(item.telefono)
      || !validDate(item.fecha) || !SLOTS.some(slot => slot.value === item.turno)
      || !Number.isInteger(item.personas) || item.personas < 1 || item.personas > 6
      || ![CONFIRMED, CANCELLED].includes(item.estado)
      || !isoDate(item.creadaEn) || !isoDate(item.actualizadaEn)
      || Date.parse(item.actualizadaEn) < Date.parse(item.creadaEn)) return false;
    codes.add(item.codigo);
    if (item.estado === CONFIRMED) {
      const key = `${item.fecha}|${item.turno}`;
      const occupied = (occupation.get(key) ?? 0) + item.personas;
      if (occupied > CAPACITY) return false;
      occupation.set(key, occupied);
    }
  }
  return true;
}

export class ReservationStore {
  constructor(getStorage = () => globalThis.localStorage) {
    this.getStorage = getStorage;
    this.reservations = [];
  }

  read() {
    let raw;
    try { raw = this.getStorage().getItem(STORAGE_KEY); }
    catch { throw new StorageError('El navegador bloqueó el almacenamiento. Habilitá los datos del sitio para consultar y guardar reservas.'); }
    if (raw === null) return [];
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new StorageError('Los datos guardados no se pueden leer. No los reemplazamos. Revisá el almacenamiento o usá otro perfil para una demostración nueva.'); }
    if (!validateStoredData(data)) throw new StorageError('Los datos locales tienen un formato inválido. Los conservamos sin cambios; revisá la clave reservafacil.v1 antes de continuar.');
    return data.reservas;
  }

  refresh() {
    const next = this.read();
    this.reservations = next;
    return next;
  }

  transact(operation) {
    // Releer antes de validar evita trabajar con una copia desactualizada de otra pestaña.
    // localStorage no ofrece transacciones entre pestañas: este MVP no promete concurrencia.
    const current = this.read();
    const result = operation(current);
    if (!result || !validateStoredData({ version: STORAGE_VERSION, reservas: result.reservations })) {
      throw new ReservationError('La operación produjo datos inválidos y no se guardó.');
    }
    try {
      this.getStorage().setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, reservas: result.reservations }));
    } catch {
      throw new StorageError('No pudimos guardar: el almacenamiento está lleno o bloqueado. La operación no se confirmó y tus datos anteriores siguen intactos.');
    }
    // La memoria y la pantalla solo cambian después de una escritura exitosa.
    this.reservations = result.reservations;
    return result.reservation;
  }
}
