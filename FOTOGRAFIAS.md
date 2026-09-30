# Fotografías de Estación Frutal

El catálogo sigue en `index.html`. Solo los productos con `data-images` abren la galería compartida de `menu.js`. El nombre, precio y descripción visible se leen del propio producto para evitar duplicar el catálogo. `data-description` permite ampliar la descripción del preview.

## Archivos de las fotografías

Carpeta raíz: `C:\Users\Yordi\Desktop\EstFrut\img`.

| Producto | Archivo recomendado, relativo a la carpeta del proyecto |
| --- | --- |
| Arándano, fresa y mango | `img/jugos/arandano-fresa-mango-1.webp` |
| Segunda foto del mismo jugo | `img/jugos/arandano-fresa-mango-2.webp` |
| Maracumango | `img/jugos/maracumango-1.webp` |
| Fresa (Jugos Clásicos) | `img/jugos/fresa-1.webp` |
| Frappe Oreo | `img/frappes/frappe-oreo-1.webp` |
| Hamburguesa Royal | `img/hamburguesas/hamburguesa-royal-1.webp` |
| Cheesecake de maracuyá | `img/postres/cheesecake-maracuya-1.webp` |

Solo `arandano-fresa-mango-1.webp` existe como imagen del producto: es una imagen referencial generada por IA, no una fotografía del establecimiento. Los demás previews utilizan explícitamente `img/placeholder.svg`, que muestra «Fotografía por añadir». La segunda imagen del primer jugo también es este placeholder, para demostrar la galería de dos imágenes sin inventar una fotografía inexistente.

Cuando coloques una foto real, sustituye `img/placeholder.svg` por su ruta en el atributo `data-images` del producto correspondiente en `index.html`. Para el primer jugo, puedes reemplazar directamente el archivo WebP y cambiar la segunda ruta cuando tengas otra foto:

```html
data-images="img/jugos/arandano-fresa-mango-1.webp,img/jugos/arandano-fresa-mango-2.webp"
```

Para un solo archivo usa una sola ruta sin coma. Los indicadores solo se muestran con dos imágenes. No añadas rutas antes de copiar los archivos. Para desactivar una demostración, elimina `data-images`: el script quitará su comportamiento interactivo. Para activar otro producto, añade `item-preview` a su clase y un `data-images` con rutas existentes; el script incorpora el icono y los atributos accesibles.

Usa WebP de aproximadamente 900 × 900 px, idealmente entre 80 y 180 KB; deja margen alrededor del producto porque el encuadre se adapta con `object-fit: cover`. No se utilizan imágenes Base64 para productos. El logo incrustado existente se conserva.

## Decisiones y funcionamiento

- Carta sencilla, sin pedidos ni dependencias nuevas.
- Panel inferior en móvil; centrado a partir de 640 px. Galería horizontal con scroll-snap y flechas del teclado.
- Cierre mediante X, fondo oscuro y Escape. El diálogo nativo limita el foco; al cerrar se restablecen el foco y la posición.
- El menú lateral utiliza el mismo bloqueo de fondo. Ambos paneles no se abren simultáneamente.
- Se mantiene desactivado el carrusel: repite productos y ocupa espacio antes de la carta. Su título comentado se actualizó. Si se reactiva, sus tarjetas pueden compartir el preview usando `data-preview-target="id-del-producto"` y un id en el producto; no se conserva el antiguo script de escalado e indicadores.
- Se eliminó únicamente la fila duplicada de Arándano, fresa y mango; se conservan categorías, precios y demás productos.

## Validación pendiente en navegador

La política del navegador automatizado bloqueó el acceso a la página local. No se validaron consola, renderizado ni interacción real. Las verificaciones estáticas no reemplazan estas pruebas:

1. Abrir `index.html` y revisar consola sin errores.
2. Probar a 360, 390, 640 px y escritorio: sin desbordamiento horizontal ni contenido oculto por la barra sticky.
3. Abrir el primer jugo, deslizar hacia la segunda imagen y usar sus indicadores/flechas; abrir Maracumango y comprobar que no hay indicadores.
4. Probar un producto sin foto: no debe abrir panel ni recibir foco como botón.
5. Repetir apertura/cierre con X, fondo y Escape; comprobar Tab, Shift+Tab, Enter, Espacio, devolución del foco y posición de la carta.
6. Probar menú hamburguesa, navegación por categorías y bloqueo del fondo; activar reducción de movimiento.
7. Probar una ruta rota temporalmente: debe mostrar el estado alternativo sin icono roto.

## Procedencia de la imagen de demostración

Herramienta integrada ImageGen. Prompt: “Use case: product-mockup. Create a single photorealistic reference photograph for a small juice cafe digital menu: one glass of blended blueberry, strawberry and mango juice, berry purple color, with a few blueberries, strawberries and mango pieces beside it on a warm cream tabletop. Soft natural light, elegant simple composition, muted dark green background, no lettering, no logos, no watermark. Square image, entire glass visible with generous margin for cropping. Return a saved image file for use in the website.”

Se convirtió a WebP de 900 × 900 para la carta.
