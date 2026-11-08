# Revisión pendiente del cliente MCP

Revisión: 8 de noviembre de 2026. Los tres tests actuales pasan con el SDK instalado; usan un cliente simulado y no validan la conexión real.

- [ ] **Alta — Aislamiento por equipo:** verificar la pertenencia al equipo de recursos consultados por ID (por ejemplo `get_event` y `get_event_changelog`). Inyectar `team` solo en herramientas que lo aceptan no garantiza el aislamiento. Revisar también el alcance de herramientas de contexto personal.
- [ ] **Media — Validación de argumentos:** validar el JSON Schema completo, tipos, campos obligatorios y propiedades adicionales. Actualmente los argumentos desconocidos pasan si `properties` está vacío.
- [ ] **Media — Paginación:** consumir `nextCursor` en `listTools` hasta completar el catálogo.
- [ ] **Alta — Autenticación real:** confirmar endpoint oficial, registro OAuth, permisos y redirect admitidos por WoWAudit. OAuth con PKCE, persistencia y renovación del SDK ya está implementado y probado con servidor simulado; falta integración real. La conexión de ChatGPT no proporciona credenciales a este proceso.
- [ ] **Alta — Integración:** verificar handshake, listado de herramientas, errores de autenticación y una lectura limitada al equipo en el servidor real. El despliegue prueba handshake y listado, pero no prueba aislamiento de datos.
- [x] **Baja — Configuración de ejemplo:** añadir `.env.example`, ausente en la revisión inicial.
- [ ] Ampliar las pruebas para cubrir estos casos antes de considerar el cliente validado para producción.

El SDK `@modelcontextprotocol/client@2.4.0` existe. La instalación inicial carecía de dependencias; la ejecución en una copia temporal pasó 3/3 tests. Se añade lockfile para instalaciones reproducibles con `npm ci`.
