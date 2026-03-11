const mongoose = require('mongoose');

const historialPrecioSchema = new mongoose.Schema({
    precio: { type: String },
    fecha: { type: Date, default: Date.now },
}, { _id: false });

const productSchema = new mongoose.Schema({
    codigo: { type: String, unique: true },
    bodega: { type: String },
    cepa: { type: String },
    nombre: { type: String },
    year: { type: String },
    origen: { type: String },
    venta: { type: String },
    costo: { type: Number, default: 0 },
    cantidad: { type: Number },
    posicion: { type: String },
    descripcion: { type: String },
    descripcionGenerada: { type: String },
    usarDescripcionIA: { type: Boolean, default: false },
    tipo: { type: String, enum: ["vino", "articulo", "servicio"], default: "vino" },
    foto: { type: String },
    fotos: [{ type: String }],
    fotoPrincipalIdx: { type: Number, default: 0 },
    fotoIA: { type: String },
    usarFotoIA: { type: Boolean, default: false },
    favorito: { type: Boolean },
    carrito: { type: Boolean },
    carritoCantidad: { type: Number, default: 1 },
    fecha: { type: String },
    stockMinimo: { type: Number, default: 3 },
    proveedorId: { type: mongoose.Schema.Types.ObjectId, ref: "Proveedor" },
    proveedorNombre: { type: String },
    historialPrecios: [historialPrecioSchema],
}, { timestamps: true });

productSchema.index({ cepa: 1 });
productSchema.index({ cantidad: 1 });
productSchema.index({ bodega: 1 });
productSchema.index({ origen: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;