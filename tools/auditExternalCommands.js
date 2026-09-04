'use strict';

const fs = require('fs');
const path = require('path');
const expansion = path.join(__dirname, '..', 'commands', 'expansion');
const factory = fs.readFileSync(path.join(__dirname, '..', 'utils', 'peakCommandFactory.js'), 'utf8');
const integrated = new Set([...factory.matchAll(/name === '([^']+)'/g)].map(match => match[1]));
const externalCandidates = new Set([
    'weatheralerts','airquality','earthquake','spaceweather','isspass','moonphase','stargazing','flightstatus','trainstatus','traffic','timezone','sunrise','holidays','eventsnear','restaurant','moviewhere','showtimes','animecalendar','mangaupdates','bookfinder','podcastsearch','musicsearch','lyricsfind','playlist','stickersearch','wallpaper','gifsearch','memeimage','avatarforge','comicstrip','posterforge','thumbnail','ocrtranslate','receiptread','plantid','animalid','foodscan','barcodeinfo','isbnscan','pricewatch','dealalert','couponhunt','jobhunt','scholarfind','arxivfind','patentsearch','githubwatch','npmwatch','pypiwatch','domainwatch','statuswatch','hackernews','producthunt','redditpulse','forumwatch','rssfollow','newsbrief','factpulse','sourcecheck','readlater','linkdigest','maildraft','replycraft','cryptoalert','stockalert','forexalert','gastracker','airquality','waterquality','dnsreport','sitehealth','urlpreview','linkunshorten','redirecttrace','scrape','watchpage','keywordalert','socialpulse','trendwatch','hashtagwatch','viralcheck','translateall','languageid','pronounce','audiobook','voiceclean','transcribefull','speakerlabel','subtitle','videohighlight','dependencycheck','licensecheck','apikeytest','providerhealth','releasewatch','repoaudit','prreview','commitdigest','readmegen','apihelp','domainname','usernamecheck','travelplan','recipe','mealplan','workoutplan','languagechallenge','culturecard','onthisday','quoteoftheday','wordoftheday','factoftheday','comicofday','nasaimage','apod','jokeofday','gifofday','challengofday'
]);
const generated = fs.readdirSync(expansion).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
const remaining = [...externalCandidates].filter(name => generated.includes(name) && !integrated.has(name)).sort();
console.log(JSON.stringify({ integrated: integrated.size, generatedExternalCandidates: externalCandidates.size, remaining }, null, 2));
