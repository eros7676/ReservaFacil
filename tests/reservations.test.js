import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPACITY, localDate, dateLimit, nextServiceDate, normalizePhone, availability,
  createReservation, updateReservation, cancelReservation, findReservation,
  sortReservations, CONFIRMED, CANCELLED,
} from '../domain.js';
import { ReservationStore, STORAGE_KEY, StorageError, validateStoredData } from '../storage.js';

// Fechas construidas en hora local para no depender de UTC ni de la zona del equipo.
const now = new Date(2026, 10, 2, 18, 0, 0);
const input = (overrides = {}) => ({ nombreCompleto: '  Alex García  ', telefono: '+54 (11) 5555-1234', fecha: '2026-11-03', turno: '19:00', personas: 4, ...overrides });
const create = (items = [], overrides = {}, options = {}) => createReservation(items, input(overrides), { now, ...options });
function fill(people, { date = '2026-11-03', slot = '19:00' } = {}) {
  let items = [];
  while (people > 0) {
    const group = Math.min(people, 6);
    items = create(items, { personas: group, fecha: date, turno: slot }).reservations;
    people -= group;
  }
  return items;
}
function memoryStorage(initial = null) {
  let raw = initial;
  return { getItem: key => { assert.equal(key, STORAGE_KEY); return raw; }, setItem: (key, value) => { assert.equal(key, STORAGE_KEY); raw = value; }, raw: () => raw };
}

test('CP01: alta, código UUID, datos normalizados y recuperación por otra instancia', () => {
  const storage = memoryStorage();
  const store = new ReservationStore(() => storage);
  const reservation = store.transact(items => create(items));
  assert.equal(reservation.nombreCompleto, 'Alex García');
  assert.equal(reservation.telefono, '541155551234');
  assert.equal(reservation.estado, CONFIRMED);
  assert.match(reservation.codigo, /^[0-9a-f-]{36}$/);
  assert.equal(reservation.creadaEn, reservation.actualizadaEn);
  assert.deepEqual(new ReservationStore(() => storage).refresh(), [reservation]);
});

test('CP02: campos inválidos no generan reservas', () => {
  for (const patch of [{ nombreCompleto: '' }, { nombreCompleto: 'ab' }, { nombreCompleto: 'a'.repeat(81) }, { telefono: '1234567' }, { telefono: '1234567890123456' }, { telefono: '11+55551234' }, { telefono: 'telefono 12345678' }, { personas: 0 }, { personas: 7 }, { personas: 2.5 }, { personas: '' }, { personas: null }, { personas: true }]) {
    assert.throws(() => create([], patch), { name: 'ReservationError' });
  }
  assert.equal(normalizePhone('0011-5555-1234'), '001155551234');
});

test('CP03: límites inclusivos, calendario válido y turnos según hora local', () => {
  assert.equal(localDate(now), '2026-11-02');
  assert.equal(dateLimit(now), '2026-12-02');
  assert.doesNotThrow(() => create([], { fecha: '2026-12-02' }));
  assert.doesNotThrow(() => create([], { fecha: '2026-11-02' }));
  for (const patch of [{ fecha: '2026-11-01' }, { fecha: '2026-12-03' }, { fecha: '2026-11-31' }, { fecha: '' }, { turno: '20:00' }]) assert.throws(() => create([], patch));
  const at19 = new Date(2026, 10, 2, 19, 0);
  assert.throws(() => create([], { fecha: '2026-11-02', turno: '19:00' }, { now: at19 }));
  assert.doesNotThrow(() => create([], { fecha: '2026-11-02', turno: '21:00' }, { now: at19 }));
  assert.equal(nextServiceDate(new Date(2026, 10, 2, 21, 0)), '2026-11-03');
  assert.equal(dateLimit(new Date(2026, 11, 15, 23, 30)), '2027-01-14');
});

test('CP04–CP05: límite exacto de 20, exceso rechazado y turnos/fechas independientes', () => {
  const eighteen = fill(18);
  assert.equal(availability(eighteen, '2026-11-03', '19:00'), 2);
  const full = create(eighteen, { personas: 2 }).reservations;
  assert.equal(availability(full, '2026-11-03', '19:00'), 0);
  assert.throws(() => create(full, { personas: 1 }));
  assert.equal(availability(full, '2026-11-03', '21:00'), CAPACITY);
  assert.equal(availability(full, '2026-11-04', '19:00'), CAPACITY);
});

test('CP06: código y teléfono deben coincidir; normaliza separadores y mayúsculas', () => {
  const { reservations, reservation } = create();
  assert.deepEqual(findReservation(reservations, ` ${reservation.codigo.toUpperCase()} `, '+54 (11) 5555-1234'), reservation);
  assert.equal(findReservation(reservations, reservation.codigo, '1155559999'), null);
  assert.equal(findReservation(reservations, 'otro-codigo', reservation.telefono), null);
  assert.equal(findReservation(reservations, reservation.codigo, 'teléfono 541155551234'), null);
});

test('CP07: cancelación persiste, conserva registro, libera cupo una vez y no permite reactivar', () => {
  const storage = memoryStorage();
  const store = new ReservationStore(() => storage);
  const original = store.transact(items => create(items));
  assert.equal(availability(store.reservations, original.fecha, original.turno), 16);
  store.transact(items => cancelReservation(items, original.codigo, { now }));
  const saved = new ReservationStore(() => storage).refresh();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].estado, CANCELLED);
  assert.equal(availability(saved, original.fecha, original.turno), 20);
  assert.throws(() => cancelReservation(saved, original.codigo, { now }));
  assert.throws(() => updateReservation(saved, original.codigo, input(), { now }));
});

test('CP08: editar excluye la reserva original y conserva código/creación', () => {
  const fourteen = fill(14);
  const { reservations, reservation } = create(fourteen, { personas: 4 });
  const updated = updateReservation(reservations, reservation.codigo, input({ personas: 6 }), { now: new Date(2026, 10, 2, 18, 5) });
  assert.equal(updated.reservation.personas, 6);
  assert.equal(updated.reservation.codigo, reservation.codigo);
  assert.equal(updated.reservation.creadaEn, reservation.creadaEn);
  assert.notEqual(updated.reservation.actualizadaEn, reservation.actualizadaEn);
  assert.equal(availability(updated.reservations, reservation.fecha, reservation.turno), 0);
  assert.equal(reservation.personas, 4);
});

test('CP09: mover a un turno lleno no cambia ni datos ni cupos', () => {
  const full = fill(20);
  const { reservations, reservation } = create(full, { turno: '21:00' });
  const snapshot = JSON.stringify(reservations);
  assert.throws(() => updateReservation(reservations, reservation.codigo, input(), { now }));
  assert.equal(JSON.stringify(reservations), snapshot);
  assert.equal(availability(reservations, '2026-11-03', '21:00'), 16);
});

test('CP10: orden por fecha y turno sin modificar la colección de entrada', () => {
  let items = create([], { fecha: '2026-11-04', turno: '21:00' }).reservations;
  items = create(items, { turno: '21:00' }).reservations;
  items = create(items).reservations;
  const sorted = sortReservations(items);
  assert.deepEqual(sorted.map(item => `${item.fecha} ${item.turno}`), ['2026-11-03 19:00', '2026-11-03 21:00', '2026-11-04 21:00']);
  assert.equal(items[0].fecha, '2026-11-04');
});

test('CP11: escritura fallida no modifica memoria ni almacenamiento', () => {
  const storage = memoryStorage();
  const store = new ReservationStore(() => storage);
  store.transact(items => create(items));
  const original = store.reservations;
  const raw = storage.raw();
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => store.transact(items => create(items)), StorageError);
  assert.equal(store.reservations, original);
  assert.equal(storage.raw(), raw);
  assert.throws(() => store.transact(items => updateReservation(items, items[0].codigo, input({ personas: 6 }), { now })), StorageError);
  assert.throws(() => store.transact(items => cancelReservation(items, items[0].codigo, { now })), StorageError);
  assert.equal(store.reservations, original);
  assert.equal(storage.raw(), raw);
});

test('CP12: JSON corrupto y estructura inválida se preservan sin sobrescribir', () => {
  for (const raw of ['{corrupto', 'null', '{}', '{"version":2,"reservas":[]}', '{"version":1,"reservas":[{}]}']) {
    const storage = memoryStorage(raw);
    const store = new ReservationStore(() => storage);
    assert.throws(() => store.refresh(), StorageError);
    assert.throws(() => store.transact(items => create(items)), StorageError);
    assert.equal(storage.raw(), raw);
    assert.deepEqual(store.reservations, []);
  }
  const blocked = new ReservationStore(() => { throw new Error('SecurityError'); });
  assert.throws(() => blocked.refresh(), StorageError);
});

test('Integridad: rechaza códigos repetidos, estados desconocidos y sobrecupo almacenado', () => {
  const { reservation } = create();
  const data = { version: 1, reservas: [reservation] };
  assert.equal(validateStoredData(data), true);
  assert.equal(validateStoredData({ ...data, reservas: [reservation, reservation] }), false);
  for (const patch of [{ codigo: 'invalido' }, { estado: 'PENDIENTE' }, { personas: 2.5 }, { telefono: 1155551234 }, { creadaEn: 'ayer' }, { actualizadaEn: '2020-01-01T00:00:00.000Z' }]) {
    assert.equal(validateStoredData({ ...data, reservas: [{ ...reservation, ...patch }] }), false);
  }
  const twenty = fill(20);
  const extra = create([], { personas: 1 }).reservation;
  assert.equal(validateStoredData({ version: 1, reservas: [...twenty, extra] }), false);
});

test('Integridad: relee el almacenamiento antes de calcular cupo y comprueba colisiones', () => {
  const storage = memoryStorage();
  const first = new ReservationStore(() => storage);
  const second = new ReservationStore(() => storage);
  first.refresh(); second.refresh();
  for (const personas of [6, 6, 6, 2]) first.transact(items => create(items, { personas }));
  assert.throws(() => second.transact(items => create(items, { personas: 1 })));
  assert.equal(new ReservationStore(() => storage).refresh().length, 4);
  const { reservations, reservation } = create();
  let count = 0;
  const secondReservation = create(reservations, {}, { uuid: () => ++count === 1 ? reservation.codigo : '11111111-1111-4111-8111-111111111111' });
  assert.equal(count, 2);
  assert.notEqual(secondReservation.reservation.codigo, reservation.codigo);
  assert.throws(() => create(reservations, {}, { uuid: () => reservation.codigo }));
});

test('CP14 (datos): admite texto literal con etiquetas y procesa 200 reservas', () => {
  let items = [];
  for (let i = 0; i < 200; i++) {
    const date = new Date(2026, 10, 3 + Math.floor(i / 20));
    items = create(items, { fecha: localDate(date), personas: 1, nombreCompleto: '<b>Persona ficticia</b>' }).reservations;
  }
  const start = performance.now();
  const sorted = sortReservations(items);
  for (const item of items) availability(items, item.fecha, item.turno);
  assert.equal(sorted.length, 200);
  assert.equal(items[0].nombreCompleto, '<b>Persona ficticia</b>');
  assert.equal(validateStoredData({ version: 1, reservas: items }), true);
  assert.ok(performance.now() - start < 1000, 'Reglas y ordenamiento de 200 reservas en menos de 1s; no mide la interfaz');
});
