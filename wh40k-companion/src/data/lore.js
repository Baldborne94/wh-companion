export const LORE_DB = {
  "horus":            { name:"Horus Lupercal",              wiki:"Horus_Lupercal" },
  "luna wolves":      { name:"Luna Wolves",                 wiki:"Luna_Wolves" },
  "sons of horus":    { name:"Sons of Horus",               wiki:"Sons_of_Horus" },
  "emperor":          { name:"Emperor of Mankind",          wiki:"Emperor_of_Mankind" },
  "primarch":         { name:"Primarchs",                   wiki:"Primarch" },
  "primarchs":        { name:"Primarchs",                   wiki:"Primarch" },
  "space marines":    { name:"Space Marines",               wiki:"Space_Marines" },
  "chaos":            { name:"Chaos",                       wiki:"Chaos_(Warhammer)" },
  "warp":             { name:"The Warp",                    wiki:"Warp" },
  "isstvan iii":      { name:"Isstvan III",                 wiki:"Isstvan_III_Atrocity" },
  "isstvan v":        { name:"Isstvan V",                   wiki:"Drop_Site_Massacre" },
  "great crusade":    { name:"Great Crusade",               wiki:"Great_Crusade" },
  "horus heresy":     { name:"Horus Heresy",                wiki:"Horus_Heresy" },
  "death guard":      { name:"Death Guard",                 wiki:"Death_Guard" },
  "thousand sons":    { name:"Thousand Sons",               wiki:"Thousand_Sons" },
  "word bearers":     { name:"Word Bearers",                wiki:"Word_Bearers" },
  "night lords":      { name:"Night Lords",                 wiki:"Night_Lords" },
  "alpha legion":     { name:"Alpha Legion",                wiki:"Alpha_Legion" },
  "iron warriors":    { name:"Iron Warriors",               wiki:"Iron_Warriors" },
  "world eaters":     { name:"World Eaters",                wiki:"World_Eaters" },
  "inquisition":      { name:"The Inquisition",             wiki:"Inquisition" },
  "sanguinius":       { name:"Sanguinius",                  wiki:"Sanguinius" },
  "prospero":         { name:"Prospero",                    wiki:"Prospero_(World)" },
  "aeldari":          { name:"Aeldari",                     wiki:"Aeldari" },
  "eldar":            { name:"Aeldari (Eldar)",             wiki:"Aeldari" },
  "necrons":          { name:"Necrons",                     wiki:"Necrons" },
  "tyranids":         { name:"Tyranids",                    wiki:"Tyranids" },
  "orks":             { name:"Orks",                        wiki:"Orks" },
  "tau":              { name:"T'au Empire",                 wiki:"T%27au_Empire" },
  "eisenhorn":        { name:"Gregor Eisenhorn",            wiki:"Gregor_Eisenhorn" },
  "gaunt":            { name:"Ibram Gaunt",                 wiki:"Ibram_Gaunt" },
  "tanith":           { name:"Tanith First-and-Only",       wiki:"Tanith_First-and-Only" },
  "adeptus mechanicus":{ name:"Adeptus Mechanicus",         wiki:"Adeptus_Mechanicus" },
  "astra militarum":  { name:"Astra Militarum",             wiki:"Astra_Militarum" },
  "space wolves":     { name:"Space Wolves",                wiki:"Space_Wolves" },
  "dark angels":      { name:"Dark Angels",                 wiki:"Dark_Angels" },
  "blood angels":     { name:"Blood Angels",                wiki:"Blood_Angels" },
  "ultramarines":     { name:"Ultramarines",                wiki:"Ultramarines" },
  "imperial fists":   { name:"Imperial Fists",              wiki:"Imperial_Fists" },
  "salamanders":      { name:"Salamanders",                 wiki:"Salamanders_(Chapter)" },
  "raven guard":      { name:"Raven Guard",                 wiki:"Raven_Guard" },
  "white scars":      { name:"White Scars",                 wiki:"White_Scars" },
  "golden throne":    { name:"Golden Throne",               wiki:"Golden_Throne" },
  "guilliman":        { name:"Roboute Guilliman",           wiki:"Roboute_Guilliman" },
  "roboute guilliman":{ name:"Roboute Guilliman",           wiki:"Roboute_Guilliman" },
  "angron":           { name:"Angron",                      wiki:"Angron" },
  "magnus":           { name:"Magnus the Red",              wiki:"Magnus_the_Red" },
  "mortarion":        { name:"Mortarion",                   wiki:"Mortarion" },
  "fulgrim":          { name:"Fulgrim",                     wiki:"Fulgrim" },
  "lorgar":           { name:"Lorgar",                      wiki:"Lorgar" },
  "perturabo":        { name:"Perturabo",                   wiki:"Perturabo" },
  "konrad curze":     { name:"Konrad Curze",                wiki:"Konrad_Curze" },
  "lion el'jonson":   { name:"Lion El'Jonson",              wiki:"Lion_El%27Jonson" },
  "rogal dorn":       { name:"Rogal Dorn",                  wiki:"Rogal_Dorn" },
  "ferrus manus":     { name:"Ferrus Manus",                wiki:"Ferrus_Manus" },
  "vulkan":           { name:"Vulkan",                      wiki:"Vulkan" },
  "corax":            { name:"Corvus Corax",                wiki:"Corvus_Corax" },
  "jaghatai khan":    { name:"Jaghatai Khan",               wiki:"Jaghatai_Khan" },
  "leman russ":       { name:"Leman Russ",                  wiki:"Leman_Russ_(Primarch)" },
  "alpharius":        { name:"Alpharius",                   wiki:"Alpharius_Omegon" },
  "siege of terra":   { name:"Siege of Terra",              wiki:"Siege_of_Terra" },
  "abaddon":          { name:"Abaddon the Despoiler",       wiki:"Abaddon_the_Despoiler" },
  "eye of terror":    { name:"Eye of Terror",               wiki:"Eye_of_Terror" },
  "webway":           { name:"Webway",                      wiki:"Webway" },
  "codex astartes":   { name:"Codex Astartes",              wiki:"Codex_Astartes" },
  "black library":    { name:"The Black Library",           wiki:"Black_Library_(Craftworld)" },
  "indomitus crusade":{ name:"Indomitus Crusade",           wiki:"Indomitus_Crusade" },
  "cicatrix maledictum":{ name:"Cicatrix Maledictum",       wiki:"Cicatrix_Maledictum" },
};

export function wikiUrl(key){
  return `https://warhammer40k.fandom.com/wiki/${LORE_DB[key]?.wiki||encodeURIComponent(LORE_DB[key]?.name||key)}`;
}

export const KW_KEYS  = Object.keys(LORE_DB).sort((a,b)=>b.length-a.length);
export const KW_REGEX = new RegExp(`\\b(${KW_KEYS.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})\\b`,"gi");

export function highlightKeywords(html){
  return html.split(/(<[^>]+>)/).map((part,i)=>{
    if(i%2===1||part.includes("lore-kw")) return part;
    return part.replace(KW_REGEX, m=>{
      const k=m.toLowerCase(); if(!LORE_DB[k]) return m;
      return `<span class="lore-kw" data-kw="${k}" style="color:#4a8adc;cursor:pointer;border-bottom:1px solid #4a8adc55;font-style:normal;" title="Open on Fandom Wiki ↗">${m}</span>`;
    });
  }).join("");
}
