# SäkerhetSnabben Offline 1.4

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
- Detektorregister per objekt med import, provningshistorik, anmärkningar, lokalt foto, detektorbyte och CSV-export. Detektorhistoriken förs ännu inte automatiskt över till protokollens provningsfält.
- Lokal säkerhetskopiering och återställning.

## Dina uppgifter

Kunduppgifter sparas i telefonens webbläsare via IndexedDB och skickas inte till GitHub. Ta regelbundna säkerhetskopior: rensning av webbplatsdata eller byte av telefon kan ta bort uppgifterna.

Vid byte från den tidigare testadressen: exportera en säkerhetskopia där och importera den på Pages-adressen under **Offline & backup**. Olika webbadresser delar inte lokal databas. Lägg aldrig kunddata eller säkerhetskopior i detta publika kodrepository.

## Teknik

Statisk HTML, CSS och JavaScript med en service worker som verifierar offlinefilerna. Alla sökvägar är relativa och fungerar under repositoryts Pages-sökväg. `engine.js` innehåller den befintliga protokollappen; övriga moduler hanterar skal, objekt, order, detektorer och lagring. Ingen server eller extern databas krävs.
