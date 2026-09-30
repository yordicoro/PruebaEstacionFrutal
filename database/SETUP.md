# Configurar el backend y publicar en Netlify

## Requisitos

- Un proyecto PostgreSQL/Supabase para pedidos, menú, cuentas y caja.
- El sitio publicado en Netlify.
- Node.js 20 o posterior para generar el seed de menú si cambias el catálogo.

## Preparar la base de datos

1. En el editor SQL del proyecto, ejecutar `database/schema.sql`.
2. Ejecutar `database/seed.sql`, generado desde los 50 productos y precios actuales de `index.html`.
3. Crear el usuario inicial en Auth con un correo del negocio y una contraseña única de al menos 12 caracteres.
4. Copiar el UUID de esa cuenta desde Auth y asignarle rol de administrador:

```sql
insert into public.staff_users(id, role, active)
values ('UUID_DEL_USUARIO', 'admin', true);
```

5. No usar la clave `service_role` en el navegador. Solo se configura como secreto del entorno de funciones.

## Variables en Netlify

Configurar en la consola de Netlify, para producción y despliegue de pruebas:

- `SUPABASE_URL`: URL del proyecto de base de datos.
- `SUPABASE_SERVICE_ROLE_KEY`: clave secreta `service_role`.
- `SITE_ORIGIN`: origen HTTPS exacto del sitio, por ejemplo `https://catalogo.example`; dejarlo vacío mantiene la API en mismo origen.

El directorio publicable permanece en la raíz para conservar el catálogo e imágenes actuales. Las rutas `/database`, `/docs`, `/scripts` y `/src` deben mantenerse bloqueadas desde publicación; no guardar secretos ni copias de `.env` en esta carpeta.

## Publicación

1. Ejecutar `node scripts/generate-seed.mjs` después de cambios en los nombres o precios del menú, luego ejecutar el `database/seed.sql` actualizado en la base de datos.
2. Publicar la rama desde Netlify con `netlify.toml` en la raíz.
3. Confirmar que `/api/catalog` responda y que las Functions no reporten errores de entorno.
4. Probar con cuentas de prueba el recorrido completo: pedido cliente, búsqueda del código, mesa, comanda, entrega, cobro y cierre. No registrar ventas de prueba en la caja real.

## Capas de Clean Architecture

- `src/domain`: estados, reglas de transición, cantidades y mesas.
- `src/application`: casos de uso que coordinan creación del pedido.
- `netlify/functions`: adaptador HTTP y autorización de personal.
- `database`: persistencia, transacciones, restricciones y auditoría.
- `pedidos.js`, `panel.js`: adaptadores de presentación para cliente y personal.

El diálogo de impresión del navegador usa la impresora de tickets instalada en el dispositivo del mesero. La impresión silenciosa directa requiere una aplicación local o servicio de impresión adicional.
