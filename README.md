# Velvet Move — Saltitos y pasos

Los tokens dan un saltito con cada paso y suenan sus pisadas. Funciona en las
tres formas de dibujar una escena: **2D cenital**, **Isometric Perspective** y
el **3D Canvas** de theripper93.

## Qué hace

- **Saltito (hop).** El token se despega del suelo y aterriza en cada paso. La
  animación va guiada por la *distancia recorrida*, no por un temporizador: sube
  al arrancar, alcanza el punto alto a mitad de casilla y vuelve al suelo justo
  al llegar — a la velocidad que sea (caminar, correr, apurado, arrastrado con
  el ratón, movimiento por waypoints).
- **Pasos.** Cada aterrizaje reproduce un sonido de la superficie activa.
- **Superficies.** Una biblioteca de pisos (piedra, madera, pasto, tierra,
  arena, grava, agua, nieve, metal, alfombra… y las que crees tú), cada uno con
  su propia lista de archivos de audio y su volumen.
- **Menú rápido** en la barra lateral izquierda: activar/desactivar saltito y
  sonido, y elegir de un clic el piso de la escena actual.
- **Guardar y transferir.** Presets en el servidor (visibles desde todos tus
  mundos) más exportar/importar en archivo o por portapapeles.

## Cómo se usa

1. Activa el módulo. En la barra izquierda aparece un grupo **Velvet Move**
   (icono de huellas).
2. Pulsa el botón de los deslizadores (**Menú de pasos y saltitos**).
3. En **Superficies**, abre la que quieras editar y cuélgale sonidos de tres
   formas:
   - **Añadir archivo** — el explorador de Foundry, un archivo.
   - **Añadir carpeta** — recorre la carpeta **y sus subcarpetas** y añade de
     golpe todos los audios que encuentre (`.ogg`, `.mp3`, `.wav`, `.webm`,
     `.m4a`, `.opus`, `.flac`).
   - **Pegar ruta** — escribe o pega la ruta a mano. Es la salida de emergencia
     si el explorador te da problemas, y lo más rápido si ya tienes la ruta.

   El botón del altavoz reproduce **tres pasos seguidos**, para juzgar cómo
   suena la caminata y no una muestra suelta.
4. Haz clic en el nombre de una superficie para que la escena actual la use.
   También puedes hacerlo desde los botones de la barra lateral.

> El módulo **no trae sonidos**: los archivos los pones tú, desde tu carpeta de
> datos de Foundry.

### Guardar, exportar e importar

La sección **Guardar y transferir** del menú (solo GM) mueve una configuración
completa —biblioteca de superficies, sus sonidos, volúmenes y los ajustes de
movimiento— de un sitio a otro:

| Botón | Qué hace |
| --- | --- |
| **Guardar preset** | Escribe un JSON en `velvet-move-presets/` dentro de tu carpeta de datos de Foundry. **Todos los mundos de esa instalación ven la misma lista**, así que es la vía directa para reutilizar la configuración en otro mundo. |
| **Cargar preset** | Aplica un preset de esa lista. |
| **Exportar archivo** | Descarga el mismo JSON a tu ordenador, para llevarlo a otra instalación o guardarlo de respaldo. |
| **Importar archivo** | Lee un JSON exportado. |
| **Copiar / Pegar JSON** | Lo mismo sin pasar por archivos, útil para mandarlo por chat. |

Al importar se elige cómo aterriza:

- **Fusionar** — añade solo las superficies que este mundo no tiene y deja
  intactas las tuyas. Es lo correcto casi siempre: los sonidos que tú tienes
  colgados de "piedra" probablemente no son los del archivo.
- **Reemplazar** — cambia toda la biblioteca por la importada.

Nada se aplica a ciegas: un JSON inválido, de otro módulo o sin superficies
utilizables se rechaza con un mensaje, en vez de dejar el mundo sin pisos.

Los presets son archivos normales: para borrar uno, bórralo de
`velvet-move-presets/`. Guardar presets requiere permiso de subida de archivos;
sin él, el botón aparece deshabilitado y te queda **Exportar archivo**.

### Excepciones por token

Con tokens seleccionados, el botón **Asignar a seleccionados** clava esa
superficie en ellos, sin importar en qué escena estén — el caballero con
armadura resuena a metal aunque pise pasto. **Quitar superficie de los tokens
seleccionados** deshace la excepción.

### Prioridad de superficie

1. Bandera del token (excepción individual)
2. Bandera de la escena (lo que elige el GM en la barra lateral)
3. Superficie por defecto del mundo

## Ajustes

| Ajuste | Ámbito | Qué hace |
| --- | --- | --- |
| Saltitos al mover | jugador | Enciende o apaga la animación |
| Altura del saltito | jugador | Fracción de casilla que sube el token |
| Longitud de zancada | mundo | Casillas por paso (< 1 pasos cortos, > 1 zancadas) |
| Ignorar tokens elevados | mundo | Los tokens volando ni saltan ni suenan |
| Sonido de pasos | jugador | Enciende o apaga el audio |
| Volumen de pasos | jugador | Volumen propio de cada cliente |
| Qué pasos escuchas | jugador | Todos los visibles / los tuyos / el que controlas |
| Variación de tono | jugador | Desafina cada paso para que no suene a metrónomo |

El audio es **local a cada cliente**. No se emite nada por socket: todos los
clientes ven la misma animación de movimiento, así que cada uno sabe por su
cuenta cuándo aterriza un paso.

## Renderizadores

El saltito significa algo distinto según cómo se dibuje la escena, así que el
módulo tiene un pintor por cada caso. El ajuste **Renderizador** (ajustes del
módulo, y también arriba del menú rápido) elige cuál:

| Opción | Qué hace |
| --- | --- |
| **Automático** | Sigue al lienzo: 3D si tienes 3D Canvas abierto, isométrico si la escena la proyecta Isometric Perspective, y 2D en cualquier otro caso. Es lo normal. |
| **2D — cenital** | Salto recto hacia arriba en pantalla, ignorando cualquier proyección. |
| **Isométrico** | Invierte la transformación del lienzo para que "arriba" sea arriba en la proyección activa. |
| **3D — 3D Canvas** | Levanta el modelo por el eje vertical del mundo 3D. |

Es un ajuste **de cliente**, porque el renderizador lo es: 3D Canvas lo activa
cada jugador por su cuenta, así que uno puede estar en 3D mientras el resto de
la mesa mira la misma escena en 2D. El renderizador se resuelve en cada
fotograma, así que **abrir o cerrar el 3D a mitad de sesión no necesita
recargar**. La insignia junto a "Movimiento" en el menú te dice cuál está
activo, y avisa si has forzado uno que no coincide con lo que hace el lienzo.

Un detalle del 3D: el ajuste *Ignorar tokens elevados* **no se aplica** ahí. Su
sentido es que una criatura volando no haga ruido de pisadas, pero en 3D
Canvas la elevación es además la forma de expresar cada planta, y aplicarlo
dejaría muda la primera planta entera de una taberna.

## Por qué funciona en isométrico

Dos detalles que hacen falta para convivir con Isometric Perspective:

- **El saltito se pinta sobre `mesh.position`, y de último.** Isometric
  Perspective recalcula la posición del mesh desde cero en cada `refreshToken`,
  así que animar `document.texture.scaleX/Y` (que es como estaba hecho el
  efecto en Velvet Mobile) simplemente se descarta en una escena isométrica.
  Velvet Move registra su repintado durante `ready`, es decir *después* del de
  Isometric Perspective, que es el único punto donde el desplazamiento
  sobrevive al fotograma.
- **La dirección "arriba" se deduce del propio stage.** El módulo isométrico
  ofrece siete proyecciones más una personalizada, cada una con su rotación y
  su sesgo. En vez de fijar los ángulos de True Isometric, Velvet Move invierte
  la transformación lineal del stage en cada fotograma, así que el token sube
  recto en pantalla sea cual sea la proyección — y también en escenas normales
  (cenitales), donde la inversa es la identidad.

El repintado es idempotente: antes de aplicar un desplazamiento comprueba si la
posición sigue siendo exactamente la que escribió y, si lo es, se la quita para
recuperar la base limpia. Ningún desplazamiento se cuenta dos veces, así que el
token no puede irse derivando hacia arriba del mapa.

## Comprobaciones

```
node tests/run.mjs
```

Nueve comprobaciones sin dependencias ni Foundry en marcha: sintaxis, JSON,
imports contra exports reales, cada `data-action` contra su handler, claves de
idioma en ambos ficheros, estructura de las plantillas, **colisiones de clases
CSS contra todos los módulos instalados**, la matemática del salto en cada
proyección, y las invariantes de la barra lateral que Foundry impone pero no
documenta. Cada una está ahí porque el fallo correspondiente ya se coló alguna
vez. Foundry nunca carga esta carpeta.

## API

```js
const api = game.modules.get("velvet-move").api;

api.openMenu();                       // abre el menú rápido
api.getSurfaces();                    // biblioteca de superficies
api.getSceneSurfaceId();              // piso de la escena actual
await api.setSceneSurfaceId("wood");  // cambiarlo (GM)
api.previewSurface(api.getSurfaces().stone);
api.activeRenderer();                 // "2d" | "isometric" | "3d"
api.detectRenderer();                 // lo mismo, ignorando el ajuste forzado
api.isIsometricScene();               // ¿la proyecta Isometric Perspective?
api.is3DActive();                     // ¿está abierto 3D Canvas en este cliente?

// Guardar y transferir
api.config.serialize();               // la configuración actual como JSON
await api.config.savePreset("Mazmorra");
await api.config.listPresets();
const cfg = api.config.parse(json);   // valida y normaliza
await api.config.apply(cfg, { mode: "merge" });
```

## Nota para quien toque el CSS

Todas las clases de este módulo llevan el prefijo `vmove-`, **nunca `vm-`**.
Velvet Mobile usa `vm-` y su hoja de estilos se carga en todo el mundo: su
`.vm-empty` es un overlay `position: fixed; inset: 0`, así que compartir ese
nombre convertía una lista de sonidos vacía en una lámina invisible sobre toda
la ventana que se tragaba todos los clics. Si añades clases, respeta el
prefijo.

## Si algo no responde

Toda acción del menú está envuelta: si falla, sale una notificación roja con el
nombre de la acción y el motivo, y el detalle completo queda en la consola
(F12) con el prefijo `velvet-move |`. Si un botón no hace nada **y no aparece
ningún aviso**, es un problema distinto — mándame lo que diga la consola.

## Compatibilidad

- Foundry VTT v13 (verificado en build 351); el manifiesto declara v12 como
  mínimo y la barra lateral admite ambos formatos de controles.
- Isometric Perspective y 3D Canvas son **opcionales**: sin ninguno de los dos,
  el saltito funciona igual en escenas cenitales.
