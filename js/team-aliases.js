/* Team name standardization mapping.
   Maps alternate / abbreviated / misspelled names → canonical display name.
   Keys are lowercase for case-insensitive lookup.
   Applied on Bovada paste import and Excel sync so the database stays consistent.

   Convention: canonical form is the team's common short name (no city prefix).
   Exceptions: Soccer teams use full club name; NCAAB uses full university name. */

var TEAM_ALIASES = {

  /* ── NFL ──────────────────────────────────────────────────────────────── */
  // Buccaneers
  'bucs':              'Buccaneers',
  'tampa bay':         'Buccaneers',
  'tampa':             'Buccaneers',
  // 49ers
  'niners':            '49ers',
  '9ers':              '49ers',
  'san francisco':     '49ers',
  'sf 49ers':          '49ers',
  'niners':            '49ers',
  // Patriots
  'pats':              'Patriots',
  'new england':       'Patriots',
  // Jaguars
  'jags':              'Jaguars',
  'jacksonville':      'Jaguars',
  // Chiefs
  'chief':             'Chiefs',          // missing-s typo
  'kc chiefs':         'Chiefs',
  'kansas city':       'Chiefs',
  // Ravens
  'ravents':           'Ravens',          // typo seen in data
  'baltimore':         'Ravens',
  // Eagles
  'philly':            'Eagles',
  'philadelphia':      'Eagles',
  // Bills
  'buffalo':           'Bills',
  // Cowboys
  'dallas':            'Cowboys',
  // Giants
  'new york giants':   'Giants',
  'ny giants':         'Giants',
  'g-men':             'Giants',
  // Jets
  'new york jets':     'Jets',
  'ny jets':           'Jets',
  // Bears
  'chicago':           'Bears',
  // Packers
  'pack':              'Packers',
  'green bay':         'Packers',
  // Vikings
  'minnesota':         'Vikings',
  // Steelers
  'pittsburgh':        'Steelers',
  // Bengals
  'cincinnati':        'Bengals',
  // Browns
  'cleveland':         'Browns',
  // Lions
  'detroit':           'Lions',
  // Chargers
  'bolts':             'Chargers',
  'la chargers':       'Chargers',
  'los angeles chargers': 'Chargers',
  // Rams
  'la rams':           'Rams',
  'los angeles rams':  'Rams',
  // Seahawks
  'seattle':           'Seahawks',
  // Cardinals
  'arizona':           'Cardinals',
  // Falcons
  'atlanta':           'Falcons',
  // Saints
  'new orleans':       'Saints',
  // Texans
  'houston':           'Texans',
  // Colts
  'indianapolis':      'Colts',
  // Titans
  'tennessee':         'Titans',
  // Raiders
  'las vegas':         'Raiders',
  'lv raiders':        'Raiders',
  // Broncos
  'denver':            'Broncos',
  // Panthers
  'carolina':          'Panthers',
  // Commanders
  'washington':        'Commanders',
  // Dolphins
  'miami dolphins':    'Dolphins',
  // Redskins / old name — ignore for now

  /* ── NBA ──────────────────────────────────────────────────────────────── */
  // Cavaliers
  'cavs':              'Cavaliers',
  'cleveland cavaliers': 'Cavaliers',
  // Mavericks
  'mavs':              'Mavericks',
  'dallas mavericks':  'Mavericks',
  // 76ers
  'sixers':            '76ers',
  'philadelphia 76ers': '76ers',
  'philly sixers':     '76ers',
  // Timberwolves
  'wolves':            'Timberwolves',
  'minnesota timberwolves': 'Timberwolves',
  // Trail Blazers
  'blazers':           'Trail Blazers',
  'portland trail blazers': 'Trail Blazers',
  'portland':          'Trail Blazers',
  // Thunder
  'okc':               'Thunder',
  'oklahoma city':     'Thunder',
  // Warriors
  'gs warriors':       'Warriors',
  'golden state':      'Warriors',
  'golden state warriors': 'Warriors',
  // Knicks
  'new york knicks':   'Knicks',
  'ny knicks':         'Knicks',
  // Nets
  'brooklyn':          'Nets',
  'brooklyn nets':     'Nets',
  // Celtics
  'boston':            'Celtics',
  'boston celtics':    'Celtics',
  // Lakers
  'la lakers':         'Lakers',
  'los angeles lakers': 'Lakers',
  // Clippers
  'la clippers':       'Clippers',
  'los angeles clippers': 'Clippers',
  // Heat
  'miami heat':        'Heat',
  // Bucks
  'milwaukee':         'Bucks',
  'milwaukee bucks':   'Bucks',
  // Suns
  'phoenix':           'Suns',
  'phoenix suns':      'Suns',
  // Hawks
  'atlanta hawks':     'Hawks',
  // Grizzlies
  'memphis':           'Grizzlies',
  'memphis grizzlies': 'Grizzlies',
  // Pelicans
  'new orleans pelicans': 'Pelicans',
  // Raptors
  'toronto':           'Raptors',
  'toronto raptors':   'Raptors',
  // Pacers
  'indiana':           'Pacers',
  'indiana pacers':    'Pacers',
  // Kings
  'sacramento':        'Kings',
  'sacramento kings':  'Kings',
  // Magic
  'orlando':           'Magic',
  'orlando magic':     'Magic',
  // Wizards
  'washington wizards': 'Wizards',
  // Hornets
  'charlotte':         'Hornets',
  'charlotte hornets': 'Hornets',
  // Pistons
  'detroit pistons':   'Pistons',
  // Rockets
  'houston rockets':   'Rockets',
  // Spurs
  'san antonio':       'Spurs',
  'san antonio spurs': 'Spurs',
  // Jazz
  'utah':              'Jazz',
  'utah jazz':         'Jazz',
  // Nuggets
  'denver nuggets':    'Nuggets',
  // Bulls
  'chicago bulls':     'Bulls',

  /* ── Soccer ───────────────────────────────────────────────────────────── */
  // Atlético Madrid (accent)
  'atletico madrid':   'Atlético Madrid',
  'atletico':          'Atlético Madrid',
  'atl madrid':        'Atlético Madrid',
  // Manchester clubs
  'man united':        'Manchester United',
  'man utd':           'Manchester United',
  'manchester united': 'Manchester United',
  'man city':          'Manchester City',
  'manchester city':   'Manchester City',
  // Tottenham
  'tottenham':         'Tottenham Hotspur',
  'spurs':             'Tottenham Hotspur',
  // Arsenal
  'arsenal fc':        'Arsenal',
  // Chelsea
  'chelsea fc':        'Chelsea',
  // Liverpool
  'liverpool fc':      'Liverpool',
  // Barcelona
  'barca':             'Barcelona',
  'fc barcelona':      'Barcelona',
  // Real Madrid
  'real':              'Real Madrid',
  // Bayern
  'fc bayern':         'Bayern Munich',
  'fc bayern munich':  'Bayern Munich',
  'bayern':            'Bayern Munich',
  // PSG
  'paris saint-germain': 'PSG',
  'paris sg':          'PSG',
  // Juventus
  'juve':              'Juventus',
  // AC Milan / Inter
  'ac milan':          'AC Milan',
  'inter milan':       'Inter Milan',
  'internazionale':    'Inter Milan',
  // Galatasaray
  'galatasaray sk':    'Galatasaray',
  // Newcastle
  'newcastle united':  'Newcastle',
  // Everton
  'everton fc':        'Everton',

  /* ── NCAAB ────────────────────────────────────────────────────────────── */
  // Common abbreviations → full university name
  'vcu':               'Virginia Commonwealth',
  'uconn':             'Connecticut',
  'unc':               'North Carolina',
  'nc tar heels':      'North Carolina',
  'nc state':          'NC State',          // keep as "NC State" (official abbrev)
  'ncsu':              'NC State',
  'nd':                'Notre Dame',
  'ole miss':          'Mississippi',
  'pitt':              'Pittsburgh',
  'usc':               'USC',
  'ucla':              'UCLA',
  'unlv':              'UNLV',
  'utep':              'UTEP',
  'smu':               'SMU',
  'byu':               'BYU',
  'tcu':               'TCU',
  'lsu':               'LSU',
  'vt':                'Virginia Tech',
  'wvu':               'West Virginia',
  'ut':                'Texas',
  // Full-name variants that appear in Bovada data with school suffix
  'nc state wolfpack': 'NC State',
  'virginia commonwealth rams': 'Virginia Commonwealth',
  'connecticut huskies': 'Connecticut',
  'north carolina tar heels': 'North Carolina',
  'miami ohio redhawks': 'Miami (OH)',
  'miami ohio':        'Miami (OH)',
  'miami (oh)':        'Miami (OH)',
  'md baltimore county': 'MD Baltimore County',
  'umbc':              'MD Baltimore County',
  'prairie view a&m':  'Prairie View A&M',
  'prairie view a&amp;m': 'Prairie View A&M',
  'texas a&m':         'Texas A&M',
  'texas a&amp;m':     'Texas A&M',
  // Capitalization fixes from Bovada paste (title-cased by parser)
  'nc state (#11)':    'NC State',
  'smu (#11)':         'SMU',
  'lehigh (#16)':      'Lehigh',
  // Gonzaga
  'gonzaga bulldogs':  'Gonzaga',
  // Kentucky / Tennessee (full names from Bovada)
  'kentucky wildcats': 'Kentucky',
  'tennessee volunteers': 'Tennessee',
  'iowa state cyclones': 'Iowa State',
  'duke blue devils':  'Duke',
  'michigan state spartans': 'Michigan State',
  'vanderbilt commodores': 'Vanderbilt',
  'nebraska cornhuskers': 'Nebraska',
  'houston cougars':   'Houston',
  // St. John's Red Storm — Bovada uses full name
  "st. john's red storm": "St. John's",
  "st johns red storm": "St. John's",
  "saint john's":      "St. John's",
};

/* Look up the canonical name for a team.
   Returns the canonical name if found, otherwise returns the input unchanged. */
function normalizeTeamName(name) {
  if (!name) return name;
  var key = name.trim().toLowerCase();
  return TEAM_ALIASES[key] || name.trim();
}
