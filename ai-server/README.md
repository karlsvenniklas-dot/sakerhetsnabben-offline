# Analystjänst för SäkerhetSnabben

Status: serverkoden är förberedd och testad med simulerade API-svar. Ingen driftserver, API-nyckel eller debiterad AI-analys har aktiverats av denna ändring.

## Drift

Kör Node.js 22 eller senare på en server med HTTPS framför tjänsten. Starta från repots rot med `node ai-server/server.mjs`. Inga npm-beroenden krävs. Exempelvis kan Dockerfilen användas på en befintlig containerplattform. GitHub Pages kör inte denna server.

Ange följande som **serverhemligheter/miljövariabler i driftplattformen**, aldrig i GitHub eller ai-config.js:

- `OPENAI_API_KEY`: separat OpenAI-projektnyckel.
- `OPENAI_MODEL`: en modell tillgänglig i projektet som stöder bildinmatning och Responses Structured Outputs. Inget modellnamn gissas eller väljs automatiskt.
- `AI_ACCESS_TOKEN`: slumpad separat åtkomstkod med minst 32 tecken. Denna kan anges på telefonen; OpenAI-nyckeln ska aldrig anges där.
- `ALLOWED_ORIGIN`: `https://karlsvenniklas-dot.github.io` (utan avslutande snedstreck).
- `PORT`: 8080 om inget annat anges.
- `AI_DAILY_LIMIT`: högst antal analysförsök per UTC-dygn och serverprocess, standard 50.

Publicera `/analyze` över HTTPS. Ange dess fullständiga URL i appens **AI · Analysera ritning → Anslut analystjänst**, eller sätt den publika adressen som endpoint i `ai-config.js`. URL:en får inte innehålla hemligheter. Använd separata åtkomstkoder eller riktig inloggning om tjänsten senare delas med fler personer.

Servern använder en begäran åt gången och högst tre analysförsök per minut. Gränserna finns i minnet, nollställs vid omstart och är inte en garanterad kostnadsgräns. Kör en instans; sätt även budget/kvot hos API-leverantören och driftplattformen. HTTPS-proxyn ska begränsa anrop till 6 MB och inte logga Authorization eller ritningsinnehåll.

## Data och granskning

En JPEG-bild av den visade sidan skickas till servern och sedan OpenAI. Övriga sidor, objektregister och provhistorik skickas inte. Servern skriver inga ritningar till disk och loggar inga anropskroppar. `store:false` används för Responses, vilket inte är ett löfte om leverantörens övriga datalagring; kontrollera aktuella datavillkor innan drift.

Modellen får inget verktyg för att prova detektorer eller ändra databasen. Alla förslag börjar ovalda. Användaren granskar positioner och fält och väljer vad som ska sparas. Saknad adress kräver sektion och lokal beteckning. Befintliga detektorer kopplas uttryckligen och deras uppgifter/historik skrivs inte över. Dubbel markering av samma detektor på samma sida stoppas. Detektor- och ritningsregister sparas atomiskt med kontroll mot att data ändrats under granskningen.

AI kan missa symboler, förväxla typer och ge fel positioner. Första versionen skickar sidans visningsbild (högst 1800 pixlar på längsta sidan). Stora/täta ritningar kan behöva delas upp i tydligare sidor innan analys. Detta är inte validerat med en verklig modell ännu.

## Kontroll

`node test-drawing-ai.cjs` testar granskning/import och att provningshistorik aldrig skapas av AI.

`node ai-server/test-server.mjs` testar autentisering, CORS, felaktiga bilder, strukturerade svar och ofullständiga API-svar med simulerad nätverkstrafik. Testet gör inga riktiga AI-anrop.

API-underlag: https://developers.openai.com/api/docs/guides/images-vision och https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
