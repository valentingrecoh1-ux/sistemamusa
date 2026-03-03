// Definicion de todos los permisos disponibles, agrupados por seccion
export const PERMISOS_DISPONIBLES = [
  {
    grupo: 'Ventas',
    permisos: [
      { key: 'vender', label: 'Realizar ventas' },
      { key: 'anular_venta', label: 'Anular ventas (nota de credito / devolucion)' },
    ],
  },
  {
    grupo: 'Caja',
    permisos: [
      { key: 'borrar_operacion', label: 'Eliminar operaciones de caja' },
      { key: 'cerrar_comisiones', label: 'Cerrar comisiones MercadoPago' },
    ],
  },
  {
    grupo: 'Inventario',
    permisos: [
      { key: 'editar_producto', label: 'Crear / editar productos' },
      { key: 'borrar_producto', label: 'Eliminar productos' },
    ],
  },
  {
    grupo: 'Compras',
    permisos: [
      { key: 'crear_oc', label: 'Crear ordenes de compra' },
      { key: 'aprobar_oc', label: 'Aprobar ordenes de compra' },
      { key: 'recibir_oc', label: 'Recibir ordenes de compra' },
      { key: 'pagar_proveedor', label: 'Registrar pagos a proveedores' },
      { key: 'editar_proveedor', label: 'Editar proveedores' },
    ],
  },
  {
    grupo: 'Eventos',
    permisos: [
      { key: 'borrar_evento', label: 'Eliminar eventos' },
    ],
  },
];

// Verifica si un usuario tiene un permiso especifico
// Admin siempre tiene todos los permisos
export function tienePermiso(usuario, permiso) {
  if (!usuario) return false;
  if (usuario.rol === 'admin') return true;
  const permisos = usuario.permisos || [];
  return permisos.includes('*') || permisos.includes(permiso);
}
