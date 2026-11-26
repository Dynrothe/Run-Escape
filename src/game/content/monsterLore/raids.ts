import { MonsterLore, lore } from "./lore";

// The Tombs of Amascut, Beneath Cursed Sands and the Theatre of Blood's bosses
export const RAIDS_LORE: Record<string, MonsterLore> = {
    // The Tombs of Amascut
    Boulder: lore(
        "A boulder thrown in the fight with Ba-Ba.",
        "The Path of Apmeken's end, in the Tombs of Amascut.",
        "In the fight they all have the same health, which scales with team size and path level, and one is cracked.",
    ),
    Rubble: lore(
        "Rubble from the fight with Ba-Ba.",
        "The Path of Apmeken's end, in the Tombs of Amascut.",
        "It's part of the fight's mechanics, left behind by Ba-Ba's boulders.",
    ),
    "Cracked boulder": lore(
        "The cracked one of Ba-Ba's boulders.",
        "The fight with Ba-Ba, in the Tombs of Amascut.",
        "Only one is cracked, and the ranged attacks always hit it.",
    ),
    "Baboon Brawler": lore(
        "A baboon of the Path of Apmeken.",
        "The Path of Apmeken, in the Tombs of Amascut.",
        "Attacked with magic, it takes damage equal to your max hit.",
    ),
    "Baboon Thrower": lore(
        "A baboon of the Path of Apmeken that throws things.",
        "The Path of Apmeken, in the Tombs of Amascut.",
        "Attacked with melee, it takes damage equal to your max hit.",
    ),
    "Baboon Mage": lore(
        "A baboon of the Path of Apmeken that casts magic.",
        "The Path of Apmeken, in the Tombs of Amascut.",
        "Attacked with ranged, it takes damage equal to your max hit.",
    ),
    "Baboon Shaman": lore(
        "A baboon shaman of the Path of Apmeken.",
        "The Path of Apmeken, in the Tombs of Amascut.",
        "It summons Baboon Thralls, and its magic drains Prayer equal to the damage it deals.",
    ),
    "Baboon Thrall": lore(
        "A thrall summoned by a Baboon Shaman.",
        "The Path of Apmeken, in the Tombs of Amascut.",
        "It drains Prayer based on a share of the damage it deals.",
    ),
    "Volatile Baboon": lore(
        "A baboon that follows you rather than attacking.",
        "The Path of Apmeken, in the Tombs of Amascut.",
        "When it reaches melee distance it detonates for massive damage.",
    ),
    "Cursed Baboon": lore(
        "A baboon that leaves venom pools where it walks.",
        "The Path of Apmeken, in the Tombs of Amascut.",
        "Stepping in a pool inflicts venom.",
    ),
    "Ba-Ba": lore(
        "An ancient baboon matriarch, who once ruled a large troop.",
        "The end of the Path of Apmeken, in the Tombs of Amascut.",
        "Amascut deceived her with an offer of immortality, and she fell into her service.",
    ),
    "Agile Scarab": lore(
        "A scarab hatched from the eggs Kephri lays.",
        "The Path of Scabaras, in the Tombs of Amascut.",
        "Unlike most monsters it retreats from you at running speed.",
    ),
    "Spitting Scarab": lore(
        "A scarab summoned by Kephri.",
        "The Path of Scabaras, in the Tombs of Amascut.",
        "It uses ranged attacks that can poison from 6 damage, and hit through protection prayers.",
    ),
    "Het's Seal": lore(
        "The seal in the centre of the Path of Het.",
        "The Path of Het, in the Tombs of Amascut.",
        "It is shielded at first, and you weaken it by redirecting the energy beams from the caster statue to the shielded statue.",
    ),
    "Orb of Darkness": lore(
        "An orb that moves in a straight line across the Path of Het's room.",
        "The Path of Het, in the Tombs of Amascut.",
        "Running into one deals moderate damage.",
    ),
    Akkha: lore(
        "A powerful apparition, once a human warrior dedicated to the god Het.",
        "The end of the Path of Het, in the Tombs of Amascut.",
        "He came under Amascut's influence and was used to imprison Het.",
    ),
    "Akkha's Shadow": lore(
        "A shadow of Akkha.",
        "The fight with Akkha, in the Tombs of Amascut.",
        "At 80% health he creates four in the corners of the arena, and he must be lured to the quadrant to dispel one.",
    ),
    "Orb of Lightning": lore(
        "An orb of Akkha's Trailing Orbs attack.",
        "The fight with Akkha, in the Tombs of Amascut.",
        "It appears if you move in the south-east quadrant, and damages and briefly disables you.",
    ),
    "Burning Orb": lore(
        "An orb of Akkha's Trailing Orbs attack.",
        "The fight with Akkha, in the Tombs of Amascut.",
        "It appears if you move in the north-west quadrant, and burns you.",
    ),
    "Frozen Orb": lore(
        "An orb of Akkha's Trailing Orbs attack.",
        "The fight with Akkha, in the Tombs of Amascut.",
        "It appears if you move in the south-west quadrant, and damages and slows you.",
    ),
    "Unstable Orb": lore(
        "An orb that appears when Akkha rejuvenates himself.",
        "The end of the fight with Akkha, in the Tombs of Amascut.",
        "It hits for moderate damage, which protection prayers can reduce slightly.",
    ),
    Scarab: lore(
        "A scarab beetle of the desert.",
        "Sophanem, Menaphos and the Tombs of Amascut.",
        "In this game it is one of the scarabs of the Scabaras room.",
    ),
    Kephri: lore(
        "A dawn scarab, the last of her kind.",
        "The end of the Path of Scabaras, in the Tombs of Amascut.",
        "Amascut tricked her with an offer of offspring, and she came into her servitude.",
    ),
    "Soldier Scarab": lore(
        "A scarab summoned by Kephri.",
        "The Path of Scabaras, in the Tombs of Amascut.",
        "It uses melee, and sends out an unattackable swarm to recharge Kephri's shield.",
    ),
    "Arcane Scarab": lore(
        "A scarab summoned by Kephri.",
        "The Path of Scabaras, in the Tombs of Amascut.",
        "It slowly charges up red swarms, which deal massive damage if released, though prayers can reduce it.",
    ),
    Egg: lore(
        "An egg laid by Kephri.",
        "The fight with Kephri, in the Tombs of Amascut.",
        "Eggs hatch into scarabs, or explode.",
    ),
    "Palm of Resourcefulness": lore(
        "A plant in the Path of Crondis.",
        "The Path of Crondis, in the Tombs of Amascut.",
        "You water it from the nearby waterfalls before you can fight Zebak, and crocodiles may attack it.",
    ),
    Trap: lore(
        "A trap in the Path of Crondis.",
        "The Path of Crondis, in the Tombs of Amascut.",
        "A puzzle hazard of the room, not a monster.",
    ),
    Crocodile: lore(
        "A reptile of the River Elid.",
        "South of Pollnivneach, on either side of the River Elid, and the Path of Crondis in the Tombs of Amascut.",
        "Some walk only on water, some only on land and some on both.",
        "Vannaka can assign them as a Slayer task.",
    ),
    Obelisk: lore(
        "The Wardens' obelisk.",
        "The Wardens' chamber, in the Tombs of Amascut.",
        "In the fight the obelisk charges up and powers the Wardens.",
    ),
    "Elidinis' Warden": lore(
        "One of the two final bosses of the Tombs of Amascut.",
        "The Wardens' chamber, in the Tombs of Amascut.",
        "The Wardens are ancient automatons built by Tumeken himself, using a staff of great power.",
    ),
    "Tumeken's Warden": lore(
        "One of the two final bosses of the Tombs of Amascut.",
        "The Wardens' chamber, in the Tombs of Amascut.",
        "The Wardens are ancient automatons built by Tumeken himself, using a staff of great power.",
    ),
    Core: lore(
        "The power source of the Wardens.",
        "The Wardens' fight, in the Tombs of Amascut.",
        "In the second phase you attack the Warden that powered up until its yellow bar is full.",
    ),
    "Energy Siphon": lore(
        "An object that appears in the last phase of the Wardens fight.",
        "The Wardens' fight, in the Tombs of Amascut.",
        "At 80%, 60%, 40% and 20% the Warden stops slamming the ground and turns on all three protection prayers.",
    ),
    "Zebak's Phantom": lore(
        "A phantom of Zebak, summoned in the Wardens' fight.",
        "The Wardens' fight, in the Tombs of Amascut.",
        "Tumeken's Warden summons it with Ba-Ba's Phantom in the third phase.",
    ),
    "Ba-Ba's Phantom": lore(
        "A phantom of Ba-Ba, summoned in the Wardens' fight.",
        "The Wardens' fight, in the Tombs of Amascut.",
        "It only attacks by launching boulders at you.",
    ),
    "Akkha's Phantom": lore(
        "A phantom of Akkha, summoned in the Wardens' fight.",
        "The Wardens' fight, in the Tombs of Amascut.",
        "Elidinis' Warden summons it with Kephri's Phantom in the third phase.",
    ),
    "Kephri's Phantom": lore(
        "A phantom of Kephri, summoned in the Wardens' fight.",
        "The Wardens' fight, in the Tombs of Amascut.",
        "It attacks with Kephri's fireball.",
    ),
    Phantom: lore(
        "The phantom of the final phase of the Wardens' fight.",
        "The Wardens' fight, in the Tombs of Amascut.",
        "Several phantoms are met in the Tombs of Amascut.",
    ),
    Energy: lore(
        "Pure energy from the Wardens' fight.",
        "The Wardens' fight, in the Tombs of Amascut.",
        "A fight element rather than a monster.",
    ),
    Zebak: lore(
        "A large crocodile, the strongest of its kind, with an ever-growing hunger.",
        "The end of the Path of Crondis, in the Tombs of Amascut.",
        "He accepted Amascut's offer of endless food in return for luring Crondis.",
    ),
    Jug: lore(
        "A jug in Zebak's room.",
        "The Path of Crondis, in the Tombs of Amascut.",
        "A fight element in this game, there to be walked into.",
    ),
    "Blood Cloud": lore(
        "A cloud of blood in the fight with Zebak.",
        "The fight with Zebak, in the Tombs of Amascut.",
        'It spawns with the "Not Just a Head" invocation, damages itself as it moves, and heals if adjacent to you.',
    ),
    Wave: lore(
        "A wave of water in Zebak's room.",
        "The fight with Zebak, in the Tombs of Amascut.",
        "A fight element rather than a monster.",
    ),

    // Beneath Cursed Sands
    Coenus: lore(
        "The head of the Menaphos Guard and chief gatekeeper of Menaphos.",
        "Menaphos, appearing in a cutscene in the quest Contact!",
        "Since Sophanem was quarantined, he has watched the bridge that connects it to Menaphos.",
    ),
    "Scarab Mage": lore(
        "A mage who commands scarab beetles.",
        "The Sophanem Dungeon and the Scabaras Dungeon, and the quests Contact! and Beneath Cursed Sands.",
        "Their magic looks like a swarm of beetles, and hits up to 17.",
    ),
    "Champion of Scabaras": lore(
        "A champion summoned by the High Priest of Scabaras.",
        "The Scabaras Dungeon, in the quest Beneath Cursed Sands.",
        "He appears when you try to free the High Priest from Amascut's control.",
    ),
    "Menaphite Akh": lore(
        "The final boss of Beneath Cursed Sands.",
        "Fought after speaking with Osman at Maisa's camp.",
        "She fights in melee with a dragon scimitar, and uses special attacks now and then.",
    ),
    "Menaphite Guard": lore(
        "A guard of Menaphos.",
        "Menaphos, which is currently inaccessible.",
        "They tell anyone trying to open the gate between Sophanem and Menaphos to leave.",
    ),
    "Menaphite Shadow": lore(
        "A shadow summoned by the Menaphite Akh.",
        "The Menaphite Akh's fight, in Beneath Cursed Sands.",
        "It uses ranged until the Akh is at half health, then switches to magic.",
    ),

    // The Theatre of Blood
    "The Maiden of Sugadinti": lore(
        "The first encounter of the Theatre of Blood, formerly a human called Serafina.",
        "The Theatre of Blood, in Ver Sinhaza.",
        "The vampyres spread a myth that she completed the Theatre and was freed.",
    ),
    "Nylocas Vasilias": lore(
        "The third encounter of the Theatre of Blood.",
        "The Theatre of Blood.",
        "It spawns after you kill the hordes of Nylocas Hagios, Ischyros and Toxobolos.",
    ),
    Xarpus: lore(
        "The fifth encounter of the Theatre of Blood, the Yarasa King.",
        "The Theatre of Blood.",
        "He's the last of his kind, captured by Lord Lowerniel Vergidiyad Drakan to be a boss in the Theatre.",
    ),
};
