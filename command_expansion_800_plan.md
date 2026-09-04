# Sukuna MD: Non-Duplicative Expansion Plan Beyond 800 Commands

## Baseline

The current repository contains **704 command modules**. Because aliases should not be counted as separate commands, Sukuna MD needs at least **97 new real command modules** to reach 801. The plan below proposes **110 distinct modules**, giving a projected total of **814 commands** while preserving room for removals or rejected ideas.

The names below were checked against the current command inventory. They are proposed as new modules, not aliases for existing commands.

## Recommended first wave: 110 real command modules

| Category | New command modules | API / credential need | Count |
|---|---|---:|---:|
| Developer and data tools | `jsonschema`, `jwtdecode`, `jwtinspect`, `regexexplain`, `regexgenerate`, `cronexplain`, `cronnext`, `sqlformat`, `sqlschema`, `yamlvalidate`, `tomlvalidate`, `envtemplate`, `gitignoregen`, `dockerignoregen`, `semvercompare` | Mostly none; optional LLM for explanations | 15 |
| Knowledge and research | `wikipedia`, `wikifacts`, `wikinews`, `wikibook`, `openlibrary`, `bookisbn`, `bookquote`, `arxivsearch`, `doiinfo`, `pubmedsearch`, `wordorigin`, `etymology`, `thesaurus`, `synonyms`, `antonyms` | Wikipedia/Open Library/arXiv/PubMed public endpoints; DOI may use Crossref | 15 |
| Productivity and planning | `todolist`, `todoadd`, `tododone`, `todoclear`, `pomodoro`, `stopwatch`, `countdownpro`, `habittrack`, `meetingagenda`, `standup`, `minutes`, `kanban`, `checklist`, `grocerylist`, `billsplit` | None for local/session state; optional Redis for persistence | 15 |
| Science and space | `nasaapod`, `marsweather`, `earthquake`, `asteroid`, `issnow`, `issnext`, `moonphase`, `solstice`, `tides`, `airquality`, `pollen`, `wildfire`, `volcano`, `spaceimage`, `starfacts` | NASA key recommended; USGS, OpenAQ, NOAA, and public feeds can be keyless or optional-key | 15 |
| Travel and location | `geocode`, `reversegeocode`, `timezoneat`, `currencyrate`, `holidays`, `airportinfo`, `flightstatus`, `roadroute`, `trainstatus`, `bustrip`, `hotelsearch`, `tourism`, `cityevents`, `tripplan`, `packinglist` | Nominatim/OSRM/Open-Meteo/Nager.Date can be keyless; flight/hotel data usually needs provider credentials | 15 |
| Finance and business information | `stockquote`, `stockchart`, `companylookup`, `secfiling`, `earningscalendar`, `forex`, `mortgage`, `loanpayment`, `tipcalc`, `taxbracket`, `vatcalc`, `invoicegen`, `receiptgen`, `budgetplan`, `networth` | Calculators are keyless; market/filing data needs a provider such as Alpha Vantage, FMP, Finnhub, or SEC endpoints | 15 |
| AI and document utilities | `promptgen`, `summarizeurl`, `articlebrief`, `pdftext`, `docoutline`, `imagecaption`, `alttext`, `emaildraft`, `coverletter`, `resumebullet`, `rewriteformal`, `rewritecasual`, `translatefile`, `extracttable`, `factcheckbrief` | Built-in LLM for generation; URL/PDF extraction may be keyless | 15 |
| Games | `2048`, `minesweeper`, `connect4`, `checkers`, `chess`, `wordle`, `hangman`, `battleship`, `memorymatch`, `sudoku`, `kakuro`, `mastermind`, `blackjack`, `rpsls`, `typingrace` | None; can use the existing GenAI Rich Response HTML pattern | 15 |

**Total proposed new modules: 120.** The category table intentionally contains eight groups of 15, giving a projected total of **824 commands**. The plan can therefore absorb 23 modules that fail API availability or overlap review and still remain above 800.

## API strategy

The safest implementation order is to build the keyless commands first. These include developer validators, calculators, local productivity tools, games, text-generation utilities, and research commands backed by stable public endpoints. API-backed commands should use timeouts, response validation, rate-limit handling, caching where appropriate, and clear “data unavailable” states instead of returning fabricated results.

Potential API families include **Nominatim/OSRM** for geocoding and routing, **Open-Meteo** for weather and astronomy, **Nager.Date** for public holidays, **USGS** for earthquakes and volcanoes, **OpenAQ** for air quality, **NASA APIs** for space data, **Crossref** for DOI metadata, **Open Library** for books, **arXiv** for papers, and **SEC EDGAR** for public company filings. Market-data commands should remain informational and include a timestamp and provider name; they should not be presented as financial advice.

## Recommended implementation waves

| Wave | Scope | Modules | Target |
|---|---|---:|---:|
| 1 | Keyless games, calculators, text utilities, validators | 40 | Fastest route to reliable coverage |
| 2 | Public research and science APIs | 30 | Add useful data commands with caching and timeouts |
| 3 | Productivity and document tools | 25 | Add persistent/session-aware utilities |
| 4 | Market, travel, and provider-backed commands | 25 | Add only after credentials and rate limits are configured |

## Anti-duplication rules

Each item should be added as one command file with one canonical `name`. Alternate spellings should be aliases only and must not be counted toward the 800 target. Before creating a file, the loader should reject collisions against existing names, aliases, filenames, and normalized forms. Commands that differ only by output color, API provider, or wording should remain one command with an option rather than separate modules.

Every new command should also include a small smoke test for registration, argument handling, success output, timeout behavior, and fallback behavior. API-backed commands should never block the WhatsApp event loop indefinitely, and all secrets must remain in environment variables rather than source files or generated messages.

## Suggested first 10 to implement

The highest-confidence first batch is `2048`, `minesweeper`, `connect4`, `wordle`, `sudoku`, `jsonschema`, `cronnext`, `openlibrary`, `nasaapod`, and `geocode`. These are clearly distinct from the current inventory, have straightforward interfaces, and can use either local logic or stable public endpoints. Games should use the proven GenAI Rich Response HTML envelope already used by `slot`, `ttt`, `snake`, `cursedash`, `whot`, and the reference arcade games.

## Important count note

The current inventory count is based on real command modules, not aliases. After each implementation batch, rerun the command-loader inventory and collision check. The objective is **at least 801 canonical commands**, not an inflated menu containing duplicate aliases.
