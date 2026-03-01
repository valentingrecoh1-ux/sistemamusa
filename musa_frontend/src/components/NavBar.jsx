import React from "react";
import logo from "../assets/musa.jpg";

const NavBar = ({ usuario, onLogout }) => {
  return (
    <nav className="navbar-mio">
      <div className="navbar-left">
        <div
          onClick={() => (window.location.href = "/")}
          className="navbar-logo"
        >
          <img className="logo-nav" src={logo} alt="MUSA Logo" />
        </div>
        <ul className="navbar-links navbar-ventas">
          <li>
            <a href="/">INFO</a>
          </li>
          <li>
            <a href="/carrito">CARRITO</a>
          </li>
          <li>
            <a href="/ventas">VENTAS</a>
          </li>
        </ul>
      </div>
      <div className="navbar-right">
        <ul className="navbar-links navbar-admin">
          <li>
            <a href="/inventario">INVENTARIO</a>
          </li>
          <li>
            <a href="/caja">CAJA</a>
          </li>
          <li>
            <a href="/estadisticas">ESTADISTICAS</a>
          </li>
          <li>
            <a href="/reservas">RESERVAS</a>
          </li>
          <li>
            <a href="/flujos">FLUJOS</a>
          </li>
          <li>
            <a href="/compras">COMPRAS</a>
          </li>
        </ul>
        {usuario && (
          <div className="navbar-user-section">
            <span className="navbar-user">{usuario.nombre} ({usuario.rol})</span>
            <button className="navbar-logout" onClick={onLogout}>SALIR</button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default NavBar;
