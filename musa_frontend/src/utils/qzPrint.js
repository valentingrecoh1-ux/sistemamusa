import qz from 'qz-tray';

let connected = false;
let connecting = false;

// Conectar al servicio QZ Tray local
export async function connectQZ() {
  if (connected && qz.websocket.isActive()) return true;
  if (connecting) {
    // Esperar a que termine la conexion en curso
    await new Promise((r) => setTimeout(r, 1500));
    return connected;
  }
  connecting = true;
  try {
    if (qz.websocket.isActive()) {
      connected = true;
      return true;
    }
    await qz.websocket.connect();
    connected = true;
    return true;
  } catch {
    connected = false;
    return false;
  } finally {
    connecting = false;
  }
}

// Listar impresoras instaladas
export async function listPrinters() {
  if (!await connectQZ()) return [];
  try {
    return await qz.printers.find();
  } catch {
    return [];
  }
}

// Buscar impresora por nombre (parcial)
export async function findPrinter(name) {
  if (!await connectQZ()) return null;
  try {
    return await qz.printers.find(name);
  } catch {
    return null;
  }
}

// Imprimir PDF (base64) - para tickets termicos
export async function printPDF(printerName, base64) {
  if (!await connectQZ()) return false;
  try {
    const config = qz.configs.create(printerName);
    await qz.print(config, [{
      type: 'pixel',
      format: 'pdf',
      flavor: 'base64',
      data: base64,
    }]);
    return true;
  } catch (err) {
    console.error('QZ printPDF error:', err);
    return false;
  }
}

// Imprimir comandos raw (EZPL/ZPL) - para Godex etiquetas
export async function printRaw(printerName, commands) {
  if (!await connectQZ()) return false;
  try {
    const config = qz.configs.create(printerName);
    await qz.print(config, [{
      type: 'raw',
      format: 'command',
      flavor: 'plain',
      data: commands,
    }]);
    return true;
  } catch (err) {
    console.error('QZ printRaw error:', err);
    return false;
  }
}

// Chequear si QZ Tray esta disponible (sin intentar conectar)
export function isQZAvailable() {
  return connected && qz.websocket.isActive();
}
