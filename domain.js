export const CAPACITY = 20;
export const MAX_ADVANCE_DAYS = 30;
export const SLOTS = Object.freeze([
  { value: '19:00', end: '21:00', label: 'Primer turno' },
  { value: '21:00', end: '23:00', label: 'Segundo turno' },
]);
export const CONFIRMED = 'CONFIRMADA';
export const CANCELLED = 'CANCELADA';

export class ReservationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = 'ReservationError';
    this.fields = fields;
  }
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateLimit(now = new Date()) {
  const limit = new Date(now);
  limit.setDate(limit.getDate() + MAX_ADVANCE_DAYS);
  return localDate(limit);
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value;
}

export function slotStarted(date, slot, now = new Date()) {
  return date === localDate(now) && slot <= `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function nextServiceDate(now = new Date()) {
  const next = new Date(now);
  if (slotStarted(localDate(now), '21:00', now)) next.setDate(next.getDate() + 1);
  return localDate(next);
}

export function normalizePhone(value) {
  const phone = String(value ?? '').trim();
  if (!/^\+?[\d\s()\-]+$/.test(phone)) return null;
  const digits = phone.replace(/\D/g, '');
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function normalizeCode(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function availability(reservations, date, slot, excludeCode = null) {
  const occupied = reservations.reduce((sum, item) => sum + (
    item.estado === CONFIRMED && item.fecha === date && item.turno === slot && item.codigo !== excludeCode
      ? item.personas : 0
  ), 0);
  return CAPACITY - occupied;
}

export function validateReservation(input, reservations, { excludeCode = null, now = new Date() } = {}) {
  const fields = {};
  const nombreCompleto = typeof input.nombreCompleto === 'string' ? input.nombreCompleto.trim() : '';
  const telefono = normalizePhone(input.telefono);
  const personas = typeof input.personas === 'number' ? input.personas
    : typeof input.personas === 'string' && input.personas.trim() !== '' ? Number(input.personas) : NaN;
  if (nombreCompleto.length < 3 || nombreCompleto.length > 80) fields.nombreCompleto = 'Escribí un nombre y apellido de entre 3 y 80 caracteres.';
  if (!telefono) fields.telefono = 'Ingresá entre 8 y 15 dígitos. Podés usar + al inicio, espacios, guiones y paréntesis.';
  if (!validDate(input.fecha) || input.fecha < localDate(now) || input.fecha > dateLimit(now)) {
    fields.fecha = 'Elegí una fecha entre hoy y los próximos 30 días.';
  }
  if (!SLOTS.some(slot => slot.value === input.turno)) fields.turno = 'Elegí uno de los dos turnos disponibles.';
  else if (!fields.fecha && slotStarted(input.fecha, input.turno, now)) fields.turno = 'Ese turno ya comenzó. Elegí otro turno o fecha.';
  if (!Number.isInteger(personas) || personas < 1 || personas > 6) fields.personas = 'El grupo debe tener entre 1 y 6 personas, sin decimales.';
  if (!fields.fecha && !fields.turno && !fields.personas) {
    const free = availability(reservations, input.fecha, input.turno, excludeCode);
    if (personas > free) fields.personas = `Quedan ${free} lugares en ese turno. Elegí un grupo más chico u otro turno.`;
  }
  if (Object.keys(fields).length) throw new ReservationError('Revisá los datos de tu reserva.', fields);
  return { nombreCompleto, telefono, fecha: input.fecha, turno: input.turno, personas };
}

export function createReservation(reservations, input, { now = new Date(), uuid = () => crypto.randomUUID() } = {}) {
  const data = validateReservation(input, reservations, { now });
  let codigo;
  for (let attempts = 0; attempts < 10; attempts++) {
    codigo = normalizeCode(uuid());
    if (codigo && !reservations.some(item => item.codigo === codigo)) break;
    codigo = null;
  }
  if (!codigo) throw new ReservationError('No pudimos generar un código único. Volvé a intentar.');
  const timestamp = now.toISOString();
  const reservation = { codigo, ...data, estado: CONFIRMED, creadaEn: timestamp, actualizadaEn: timestamp };
  return { reservations: [...reservations, reservation], reservation };
}

export function updateReservation(reservations, code, input, { now = new Date() } = {}) {
  const original = reservations.find(item => item.codigo === code);
  if (!original) throw new ReservationError('La reserva ya no está disponible. Actualizá el listado.');
  if (original.estado !== CONFIRMED) throw new ReservationError('Una reserva cancelada no se puede editar ni reactivar.');
  const data = validateReservation(input, reservations, { excludeCode: code, now });
  const reservation = { ...original, ...data, actualizadaEn: now.toISOString() };
  return { reservations: reservations.map(item => item.codigo === code ? reservation : item), reservation };
}

export function cancelReservation(reservations, code, { now = new Date() } = {}) {
  const original = reservations.find(item => item.codigo === code);
  if (!original) throw new ReservationError('No encontramos esa reserva.');
  if (original.estado === CANCELLED) throw new ReservationError('Esta reserva ya estaba cancelada.');
  const reservation = { ...original, estado: CANCELLED, actualizadaEn: now.toISOString() };
  return { reservations: reservations.map(item => item.codigo === code ? reservation : item), reservation };
}

export function findReservation(reservations, code, phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;
  return reservations.find(item => item.codigo === normalizeCode(code) && item.telefono === normalizedPhone) ?? null;
}

export function sortReservations(reservations) {
  return [...reservations].sort((a, b) => `${a.fecha} ${a.turno} ${a.creadaEn}`.localeCompare(`${b.fecha} ${b.turno} ${b.creadaEn}`));
}
