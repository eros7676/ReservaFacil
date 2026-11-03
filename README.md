# ReservaFácil

Primer MVP de una agenda de reservas de restaurante. HTML, CSS y JavaScript, sin frameworks, paquetes ni servicios externos. Implementa el alcance de la segunda pestaña **«ReservaFácil · Documentación»** del [documento del proyecto](https://docs.google.com/document/d/1OgGvHcdmGZN2uEwl4h56t_Ywbchbz8oyk9_3JilXckU/edit?tab=t.taq8vwbswtf6).

## Ejecutar

Necesitás Node.js 22 o superior; para las pruebas, usá Node.js 24 o superior. No hace falta instalar dependencias.

Desde esta carpeta:

```sh
npm start
```

Abrí **http://localhost:4173**. Para detener el servidor, presioná `Ctrl+C` en la terminal. `npm run dev` inicia el mismo servidor. No abras `index.html` haciendo doble clic: la aplicación usa módulos y un origen HTTP estable.

Usá siempre la misma URL, puerto, navegador y perfil para conservar las reservas. `localhost` y `127.0.0.1` tienen almacenamiento separado. Si necesitás otro puerto, definí la variable `PORT` antes de iniciar; esto también cambia el origen de almacenamiento.

## Qué incluye

- **Nueva reserva:** fecha, personas, turno, nombre y teléfono. Disponibilidad visible antes de confirmar; código UUID completo al guardar y botón para copiarlo.
- **Mi reserva:** consulta con código y teléfono normalizados. Cancelación con confirmación explícita.
- **Gestión:** agenda ordenada por fecha y turno, filtro por fecha o todas las fechas, resumen de cupos, altas, edición y cancelación.
- **Persistencia local:** altas, ediciones y cancelaciones sobreviven a la recarga. Errores de lectura/escritura informados sin falsa confirmación ni borrado automático.
- **Interfaz adaptable:** navegación y formularios en celular; listado con desplazamiento horizontal interno cuando hace falta. Etiquetas, foco visible y diálogos que se pueden cerrar con `Escape`.

## Reglas implementadas

Cada fecha tiene dos turnos independientes: **19:00–21:00** y **21:00–23:00**, con **20 personas por turno**. Cada reserva admite entre **1 y 6 personas**. Se aceptan fechas desde hoy hasta **30 días posteriores, inclusive**, según la fecha y hora local del dispositivo; un turno de hoy que ya comenzó no se puede reservar.

El nombre requiere entre 3 y 80 caracteres después de quitar espacios exteriores. El teléfono admite entre 8 y 15 dígitos, espacios, guiones, paréntesis y un `+` inicial. Se guarda como cadena de dígitos, conservando ceros iniciales.

El cupo se vuelve a calcular al guardar. Al editar, se excluye la propia reserva del cálculo. Código y fecha de creación se conservan. Cancelar cambia el estado a `CANCELADA`, conserva el registro y libera cupo una sola vez; una reserva cancelada no se puede editar, reactivar ni eliminar físicamente. Un doble clic no duplica una confirmación. Un teléfono puede tener varias reservas.

## Almacenamiento y límites

La clave de localStorage es `reservafacil.v1` y su estructura es `{ "version": 1, "reservas": [...] }`. Cada registro contiene `codigo`, `nombreCompleto`, `telefono`, `fecha`, `turno`, `personas`, `estado`, `creadaEn` y `actualizadaEn`.

La vista de gestión es una simulación abierta: **no tiene autenticación ni permisos**. Código más teléfono tampoco constituye verificación de identidad. Usá exclusivamente nombres y teléfonos ficticios.

Los datos se guardan solo en ese navegador y origen: no hay backend, sincronización entre dispositivos, copia de seguridad, pagos, notificaciones ni asignación de mesas. Borrar datos del navegador o usar modo privado puede hacer que se pierdan. No se promete concurrencia de usuarios ni transacciones entre pestañas; se relee el almacenamiento antes de guardar y se atienden cambios de otras pestañas, pero localStorage no ofrece bloqueo transaccional.

Si hay JSON corrupto, formato inválido o almacenamiento bloqueado, aparece un aviso y se deshabilita la operación afectada. Los datos existentes se conservan. El botón **Volver a intentar** permite reintentar después de resolver el problema. No hay una opción de borrado automático.

## Verificación

```sh
npm run check
npm test
```

`npm test` ejecuta 14 pruebas de reglas y almacenamiento con el runner integrado de Node.js, sin procesos aislados para poder ejecutarlo también en entornos restringidos. Comprueba cupos, fechas, normalización, consultas, edición, cancelación, persistencia, datos inválidos, fallos de escritura y una colección sintética de 200 reservas.

El [registro de pruebas](docs/PRUEBAS.md) diferencia los resultados automáticos, las comprobaciones en interfaz y lo que sigue pendiente de validación académica. No se acredita un Sprint ni compatibilidad con navegadores que no se hayan probado.

## Estructura

- `index.html`: vistas, formularios semánticos y plantillas.
- `styles.css`: diseño, adaptación móvil y estados de interacción.
- `app.js`: navegación, formularios, mensajes y representación de datos como texto.
- `domain.js`: constantes y reglas de negocio, independientes de la interfaz.
- `storage.js`: validación de datos persistidos y guardado antes de actualizar la memoria.
- `server.mjs`: servidor estático local, solo accesible desde el equipo; no es una API.
- `tests/reservations.test.js`: pruebas de reglas e integridad del almacenamiento.

## Próximas iteraciones

Este incremento cubre el MVP local elegido. Para convertirlo en un servicio real habrá que incorporar autenticación, servidor, base de datos compartida y control transaccional de cupos. Notificaciones, mesas y copias de seguridad quedan para iteraciones posteriores. La documentación académica original se conserva sin modificaciones; nombres del equipo, consigna docente, eventos Scrum y evidencias de la demostración deben completarse con lo que efectivamente se realice.
