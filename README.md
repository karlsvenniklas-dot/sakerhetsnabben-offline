# SäkerhetSnabben Offline 1.7

Mobilanpassad app för kundobjekt, arbetsorder, brandlarmsprotokoll och detektorregister. Appen körs lokalt i webbläsaren utan konto eller ChatGPT-inloggning.

## Publicera på GitHub Pages

1. Öppna repositoryts **Settings → Pages**.
2. Välj **Deploy from a branch** som Source.
3. Välj **main** och **/(root)**, klicka **Save**.
4. När publiceringen är klar öppnar du https://karlsvenniklas-dot.github.io/sakerhetsnabben-offline/.

Filerna ligger direkt i roten. Ingen byggprocess behövs. `.nojekyll` gör att de serveras som statiska filer.

## Installera och använda offline

Öppna Pages-adressen med internetanslutning, direkt i Safari på iPhone eller Chrome på Android. Gå till **Offline & backup**, installera offlinefilerna och invänta appens bekräftelse. Lägg sedan appen på hemskärmen med webbläsarens delnings-/installationsmeny. Prova att stänga appen och öppna den igen i flygplansläge.

Första hämtningen och uppdateringar kräver internet. E-post, kartor och andra externa tjänster kan kräva anslutning. Offlinecachen har testats automatiskt, men installation på fysisk telefon behöver fortfarande verifieras.

## Innehåll

- Kundobjekt med anläggningsnummer, namn, adress, kontakter och två anläggningsskötare. Val via namn eller nummer fyller i objektuppgifterna; manuell inmatning finns också.
- Import från CSV, tabell eller inklistrad lista med kolumnmappning och granskning före sparande. Exempel finns i `objektmall.csv`.
- Separata arbetsorder med ordernummer, SK/KV/SB, planerat datum och status. Dagens jobb, historik och kontroll inför avslut.
- Centralapparat som rullista: Schneider FX101, Schneider FDP, Notisfire ID300, Notisfire ID3000, Notisfire NFS2-8, Consilium Terrafire och Consilium Multifire. Manuellt alternativ finns. Contal Cat12Ce är standardlarmsändare.
- Brandlarmsprotokoll med lokala utkast och arkiv.
- Detektorregister per objekt med import, provningshistorik, anmärkningar, lokalt foto, detektorbyte och CSV-export. Provningsläget visar återstående detektorer och går vidare efter sparande. Beteckningen visas som Sektion 1 · 01.023 eller Sektion 1 · 223 för ID300/ID3000. BL401 hämtar senaste registreringen per detektor och generation för protokollets datum och arbetsorder. Utan vald arbetsorder visas dagens registreringar för objektet. Resultat, kommentarer och foton ingår i utskriften; övriga kontrollpunkter bedöms manuellt. Historiska arkiv behåller sina sparade resultat.
- Lokal säkerhetskopiering och återställning.

## Dina uppgifter

Kunduppgifter sparas i telefonens webbläsare via IndexedDB och skickas inte till GitHub. Ta regelbundna säkerhetskopior: rensning av webbplatsdata eller byte av telefon kan ta bort uppgifterna.

Vid byte från den tidigare testadressen: exportera en säkerhetskopia där och importera den på Pages-adressen under **Offline & backup**. Olika webbadresser delar inte lokal databas. Lägg aldrig kunddata eller säkerhetskopior i detta publika kodrepository.

## Teknik

Statisk HTML, CSS och JavaScript med en service worker som verifierar offlinefilerna. Alla sökvägar är relativa och fungerar under repositoryts Pages-sökväg. `engine.js` innehåller den befintliga protokollappen; övriga moduler hanterar skal, objekt, order, detektorer och lagring. Ingen server eller extern databas krävs.

## Nytt i 1.6

Objektkortet samlar kontaktlänkar, saknade uppgifter, senaste dokumenterade besök, felregister, lokala PDF-ritningar och bilder samt servicerapporter.

Fel från detektorprovning och arkiverade protokoll tas in i felregistret när objektkortet öppnas. Status är Öppen, Åtgärdad och Kontrollerad; varje ändring kräver tekniker och anteckning. Gamla protokoll ändras inte.

Objektimport varnar för lika namn eller adresser med olika objektnummer. Ångra senaste objektimporten återställer bara objekt och arbetsorder och stoppas om de har ändrats eller nya objekt har fått dokumentation. Ångerposten sparas lokalt och ingår inte i exportbackup.

Servicerapporter granskas före sparande. Sparade rapporter är ögonblicksbilder med arbetsbeskrivning, detektorresultat, felhistorik och valda bilder. PDF skapas lokalt med pdf-lib (MIT, se pdf-lib-LICENSE.md). Hämta PDF aktiverar Dela PDF på enheter som stöder fildelning; annars hämtas filen. PDF-ritningar listas men bäddas inte in som sidor. Kunduppgifter och dokument publiceras aldrig i kodrepositoryt.

## Nytt i 1.7

- Egna SK/KV/SB-mallar och sparade besökschecklistor med faser, anteckningar, ej aktuellt med skäl och återöppning. Malländringar påverkar endast nya besök.
- Offlinebilder och PDF-sidor med zoom, detektormarkeringar, periodfärger, historik och genväg till provning. PDF.js är inbyggt (Apache 2.0, se pdfjs-LICENSE.txt). Krypterade eller ovanliga PDF-filer kan behöva exporteras som bild först.
- Periodbaserade provningsförslag med manuellt godkänt urval, sparade arbetslistor och CSV-export. Inga automatiska antaganden om föreskriven provningsomfattning.
- Material, modell, antal, installationsdatum, beställningsstatus och CSV-underlag. Den tidigare materiallistan visas också.
- Besöksunderlag med öppna fel, material, kontakter, föregående servicerapport och egna anteckningar, som textfil.
- Ett objekt kan exporteras med dokument, utkast, arbetsorder och historik. Import under Offline & backup visar varje ny eller avvikande post. Lokala värden behålls som standard. Inkommande register ersätts endast efter användarens val; importen är atomisk och stoppas om något ändrats sedan granskningen. Samma objektnummer med annat ID stoppas för att undvika dubbletter. Ingen automatisk synkning.
- Egna snabbtexter i provningskommentarer, fel, åtgärder och besöksanteckningar. Mallar och snabbtexter ingår i full säkerhetskopia, inte i enskilda objektpaket.
- Servicerapporten innehåller också besökets checklistor, materialstatus och anteckning inför nästa besök, som en sparad ögonblicksbild.

Alla nya register ingår i full säkerhetskopia. Äldre säkerhetskopior stöds fortsatt. Befintlig lokal databas behålls vid uppdateringen.
