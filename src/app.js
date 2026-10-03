import { zonaFoto, rilevaBordi, numeroFogli } from './griglia.js';
import { calcolaLayout } from './layout.js';
import { disegnaFoto, disegnaLinee } from './render.js';
import { disegnaPagina } from './pagina.js';
import { creaPdf } from './pdf.js';
import { creaExcel } from './excel.js';

const $ = (id) => document.getElementById(id);
const numero = (id) => Number($(id).value) || 0;

let img = null;
let paginaCorrente = 0;
let stato = null;

function leggiParametri() {
  return {
    altezzaCm: numero('altezzaCm'),
    ultimaPagina: numero('ultimaPagina'),
    colonnaCm: numero('colonnaCm'),
    fogliVuotiInizio: numero('fogliVuotiInizio'),
    fogliVuotiFine: numero('fogliVuotiFine'),
    cmVuotiSopra: numero('cmVuotiSopra'),
    cmVuotiSotto: numero('cmVuotiSotto'),
  };
}

function leggiRitaglio() {
  const W = img.naturalWidth, H = img.naturalHeight;
  const sx = numero('tSinistra') / 100, dx = numero('tDestra') / 100;
  const su = numero('tSopra') / 100, gi = numero('tSotto') / 100;
  if (sx + dx >= 0.98 || su + gi >= 0.98) throw new Error('Il ritaglio toglie tutta la foto');
  return { x: W * sx, y: H * su, w: W * (1 - sx - dx), h: H * (1 - su - gi) };
}

function aggiorna() {
  $('errore').textContent = '';
  try {
    const p = leggiParametri();
    $('infoFogli').textContent = `${numeroFogli(p.ultimaPagina)} fogli, cioè ${numeroFogli(p.ultimaPagina)} colonne nello schema.`;
    const layout = calcolaLayout(p);
    $('infoPagine').textContent = `${layout.perPagina} fogli per pagina A4, ${layout.pagine.length} pagine di schema + 1 di controllo.`;
    const zona = zonaFoto({ fogli: layout.fogli, ...p });
    paginaCorrente = Math.min(paginaCorrente, layout.pagine.length - 1);
    stato = img && {
      img, p, layout, zona,
      crop: leggiRitaglio(),
      stile: {
        colore: $('colore').value,
        spessore: Math.max(0.05, numero('spessore')),
      },
    };
    $('scaricaPdf').disabled = $('scaricaExcel').disabled = !stato;
    disegnaAnteprime(layout);
  } catch (e) {
    stato = null;
    $('scaricaPdf').disabled = $('scaricaExcel').disabled = true;
    $('errore').textContent = e.message;
  }
}

function disegnaAnteprime(layout) {
  $('titoloPagina').textContent = `Pagina da stampare ${paginaCorrente + 1} di ${layout.pagine.length}`;
  $('prec').disabled = paginaCorrente === 0;
  $('succ').disabled = paginaCorrente >= layout.pagine.length - 1;
  if (!stato) return;

  // Panoramica: tutto il libro compresso nella larghezza disponibile.
  const tela = $('panoramica');
  const larghezza = Math.max(300, tela.parentElement.clientWidth - 16) * devicePixelRatio;
  const colW = larghezza / layout.fogli;
  const cmH = Math.min(24, larghezza / 40);
  tela.width = Math.round(larghezza);
  tela.height = Math.round(stato.p.altezzaCm * cmH);
  const ctx = tela.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tela.width, tela.height);
  const g = { x0: 0, y0: 0, colW, cmH };
  disegnaFoto(ctx, img, stato.crop, stato.zona, 0, layout.fogli, g);
  // Nella panoramica una linea per colonna diventerebbe un muro di colore: solo i bordi.
  disegnaLinee(ctx, 1, stato.p.altezzaCm, { ...g, colW: tela.width }, { ...stato.stile, spessore: devicePixelRatio });
  // Evidenzia la pagina A4 mostrata sotto.
  const { da, a } = layout.pagine[paginaCorrente];
  ctx.strokeStyle = '#1a73e8';
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.strokeRect(da * colW, 1, (a - da) * colW, tela.height - 2);

  disegnaPagina($('paginaA4'), 3 * devicePixelRatio, stato, paginaCorrente);
}

function caricaFoto(file) {
  if (!file || !file.type.startsWith('image/')) {
    $('errore').textContent = 'Il file scelto non è un\'immagine';
    return;
  }
  const nuova = new Image();
  nuova.onload = () => {
    img = nuova;
    $('testoCarica').textContent = `${file.name} (${nuova.naturalWidth}×${nuova.naturalHeight})`;
    $('nome').value = file.name.replace(/\.[^.]+$/, '');
    for (const id of ['tSinistra', 'tDestra', 'tSopra', 'tSotto']) $(id).value = 0;
    paginaCorrente = 0;
    aggiorna();
  };
  nuova.onerror = () => { $('errore').textContent = 'Impossibile leggere questa immagine'; };
  nuova.src = URL.createObjectURL(file);
}

function autoRitaglio() {
  if (!img) return;
  // Analisi su una copia ridotta: basta e su foto grandi è molto più veloce.
  const scala = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scala), h = Math.round(img.naturalHeight * scala);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const r = rilevaBordi(ctx.getImageData(0, 0, w, h).data, w, h);
  const perc = (v) => Math.max(0, Math.floor((v * 1000)) / 10);
  $('tSinistra').value = perc(r.x / w);
  $('tSopra').value = perc(r.y / h);
  $('tDestra').value = perc((w - r.x - r.w) / w);
  $('tSotto').value = perc((h - r.y - r.h) / h);
  aggiorna();
}

function scarica(blob, nomeFile) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: nomeFile });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function esporta(funzione, estensione, bottone) {
  if (!stato) return;
  const testo = bottone.textContent;
  bottone.disabled = true;
  bottone.textContent = 'Preparo…';
  try {
    await new Promise((r) => setTimeout(r, 30)); // lascia aggiornare il bottone
    const nome = $('nome').value.trim() || 'schema';
    scarica(await funzione(stato, nome), `${nome}.${estensione}`);
  } catch (e) {
    $('errore').textContent = `Errore nell'esportazione: ${e.message}`;
  } finally {
    bottone.textContent = testo;
    bottone.disabled = false;
  }
}

$('comandi').addEventListener('input', aggiorna);
$('foto').addEventListener('change', (e) => caricaFoto(e.target.files[0]));
$('autoRitaglio').addEventListener('click', autoRitaglio);
$('prec').addEventListener('click', () => { paginaCorrente--; aggiorna(); });
$('succ').addEventListener('click', () => { paginaCorrente++; aggiorna(); });
$('scaricaPdf').addEventListener('click', (e) => esporta(creaPdf, 'pdf', e.currentTarget));
$('scaricaExcel').addEventListener('click', (e) => esporta(creaExcel, 'xlsx', e.currentTarget));
window.addEventListener('resize', () => stato && disegnaAnteprime(stato.layout));

const zona = $('zonaCarica');
zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('sopra'); });
zona.addEventListener('dragleave', () => zona.classList.remove('sopra'));
zona.addEventListener('drop', (e) => {
  e.preventDefault();
  zona.classList.remove('sopra');
  caricaFoto(e.dataTransfer.files[0]);
});

aggiorna();
