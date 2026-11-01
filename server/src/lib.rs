pub mod authz;
use crate::authz::authz_grant;

use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table, Timestamp};

const TICKS_PER_SECOND: f64 = 50.0;
const RUN_LENGTH_SECONDS: f64 = 15.0 * 60.0;
const RUN_LENGTH_TICKS: u32 = 15 * 60 * 50;
const LATER_ROUND_SECONDS: f64 = 10.0 * 60.0;
const MAX_RUN_SECONDS: f64 = 24.0 * 60.0 * 60.0;
const MAX_STANDARD_LEVEL: u32 = 126;
const MAX_ENDLESS_LEVEL: u32 = 9999;

#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub struct KeyRank {
    pub id: String,
    pub rank: u32,
}

#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub struct KeyCount {
    pub id: String,
    pub count: u32,
}

#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub struct MapEndlessBest {
    pub map_id: String,
    pub round: u32,
    pub seconds: f64,
}

#[derive(SpacetimeType, Clone, Debug)]
pub struct RunSubmission {
    pub map_id: String,
    pub character_id: String,
    pub seed: i32,
    pub endless: bool,
    pub round: u32,
    pub victory: bool,
    pub seconds: f64,
    pub ticks: u32,
    pub level: u32,
    pub xp: u64,
    pub kills: u32,
    pub coins: u32,
    pub caskets_opened: u32,
    pub bosses_killed: Vec<String>,
    pub boss_kill_ticks: Vec<u32>,
    pub gear_found: Vec<String>,
}

#[derive(SpacetimeType, Clone, Debug)]
pub struct SavePayload {
    pub coins: u64,
    pub total_coins: u64,
    pub upgrades: Vec<KeyRank>,
    pub upgrades_spent: u64,
    pub unlocked_characters: Vec<String>,
    pub unlocked_items: Vec<String>,
    pub runs: u32,
    pub victories: u32,
    pub map_victories: Vec<KeyCount>,
    pub total_kills: u64,
    pub best_seconds: f64,
    pub best_level: u32,
    pub endless_best: Vec<MapEndlessBest>,
    pub found_gear: Vec<String>,
    pub armoury: Vec<KeyRank>,
}

#[spacetimedb::table(accessor = player_save, public)]
#[derive(Clone, Debug)]
pub struct PlayerSave {
    #[primary_key]
    pub identity: Identity,
    #[index(btree)]
    pub display_name: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub last_run_at: Timestamp,
    pub coins: u64,
    pub total_coins: u64,
    pub upgrades: Vec<KeyRank>,
    pub upgrades_spent: u64,
    pub unlocked_characters: Vec<String>,
    pub unlocked_items: Vec<String>,
    pub runs: u32,
    pub victories: u32,
    pub map_victories: Vec<KeyCount>,
    pub total_kills: u64,
    pub best_seconds: f64,
    pub best_level: u32,
    pub endless_best: Vec<MapEndlessBest>,
    pub found_gear: Vec<String>,
    pub armoury: Vec<KeyRank>,
}

#[spacetimedb::client_visibility_filter]
const PLAYER_SAVE_OWNER: spacetimedb::Filter = spacetimedb::Filter::Sql(
    "SELECT * FROM player_save WHERE identity = :sender",
);

#[spacetimedb::table(
    accessor = leaderboard_endless,
    public,
    index(accessor = by_map_player, btree(columns = [map_id, identity]))
)]
#[derive(Clone, Debug)]
pub struct LeaderboardEndless {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub map_id: String,
    #[index(btree)]
    pub identity: Identity,
    pub display_name: String,
    pub character_id: String,
    pub round: u32,
    pub seconds: f64,
    pub level: u32,
    pub kills: u32,
    pub coins: u32,
    pub recorded_at: Timestamp,
}

#[spacetimedb::table(
    accessor = leaderboard_standard,
    public,
    index(accessor = by_map_player, btree(columns = [map_id, identity]))
)]
#[derive(Clone, Debug)]
pub struct LeaderboardStandard {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub map_id: String,
    #[index(btree)]
    pub identity: Identity,
    pub display_name: String,
    pub character_id: String,
    pub victory: bool,
    pub seconds: f64,
    pub level: u32,
    pub kills: u32,
    pub coins: u32,
    pub score: u64,
    pub recorded_at: Timestamp,
}

const CAMPAIGN_MAPS: &[&str] = &[
    "lumbridge",
    "barrows",
    "wilderness",
    "desert",
    "fremennik",
    "karamja",
    "kourend",
    "varlamore",
];

const FUN_MAPS: &[&str] = &[
    "grand_exchange",
    "east_varrock",
    "falador",
    "last_man_standing",
];

const VALID_CHARACTERS: &[&str] = &[
    "warrior",
    "wizard",
    "ranger",
    "monk",
    "barbarian",
    "ancient_mage",
    "hunter",
    "rogue",
    "dragon_slayer",
    "nomad",
    "menaphite",
    "seer",
    "berserker",
    "obby_mauler",
    "pirate",
    "pyromancer",
    "shayzien_soldier",
    "gladiator",
    "javelineer",
    "scammer",
    "f2p_pker",
    "durial321",
    "lms_sweat",
    "dwarf",
];

const SHOP_UPGRADES: &[(&str, u32, u64)] = &[
    ("strength", 5, 200),
    ("defence", 3, 600),
    ("hitpoints", 5, 200),
    ("prayer", 5, 200),
    ("attack", 2, 900),
    ("magic", 2, 300),
    ("ranged", 2, 300),
    ("herblore", 2, 300),
    ("fletching", 1, 5000),
    ("agility", 2, 300),
    ("thieving", 2, 300),
    ("slayer", 3, 600),
    ("farming", 5, 900),
    ("mining", 5, 200),
    ("hunter", 3, 500),
    ("ring_of_life", 1, 10000),
];

fn is_campaign_map(map_id: &str) -> bool {
    CAMPAIGN_MAPS.contains(&map_id)
}

fn is_fun_map(map_id: &str) -> bool {
    FUN_MAPS.contains(&map_id)
}

fn is_valid_map(map_id: &str) -> bool {
    is_campaign_map(map_id) || is_fun_map(map_id)
}

fn final_boss_for_map(map_id: &str) -> Option<&'static str> {
    match map_id {
        "lumbridge" => Some("wise_old_man"),
        "barrows" => Some("dharok"),
        "wilderness" => Some("king_black_dragon"),
        "desert" => Some("kalphite_queen"),
        "fremennik" => Some("vorkath"),
        "karamja" => Some("tztok_jad"),
        "kourend" => Some("alchemical_hydra"),
        "varlamore" => Some("sol_heredit"),
        _ => None,
    }
}

/// Returns the earliest possible spawn time (in seconds into a single round) for a boss on a map.
fn boss_earliest_spawn_seconds(map_id: &str, boss_id: &str) -> Option<u32> {
    match (map_id, boss_id) {
        // Lumbridge
        ("lumbridge", "count_draynor") => Some(450),
        ("lumbridge", "wise_old_man") => Some(900),
        // Barrows
        ("barrows", "torag") => Some(150),
        ("barrows", "karil") => Some(300),
        ("barrows", "guthan") => Some(450),
        ("barrows", "ahrim") => Some(600),
        ("barrows", "verac") => Some(750),
        ("barrows", "dharok") => Some(900),
        // Wilderness
        ("wilderness", "crazy_archaeologist") => Some(300),
        ("wilderness", "chaos_fanatic") => Some(600),
        ("wilderness", "king_black_dragon") => Some(900),
        // Desert
        ("desert", "fareed") => Some(300),
        ("desert", "dessous") => Some(450),
        ("desert", "damis") | ("desert", "damis_risen") => Some(600),
        ("desert", "kalphite_queen") => Some(900),
        // Fremennik
        ("fremennik", "dagannoth_rex") => Some(300),
        ("fremennik", "dagannoth_supreme") => Some(450),
        ("fremennik", "dagannoth_prime") => Some(600),
        ("fremennik", "vorkath") => Some(900),
        // Karamja
        ("karamja", "elvarg") => Some(300),
        ("karamja", "nezikchened") => Some(450),
        ("karamja", "ket_zek") => Some(600),
        ("karamja", "tztok_jad") => Some(900),
        // Kourend
        ("kourend", "lizardman_shaman") => Some(300),
        ("kourend", "sarachnis") => Some(450),
        ("kourend", "skotizo") => Some(600),
        ("kourend", "alchemical_hydra") => Some(900),
        // Varlamore
        ("varlamore", "manticore") => Some(300),
        ("varlamore", "shockwave_colossus") => Some(450),
        ("varlamore", "javelin_colossus") => Some(600),
        ("varlamore", "sol_heredit") => Some(900),
        // Fun maps (first boss at 240s)
        ("grand_exchange", "the_doubler" | "lure_master" | "bot_farm" | "melodox") => Some(240),
        ("east_varrock", "clan_leader" | "rune_2h_pure" | "wildy_mage") => Some(240),
        ("falador", "player_moderator" | "cursed_you" | "mod_murdoch") => Some(240),
        ("last_man_standing", "ags_specer" | "claws_specer" | "lms_dharok") => Some(240),
        _ => None,
    }
}

/// Mirrors `xpForLevel` and `runXpForLevel` / `endlessXpForLevel` from `src/game/core/xp.ts`.
fn osrs_xp_for_level(level: u32) -> u64 {
    let clamped = level.clamp(1, MAX_STANDARD_LEVEL);
    if clamped <= 1 {
        return 0;
    }
    let mut points = 0.0_f64;
    let mut xp = 0_u64;
    for lvl in 1..clamped {
        points += (lvl as f64 + 300.0 * 2.0_f64.powf(lvl as f64 / 7.0)).floor();
        xp = (points / 4.0).floor() as u64;
    }
    xp
}

fn run_xp_for_level(level: u32) -> u64 {
    let base = osrs_xp_for_level(level) as f64;
    let stretch = 1.0 + ((level.saturating_sub(1)) as f64) / 40.0;
    (base * stretch).floor() as u64
}

fn endless_xp_for_level(level: u32) -> u64 {
    const ENDLESS_STEEP_LEVELS: u32 = 40;
    const ENDLESS_LATE_GROWTH: f64 = 1.06;
    if level <= ENDLESS_STEEP_LEVELS {
        return run_xp_for_level(level);
    }
    let top = run_xp_for_level(ENDLESS_STEEP_LEVELS) as f64;
    let step = top - run_xp_for_level(ENDLESS_STEEP_LEVELS - 1) as f64;
    let g = ENDLESS_LATE_GROWTH;
    let levels = (level.min(MAX_ENDLESS_LEVEL) - ENDLESS_STEEP_LEVELS) as i32;
    (top + (step * g * (g.powi(levels) - 1.0)) / (g - 1.0)).floor() as u64
}

fn expected_level_for_xp(xp: u64, endless: bool) -> u32 {
    let max_lvl = if endless {
        MAX_ENDLESS_LEVEL
    } else {
        MAX_STANDARD_LEVEL
    };
    let mut level = 1;
    while level < max_lvl {
        let next_xp = if endless {
            endless_xp_for_level(level + 1)
        } else {
            run_xp_for_level(level + 1)
        };
        if next_xp <= xp {
            level += 1;
        } else {
            break;
        }
    }
    level
}

/// Validates OSRS-style display name (1..=12 chars, ASCII alphanumeric + single spaces/underscores/hyphens).
pub fn validate_display_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 12 {
        return Err("Display name must be between 1 and 12 characters.".to_string());
    }
    let mut prev_space = false;
    for ch in trimmed.chars() {
        let valid = ch.is_ascii_alphanumeric() || ch == ' ' || ch == '_' || ch == '-';
        if !valid {
            return Err(
                "Display name can only contain letters, numbers, spaces, hyphens and underscores."
                    .to_string(),
            );
        }
        if ch == ' ' && prev_space {
            return Err("Display name cannot have consecutive spaces.".to_string());
        }
        prev_space = ch == ' ';
    }
    Ok(trimmed.to_string())
}

/// Post-run heuristic & timeline anti-cheat verification.
pub fn verify_run(run: &RunSubmission) -> Result<(), String> {
    // 1. Validate map & character
    if !is_valid_map(&run.map_id) {
        return Err(format!("Unknown map '{}'.", run.map_id));
    }
    if !VALID_CHARACTERS.contains(&run.character_id.as_str()) {
        return Err(format!("Unknown adventurer '{}'.", run.character_id));
    }
    if run.map_id == "falador" && run.character_id != "durial321" {
        return Err("Falador runs must be played as Durial321.".to_string());
    }
    if is_fun_map(&run.map_id) {
        if !run.endless {
            return Err("Fun maps are always endless.".to_string());
        }
        if run.victory {
            return Err("Fun maps have no victory state.".to_string());
        }
    }

    // 2. Validate duration and tick rate consistency
    if !run.seconds.is_finite() || run.seconds < 0.0 || run.seconds > MAX_RUN_SECONDS {
        return Err("Invalid run duration.".to_string());
    }
    let expected_seconds = run.ticks as f64 / TICKS_PER_SECOND;
    if (expected_seconds - run.seconds).abs() > 0.2 {
        return Err("Run tick count does not match elapsed seconds.".to_string());
    }

    // 3. Validate mode, round, and victory timing
    if !run.endless {
        if run.round != 1 {
            return Err("Standard runs only have 1 round.".to_string());
        }
        if run.victory {
            if run.ticks < RUN_LENGTH_TICKS || run.seconds < RUN_LENGTH_SECONDS {
                return Err(
                    "Standard run cannot be won before the 15:00 final boss spawns.".to_string(),
                );
            }
            if let Some(final_boss) = final_boss_for_map(&run.map_id) {
                if !run.bosses_killed.iter().any(|b| b == final_boss) {
                    return Err(format!(
                        "Victory on {} requires defeating {}.",
                        run.map_id, final_boss
                    ));
                }
            }
        }
    } else {
        if run.victory {
            return Err("Endless runs do not end in a campaign victory.".to_string());
        }
        if run.round < 1 || run.round > 200 {
            return Err("Invalid endless round number.".to_string());
        }
        if run.round > 1 {
            let min_seconds =
                RUN_LENGTH_SECONDS + ((run.round - 2) as f64) * LATER_ROUND_SECONDS;
            if run.seconds + 0.5 < min_seconds {
                return Err(format!(
                    "Elapsed time ({:.1}s) is too short to reach round {}.",
                    run.seconds, run.round
                ));
            }
        }
    }

    // 4. Validate boss kill timeline
    if run.bosses_killed.len() != run.boss_kill_ticks.len() {
        return Err("Boss kill list and boss kill timestamps must match in length.".to_string());
    }
    if (run.kills as usize) < run.bosses_killed.len() {
        return Err("Total kills cannot be fewer than bosses killed.".to_string());
    }
    let mut prev_tick = 0_u32;
    for (i, boss_id) in run.bosses_killed.iter().enumerate() {
        let kill_tick = run.boss_kill_ticks[i];
        if kill_tick < prev_tick || kill_tick > run.ticks {
            return Err("Boss kill timestamps are out of order or exceed run duration.".to_string());
        }
        prev_tick = kill_tick;

        let Some(earliest_sec) = boss_earliest_spawn_seconds(&run.map_id, boss_id) else {
            return Err(format!(
                "Boss '{}' does not spawn on map '{}'.",
                boss_id, run.map_id
            ));
        };
        let earliest_tick = earliest_sec * 50;
        if kill_tick < earliest_tick {
            return Err(format!(
                "Boss '{}' was killed at {:.1}s before its earliest spawn at {}s.",
                boss_id,
                kill_tick as f64 / TICKS_PER_SECOND,
                earliest_sec
            ));
        }
    }

    // 5. Validate kill rate, XP/level, coins, and casket bounds
    let round_crowd = 1.0 + 0.5 * ((run.round.saturating_sub(1)) as f64);
    let max_kills = (run.seconds * 25.0 * round_crowd + 150.0).ceil() as u32;
    if run.kills > max_kills {
        return Err(format!(
            "Kill count ({}) exceeds plausible spawn limit ({}) for {:.1}s.",
            run.kills, max_kills, run.seconds
        ));
    }

    let max_caskets = (run.bosses_killed.len() as u32)
        .saturating_add((run.seconds / 10.0).ceil() as u32)
        .saturating_add(25);
    if run.caskets_opened > max_caskets {
        return Err("Caskets opened exceeds plausible drop rate.".to_string());
    }
    if run.gear_found.len() as u32 > run.caskets_opened.saturating_add(5) {
        return Err("Gear found exceeds caskets opened.".to_string());
    }

    let max_level_bound = if run.endless {
        MAX_ENDLESS_LEVEL
    } else {
        MAX_STANDARD_LEVEL
    };
    if run.level < 1 || run.level > max_level_bound {
        return Err("Invalid player level.".to_string());
    }
    let xp_level = expected_level_for_xp(run.xp, run.endless);
    // Antique lamps from caskets can grant up to 1 extra level per casket
    if run.level > xp_level.saturating_add(run.caskets_opened).saturating_add(2) {
        return Err(format!(
            "Player level ({}) is inconsistent with XP ({}) and caskets opened ({}).",
            run.level, run.xp, run.caskets_opened
        ));
    }

    if run.kills == 0 && run.caskets_opened == 0 && run.coins > 0 {
        return Err("Cannot bank coins with 0 kills and 0 caskets.".to_string());
    }
    let max_coins = (run.kills as u64)
        .saturating_mul(60)
        .saturating_add((run.caskets_opened as u64).saturating_mul(1500))
        .saturating_add(2500);
    if (run.coins as u64) > max_coins {
        return Err(format!(
            "Coins banked ({}) exceeds plausible maximum ({}) for this run.",
            run.coins, max_coins
        ));
    }

    Ok(())
}

fn default_player_save(identity: Identity, now: Timestamp) -> PlayerSave {
    let short_id = identity.to_hex().chars().take(6).collect::<String>();
    PlayerSave {
        identity,
        display_name: format!("Adv_{}", short_id),
        created_at: now,
        updated_at: now,
        last_run_at: Timestamp::from_micros_since_unix_epoch(0),
        coins: 0,
        total_coins: 0,
        upgrades: Vec::new(),
        upgrades_spent: 0,
        unlocked_characters: vec![
            "warrior".to_string(),
            "wizard".to_string(),
            "ranger".to_string(),
        ],
        unlocked_items: Vec::new(),
        runs: 0,
        victories: 0,
        map_victories: Vec::new(),
        total_kills: 0,
        best_seconds: 0.0,
        best_level: 0,
        endless_best: Vec::new(),
        found_gear: Vec::new(),
        armoury: Vec::new(),
    }
}

fn push_unique(list: &mut Vec<String>, item: &str) {
    if !list.iter().any(|x| x == item) {
        list.push(item.to_string());
    }
}

fn apply_unlocks_to_save(save: &mut PlayerSave, run: Option<&RunSubmission>) {
    let has_beaten = |map_id: &str, mv: &[KeyCount]| -> bool {
        mv.iter().any(|entry| entry.id == map_id && entry.count > 0)
    };
    let killed_boss = |map_id: &str, boss_id: &str| -> bool {
        run.map(|r| r.map_id == map_id && r.bosses_killed.iter().any(|b| b == boss_id))
            .unwrap_or(false)
    };
    let survived = |map_id: &str, secs: f64| -> bool {
        run.map(|r| r.map_id == map_id && r.seconds >= secs)
            .unwrap_or(false)
    };

    // Character unlocks
    let char_tasks: &[(&str, bool)] = &[
        ("monk", killed_boss("lumbridge", "count_draynor")),
        ("barbarian", has_beaten("lumbridge", &save.map_victories)),
        ("ancient_mage", killed_boss("barrows", "ahrim")),
        ("hunter", has_beaten("barrows", &save.map_victories)),
        ("rogue", survived("wilderness", 600.0)),
        ("dragon_slayer", has_beaten("wilderness", &save.map_victories)),
        ("nomad", has_beaten("desert", &save.map_victories)),
        ("menaphite", killed_boss("desert", "damis_risen")),
        ("seer", has_beaten("fremennik", &save.map_victories)),
        ("berserker", killed_boss("fremennik", "dagannoth_rex")),
        ("obby_mauler", has_beaten("karamja", &save.map_victories)),
        ("pirate", survived("karamja", 780.0)),
        ("pyromancer", has_beaten("kourend", &save.map_victories)),
        ("shayzien_soldier", killed_boss("kourend", "sarachnis")),
        ("gladiator", has_beaten("varlamore", &save.map_victories)),
        ("javelineer", killed_boss("varlamore", "javelin_colossus")),
        ("scammer", survived("grand_exchange", 600.0)),
        ("f2p_pker", killed_boss("east_varrock", "clan_leader")),
        ("durial321", survived("falador", 366.0)),
        ("lms_sweat", killed_boss("last_man_standing", "ags_specer")),
    ];
    for (char_id, earned) in char_tasks {
        if *earned {
            push_unique(&mut save.unlocked_characters, char_id);
        }
    }

    // Item unlocks
    let item_tasks: &[(&str, bool)] = &[
        ("osmumtens_fang", has_beaten("desert", &save.map_victories)),
        ("smoke_burst", killed_boss("desert", "fareed")),
        ("blood_burst", killed_boss("desert", "dessous")),
        ("shadow_burst", killed_boss("desert", "damis_risen")),
        (
            "dragon_hunter_crossbow",
            has_beaten("fremennik", &save.map_victories),
        ),
        ("vengeance", killed_boss("fremennik", "dagannoth_prime")),
        ("astral_runes", killed_boss("fremennik", "dagannoth_prime")),
        ("tzhaar_ket_om", has_beaten("karamja", &save.map_victories)),
        ("dragonfire_shield", killed_boss("karamja", "elvarg")),
        ("obsidian_armour", killed_boss("karamja", "ket_zek")),
        ("toktz_xil_ul", killed_boss("karamja", "ket_zek")),
        ("kodai_wand", has_beaten("kourend", &save.map_victories)),
        (
            "dragon_warhammer",
            killed_boss("kourend", "lizardman_shaman"),
        ),
        ("book_of_the_dead", killed_boss("kourend", "skotizo")),
        ("undead_grasp", killed_boss("kourend", "skotizo")),
        (
            "dizanas_quiver",
            has_beaten("varlamore", &save.map_victories),
        ),
        (
            "colossal_blade",
            has_beaten("varlamore", &save.map_victories),
        ),
        ("dual_macuahuitl", killed_boss("varlamore", "manticore")),
        (
            "blue_moon_spear",
            killed_boss("varlamore", "shockwave_colossus"),
        ),
        (
            "eclipse_atlatl",
            killed_boss("varlamore", "javelin_colossus"),
        ),
    ];
    for (item_id, earned) in item_tasks {
        if *earned {
            push_unique(&mut save.unlocked_items, item_id);
        }
    }
}

pub fn compute_standard_score(run: &RunSubmission) -> u64 {
    let win_bonus = if run.victory { 1_000_000_u64 } else { 0_u64 };
    win_bonus
        + (run.kills as u64) * 10
        + (run.coins as u64)
        + (run.level as u64) * 100
        + (run.seconds.round() as u64)
}

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) -> Result<(), String> {
    authz::configure(
        ctx,
        authz::AuthzSettings {
            watch: vec!["game.play".into(), "admin".into()],
            clients_delete_scopes: false,
        },
    );
    authz::bootstrap(ctx, ctx.sender())?;
    let player = authz::create_role(ctx, authz::GLOBAL, "player", &["game.play"], &[])?;
    let moderator = authz::create_role(
        ctx,
        authz::GLOBAL,
        "moderator",
        &["game.moderate", "authz.audit"],
        &[player],
    )?;
    authz::create_role(
        ctx,
        authz::GLOBAL,
        "admin",
        &["admin", "authz.grant", "authz.invite", "authz.role"],
        &[moderator],
    )?;
    Ok(())
}

fn ensure_authenticated(ctx: &ReducerContext) -> Result<(), String> {
    let sender = ctx.sender();
    if sender == Identity::from_byte_array([0; 32]) {
        return Err("Authentication required. Please log in via SpacetimeAuth.".to_string());
    }
    // Auto-grant "player" role globally if user has no grants yet
    let grants_count = ctx.db.authz_grant().identity().filter(&sender).count();
    if grants_count == 0 {
        if let Some(player_role) = authz::find_role(ctx, authz::GLOBAL, "player") {
            let _ = authz::grant(ctx, sender, player_role, authz::GLOBAL, None, None);
        }
    }
    Ok(())
}

#[spacetimedb::reducer]
pub fn set_display_name(ctx: &ReducerContext, display_name: String) -> Result<(), String> {
    ensure_authenticated(ctx)?;
    authz::require(ctx, "game.play", authz::GLOBAL)?;
    let clean = validate_display_name(&display_name)?;
    let sender = ctx.sender();
    let existing = ctx
        .db
        .player_save()
        .identity()
        .find(sender)
        .unwrap_or_else(|| default_player_save(sender, ctx.timestamp));

    let updated = PlayerSave {
        display_name: clean.clone(),
        updated_at: ctx.timestamp,
        ..existing
    };
    if ctx.db.player_save().identity().find(sender).is_some() {
        ctx.db.player_save().identity().update(updated);
    } else {
        ctx.db.player_save().insert(updated);
    }

    // Keep leaderboard rows in sync with the new display name
    let endless_rows: Vec<LeaderboardEndless> = ctx
        .db
        .leaderboard_endless()
        .identity()
        .filter(&sender)
        .collect();
    for row in endless_rows {
        ctx.db.leaderboard_endless().id().update(LeaderboardEndless {
            display_name: clean.clone(),
            ..row
        });
    }

    let standard_rows: Vec<LeaderboardStandard> = ctx
        .db
        .leaderboard_standard()
        .identity()
        .filter(&sender)
        .collect();
    for row in standard_rows {
        ctx.db
            .leaderboard_standard()
            .id()
            .update(LeaderboardStandard {
                display_name: clean.clone(),
                ..row
            });
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn submit_run(ctx: &ReducerContext, run: RunSubmission) -> Result<(), String> {
    ensure_authenticated(ctx)?;
    authz::require(ctx, "game.play", authz::GLOBAL)?;
    verify_run(&run)?;

    let sender = ctx.sender();
    let mut save = ctx
        .db
        .player_save()
        .identity()
        .find(sender)
        .unwrap_or_else(|| default_player_save(sender, ctx.timestamp));

    // Wall-clock elapsed time anti-cheat check (zero extra reducer invocations)
    let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
    let last_run_micros = save.last_run_at.to_micros_since_unix_epoch();
    if last_run_micros > 0 {
        let elapsed_seconds = ((now_micros.saturating_sub(last_run_micros)) as f64) / 1_000_000.0;
        // 15 seconds grace leeway for network latency / clock jitter
        if elapsed_seconds + 15.0 < run.seconds {
            return Err(format!(
                "Submission rejected: claimed duration ({:.1}s) exceeds elapsed server time ({:.1}s).",
                run.seconds, elapsed_seconds
            ));
        }
    }
    save.last_run_at = ctx.timestamp;

    // Update progression stats
    save.coins = save.coins.saturating_add(run.coins as u64);
    save.total_coins = save.total_coins.saturating_add(run.coins as u64);
    save.runs = save.runs.saturating_add(1);
    if run.victory {
        save.victories = save.victories.saturating_add(1);
        if let Some(entry) = save
            .map_victories
            .iter_mut()
            .find(|e| e.id == run.map_id)
        {
            entry.count = entry.count.saturating_add(1);
        } else {
            save.map_victories.push(KeyCount {
                id: run.map_id.clone(),
                count: 1,
            });
        }
    }
    save.total_kills = save.total_kills.saturating_add(run.kills as u64);
    if run.seconds > save.best_seconds {
        save.best_seconds = run.seconds;
    }
    if run.level > save.best_level {
        save.best_level = run.level;
    }
    if run.endless {
        if let Some(entry) = save
            .endless_best
            .iter_mut()
            .find(|e| e.map_id == run.map_id)
        {
            if run.round > entry.round
                || (run.round == entry.round && run.seconds > entry.seconds)
            {
                entry.round = run.round;
                entry.seconds = run.seconds;
            }
        } else {
            save.endless_best.push(MapEndlessBest {
                map_id: run.map_id.clone(),
                round: run.round,
                seconds: run.seconds,
            });
        }
    }
    for gear_id in &run.gear_found {
        push_unique(&mut save.found_gear, gear_id);
    }
    apply_unlocks_to_save(&mut save, Some(&run));
    save.updated_at = ctx.timestamp;

    let display_name = save.display_name.clone();
    if ctx.db.player_save().identity().find(sender).is_some() {
        ctx.db.player_save().identity().update(save);
    } else {
        ctx.db.player_save().insert(save);
    }

    // Update appropriate leaderboard
    if run.endless {
        let existing = ctx
            .db
            .leaderboard_endless()
            .by_map_player()
            .filter((&run.map_id, &sender))
            .next();
        if let Some(prev) = existing {
            let better = run.round > prev.round
                || (run.round == prev.round && run.seconds > prev.seconds)
                || (run.round == prev.round
                    && (run.seconds - prev.seconds).abs() < 1e-6
                    && run.kills > prev.kills);
            if better {
                ctx.db
                    .leaderboard_endless()
                    .id()
                    .update(LeaderboardEndless {
                        display_name,
                        character_id: run.character_id,
                        round: run.round,
                        seconds: run.seconds,
                        level: run.level,
                        kills: run.kills,
                        coins: run.coins,
                        recorded_at: ctx.timestamp,
                        ..prev
                    });
            }
        } else {
            ctx.db.leaderboard_endless().insert(LeaderboardEndless {
                id: 0,
                map_id: run.map_id,
                identity: sender,
                display_name,
                character_id: run.character_id,
                round: run.round,
                seconds: run.seconds,
                level: run.level,
                kills: run.kills,
                coins: run.coins,
                recorded_at: ctx.timestamp,
            });
        }
    } else {
        let score = compute_standard_score(&run);
        let existing = ctx
            .db
            .leaderboard_standard()
            .by_map_player()
            .filter((&run.map_id, &sender))
            .next();
        if let Some(prev) = existing {
            if score > prev.score {
                ctx.db
                    .leaderboard_standard()
                    .id()
                    .update(LeaderboardStandard {
                        display_name,
                        character_id: run.character_id,
                        victory: run.victory,
                        seconds: run.seconds,
                        level: run.level,
                        kills: run.kills,
                        coins: run.coins,
                        score,
                        recorded_at: ctx.timestamp,
                        ..prev
                    });
            }
        } else {
            ctx.db.leaderboard_standard().insert(LeaderboardStandard {
                id: 0,
                map_id: run.map_id,
                identity: sender,
                display_name,
                character_id: run.character_id,
                victory: run.victory,
                seconds: run.seconds,
                level: run.level,
                kills: run.kills,
                coins: run.coins,
                score,
                recorded_at: ctx.timestamp,
            });
        }
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn sync_save(ctx: &ReducerContext, payload: SavePayload) -> Result<(), String> {
    ensure_authenticated(ctx)?;
    authz::require(ctx, "game.play", authz::GLOBAL)?;
    if payload.coins > payload.total_coins {
        return Err("Current coins cannot exceed total coins earned.".to_string());
    }
    if payload.victories > payload.runs {
        return Err("Victories cannot exceed total runs.".to_string());
    }
    if !payload.best_seconds.is_finite()
        || payload.best_seconds < 0.0
        || payload.best_seconds > MAX_RUN_SECONDS
    {
        return Err("Invalid best survival time.".to_string());
    }
    if payload.best_level > MAX_ENDLESS_LEVEL {
        return Err("Invalid best level.".to_string());
    }

    // Validate shop upgrade ranks
    let mut clean_upgrades = Vec::new();
    for entry in &payload.upgrades {
        let Some((_, max_rank, _)) = SHOP_UPGRADES.iter().find(|(id, _, _)| *id == entry.id)
        else {
            return Err(format!("Unknown shop upgrade '{}'.", entry.id));
        };
        if entry.rank > *max_rank {
            return Err(format!(
                "Upgrade '{}' rank ({}) exceeds max rank ({}).",
                entry.id, entry.rank, max_rank
            ));
        }
        if entry.rank > 0 && !clean_upgrades.iter().any(|u: &KeyRank| u.id == entry.id) {
            clean_upgrades.push(entry.clone());
        }
    }

    let mut clean_armoury = Vec::new();
    for entry in &payload.armoury {
        if entry.rank > 4 {
            return Err(format!(
                "Armoury upgrade count for '{}' exceeds maximum.",
                entry.id
            ));
        }
        if entry.rank > 0 && !clean_armoury.iter().any(|a: &KeyRank| a.id == entry.id) {
            clean_armoury.push(entry.clone());
        }
    }

    let sender = ctx.sender();
    let mut save = ctx
        .db
        .player_save()
        .identity()
        .find(sender)
        .unwrap_or_else(|| default_player_save(sender, ctx.timestamp));

    // Merge monotonic records & sets, and adopt the latest shop/armoury allocation
    for ch in &payload.unlocked_characters {
        if VALID_CHARACTERS.contains(&ch.as_str()) {
            push_unique(&mut save.unlocked_characters, ch);
        }
    }
    for item in &payload.unlocked_items {
        push_unique(&mut save.unlocked_items, item);
    }
    for gear in &payload.found_gear {
        push_unique(&mut save.found_gear, gear);
    }
    for mv in &payload.map_victories {
        if is_campaign_map(&mv.id) && mv.count > 0 {
            if let Some(existing) = save.map_victories.iter_mut().find(|e| e.id == mv.id) {
                existing.count = existing.count.max(mv.count);
            } else {
                save.map_victories.push(mv.clone());
            }
        }
    }
    for eb in &payload.endless_best {
        if is_valid_map(&eb.map_id) && eb.round > 0 && eb.seconds.is_finite() && eb.seconds >= 0.0 {
            if let Some(existing) = save
                .endless_best
                .iter_mut()
                .find(|e| e.map_id == eb.map_id)
            {
                if eb.round > existing.round
                    || (eb.round == existing.round && eb.seconds > existing.seconds)
                {
                    existing.round = eb.round;
                    existing.seconds = eb.seconds;
                }
            } else {
                save.endless_best.push(eb.clone());
            }
        }
    }

    save.runs = save.runs.max(payload.runs);
    save.victories = save.victories.max(payload.victories);
    save.total_kills = save.total_kills.max(payload.total_kills);
    save.best_seconds = save.best_seconds.max(payload.best_seconds);
    save.best_level = save.best_level.max(payload.best_level);
    save.total_coins = save.total_coins.max(payload.total_coins);
    save.coins = payload.coins.min(save.total_coins);
    save.upgrades = clean_upgrades;
    save.upgrades_spent = payload.upgrades_spent;
    save.armoury = clean_armoury;
    apply_unlocks_to_save(&mut save, None);
    save.updated_at = ctx.timestamp;

    if ctx.db.player_save().identity().find(sender).is_some() {
        ctx.db.player_save().identity().update(save);
    } else {
        ctx.db.player_save().insert(save);
    }

    Ok(())
}
