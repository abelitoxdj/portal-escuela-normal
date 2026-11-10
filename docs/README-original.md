# 🎓 Portal Académico - Sistema Web Interactivo

Una aplicación web interactiva diseñada para la gestión y consulta académica de los estudiantes. El sistema incluye navegación fluida tipo SPA, cálculo dinámico de horarios de cursada en tiempo real, buscador interactivo de materias y simulador de promedio final.

---

## 👥 Integrantes

- Abel Carrera
- Ramiro Martín
- Lucca Lazarte
- Nicolás González

---

## 🚀 Funcionalidades Principales

El archivo JavaScript principal integra lógica en el cliente para ofrecer una experiencia rápida y sin recargas de página:

- 📱 **Navegación tipo SPA (Single Page Application):** Cambio dinámico entre secciones ocultando y mostrando bloques sin recargar la página web.
- 🕒 **Calculador Dinámico de Próxima Clase:** Monitorea la hora y el día actual para informarle al alumno cuál es su próxima clase programada, si la jornada ya finalizó o si es fin de semana.
- 🔍 **Buscador de Materias en Tiempo Real:** Filtra interactivamente el catálogo de asignaturas a medida que el usuario escribe en el campo de búsqueda.
- 📊 **Simulador de Promedio Final:** Permite ingresar 3 notas parciales y calcula instantáneamente el estado de aprobación (Aprobado / Desaprobado) con alertas de validación.
- 🖨️ **Generador / Impresor de Boletín:** Integración directa con la ventana de impresión del navegador (`window.print()`).
- 🔄 **Reinicio de Vista / Cierre de Sesión:** Restablece la aplicación al estado inicial.

---

## 🛠️ Tecnologías Utilizadas

- **HTML5:** Estructuración semántica y modular.
- **CSS3 & Bootstrap 5:** Estilos responsivos, componentes de alerta y badges.
- **JavaScript (ES6+):** Manipulación del DOM, eventos dinámicos, cálculo de fechas y lógica interactiva.
- **FontAwesome:** Iconografía vectorial interactiva.
- **Git & GitHub:** Control de versiones colaborativo.

---

## 📈 Estrategias SEO Implementadas

- **Etiquetas Meta y Título:** Se incorporó la etiqueta `<meta name="description">` en el `<head>` para indicarle a los motores de búsqueda de qué trata la página (resumen en resultados), complementado con una etiqueta `<title>` clara y descriptiva.
- **Atributo ALT en imágenes:** Se utilizó el atributo `alt` en la imagen de la fachada. Los buscadores leen este texto para indexar el contenido visual, siendo además un pilar fundamental para la accesibilidad web.
- **HTML Semántico:** Se estructuró el documento utilizando etiquetas nativas (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`). Esta organización comunica la jerarquía y estructura lógica del contenido a los motores de búsqueda.
- **Jerarquía de Encabezados:** Se empleó un único `<h1>` para el título principal y se organizó el resto del contenido con subtítulos `<h2>` ordenados, facilitando el escaneo y la lectura indexada.
- **Diseño Responsive (Adaptable a móviles):** Mediante `<meta name="viewport">` y la adaptación con Bootstrap 5 (con código en CSS puro documentado/comentado), el sitio responde a cualquier resolución. Google prioriza la indexación móvil (*Mobile-First Indexing*).

---

## 💻 Detalles Técnicos del Script

| Módulo JS | Función / Evento | Descripción |
| :--- | :--- | :--- |
| **Navegación** | `DOMContentLoaded` / `click` | Alterna clases CSS (`.seccion-activa` / `.seccion-oculta`) según el atributo `href` seleccionado. |
| **Simulador** | `click` en `#btn-calcular` | Obtiene notas, valida entradas numéricas (`isNaN`) y calcula el promedio ponderado. |
| **Buscador** | `input` en `#buscador-materias` | Aplica `.includes()` sobre los nombres de las materias para ajustar su visibilidad (`display`). |
| **Reloj de Clases** | `calcularProximaClase()` | Recorre la matriz de horarios filtrando por el objeto `Date()` y se actualiza cada 60 segundos (`setInterval`). |

---

## 📅 Estructura de Horarios Cargada

La aplicación evalúa dinámicamente la grilla horaria semanal:

- **Lunes:** Programación IV (14:00 hs) \| Gestión de Desarrollo de SW (16:00 hs)
- **Martes:** Programación IV (14:00 hs) \| Legislación (16:00 hs)
- **Miércoles:** Programación IV (14:00 hs) \| Gestión de Desarrollo de SW (16:00 hs)
- **Jueves:** Metodología de Sistemas II (14:00 hs) \| Introducción al Análisis de Datos (16:00 hs)
- **Viernes:** Programación IV (14:00 hs) \| Metodología de Sistemas II (16:00 hs)