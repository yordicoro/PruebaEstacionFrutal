# Estación Frutal — Sistema de pedidos y caja

## Objetivo y alcance

Extender el catálogo web existente con pedidos en mesa, atención del mesero, impresión de comandas, administración del menú y control diario de caja. El cliente no crea una cuenta. Las únicas cuentas del personal son Mesero y Administrador; el Administrador también opera caja y gestiona usuarios.

El catálogo actual es estático y está publicado en Netlify. Para que cliente, mesero y administrador compartan pedidos se requiere un backend con persistencia central. La propuesta de despliegue es Netlify Functions como adaptador HTTP y PostgreSQL administrado como almacenamiento; credenciales y configuración se suministran al desplegar.

## Actores

- **Cliente:** revisa el menú, arma su carrito y genera un código temporal de cuatro dígitos. También puede no usar el catálogo; el mesero registra la orden manualmente.
- **Mesero:** inicia sesión, consulta códigos, registra pedidos por encargo, asigna una de las 20 mesas, sigue el estado y emite/reimprime la comanda.
- **Administrador:** administra menú y usuarios, supervisa pedidos, registra pagos/anulaciones y realiza apertura, arqueo y cierre de caja.

## Reglas de negocio

1. El precio y nombre de cada artículo se copian al detalle del pedido al crearlo. Cambios posteriores en el menú no alteran ventas históricas.
2. La API vuelve a calcular importes usando el catálogo autorizado; nunca acepta como confiables los precios enviados por el navegador.
3. El código del cliente tiene exactamente cuatro dígitos, no es una contraseña ni sustituye el inicio de sesión del personal. Se genera en el servidor, es único entre pedidos consultables, expira y tiene límite de intentos de consulta.
4. La mesa pertenece a un pedido de atención en local. Valores válidos: 1 a 20. Se pueden registrar varios pedidos para una mesa ocupada; cada pedido conserva su propio detalle y estado hasta que el personal los gestione.
5. Un mesero puede abrir una cuenta manual y añadir artículos mientras siga abierta. Los pedidos enviados por clientes se revisan y aceptan antes de pasar a preparación.
6. Flujo normal: **Pendiente de revisión → Aceptado → En preparación → Listo → Entregado → Pagado**. El mesero mueve los estados operativos; el Administrador registra el pago. Anular requiere motivo y autorización del Administrador después de aceptación.
7. Los ingresos de caja consideran solo cuentas pagadas. Las anulaciones y devoluciones quedan auditadas y no se borran.
8. La impresora se selecciona en el dispositivo del mesero mediante el diálogo de impresión del navegador. La comanda identifica pedido, mesa, hora, artículos, cantidades, notas y número de reimpresión. La impresión no implica que la orden esté entregada.
9. Moneda: soles (PEN). Los importes se guardan en céntimos enteros. El turno de caja conserva monto inicial, ventas por medio de pago, efectivo esperado, efectivo contado, diferencia, usuario y hora de cierre.
10. La conexión QR es una solicitud de pedido; la confirmación de disponibilidad, mesa y preparación queda a cargo del personal.

## Requerimientos funcionales

### Catálogo y pedidos del cliente

- **RF-01:** mostrar categorías, artículos, descripción, precio, disponibilidad e imágenes en el catálogo actual.
- **RF-02:** ofrecer “Pedir” en cada artículo y permitir añadir/quitar unidades, editar cantidad y retirar del carrito.
- **RF-03:** mostrar subtotal, notas por artículo y resumen antes de confirmar.
- **RF-04:** al confirmar, crear el pedido una sola vez, mostrar el código de cuatro dígitos, total, hora y estado pendiente; permitir copiar el código.
- **RF-05:** recuperar el estado del pedido desde una referencia privada guardada en el dispositivo, sin exponer datos personales ni requerir cuenta.
- **RF-06:** rechazar cantidades inválidas, pedidos vacíos, productos deshabilitados y solicitudes duplicadas por reintento de red.
- **RF-07:** aclarar que el código tiene vigencia limitada y que el pedido queda sujeto a aceptación del mesero.

### Mesero

- **RF-08:** inicio/cierre de sesión seguro y autorización por rol.
- **RF-09:** consultar un código y ver el resumen completo solo tras autenticarse, con limitación de intentos y respuesta que no revele si un código cercano existe.
- **RF-10:** listar pedidos pendientes, filtrar por estado/código/mesa/hora y actualizar en vivo o mediante actualización periódica.
- **RF-11:** aceptar/rechazar pedido de cliente, documentando motivo de rechazo.
- **RF-12:** crear pedido manual en nombre de un cliente sin código y añadir/modificar artículos antes de enviarlo.
- **RF-13:** asignar y cambiar mesa entre 1 y 20, mostrando ocupación y mostrando los pedidos asociados a cada mesa.
- **RF-14:** mover pedidos aceptados por estados de preparación y entrega, con usuario y hora de cada transición.
- **RF-15:** imprimir y reimprimir comanda con mesa y contador de reimpresiones. Ofrecer salida de impresión del navegador compatible con impresoras de ticket configuradas en el sistema operativo.

### Administrador y caja

- **RF-16:** mantener artículos, categorías, precios, descripciones, disponibilidad e imágenes; deshabilitar en lugar de borrar los que ya aparecen en ventas.
- **RF-17:** crear/desactivar cuentas de mesero, restablecer credenciales y consultar actividad; el administrador no puede leer contraseñas.
- **RF-18:** registrar pagos en efectivo, tarjeta, transferencia u otro medio configurable; admitir pagos divididos y registrar referencia opcional.
- **RF-19:** abrir caja con monto inicial; mostrar ventas pagadas por medio de pago, total esperado, anulaciones/devoluciones y pedidos aún abiertos.
- **RF-20:** registrar conteo de efectivo, diferencia y observación, cerrar caja y conservar un reporte inmutable del turno.
- **RF-21:** consultar ventas por fechas, medio, usuario, mesa y artículo; exportar CSV e imprimir resumen de cierre.
- **RF-22:** anular/reembolsar indicando motivo y conservar quién/cuándo/qué cambió.
- **RF-23:** registrar auditoría para cambios de precio, permisos, estados, pagos, anulaciones, caja e impresión.

## Requerimientos no funcionales

- **RNF-01 Seguridad:** HTTPS, contraseñas con hash robusto y sal, sesiones firmadas de corta duración, secretos solo del lado servidor, autorización por rol en cada operación, consultas parametrizadas, validación de entrada y limitación de intentos.
- **RNF-02 Privacidad:** recopilar la mínima información; no exigir nombre, teléfono ni correo para pedir. No mostrar información de otros clientes por código.
- **RNF-03 Integridad:** pedido, líneas, total y código se confirman de forma atómica; cantidades y dinero se validan en servidor; eventos de caja y auditoría no se editan ni eliminan desde la interfaz.
- **RNF-04 Disponibilidad:** la página del menú seguirá mostrando información si la API no responde; el carrito informará que no pudo enviarse y no mostrará una confirmación falsa.
- **RNF-05 Rendimiento:** catálogo interactivo en menos de 3 s en conexión móvil razonable; operaciones de pedido/panel responden en menos de 2 s en condiciones normales; panel refresca pedidos en menos de 10 s.
- **RNF-06 Accesibilidad:** controles con teclado, foco visible, etiquetas y errores anunciados, contraste legible y diseño adaptable a móvil/tablet.
- **RNF-07 Compatibilidad:** navegadores actuales de Android, iOS, Windows y macOS; impresión mediante diálogo del navegador y controlador instalado.
- **RNF-08 Mantenibilidad:** Clean Architecture; el dominio y casos de uso no dependen de Netlify, PostgreSQL ni el DOM. Los adaptadores se sustituyen sin cambiar reglas de negocio.
- **RNF-09 Observabilidad:** registro estructurado sin contraseñas, tokens ni datos sensibles, marcas de tiempo y correlación de solicitudes; errores operativos comprensibles.
- **RNF-10 Respaldo:** respaldos automáticos de la base de datos y procedimiento documentado para restaurar; retención configurada según política del negocio.

## Arquitectura limpia

```text
Presentación
  catálogo y carrito | panel de personal | impresión
          ↓ puertos de entrada
Aplicación
  crear pedido | consultar código | operar pedido | cobrar | cerrar caja
          ↓ puertos de salida
Dominio
  Pedido, Detalle, Producto, Mesa, Pago, TurnoCaja
  reglas, estados, dinero y validaciones sin dependencias externas
          ↑ implementados por
Infraestructura
  Netlify Functions | repositorio PostgreSQL | sesión | reloj | generador código
```

Las pantallas llaman casos de uso a través de controladores HTTP. Los casos de uso dependen de interfaces de repositorio, reloj, sesión y generación de código. Netlify y la base de datos son detalles intercambiables. La base de datos aplica restricciones de unicidad y transacciones para proteger operaciones concurrentes.

## Entidades mínimas

- `Product`, `Category`: menú vigente, estado y precio en céntimos.
- `Order`: código de cliente opcional, origen (cliente/mesero), estado, mesa, moneda, total y marcas de tiempo.
- `OrderLine`: producto y copia histórica de nombre/precio, cantidad, nota y subtotal.
- `StaffUser`: identificador, hash de contraseña, rol y estado.
- `Payment`: cuenta, monto, medio, referencia, usuario y fecha.
- `CashSession`: apertura, cierre, efectivo esperado/contado, diferencia y responsable.
- `AuditEvent`: actor, acción, objeto, fecha y cambios no sensibles.

## Criterios de aceptación principales

1. Un cliente puede pedir desde el teléfono, recibe código de cuatro dígitos y el mesero ve el mismo pedido desde otro dispositivo.
2. Un código expirado o sujeto a demasiados intentos no permite consultar el pedido.
3. El panel indica cuántos pedidos activos tiene cada mesa y mantiene separados sus detalles.
4. Un artículo cambió de precio después de una venta: la venta conserva el precio original.
5. Pedidos no pagados o anulados no inflan las ventas cobradas ni el efectivo esperado.
6. El mesero imprime/reimprime una comanda que muestra la mesa asignada; cada impresión queda registrada.
7. El cierre muestra esperado, contado y diferencia; los cambios posteriores no reescriben el cierre.
8. Un mesero no puede acceder a administración de menú, cuentas, cobros, reportes financieros ni cierre de caja manipulando la interfaz o llamando directamente a la API.

## Dependencias de puesta en marcha

Se necesita crear/configurar el proyecto PostgreSQL y establecer en Netlify los secretos de conexión y firma de sesión. También se requiere una primera cuenta Administrador provisionada de forma segura, confirmar la política de vigencia del código, los horarios/turnos de caja y los medios de pago. La impresión directa silenciosa en una impresora USB no la garantiza un navegador; la solución inicial usa el diálogo estándar del dispositivo.


