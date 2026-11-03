# Registro de verificación del MVP

Sesión del 2 de noviembre de 2026 (America/Buenos_Aires). Ejecución por Codex con datos ficticios. Código en Windows, Node.js **24.20.0**, npm **11.19.0**. Pruebas de interfaz en el navegador integrado de la aplicación.

## Pruebas automáticas ejecutadas

Comandos: `npm run check` y `npm test`. Resultado: sintaxis válida y **14 pruebas aprobadas**.

- CP01: alta, UUID, normalización de datos y recuperación desde otra instancia del almacenamiento.
- CP02: nombres, teléfonos y tamaños de grupo inválidos rechazados.
- CP03: ayer y 31 días rechazados; 30 días aceptados; fechas imposibles y turnos ya iniciados rechazados; cambio de mes/año en hora local.
- CP04–CP05: 18 + 2 personas aceptadas, una adicional rechazada; fechas y turnos independientes.
- CP06: coincidencia de código y teléfono, normalización y rechazo genérico de combinaciones incorrectas.
- CP07: cancelación persistente, registro conservado y cupo liberado una sola vez; edición/reactivación rechazadas.
- CP08: edición de una reserva propia de 4 a 6 con 18 personas ocupadas; código y creación conservados.
- CP09: mover a un turno lleno se rechaza sin modificar datos ni cupos anteriores.
- CP10, parte de datos: orden por fecha/turno sin mutar la colección original.
- CP11, parte de almacenamiento: fallo simulado de escritura en alta, edición y cancelación conserva memoria y datos persistidos.
- CP12: JSON corrupto, versión desconocida, registros inválidos y acceso bloqueado provocan error sin sobrescritura.
- Integridad adicional: códigos repetidos, colisiones, estados desconocidos, sobrecupo persistido y relectura antes de guardar.
- CP14, parte de reglas: 200 reservas sintéticas, ordenamiento y cálculo de cupo por debajo de 1 segundo en esta ejecución. Esto **no equivale** a medir el tiempo de actualización de la interfaz en el equipo de demostración.

## Comprobaciones de interfaz ejecutadas

- Crear una reserva ficticia de 2 personas con doble clic: una sola reserva; código visible y estado confirmado.
- Abrir Gestión y recargar: se recupera exactamente un registro y se muestran 38 lugares entre ambos turnos.
- Editar el grupo de 2 a 6 personas: código conservado y cupo actualizado a 34.
- Ingresar `<b>Alex Demo</b>` como nombre: aparece literalmente como texto en el listado y el diálogo, sin interpretarse como HTML.
- Consultar con teléfono incorrecto: mensaje genérico, sin mostrar la reserva.
- Consultar con código en mayúsculas y teléfono formateado correctos: se recupera la reserva.
- Abrir cancelación: diálogo con datos, botón para conservar y confirmación explícita.
- Confirmar cancelación y recargar Gestión: registro CANCELADA, sin acciones de edición y 40 lugares disponibles.
- Confirmar un formulario vacío: errores en nombre y teléfono; foco en el primer campo inválido.
- Revisión a 360 px de las tres vistas: sin desplazamiento horizontal de la página. La tabla usa desplazamiento interno; se corrigió un desborde causado por una etiqueta accesible posicionada fuera del contenedor.
- Revisión del formulario principal a 1366 px: sin desborde y con formulario/disponibilidad en dos columnas.
- Formulario de gestión a 360 px: el diálogo queda dentro del ancho disponible y se cierra con `Escape`. Al crear desde una fecha filtrada válida, la fecha se precarga en el formulario.
- Filtro «Ver todas»: elimina la fecha, muestra el conjunto local y pide seleccionar una fecha para calcular el cupo del resumen.
- Consola durante el flujo anterior: sin errores ni advertencias registrados.

Capturas de referencia: [escritorio, 1366 px](screenshots/reservafacil-desktop.jpg) y [celular, 360 px](screenshots/reservafacil-mobile.jpg).

## Verificaciones pendientes

- Repetir y registrar el flujo completo en Chrome y Edge con sus versiones exactas; el navegador integrado no sustituye esas pruebas.
- Medir RNF03 en la interfaz con 200 reservas, sin herramientas de desarrollo abiertas, anotando navegador, equipo y tiempo real.
- Repetir todos los recorridos exclusivamente con teclado y con lector de pantalla si se requiere accesibilidad más amplia.
- Ejecutar pruebas con datos y demostración del equipo, adjuntar evidencias y obtener aceptación del usuario/docente.

Estas verificaciones no acreditan concurrencia ni ejecución de eventos Scrum. El documento de Google Drive no fue modificado.
