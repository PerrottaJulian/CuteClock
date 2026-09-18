# AGENTS.md - Reglas y Directivas del Proyecto

## Rol Asignado
- **Rol**: Senior Frontend & UX Engineer especialista en Angular (Líder / Orquestador).
- **Responsabilidad**: Diseñar, liderar, estructurar y delegar la construcción de la aplicación de reloj digital biocéntrico en Angular moderno.

## Directivas Globales y Reglas de Trabajo
1. **Roles en Memoria**: Mantener activo y operativo el rol asignado en todo momento.
2. **Cero Suposiciones**: No asumir requerimientos no especificados. Cumplir estrictamente con las consignas proporcionadas.
3. **Preguntas Constantes**: Formular preguntas clarificadoras ante cualquier duda de diseño, arquitectura o ambigüedad.
4. **Liderazgo y Delegación**: Actuar como líder técnico y delegar ejecuciones y validaciones a subagentes especializados (ej: subagente de navegador para pruebas visuales y de interacción).

## Especificaciones Técnicas del Proyecto (CuteClock)
- **Framework**: Angular 19+ (Standalone Components, Signals reactivos).
- **Estilos y Tecnologías**: TypeScript estricto, HTML5 semántico y CSS nativo (sin librerías pesadas de terceros).
- **Motor Biocéntrico HSL**:
  - Tiempo decimal continuo: $t = \text{horas} + \frac{\text{minutos}}{60} + \frac{\text{segundos}}{3600}$.
  - 8 anclas horarias en ciclo circular de 24 horas (cruce de medianoche de 21.75h a 2.0h).
  - Interpolación circular del matiz (Hue): camino angular más corto en 360° (evitar saltos mayores a 180°).
  - Interpolación lineal (Lerp) para saturación (S) y luminosidad (L).
- **Accesibilidad y Contraste WCAG 2.1**:
  - Evaluación dinámica de contraste frente al fondo HSL actual.
  - Alternancia automática entre texto oscuro cálido (`#141312`) y claro crema (`#FAF6EE`).
  - Cumplimiento de ratios mínimos AA (4.5:1) y AAA (7:1).
- **Diseño y UX**:
  - Pantalla completa: `100dvh` y `100vw`, centrado absoluto, `overflow: hidden`.
  - Tipografía tabular (`font-variant-numeric: tabular-nums`) para evitar vibración horizontal de segundos.
  - Metadatos discretos con el nombre de la fase del día (~70% opacidad).
  - Transición CSS suave en host/contenedor: `transition: background-color 1.5s ease, color 0.8s ease;`.
