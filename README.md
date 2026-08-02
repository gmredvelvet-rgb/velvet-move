# Velvet Move — Saltitos y pasos

Los tokens dan un saltito con cada paso y suenan sus pisadas. Pensado y probado
para funcionar dentro de escenas proyectadas por **Isometric Perspective**.

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

## Cómo se usa

1. Activa el módulo. En la barra izquierda aparece un grupo **Velvet Move**
   (icono de huellas).
2. Pulsa el botón de los deslizadores (**Menú de pasos y saltitos**).
3. En **Superficies**, abre la que quieras editar y usa **Añadir archivo** o
   **Añadir carpeta** para colgarle sonidos. "Añadir carpeta" recorre la
   carpeta y añade de golpe todos los audios que encuentre (`.ogg`, `.mp3`,
   `.wav`, `.webm`, `.m4a`, `.opus`, `.flac`).
4. Haz clic en el nombre de una superficie para que la escena actual la use.
   También puedes hacerlo desde los botones de la barra lateral.

> El módulo **no trae sonidos**: los archivos los pones tú, desde tu carpeta de
> datos de Foundry.

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

## API

```js
const api = game.modules.get("velvet-move").api;

api.openMenu();                       // abre el menú rápido
api.getSurfaces();                    // biblioteca de superficies
api.getSceneSurfaceId();              // piso de la escena actual
await api.setSceneSurfaceId("wood");  // cambiarlo (GM)
api.previewSurface(api.getSurfaces().stone);
api.isIsometricScene();               // ¿la proyecta Isometric Perspective?
```

## Compatibilidad

- Foundry VTT v13 (verificado en build 351); el manifiesto declara v12 como
  mínimo y la barra lateral admite ambos formatos de controles.
- Isometric Perspective es **opcional**: sin él, el saltito funciona igual en
  escenas cenitales.
