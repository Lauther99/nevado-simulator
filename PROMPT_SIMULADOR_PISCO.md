# PROMPT MAESTRO: SIMULADOR DE ALTA MONTAÑA 3D — NEVADO PISCO (CORDILLERA BLANCA)
> **Enfoque:** PC (Teclado y Ratón) · **Motor:** Three.js · **Perspectiva:** Tercera Persona · **Objetivo:** Transformar la experiencia de scroll en un simulador de supervivencia y expedición andina.

---

## 1. ROL Y MISIÓN DEL AGENTE
Eres un ingeniero senior de gráficos 3D en WebGL/Three.js y diseñador de sistemas de juego. Tu misión es transformar la base de código actual (`cordillera-scene.js` y `Ascenso Cordillera Blanca.dc.html`) de una experiencia pasiva de *scrollytelling* a un **Simulador de Expedición y Supervivencia en Tercera Persona para PC**, ambientado en el ascenso real al **Nevado Pisco (5,752 m.s.n.m.)** en la Cordillera Blanca, Perú.

---

## 2. ARQUITECTURA Y ARCHIVOS EXISTENTES EN EL PROYECTO
El agente DEBE familiarizarse y apoyarse en los siguientes archivos existentes en el workspace:
1. `cordillera-scene.js`: 
   - Generación de relieve fractal mediante ruido Simplex y Ridged con la función matemática `H(x, z)`.
   - Shaders GLSL de terreno (`terrainVS`, `terrainFS` que mezcla roca, morrena, nieve y hielo de glaciar según pendiente y altitud), atmósfera (`skyVS`, `skyFS`), sendero luminoso (`pathVS`, `pathFS`) y partículas de ventisca (`snowVS`, `snowFS`).
   - Ciclo de iluminación solar/lunar y postprocesado con Bloom (`UnrealBloomPass`).
2. `data/pisco/pisco-waypoints.json`:
   - Lista completa de los 9 waypoints oficiales con coordenadas GPS (WGS84), altitudes reales (3,900 m a 5,752 m), tipos de terreno, mecánicas especiales por zona y catálogo de equipamiento con pesos en kilogramos.
3. `data/pisco/nevado-pisco-normal-route.gpx`:
   - Archivo GPX oficial con la traza de coordenadas y altitudes de Cebollapampa a la Cumbre.

---

## 3. ESPECIFICACIÓN DEL CONTROLADOR EN TERCERA PERSONA (PC ONLY)
Desacoplar completamente el renderizado de `window.scrollY` y reemplazarlo por un Game Loop continuo (`requestAnimationFrame`):

### A. Entradas de Control (Input Mapping)
- `W / A / S / D`: Movimiento del montañista en 8 direcciones, relativo al ángulo actual de la cámara.
- `Shift Izquierdo (Hold)`: Paso rápido / Trote ligero (duplica la velocidad, triplica el gasto de estamina).
- `Espacio`: Paso alto / superar rocas o sortear grietas angostas.
- `Ratón (Mouse Look / Pointer Lock)`:
  - Movimiento horizontal del ratón: Orbita la cámara 360° alrededor del personaje.
  - Movimiento vertical del ratón: Ajusta el cabeceo (pitch) entre -15° y 60° con amortiguación suave (`lerp`).
  - La cámara sigue al personaje a una distancia de 4 a 6 metros ligeramente por encima del hombro derecho.

### B. Física y Fijación al Terreno (Terrain Snapping sin colisionadores pesados)
- En cada frame, calcular la posición de los pies del personaje evaluando instantáneamente:
  ```javascript
  const playerY = H(player.position.x, player.position.z);
  player.position.y = playerY;
  ```
- **Cálculo de Pendiente Local:** Evaluar la diferencia de elevación hacia el vector de avance:
  ```javascript
  const slope = (H(nextX, nextZ) - currentY) / stepDistance;
  ```
- Si la pendiente es ascendente: reducir velocidad proporcionalmente y multiplicar el drenaje de estamina.
- Si la pendiente supera los 60° y no se tiene el piolet equipado en hielo: resbalón hacia atrás.

### C. Avatar del Montañista y Linterna Frontal
- Integrar un avatar 3D estilizado que rote suavemente hacia la dirección de avance.
- Acoplar una `SpotLight` (linterna frontal) en la cabeza del avatar, orientada hacia el punto focal de la cámara con halo volumétrico atenuado según la distancia.

---

## 4. SISTEMAS DE SUPERVIVENCIA Y FISIOLOGÍA ANDINA

### A. Estamina (0 - 100%)
- Se agota al caminar en subida, correr (`Shift`) o trepar.
- Se recupera deteniéndose o caminando a paso lento y constante (*rest-step*).
- Si llega a 0%: el personaje se detiene jadeando y no puede correr hasta recuperar al menos el 25%.

### B. Altitud y Oxígeno / Soroche
- La altitud actual se calcula directamente desde la posición $Y$ del personaje, mapeada en el rango real (3,900 m a 5,752 m).
- Por encima de los 5,000 m: la tasa de recuperación de estamina se reduce en un 40%.
- Si el personaje agota su estamina por encima de 5,200 m: se activa el efecto de **Soroche** (viñeteado negro de visión de túnel en pantalla y latidos de corazón audibles).

### C. Termorregulación y Capas de Ropa
- El juego comienza en la madrugada (01:30 AM) con temperaturas bajo cero (-5°C a -12°C).
- **Mecánica de Sudoración vs. Frío:**
  - Si el jugador sube una pendiente fuerte abrigado con la chaqueta pesada de plumas: la temperatura corporal sube y comienza a **sudar**.
  - Si se detiene con ropa húmeda o ingresa al ventoso Collado Pisco-Huandoy, el sudor se enfría y la barra de temperatura cae en picada (riesgo de hipotermia).
- Tecla `C`: Permite alternar entre **Chaqueta Cortavientos** (protege del viento en aristas), **Plumífero** (máximo abrigo estático) o **Ropa Ligera** (evita sudar en subidas intensas).

### D. Gestión de Inventario y Peso de la Mochila ($kg$)
- La mochila tiene un peso dinámico calculado a partir de los objetos cargados en `pisco-waypoints.json`:
  $$\text{Peso Total} = \sum \text{peso de objetos equipados}$$
- A mayor peso: mayor consumo basal de estamina y mayor inercia.
- **Teclas de acción rápida para consumibles:**
  - Tecla `T`: Beber un sorbo del **Termo de mate de coca caliente** (restaura temperatura corporal +15% e hidrata, aliviando el soroche).
  - Tecla `E`: Consumir **Snack energético** (recupera +25% de estamina de inmediato).
  - Tecla `B`: Equipar / Guardar **Bastones de trekking** (activos: reducen el impacto en rodillas y el gasto de estamina en un 20% y evitan resbalones en morrena; guardados: dejan manos libres para cadenas y trepadas).

---

## 5. RUTA OFICIAL, CHECKPOINTS Y COMPAÑERO GUÍA BOT

### A. Checkpoints Clave del Nevado Pisco
El simulador debe recrear las 5 zonas críticas del trayecto:
1. **Cebollapampa (3,900 m):** Valle verde, aclimatación e inicio de aproximación.
2. **Refugio Perú / Campo Base (4,680 m):** Salida a la 01:30 AM bajo cielo estrellado. Checkpoint para armar la mochila ligera de ataque.
3. **La Morrena del Pisco y Paso de Cadenas (4,850 m - 4,920 m):** Bloques caóticos de granito. El jugador debe guardar bastones (`Tecla B`) para destrepar el resalte de cadenas fijas.
4. **Borde del Glaciar (5,050 m):** Punto de parada técnica obligatoria para colocarse crampones, empuñar piolet y encordarse.
5. **Collado Pisco - Huandoy (5,300 m):** Ráfagas de viento blanco extremo entre las paredes del Huandoy Este. Exige chaqueta cortavientos (`Tecla C`).
6. **El Crux / Rimaia (5,650 m):** Resalte de hielo de 3 metros que exige tracción con piolet y puntas frontales de crampones.
7. **Cumbre Pisco Oeste (5,752 m):** Domo cumbrero con vista panorámica 360° al amanecer sobre el Huascarán, Chopicalqui y Artesonraju.

### B. Guía Andino (NPC Bot)
- Un guía certificado (AGMP) modelado en 3D camina a la cabeza de la cordada marcando el ritmo de paso óptimo.
- Muestra mensajes contextuales en pantalla tipo radio/subtítulo:
  - *"Pisa con calma en la morrena, la roca está suelta."*
  - *"Guarden los bastones, manos a las cadenas."*
  - *"El viento del Huandoy arrecia en el collado, ¡pónganse la cortavientos!"*
  - *"Respiren con el paso: inhala un paso, exhala el otro."*

---

## 6. PAISAJE SONORO DINÁMICO (WEB AUDIO API)
Implementar audio espacial procedural mediante `AudioContext`:
1. **Pasos adaptativos según suelo:**
   - Morrena: Sonido de impacto y gravilla triturada sobre granito.
   - Glaciar inferior: Crujido sordo de nieve dura.
   - Glaciar superior / Hielo vivo: Tintineo y crujido metálico de puntas de crampones penetrando hielo.
2. **Respiración reactiva:**
   - Respiración rítmica y tranquila en descanso.
   - Jadeo acelerado cuando la estamina < 30% o en altitudes > 5,200 m.
3. **Ambiente andino:**
   - Sintetizador de ruido blanco/filtrado para el silbido del viento andino, con volumen proporcional a la altitud y la exposición en aristas.
   - Ecos y retumbos graves de bajas frecuencias disparados aleatoriamente cada 2–4 minutos, simulando caídas de seracs y avalanchas distantes en montañas vecinas.

---

## 7. INTERFAZ DE USUARIO (HUD DE PC)
Superponer un HUD técnico de diseño alpino limpio:
- **Esquina superior derecha:**
  - Altímetro digital en tiempo real: `5 120 m.s.n.m.`
  - Reloj de expedición: `03:45 AM`
  - Temperatura exterior: `-8 °C`
- **Esquina superior izquierda:**
  - Estado del guía bot y mensajes de radio/aviso.
  - Indicador de Checkpoint actual y distancia a la cumbre.
- **Esquina inferior izquierda (Barras de Supervivencia):**
  - Barra de Estamina (Verde/Ámbar).
  - Barra de Oxígeno / Saturación (Cian).
  - Barra de Temperatura Corporal (Blanco/Azul hielo).
- **Esquina inferior derecha (Panel de Equipamiento e Inventario):**
  - Iconos de estado: `[B] Bastones: Activos`, `[C] Chaqueta: Cortavientos`, `[T] Termo: 3/4`, `[E] Snacks: 4`.
  - Peso total de la mochila: `5.4 kg`.

---

## 8. CRITERIOS DE ACEPTACIÓN
1. El movimiento en PC mediante `WASD` y el control de cámara con el ratón deben responder fluidamente a 60 FPS sin tirones.
2. El personaje nunca debe atravesar el suelo ni flotar; el *snapping* con `H(x, z)` debe ser instantáneo.
3. El ciclo de luz debe transicionar dinámicamente desde la noche cerrada estrellada (01:30 AM) hasta el amanecer dorado en la cumbre (06:30 AM).
4. El consumo de consumibles (`T` y `E`), el guardado de bastones (`B`) y el cambio de ropa (`C`) deben actualizar instantáneamente los valores del HUD y la física del personaje.
5. Al alcanzar la cumbre a 5,752 m, la cámara debe abrirse en un paneo cinematográfico de 360° mostrando los nevados vecinos y desplegando el panel de victoria con estadísticas de expedición.
