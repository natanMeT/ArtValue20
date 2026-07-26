# ArtValue AI Gateway — Master Roadmap

**מסמך־אב: חזון, תוכנית ביצוע ולוח בקרה**

מקור האמת המתעדכן של תשתית ה־AI עבור ArtValue Business OS.

> **מקור אמת קנוני:** הגרסה החיה של מסמך זה היא `docs/roadmaps/AI_GATEWAY_MASTER_ROADMAP.md` במאגר `natanMeT/ArtValue20`. קובץ ה־Word תחת `docs/releases/` הוא ייצוא־גרסה בלבד ואינו מקור עריכה מתחרה.

| שדה | ערך |
| --- | --- |
| בעלים | Nathan Meir Tordjman / ArtValue |
| מנהל ארכיטקטורה ומסמך | ChatGPT |
| סוכן יישום | Claude / Fable לפי משימה מאושרת |
| Repository | natanMeT/ArtValue20 |
| עוגן קוד ההשקה הפעיל (S0E) — מקור הפרודקשן | 272fc148984b68c26aa46d24e1cdefc2878cddb9 (repository main HEAD נפתר חי בכל preflight; עשוי לכלול commits מאוחרים של תיעוד בלבד) |
| גרסה | 5.4 — עודכן בתאריך 26.07.2026 |
| סטטוס נוכחי | Jake, Outreach, Diagnose ו־ImageStudio נשארים LIVE — VERIFIED. S0E — Guided Business Onboarding נסגר LIVE בפרודקשן **ללא כל שינוי ב־Gateway/Edge** (כמו S0D לפניו). ai-gateway v34 ACTIVE עם verify_jwt=true; router, contracts ו־payloads ללא שינוי. ה־Business Context של החשבון מורכב ומוזרק על ידי ה־frontend לפני קריאת ה־Gateway. הסלייס הבא ממתין להחלטת Nathan. |

| C1 + C2 | CLOSED / LIVE GREEN — מאומת בפרודקשן |
| --- | --- |

| Slice B | LIVE GREEN — Gateway ו־frontend בפרודקשן; ai-gateway 200 וללא קריאת Google ישירה |
| --- | --- |

| CRM Hotfix R3 | CLOSED / LIVE GREEN — schema/FK/RLS, profile lockdown, persisted CRUD, accurate toast ו־test cleanup אומתו בפרודקשן |
| --- | --- |

| R4.1 | CLOSED / LIVE GREEN — Fooocus ו־WorkflowStudio הוסרו מה־UI; redirects ו־core routes אומתו בפרודקשן |
| --- | --- |

| M2 Slice 0 | CLOSED / LIVE GREEN — public-safe Jake demo copy deployed; אין אזכור מפתח או env למשתמש |
| --- | --- |

| M2 Slice 1 | CLOSED / MERGED — provider-neutral adapter/result/capability contracts test-pinned; zero runtime wiring; no deploy required |
| --- | --- |

| M2 Slice 2A | AUDIT ACCEPTED — execution path mapped; pure registry boundary approved with immutable-snapshot and non-executable-none guards |
| --- | --- |

| M2 Slice 2B | CLOSED / MERGED — PR #82; pure immutable execution registry with 27 focused tests and zero runtime wiring |
| --- | --- |

| M2 Slice 2C | CLOSED / LIVE GREEN — function v22; Jake drafting 200; content-free usage verified; budget reserved exactly once per valid call |
| --- | --- |

| M2 Jake Chat Audit | ACCEPTED — chatJake + forceActionsJake will migrate together; local fallback retires; server prompt duplication guarded by verbatim drift tests |
| --- | --- |

| M2 J1 | CLOSED / LIVE GREEN — PR #85 merged; ai-gateway v24 active; canonical actions-only, [] fail-closed and jake.chat regression smokes passed |
| --- | --- |

| M2 J2 | CLOSED / LIVE GREEN — PR #86 + #87; main 21a6d4e; frontend production deployed; ai-gateway 200; confirmation-before-execution and Supabase persistence verified. |
| --- | --- |

| S0C | CLOSED / LIVE VERIFIED — PR #100; main 3ee62aee; ai-gateway v34 (2 Jake text constants only); generic Jake persona; no forced signature; router/contracts/payloads unchanged. |
| --- | --- |

| S0D | CLOSED / LIVE VERIFIED — PR #101; main 22ee2f3; **ZERO Gateway/Edge change**; ai-gateway v34/JWT-on unchanged; account Business Context injected by the frontend before the existing Gateway call. |
| --- | --- |

| S0E | CLOSED / LIVE VERIFIED — PR #103 + corrective PR #104; active release source 272fc14; **ZERO Gateway/Edge change**; ai-gateway v34/JWT-on unchanged; the onboarding first-value CTA only prefills the existing frontend Jake composer — no Gateway call, no auto-send, no action execution, no contract change. |
| --- | --- |

| כלל זהב | סטטוס משתנה רק לפי ראיות: diff, tests, merge, deploy ו־live smoke. |
| --- | --- |

# מטרת המסמך

המסמך מרכז במקום אחד את החזון, מצב המערכת, ההחלטות, מפת הסלייסים, לוח הזמנים והצעדים הבאים. הוא נועד למנוע אובדן הקשר בין שיחות, לאפשר המשך עבודה מדויק, ולוודא שכל שינוי מתקדם לפי ראיות ולא לפי דיווח בלבד.

## סדר הסמכות

- הקוד ב־main והמצב החי בפרודקשן הם הראיה העליונה.
- המסמך מתעד את המצב המאומת ואת התוכנית המאושרת.
- דוח Fable הוא קלט לבדיקה בלבד עד ש־ChatGPT בודק את ה־diff בפועל.
- אין מיזוג, פריסה, SQL או שינוי סודות ללא אישור מפורש של Nathan.

# 1. החזון

חזון המוצר: לבנות שכבת AI מרכזית, מאובטחת ורב־ספקית עבור ArtValue Business OS — שכבה שמבינה את ההקשר של כל עסק, בוחרת מודל וספק בשרת, שומרת על תקציב ופרטיות, ומפעילה יכולות עסקיות עקביות בלי שה־frontend יהיה תלוי ב־Gemini, OpenAI, Claude או כל ספק אחר.

## תוצאות עסקיות שהמערכת צריכה לייצר

- מערכת אחת שמפעילה כתיבה, ניתוח, יצירת תוכן, המלצות, חיפוש והמשך עתידי לפעולות מאושרות.
- התאמה לכל עסק לפי ה־DNA שלו: שפה, לקוחות, היסטוריה, החלטות, יעדים ותהליכי עבודה.
- יכולת להחליף ספק או מודל בלי לשנות מסכים ובלי לשכתב כל פעולה.
- שליטה בעלות, קצב שימוש, איכות, פרטיות ומדיניות מתוך השרת.
- תשתית מוצר שניתנת לשכפול למערכות CRM מותאמות של לקוחות ArtValue.

## עקרונות שאסור לשבור

| עיקרון | משמעות |
| --- | --- |
| Action-first | ה־frontend מבקש פעולה עסקית; הוא אינו בוחר ספק או מודל. |
| Server-owned authority | מודל, ספק, system instruction, schema, limits ו־API keys נשארים בשרת. |
| Strict input | כל פעולה מקבלת חוזה קלט מצומצם; unknown/authority fields נדחים. |
| Fail closed | אין provider call כאשר auth, budget, rate או validation נכשלים. |
| Privacy by design | לא שומרים prompt או response; רק מונים ומטא־דאטה נטולי תוכן. |
| Provider neutrality | ליבת הפעולה נשארת כללית; הגדרות ייחודיות לספק נשמרות ב־provider override. |
| Evidence before status | Branch pushed אינו Done; רק merge + deploy + live verification סוגרים Slice. |

## גבולות החזון

המערכת לא תהפוך ל־Agent אוטונומי שמבצע פעולות ללא אישור. Tool execution, CRM mutations ו־agent loops יגיעו רק בשלבים מאוחרים, עם confirmation, הרשאות, audit trail ו־idempotency. כרגע מתמקדים בתשתית טקסט מאובטחת ובמעבר הדרגתי של פעולות קיימות.

# 2. מצב נוכחי מאומת

## מה כבר קיים

| רכיב | סטטוס | ראיה / משמעות |
| --- | --- | --- |
| Router vocabulary | קיים | טבלת actionType, cost tier ושרשרת ספקים. |
| Edge Function | LIVE GREEN | ai-gateway ב־Supabase עם JWT verification ON. גרסה v34. |
| Authentication | LIVE GREEN | משתמש Supabase אמיתי נדרש לפני validation. |
| C1 — strict input | LIVE GREEN | חוזי קלט מדויקים; rejection לפני budget/provider. |
| C2 — multi-turn | LIVE GREEN | user/assistant messages + context.summary; normalization ל־Gemini. |
| Budget + rate guard | LIVE GREEN | server-only, atomic reservation, fail closed. |
| Usage logging | LIVE GREEN | content-free counts/status/provider/user metadata בלבד. |
| Gemini adapter | LIVE GREEN | הספק המבצע היחיד כרגע. |
| Action profiles | LIVE GREEN | system/config/output בבעלות השרת. |
| Slice B | LIVE GREEN | jake.draft_message פועל בפרודקשן דרך Gateway; Network 200 וללא Google ישיר. |
| Hosted local engines | LIVE GREEN | PR #75: קריאות localhost חסומות ב־Production כברירת מחדל. נעילה זו קדמה ל־S0C. |
| CRM schema/RLS repair | LIVE GREEN | PR #76 + #77; SQL executed; schema/FK/RLS and persisted CRUD verified. |
| Jake — chat/actions | LIVE — VERIFIED | Gateway-only; פעולות Durable נשארות במסלול אישור. S0A חוסם פעולות Memory-Only/unknown בצד המוצר. S0D: ה־Business Context של החשבון מוזרק על ידי ה־frontend כנתונים בלבד. |
| Outreach — crm.lead_ideas | LIVE — VERIFIED | מסלול מובנה דרך Gateway ושמירת leads נבדקו; לא השתנה ב־S0A/S0C/S0D. |
| Diagnose — crm.diagnose_quote | LIVE — VERIFIED | פלט מובנה דרך Gateway ללא קריאת ספק ישירה; לא השתנה ב־S0A/S0C/S0D. |
| ImageStudio Gateway | LIVE — VERIFIED | שיפור פרומפט ויצירת JPEG דרך Gateway בלבד נבדקו מקצה לקצה; לא השתנו ב־S0A/S0C/S0D. |
| Account Business Context (S0D) | LIVE — VERIFIED (frontend) | פרופיל עסק עמיד לכל חשבון (business_profile, RLS owner-isolation) מורכב ומוזרק על ידי ה־frontend כ־bounded data לפני קריאת ה־Gateway הקיימת. **אין actionType חדש, חוזה חדש או שינוי Edge.** |

## פעולות executable בפרודקשן הנוכחי

- text.copy
- text.crm_message
- text.multi_turn — תשתיתי בלבד
- studio.prompt_enhance
- crm.suggest_next_action
- jake.chat / jake.force_actions / jake.draft_message
- crm.lead_ideas / crm.diagnose_quote

| Release gate | S0D CLOSED / LIVE VERIFIED בפרודקשן על main 22ee2f3. **אין שינוי Edge/Gateway בסלייס זה.** כל מסלולי ה־Gateway שכבר נסגרו נשארים LIVE — VERIFIED; אין לפתוח אותם מחדש ללא ראיה חדשה. |
| --- | --- |

## איפה אנחנו עדיין מקובעים ל־Gemini

הראוטר כבר מכיר שרשראות עתידיות ל־OpenAI, Anthropic, OpenRouter ו־Ollama, אבל נתיב הביצוע ב־Edge Function עדיין מפעיל רק runGeminiText. לכן הוספת API key של ספק אחר אינה מספיקה: צריך Provider Adapter, Execution Registry, מיפוי הודעות, error normalization, עלויות ובדיקות.

## מצב Git הנוכחי

| שדה | מצב |
| --- | --- |
| Gateway PR (Slice B) | #72 — MERGED / DEPLOYED |
| Frontend production | Cloudflare Pages — 22ee2f3bacfc86f026d2ea3a21243a1a4badc6d4 — https://artvalue-product.pages.dev (deploy 69f8a175-08b2-4c65-aac5-c8e4b61d7962; bundle index-DnfLj9lz.js) |
| Preview מאומת (S0D) | f4da6153-abef-4872-8ed0-cc54b6b744ab (branch s0d-preview-22ee2f3; two-account acceptance PASS) |
| Local-engine gate | #75 — MERGED / DEPLOYED (קודם ל־S0C) |
| CRM migrations | #73 + #74 — EXECUTED / VERIFIED |
| CRM hotfix | #76 + #77 — MERGED / SQL EXECUTED / VERIFIED / CRUD PERSISTED |
| S0D migration | 20260724120000_s0d_business_profile.sql — APPLIED / VERIFIED (public.business_profile) |
| Full tests latest | 2759 passed / 1 pre-existing skipped (107 files); production build green |
| עוגן קוד ההשקה הפעיל (S0D) — מקור הפרודקשן | 22ee2f3bacfc86f026d2ea3a21243a1a4badc6d4 (repository main HEAD נפתר חי בכל preflight) |
| Release state | Production online. S0D CLOSED / LIVE VERIFIED; ai-gateway v34 ACTIVE/JWT-on **unchanged**. Jake, Outreach, Diagnose ו־ImageStudio נשארים LIVE — VERIFIED. Frontend rollback cec116b9 נשמר. |

# 3. ארכיטקטורת היעד

## זרימת בקשה מלאה

| שלב | רכיב | תפקיד |
| --- | --- | --- |
| 1 | Product caller | שולח actionType + payload עסקי מצומצם. החל מ־S0D, ה־payload עשוי לכלול Business Context של החשבון כ־bounded data שהורכב על ידי ה־frontend. |
| 2 | Gateway auth | מאמת משתמש לפני עיבוד הקלט. |
| 3 | Per-action contract | מאמת raw payload ודוחה authority injection. |
| 4 | Budget / rate | שומר תקציב וקצב שימוש באופן אטומי. |
| 5 | Execution registry | בוחר adapter לפי מדיניות שרת ויכולת פעולה. |
| 6 | Provider adapter | ממיר normalized messages ל־Gemini/OpenAI/Anthropic וכו׳. |
| 7 | Result contract | מנרמל תוצאה, schema ושגיאות למבנה אחיד. |
| 8 | Usage + observability | שומר מונים, latency, cost/status ללא תוכן. |
| 9 | Product response | מחזיר תוצאה צפויה בלי חשיפת ספק/סוד. |

## חוזה Provider Adapter הרצוי

| ממשק | אחריות |
| --- | --- |
| supports(actionType) | האם הספק מסוגל לבצע את הפעולה וה־output mode. |
| execute(request, profile) | קריאת ספק יחידה עם timeout ומדיניות שרת. |
| normalizeResult(raw) | המרת text/json/usage למבנה Gateway אחיד. |
| normalizeError(error) | קוד כללי ובטוח; אין raw provider errors ללקוח. |
| estimateCost(request) | אומדן לפני reservation ועדכון לאחר שימוש, כשאפשר. |
| capabilities | text, structured JSON, images, streaming, tools — הצהרה בלבד. |

## כלל למניעת קיבוע לספק

| Provider-neutral core | temperature, maxOutputTokens ו־outputMode כלליים; thinkingBudget, responseMimeType או פרמטר ייחודי אחר נשמרים תחת providerOverrides של הספק המתאים. |
| --- | --- |

## Fallback אינו רק רשימת ספקים

Fallback ייכנס רק אחרי שני adapters עובדים. הוא דורש החלטות על retryable errors, latency, הזמנת תקציב, מניעת חיוב כפול, usage rows, idempotency ותיעוד איזה ספק הצליח. עד אז: ספק אחד לכל בקשה, ללא browser fallback וללא קריאה שנייה סמויה.

# 4. מפת דרכים — Milestones

| ID | אבן דרך | סטטוס | תוצר סופי |
| --- | --- | --- | --- |
| M0 | Gateway foundation | הושלם | Router, Edge, auth, budget, usage, C1, C2. |
| M1 | Slice B — Jake draft | הושלם | Gateway + frontend deployed; authenticated live smoke green. |
| R3 | CRM schema + RLS hotfix | LIVE GREEN | SQL + schema/FK/RLS + profile lockdown verified; persisted client CRUD green; toast copy follow-up. |
| R4 | Local engines retirement | R4.1 LIVE GREEN | Fooocus/WorkflowStudio retired in production; shared image/Ollama removal deferred to reviewed slices. |
| UX-P1 | Public Readiness + UI | מתוכנן | Audit והסרה בטוחה של התאמות אישיות/מקומיות, הודעות, copy ו־dead states; ללא ערבוב עם runtime retirement. |
| M2 | Provider-neutral execution core | CORE CLOSED / 4 PRODUCT LANES LIVE VERIFIED | Provider-neutral core וארבעת המסלולים Jake, Outreach, Diagnose ו־ImageStudio חיים דרך Gateway; Gemini only, no fallback. |
| M3 | OpenAI adapter | מתוכנן | Server secret, normalized text/JSON, errors, cost/tests, live smoke. |
| M4 | Anthropic adapter | מתוכנן | Claude messages/system mapping, errors, usage/tests, live smoke. |
| M5 | Routing and fallback policy | מתוכנן | Capability routing; retry policy; budget semantics; fallback off by default. |
| M6 | Migrate product actions | LIVE — 4 LANES VERIFIED / FROZEN | Jake, Outreach, Diagnose ו־ImageStudio הועברו ואומתו. כל החלטת migration נוספת היא סלייס נפרד ואינה נפתחת עקב S0A/S0C/S0D. |
| M7 | Business context layer | עתידי | Per-business bounded context, privacy classes, tenant isolation, versioned prompts — **בשכבת ה־Gateway**. S0D סיפק Business Context ברמת המוצר/frontend (הזרקה כ־bounded data), ואינו מהווה את שכבת ה־Gateway M7. עבודת Gateway כלשהי כאן נשארת סלייס עתידי מאושר בנפרד. |
| M8 | Cost & observability | עתידי | Latency, actual token/cost reconciliation, dashboards, alerts, provider health. |
| M9 | Approved tool execution | עתידי | Tools, confirmation cards, permissions, audit, idempotency; no autonomous mutation. |
| M10 | Productization | עתידי | Multi-tenant policy, admin controls, customer onboarding and operational runbooks. |

## Definition of Done לכל Milestone

- Scope מאושר מראש וקבצים מותרים מוגדרים.
- Implementation בענף ייעודי עם rollback tag.
- ChatGPT בודק את ה־diff בפועל ולא מסתמך על הסיכום בלבד.
- Full tests עוברים; אין tests מוחלשים או קבצים בלתי צפויים.
- PR ממוזג רק באישור Nathan; main מאומת אחרי merge.
- Deployment נדרש בוצע, כולל frontend/Edge לפי השינוי.
- Authenticated success + rejection smokes + usage/budget verification.
- המסמך מעודכן עם ראיות, סיכונים והצעד הבא.
- רק אז: LIVE GREEN / CLOSED.

# 5. לוח זמנים ביצוע — גרסה 1.4

הנחת עבודה: סשן טכני ממוקד אחד בכל יום עבודה ישראלי (א׳–ה׳), ללא חסם חיצוני מהותי. זהו לו״ז ניהולי ולא הבטחה קשיחה. Slice שלא עבר live verification מזיז את המשימות הבאות; אין דילוג על שערי איכות כדי לעמוד בתאריך.

| תאריך | Milestone | עבודה | אחראי | שער יציאה |
| --- | --- | --- | --- | --- |
| ה׳ 16.07 | M1 | Slice B merge + ai-gateway deploy + preview | כולם | הושלם |
| ו׳ 17.07 | Release | Production deploy, localhost gate ו־Gateway smoke | כולם | הושלם: f53d638 |
| ש׳ 18.07 | R3 | Live schema audit, RLS audit, migration implementation | Fable + ChatGPT + Nathan | PR #76 READY |
| א׳ 19.07 | R3 | Merge, owner SQL, schema/FK/RLS verification | Nathan + ChatGPT | CRM contract repaired |
| ב׳ 20.07 | R3 | Persisted client CRUD + quote/transaction smoke | Nathan + ChatGPT | Release CLOSED |
| ג׳ 21.07 | R4 | Local Engines Retirement Audit — read-only | ChatGPT + Fable | מפת הסרה מאושרת |
| ד׳ 22.07 | R4 | הסרת lanes מקומיים מה־UI/runtime | Fable | Cloud/Gateway-only preview |
| ה׳ 23.07 | R4 | Review, regression, production deploy | כולם | R4 LIVE GREEN |
| א׳ 26.07 | M2 | ADR: Provider Adapter Interface | ChatGPT + Fable | חוזה provider-neutral |
| ב׳ 27.07 | M2 | Execution Registry implementation | Fable | ללא שינוי התנהגות |
| ג׳ 28.07 | M2 | Review, merge, deploy, regression | כולם | M2 LIVE GREEN |
| ד׳ 29.07 | UX-P1 | Public-readiness UI audit + inventory | Nathan + ChatGPT + Fable | Scope ומפת מסכים מאושרים |
| ה׳ 30.07 | UX-J1 | Jake UX Refresh specification | Nathan + ChatGPT + Fable | UI scope מאושר |
| א׳ 02.08 | UX-J1 | Implementation + mobile/desktop QA | Fable | Jake UX READY |
| א׳ 02.08 | M3 | OpenAI adapter — contract + implementation | ChatGPT + Fable | Canary READY |
| ב׳ 03.08 | M3 | Review, deploy ו־authenticated smoke | כולם | OpenAI LIVE GREEN |
| ג׳ 04.08 | M4 | Anthropic adapter — contract + implementation | ChatGPT + Fable | Canary READY |
| ד׳ 05.08 | M4 | Review, deploy ו־usage verification | כולם | Anthropic LIVE GREEN |
| ה׳ 06.08 | Control | Fallback ADR + roadmap reprioritization | ChatGPT + Nathan | M5 scope מאושר |

> הערה: לוח הזמנים לעיל הוא הערכה ניהולית מקורית מ־M2/M3/M4. בפועל התקדמה העבודה למסלול S0A→S0B→S0C→S0D (הקשחת מוצר ואמון) לפי החלטות Nathan; אבני הדרך M3+ נשארות מתוכננות וממתינות לבחירת הסלייס הבא.

## קצב מעבר ל־Milestones הבאים

| חלון | מיקוד |
| --- | --- |
| 09–20.08 | M5 — routing/fallback מבוקר, כבוי כברירת מחדל עד live simulation. |
| 23.08–03.09 | M6 — מעבר מדורג של פעולות מוצר, פעולה אחת בכל Slice. |
| 06–17.09 | M7–M8 — context פר־עסק בשכבת Gateway, observability ועלות בפועל. |
| לא לפני M8 | M9 — tool execution מאושר; יתחיל רק אחרי threat model והרשאות. |

| Schedule rule | כל חריגה של יותר מיום עבודה מתועדת ביומן השינויים עם סיבה, השפעה ותאריך יעד חדש. |
| --- | --- |

# 6. Backlog מפורט לפי Milestone

## R3 — סגירת CRM production hotfix

- Pull main לאחר merge #76 והעתקת המיגרציה השלמה.
- Zero-row preflight חייב לעבור לפני כל שינוי.
- אימות 14 עמודות, 5 FKs, 5 policies ו־RLS.
- Client create אמיתי: POST success → reload → row נשמר.
- Quote/transaction structural smokes ורק אז release CLOSED.

## R4 — פרישת מנועים מקומיים

- Audit מלא הושלם: אין local fetch פעיל בפרודקשן כל עוד VITE_ENABLE_LOCAL_ENGINES אינו true.
- R4.1: הסרת Fooocus ו־WorkflowStudio מה־UI/routes עם legacy redirects וללא נגיעה בקבצים משותפים.
- R4.2–R4.3: poster ו־ComfyUI image lanes רק בסלייסים נפרדים; חסרה חלופת ענן ליכולות מתקדמות.
- R4.4: Ollama branches בתוך frozen Creative V1 דורשים אישור מפורש או דחייה בטוחה.
- R4.5: env/docs/gate cleanup אחרון בלבד, אחרי שכל runtime consumer הוסר.

## UX-P1 — הכנת המוצר לציבור

- Audit קריאה בלבד של כל המסכים, הניווט, ההודעות, demo/local states והטקסטים המותאמים ל־Nathan.
- הפרדה בין בעיית UI/copy לבין תלות runtime: אין להסיר יכולת או לשנות Gateway בתוך Slice עיצובי.
- מיפוי לכל פריט: keep, generalize, hide, replace או retire — עם סיבה ו־rollback.
- סלייסים קטנים לפי אזור מוצר; Preview ו־QA בדסקטופ ובמובייל לפני Production.
- Jake יקבל UX Refresh נפרד רק לאחר שה־execution/provider layer יציב וב־scope מאושר.

## M2 — Provider-neutral execution core

- M2A מתחיל ב־read-only audit + ADR: מיפוי execution path הנוכחי ונתיב chatJake legacy/demo.
- ADR שמפריד בין ActionProfile כללי ל־providerOverrides.
- ממשק adapter אחיד; registry מבוסס capabilities.
- Gemini עובר דרך אותו registry בלי שינוי תוצאה.
- אין fallback ואין provider חדש בשלב זה.
- Regression מלא לכל C1/C2/Slice B.

## M3 — OpenAI

- Adapter server-only; secret לא מגיע ל־frontend.
- מיפוי user/assistant/system ו־structured output.
- Error normalization, timeout, usage/cost estimation.
- פעולת canary אחת לפני הרחבת actions.
- Authenticated smokes ותיעוד rollback.

## M4 — Anthropic

- Adapter server-only ומיפוי system/messages נכון ל־Claude.
- התאמת max tokens, structured output policy ו־sanitized errors.
- Canary action, tests, deploy ו־live verification.
- אין fallback אוטומטי עדיין.

## M5 — Routing / fallback

- Provider capability matrix ו־server-owned priority.
- רק שגיאות retryable מפעילות ניסיון נוסף.
- מקסימום provider calls מוגדר לכל בקשה.
- Budget reservation ו־usage audit לכל ניסיון ללא double counting.
- Fallback כבוי כברירת מחדל עד live simulation.

## M6–M10 — מוצר והתרחבות

- בחירת actions לפי ערך עסקי, סיכון ועלות.
- Context per business עם versioning ו־privacy classification — בשכבת ה־Gateway (M7). S0D סיפק את הרובד ברמת ה־frontend/מוצר; שכבת ה־Gateway נשארת עתידית.
- Cost dashboard, alerts, provider health ו־quality evaluation.
- Tool execution רק עם confirmation, permissions, audit ו־idempotency.
- Multi-tenant packaging ו־runbooks ללקוחות ArtValue.

# 7. ניהול סיכונים והחלטות

| ID | סיכון | השפעה | סבירות | בקרה |
| --- | --- | --- | --- | --- |
| R1 | קיבוע ל־Gemini | גבוהה | בינונית | M2 מפריד provider overrides ומוסיף execution registry. |
| R2 | Fallback גורם לחיוב כפול | גבוהה | בינונית | אין fallback לפני M5; reservation/usage לכל attempt. |
| R3 | Prompt injection דרך context | גבוהה | בינונית | bounded data, delimiters, server instruction; בעתיד context classes. **S0D מזריק Business Context כ־bounded data בצד ה־frontend; חוזי ה־Gateway והבידוד לא נחלשו.** |
| R4 | מסמך מתיישן | בינונית | גבוהה | עדכון בסוף כל יום + verification date + change log. |
| R5 | דוח Fable אינו תואם diff | גבוהה | בינונית | ChatGPT בודק branch diff לפני merge. |
| R6 | סודות מועתקים לצ׳אט | גבוהה | נמוכה | טוקנים נשארים במשתנה מקומי; לעולם לא במסמך/צ׳אט. |
| R7 | Scope creep | בינונית | גבוהה | Slice אחד בלבד; safe stop לפני קובץ לא מאושר. |
| R8 | Context/response מעל גבולות | בינונית | בינונית | חוזים קשיחים; builders bounded; rejection גלוי וללא truncation. |
| R9 | שינוי מודל פוגע באיכות/תאימות | בינונית | בינונית | Provider pinning; Jake דורש thinkingConfig תומך; smoke אחרי שינוי GEMINI_MODEL. |
| R10 | Agent מבצע ללא אישור | קריטית | נמוכה | M9 בלבד; confirmation + permission + audit. |
| R11 | Schema drift בין repo ל־Production | קריטית | בינונית | Versioned migrations + live column/FK audit + persisted CRUD smoke. S0D migration אומת מול ה־remote. |
| R12 | הסרת local lane מוחקת יכולת ללא חלופת ענן | גבוהה | גבוהה | סלייסים קטנים; UI dead-ends תחילה; image/video/poster נדחים עד החלטת feature-removal או Gateway replacement. |
| R13 | התאמות אישיות/מקומיות מוצגות למשתמש ציבורי | גבוהה | גבוהה | UX-P1 audit; סיווג keep/generalize/hide/replace/retire; Preview QA נפרד ללא שינוי runtime. |
| R14 | RLS policy בשם מטעה אך פתוחה | קריטית | נמוכה | Policy assertions; auth.uid ownership; service role ללא policy ציבורית. **S0D: business_profile_own מאמת auth.uid()=user_id ב־USING ו־WITH CHECK.** |
| R15 | Legacy direct-Gemini lanes נשארים במצב דמו לאחר הסרת מפתח הדפדפן | בינונית | גבוהה | J3B משחזר Diagnose דרך Gateway; Creative/image מטופלים בסלייסים נפרדים עם החלטת מוצר מפורשת. |
| R16 | Gateway lane עובד אך תג UI עדיין מציג מצב הדגמה | בינונית | גבוהה | סלייס UX נפרד משנה רק אינדיקציה מטעה לאחר audit; אין לערבב עם migration/runtime. |
| R17 | ערבוב Business Context בין חשבונות | קריטית | נמוכה | S0D: RLS owner-isolation (business_profile_own); ה־frontend מרכיב הקשר לחשבון הפעיל בלבד; אימות שני חשבונות עבר בפרודקשן. |
| R18 | הצגת הצלחת שווא בשמירת Business Context | גבוהה | בינונית | S0D: שמירה persist-first — הצלחה רק לאחר אישור Supabase; כשל → toast שגיאה, ללא שורת DB. |

## החלטות קבועות — Decision Log

| ID | החלטה | מצב |
| --- | --- | --- |
| D-001 | ה־frontend שולח actionType ולא provider/model. | Locked |
| D-002 | JWT verification נשאר ON. | Locked |
| D-003 | אין raw content ב־ai_usage. | Locked |
| D-004 | אין browser fallback לאחר Gateway failure. | Locked |
| D-005 | text.multi_turn נשאר תשתיתי עד החלטה אחרת. | Active |
| D-006 | Slice B שומר draftWithJake shape; רק Jake מחזיק thinkingBudget: 0 server-owned. | Active |
| D-007 | Provider-specific config לא יורחב לליבה הכללית ללא override ברור. | New |
| D-008 | כל ספק חדש מתחיל ב־canary action לפני הרחבה. | New |
| D-009 | Fallback יופעל רק אחרי שני adapters live green. | New |
| D-010 | Hosted product עובר ל־Cloud/Gateway בלבד; local engines יפרשו ב־R4. | Locked |
| D-011 | Jake UX Refresh יבוצע רק אחרי M2 וב־Slice נפרד. | Locked |
| D-012 | בצ׳אט מציגים PR link + summary בלבד; body מלא רק לפי בקשה. | Workflow |
| D-013 | Public Readiness ו־UI הם מסלול נפרד: אין לערבב ניקוי copy/מסכים עם הסרת runtime או שינוי Gateway. | Locked |
| D-014 | M2 יתקדם לפי Option C: demo-copy micro-slice → provider-neutral core → Jake chat Gateway migration. | Locked |
| D-015 | jake.chat שומר MAX_CONTEXT_CHARS=12,000; אין truncation שקט ואין העלאת גבול ללא ראיות. | Locked |
| D-016 | Jake persona/action protocol הם server-owned; ה־frontend שולח messages ו־bounded context כנתונים בלבד. | Locked |
| D-017 | Execution Registry שומר immutable internal adapter snapshot; לא שומר caller-owned mutable adapter reference. | Locked |
| D-018 | provider='none' הוא routing sentinel ולא executable provider; registry לא ירשום או יבחר אותו. | Locked |
| D-019 | Slice 2C מחבר את Gemini בלבד ל־registry; same runGeminiText reference/arguments וללא fallback. | Locked |
| D-020 | requiredGatewayCapabilities מאמת runtime profile.outputMode; drift נכשל סגור ולא נפתר בהסקה שקטה. | Locked |
| D-021 | index.ts הוא importer ה־runtime היחיד של Execution Registry; Gemini adapter מחזיק direct function references בלבד. | Locked |
| D-022 | Jake free-chat עובר ל־Gateway בלבד; local-Ollama brain וה־cloud→local browser fallback נפרשים במסלול זה. | Locked |
| D-023 | chatJake ו־forceActionsJake יועברו יחד באותו מאמץ דו־שלבי כדי לא להשאיר browser Gemini key במסלול ההצעה. | Locked |
| D-024 | טקסט actionsGuide/confirmGuide ישוכפל זמנית בפרופיל השרת, עם verbatim drift-guard מול jakePack. | Locked |
| D-025 | פלט jake.force_actions ינורמל דטרמיניסטית בצד השרת לבלוק actions תקין יחיד או []; תיקון prompt בלבד אינו שער אמינות. | Locked |
| D-026 | resultTransform הוא ציר post-processing נפרד מ־parsePolicy: כשל נרמול actions מחזיר [] בהצלחה, אינו הופך ל־502 ואינו משנה raw usage counts. | Locked |
| D-027 | crm.lead_ideas הוא structured action בבעלות השרת; Edge נפרס תמיד לפני ה־frontend ואין browser fallback. | Locked |
| D-028 | ה־bundle הציבורי אינו מכיל Google API-key pattern; קוד legacy URL עדיין קיים אך נתיבי Diagnose/Creative הישירים פועלים כדמו עד migration/retirement. | Verified |
| D-029 | J3B שומר את ממשק diagnoseQuote ואת Diagnose.jsx ללא שינוי; system/schema/message/result עוברים לבעלות השרת תחת crm.diagnose_quote. | Approved |
| D-030 | crm.diagnose_quote נסגר LIVE GREEN; תג ״מצב הדגמה״ ב־Diagnose הוא cosmetic בלבד ויטופל בסלייס נפרד ללא שינוי runtime. | Locked |
| D-031 | S0A הוא capability containment בצד ה־frontend בלבד. חוזי Gateway, adapters, profiles, prompts ו־Edge נשארים ללא שינוי; פעולות Jake שאינן Durable נכשלות סגור בצד המוצר. | Locked |
| D-032 | Hosting ופריסות יתועדו ב־ArtValue Release & Hosting Runbook נפרד. Cloudflare Pages Direct Upload הוא המנגנון הקיים; היעדר wrangler.toml או GitHub Actions הוא מכוון. | Locked |
| D-033 | S0C ו־S0D הם שינויי מוצר/frontend מעל ה־Gateway. S0C הגביל את ה־Edge לשני קבועי טקסט של פרסונת Jake בלבד; **S0D לא שינה את ה־Edge כלל.** ה־Business Context של החשבון (business_profile, RLS owner-isolation) מורכב ומוזרק על ידי ה־frontend כ־bounded data לפני קריאת ה־Gateway הקיימת — ללא actionType חדש, חוזה חדש, שינוי payload/routing/validation/usage/profile או deploy ל־Edge. | Locked |
| D-034 | ״Account-aware Growth & Creative Context״ הוא סלייס מוצר עתידי מאושר בנפרד. הוא אינו מחייב ואינו מתזמן עבודת חוזה Gateway; אם וכאשר יידרש שינוי Gateway, הוא ייפתח כסלייס נפרד עם scope, ראיות ואישור Nathan. | Locked |

# 8. פרוטוקול העבודה היומי

## תחילת יום

- פותחים את המסמך ובודקים Current Control Panel, milestone פעיל והצעד הבא.
- מאמתים main hash, branch וה־working tree לפני מתן משימה ל־Fable.
- מגדירים Slice יחיד: מטרה, קבצים מותרים, frozen files, tests ו־safe stops.
- הודעת Fable כוללת RETURN ONLY עם Copy-back ממוקד.

## במהלך היום

- Fable מיישם בענף ייעודי; אינו ממזג או פורס בלי אישור.
- Nathan מעתיק ל־ChatGPT רק READY/BLOCKERS/Copy-back.
- ChatGPT בודק את ה־diff האמיתי, מזהה סיכונים ונותן החלטת review.
- אם יש תיקון — נשארים באותו Slice; לא מתחילים הבא במקביל.

## סוף יום — עדכון חובה

- Status: מה נסגר בפועל ומה עדיין פתוח.
- Evidence: commit, PR, tests, deployment, smoke ו־SQL read-only אם נדרש.
- Decisions: החלטות חדשות, שינוי scope או דחיית Milestone.
- Risks: חסמים וסיכונים שהתגלו.
- Schedule: האם התאריך נשמר; אם לא — למה ומה היעד החדש.
- Next action: משימה אחת מדויקת ליום העבודה הבא.
- Document version: העלאת minor version ועדכון Change Log.

| אחריות | ChatGPT הוא העורך והמפקח על המסמך. Fable/Claude מספקים ראיות טכניות; Nathan מאשר החלטות, merge ו־deploy. |
| --- | --- |

## מה לא נכנס למסמך

- JWT, refresh token, anon/publishable key, API keys או Authorization headers.
- Raw prompts, תשובות משתמשים או נתוני לקוחות פרטיים.
- טענת DONE ללא ראיה מאומתת.
- תוכניות חדשות שלא עברו החלטת scope.

# 9. תבנית עדכון יומי

| שדה | מה ממלאים |
| --- | --- |
| תאריך / גרסה | YYYY-MM-DD / vX.Y |
| Main בתחילת היום | commit hash |
| Milestone / Slice | M# / שם הסלייס |
| מטרת היום | תוצאה אחת מדידה |
| מה בוצע | קבצים/שינוי מדויק |
| Evidence | commit, PR, test count, deploy, smoke |
| מה לא בוצע | פתוח / נדחה / בוטל |
| חסמים | None או תיאור + בעלים |
| סיכונים חדשים | השפעה / סבירות / mitigation |
| החלטות | ID חדש ל־Decision Log אם נדרש |
| השפעה על לו״ז | ללא שינוי / תאריך חדש + סיבה |
| סטטוס סוף יום | NOT STARTED / IN PROGRESS / REVIEW / MERGED / DEPLOYED / LIVE GREEN / BLOCKED |
| המשימה הבאה | צעד יחיד ומדויק |

## תבנית Copy-back ש־Fable מחזיר

- READY FOR REVIEW: YES/NO
- Blockers / safe-stop conditions
- Starting hash, branch, commit, pushed state
- Exact files changed and forbidden files untouched
- Architecture/contract implemented
- Security and compatibility evidence
- Full tests + focused tests
- Deployment and live-smoke requirements
- Copy-back section for ChatGPT

# 10. Current Control Panel

| תאריך בקרה | 26.07.2026 |
| --- | --- |

| Milestone פעיל | אין Milestone Gateway פעיל. S0E — Guided Business Onboarding נסגר LIVE **ללא שינוי Gateway**; בחירת הסלייס הבא ממתינה להחלטת Nathan. |
| --- | --- |

| שער נוכחי | ai-gateway v34 ACTIVE עם verify_jwt=true. Jake, Outreach, Diagnose ו־ImageStudio LIVE — VERIFIED ומוקפאים. אין שינוי נוסף ללא ראיה והיקף מאושר. |
| --- | --- |

| שדה | מצב נוכחי |
| --- | --- |
| עוגן קוד ההשקה הפעיל (S0E) — מקור הפרודקשן | 272fc148984b68c26aa46d24e1cdefc2878cddb9 (repository main HEAD נפתר חי בכל preflight) |
| Production frontend | Cloudflare Pages production — deploy 4b86993d-5b4f-4587-87ea-17d68a10adef; source 272fc148984b68c26aa46d24e1cdefc2878cddb9; https://artvalue-product.pages.dev; HTTPS 200; bundle index-DRaTE7f5.js. |
| Pull Request | #103 — MERGED; S0E guided onboarding (merge c10ac55). #104 — MERGED; dual-tour cloud containment, head-gated to d371630; merge-commit 272fc14 (parents c10ac55 + d371630). |
| Current blocker | None for S0E. Onboarding is closed and LIVE VERIFIED, and it was never a Gateway blocker. Remaining product blockers (module durability, packaging/support) are outside the Gateway. |
| Security state | ai-gateway v34 ACTIVE; verify_jwt=true. Strict contracts, content-free usage logging and Gateway-only provider access retained. **S0E changed nothing in the Edge/Gateway.** |
| Public UI finding | Guided business onboarding is live over the durable per-account Business Context (RLS owner-isolation) and the legacy demo tour is manual-only in authenticated cloud mode. Growth OS is contained (5 routes BetaUnavailable); Outreach remains LIVE. Projects/Inventory/Templates/Activity remain unavailable; Local engine URLs remain gated off in hosted production. |
| Architecture decisions | The account Business Context is assembled and injected by the frontend chat/draft seam before the existing Gateway call. The onboarding first-value CTA only prefills the existing frontend Jake composer. No new actionType, contract, payload, routing, validation, usage, or profile change; no Edge deploy. |
| Do not do yet | Do not reopen LIVE — VERIFIED lanes or change router/contracts/payloads/profiles without new evidence and an approved bounded scope. Account-aware Growth & Creative Context is a future, separately approved product slice; it does not schedule Gateway contract work. **No future Gateway work may be inferred or scheduled from S0E.** |
| Next evidence expected | Product next slice remains PENDING NATHAN DECISION; no Gateway implementation is authorized. |
| Next owner action | Use Business OS Roadmap v0.8 for product priority and this v5.4 roadmap for AI infrastructure. Require separate approvals for every future merge and deploy. |
| Closure target | ACHIEVED — S0E frontend deployed and verified with zero Gateway/Edge change; ai-gateway v34 unchanged; all previously released AI lanes remain LIVE — VERIFIED. |

## Change Log

| גרסה | תאריך | שינוי | עורך |
| --- | --- | --- | --- |
| 5.4 | 26.07.2026 | **S0E — Guided Business Onboarding CLOSED / LIVE VERIFIED with ZERO Gateway/Edge change.** PR #103 merged at main c10ac55; corrective PR #104 merged; active application release source 272fc14; corrected Preview ea0dcc02 accepted on an unconfigured account; Production frontend 4b86993d serves index-DRaTE7f5.js. **ai-gateway remains v34 with JWT verification ON — not redeployed.** Router, action types, contracts, request/response payloads, provider routing, input validation, usage/budget controls, confirmation behavior and all Gateway profiles are UNCHANGED. The onboarding first-value CTA only prefills the existing frontend Jake composer — it does not call the Gateway, does not auto-send, does not execute an action and does not alter the Gateway contract. Business Context continues to reach Jake through the existing approved frontend context-injection seam (D-033). **No migration; no schema change. No future Gateway work should be inferred or scheduled from S0E.** Tests 111 files / 2885 passed / 1 pre-existing skip. | ChatGPT |
| 5.3 | 24.07.2026 | S0D — Business Context CLOSED / LIVE VERIFIED **with ZERO Gateway/Edge change.** PR #101 merged at main 22ee2f3; migration 20260724120000_s0d_business_profile.sql APPLIED; Preview f4da6153 two-account acceptance PASS; Production frontend 69f8a175 serves index-DnfLj9lz.js. ai-gateway remains v34 with JWT verification ON. Router, action types, contracts, request/response payloads, provider routing, input validation, usage/budget controls, confirmation behavior and all Gateway profiles are UNCHANGED. The approved account Business Context (business_profile, RLS owner-isolation) is assembled and injected by the frontend before the existing Gateway call. Decisions D-033 (S0D no-Edge-change / frontend injection) and D-034 (Account-aware Growth & Creative Context is a future separately-approved product slice that does not schedule Gateway work) recorded; risks R17/R18 added. Tests 107 files / 2759 passed / 1 pre-existing skip. | ChatGPT |
| 5.2 | 24.07.2026 | S0C CLOSED / LIVE VERIFIED. PR #100 merged at main 3ee62aee; ai-gateway v34 deployed with JWT verification retained. Jake persona is now the generic ArtValue business assistant and draft_message no longer forces a personal signature. Router, contracts, payloads, routing, validation, budget controls, confirmation flow and all non-Jake profiles remained unchanged. Frontend Production cec116b9 serves index-CE6IJ-rJ.js. | ChatGPT |
| 5.1 | 22.07.2026 | S0A CLOSED / LIVE VERIFIED. PR #98 merged at main 7066520 and Cloudflare production deploy 4cb17aee verified. S0A was frontend-only False-Success Containment: Tasks read-only, memory-only modules unavailable, Jake fail-closed including mark_paid and mixed batches, and completed_paid no longer creates phantom income in cloud. Gateway/Edge/SQL/contracts were untouched; Jake, Outreach, Diagnose and ImageStudio remain LIVE — VERIFIED. Release & Hosting Runbook decision recorded. | ChatGPT |
| 5.0 | 20.07.2026 | Added the complete M2 J3C read-only audit prompt. Scope separates truthful Gateway UI indicators, proven dead-code retirement, frozen Creative decisions, Image/provider decisions, and the exact browser-key removal gate. No implementation authority granted. | ChatGPT |
| 4.9 | 20.07.2026 | M2 J3B CLOSED / LIVE GREEN. PR #89 merged at a731775; ai-gateway v26 deployed Edge-first with verify_jwt ON. Authenticated valid, invalid-payload and 401 smokes passed before frontend release. Production Diagnose rendered real structured output for full and partial input with zero direct Google requests; content-free ai_usage and Outreach/Jake regressions verified. Cloudflare deployment e8c30f7d serves index-BHehZsHR.js. Misleading demo badge recorded as cosmetic follow-up; J3C not started. | ChatGPT |
| 4.8 | 20.07.2026 | M2 J3A CLOSED / LIVE GREEN. PR #88 merged at e2c5789; ai-gateway deployed before the frontend; authenticated crm.lead_ideas success, strict rejection and unauthenticated smokes passed. Production Outreach generated and persisted leads with no direct Google request; content-free ai_usage rows and Jake regression were verified. Public deployment serves index-CZUkqoVK.js and a read-only bundle scan found no Google API-key pattern. J3B diagnoseQuote → crm.diagnose_quote is now the active authorized bounded slice. | ChatGPT |
| 4.7 | 20.07.2026 | M2 J2 CLOSED / LIVE GREEN. GitHub main verified at 21a6d4e; frontend production deployed to Cloudflare Pages. Owner production evidence confirmed proactive briefing retained, authenticated ai-gateway fetch HTTP 200, grounded information response with no action card, proposal + confirmation before execution, CRM client creation and persistence after refresh. Server ai-gateway v24 remained byte-identical; no Edge redeploy required. Next recommended gate is M2 J3 read-only audit; implementation not authorized. | ChatGPT |
| 4.3 | 20.07.2026 | M2 J2 PR #86 opened and merged at main 95ee698 after correction review. chatJake and forceActionsJake now map byte-exact to the deployed Gateway actions; direct browser Gemini/Ollama executors were removed while draftWithJake and Assistant confirmation semantics stayed pinned. Full suite 2375/1 and build green. Frontend preview/production release and authenticated network smoke remain before LIVE GREEN. | ChatGPT |
| 4.2 | 20.07.2026 | M2 J1 CLOSED/LIVE GREEN. ai-gateway v24 confirmed active at 05:28 UTC. Fresh authenticated force-actions smoke returned one canonical fenced add_client block with no prose/checkmark; information-only request returned exactly []; post-correction jake.chat returned 200/completed via Gemini with the grounded answer of two clients. PowerShell mojibake is display-only. J2 is now the active milestone. | ChatGPT |
| 4.1 | 20.07.2026 | PR #85 opened after a four-file diff check and merged with expected head 608b173. Main is now 09eceff; deterministic force-actions normalization is CLOSED/MERGED. Production function v23 remains unchanged until the owner redeploys ai-gateway and completes the version-24 live smokes. | ChatGPT |
| 4.0 | 20.07.2026 | Force-actions deterministic normalizer implemented and final-reviewed on pushed branch 608b173. resultTransform retained as the correct server-owned post-processing axis; raw usage counts remain unchanged, unsafe output fails closed to [], all other profiles remain null/byte-compatible, 23 focused tests and full suite 2346/1 passed. PR is ready but not opened/merged/deployed. | ChatGPT |
| 3.9 | 20.07.2026 | Force-actions correction audit accepted. Root cause is the inherited conflict between canonical prose/checkmark instructions and the trailing block-only instruction. Decision D-025 locks deterministic server normalization to one valid fenced actions block or []; prompt-only strengthening and structured-output redesign rejected. | ChatGPT |
| 3.8 | 20.07.2026 | Authenticated J1 smokes: jake.chat passed 200/completed with correct grounded answer; jake.force_actions passed execution and returned a valid add_client action, but prepended prose/checkmark contrary to the actions-only contract. No action executed. J1 remains partial green; bounded prompt correction required before J2. | ChatGPT |
| 3.7 | 20.07.2026 | M2 J1 ai-gateway deployment succeeded from merged main c97827d with JWT settings unchanged and all required assets uploaded. No frontend deployment is needed. Next: confirm function version and authenticated live-smoke jake.chat + jake.force_actions. | ChatGPT |
| 3.6 | 20.07.2026 | PR #84 merged successfully at c97827d. M2 J1 is CLOSED/MERGED with server-only jake.chat and jake.force_actions; frontend remains untouched. Next gate: deploy ai-gateway with JWT unchanged and run authenticated live smokes before J2. | ChatGPT |
| 3.5 | 20.07.2026 | M2 J1 delivered on branch m2/jake-server-actions at 126a8c4. Server-only jake.chat and jake.force_actions added with strict contracts, server-owned profiles and byte-for-byte Jake-pack drift guards; 35 focused tests, full suite 2323/1, build green, frontend/frozen files untouched. Ready for merge approval. | ChatGPT |
| 3.4 | 19.07.2026 | M2 Jake free-chat audit accepted. Product decisions locked: retire local-Ollama/browser fallback for Jake chat; migrate chatJake and forceActionsJake together; allow temporary server duplication of actionsGuide/confirmGuide with verbatim drift guard. Next: J1 server-only actions, frontend frozen. | ChatGPT |
| 3.3 | 19.07.2026 | M2 Slice 2C CLOSED/LIVE GREEN. Supabase function v22 deployed at 18:27 UTC; authenticated Jake smokes at 18:39/18:42 returned 200/completed with content-free counts; day/month/minute counters reserved exactly 0.002 per valid call. Next: read-only Jake chat Gateway migration audit. | ChatGPT |
| 3.2 | 19.07.2026 | M2 Slice 2C authenticated Jake drafting live smoke passed: ai-gateway returned 200 and produced a real Hebrew WhatsApp draft rather than demo copy. Structured JSON and usage/budget verification remain before LIVE GREEN. | ChatGPT |
| 3.1 | 19.07.2026 | M2 Slice 2C ai-gateway deployed successfully after merge ff11d86; all 12 function assets uploaded with JWT verification unchanged. Authenticated text/json/multi-turn live smoke and usage/budget verification remain before LIVE GREEN. | ChatGPT |
| 3.0 | 19.07.2026 | PR #83 merged at ff11d86. M2 Slice 2C Gemini adapter + execution-registry runtime wiring CLOSED/MERGED with 22 focused tests, full suite 2288/1 and no frontend/provider fallback change. Next: redeploy ai-gateway and authenticated live smoke. | ChatGPT |
| 2.9 | 19.07.2026 | M2 Slice 2C read-only audit accepted. Bounded Gemini registry wiring approved with frozen index.ts authorization, byte compatibility, runtime outputMode drift guard, no fallback and no frontend authority. | ChatGPT |
| 2.8 | 19.07.2026 | PR #82 merged at bce7f8a. M2 Slice 2B pure execution registry CLOSED/MERGED; immutable snapshots, provider none rejection and zero wiring verified. Next: Slice 2C read-only Gemini wiring audit. | ChatGPT |
| 2.7 | 19.07.2026 | M2 Slice 2A read-only audit accepted. Slice 2B contract locked: pure factory registry, immutable internal adapter snapshots, provider none rejected as non-executable, no fallback/wiring/deploy. | ChatGPT |
| 2.6 | 19.07.2026 | PR #81 merged at 6eca551. M2 Slice 1 pure provider contracts CLOSED/MERGED with 44 focused tests and zero runtime wiring; no deploy required. Next: M2 Slice 2 pure execution registry audit. | ChatGPT |
| 2.5 | 19.07.2026 | PR #80 merged at bc802c0; Jake public demo copy passed preview and production QA. M2 Slice 0 CLOSED/LIVE GREEN; next Slice 1 pure provider contracts. | ChatGPT |
| 2.4 | 19.07.2026 | M2A audit accepted. Option C locked; 12k no-truncation context and server-owned Jake action protocol decisions recorded. Next: isolated demo-copy hotfix. | ChatGPT |
| 2.3 | 19.07.2026 | R4.1 deployed and production-verified at 0e69032. Jake free-chat demo finding recorded; next gate is M2A read-only provider-neutral audit/ADR. | ChatGPT |
| 2.2 | 19.07.2026 | R4.1 build + hosted preview verified. Public-readiness UI track added after Ollama/GPU/ComfyUI and personalized copy findings; production deploy remains. | ChatGPT |
| 2.1 | 19.07.2026 | PR #79 merged at 0e69032; R4.1 dead-end UI retirement awaits frontend preview and production verification. | ChatGPT |
| 2.0 | 19.07.2026 | R4 read-only audit complete: hosted gate proven safe; five retirement slices defined; R4.1 dead-end UI removal selected first. | ChatGPT |
| 1.9 | 19.07.2026 | R3 CLOSED/LIVE GREEN: production toast verified, client persisted after refresh, test records removed; next gate is R4 audit. | ChatGPT |
| 1.8 | 19.07.2026 | PR #78 merged at 2d7c513; source-aware Supabase/local toast fix awaits frontend preview and production deployment. | ChatGPT |
| 1.7 | 19.07.2026 | Profile lockdown SQL verified (1 row, RLS on, zero policies); real client persisted in Supabase after refresh; stale local-save toast identified. | ChatGPT |
| 1.6 | 19.07.2026 | PR #77 merged at 96cf9f0; profile zero-client-policy lockdown ready for owner SQL and verification. | ChatGPT |
| 1.5 | 19.07.2026 | R3 SQL executed; schema/FKs/RLS verified. Separate pre-existing public profile policy discovered and gated for audited correction. | ChatGPT |
| 1.4 | 19.07.2026 | Slice B ו־Production live; #73–#75 closed; #76 merged, R3 SQL/CRUD pending; local-engine retirement + Jake UX scheduled. | ChatGPT |
| 1.3 | 16.07.2026 | PR #72 מוזג; main 7f0648d; deploy ו־live smokes ממתינים. | ChatGPT |
| 1.2 | 16.07.2026 | PR #72 נפתח ונמצא mergeable; אין workflows רצים. | ChatGPT |
| 1.1 | 16.07.2026 | 542d43b נבדק; 2155 passed / 1 skipped; READY. | ChatGPT |
| 1.0 | 16.07.2026 | יצירת מסמך־האב; roadmap M0–M10, לו״ז ופרוטוקול יומי. | ChatGPT |

# נספח — נקודות מעבר היסטוריות

> הסעיפים הבאים נשמרים כארכיון של נקודות המעבר v4.4–v5.3 לצורך רצף היסטורי. הם אינם מקור האמת הנוכחי; המצב הפעיל מתואר ב־Current Control Panel וב־Change Log לעיל. **הערת עריכה:** תמצית התוצאה, ה־SHA והסטטוס של כל נקודת מעבר נשמרו; בלוקי ה־prompt התפעוליים החד־פעמיים לפייבל (audit/יישום/release) ופִסקאות ה־״פתיח לסשן חדש״ שהופיעו במקור v5.2 קוצרו כאן ולא שוכפלו מילה־במילה, מכיוון שהם הוראות עבודה חד־פעמיות שכבר בוצעו ונסגרו — לא החלטות, סיכונים או תוכן roadmap. כל ההחלטות (D-001…D-034), היסטוריית הסטטוס, הסיכונים ויומן השינויים המלא (1.0…5.3) שמורים לעיל.

## עדכון נקודת מעבר v4.4 — M2 J2 Preview Hotfix

עודכן: 20.07.2026 | מקור אמת: main + מצב הפריסה המאומת. סטטוס: ההוטפיקס מוזג ל־main; נדרש Preview QA לפני פרודקשן. PR #87 מוזג. Merge commit: 21a6d4eb2b2ab39cb820d31d009442f2eeee57bf. תוקן מקור ה־400 invalid_payload: הודעת הבוקר של ג׳ייק נשארת מוצגת בממשק, אך אינה נשלחת כפתיחת assistant-first ל־jake.chat. chatJake נשאר byte-exact; חוזי J1/J2, ה־Gateway, האימות, התקציב וזרימת האישור לא שונו. ראיות טרום־מיזוג: 2,390 בדיקות עברו, בדיקה אחת skipped, ו־production build ירוק.

## עדכון נקודת מעבר v4.5 — Preview QA

סטטוס מאומת: ה־Preview של merge commit 21a6d4e נטען, jake.chat חזר 200, תשובת הפעולה נוצרה וכרטיס האישור הוצג. תקלת assistant-first / invalid_payload נסגרה ב־Preview. הודעת הבוקר נשארת בממשק אך אינה פותחת עוד את היסטוריית המודל. התקשורת עוברת דרך ai-gateway בלבד; חוזי J1/J2 והשרת לא שונו.

## עדכון נקודת מעבר v4.6 — M2 J2 Preview LIVE GREEN

סטטוס: כל בדיקות ה־Preview הנדרשות עברו. merge commit שנבדק: 21a6d4eb2b2ab39cb820d31d009442f2eeee57bf (PR #87). לאחר ״אשר ובצע״ נוצר הלקוח דני כהן כליד בשווי 3,000 ₪, ולאחר רענון הדף הלקוח נשאר במערכת — התמדה ב־Supabase אומתה. לא נדרש deploy נוסף ל־ai-gateway; השחרור הבא היה Frontend בלבד.

## עדכון נקודת מעבר v4.7 — M2 J2 CLOSED / LIVE GREEN

M2 J2 נסגר במלואו בפרודקשן. Main מאומת: 21a6d4eb2b2ab39cb820d31d009442f2eeee57bf. Frontend production deployed. Jake chat ו־force-actions פועלים בפרודקשן דרך Gateway בלבד, עם שמירת סמנטיקת האישור לפני ביצוע; שרת ai-gateway v24 נשאר ללא שינוי. השלב הבא היה M2 J3 read-only audit.

## עדכון נקודת מעבר v4.8 — M2 J3A CLOSED / LIVE GREEN

מעבר Outreach ל־crm.lead_ideas הושלם ונבדק בפרודקשן. Main מאומת: e2c5789e557e04ceff4ff865004f592d256e2a7e; PR #88 מוזג. 86 קבצים, 2,430 passed, בדיקה אחת skipped. ai-gateway נפרס לפני ה־frontend; success/rejection/401 smokes עברו ללא שינוי SQL/env/secrets. הרשומות נשמרו לאחר רענון; לא נצפתה קריאת generativelanguage.

## עדכון נקודת מעבר v4.9 — M2 J3B CLOSED / LIVE GREEN

Diagnose הוחזר ליכולת AI אמיתית בפרודקשן דרך crm.diagnose_quote. Main מאומת: a731775670ce7eb14e82c0cb7ce522eeaf65f173; PR #89 מוזג. 87 קבצים, 2,471 passed. ai-gateway v26 ACTIVE עם verify_jwt ON; valid/invalid/401 smokes עברו לפני פריסת ה־frontend. Diagnose החזיר אבחון אמיתי ומובנה בעברית ללא generativelanguage.

## עדכון נקודת מעבר v5.0 — M2 J3C Audit prompt

נוסף פרומפט ה־audit הקריא־בלבד המלא של M2 J3C: הפרדה בין תיקון אינדיקציות UI מטעות, מחיקת dead code מאומתת, החלטות Creative/Image ושער הסרת מפתח הדפדפן. לא ניתנה סמכות יישום.

## עדכון נקודת מעבר v5.1 — S0A FALSE-SUCCESS CONTAINMENT CLOSED

Main מאומת: 70665209970c02837e577ff7b682ee34c0d3c4d7; PR #98 מוזג. Frontend production deploy 4cb17aee; bundle index-BUg0aOcy.js. S0A היה שינוי frontend בלבד; לא שונו Gateway, Edge Function, profiles, adapters, server prompts, action contracts, SQL, schema, RLS, secrets או dependencies. Jake, Outreach, Diagnose ו־ImageStudio נשארים LIVE — VERIFIED. Rollback: pre-s0a-false-success-containment → d5d8bf8.

## עדכון נקודת מעבר v5.2 — S0C CLOSED / LIVE VERIFIED

Main מאומת: 3ee62aee3f92e9ee0ea07f6a56fb3e7a1e567cab; PR #100 מוזג. Production frontend deploy cec116b9 מגיש index-CE6IJ-rJ.js. ai-gateway Edge Function v34 ACTIVE עם verify_jwt=true. JAKE_PACK_PERSONA עודכן לפרסונה גנרית: ״אתה ג׳יק — העוזר העסקי של סטודיו Art Value״; הטענה ״העוזר האישי של נתן״ הוסרה. JAKE_DRAFT_MESSAGE_SYSTEM אינו כופה חתימה אישית. ללא שינוי: router, actionTypes, contracts, request/response payloads, provider routing, input validation, budget/usage controls, confirmation flow וכל הפרופילים שאינם Jake. הפרסונה בצד השרת נשארת העתק verbatim מוגן drift של frontend Jake pack.

## עדכון נקודת מעבר v5.3 — S0D BUSINESS CONTEXT CLOSED / LIVE VERIFIED

Main מאומת: 22ee2f3bacfc86f026d2ea3a21243a1a4badc6d4; PR #101 מוזג. Production frontend deploy 69f8a175 מגיש index-DnfLj9lz.js ב־https://artvalue-product.pages.dev; Preview f4da6153 עבר בדיקת קבלה עם שני חשבונות.

**ai-gateway v34 ACTIVE עם verify_jwt=true — ללא שינוי כלשהו.** S0D לא נגע ב־Edge Function, ב־router, ב־actionTypes, בחוזים, ב־request/response payloads, ב־provider routing, ב־input validation, ב־usage/budget controls, ב־confirmation flow או בפרופיל כלשהו. לא בוצע deploy ל־Edge.

הנמסר בשכבת המוצר/frontend: Business Context עמיד לכל חשבון ב־public.business_profile (PK user_id, RLS owner-isolation policy business_profile_own), פלטת מותג אופציונלית (#RRGGBB, ראשי חובה), ולידציה משותפת, שמירה persist-first אמינה, resync סמכותי והתנהגות ניטרלית ללא פרופיל. **ה־Business Context של החשבון המאושר מורכב ומוזרק על ידי ה־frontend chat/draft seam כ־bounded data לפני קריאת ה־Gateway הקיימת** (D-033).

מיגרציה 20260724120000_s0d_business_profile.sql הוחלה ואומתה מול ה־remote (weciwurjfwmqihcyexzj). ראיית איכות: 107 קובצי בדיקה, 2759 עברו, 1 skip קיים מראש. Rollback: frontend deployment cec116b9 נשמר (HTTP 200); pre-s0d-business-context @ 3ee62aee.

מעקב עתידי: ״Account-aware Growth & Creative Context״ הוא סלייס מוצר עתידי מאושר בנפרד (D-034) — הוא אינו מחייב ואינו מתזמן עבודת חוזה Gateway.

## עדכון נקודת מעבר v5.4 — S0E GUIDED ONBOARDING CLOSED / LIVE VERIFIED (הערת אי־שינוי)

מקור השחרור הפעיל: 272fc148984b68c26aa46d24e1cdefc2878cddb9 (PR #103 → main c10ac55, ואחריו PR #104 המתקן). Production frontend deploy 4b86993d מגיש index-DRaTE7f5.js ב־https://artvalue-product.pages.dev; Preview מתוקן ea0dcc02 עבר בדיקת קבלה על חשבון לא מוגדר.

**S0E נשלח עם אפס שינוי Gateway/Edge.** ai-gateway נשאר **v34 ACTIVE עם verify_jwt=true** ולא בוצע לו deploy. ללא שינוי: router, actionTypes, חוזים, request/response payloads, provider routing, input validation, usage/budget controls, confirmation flow וכל הפרופילים.

- ה־CTA של הערך הראשון בסיום ה־Onboarding **רק ממלא מראש את תיבת הכתיבה הקיימת של Jake ב־frontend**.
- הוא **אינו קורא ל־Gateway**, אינו שולח אוטומטית, אינו מבצע פעולה ואינו משנה את חוזה ה־Gateway או את היסטוריית השיחה.
- ה־Business Context ממשיך להגיע ל־Jake דרך **seam הזרקת ההקשר הקיים והמאושר ב־frontend** (D-033) — ללא מסלול חדש.
- **אין להסיק או לתזמן עבודת Gateway עתידית כלשהי מ־S0E.**

ללא migration וללא שינוי schema. ראיית איכות: 111 קובצי בדיקה, 2885 עברו, 1 skip קיים מראש. Rollback: frontend deployment 69f8a175 נשמר (HTTP 200); pre-s0e-demo-tour-containment @ c10ac55; pre-s0e-guided-onboarding @ becd070.

### השלב הבא

PENDING NATHAN DECISION. אין במסמך זה אישור לשינוי Gateway נוסף, להוספת ספק, לשינוי חוזה או לפתיחת מסלול LIVE — VERIFIED.
