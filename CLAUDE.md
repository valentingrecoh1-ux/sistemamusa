# Instrucciones para Claude

## Deploy
- Cada vez que se hacen cambios, hay que hacer build del frontend (`cd musa_frontend && npx vite build`) y commitear el `musa_backend/src/dist/` junto con los cambios.
- Render deploya automáticamente cuando se mergea a `main`.
- Siempre crear PR y mergear a `main` para que Render haga deploy.

## Versionado
- La versión se muestra en el Sidebar: `musa_frontend/src/components/layout/Sidebar.jsx` línea ~101.
- Cada vez que se hace un cambio, incrementar la versión en +1 (ej: v1.25 → v1.26 → v1.27).
- Incluir el bump de versión en el mismo commit del build.
