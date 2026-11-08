# Despliegue en Oracle Cloud VM

El cliente es una librería y un CLI de ejecución puntual. El despliegue instala una versión y comprueba la conexión MCP; no inicia un daemon ni publica un servidor MCP. Para uso permanente será necesario definir la aplicación que consumirá esta librería.

## Preparación de la VM

Usar Linux (Oracle Linux o Ubuntu, x86_64 o ARM64) con Bash, GNU tar/coreutils (`timeout`, `mv -T`), Node.js 22 y npm accesibles desde una sesión SSH no interactiva. No basta con cargar Node desde el perfil interactivo de nvm. La VM necesita salida HTTPS hacia npm y el endpoint oficial de WoWAudit.

Crear un usuario de despliegue sin sudo y autorizar una clave SSH dedicada. Permitir SSH en la Security List/NSG de Oracle y en el firewall del sistema desde el runner. Si la VM solo tiene IP privada, usar un runner con acceso a esa red y adaptar `runs-on`; el workflow actual usa runners públicos de GitHub.

Se reutiliza el archivo existente `~/whitebird/shared/agent.env`; no se duplica ni se modifica durante el despliegue. `~` corresponde al home del usuario SSH (`ORACLE_USER`). Si el agente usa otro usuario, será necesario ajustar la ruta en `deploy/install-release.sh` y conceder acceso de lectura al usuario de despliegue.

Comprobar como usuario de despliegue, sin mostrar los secretos:

```bash
test -f "$HOME/whitebird/shared/agent.env" && test -r "$HOME/whitebird/shared/agent.env"
```

El archivo debe contener `WOWAUDIT_MCP_URL` y `WOWAUDIT_TEAM_ID=66082`, usando `.env.example` como referencia. `WOWAUDIT_MCP_TOKEN` ya no se utiliza; si el agente lo necesita para otra integración puede conservarlo. Las demás variables del agente también se cargan en el proceso Node.

Los tokens OAuth y el registro del cliente se guardan aparte en `~/whitebird/shared/wowaudit-oauth.json`, con permisos 0600. No duplicar esos tokens en `agent.env` ni en secrets de GitHub. `WOWAUDIT_OAUTH_STORE` permite elegir otra ruta absoluta; no usar `~` literal en el `.env`. El archivo es texto plano y debe protegerse junto con los backups. No ejecutar simultáneamente varios procesos que renueven la misma sesión.

## Login OAuth inicial

Antes del primer despliegue hay que autorizar el cliente desde la VM. Como todavía no existe una versión activa, copiar o clonar este repositorio en una carpeta de preparación del usuario de despliegue y ejecutar allí `npm ci --ignore-scripts --no-audit --no-fund`.

Desde tu ordenador, abrir una sesión SSH con túnel hacia el callback local de la VM:

```bash
ssh -L 8787:127.0.0.1:8787 USUARIO@HOST
```

En esa sesión, desde la carpeta de preparación (o `~/whitebird-wowaudit-mcp/current` para renovar una autorización):

```bash
node --env-file="$HOME/whitebird/shared/agent.env" src/login.js
```

Abrir en el navegador de tu ordenador la URL que muestra el comando y autorizar en WoWAudit. El callback escucha solo en `127.0.0.1:8787` y llega a la VM por el túnel; no abrir ese puerto en Oracle. El login expira a los cinco minutos. Se comprueba `state`, se usa PKCE y el SDK verifica el issuer antes de intercambiar el código. No compartir la URL de autorización ni el callback.

El SDK descubre el servidor OAuth y registra el cliente dinámicamente si WoWAudit lo permite. Si exige un cliente previamente registrado, configurar en `agent.env` `WOWAUDIT_OAUTH_CLIENT_ID`, `WOWAUDIT_OAUTH_ISSUER` y, solo si corresponde al registro, `WOWAUDIT_OAUTH_CLIENT_SECRET`. Registrar exactamente `http://127.0.0.1:8787/callback` como redirect. No se ha podido consultar la página oficial de configuración: endpoint, scopes y política de registro deben verificarse con WoWAudit; no se presupone soporte de client credentials.

Después del login, ejecutar el despliegue manual. Las conexiones normales usan la sesión persistida y el SDK renueva tokens ante un rechazo de autenticación. Si falta el refresh token o se revoca la sesión, repetir el login; GitHub Actions falla sin intentar un login interactivo. El login debe realizarse con el mismo usuario, endpoint, redirect y ruta de almacenamiento que el despliegue.

## Configuración de GitHub

Crear el environment `oracle-production`, limitar sus ramas de despliegue a `main` y configurar estos secrets:

| Secret | Valor |
| --- | --- |
| `ORACLE_HOST` | IP pública IPv4 o nombre DNS de la VM |
| `ORACLE_USER` | Usuario SSH de despliegue |
| `ORACLE_SSH_PRIVATE_KEY` | Clave privada dedicada, sin passphrase |
| `ORACLE_SSH_KNOWN_HOSTS` | Entrada conocida de la clave pública SSH del servidor, verificada mediante la consola de Oracle u otro canal fiable |

Variable opcional del environment: `ORACLE_SSH_PORT` (22 por defecto). Para un puerto distinto, la entrada known_hosts debe usar `[host]:puerto`. No obtener y confiar ciegamente en la clave del servidor durante el workflow.

## Ejecución y comprobación

Subir los cambios al repositorio. Los pull requests y pushes a `main` ejecutan las pruebas. En Actions, seleccionar **Validate and deploy to Oracle VM → Run workflow → main** para desplegar manualmente.

Se empaqueta el código del commit seleccionado, se transfiere por SSH y se ejecuta `npm ci`, los tests y una comprobación real de conexión/listado (máximo 90 segundos). Solo entonces se cambia atómicamente `~/whitebird-wowaudit-mcp/current`. Si falla antes, la versión activa se conserva. La configuración permanece en `~/whitebird/shared/agent.env` y no se incluye en los paquetes.

La autorización OAuth necesita permiso para listar herramientas. El chequeo no ejecuta consultas de roster ni certifica los puntos pendientes de `REVISION-MCP.md`. Las salidas del servidor se ocultan en Actions; si falla, diagnosticar en una sesión privada de la VM.

Uso después del despliegue:

```bash
cd "$HOME/whitebird-wowaudit-mcp/current"
node --env-file="$HOME/whitebird/shared/agent.env" src/cli.js
```

## Volver a una versión anterior

Las versiones anteriores y los intentos fallidos se conservan en `releases`; revisar y eliminar manualmente los que ya no sean necesarios. Para volver a una versión validada, como usuario de despliegue:

```bash
cd "$HOME/whitebird-wowaudit-mcp"
ln -s "$PWD/releases/ID_DE_VERSION_ANTERIOR" .rollback
mv -Tf .rollback current
```

Esto cambia la versión usada en futuras ejecuciones; no reinicia procesos consumidores que ya estuvieran en marcha.

Referencias: [GitHub environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments), [setup-node](https://github.com/actions/setup-node).

Referencia OAuth: [guía oficial del SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/oauth.md).
