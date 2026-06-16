// App-wide colour palette
export const C = {
  bg:"#0a0905", surface:"#111009", card:"#16140f", border:"#2a2518",
  gold:"#c9a84c", goldDim:"#7a6330", red:"#b03030",
  blue:"#4a8adc", green:"#4aaa6a",
  text:"#d4cbb8", muted:"#7a7060", dim:"#3a3428",
};

// Faction spine colours
export const FC = {
  "Space Marines":"#1e3d6e","Chaos":"#6e1a1a","Astra Militarum":"#3a5228",
  "Imperium":"#4a3a18","Adeptus Mechanicus":"#7a2218","Adepta Sororitas":"#5a2a4a",
  "Aeldari":"#1a4a5a","Drukhari":"#3a1a5a","Necrons":"#1a5a3a",
  "Tyranids":"#4a1a5a","Orks":"#3a4a1a","T'au":"#1a3a4a","Various":"#3a3428",
};

// Reader themes
export const THEMES = {
  dark:  { id:"dark",  label:"Grimdark", bg:"#0f0e09", text:"#c8bfa8", surface:"#1a1810", border:"#2a2518", muted:"#7a7060", ui:"rgba(15,14,9,0.95)" },
  sepia: { id:"sepia", label:"Sepia",    bg:"#f2e8d0", text:"#3c2a1a", surface:"#e8dcbf", border:"#d4c49c", muted:"#8a6a4a", ui:"rgba(242,232,208,0.97)" },
  paper: { id:"paper", label:"Paper",    bg:"#f8f7f2", text:"#1a1a16", surface:"#f0efea", border:"#d8d8d0", muted:"#888880", ui:"rgba(248,247,242,0.97)" },
};

// Reader fonts
export const FONTS = [
  { name:"Georgia",      value:"Georgia, 'Times New Roman', serif",          import:null },
  { name:"Lora",         value:"'Lora', Georgia, serif",                     import:"Lora:ital,wght@0,400;0,700;1,400" },
  { name:"Merriweather", value:"'Merriweather', Georgia, serif",             import:"Merriweather:ital,wght@0,400;0,700;1,400" },
  { name:"Open Sans",    value:"'Open Sans', Arial, sans-serif",             import:"Open+Sans:ital,wght@0,400;0,600;1,400" },
];

// Reading status config
export const STATUS_CFG = {
  none:   { label:"—",         icon:"·",  color:"#3a3428", bg:"transparent" },
  want:   { label:"To Read",   icon:"📋", color:"#c9a84c", bg:"#c9a84c18" },
  reading:{ label:"Reading",   icon:"📖", color:"#4a8adc", bg:"#1a3a7022" },
  read:   { label:"Read ✓",    icon:"✅", color:"#4aaa6a", bg:"#1a6a2a22" },
};
