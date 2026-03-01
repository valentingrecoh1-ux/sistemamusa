import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import s from './Layout.module.css';

export default function Layout({ usuario, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={s.layout}>
      <Sidebar
        usuario={usuario}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className={s.main}>
        <Header onToggleMobile={() => setMobileOpen(o => !o)} usuario={usuario} />
        <div className={s.content}>
          {children}
        </div>
      </div>
    </div>
  );
}
