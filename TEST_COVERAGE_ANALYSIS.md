# Test Coverage Analysis - Sistema MUSA

**Date:** 2026-03-08
**Status:** The codebase currently has **zero automated tests** — no test files, no test frameworks installed, no coverage tooling.

---

## Current State

| Metric | Value |
|--------|-------|
| Test files | 0 |
| Test frameworks installed | None |
| Test scripts in package.json | None |
| Code coverage tooling | None |
| CI/CD test pipeline | None |

The project is a full-stack wine store management system (Express + React/Vite) with ~5,300 lines in the backend entry point alone, 20 MongoDB models, 14+ API endpoints, and 38 frontend page components — all completely untested.

---

## Priority Areas for Test Coverage

### Tier 1 — Critical (Financial / Legal / Security)

These modules handle money, tax compliance, and access control. Bugs here carry the highest business risk.

| Module | File | Lines | Why It Matters |
|--------|------|-------|----------------|
| **AFIP Tax Service** | `musa_backend/src/AfipService.js` | 452 | Government invoicing compliance; errors can cause legal issues |
| **Cash Register (Caja)** | `musa_frontend/src/pages/Caja.jsx` | 1,746 | Payment processing, MercadoPago integration, receipt generation |
| **Tienda API Routes** | `musa_backend/src/routes/tiendaApi.js` | 300+ | E-commerce endpoints: orders, payments, webhooks |
| **Permission System** | `musa_frontend/src/lib/permisos.js` | 49 | Role-based access control (admin, vendedor, comprador, recepcion) |
| **User Model** | `musa_backend/src/models/usuario.js` | 21 | Authentication, password hashing, role definitions |

**Recommended tests:**
- Unit tests for AfipService (certificate handling, token management, invoice authorization)
- Integration tests for MercadoPago webhook and payment flows
- Unit tests for permission checking logic
- API integration tests for all tienda endpoints (product listing, order creation, checkout)

### Tier 2 — High Priority (Core Business Logic)

| Module | File | Lines | Why It Matters |
|--------|------|-------|----------------|
| **Sales Management** | `musa_frontend/src/pages/Ventas.jsx` | 989 | Invoice creation, credit notes, sales filtering |
| **Inventory** | `musa_frontend/src/pages/Inventario.jsx` | 903 | Stock tracking, product CRUD |
| **Shopping Cart Context** | `musa_frontend/src/context/CartContext.jsx` | 62 | Cart calculations, item management, persistence |
| **Events** | `musa_frontend/src/pages/Eventos.jsx` | 1,767 | Event budgeting, expense tracking |
| **Purchase Orders** | `musa_backend/src/models/ordenCompra.js` | 72 | Complex model with timeline, invoices, payments |
| **Tienda API Client** | `musa_frontend/src/lib/tiendaApi.js` | 87 | Frontend API abstraction for the store |

**Recommended tests:**
- Unit tests for cart calculations (add/remove items, totals, discounts)
- Model validation tests for ordenCompra, venta, pedidoWeb
- Component tests for critical user flows in Ventas and Inventario

### Tier 3 — Medium Priority (User-Facing Features)

| Module | File | Lines | Why It Matters |
|--------|------|-------|----------------|
| **Checkout Flow** | `musa_frontend/src/pages/tienda/TiendaCheckout.jsx` | — | Customer-facing purchase flow |
| **Reservations** | `musa_frontend/src/pages/Reservas.jsx` | 661 | Scheduling, time slot management |
| **Customer Management** | `musa_frontend/src/pages/Clientes.jsx` | 313 | Client records, club subscriptions |
| **Wine Tastings** | `musa_frontend/src/pages/Degustaciones.jsx` | 607 | Tasting event management |
| **Statistics** | `musa_frontend/src/pages/Estadisticas.jsx` | 583 | Revenue/sales analytics |

**Recommended tests:**
- Component tests for the checkout flow (form validation, error handling)
- Unit tests for any calculation/aggregation logic in statistics

### Tier 4 — Shared Component Library

The 16 shared components (`Button`, `Modal`, `DataTable`, `Pagination`, `DialogBox`, `GlobalSearch`, etc.) are reused throughout the app. Testing them once gives wide coverage.

**Recommended tests:**
- Snapshot or render tests for each shared component
- Interaction tests for `GlobalSearch`, `DialogBox`, `DataTable`, and `Pagination`

---

## Recommended Test Infrastructure Setup

### Backend (Express / Node.js)

```bash
# Install test dependencies
cd musa_backend
npm install --save-dev jest @types/jest supertest mongodb-memory-server
```

- **Jest** — test runner
- **Supertest** — HTTP endpoint testing
- **mongodb-memory-server** — in-memory MongoDB for isolated model/API tests

Add to `musa_backend/package.json`:
```json
{
  "scripts": {
    "test": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

Suggested directory structure:
```
musa_backend/
  src/
    __tests__/
      models/          # Model validation tests
      routes/          # API integration tests
      services/        # AfipService unit tests
```

### Frontend (React / Vite)

```bash
# Install test dependencies
cd musa_frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- **Vitest** — Vite-native test runner (fast, compatible with Jest API)
- **React Testing Library** — component testing
- **jsdom** — browser environment simulation

Add to `musa_frontend/package.json`:
```json
{
  "scripts": {
    "test": "vitest run --coverage",
    "test:watch": "vitest"
  }
}
```

Add to `vite.config.js`:
```js
export default defineConfig({
  // ...existing config
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
```

Suggested directory structure:
```
musa_frontend/
  src/
    test/
      setup.js           # Test setup (RTL matchers, etc.)
    __tests__/
      components/        # Shared component tests
      context/           # Context/hook tests
      pages/             # Page-level integration tests
      lib/               # Utility/permission tests
```

---

## Suggested Implementation Order

1. **Set up test infrastructure** (Jest + Vitest, scripts, config) — ~1 hour
2. **Backend model validation tests** (20 models) — quick wins, catch schema issues
3. **permisos.js unit tests** — small file, high impact on security
4. **CartContext unit tests** — pure logic, easy to test
5. **Tienda API integration tests** — cover the 14 e-commerce endpoints with supertest
6. **AfipService unit tests** — mock external AFIP calls, test certificate/token logic
7. **Shared component render tests** — 16 components, ensures UI doesn't break silently
8. **Caja/Ventas page tests** — hardest but most valuable; test payment and invoicing flows

---

## Summary

The codebase handles **real money** (MercadoPago payments), **government compliance** (AFIP tax invoicing), and **sensitive data** (customer info, authentication) with zero automated safety net. The highest-ROI first step is setting up the test infrastructure and writing tests for the financial/tax/auth layer, followed by API endpoint tests and shared component tests.
