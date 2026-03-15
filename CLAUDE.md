# Instrucciones para Claude

## Deploy
- Cada vez que se hacen cambios, hay que hacer build del frontend (`cd musa_frontend && npx vite build`) y commitear el `musa_backend/src/dist/` junto con los cambios.
- Render deploya automáticamente cuando se mergea a `main`.
- Siempre crear PR con `gh pr create` y mergear con `gh pr merge --merge` a `main` para que Render haga deploy. No esperar al usuario para hacer esto.

## Versionado
- La versión se muestra en el Sidebar: `musa_frontend/src/components/layout/Sidebar.jsx` línea ~101.
- Cada vez que se hace un cambio, incrementar la versión en +1 (ej: v1.25 → v1.26 → v1.27).
- Incluir el bump de versión en el mismo commit del build.
- Después de deployar, SIEMPRE decirle al usuario cuál es la versión deployada para que pueda verificar que el caché se limpió correctamente mirando el sidebar.
