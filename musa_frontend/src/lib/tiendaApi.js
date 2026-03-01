import { IP } from '../main';

const BASE = () => `${IP()}/api/tienda`;

export async function fetchProductos(params = {}) {
  const url = new URL(`${BASE()}/productos`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url);
  return res.json();
}

export async function fetchProducto(id) {
  const res = await fetch(`${BASE()}/producto/${id}`);
  return res.json();
}

export async function fetchFiltros() {
  const res = await fetch(`${BASE()}/filtros`);
  return res.json();
}

export async function fetchConfig() {
  const res = await fetch(`${BASE()}/config`);
  return res.json();
}

export async function crearPedido(data) {
  const res = await fetch(`${BASE()}/pedido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchEstadoPedido(id) {
  const res = await fetch(`${BASE()}/pedido/${id}/estado`);
  return res.json();
}

export async function fetchPlanesClub() {
  const res = await fetch(`${BASE()}/club/planes`);
  return res.json();
}

export async function suscribirseClub(data) {
  const res = await fetch(`${BASE()}/club/suscribir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchResenas(productoId) {
  const res = await fetch(`${BASE()}/resenas/${productoId}`);
  return res.json();
}

export async function crearResena(data) {
  const res = await fetch(`${BASE()}/resenas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchAnalisis(productoId) {
  const res = await fetch(`${BASE()}/analisis/${productoId}`);
  return res.json();
}

export async function generarEtiqueta(data) {
  const url = `${BASE()}/etiqueta/generar`;
  console.log('[generarEtiqueta] POST', url, data);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  console.log('[generarEtiqueta] response', json);
  return json;
}
