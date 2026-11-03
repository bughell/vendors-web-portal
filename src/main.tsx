import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { drafts, saveDraft, removeDraft, type Draft, type Fields } from './storage';
import './styles.css';

const paths: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  plus: 'M12 5v14M5 12h14',
  document: 'M14 2H5v20h14V7zM14 2v6h5M8 13h8M8 17h5',
  upload: 'M12 16V3M7 8l5-5 5 5M4 16v5h16v-5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12l4 4L19 6',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
  close: 'M6 6l12 12M6 18L18 6',
  folder: 'M3 6h7l2 3h9v12H3zM3 9V4h7l2 2h7v3',
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
const initialFields = (): Fields => ({ company: '', inn: '', account: '', bik: '', contract: '',
  actNumber: '', actDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date()),
  description: '', amount: '', vat: 'Без НДС' });
const money = (value: string) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value) || 0);
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

function App() {
  const [view, setView] = useState<'new' | 'drafts'>('new');
  const [fields, setFields] = useState<Fields>(initialFields);
  const [files, setFiles] = useState<File[]>([]);
  const [saved, setSaved] = useState<Draft[]>([]);
  const [id, setId] = useState<string>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  useEffect(() => { drafts().then(setSaved).catch(() => setError('Не удалось прочитать черновики. Проверьте доступ к хранилищу браузера.')); }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  useEffect(() => { document.title = `${view === 'new' ? 'Заявка на оплату' : 'Мои черновики'} — Портал подрядчика`; }, [view]);
  function change(key: keyof Fields, value: string) {
    dirty.current = true; setNotice(''); setFields(old => ({ ...old, [key]: value }));
  }
  function startNew() {
    if (dirty.current && !window.confirm('Начать новую заявку? Несохранённые изменения будут потеряны.')) return;
    setFields(initialFields()); setFiles([]); setId(undefined); setNotice(''); setError('');
    dirty.current = false; setView('new');
  }
  function openDraft(draft: Draft) {
    if (dirty.current && !window.confirm('Открыть черновик? Несохранённые изменения будут потеряны.')) return;
    setFields(draft.fields); setFiles(draft.files); setId(draft.id); setNotice(''); setError('');
    dirty.current = false; setView('new');
  }
  function addFiles(incoming: File[]) {
    setNotice(''); setError('');
    let next = [...files];
    const errors: string[] = [];
    for (const file of incoming) {
      if (!/\.(pdf|docx|xlsx|xls)$/i.test(file.name)) { errors.push(`${file.name}: нужен PDF, DOCX, XLSX или XLS.`); continue; }
      if (file.size === 0 || file.size > 25 * 1024 * 1024) { errors.push(`${file.name}: файл должен быть непустым и не больше 25 МБ.`); continue; }
      if (next.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) continue;
      if (next.length >= 10 || next.reduce((sum, f) => sum + f.size, 0) + file.size > 100 * 1024 * 1024) {
        errors.push('Можно добавить до 10 файлов общим размером не больше 100 МБ.'); continue;
      }
      next.push(file);
    }
    if (next.length !== files.length) dirty.current = true;
    setFiles(next); setError(errors.join(' '));
  }
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const draft: Draft = { id: id ?? crypto.randomUUID(), updatedAt: new Date().toISOString(), fields, files };
      await saveDraft(draft); setId(draft.id); setSaved(await drafts()); dirty.current = false;
      setNotice('Черновик и файлы сохранены в этом браузере. Их можно открыть в разделе «Мои черновики».');
    } catch { setError('Не удалось сохранить черновик. Возможно, хранилище браузера недоступно или заполнено.'); }
    finally { setBusy(false); }
  }
  async function remove(draft: Draft) {
    if (!window.confirm('Удалить этот черновик и его вложения из браузера?')) return;
    try { await removeDraft(draft.id); setSaved(await drafts()); if (id === draft.id) setId(undefined); }
    catch { setError('Не удалось удалить черновик.'); }
  }
  function review(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (!files.length) { setError('Приложите акт или отчёт перед проверкой заявки.'); return; }
    dialog.current?.showModal();
  }
  const input = (key: keyof Fields, label: string, placeholder: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className="field">{label}<input value={fields[key]} onChange={e => change(key, e.target.value)} placeholder={placeholder} {...extra} /></label>;

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Портал подрядчика — главная"><span className="brand-mark">п</span><span>Портал<span className="brand-sub">подрядчика</span></span></a>
      <span className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</span>
      <nav aria-label="Основная навигация">
        <button className={view === 'new' ? 'nav-item active' : 'nav-item'} onClick={startNew}><Icon name="plus" />Новая заявка<Icon name="arrow" size={16} /></button>
        <button className={view === 'drafts' ? 'nav-item active' : 'nav-item'} onClick={() => setView('drafts')}><Icon name="folder" />Мои черновики<span className="count">{saved.length}</span></button>
      </nav>
      <div className="sidebar-bottom"><Icon name="shield" size={24} /><p>Ваши документы —<br />в одном месте</p><span>Подготовьте заявку и сохраните всё необходимое.</span></div>
      <div className="profile"><span className="avatar">П</span><div>Кабинет подрядчика<small>Локальная демонстрация</small></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>Кабинет подрядчика <span className="slash">/</span> <strong>Заявки на оплату</strong></span><span className="mode"><span />Локальный режим</span></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">ДОКУМЕНТООБОРОТ БЕЗ ЛИШНИХ ШАГОВ</div><h1>{view === 'new' ? 'Заявка на оплату' : 'Мои черновики'}</h1><p>{view === 'new' ? 'Добавьте сведения об оказанных услугах и приложите документы.' : 'Продолжите работу с сохранёнными заявками.'}</p></div>{view === 'drafts' && <button className="primary" onClick={startNew}><Icon name="plus" />Новая заявка</button>}</div>
        <div className="demo-note"><Icon name="shield" size={19} /><span>Демонстрационный режим. Заявки и файлы сохраняются только в этом браузере. Отправка в 1С ещё не подключена.</span></div>
        <div aria-live="polite">{notice && <div className="message success"><Icon name="check" />{notice}</div>}</div>
        {error && <div className="message error" role="alert">{error}</div>}
        {view === 'new' ? <div className="content-grid">
          <form onSubmit={review}>
            <section className="card"><div className="section-heading"><span className="step">01</span><div><h2>Сведения о работе</h2><p>Основание и сумма оплаты</p></div><span className="draft-tag">Черновик</span></div>
              <div className="form-grid">
                <div className="full">{input('contract', 'Договор *', 'Номер или название договора', { required: true, maxLength: 200 })}</div>
                {input('actNumber', 'Номер акта *', 'Например, 12', { required: true, maxLength: 80 })}
                {input('actDate', 'Дата акта *', '', { required: true, type: 'date' })}
                <label className="field full">Описание услуг или работ *<textarea value={fields.description} onChange={e => change('description', e.target.value)} required maxLength={4000} placeholder="Какие работы выполнены и за какой период?" rows={3} /></label>
                {input('amount', 'Сумма к оплате, ₽ *', '0,00', { required: true, type: 'number', min: '0.01', max: '999999999999.99', step: '0.01' })}
                <label className="field">НДС<select value={fields.vat} onChange={e => change('vat', e.target.value)}>{['Без НДС', 'Включён в сумму', 'Требует уточнения'].map(value => <option key={value}>{value}</option>)}</select></label>
              </div>
            </section>
            <section className="card"><div className="section-heading"><span className="step">02</span><div><h2>Реквизиты подрядчика</h2><p>Получатель платежа</p></div></div>
              <div className="form-grid">
                <div className="full">{input('company', 'Наименование организации или ФИО *', 'ООО, ИП или самозанятый', { required: true, maxLength: 300 })}</div>
                {input('inn', 'ИНН *', '10 или 12 цифр', { required: true, inputMode: 'numeric', pattern: '(?:[0-9]{10}|[0-9]{12})', maxLength: 12, title: 'Укажите ИНН из 10 или 12 цифр' })}
                {input('bik', 'БИК банка *', '9 цифр', { required: true, inputMode: 'numeric', pattern: '[0-9]{9}', maxLength: 9, title: 'Укажите БИК из 9 цифр' })}
                <div className="full">{input('account', 'Расчётный счёт *', '20 цифр', { required: true, inputMode: 'numeric', pattern: '[0-9]{20}', maxLength: 20, title: 'Укажите расчётный счёт из 20 цифр' })}</div>
              </div>
            </section>
            <section className="card"><div className="section-heading"><span className="step">03</span><div><h2>Подтверждающие документы</h2><p>Акт, отчёты и другие материалы</p></div></div>
              <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}>
                <div className="upload-icon"><Icon name="upload" size={26} /></div><h3>Перетащите файлы сюда</h3><p>или выберите их на устройстве</p>
                <button type="button" className="secondary" onClick={() => picker.current?.click()}><Icon name="plus" size={17} />Выбрать файлы</button>
                <small>PDF, DOCX, XLSX, XLS · до 25 МБ на файл · до 10 файлов</small>
                <input ref={picker} type="file" accept=".pdf,.docx,.xlsx,.xls" multiple aria-label="Прикрепить документы" className="file-picker" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
              </div>
              {files.length > 0 && <ul className="file-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><span className="file-icon"><Icon name="document" /></span><span className="file-name">{file.name}<small>{fileSize(file.size)}</small></span><button className="icon-button" type="button" aria-label={`Удалить файл ${file.name}`} onClick={() => { setFiles(old => old.filter((_, i) => i !== index)); dirty.current = true; setNotice(''); }}><Icon name="close" size={17} /></button></li>)}</ul>}
            </section>
            <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={save}><Icon name="document" size={18} />{busy ? 'Сохранение…' : 'Сохранить черновик'}</button><button className="primary" type="submit">Проверить заявку<Icon name="arrow" size={18} /></button></div><p className="form-footnote">* Обязательные поля для проверки. Черновик можно сохранить на любом этапе.</p>
          </form>
          <aside className="right-rail"><div className="summary-card"><span className="summary-label">К ОПЛАТЕ</span><strong>{money(fields.amount)}</strong><span className="summary-vat">{fields.vat}</span><div className="summary-divider" /><span className="summary-label">ВЛОЖЕНИЯ</span><div className="summary-files"><Icon name="document" />{files.length ? `${files.length} из 10 файлов` : 'Пока нет документов'}</div></div>
            <div className="help-card"><div className="help-icon"><Icon name="check" size={20} /></div><h3>Перед проверкой</h3><ul><li>Укажите договор и сведения об акте</li><li>Проверьте сумму и реквизиты</li><li>Приложите акт и отчёт о работах</li></ul></div>
            <details className="help-details"><summary>Как сохраняются документы?</summary><p>Кнопка «Сохранить черновик» сохраняет заявку вместе с файлами на этом устройстве. Они не передаются на сервер и недоступны с других устройств. Очистка данных браузера удалит черновики.</p></details>
          </aside>
        </div> : <section className="card drafts-card">{saved.length ? <div className="draft-list">{saved.map(draft => <article key={draft.id} className="draft-row"><span className="file-icon"><Icon name="document" size={23} /></span><div className="draft-info"><h2>{draft.fields.company || 'Без названия'}</h2><p>{draft.fields.contract || 'Договор не указан'} · {draft.files.length} вложений</p><small>Сохранено {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(draft.updatedAt))}</small></div><strong>{money(draft.fields.amount)}</strong><button className="secondary" onClick={() => openDraft(draft)}>Открыть</button><button className="icon-button" aria-label={`Удалить черновик ${draft.fields.company || 'без названия'}`} onClick={() => remove(draft)}><Icon name="close" /></button></article>)}</div> : <div className="empty-state"><Icon name="folder" size={44} /><h2>Здесь будут ваши черновики</h2><p>Сохраните заявку, чтобы вернуться к ней позже.</p><button className="primary" onClick={startNew}>Создать заявку<Icon name="arrow" size={18} /></button></div>}</section>}
        <footer><span>Портал подрядчика</span><span>Документы в порядке. Работа без лишних шагов.</span></footer>
      </main>
    </div>
    <dialog ref={dialog} className="review-dialog"><div className="review-top"><span className="review-icon"><Icon name="check" size={25} /></span><button className="icon-button" aria-label="Закрыть проверку" onClick={() => dialog.current?.close()}><Icon name="close" /></button></div><h2>Проверьте данные заявки</h2><p>Документы готовы для дальнейшей работы.</p><dl><dt>Подрядчик</dt><dd>{fields.company}</dd><dt>Основание</dt><dd>{fields.contract} · акт № {fields.actNumber}</dd><dt>Сумма</dt><dd>{money(fields.amount)}</dd><dt>Вложения</dt><dd>{files.length}</dd></dl><div className="demo-note">Отправка в 1С пока недоступна. Вы можете сохранить заявку и файлы как локальный черновик.</div><button className="primary" onClick={() => { dialog.current?.close(); save(); }}>Сохранить черновик</button></dialog>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
