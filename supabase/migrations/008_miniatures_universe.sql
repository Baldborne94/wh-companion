-- WH40K Companion — Add universe column to miniatures
-- Run this in Supabase SQL editor.

ALTER TABLE miniatures
  ADD COLUMN IF NOT EXISTS universe text
    CHECK (universe IN ('aos', '40k'));

-- Auto-assign Age of Sigmar factions
UPDATE miniatures
SET universe = 'aos'
WHERE universe IS NULL
  AND faction IN (
    'Stormcast Eternals', 'Cities of Sigmar', 'Sylvaneth', 'Fyreslayers',
    'Kharadron Overlords', 'Seraphon', 'Lumineth Realm-lords',
    'Daughters of Khaine', 'Idoneth Deepkin',
    'Slaves to Darkness', 'Blades of Khorne', 'Disciples of Tzeentch',
    'Maggotkin of Nurgle', 'Hedonites of Slaanesh', 'Skaven', 'Beasts of Chaos',
    'Nighthaunt', 'Ossiarch Bonereapers', 'Flesh-eater Courts', 'Soulblight Gravelords',
    'Orruk Warclans', 'Gloomspite Gitz', 'Ogor Mawtribes', 'Sons of Behemat', 'Kruleboyz'
  );

-- Auto-assign Warhammer 40,000 factions
UPDATE miniatures
SET universe = '40k'
WHERE universe IS NULL
  AND faction IN (
    'Space Marines', 'Blood Angels', 'Dark Angels', 'Space Wolves', 'Black Templars',
    'Chaos Space Marines', 'Death Guard', 'Thousand Sons', 'World Eaters',
    'Emperor''s Children', 'Night Lords', 'Iron Warriors',
    'Astra Militarum', 'Adeptus Mechanicus', 'Adepta Sororitas', 'Grey Knights',
    'Necrons', 'Tyranids', 'Orks', 'T''au Empire', 'Aeldari', 'Drukhari',
    'Custodes', 'Leagues of Votann', 'Genestealer Cults'
  );
