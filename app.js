import {
  CAPACITY, SLOTS, CONFIRMED, CANCELLED, localDate, dateLimit, nextServiceDate,
  validDate, slotStarted, availability, createReservation, updateReservation,
  cancelReservation, findReservation, sortReservations,
} from './domain.js';
import { ReservationStore, StorageError, STORAGE_KEY } from './storage.js';

const $ = selector => document.querySelector(selector);
const store = new ReservationStore();
let storageHealthy = false;
let currentView = 'reservar';
let formSequence = 0;
let lookupCredentials = null;
let cancellation = null;
let toastTimer;
const liveForms = new Map();
const dateFormat = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const node = element('button', `button ${className}`, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function formatDate(date) { return dateFormat.format(new Date(`${date}T12:00:00`)); }
function slotLabel(value) { return `${value} — ${SLOTS.find(slot => slot.value === value)?.end ?? ''}`; }
function plural(count, one, many) { return `${count} ${count === 1 ? one : many}`; }

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5500);
}

function reportStorageError(error) {
  storageHealthy = false;
  $('#storage-message').textContent = error.message;
  $('#storage-alert').hidden = false;
}

function refreshStore() {
  try {
    store.refresh();
    storageHealthy = true;
    $('#storage-alert').hidden = true;
    return true;
  } catch (error) {
    reportStorageError(error);
    return false;
  }
}

function showError(form, error) {
  const message = form.querySelector('.form-message');
  message.textContent = error.message || 'Ocurrió un problema. Volvé a intentar.';
  message.hidden = false;
  const fields = error.fields ?? {};
  for (const [name, text] of Object.entries(fields)) {
    const target = form.querySelector(`[data-error="${name}"]`);
    if (target) target.textContent = text;
    form.querySelectorAll(`[name="${name}"]`).forEach(input => input.setAttribute('aria-invalid', 'true'));
  }
  const first = form.querySelector('[aria-invalid="true"]:not(:disabled)');
  if (first) first.focus();
  else { message.tabIndex = -1; message.focus(); }
  if (error instanceof StorageError) reportStorageError(error);
}

function clearErrors(form) {
  form.querySelector('.form-message').hidden = true;
  form.querySelectorAll('[data-error]').forEach(node => { node.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach(node => node.removeAttribute('aria-invalid'));
}

function updateFormAvailability(form, original = null) {
  const date = form.elements.fecha.value;
  const people = Number(form.elements.personas.value);
  const valid = validDate(date) && date >= localDate() && date <= dateLimit();
  const note = form.querySelector('.capacity-note');
  for (const slot of SLOTS) {
    const free = availability(store.reservations, date, slot.value, original?.codigo);
    const started = slotStarted(date, slot.value);
    const radio = form.querySelector(`input[name="turno"][value="${slot.value}"]`);
    radio.disabled = !storageHealthy || !valid || started || free < people;
    form.querySelector(`[data-free="${slot.value}"]`).textContent = !storageHealthy ? 'Sin acceso a datos' : !valid ? 'Elegí una fecha válida' : started ? 'Ya comenzó' : plural(free, 'lugar libre', 'lugares libres');
  }
  const slot = form.elements.turno.value;
  const free = availability(store.reservations, date, slot, original?.codigo);
  let problem = false;
  if (!storageHealthy) { note.textContent = 'Revisá el aviso de almacenamiento antes de continuar.'; problem = true; }
  else if (!valid) { note.textContent = 'Podés reservar desde hoy hasta los próximos 30 días.'; problem = true; }
  else if (!slot) note.textContent = 'Elegí el turno que mejor se adapte a tu plan.';
  else if (slotStarted(date, slot)) { note.textContent = 'Ese turno ya comenzó. Elegí otro turno o fecha.'; problem = true; }
  else if (people > free) { note.textContent = `Tu grupo supera los ${free} lugares disponibles. Elegí otro turno o fecha.`; problem = true; }
  else note.textContent = `${plural(free, 'lugar disponible', 'lugares disponibles')} para este turno. Capacidad: ${CAPACITY} personas.`;
  note.classList.toggle('problem', problem);
  form.querySelector('[type="submit"]').disabled = !storageHealthy || problem || Boolean(form.dataset.completed);
  if (form.id === 'main-booking-form') renderSlotSummary(date);
}

function renderSlotSummary(date) {
  const host = $('#slot-summary');
  host.replaceChildren();
  for (const slot of SLOTS) {
    const free = availability(store.reservations, date, slot.value);
    const valid = validDate(date) && date >= localDate() && date <= dateLimit();
    const available = storageHealthy && valid && !slotStarted(date, slot.value);
    const card = element('div', 'summary-slot');
    const top = element('div', 'summary-top');
    top.append(element('strong', '', slot.value), element('span', '', !storageHealthy ? 'Sin datos' : !valid ? 'Elegí una fecha' : !available ? 'Ya comenzó' : `${free} / ${CAPACITY} lugares`));
    const ticks = element('div', 'summary-bottom');
    ticks.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < CAPACITY; i++) ticks.append(element('span', `place-tick${available && i < free ? ' free' : ''}`));
    card.append(top, ticks);
    host.append(card);
  }
}

function mountForm(host, { original = null, manager = false, initialDate = null } = {}) {
  const old = host.querySelector('form');
  if (old) liveForms.delete(old);
  host.replaceChildren($('#booking-form-template').content.cloneNode(true));
  const form = host.querySelector('form');
  form.id = manager ? `manager-form-${++formSequence}` : 'main-booking-form';
  for (const input of form.querySelectorAll('[data-input]')) {
    input.id = `${form.id}-${input.name}`;
    const label = form.querySelector(`[data-label="${input.name}"]`);
    label.htmlFor = input.id;
    const error = form.querySelector(`[data-error="${input.name}"]`);
    error.id = `${input.id}-error`;
    input.setAttribute('aria-describedby', error.id);
  }
  const slotError = form.querySelector('[data-error="turno"]');
  slotError.id = `${form.id}-turno-error`;
  for (const input of form.querySelectorAll('[name="turno"]')) input.setAttribute('aria-describedby', slotError.id);
  form.elements.fecha.min = localDate();
  form.elements.fecha.max = dateLimit();
  form.elements.fecha.value = original?.fecha ?? initialDate ?? nextServiceDate();
  form.elements.personas.value = original?.personas ?? 2;
  form.elements.nombreCompleto.value = original?.nombreCompleto ?? '';
  form.elements.telefono.value = original?.telefono ?? '';
  const defaultSlot = SLOTS.find(slot => !slotStarted(form.elements.fecha.value, slot.value)
    && availability(store.reservations, form.elements.fecha.value, slot.value, original?.codigo) >= 2)?.value;
  form.elements.turno.value = original?.turno ?? defaultSlot ?? '';
  const submit = form.querySelector('[type="submit"]');
  if (original) submit.firstChild.textContent = 'Guardar cambios ';
  else if (manager) submit.firstChild.textContent = 'Crear reserva ';
  liveForms.set(form, original);
  form.addEventListener('input', () => { clearErrors(form); updateFormAvailability(form, original); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (form.dataset.completed || form.dataset.submitting) return;
    form.dataset.submitting = 'true';
    submit.disabled = true;
    clearErrors(form);
    const input = Object.fromEntries(new FormData(form));
    // Los radios deshabilitados no viajan en FormData. Se conserva el valor para explicar el error.
    input.turno = form.elements.turno.value;
    try {
      const reservation = store.transact(reservations => original
        ? updateReservation(reservations, original.codigo, input)
        : createReservation(reservations, input));
      form.dataset.completed = 'true';
      storageHealthy = true;
      $('#storage-alert').hidden = true;
      if (manager) {
        $('#editor-dialog').close();
        toast(original ? 'Cambios guardados. Tu agenda está al día.' : 'Reserva creada. Ya tiene su lugar en la agenda.');
        $('#manage-title').tabIndex = -1;
        $('#manage-title').focus();
      } else showBookingSuccess(reservation);
      refreshUI();
    } catch (error) { showError(form, error); }
    finally {
      delete form.dataset.submitting;
      updateFormAvailability(form, original);
    }
  });
  updateFormAvailability(form, original);
  return form;
}

function detail(label, value) {
  const div = element('div');
  div.append(element('span', 'detail-label', label), element('span', 'detail-value', value));
  return div;
}

function badge(reservation) {
  return element('span', `badge ${reservation.estado === CONFIRMED ? 'confirmed' : 'cancelled'}`, reservation.estado === CONFIRMED ? '● CONFIRMADA' : 'CANCELADA');
}

function reservationCard(reservation, { allowCancel = false, copy = false } = {}) {
  const card = element('div', 'reservation-card');
  card.append(badge(reservation), element('h2', '', reservation.nombreCompleto));
  const details = element('div', 'reservation-detail');
  details.append(detail('Fecha', formatDate(reservation.fecha)), detail('Turno', slotLabel(reservation.turno)), detail('Tu compañía', plural(reservation.personas, 'persona', 'personas')), detail('Teléfono', reservation.telefono));
  const code = element('div', 'code-block');
  code.append(element('span', 'detail-label', 'TU CÓDIGO DE RESERVA'), element('code', '', reservation.codigo), element('p', '', 'Guardalo junto a tu teléfono para consultar o cancelar.'));
  card.append(details, code);
  const actions = element('div', 'card-actions');
  if (copy) actions.append(button('Copiar código', 'secondary', async () => {
    try { await navigator.clipboard.writeText(reservation.codigo); toast('Código copiado. Guardalo para tu próxima visita.'); }
    catch { toast('No se pudo copiar automáticamente. Seleccioná el código y copialo.'); }
  }));
  if (allowCancel && reservation.estado === CONFIRMED) {
    const cancel = button('Cancelar mi reserva', 'secondary', () => openCancellation(reservation, 'client'));
    cancel.classList.add('cancel-client');
    actions.append(cancel);
  }
  if (actions.childElementCount) card.append(actions);
  if (reservation.estado === CANCELLED) card.append(element('p', 'subtitle', 'Esta reserva está cancelada. Sus lugares ya fueron liberados. Podés crear una nueva cuando quieras.'));
  return card;
}

function showBookingSuccess(reservation) {
  $('#view-reservar .booking-layout').hidden = true;
  const host = $('#booking-success');
  host.replaceChildren(element('span', 'success-icon', '✓'), element('p', 'eyebrow', 'YA TENÉS UN LUGAR'), element('h2', '', '¡Nos vemos en la mesa!'), element('p', 'subtitle', 'Tu reserva está confirmada. Guardá el código y preparate para un buen momento.'), reservationCard(reservation, { copy: true }));
  const actions = element('div', 'card-actions');
  actions.append(button('Consultar mi reserva ↗', 'primary', () => {
    $('#lookup-code').value = reservation.codigo;
    $('#lookup-phone').value = reservation.telefono;
    location.hash = 'mi-reserva';
    lookupCredentials = { code: reservation.codigo, phone: reservation.telefono };
    renderLookupResult();
  }), button('Hacer otra reserva', 'secondary', resetBooking));
  host.append(actions);
  host.hidden = false;
  host.focus();
}

function resetBooking() {
  $('#booking-success').hidden = true;
  $('#view-reservar .booking-layout').hidden = false;
  mountForm($('#booking-form-host'));
  $('#main-booking-form').elements.fecha.focus();
}

function renderLookupResult() {
  const host = $('#lookup-result');
  if (!lookupCredentials) return;
  const reservation = storageHealthy ? findReservation(store.reservations, lookupCredentials.code, lookupCredentials.phone) : null;
  host.replaceChildren();
  if (reservation) host.append(reservationCard(reservation, { allowCancel: true, copy: true }));
  else {
    const empty = element('div', 'empty-result');
    empty.append(element('span', 'empty-symbol', '⌕'), element('h2', '', storageHealthy ? 'No encontramos esa reserva.' : 'No podemos consultar tus datos.'), element('p', '', storageHealthy ? 'Revisá el código completo y el teléfono. Recordá usar el mismo navegador en el que reservaste.' : 'Revisá el aviso de almacenamiento e intentá de nuevo.'));
    host.append(empty);
  }
}

function renderManager() {
  const filter = $('#filter-date').value;
  const filtered = sortReservations(store.reservations.filter(item => !filter || item.fecha === filter));
  const confirmed = filtered.filter(item => item.estado === CONFIRMED);
  const people = confirmed.reduce((sum, item) => sum + item.personas, 0);
  $('#stat-reservations').textContent = storageHealthy ? confirmed.length : '—';
  $('#stat-guests').textContent = storageHealthy ? people : '—';
  $('#stat-places').textContent = storageHealthy && filter ? CAPACITY * SLOTS.length - people : '—';
  $('#stat-places-note').textContent = filter ? '20 por turno' : 'Elegí una fecha para ver el cupo';
  document.querySelectorAll('.stat small').forEach((node, i) => { if (i < 2) node.textContent = filter ? 'En la fecha seleccionada' : 'En todas las fechas'; });
  $('#list-count').textContent = !storageHealthy ? 'No se puede leer el almacenamiento.' : `${plural(filtered.length, 'reserva', 'reservas')}${filter ? ` · ${formatDate(filter)}` : ' · Todas las fechas'}`;
  const list = $('#reservation-list');
  list.replaceChildren();
  for (const reservation of storageHealthy ? filtered : []) {
    const row = element('tr');
    const customer = element('td');
    customer.append(element('span', 'customer-name', reservation.nombreCompleto), element('span', 'customer-phone', reservation.telefono), element('code', 'table-code', reservation.codigo));
    const date = element('td', '', formatDate(reservation.fecha));
    date.append(element('span', 'cell-secondary', `${reservation.fecha.slice(0, 4)} · ${slotLabel(reservation.turno)}`));
    const people = element('td', '', plural(reservation.personas, 'persona', 'personas'));
    const status = element('td');
    status.append(badge(reservation));
    const actionsCell = element('td');
    const actions = element('div', 'row-actions');
    if (reservation.estado === CONFIRMED) {
      const edit = button('Editar', '', () => openEditor(reservation));
      edit.setAttribute('aria-label', `Editar reserva de ${reservation.nombreCompleto}`);
      const cancel = button('Cancelar', '', () => openCancellation(reservation, 'manager'));
      cancel.setAttribute('aria-label', `Cancelar reserva de ${reservation.nombreCompleto}`);
      actions.append(edit, cancel);
    } else actions.append(element('span', 'cell-secondary', 'Sin acciones'));
    actionsCell.append(actions);
    row.append(customer, date, people, status, actionsCell);
    list.append(row);
  }
  $('#list-empty').hidden = storageHealthy && filtered.length > 0;
  $('#list-empty h3').textContent = storageHealthy ? 'Una agenda lista para llenarse.' : 'Tu agenda no está disponible.';
  $('#list-empty p').textContent = storageHealthy ? filter ? 'Todavía no hay reservas para esta fecha.' : 'Todavía no hay reservas en este navegador.' : 'Revisá el aviso de almacenamiento para continuar.';
  $('#empty-create').disabled = !storageHealthy;
  $('#manager-create').disabled = !storageHealthy;
}

function openEditor(original = null) {
  if (!refreshStore()) { refreshUI(); return; }
  $('#editor-title').textContent = original ? 'Editar reserva' : 'Nueva reserva';
  const filterDate = $('#filter-date').value;
  const initialDate = validDate(filterDate) && filterDate >= nextServiceDate() && filterDate <= dateLimit() ? filterDate : null;
  mountForm($('#editor-form-host'), { original, manager: true, initialDate });
  $('#editor-dialog').showModal();
}

function openCancellation(reservation, source) {
  cancellation = { code: reservation.codigo, source };
  $('#cancel-description').textContent = `${reservation.nombreCompleto} · ${formatDate(reservation.fecha)} · ${reservation.turno} · ${plural(reservation.personas, 'persona', 'personas')}.`;
  $('#cancel-error').hidden = true;
  $('#confirm-cancel').disabled = false;
  $('#cancel-dialog').showModal();
}

function refreshUI() {
  for (const [form, original] of liveForms) {
    if (!form.isConnected) { liveForms.delete(form); continue; }
    form.elements.fecha.min = localDate();
    form.elements.fecha.max = dateLimit();
    updateFormAvailability(form, original);
  }
  renderManager();
  renderLookupResult();
  $('#lookup-form button[type="submit"]').disabled = !storageHealthy;
}

function navigate({ focus = false } = {}) {
  const requested = location.hash.slice(1);
  currentView = ['reservar', 'mi-reserva', 'gestion'].includes(requested) ? requested : 'reservar';
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== `view-${currentView}`; });
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === currentView;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  refreshStore();
  refreshUI();
  document.title = `${{ reservar: 'Nueva reserva', 'mi-reserva': 'Mi reserva', gestion: 'Gestión' }[currentView]} · ReservaFácil`;
  if (focus) { $('#main').focus(); window.scrollTo({ top: 0, behavior: 'instant' }); }
}

$('#lookup-form').addEventListener('submit', event => {
  event.preventDefault();
  const code = $('#lookup-code').value;
  const phone = $('#lookup-phone').value;
  const error = $('#lookup-error');
  if (!code.trim() || !phone.trim()) {
    error.textContent = 'Completá el código de reserva y el teléfono para consultar.';
    error.hidden = false;
    (!code.trim() ? $('#lookup-code') : $('#lookup-phone')).focus();
    lookupCredentials = null;
    $('#lookup-result').replaceChildren();
    return;
  }
  error.hidden = true;
  lookupCredentials = { code, phone };
  refreshStore();
  refreshUI();
});
document.querySelectorAll('[data-view="reservar"], .brand').forEach(link => {
  link.addEventListener('click', () => { if (!$('#booking-success').hidden) resetBooking(); });
});
$('#filter-date').value = nextServiceDate();
$('#filter-date').addEventListener('change', () => { refreshStore(); refreshUI(); });
$('#filter-all').addEventListener('click', () => { $('#filter-date').value = ''; refreshStore(); refreshUI(); });
$('#manager-create').addEventListener('click', () => openEditor());
$('#empty-create').addEventListener('click', () => openEditor());
$('#close-editor').addEventListener('click', () => $('#editor-dialog').close());
$('#editor-dialog').addEventListener('close', () => {
  const form = $('#editor-form-host form');
  if (form) liveForms.delete(form);
  $('#editor-form-host').replaceChildren();
});
$('#keep-reservation').addEventListener('click', () => $('#cancel-dialog').close());
$('#cancel-dialog').addEventListener('close', () => { cancellation = null; });
$('#confirm-cancel').addEventListener('click', () => {
  if (!cancellation || $('#confirm-cancel').disabled) return;
  $('#confirm-cancel').disabled = true;
  try {
    const { code, source } = cancellation;
    store.transact(reservations => {
      if (source === 'client' && (!lookupCredentials || !findReservation(reservations, lookupCredentials.code, lookupCredentials.phone))) {
        throw new Error('No encontramos una reserva con esos datos. Volvé a consultarla.');
      }
      return cancelReservation(reservations, code);
    });
    storageHealthy = true;
    $('#storage-alert').hidden = true;
    $('#cancel-dialog').close();
    toast('Reserva cancelada. Sus lugares ya están disponibles.');
    refreshUI();
    if (source === 'client') { $('#lookup-result').tabIndex = -1; $('#lookup-result').focus(); }
    else { $('#manage-title').tabIndex = -1; $('#manage-title').focus(); }
  } catch (error) {
    $('#cancel-error').textContent = error.message;
    $('#cancel-error').hidden = false;
    $('#confirm-cancel').disabled = false;
    if (error instanceof StorageError) { reportStorageError(error); refreshUI(); }
  }
});
$('#retry-storage').addEventListener('click', () => { refreshStore(); refreshUI(); });
window.addEventListener('hashchange', () => navigate({ focus: true }));
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) { refreshStore(); refreshUI(); } });
window.addEventListener('focus', () => { refreshStore(); refreshUI(); });
setInterval(() => refreshUI(), 30000);
refreshStore();
mountForm($('#booking-form-host'));
navigate();
