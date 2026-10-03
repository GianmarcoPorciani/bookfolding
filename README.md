# Piegalibro

Generatore di schemi di bookfolding: cut & fold (inverted, embossed), comby, MMF,
MMF multilinea, shadow, two-tone, dimensional/multilivello, strip art e lenticolare.

Esportazioni: PDF dello schema (copertina con dati, logo e conteggi, tabella delle
misure), PDF in scala reale ed Excel per strip art e lenticolare, modalità lavoro
da telefono con lettura e comandi vocali.

Questa versione sostituisce la prima app del repository (foto stirata su griglia
con PDF A4 ed Excel): le sue funzioni sono confluite nella tipologia **Strip art**
(fogli vuoti a inizio e fine, margini sopra e sotto, ritaglio manuale e
automatico, colore e spessore delle linee di taglio, esportazione Excel).

Tutto il calcolo e la generazione dei PDF avvengono nel browser: le immagini non
vengono inviate a nessun server.

## Sviluppo

```bash
npm install
npm run dev      # server locale su http://localhost:5173
npm test         # test del motore di calcolo
npm run build    # build statica in dist/
```

Le regole di calcolo sono descritte in [SPEC.md](SPEC.md).

## Pubblicazione

Progetto Vite statico: su Vercel basta importare il repository (framework
"Vite", comando `npm run build`, cartella `dist`).
