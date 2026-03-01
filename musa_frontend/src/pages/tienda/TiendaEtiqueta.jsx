import { useState, useEffect } from 'react';
import { generarEtiqueta, fetchConfig } from '../../lib/tiendaApi';
import s from './TiendaEtiqueta.module.css';

const OCASIONES = [
  { value: 'cumpleanos', label: 'Cumpleaños', icon: 'bi-balloon' },
  { value: 'aniversario', label: 'Aniversario', icon: 'bi-heart' },
  { value: 'navidad', label: 'Navidad', icon: 'bi-snow2' },
  { value: 'casamiento', label: 'Casamiento', icon: 'bi-gem' },
  { value: 'dia-del-padre', label: 'Dia del Padre', icon: 'bi-person-heart' },
  { value: 'dia-de-la-madre', label: 'Dia de la Madre', icon: 'bi-flower1' },
  { value: 'agradecimiento', label: 'Agradecimiento', icon: 'bi-emoji-smile' },
  { value: 'otro', label: 'Otra ocasion', icon: 'bi-three-dots' },
];

// Sugerencias de dedicatoria por ocasion
const SUGERENCIAS = {
  cumpleanos: [
    'Unico e irrepetible, como este vino y como vos',
    'Que cada copa sea un brindis por un año mas de vida',
    'Feliz vuelta al sol! Disfrutalo sorbo a sorbo',
    'Los mejores años se celebran con el mejor vino',
  ],
  aniversario: [
    'Por cada momento juntos y por todos los que vendran',
    'El amor, como el buen vino, mejora con el tiempo',
    'Brindemos por nosotros, hoy y siempre',
    'Cada año juntos tiene un sabor mas especial',
  ],
  navidad: [
    'Que esta Navidad desborde de alegria y buenos vinos',
    'Felices fiestas! Brindemos por lo que viene',
    'Un vino tan especial como la noche mas magica del año',
    'Salud, amor y muchas copas compartidas',
  ],
  casamiento: [
    'Por una vida juntos tan extraordinaria como este vino',
    'Que el amor los acompañe en cada brindis',
    'Felicidades! El mejor maridaje es el amor',
    'Dos almas, una copa, infinitos momentos',
  ],
  'dia-del-padre': [
    'Para el mejor papa, el mejor vino',
    'Gracias por enseñarme a disfrutar de las cosas buenas',
    'Papa, vos sos mi gran reserva',
    'Con todo mi cariño para quien me enseño a brindar',
  ],
  'dia-de-la-madre': [
    'Para la mujer mas increible, un vino a su altura',
    'Mama, cada dia con vos es un motivo para brindar',
    'Tan unica como esta botella, tan especial como vos',
    'Gracias por ser mi guia, mi fuerza y mi inspiracion',
  ],
  agradecimiento: [
    'Gracias por estar siempre, esto es para vos',
    'Las mejores personas merecen el mejor vino',
    'Un brindis por tu generosidad y tu corazon',
    'Porque hay cosas que solo se dicen con un buen vino',
  ],
  otro: [
    'Un momento especial merece un vino especial',
    'Brindemos por la vida y sus pequeños grandes momentos',
    'Para disfrutar sin prisa, con buena compañia',
    'Cada copa es una celebracion',
  ],
};

const ESTILOS_VISUALES = [
  { value: 'clasico', label: 'Clasico', desc: 'Elegante y tradicional' },
  { value: 'moderno', label: 'Moderno', desc: 'Minimalista y limpio' },
  { value: 'artistico', label: 'Artistico', desc: 'Acuarela y bohemio' },
  { value: 'romantico', label: 'Romantico', desc: 'Flores y tonos calidos' },
  { value: 'divertido', label: 'Divertido', desc: 'Colorido y pop' },
];

const TIPOS_VINO = [
  { value: 'tinto', label: 'Tinto' },
  { value: 'blanco', label: 'Blanco' },
  { value: 'rosado', label: 'Rosado' },
  { value: 'espumante', label: 'Espumante' },
];

export default function TiendaEtiqueta() {
  const [step, setStep] = useState(0); // 0=form, 1=generating, 2=preview
  const [form, setForm] = useState({
    ocasion: '',
    destinatario: '',
    mensaje: '',
    estiloVino: 'tinto',
    estiloVisual: 'clasico',
    conImagen: false,
    imagenDescripcion: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState({});

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
  }, []);

  const sugerencias = SUGERENCIAS[form.ocasion] || [];

  const handleGenerar = async (e) => {
    e.preventDefault();
    if (!form.ocasion || !form.destinatario || !form.mensaje) {
      setError('Completa todos los campos obligatorios');
      return;
    }
    setError('');
    setLoading(true);
    setStep(1);

    try {
      const data = await generarEtiqueta(form);
      if (data.error) {
        setError(data.error);
        setStep(0);
      } else {
        setResult(data);
        setStep(2);
      }
    } catch (err) {
      console.error('Error etiqueta:', err);
      setError(`Error: ${err.message || err}`);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerar = () => {
    setResult(null);
    setStep(0);
  };

  const handleDescargar = () => {
    if (result?.ilustracionUrl) {
      const link = document.createElement('a');
      link.href = result.ilustracionUrl;
      link.download = `ilustracion-${result.labelData?.titulo || 'musa'}.png`;
      link.click();
    }
  };

  const handleWhatsApp = () => {
    const phone = config.whatsappNumero?.replace(/\D/g, '') || '';
    const text = encodeURIComponent(
      `Hola! Quiero imprimir una etiqueta personalizada que cree en la web:\n` +
      `Titulo: ${result?.labelData?.titulo}\n` +
      `Para: ${form.destinatario}\n` +
      `Ocasion: ${form.ocasion.replace(/-/g, ' ')}\n` +
      `Pueden ayudarme con la impresion?`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <div className={s.etiqueta}>
      {/* Hero */}
      <section className={s.hero}>
        <div className={s.heroIcon}><i className="bi bi-brush" /></div>
        <h1 className={s.heroTitle}>Crea tu Etiqueta Personalizada</h1>
        <p className={s.heroSub}>
          Diseña una etiqueta unica con inteligencia artificial para regalar un vino inolvidable
        </p>
      </section>

      {/* Step 0: Form */}
      {step === 0 && (
        <section className={s.formSection}>
          <form onSubmit={handleGenerar} className={s.form}>
            {/* Ocasion */}
            <div className={s.fieldGroup}>
              <label className={s.fieldLabel}>Para que ocasion? *</label>
              <div className={s.ocasionGrid}>
                {OCASIONES.map((oc) => (
                  <button
                    key={oc.value}
                    type="button"
                    className={`${s.ocasionCard} ${form.ocasion === oc.value ? s.ocasionActive : ''}`}
                    onClick={() => setForm({ ...form, ocasion: oc.value, mensaje: '' })}
                  >
                    <i className={`bi ${oc.icon}`} />
                    <span>{oc.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Destinatario */}
            <div className={s.field}>
              <label>Para quien es? *</label>
              <input
                type="text"
                value={form.destinatario}
                onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
                placeholder="Ej: Maria, Papa, Los novios..."
              />
            </div>

            {/* Mensaje con sugerencias */}
            <div className={s.field}>
              <label>Dedicatoria *</label>
              {sugerencias.length > 0 && (
                <div className={s.sugerencias}>
                  <span className={s.sugerenciasLabel}>Inspirate:</span>
                  <div className={s.sugerenciasGrid}>
                    {sugerencias.map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`${s.sugerenciaChip} ${form.mensaje === sug ? s.sugerenciaActive : ''}`}
                        onClick={() => setForm({ ...form, mensaje: sug })}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <textarea
                value={form.mensaje}
                onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
                placeholder="Escribi tu dedicatoria o elegi una sugerencia arriba..."
                rows={3}
              />
            </div>

            {/* Tipo de vino y estilo */}
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label>Tipo de vino</label>
                <select
                  value={form.estiloVino}
                  onChange={(e) => setForm({ ...form, estiloVino: e.target.value })}
                >
                  {TIPOS_VINO.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Estilo Visual */}
            <div className={s.fieldGroup}>
              <label className={s.fieldLabel}>Estilo de diseño</label>
              <div className={s.estiloGrid}>
                {ESTILOS_VISUALES.map((ev) => (
                  <button
                    key={ev.value}
                    type="button"
                    className={`${s.estiloCard} ${form.estiloVisual === ev.value ? s.estiloActive : ''}`}
                    onClick={() => setForm({ ...form, estiloVisual: ev.value })}
                  >
                    <span className={s.estiloLabel}>{ev.label}</span>
                    <span className={s.estiloDesc}>{ev.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Imagen opcional (deshabilitado por ahora) */}

            {error && <div className={s.error}><i className="bi bi-exclamation-circle" /> {error}</div>}

            <button type="submit" className={s.generateBtn} disabled={loading}>
              <i className="bi bi-magic" /> Generar Etiqueta con IA
            </button>
          </form>
        </section>
      )}

      {/* Step 1: Generating */}
      {step === 1 && (
        <section className={s.generatingSection}>
          <div className={s.generatingAnim}>
            <div className={s.spinner} />
            <h3>Creando tu etiqueta...</h3>
            <p>La inteligencia artificial esta diseñando algo unico para vos</p>
          </div>
        </section>
      )}

      {/* Step 2: Preview */}
      {step === 2 && result && (
        <section className={s.previewSection}>
          <h2 className={s.previewTitle}>Tu Etiqueta Personalizada</h2>

          <div className={s.previewLayout}>
            <div className={s.previewCard}>
              <div className={s.fallbackLabel}>
                <div className={s.fallbackBorder}>
                  <div className={s.fallbackTitle}>{result.labelData?.titulo}</div>
                  <div className={s.fallbackDivider} />
                  <div className={s.fallbackSubtitle}>{result.labelData?.subtitulo}</div>
                  {result.ilustracionUrl && (
                    <img
                      src={result.ilustracionUrl}
                      alt="Ilustracion"
                      className={s.labelIlustracion}
                    />
                  )}
                  <div className={s.fallbackDedicatoria}>"{result.labelData?.dedicatoria}"</div>
                  <div className={s.fallbackYear}>{result.labelData?.year}</div>
                  <div className={s.fallbackDetalle}>{result.labelData?.detalle}</div>
                </div>
              </div>
            </div>

            <div className={s.previewInfo}>
              <h3 className={s.infoTitle}>{result.labelData?.titulo}</h3>
              <p className={s.infoSubtitle}>{result.labelData?.subtitulo}</p>
              <p className={s.infoDedicatoria}>"{result.labelData?.dedicatoria}"</p>
              <p className={s.infoDetalle}>{result.labelData?.detalle}</p>

              <div className={s.actions}>
                <button className={s.actionBtn} onClick={handleRegenerar}>
                  <i className="bi bi-arrow-repeat" /> Generar otra
                </button>
                {result.ilustracionUrl && (
                  <button className={s.actionBtnPrimary} onClick={handleDescargar}>
                    <i className="bi bi-download" /> Descargar ilustracion
                  </button>
                )}
                <button className={s.actionBtnWhatsApp} onClick={handleWhatsApp}>
                  <i className="bi bi-whatsapp" /> Pedir impresion
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Como Funciona */}
      <section className={s.howItWorks}>
        <h2 className={s.sectionTitle}>Como Funciona</h2>
        <div className={s.stepsGrid}>
          <div className={s.stepCard}>
            <div className={s.stepNum}>1</div>
            <div className={s.stepTitle}>Completa el formulario</div>
            <div className={s.stepDesc}>Contanos la ocasion, a quien va dirigido y tu dedicatoria</div>
          </div>
          <div className={s.stepCard}>
            <div className={s.stepNum}>2</div>
            <div className={s.stepTitle}>La IA diseña tu etiqueta</div>
            <div className={s.stepDesc}>Nuestra inteligencia artificial crea un diseño unico</div>
          </div>
          <div className={s.stepCard}>
            <div className={s.stepNum}>3</div>
            <div className={s.stepTitle}>Descarga o pedinos impresion</div>
            <div className={s.stepDesc}>Descargala o contactanos para imprimirla en tu botella</div>
          </div>
        </div>
      </section>
    </div>
  );
}
