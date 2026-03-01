# MUSA - Guia de Instalacion y Configuracion

## 1. Requisitos previos

- **Node.js** (v18 o superior) — https://nodejs.org
- **Git** — https://git-scm.com
- Conexion a internet (para MongoDB Atlas)

---

## 2. Instalar dependencias del proyecto

Abri una terminal en la carpeta del proyecto y ejecuta:

```bash
cd musa_backend
npm install

cd ../musa_frontend
npm install
```

---

## 3. Archivo .env (backend)

El archivo `musa_backend/.env` debe tener estas variables:

```
MONGO_URI=mongodb+srv://...          # URI de MongoDB Atlas
OPENAI_API_KEY=sk-proj-...           # API key de OpenAI (para descripciones IA)
MP_ACCESS_TOKEN=APP_USR-...          # Token de Mercado Pago
FALLBACK_AUTH=1                      # 1 = login sin validacion estricta
```

---

## 4. Impresoras

Ambas impresoras se imprimen desde el **navegador** usando JSPrintManager (JSPM). Esto significa que funcionan igual desde local o desde un servidor remoto.

### 4.1 HPRT TP806L (tickets / facturas)

1. **Instalar el driver**: Descargar desde https://www.hprt.com/DownLoads (modelo TP806L)
2. **Conectar la impresora** por USB a la PC donde abris MUSA
3. **Verificar que Windows la reconoce**: `Configuracion > Dispositivos > Impresoras`
4. **Instalar JSPrintManager Client App** (ver seccion 4.3)
5. **Imprimir pagina de prueba** desde Windows

### 4.2 Godex GE300 (etiquetas de codigo de barras)

1. **Instalar el driver**: Descargar desde https://www.godexprinters.com/downloads (modelo GE300)
2. **Conectar la impresora** por USB
3. **Verificar en Windows** que aparece en la lista de impresoras
4. **Instalar JSPrintManager Client App** (ver seccion 4.3)

### 4.3 JSPrintManager (OBLIGATORIO para imprimir)

JSPrintManager es una app que corre en segundo plano y permite imprimir desde el navegador web.

1. Descargar desde https://www.neodynamic.com/downloads/jspm/
2. Instalar y ejecutar
3. Aparece un icono en la bandeja del sistema (abajo a la derecha)
4. **Debe estar corriendo cada vez que quieras imprimir**

> **Importante**: JSPM corre en el navegador del usuario. Las impresoras deben estar conectadas a la PC donde abris MUSA. Esto funciona igual si el servidor esta en la nube, en otra PC de la red, o en la misma PC.

---

## 5. Ejecutar el sistema

### Opcion A: Local (desarrollo)

Abri **dos terminales**:

```bash
# Terminal 1 - Backend
cd musa_backend
node src/index.js

# Terminal 2 - Frontend
cd musa_frontend
npm run dev -- --host
```

Backend en puerto **5000**, frontend en **5173**.

### Opcion B: Local (produccion)

```bash
cd musa_frontend
npm run build

cd ../musa_backend
node src/index.js
```

Todo se accede desde `http://localhost:5000`.

### Opcion C: Servidor remoto (VPS / nube)

1. Subir el proyecto al servidor (git clone)
2. Instalar Node.js en el servidor
3. `npm install` en backend y frontend
4. `npm run build` en el frontend
5. `node src/index.js` en el backend (o usar pm2 para que no se caiga)
6. Configurar dominio o usar la IP publica del servidor
7. Acceder desde cualquier dispositivo usando el dominio o IP

> **Las impresoras funcionan igual en servidor remoto** porque JSPM imprime desde el navegador del usuario, no desde el servidor.

---

## 6. Acceder desde el celular

1. **Misma red WiFi** que la PC/servidor (o servidor con IP publica)
2. **IP de la PC**: en PowerShell ejecutar `ipconfig` y buscar `IPv4 Address`
3. **Abrir en el celular**: `http://[IP]:5000`
4. **Si no conecta**: revisar Firewall de Windows (regla TCP para puerto 5000)
5. **Agregar a pantalla de inicio**: menu del navegador > "Agregar a pantalla de inicio"

---

## 7. Resumen rapido

| Que | Como |
|---|---|
| Tickets (HPRT TP806L) | Driver Windows + JSPrintManager corriendo |
| Etiquetas (Godex GE300) | Driver Windows + JSPrintManager corriendo |
| Backend | `node src/index.js` en `musa_backend/` |
| Frontend prod | `npm run build` y acceder por puerto 5000 |
| Celular | Misma WiFi + IP + puerto 5000 |
| Servidor remoto | Mismo proceso, IP publica o dominio |

---

## 8. Problemas comunes

| Problema | Solucion |
|---|---|
| No imprime tickets/etiquetas | Verificar que JSPrintManager esta corriendo (icono en bandeja) |
| No detecta impresoras | Verificar driver instalado + impresora conectada por USB |
| No conecta desde el celu | Verificar firewall, misma red, IP correcta |
| Error de MongoDB | Verificar `MONGO_URI` en `.env` y conexion a internet |

---

> Esta guia tambien esta disponible dentro de la app en **Admin > Setup**
