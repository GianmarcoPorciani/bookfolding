# Piegalibro

Generatore di schemi di bookfolding: cut & fold (inverted, embossed), comby, MMF,
MMF multilinea, shadow, two-tone, dimensional/multilivello, strip art e lenticolare.

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
