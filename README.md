# SäkerhetSnabben Offline 2.5

Mobilanpassad app för brandlarm: kundobjekt, arbetsorder, brandlarmsprotokoll (BL401) och detektorregister. Appen körs lokalt i webbläsaren utan konto eller ChatGPT-inloggning.

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


### Version 1.8 – provning från ritningen

Öppna Objektkort → Detektorer på ritningen. Välj sparad PDF/bild, välj detektor och placera markeringen. Välj arbetsorder, provare och provningsdatum. Tryck på markeringen, välj resultat och spara. Samma händelse används i BL401 för samma arbetsorder och datum, inklusive sektionsbilagan. Manuella bilagerader behålls.

Årsväljaren visar historik och kvartalsräkningen är separat. Nytt år raderar inga händelser. En detektor räknas en gång per period; utbytta detektorer behöver provas igen. Kvarstående fel visas röda. Räknarna bygger på det registrerade detektorbeståndet och ersätter inte övriga kontrollpunkter.

Utan larmadress: ange sektion och en unik lokal beteckning, exempelvis Detektor 4. Ingen automatisk slutsats om anläggningstyp dras från en saknad adress. Automatisk AI-identifiering av symboler ingår inte; markeringarna kopplas manuellt till detektorregistret.

Kontrollera kärnlogiken med `node test-drawings.cjs`.

### Version 1.9 – förberedd AI-analys med granskning

Under Detektorer på ritningen finns **AI · Analysera ritning**. Visad sida skickas först efter användarens val att starta analysen. Förslag visas som lila markeringar och kan rättas, flyttas, tas bort eller kompletteras. Varje förslag måste väljas efter granskning. Koppla till en befintlig detektor eller skapa en ny; ingen provning registreras av AI.

AI-tjänsten är ännu inte ansluten. Driftsättning och serverhemligheter beskrivs i [ai-server/README.md](ai-server/README.md). Appen visar detta tydligt och knappen är inaktiv tills en tjänst och åtkomstkod har angetts. Ingen API-nyckel ingår i webbappen. Efter granskning och import fungerar detektorprovningen offline.

### Version 2.0 – lokal hälsokontroll

Under **Offline & backup → Kontroll av lokala uppgifter** finns en skrivskyddad kontroll av objekt, arbetsorder, dokumentfiler, detektorer, provningsposter och ritningskopplingar. Kontrollera uppgifterna visar antal fel och upplysningar, utan att ändra eller skicka någon information. En kontrollrapport kan exporteras lokalt som JSON; den kan innehålla objektnamn och ska förvaras säkert. Historiska provningar utan kvarvarande detektor är upplysningar, inte automatiskt fel. Eventuella kopplingsproblem rättas manuellt efter att en säkerhetskopia sparats.

Kör `node test-health-check.cjs` för kärntest. Säkerhetskopiering och kontroll i flygplansläge på fysisk telefon behöver fortsatt provas.

### Version 2.1 – offline symbolmatchning

Under **Objektkort → Detektorer på ritningen** finns **Sök liknande symboler offline**. Öppna en sparad PDF eller bild. Markera en tydlig detektorsymbol med två tryck på motsatta hörn. Appen letar efter liknande symboler på samma sida, helt lokalt i webbläsaren. Ingen bild, symbol eller anläggningsinformation skickas till en server vid denna funktion.

Förslagen är visuella mönsterlikheter, inte bekräftade detektorer. Samma skala och orientering ger bäst resultat; roterade, skannade eller otydliga symboler kan missas. Annan grafik kan ge falska träffar. Använd granskningen för att flytta, ta bort eller lägga till symboler, koppla till befintliga detektorer eller skapa nya. Alla förslag måste godkännas manuellt och ingen provning registreras av symbolanalysen. Test på riktiga ritningar och fysisk iPhone i flygplansläge återstår.

### Version 2.2 – läs in ritningen och provningsläge (offline)

Under **Objektkort → Detektorer på ritningen**:

1. **Läs in detektorer från PDF-ritningen (offline).** Välj ritningen och försättsbladets sida, tryck **Skanna PDF**. Appen läser PDF:ens text på enheten: adresser som `01.001`, sektionsetiketter (`Sektion 12`, `Sek 12`) och typer från försättsbladets tabell och teckenförklaring (rök/optisk, värme/termisk, multi, larmknapp …). Granska listan, rätta sektion/typ vid behov och spara. Nya detektorer läggs i registret och markeras på ritningen; befintliga kopplas, inget skrivs över. Ingen provning registreras. Fungerar på PDF:er med riktig text (CAD-export). Skannade ritningar saknar text – använd då symbolsökningen.
2. **Provningsläge.** Välj arbetsorder och provare, tryck **Starta provningsläge** och tryck på en detektor. En ruta visar **✓ OK**, **✕ Fel** (kommentar krävs, snabbtexter finns) och **Ej åtkomlig**. Resultatet sparas direkt och kan ångras i några sekunder. Provaren kommer ihåg på enheten.
3. **Procentruta överst.** Visar andel provat i valt kvartal mot minimikravet för kvartalsprov och, där regeln kräver det, årskravet. Automatiskt val enligt SBF 110:8 avsnitt 11.5.3: med larmadresser minst 2 % av detektorerna per kvartal (spritt över anläggningen och året); utan larmadresser minst en detektor i 10 % av sektionerna per kvartal och samtliga sektioner per år. SBF 110:7 (minst 25 % av sektionerna per kvartal, per år minst 5 % av detektorerna och samtliga sektioner) och eget krav enligt avtal kan väljas. Per sektion visas provade/totalt. **Klar – öppna protokollet** öppnar BL401 för arbetsordern, där provningarna redan finns med.

Allt sker lokalt i webbläsaren. Kör `node test-drawing-text.cjs` för kärntest. Test på riktiga serviceritningar och iPad återstår.

**Protokoll och regelhänvisningar.** Punkt 2.4 (larmprov) i BL401 fylls i från ritningens provningar så länge teknikern inte svarat själv: OK om alla provade detektorer var utan anmärkning, annars Anm. (kategori 2) med detektor, fel och hänvisning till SBF 110:8 avsnitt 11.5.3 a–b. Ändrar du svaret manuellt behålls ditt svar. De färdiga anmärkningarna i BL401 och i provningsrutan på ritningen har hänvisning till aktuellt avsnitt i SBF 110:8, som följer med i kommentaren.

### Ritningar där texten är ritad som linjer (OCR)

Många CAD-ritningar exporteras med texten omvandlad till linjer. Då finns ingen PDF-text att läsa. Läsmetoden **Automatisk** växlar då till bildigenkänning (OCR) med Tesseract, som ligger i appen (`tesseract/`, Apache 2.0, se licensfilerna där) och fungerar offline efter installationen (cirka 13 MB extra).

- Varje sida läses först snabbt. Sidor med adresser läses sedan i högre upplösning i fyra delar, i två riktningar.
- Försättsbladets sektionsförteckning läses och visas som redigerbar text (`3: 01.001-01.002, 01.015-01.016`). Kontrollera den mot försättsbladet och lägg till rader som inte lästs. Adresser som inte finns i förteckningen förväljs inte.
- Förklaringar efter en adress, som "VD placerad i ventilationsaggregat" eller "Fläktstyrning", ger typ och placering. Adresser som bara finns i en förklaringslista förväljs inte.
- Missade adresser läggs till med **Missad adress** och ett tryck på ritningen.
- Testat på en riktig serviceritning (plan 1): 84 av 87 adresser hittades och sektionerna kom rätt efter granskning. Tid på dator cirka 1,5 minut för fem sidor; iPad är långsammare.

Kör `node test-drawing-ocr.cjs` för kärntest. Kunddata och kundritningar läggs aldrig i repot.

### Version 2.3 – läsbar ritning och markering av etikettrutan

- Ritningen vrids automatiskt så att texten blir läsbar, oavsett hur PDF:en eller bilden laddades upp. Läsriktningen tas från PDF:ens text. Saknas text avgörs den med OCR på enheten, cirka 10 sekunder per sida första gången. Riktningen sparas per sida.
- **↻ Vrid ritningen** vrider en kvarts varv åt gången. En riktning du väljer själv ersätts aldrig av den automatiska.
- Bara visningen vrids. Markeringar och skanningar sparas i ritningens egna koordinater.
- Detektorer som lästs in från ritningen markeras med en tonad ruta över adressetiketten i stället för en punkt: grön = provad OK, röd = anmärkning, gul = återstår. Detektorer som placerats för hand visas fortfarande som punkt.
- Detektorer som lästes in innan 2.3 får rutor när ritningen skannas och sparas igen.

Kör `node test-drawing-view.cjs` för vridning, klickpunkter och rutstorlek.

### Version 2.4 – kvartalsplan, foto vid fel och märkt ritning

Under **Objektkort → Detektorer på ritningen**, i procentrutan:

- **Kvartalsplan och historik per sektion.** Sektionerna delas i fyra grupper så att alla provas under året: sektion 1, 5, 9 … i kvartal 1, sektion 2, 6, 10 … i kvartal 2 och så vidare. Varje kvartal täcker då hela anläggningen. Du kan välja kvartal för en sektion själv, och valet sparas. Tabellen visar per sektion vilket kvartal den hör till, när den senast provades och om den har provats i kvartalet. Sektioner och detektorer som inte provats på 12 månader markeras röda. Provningsrutan visar också när detektorn senast provades.
- **Foto vid fel.** Felrutan och rutan för Ej åtkomlig har knappen **📷 Ta foto**, som öppnar kameran. Fotot förminskas på enheten till högst cirka 1600 pixlar och sparas med provningen. Det följer med i BL401 under Registrerad detektorprovning.
- **Märkt ritning som bilaga.** BL401 får en ritningsbilaga sist i utskriften, med varje ritningssida som har markeringar. Grön betyder provad OK, röd anmärkning och gul randig återstår i kvartalet. Läget gäller protokollets datum och ritningen vrids så att texten blir läsbar. **Märkt ritning som PDF** skapar samma sidor som en PDF med listan över återstående provning sist.
- **Återstående – dela lista.** En textlista som kan delas, kopieras eller sparas. Den visar sektioner i kvartalets plan som inte provats, sektioner som inte provats i år, detektorer som inte provats på 12 månader och kvarstående anmärkningar eller ej åtkomliga detektorer.
- Gula rutor för återstående detektorer har nu ränder och mörk kant så att de syns även på gula ytor i ritningen.

Kvartalsplanen är ett hjälpmedel för att sprida provningen. Kraven i procentrutan (SBF 110:7/110:8) räknas som tidigare. Kör `node test-quarter-plan.cjs` för kärntest.

### Version 2.5 – bara brandlarm

Appen är nu inriktad på brandlarm. BL402 inbrottslarm, BL445 lås och BL449 dörrautomatik går inte längre att skapa, varken från startsidan eller från objektkortet. Inbrottsfälten är borttagna från objektformuläret, objektimporten och `objektmall.csv`. Påminnelser om lås- och dörrevision visas inte längre.

Inga sparade uppgifter raderas. Redan arkiverade protokoll av de borttagna typerna går fortfarande att öppna, och dokument som lagts under Inbrottslarm, Lås eller Dörrautomatik visas så länge de finns kvar. Värden i de gamla inbrottsfälten ligger kvar i objektet men visas inte.
