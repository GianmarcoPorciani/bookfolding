# Bookfolding – schemi

App web per generare gli schemi di bookfolding: carichi la foto del disegno,
imposti l'altezza del libro e l'ultima pagina, e scarichi lo schema da stampare
in PDF (A4, scala reale) o in Excel.

Tutto gira nel browser: la foto non viene mai inviata a un server.

## Come è fatto lo schema

- una colonna per foglio, etichettata con la pagina dispari (1, 3, 5, …);
- la colonna è larga 1 cm (modificabile): le linee verticali sono le linee di taglio;
- una riga per centimetro di altezza del libro, numerata a sinistra;
- la foto viene stirata su tutta la griglia, con ritaglio e margini opzionali.

Il PDF va stampato a **Dimensioni effettive / 100%**: la prima pagina contiene un
righello di 10 cm per verificare la scala.

## Sviluppo

Nessuna build: è un sito statico. Per provarlo in locale:

```bash
python -m http.server 8765
```

e apri <http://localhost:8765>. Test dei calcoli della griglia:

```bash
npm test
```

| File | Cosa fa |
|---|---|
| `src/griglia.js` | calcoli puri: fogli, pagine A4, margini, ritaglio automatico |
| `src/layout.js` | impaginazione A4 in millimetri |
| `src/render.js` | foto stirata e linee di taglio su canvas |
| `src/pagina.js` | anteprima di una pagina A4 |
| `src/pdf.js` · `src/excel.js` | esportazioni (jsPDF, ExcelJS da cdnjs) |
| `src/app.js` | interfaccia |
