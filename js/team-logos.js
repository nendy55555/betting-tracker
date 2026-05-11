/* team-logos.js
   ─────────────────────────────────────────────────────────────
   Map team names → logo image URL.
   - ESPN CDN for NFL/NBA/MLB/NHL/NCAAB/NCAAF (uses team abbreviation)
   - TheSportsDB free badge endpoint for Soccer + fallback for messy names
   - Returns null on miss → caller renders text initials

   Exports a single function: window.BT_teamLogo(teamName, sport)
   Sport hint is one of: 'NFL','NBA','MLB','NHL','NCAAMB','NCAAFB','Soccer'
*/
(function () {
  'use strict';

  // ── ESPN abbreviation maps ────────────────────────────────────
  // ESPN CDN: https://a.espncdn.com/i/teamlogos/{league}/500/{abbr}.png

  var NFL = {
    'arizona cardinals':'ari','atlanta falcons':'atl','baltimore ravens':'bal','buffalo bills':'buf',
    'carolina panthers':'car','chicago bears':'chi','cincinnati bengals':'cin','cleveland browns':'cle',
    'dallas cowboys':'dal','denver broncos':'den','detroit lions':'det','green bay packers':'gb',
    'houston texans':'hou','indianapolis colts':'ind','jacksonville jaguars':'jax','kansas city chiefs':'kc',
    'las vegas raiders':'lv','los angeles chargers':'lac','los angeles rams':'lar','miami dolphins':'mia',
    'minnesota vikings':'min','new england patriots':'ne','new orleans saints':'no','new york giants':'nyg',
    'new york jets':'nyj','philadelphia eagles':'phi','pittsburgh steelers':'pit','san francisco 49ers':'sf',
    'seattle seahawks':'sea','tampa bay buccaneers':'tb','tennessee titans':'ten','washington commanders':'wsh',
  };

  var NBA = {
    'atlanta hawks':'atl','boston celtics':'bos','brooklyn nets':'bkn','charlotte hornets':'cha',
    'chicago bulls':'chi','cleveland cavaliers':'cle','dallas mavericks':'dal','denver nuggets':'den',
    'detroit pistons':'det','golden state warriors':'gs','houston rockets':'hou','indiana pacers':'ind',
    'la clippers':'lac','los angeles clippers':'lac','los angeles lakers':'lal','memphis grizzlies':'mem',
    'miami heat':'mia','milwaukee bucks':'mil','minnesota timberwolves':'min','new orleans pelicans':'no',
    'new york knicks':'ny','oklahoma city thunder':'okc','orlando magic':'orl','philadelphia 76ers':'phi',
    'phoenix suns':'phx','portland trail blazers':'por','sacramento kings':'sac','san antonio spurs':'sa',
    'toronto raptors':'tor','utah jazz':'utah','washington wizards':'wsh',
  };

  var MLB = {
    'arizona diamondbacks':'ari','atlanta braves':'atl','baltimore orioles':'bal','boston red sox':'bos',
    'chicago cubs':'chc','chicago white sox':'chw','cincinnati reds':'cin','cleveland guardians':'cle',
    'colorado rockies':'col','detroit tigers':'det','houston astros':'hou','kansas city royals':'kc',
    'los angeles angels':'laa','los angeles dodgers':'lad','miami marlins':'mia','milwaukee brewers':'mil',
    'minnesota twins':'min','new york mets':'nym','new york yankees':'nyy','oakland athletics':'oak',
    'athletics':'oak','philadelphia phillies':'phi','pittsburgh pirates':'pit','san diego padres':'sd',
    'san francisco giants':'sf','seattle mariners':'sea','st. louis cardinals':'stl','st louis cardinals':'stl',
    'tampa bay rays':'tb','texas rangers':'tex','toronto blue jays':'tor','washington nationals':'wsh',
  };

  var NHL = {
    'anaheim ducks':'ana','arizona coyotes':'ari','utah hockey club':'utah','boston bruins':'bos',
    'buffalo sabres':'buf','calgary flames':'cgy','carolina hurricanes':'car','chicago blackhawks':'chi',
    'colorado avalanche':'col','columbus blue jackets':'cbj','dallas stars':'dal','detroit red wings':'det',
    'edmonton oilers':'edm','florida panthers':'fla','los angeles kings':'la','minnesota wild':'min',
    'montreal canadiens':'mtl','nashville predators':'nsh','new jersey devils':'nj','new york islanders':'nyi',
    'new york rangers':'nyr','ottawa senators':'ott','philadelphia flyers':'phi','pittsburgh penguins':'pit',
    'san jose sharks':'sj','seattle kraken':'sea','st. louis blues':'stl','st louis blues':'stl',
    'tampa bay lightning':'tb','toronto maple leafs':'tor','vancouver canucks':'van','vegas golden knights':'vgk',
    'washington capitals':'wsh','winnipeg jets':'wpg',
  };

  // NCAA — small set of high-traffic schools. ESPN serves by team ID, but
  // a hand-rolled abbreviation map covers ~90% of common bets. Anything not
  // here falls back to text initials.
  var NCAA = {
    // Common men's basketball / football crossover schools
    'duke':'150','duke blue devils':'150','north carolina':'153','north carolina tar heels':'153',
    'kentucky':'96','kentucky wildcats':'96','kansas':'2305','kansas jayhawks':'2305',
    'ucla':'26','ucla bruins':'26','uconn':'41','connecticut':'41','michigan':'130','michigan wolverines':'130',
    'michigan state':'127','ohio state':'194','ohio state buckeyes':'194','alabama':'333','alabama crimson tide':'333',
    'georgia':'61','georgia bulldogs':'61','texas':'251','texas longhorns':'251','oklahoma':'201',
    'lsu':'99','lsu tigers':'99','arkansas':'8','tennessee':'2633','florida':'57','florida gators':'57',
    'auburn':'2','clemson':'228','notre dame':'87','usc':'30','oregon':'2483','penn state':'213',
    'wisconsin':'275','indiana':'84','purdue':'2509','illinois':'356','iowa':'2294','iowa state':'66',
    'baylor':'239','houston':'248','gonzaga':'2250','arizona':'12','utah':'254','byu':'252',
    'creighton':'156','marquette':'269','xavier':'2752','villanova':'222','seton hall':'2550',
    'memphis':'235','syracuse':'183','virginia':'258','wake forest':'154','miami':'2390','miami hurricanes':'2390',
    'colorado':'38','colorado state':'36','san diego state':'21','saint marys':'2608','st marys':'2608',
  };

  // ── helpers ───────────────────────────────────────────────────
  function norm(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^\w\s.]/g, '')
      .replace(/\s+/g, ' ');
  }

  function pickFromTable(name, table) {
    if (!name) return null;
    var k = norm(name);
    if (table[k]) return table[k];
    // Try last word fallback (e.g. "Lakers" → "los angeles lakers"? no, opposite)
    // Try contains-match where the table key is a suffix of name or vice versa
    for (var key in table) {
      if (k === key) return table[key];
      if (k.indexOf(key) >= 0 || key.indexOf(k) >= 0) return table[key];
    }
    return null;
  }

  function espnUrl(league, abbr) {
    if (!abbr) return null;
    return 'https://a.espncdn.com/i/teamlogos/' + league + '/500/' + abbr + '.png';
  }

  function espnNcaaUrl(teamId) {
    if (!teamId) return null;
    return 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + teamId + '.png';
  }

  function thesportsdbSoccerUrl(name) {
    // TheSportsDB: https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Arsenal
    // The API returns badge URLs in strTeamBadge. We can't fetch sync here, so
    // we use the URL-encoded fallback. Render with onerror to swap to initials.
    if (!name) return null;
    return 'https://www.thesportsdb.com/images/media/team/badge/' +
           encodeURIComponent(norm(name).replace(/\s+/g, '_')) + '.png';
  }

  // ── public API ────────────────────────────────────────────────
  window.BT_teamLogo = function (teamName, sport) {
    if (!teamName) return null;
    var s = String(sport || '').toUpperCase();
    var name = String(teamName).trim();

    // Strip common qualifiers ("(home)", "@ ...", line numbers like "-3.5")
    name = name.replace(/\s*\(.*?\)\s*/g, '').replace(/[+-]?\d+(\.\d+)?$/, '').trim();

    if (s === 'NFL')     return espnUrl('nfl',  pickFromTable(name, NFL));
    if (s === 'NBA')     return espnUrl('nba',  pickFromTable(name, NBA));
    if (s === 'MLB')     return espnUrl('mlb',  pickFromTable(name, MLB));
    if (s === 'NHL')     return espnUrl('nhl',  pickFromTable(name, NHL));
    if (s === 'NCAAMB' || s === 'NCAAFB' || s === 'NCAAB' || s === 'NCAAF') {
      return espnNcaaUrl(pickFromTable(name, NCAA));
    }
    if (s === 'SOCCER') return thesportsdbSoccerUrl(name);

    // Sport unknown — try each table in order
    var hit;
    hit = pickFromTable(name, NFL); if (hit) return espnUrl('nfl', hit);
    hit = pickFromTable(name, NBA); if (hit) return espnUrl('nba', hit);
    hit = pickFromTable(name, MLB); if (hit) return espnUrl('mlb', hit);
    hit = pickFromTable(name, NHL); if (hit) return espnUrl('nhl', hit);
    hit = pickFromTable(name, NCAA); if (hit) return espnNcaaUrl(hit);
    return null;
  };

  // For team-initials fallback rendering
  window.BT_teamInitials = function (teamName) {
    if (!teamName) return '?';
    var clean = String(teamName).trim().replace(/\s*\(.*?\)\s*/g, '').replace(/[+-]?\d+(\.\d+)?$/, '').trim();
    var words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.slice(-2).map(function (w) { return w[0]; }).join('').toUpperCase();
  };
})();
