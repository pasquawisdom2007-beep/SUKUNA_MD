'use strict';

const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'commands', 'expansion');
const groups = {
    social: ['roastme','rizzcheck','truthmeter','debate','argue','memeify','captionbattle','plottwist','villainarc','aura','vibecheck','dripcheck','relationshipai','compliment','insultme','wouldyourather','daregen','neverhavei','confession','truthordare','hotseat','pairup','compatibility','secretvote','bracket','raffle','giveaway','quizmaster','speedquiz','wordchain','wordle','scrabble','riddlebattle','trivia','hangman','chessmatch','tictactoelive','reactionrace','memorygame'],
    progression: ['leaderboard','achievements','dailyquest','streaks','xpboost','profilecard','rankcard','badges','inventory','craft','lootbox','auction','trade','marketplace','bankheist','territory','clanwar','bossbattle','raidleader','questboard'],
    live: ['weatheralerts','earthquake','spaceweather','isspass','moonphase','stargazing','flightstatus','trainstatus','traffic','timezone','sunrise','holidays','eventsnear','restaurant','moviewhere','showtimes','animecalendar','mangaupdates','bookfinder','podcastsearch','musicsearch','lyricsfind','playlist'],
    media: ['soundboard','stickerpack','stickersearch','wallpaper','gifsearch','memeimage','avatarforge','comicstrip','posterforge','thumbnail','ocrtranslate','receiptread','plantid','animalid','foodscan','barcodeinfo','isbnscan','pricewatch','dealalert','couponhunt'],
    research: ['jobhunt','scholarfind','arxivfind','patentsearch','githubwatch','npmwatch','pypiwatch','domainwatch','statuswatch','hackernews','producthunt','redditpulse','forumwatch','rssfollow','newsbrief','factpulse','sourcecheck','readlater','linkdigest','threadify','maildraft','replycraft'],
    productivity: ['meetingtimer','pomodoropro','remindgroup','countdown','habitboard','pollchart','agenda','standup','kanban','priority','invoice','receiptgen','tipcalc','taxcalc','loancheck','compound','cryptoalert','stockalert','forexalert','gastracker','airquality','waterquality'],
    security: ['dnsreport','headerscan','sitehealth','urlpreview','linkunshorten','redirecttrace','jwtinspect','hashfile','base64tool','uuidgen','regexbuild','jsonrepair','yamljson','csvjson','markdowncard','diffview','logparse','stacktrace','dependencycheck','licensecheck','bundlecheck','healthcheck','backupstatus','configaudit'],
    monitoring: ['commandstats','slowcommands','errorpulse','userjourney','featurevotes','suggestionbox','bugreport','supportdesk','changelog','releasewatch','statuspage','apikeytest','providerhealth','scrape','watchpage','keywordalert','socialpulse','trendwatch','hashtagwatch','viralcheck'],
    language: ['translateall','languageid','pronounce','audiobook','voiceclean','transcribefull','speakerlabel','subtitle','videohighlight','framegrab','videocompress','videoconvert','mediainfo','filecompress','filemerge','pdfsplit','pdfmerge','pdfsign','pdfwatermark','formfill','docconvert','slidesummarize','spreadsheet','chartmake','dataclean','forecast','survey','formbuilder','quizmaker','flashcards','examcoach','mathscan','diagramread','codeexplain'],
    developer: ['repoaudit','prreview','issuecreate','releasecreate','commitdigest','dependabot','readmegen','apihelp','webhooktest','cronbuilder','regex101','colorpalette','fontpair','brandkit','namelab','usernamecheck','domainname','logoidea','bioforge','profilewrite','coverletter','resumecheck','interview','negotiator'],
    lifestyle: ['studyplan','travelplan','packinglist','recipe','mealplan','grocerylist','workoutplan','meditation','sleepstory','journal','gratitude','affirmation','moodlog','focusmode','quiethours','welcomeboard','memberspotlight','birthdayboard','anniversary','timezoneclock','languagechallenge','culturecard','onthisday','quoteoftheday','wordoftheday','factoftheday','comicofday','nasaimage','apod','jokeofday','gifofday','pollofday','challengeofday'],
};

const local = new Set(['countdown','tipcalc','timezone','timezoneclock','hashfile','base64tool','uuidgen','pollchart','framegrab','videocompress','videoconvert','mediainfo','filecompress','filemerge','pdfsplit','pdfmerge','pdfsign','pdfwatermark','docconvert','yamljson','csvjson','chartmake','survey','formbuilder','cronbuilder','regex101','meetingtimer','pomodoropro','remindgroup']);
const title = name => name.replace(/([a-z])([0-9])/g, '$1 $2').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const specs = [...new Set(Object.values(groups).flat())].map(name => ({ name, title: title(name), mode: local.has(name) ? 'local' : 'ai' }));

const existing = new Set();
for (const file of fs.readdirSync(target)) {
    if (!file.endsWith('.js')) continue;
    const text = fs.readFileSync(path.join(target, file), 'utf8');
    const match = text.match(/name:\s*['"]([^'"]+)['"]/);
    if (match) existing.add(match[1]);
}

for (const spec of specs) {
    if (existing.has(spec.name)) continue;
    const content = `'use strict';\n\nconst { createPeakCommand } = require('../../utils/peakCommandFactory');\n\nmodule.exports = createPeakCommand(${JSON.stringify(spec, null, 4)});\n`;
    fs.writeFileSync(path.join(target, `${spec.name}.js`), content);
}

console.log(`Generated ${specs.filter(spec => !existing.has(spec.name)).length} expansion commands.`);
