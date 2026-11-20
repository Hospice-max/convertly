"use client";
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
type Format = "DOCX" | "PDF" | "XLSX" | "PPTX" | "JPG" | "PNG" | "WEBP";
type Item = { file: File; id: string };
type ConvertedFile = { filename: string; url: string };
const MAX_SIZE = 20 * 1024 * 1024;
const labels: Record<Format, string> = { DOCX: "Word", PDF: "PDF", XLSX: "Excel", PPTX: "PowerPoint", JPG: "JPG", PNG: "PNG", WEBP: "WEBP" };
const accepts: Record<Format, string[]> = { DOCX: [".docx"], PDF: [".pdf"], XLSX: [".xlsx"], PPTX: [".pptx"], JPG: [".jpg", ".jpeg"], PNG: [".png"], WEBP: [".webp"] };
const pairs: { from: Format; to: Format; tag?: string }[] = [
  { from: "DOCX", to: "PDF", tag: "Populaire" }, { from: "PDF", to: "DOCX" },
  { from: "XLSX", to: "PDF" }, { from: "PDF", to: "XLSX" },
  { from: "PPTX", to: "PDF" }, { from: "PDF", to: "PPTX" },
  { from: "JPG", to: "PDF" }, { from: "PNG", to: "PDF" }, { from: "WEBP", to: "JPG", tag: "Prêt" }, { from: "JPG", to: "PNG", tag: "Prêt" }, { from: "PNG", to: "WEBP", tag: "Prêt" }, { from: "JPG", to: "WEBP", tag: "Prêt" }
];
function sizeLabel(n: number) { return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1048576).toFixed(1)} Mo`; }
function ext(file: File) { return file.name.split(".").pop()?.toLowerCase() ?? ""; }
function fileIcon(format: Format) { return format === "DOCX" ? "W" : format === "PDF" ? "P" : format === "XLSX" ? "X" : format === "PPTX" ? "S" : format.slice(0, 3); }
export default function Home() {
  const picker = useRef<HTMLInputElement>(null);
  const [from, setFrom] = useState<Format>("DOCX"), [to, setTo] = useState<Format>("PDF"), [items, setItems] = useState<Item[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [converted, setConverted] = useState<ConvertedFile[]>([]), [drag, setDrag] = useState(false);
  const conversions = useMemo(() => pairs.filter(p => p.from === from), [from]);
  const engineReady = (pairFrom: Format, pairTo: Format) => pairs.some(pair => pair.from === pairFrom && pair.to === pairTo);
  const resetPicker = () => { if (picker.current) picker.current.value = ""; };
  const addFiles = (files: FileList | File[]) => {
    setError(""); setConverted([]);
    const picked = Array.from(files);
    if (!picked.length) return;
    const tooLarge = picked.find(f => f.size > MAX_SIZE);
    if (tooLarge) { setError(`${tooLarge.name} dépasse la limite de 20 Mo.`); return; }
    const allowed = accepts[from];
    const invalid = picked.find(f => !allowed.some(extname => f.name.toLowerCase().endsWith(extname)));
    if (invalid) { setError(`Le fichier ${invalid.name} n’est pas au format ${labels[from]}.`); return; }
    setItems(current => [...current, ...picked.map(file => ({ file, id: `${file.name}-${file.size}-${Math.random()}` }))]);
  };
  const chooseFrom = (format: Format) => { setFrom(format); setTo(pairs.find(p => p.from === format)?.to ?? "PDF"); setItems([]); setConverted([]); setError(""); };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addFiles(event.target.files); resetPicker(); };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDrag(false); addFiles(event.dataTransfer.files); };
  const uploadToCloudConvert = (url: string, parameters: Record<string, string | number>, file: File) => new Promise<HTMLIFrameElement>((resolve, reject) => {
    const target = `cloudconvert-upload-${crypto.randomUUID()}`, frame = document.createElement("iframe"), form = document.createElement("form");
    frame.name = target; frame.hidden = true; document.body.appendChild(frame);
    form.action = url; form.method = "POST"; form.enctype = "multipart/form-data"; form.target = target; form.hidden = true;
    for (const [key, value] of Object.entries(parameters)) { const input = document.createElement("input"); input.type = "hidden"; input.name = key; input.value = String(value); form.appendChild(input); }
    const input = document.createElement("input"), transfer = new DataTransfer(); input.type = "file"; input.name = "file"; transfer.items.add(file); input.files = transfer.files; form.appendChild(input);
    document.body.appendChild(form);
    try { form.submit(); form.remove(); resolve(frame); } catch (reason) { form.remove(); frame.remove(); reject(reason); }
  });
  const convertFiles = async () => {
    if (!engineReady(from, to) || !items.length) return;
    setBusy(true); setError(""); setConverted([]);
    const apiBase = (process.env.NEXT_PUBLIC_CONVERTER_API_URL ?? "").replace(/\/$/, "");
    const uploadFrames: HTMLIFrameElement[] = [];
    try {
      for (const [index, item] of items.entries()) {
        setProgress(`Préparation du fichier ${index + 1} sur ${items.length}…`);
        const createResponse = await fetch(`${apiBase}/api/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: item.file.name, source: ext(item.file), target: to.toLowerCase(), size: item.file.size }) });
        const job = await createResponse.json();
        if (!createResponse.ok) throw new Error(job.detail ?? "Impossible de démarrer la conversion.");
        const frame = await uploadToCloudConvert(job.upload.url, job.upload.parameters, item.file);
        uploadFrames.push(frame);
        setProgress(`Conversion ${index + 1} sur ${items.length}…`);
        let result: { status: string; files?: ConvertedFile[]; error?: string } | undefined;
        for (let attempt = 0; attempt < 300; attempt++) {
          await new Promise(resolve => window.setTimeout(resolve, 1500));
          const statusResponse = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(job.job_id)}?token=${encodeURIComponent(job.job_token)}`, { cache: "no-store" });
          const status = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(status.detail ?? "Impossible de vérifier la conversion.");
          if (status.status === "finished" || status.status === "error" || status.status === "canceled") { result = status; break; }
        }
        if (!result) throw new Error("La conversion prend trop de temps. Réessayez avec un fichier plus léger.");
        if (result.status !== "finished") throw new Error(result.error ?? `La conversion de ${item.file.name} a échoué.`);
        if (!result.files?.length) throw new Error("La conversion est terminée, mais le lien de téléchargement est introuvable.");
        setConverted(current => [...current, ...result!.files!]);
      }
      setProgress("");
    } catch (reason) { setProgress(""); setError(reason instanceof Error ? reason.message : "La conversion a échoué."); }
    finally { uploadFrames.forEach(frame => frame.remove()); setBusy(false); }
  };
  return <main>
    <header className="topbar"><a className="brand" href="#"><span className="brand-icon">✳</span> convertly</a><nav><a href="#formats">Formats</a><a href="#comment">Comment ça marche</a><a href="#securite">Confidentialité</a></nav><span className="free-pill">Sans compte <i>·</i> rapide</span></header>
    <section className="hero"><div className="eyebrow"><span>✳</span> TOUS VOS FORMATS, AU MÊME ENDROIT</div><h1>Vos documents.<br/><span>Dans le bon format.</span></h1><p className="intro">Word, PDF, Excel, PowerPoint et images.<br/>Choisissez une conversion, ajoutez vos fichiers, c’est prêt.</p>
      <section className="converter-card" aria-label="Convertisseur de fichiers">
        <div className="card-heading"><div><span className="mini-label">CHOISIR UNE CONVERSION</span><h2>Que souhaitez-vous convertir ?</h2></div><span className="step-count">01 <i>/ 03</i></span></div>
        <div className="conversion-grid">{pairs.map(pair => <button key={`${pair.from}-${pair.to}`} className={`conversion-option ${from === pair.from && to === pair.to ? "selected" : ""}`} onClick={() => { chooseFrom(pair.from); setTo(pair.to); }}><span className={`format-icon ${pair.from.toLowerCase()}`}>{fileIcon(pair.from)}</span><span className="pair-label"><b>{labels[pair.from]}</b><span>vers</span><b>{labels[pair.to]}</b></span>{pair.tag && <span className={`option-tag ${pair.tag === "Prêt" ? "ready" : ""}`}>{pair.tag}</span>}</button>)}</div>
        <div className="selector-row"><div className="select-field"><label htmlFor="source">De</label><select id="source" value={from} onChange={e => chooseFrom(e.target.value as Format)}>{[...new Set(pairs.map(p => p.from))].map(f => <option key={f} value={f}>{labels[f]} ({accepts[f].join(", ")})</option>)}</select></div><span className="swap">→</span><div className="select-field"><label htmlFor="target">Vers</label><select id="target" value={to} onChange={e => { setTo(e.target.value as Format); setItems([]); setConverted([]); setError(""); }}>{conversions.map(p => <option key={p.to} value={p.to}>{labels[p.to]}</option>)}</select></div></div>
        <div className={`dropzone ${drag ? "is-dragging" : ""}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}><input ref={picker} type="file" accept={accepts[from].join(",")} multiple hidden onChange={onChange}/><span className="upload-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/></svg></span><strong>Déposez vos fichiers ici</strong><span className="drop-help">ou <button onClick={() => picker.current?.click()}>parcourez vos fichiers</button></span><span className="formats">{accepts[from].join(" · ")} <i>·</i> 20 Mo maximum par fichier <i>·</i> sélection multiple</span></div>
        {items.length > 0 && <div className="file-list">{items.map(item => <div className="file-row" key={item.id}><span className={`format-icon small ${from.toLowerCase()}`}>{fileIcon(from)}</span><span className="file-name">{item.file.name}</span><span className="file-size">{sizeLabel(item.file.size)}</span><button className="remove" aria-label={`Retirer ${item.file.name}`} onClick={() => setItems(list => list.filter(x => x.id !== item.id))}>×</button></div>)}<button className="add-more" onClick={() => picker.current?.click()}>+ Ajouter d’autres fichiers</button></div>}
        <div className="submit-row"><span className="size-note">Limite : 20 Mo par fichier</span><button className="convert-button" disabled={!items.length || busy || !engineReady(from, to)} onClick={convertFiles}>{busy ? "Conversion…" : `Convertir ${items.length ? `${items.length} fichier${items.length > 1 ? "s" : ""}` : "mes fichiers"}`} <span>→</span></button></div>
        {busy && <p className="coming-note">{progress} Vos fichiers sont envoyés directement à CloudConvert pour traitement.</p>}
        {error && <p className="message error">{error}</p>}{converted.length > 0 && <div className="results"><p className="message success">✓ {converted.length} fichier{converted.length > 1 ? "s" : ""} prêt{converted.length > 1 ? "s" : ""} au téléchargement.</p>{converted.map((file, index) => <a className="result-link" href={file.url} target="_blank" rel="noreferrer" key={`${file.url}-${index}`}>↓ {file.filename}</a>)}</div>}
      </section>
      <div className="trust-row"><span>✦ Jusqu’à 20 Mo</span><span>✦ Conversion par lots</span><span>✦ Compatible mobile</span></div>
    </section>
    <section className="formats-section" id="formats"><div className="section-label">PENSÉ POUR VOS DOCUMENTS</div><h2>Les formats essentiels, réunis.</h2><div className="format-categories"><article><span className="category-icon doc">W</span><h3>Documents</h3><p>Word <b>DOCX</b> · PDF</p><small>DOCX ↔ PDF</small></article><article><span className="category-icon sheet">X</span><h3>Tableurs</h3><p>Excel <b>XLSX</b> · PDF</p><small>XLSX ↔ PDF</small></article><article><span className="category-icon slide">S</span><h3>Présentations</h3><p>PowerPoint <b>PPTX</b> · PDF</p><small>PPTX ↔ PDF</small></article><article><span className="category-icon image">◫</span><h3>Images</h3><p>JPG · PNG · WEBP</p><small>Convertibles dès maintenant</small></article></div></section>
    <section className="how" id="comment"><div className="section-label">SIMPLE ET RAPIDE</div><h2>Un fichier ou toute une série.</h2><div className="steps"><article><span className="step-icon">⇄</span><b>01</b><h3>Choisissez les formats</h3><p>Sélectionnez le format de départ et celui qu’il vous faut.</p></article><article><span className="step-icon">↥</span><b>02</b><h3>Ajoutez vos fichiers</h3><p>Convertissez un document ou sélectionnez-en plusieurs à la fois.</p></article><article><span className="step-icon">↓</span><b>03</b><h3>Récupérez vos fichiers</h3><p>Téléchargez vos documents convertis, un par un.</p></article></div></section>
    <section className="privacy" id="securite"><span className="privacy-icon">◈</span><div><strong>Vos fichiers sont traités par CloudConvert.</strong><p>Le transfert se fait directement entre votre navigateur et le prestataire; Convertly ne stocke pas vos fichiers. Ils sont supprimés après traitement, au plus tard sous 24 heures.</p></div><span className="privacy-check">✓ Transfert direct</span></section>
    <footer><a className="brand" href="#"><span className="brand-icon">✳</span> convertly</a><span>La conversion, tout simplement.</span><span>© 2026 Convertly</span></footer>
  </main>;
}



