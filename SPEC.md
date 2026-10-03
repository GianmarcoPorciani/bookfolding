# Piegalibro — specifica degli algoritmi

Documento di riferimento per il motore di calcolo. Le regole sono ricavate dalle
definizioni fornite dall'utente, dalla documentazione pubblica di Wunderfold e da
prove eseguite con immagini sintetiche (valori riportati nei test in
`src/engine/__tests__`).

## 1. Convenzioni

- Misure in cm dal **bordo alto** della pagina, arrotondate alla precisione scelta
  (1 mm predefinita; 0,5 mm e 0,1 mm disponibili).
- Lo schema ragiona per **pagine numerate dispari**: un foglio = una pagina dispari
  (1, 3, 5…). Le pagine non numerate iniziali e finali si escludono indicando
  prima e ultima pagina numerata utile.
- Nessun margine automatico: l'immagine viene stirata su tutta l'altezza della
  pagina. I margini si ottengono lasciando bianco nell'immagine (stesso
  comportamento di Wunderfold).

## 2. Dall'immagine alla griglia

1. Pixel trasparenti = bianco. Luminanza L = 0,299 R + 0,587 G + 0,114 B.
2. Ritaglio facoltativo dei lati vuoti (colonne interamente sfondo a sinistra e a
   destra).
3. Fogli del disegno `n`: tutti i fogli da prima a ultima pagina (modalità
   *riempi*), oppure un numero scelto o calcolato dalle proporzioni dell'immagine
   (modalità *proporzionale*, spessore pagina 0,05 cm × spaziatura %). Se il
   disegno usa meno fogli di quelli disponibili viene **centrato** e i fogli
   restanti sono "Salta".
4. Il foglio `s` (0 … n−1) legge la colonna di pixel `x = floor((s + 0,5) · W / n)`.
5. Ogni riga di pixel `y` copre l'intervallo `[y · h / H, (y+1) · h / H]` cm.
6. I tratti (run) sono sequenze contigue di righe della stessa classe; i bordi del
   tratto diventano misure: `pos = round(bordo · h / H / p) · p`.
7. Pulizia: tratti più corti della **linguetta minima** (default 1 mm) eliminati;
   spazi più corti dello **spazio minimo** (default = linguetta) fusi.

Classificazione:
- Binaria (cut & fold, comby, MMF, shadow, strip di controllo): soglia automatica
  di Otsu sull'istogramma della luminanza, oppure manuale.
- Due toni: due soglie (Otsu multilivello) → scuro / chiaro / sfondo.
- Multilivello: ogni pixel va al livello di colore più vicino (distanza RGB),
  incluso il livello "nessuna piega" (bianco).

## 3. Tipologie

| Tipologia | Regola per foglio |
|---|---|
| Cut & fold inverted | Ogni bordo di tratto è un **taglio**; i tratti si piegano verso l'interno. |
| Cut & fold embossed | Stesse misure dell'inverted; si piegano verso l'interno gli spazi. |
| Comby | Primo e ultimo bordo = **pieghe** (bordi esterni), bordi intermedi = **tagli**. Un solo tratto → due pieghe. |
| MMF | Una sola coppia di pieghe per foglio; con più tratti si alternano: foglio `s` usa il tratto `s mod k`. Avviso oltre 6 segni. |
| MMF multilinea | Righe di testo rilevate come bande separate da righe vuote; ogni banda è un MMF indipendente. |
| Shadow 1:1 | Cut & fold su un foglio sì e uno no (foglio 0 attivo). |
| Shadow 1/3 | Piega 1, salta 2. |
| Shadow 2/3 | Piega 2, salta 1. |
| Two-tone | Zone **scure** tagliate su tutti i fogli; zone **chiare** solo sui fogli dispari (indice 1, 3, …): pagine 3, 7, 11… se si parte da pagina 1. Le due maschere si uniscono prima di calcolare i tagli. |
| Multilivello (dimensional) | Tratti calcolati per livello; ogni segmento riporta il codice del livello (1–2 lettere). Profondità facoltativa in cm per livello, stampata in legenda. Modalità ombra opzionale per livello. |
| Strip art | Il foglio `s` riceve la fetta d'immagine `[s·W/n, (s+1)·W/n]` stirata alla larghezza striscia (default 1,5 cm) e all'altezza del libro; stampa in scala 1:1 con numeri di pagina e righello in cm. |
| Lenticolare | Due immagini A e B; ogni striscia è divisa a metà: sinistra fetta di A, destra fetta di B (default 0,75 + 0,75 cm). Scala 1:1, numeri di pagina, riferimento 5 cm. |

## 4. Uscite

- **Tabella**: Pagina | misure (tagli; pieghe con prefisso **P** in comby e MMF;
  codice livello in multilivello). Intervalli di fogli vuoti compressi
  ("1–25 Salta").
- **PDF schema**: copertina con titolo, autore, logo, tipologia, pagine totali,
  pagine usate, altezza, precisione, tagli/pieghe totali, anteprima; tabella
  paginata; piè di pagina con numerazione e copyright.
- **PDF strip/lenticolare**: strisce affiancate su A4 in scala reale, più bande
  per foglio se l'altezza lo consente, numeri di pagina sopra e sotto, righello
  in cm a sinistra, segmento di controllo da 5 cm.
- **Modalità lavoro (telefono)**: una pagina per schermata con misure grandi,
  avanti/indietro, lettura vocale in italiano, comandi vocali "avanti",
  "indietro", "ripeti" dove supportati, posizione salvata nel browser.
- Formato numeri: virgola decimale (6,7) predefinita, punto selezionabile.

## 5. Limiti noti

- Three-tone di Wunderfold non implementato: la regola osservata (cicli di 3
  fogli) non è stata ricostruita con certezza.
- Le soglie automatiche possono differire da Wunderfold su immagini sfumate: i
  valori di soglia restano regolabili a mano.
