import logo from '../assets/musa.jpg';
import s from './Login.module.css';

export default function Login({ form, setForm, error, onSubmit }) {
  return (
    <div className={s.container}>
      <form className={s.card} onSubmit={onSubmit}>
        <img src={logo} alt="MUSA" className={s.logo} />
        <h1 className={s.title}>MUSA</h1>
        <p className={s.subtitle}>Gestion de Vinoteca</p>
        {error && <div className={s.error}>{error}</div>}
        <div className={s.group}>
          <label>Usuario</label>
          <input
            type="text"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder="Ingresa tu usuario"
            autoFocus
          />
        </div>
        <div className={s.group}>
          <label>Contrasena</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Ingresa tu contrasena"
          />
        </div>
        <button type="submit" className={s.btn}>Ingresar</button>
      </form>
    </div>
  );
}
