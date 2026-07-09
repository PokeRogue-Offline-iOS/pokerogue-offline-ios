import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { signatureSpecies } from "#balance/signature-species";
import { allBiomes } from "#data/data-lists";
import { Button } from "#enums/buttons";
import { DexAttr } from "#enums/dex-attr";
import { ClassicFixedBossWaves } from "#enums/fixed-boss-waves";
import { Passive as PassiveAttr } from "#enums/passive";
import { PokemonType } from "#enums/pokemon-type";
import { TextStyle } from "#enums/text-style";
import { TrainerType } from "#enums/trainer-type";
import { TrainerVariant } from "#enums/trainer-variant";
import { UiMode } from "#enums/ui-mode";
import { getVariantIcon, getVariantTint } from "#sprites/variant";
import { RibbonData, type RibbonFlag } from "#system/ribbons/ribbon-data";
import { getVoucherTypeIcon, vouchers } from "#system/voucher";
import { trainerConfigs } from "#trainers/trainer-config";
import { MessageUiHandler } from "#ui/message-ui-handler";
import { ScrollBar } from "#ui/scroll-bar";
import { addTextObject } from "#ui/text";
import { addWindow } from "#ui/ui-theme";
import { getBiomeName, getLocalizedSpriteKey } from "#utils/common";
import { getAvailableRibbons, getRibbonKey, orderedRibbons } from "#utils/ribbon-utils";

/**
 * Offline-only "Completionist Dex" screen. Read-only against
 * `globalScene.gameData` - never mutates save data. Recomputed fresh every
 * time the screen is opened, same as the real Achievements/Pokedex screens.
 *
 * Architecture mirrors `AchvsUiHandler` (header bar / icon grid+scrollbar /
 * single title bar / description panel), extended with arbitrary-depth
 * category nesting via a menu stack, plus a separate "drilldown" mode:
 *
 *   Browsing (menuStack): each stack frame is a list of tiles - either
 *   GROUP tiles (open a child frame) or LEAF tiles (open a drilldown).
 *   Groups can nest arbitrarily (`Pokemon > Shiny Starters > Tier 2` is 3
 *   levels of grouping before you even reach a drilldown). Each frame
 *   remembers its own cursor/scroll position, so CANCEL-ing back up always
 *   restores where you were, not a fresh cursor at 0.
 *
 *   Drilldown: a grid of the actual species (or list of vouchers) for
 *   whichever leaf was selected. Defaults to showing what you already
 *   HAVE. Button.STATS (keyboard `C`/`Shift`) toggles to MISSING - if the
 *   target side is empty, the toggle is blocked, plays the UI error sound,
 *   and the description panel shows "Nothing to show" instead of silently
 *   flipping to a blank grid. ACTION on a species icon opens that species'
 *   real Pokedex entry (UiMode.POKEDEX_PAGE), pre-set to whatever
 *   shiny/variant state the icon was actually rendered as (see
 *   `variantMode` below) - not always the plain default view. No-op on
 *   voucher items.
 *
 * The header bar is a breadcrumb built from the menu stack's frame labels,
 * plus the current leaf's label while drilled down, e.g.
 * "Completionist Dex > Pokemon > Shiny Starters > Tier 2".
 *
 * Category tree (all derived from real, already-persisted save fields -
 * nothing new is stored by this screen):
 *
 *   Pokemon (group, pb icon)
 *     - Starters Unlocked -> starters where `caughtAttr !== 0n`
 *     - Shiny Starters (group, golden_egg icon)
 *         - Any Tier -> starters where `caughtAttr & DexAttr.SHINY`
 *         - Tier 1    -> starters where `caughtAttr & DexAttr.SHINY` AND `caughtAttr & DexAttr.DEFAULT_VARIANT`
 *         - Tier 2    -> starters where `caughtAttr & DexAttr.SHINY` AND `caughtAttr & DexAttr.VARIANT_2`
 *         - Tier 3    -> starters where `caughtAttr & DexAttr.SHINY` AND `caughtAttr & DexAttr.VARIANT_3`
 *         IMPORTANT: DEFAULT_VARIANT/VARIANT_2/VARIANT_3 are NOT shiny-tier
 *         flags on their own - `Pokemon.getDexAttr()` sets exactly one of
 *         them on every catch, shiny or not (`this.variant` defaults to 0
 *         for non-shiny catches too), so DEFAULT_VARIANT alone matches ANY
 *         caught starter. Shininess is tracked entirely separately via the
 *         SHINY bit, hence the explicit SHINY guard on every tier. (Real
 *         bug caught via testing: Tier 1 originally showed 100% completion
 *         because that guard was missing.)
 *         Non-exclusive - a starter can be in multiple tier lists if each
 *         variant was individually caught. Tier tiles use the real
 *         `shiny_icons` sparkle for that tier (`getVariantIcon`/
 *         `getVariantTint`); "Any Tier" reuses the parent's golden_egg
 *         since there's no dedicated "any" sparkle asset.
 *     - Species Fought -> all species where `seenCount > 0` (what the game
 *                         internally calls "Encountered")
 *     - Species Seen   -> all species where `seenAttr !== 0n || caughtAttr !== 0n`
 *                         (approximates real `isSeen()`, doesn't chase the
 *                         base-starter fallback for evolved/hatched-
 *                         without-encounter edge cases)
 *     - Species Caught -> all species where `caughtAttr !== 0n`. NOTE: this
 *                         was originally `caughtCount > 0`, which was wrong
 *                         - `caughtCount` only increments on a direct
 *                         wild/trainer catch, NOT on hatching or evolving
 *                         into a species. `caughtAttr` is set unconditionally
 *                         regardless of how the species was obtained, and is
 *                         what the real Pokedex screen itself checks.
 *     - Pokemon Forms  -> species with more than one form: "have" = every
 *                         form bit on `caughtAttr` (bits 7..7+n, matching
 *                         `GameData.getFormAttr()`'s encoding) is set,
 *                         "missing" = at least one isn't. Species with only
 *                         one form are excluded entirely, not counted
 *                         either way.
 *
 *   Vouchers (group) - the `vouchers` registry, split by TrainerType band:
 *     - Gym Leaders -> >= BROCK    && < LORELEI
 *     - Elite Four  -> >= LORELEI  && < BLUE
 *     - Champion    -> >= BLUE     && < RIVAL
 *     - Evil Team   -> >= ROCKET_BOSS_GIOVANNI_1 && < BROCK
 *     `vouchers` also has a CLASSIC_VICTORY entry that isn't a TrainerType
 *     at all - `TrainerType[key]` resolves to `undefined` for it and it's
 *     skipped. The Evil Team band technically also spans the generic-grunt
 *     and Mystery-Encounter-trainer TrainerType numbers, but neither of
 *     those ever has a voucher, so filtering the already-voucher-only
 *     registry by that range is safe in practice.
 *
 *   Candy (group) - starters, split into four sub-categories:
 *     - Passives             -> `passiveAttr & PassiveAttr.UNLOCKED`
 *     - Any Reduction Amount -> `starterData.valueReduction >= 1`
 *     - One Reduction        -> `starterData.valueReduction === 1` (exactly)
 *     - Two Reductions       -> `starterData.valueReduction === 2` (max)
 *     "Any Reduction Amount" is the union of the other two; "One"/"Two" are
 *     exact matches, so a fully-maxed starter shows under "Two Reductions"
 *     and "Any Reduction Amount" but NOT "One Reduction".
 *
 *   Ribbons (group) - all 39 flags from the real `orderedRibbons` list (18
 *   mono-type, 9 mono-gen, 12 challenge-run ribbons like Classic/Nuzlocke/
 *   Friendship), each its own sub-category. Correctly scoped by real
 *   eligibility via the base game's own `getAvailableRibbons(species)` -
 *   NOT "every species not marked". For each ribbon:
 *     - Have    -> available to that species AND `dexData[id].ribbons.has(flag)`
 *     - Missing -> available AND not yet earned
 *     Species the ribbon isn't available to at all (e.g. a pure Water-type
 *     under Mono Fire) are excluded from both lists entirely.
 *     `getAvailableRibbons` walks the species' forward evolution chain too,
 *     since ribbon-awarding cascades DOWN to prevolutions
 *     (`awardRibbonsToSpeciesLine`) - so a base-form's availability
 *     correctly includes anything any of its evolutions could earn.
 *     Icons use the base game's real ribbon sprites where they exist
 *     (Classic, Friendship, all mono-type/mono-gen); the other 10 challenge
 *     ribbons (Nuzlocke, Flip Stats, Inverse, Fresh Start, Hardcore,
 *     Limited Catch, No Heal, No Shop, No Support, Passive Challenge) share
 *     one generic "ribbon_typeless" icon - that's a real base-game
 *     limitation (see `ribbonFlagToAssetKey`), not a shortcut taken here.
 *     Tile labels are NOT the real locale string (`ribbons:${key}`) - that's
 *     a full sentence description ("It has completed the Fire monotype
 *     challenge."), used nowhere as a title even in the base game's own
 *     Ribbon Tray screen. Labels are instead derived from the camelCase
 *     `getRibbonKey()` value itself via `ribbonDisplayName()`.
 */

type CategoryKind = "species" | "voucher";

/**
 * How a species-kind leaf's "have"-list icons should render in the
 * drilldown grid. Missing-list icons and every leaf without this set
 * always render as plain default (non-shiny) sprites.
 *   - undefined: plain default sprite (the common case)
 *   - 0 | 1 | 2: shiny, fixed at that specific variant tier
 *   - "highest": shiny, at whichever variant is actually highest on that
 *     species' `caughtAttr` (computed per-species at render time)
 */
type VariantMode = "highest" | 0 | 1 | 2;

interface LeafCategory {
  label: string;
  kind: CategoryKind;
  iconTexture: string;
  iconFrame: string | number;
  iconTint?: number;
  variantMode?: VariantMode;
  /** Species IDs or voucher keys the player already has. */
  haveIds: (number | string)[];
  /** Species IDs or voucher keys the player is missing. */
  missingIds: (number | string)[];
}

interface GroupCategory {
  label: string;
  iconTexture: string;
  iconFrame: string | number;
  iconTint?: number;
  subCategories: TopCategory[];
}

type TopCategory = LeafCategory | GroupCategory;

function isGroup(category: TopCategory): category is GroupCategory {
  return "subCategories" in category;
}

/** Recursively sums have/total across a group's entire subtree, or returns a leaf's own totals. */
function sumTotals(category: TopCategory): { have: number; total: number } {
  if (!isGroup(category)) {
    return { have: category.haveIds.length, total: category.haveIds.length + category.missingIds.length };
  }
  let have = 0;
  let total = 0;
  for (const sub of category.subCategories) {
    const r = sumTotals(sub);
    have += r.have;
    total += r.total;
  }
  return { have, total };
}

function pct(current: number, total: number): number {
  return total > 0 ? Math.round((current / total) * 1000) / 10 : 0;
}

/**
 * Frame name (in the "items" atlas) for a given ribbon flag, mirroring the
 * base game's own `ribbonFlagToAssetKey()` (which returns a rendered
 * `Image` game object, so isn't reusable directly against our pooled icon
 * sprites - this is a pure string-returning equivalent, same frame names).
 * Only Classic, Friendship, and the 27 mono-type/mono-gen ribbons have
 * dedicated art in the base game - every other challenge ribbon (Nuzlocke,
 * Flip Stats, Inverse, Fresh Start, Hardcore, Limited Catch, No Heal, No
 * Shop, No Support, Passive Challenge) falls back to the shared
 * "ribbon_typeless" frame, same as it does in the real Achievements/Ribbon
 * Tray screens - not a corner cut here, that's genuinely all the art that
 * exists upstream.
 */
function ribbonFrame(flag: RibbonFlag): string {
  switch (flag) {
    case RibbonData.CLASSIC:
      return "classic_ribbon_default";
    case RibbonData.FRIENDSHIP:
      return "ribbon_friendship";
    case RibbonData.MONO_GEN_1:
      return "ribbon_gen1";
    case RibbonData.MONO_GEN_2:
      return "ribbon_gen2";
    case RibbonData.MONO_GEN_3:
      return "ribbon_gen3";
    case RibbonData.MONO_GEN_4:
      return "ribbon_gen4";
    case RibbonData.MONO_GEN_5:
      return "ribbon_gen5";
    case RibbonData.MONO_GEN_6:
      return "ribbon_gen6";
    case RibbonData.MONO_GEN_7:
      return "ribbon_gen7";
    case RibbonData.MONO_GEN_8:
      return "ribbon_gen8";
    case RibbonData.MONO_GEN_9:
      return "ribbon_gen9";
    case RibbonData.MONO_NORMAL:
      return "ribbon_normal";
    case RibbonData.MONO_FIGHTING:
      return "ribbon_fighting";
    case RibbonData.MONO_FLYING:
      return "ribbon_flying";
    case RibbonData.MONO_POISON:
      return "ribbon_poison";
    case RibbonData.MONO_GROUND:
      return "ribbon_ground";
    case RibbonData.MONO_ROCK:
      return "ribbon_rock";
    case RibbonData.MONO_BUG:
      return "ribbon_bug";
    case RibbonData.MONO_GHOST:
      return "ribbon_ghost";
    case RibbonData.MONO_STEEL:
      return "ribbon_steel";
    case RibbonData.MONO_FIRE:
      return "ribbon_fire";
    case RibbonData.MONO_WATER:
      return "ribbon_water";
    case RibbonData.MONO_GRASS:
      return "ribbon_grass";
    case RibbonData.MONO_ELECTRIC:
      return "ribbon_electric";
    case RibbonData.MONO_PSYCHIC:
      return "ribbon_psychic";
    case RibbonData.MONO_ICE:
      return "ribbon_ice";
    case RibbonData.MONO_DRAGON:
      return "ribbon_dragon";
    case RibbonData.MONO_DARK:
      return "ribbon_dark";
    case RibbonData.MONO_FAIRY:
      return "ribbon_fairy";
    default:
      return "ribbon_typeless";
  }
}

/**
 * The base game has no short display NAME for ribbons anywhere - only the
 * full sentence description via `ribbons:${getRibbonKey(flag)}` (e.g. "It
 * has completed the Fire monotype challenge."), confirmed by checking how
 * the real Ribbon Tray screen uses it (only ever as description text, via
 * `showText()`, never as a title). So for the tile label we derive a short
 * name from the camelCase key itself: "monoFire" -> "Mono Fire",
 * "monoGen1" -> "Mono Gen 1", "activePassives" -> "Active Passives".
 */
function ribbonDisplayName(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Elite Four members' real wave assignment(s), transcribed from
 * `fixed-battle-configs.ts`'s `classicFixedBattles` (ELITE_FOUR_1..4).
 * That file only exposes these as randomizer closures
 * (`getRandomTrainerFunc(...)`), not as an inspectable array, so this is a
 * manual, static copy of the same pool data - NOT derived by calling into
 * the real randomizer (which needs live battle-seed state we don't have on
 * a menu screen). Needs revisiting if that file's pools ever change.
 * Paired [A, B] region-variant entries are flattened - only membership
 * matters here, not which specific entry a given run would pick.
 */
const ELITE_FOUR_WAVE_POOLS: { wave: number; trainers: TrainerType[] }[] = [
  {
    wave: ClassicFixedBossWaves.ELITE_FOUR_1,
    trainers: [
      TrainerType.LORELEI,
      TrainerType.WILL,
      TrainerType.SIDNEY,
      TrainerType.AARON,
      TrainerType.SHAUNTAL,
      TrainerType.MALVA,
      TrainerType.HALA,
      TrainerType.MOLAYNE,
      TrainerType.MARNIE_ELITE,
      TrainerType.BEDE_ELITE,
      TrainerType.RIKA,
      TrainerType.CRISPIN,
    ],
  },
  {
    wave: ClassicFixedBossWaves.ELITE_FOUR_2,
    trainers: [
      TrainerType.BRUNO,
      TrainerType.KOGA,
      TrainerType.PHOEBE,
      TrainerType.BERTHA,
      TrainerType.MARSHAL,
      TrainerType.SIEBOLD,
      TrainerType.OLIVIA,
      TrainerType.NESSA_ELITE,
      TrainerType.POPPY,
      TrainerType.AMARYS,
    ],
  },
  {
    wave: ClassicFixedBossWaves.ELITE_FOUR_3,
    trainers: [
      TrainerType.AGATHA,
      TrainerType.BRUNO,
      TrainerType.GLACIA,
      TrainerType.FLINT,
      TrainerType.GRIMSLEY,
      TrainerType.WIKSTROM,
      TrainerType.ACEROLA,
      TrainerType.BEA_ELITE,
      TrainerType.ALLISTER_ELITE,
      TrainerType.LARRY_ELITE,
      TrainerType.LACEY,
    ],
  },
  {
    wave: ClassicFixedBossWaves.ELITE_FOUR_4,
    trainers: [
      TrainerType.LANCE,
      TrainerType.KAREN,
      TrainerType.DRAKE,
      TrainerType.LUCIAN,
      TrainerType.CAITLIN,
      TrainerType.DRASNA,
      TrainerType.KAHILI,
      TrainerType.RAIHAN_ELITE,
      TrainerType.HASSEL,
      TrainerType.DRAYTON,
    ],
  },
];

/** Every wave slot a given Elite Four member can appear in (usually one, occasionally two). */
function getEliteFourWaves(trainerType: TrainerType): number[] {
  return ELITE_FOUR_WAVE_POOLS.filter(p => p.trainers.includes(trainerType)).map(p => p.wave);
}

/** The one biome a Gym Leader's TrainerType shows up in, scanning every biome's real `trainerPool` (all tiers, though gym leaders only ever live in BOSS in practice). */
function getGymLeaderBiome(trainerType: TrainerType): string | null {
  for (const biome of allBiomes.values()) {
    const allTrainersInBiome = Object.values(biome.trainerPool).flat();
    if (allTrainersInBiome.includes(trainerType)) {
      return getBiomeName(biome.biomeId);
    }
  }
  return null;
}

/**
 * Human-readable spawn info for a trainer voucher's detail page, per
 * TrainerType band (same bands used to sort vouchers into their
 * sub-categories in `computeCategories()`):
 *   - Gym Leader  -> their one associated biome
 *   - Evil Team   -> always both fixed boss waves (115, 165), regardless of
 *                    which team - matches how ClassicFixedBossWaves.EVIL_BOSS_1/2
 *                    work for every evil team equally
 *   - Elite Four  -> their real wave assignment(s) via getEliteFourWaves()
 *   - Champion    -> always wave 190
 */
function getTrainerSpawnInfo(trainerType: TrainerType): string {
  if (trainerType >= TrainerType.BROCK && trainerType < TrainerType.LORELEI) {
    const biomeName = getGymLeaderBiome(trainerType);
    return biomeName ? `Biome: ${biomeName}` : "Biome: Unknown";
  }
  if (trainerType >= TrainerType.LORELEI && trainerType < TrainerType.BLUE) {
    const waves = getEliteFourWaves(trainerType);
    return waves.length > 0 ? `Wave ${waves.join(", ")}` : "Wave: Unknown";
  }
  if (trainerType >= TrainerType.BLUE && trainerType < TrainerType.RIVAL) {
    return "Wave 190";
  }
  return `Wave ${ClassicFixedBossWaves.EVIL_BOSS_1}, Wave ${ClassicFixedBossWaves.EVIL_BOSS_2}`;
}

const LEVEL0_COLS = 8;
const LEVEL0_ROWS = 2;
const LEVEL1_COLS = 18;
const LEVEL1_ROWS = 4;
// Icon pool is sized for the largest grid; smaller ones just use the first
// few slots and hide the rest.
const MAX_COLS = LEVEL1_COLS;
const MAX_ROWS = LEVEL1_ROWS;
const ICON_SPACING_X = 17;
const ICON_SPACING_Y = 19;

interface MenuFrame {
  items: TopCategory[];
  label: string;
  cursor: number;
  scrollCursor: number;
}

export class CompletionistDexUiHandler extends MessageUiHandler {
  private mainContainer: Phaser.GameObjects.Container;
  private iconsContainer: Phaser.GameObjects.Container;

  private headerBg: Phaser.GameObjects.NineSlice;
  private headerText: Phaser.GameObjects.Text;

  private iconsBg: Phaser.GameObjects.NineSlice;
  private icons: Phaser.GameObjects.Sprite[];

  private titleBg: Phaser.GameObjects.NineSlice;
  private titleText: Phaser.GameObjects.Text;

  private scrollBar: ScrollBar;
  private browseScrollBar: ScrollBar;
  private scrollCursor: number;
  private cursorObj: Phaser.GameObjects.NineSlice | null;

  private rootCategories: TopCategory[] = [];
  private currentTotal: number;

  private menuStack: MenuFrame[] = [];
  private inDrilldown = false;
  private currentLeaf: LeafCategory | null = null;
  /** Within a drilldown: false = showing "have", true = showing "missing". */
  private showingMissing = false;

  // Trainer detail view - a static info card, not part of the icon-grid
  // navigation. Opened via ACTION on a voucher item in a drilldown.
  private trainerDetailContainer: Phaser.GameObjects.Container;
  private trainerSprite: Phaser.GameObjects.Sprite;
  private trainerRowIcons: Phaser.GameObjects.Sprite[] = [];
  private trainerRowTexts: Phaser.GameObjects.Text[] = [];
  private trainerTypeIcon: Phaser.GameObjects.Sprite;
  private trainerTypeLabelText: Phaser.GameObjects.Text;
  private trainerInfoText: Phaser.GameObjects.Text;
  private inTrainerDetail = false;
  private currentTrainerKey: string | null = null;

  constructor(mode: UiMode | null = null) {
    super(mode);
    this.scrollCursor = 0;
  }

  setup(): void {
    const ui = this.getUi();

    const WIDTH = globalScene.scaledCanvas.width;
    const HEIGHT = globalScene.scaledCanvas.height;

    this.mainContainer = globalScene.add.container(1, -HEIGHT + 1);
    this.mainContainer.setInteractive(new Phaser.Geom.Rectangle(0, 0, WIDTH, HEIGHT), Phaser.Geom.Rectangle.Contains);

    this.headerBg = addWindow(0, 0, WIDTH - 2, 24);
    this.headerText = addTextObject(0, 0, "Completionist Dex", TextStyle.HEADER_LABEL)
      .setOrigin(0)
      .setPositionRelative(this.headerBg, 8, 4);

    this.iconsBg = addWindow(0, this.headerBg.height, WIDTH - 2, HEIGHT - this.headerBg.height - 68).setOrigin(0);

    const yOffset = 6;
    this.scrollBar = new ScrollBar(
      this.iconsBg.width - 9,
      this.iconsBg.y + yOffset,
      4,
      this.iconsBg.height - yOffset * 2,
      LEVEL1_ROWS,
    );
    // Browsing pages only ever show LEVEL0_ROWS on screen at once - a
    // separate instance since ScrollBar's maxRows (used for handle sizing)
    // is fixed at construction and can't be shared correctly with the
    // drilldown grid's LEVEL1_ROWS.
    this.browseScrollBar = new ScrollBar(
      this.iconsBg.width - 9,
      this.iconsBg.y + yOffset,
      4,
      this.iconsBg.height - yOffset * 2,
      LEVEL0_ROWS,
    );

    this.iconsContainer = globalScene.add.container(5, this.headerBg.height + 8);

    this.icons = [];
    for (let a = 0; a < MAX_ROWS * MAX_COLS; a++) {
      const icon = globalScene.add.sprite(0, 0, "items", "unknown").setOrigin(0).setScale(0.5);
      this.icons.push(icon);
      this.iconsContainer.add(icon);
    }

    // Full-width title bar - no score/date boxes, per redesign spec.
    this.titleBg = addWindow(0, this.headerBg.height + this.iconsBg.height, WIDTH - 2, 24);
    this.titleText = addTextObject(0, 0, "", TextStyle.WINDOW).setOrigin();
    this.titleText.setPosition(this.titleBg.x + this.titleBg.width / 2, this.titleBg.y + this.titleBg.height / 2);

    const descriptionBg = addWindow(0, this.titleBg.y + this.titleBg.height, WIDTH - 2, 42);
    const descriptionText = addTextObject(0, 0, "", TextStyle.WINDOW, { maxLines: 2 })
      .setWordWrapWidth(1870)
      .setOrigin(0)
      .setPositionRelative(descriptionBg, 8, 4);
    this.message = descriptionText;

    this.mainContainer.add([
      this.headerBg,
      this.headerText,
      this.iconsBg,
      this.scrollBar,
      this.browseScrollBar,
      this.iconsContainer,
      this.titleBg,
      this.titleText,
      descriptionBg,
      descriptionText,
    ]);

    ui.add(this.mainContainer);
    this.mainContainer.setVisible(false);

    // ── Trainer detail view (static info card, opened via ACTION on a
    // voucher item) ─────────────────────────────────────────────────────
    this.trainerDetailContainer = globalScene.add.container(1, -HEIGHT + 1).setVisible(false);
    const detailTop = this.headerBg.height;
    const detailBg = addWindow(0, detailTop, WIDTH - 2, HEIGHT - detailTop - 1).setOrigin(0);
    this.trainerDetailContainer.add(detailBg);

    // Sprite, top-left. Scale is a starting guess - trainer battle sprites
    // are much bigger than UI icons, this has not been visually verified.
    this.trainerSprite = globalScene.add.sprite(40, detailTop + 46, "items", "unknown").setScale(0.4).setOrigin(0.5, 1);

    // 6 team-slot rows, right of the sprite. Real signature slots get a
    // species icon (or the first pool member's icon, for a pool slot);
    // anything beyond this trainer's actual signature-slot count gets the
    // trainer's specialty-type icon instead, per "show the type icon in
    // the filler spots".
    const ROW_COUNT = 6;
    const ROW_Y_START = detailTop + 6;
    const ROW_H = 14;
    const ROW_ICON_X = 82;
    const ROW_TEXT_X = 96;
    for (let i = 0; i < ROW_COUNT; i++) {
      const y = ROW_Y_START + i * ROW_H;
      const icon = globalScene.add.sprite(ROW_ICON_X, y, "items", "unknown").setOrigin(0).setScale(0.5);
      const text = addTextObject(ROW_TEXT_X, y, "", TextStyle.WINDOW, { fontSize: "72px" }).setOrigin(0);
      this.trainerRowIcons.push(icon);
      this.trainerRowTexts.push(text);
      this.trainerDetailContainer.add([icon, text]);
    }

    // Info box under the sprite/rows - specialty/tera type + spawn info.
    const infoY = ROW_Y_START + ROW_COUNT * ROW_H + 6;
    this.trainerTypeIcon = globalScene.add.sprite(8, infoY, getLocalizedSpriteKey("types"), "unknown").setOrigin(0);
    this.trainerTypeLabelText = addTextObject(30, infoY, "", TextStyle.WINDOW, { fontSize: "72px" }).setOrigin(0);
    this.trainerInfoText = addTextObject(8, infoY + 16, "", TextStyle.WINDOW, { fontSize: "72px", maxLines: 2 })
      .setWordWrapWidth(1870)
      .setOrigin(0);

    this.trainerDetailContainer.add([
      this.trainerSprite,
      this.trainerTypeIcon,
      this.trainerTypeLabelText,
      this.trainerInfoText,
    ]);
    ui.add(this.trainerDetailContainer);
  }

  override show(args: any[]): boolean {
    super.show(args);

    this.rootCategories = this.computeCategories();
    this.menuStack = [{ items: this.rootCategories, label: "Completionist Dex", cursor: 0, scrollCursor: 0 }];
    this.inDrilldown = false;
    this.currentLeaf = null;
    this.showingMissing = false;
    this.inTrainerDetail = false;
    this.currentTrainerKey = null;
    this.trainerDetailContainer.setVisible(false);

    this.loadCurrentFrame();

    this.mainContainer.setVisible(true);
    this.getUi().moveTo(this.mainContainer, this.getUi().length - 1);
    this.getUi().hideTooltip();

    return true;
  }

  /** Pulls every category/sub-category's have/missing lists straight from `globalScene.gameData`. See file-header doc for exact definitions. */
  private computeCategories(): TopCategory[] {
    const gameData = globalScene.gameData;
    const dexData = gameData.dexData;
    const speciesIds = Object.keys(dexData).map(Number);
    const starterIds = speciesDataRegistry.getAllStarters();

    const caughtHave: number[] = [];
    const caughtMissing: number[] = [];
    const foughtHave: number[] = [];
    const foughtMissing: number[] = [];
    const seenHave: number[] = [];
    const seenMissing: number[] = [];
    const formsHave: number[] = [];
    const formsMissing: number[] = [];

    // Keyed by RibbonFlag (bigint) rather than a Map, since bigint keys
    // work fine as Map keys but not as plain object keys - a Map avoids
    // that footgun entirely.
    const ribbonHave = new Map<RibbonFlag, number[]>();
    const ribbonMissing = new Map<RibbonFlag, number[]>();
    for (const flag of orderedRibbons) {
      ribbonHave.set(flag, []);
      ribbonMissing.set(flag, []);
    }

    for (const id of speciesIds) {
      const entry = dexData[id];
      (entry.caughtAttr !== 0n ? caughtHave : caughtMissing).push(id);
      (entry.seenCount > 0 ? foughtHave : foughtMissing).push(id);
      (entry.seenAttr !== 0n || entry.caughtAttr !== 0n ? seenHave : seenMissing).push(id);

      const species = speciesDataRegistry.getSpecies(id);
      const forms = species.forms ?? [];
      if (forms.length > 1) {
        let allFormsCaught = true;
        for (let f = 0; f < forms.length; f++) {
          const bit = 1n << BigInt(7 + f);
          if (!(entry.caughtAttr & bit)) {
            allFormsCaught = false;
            break;
          }
        }
        (allFormsCaught ? formsHave : formsMissing).push(id);
      }

      // Ribbons - scoped by real eligibility (getAvailableRibbons), not
      // "every species not marked". A species this ribbon isn't available
      // to at all is excluded from both lists entirely.
      for (const flag of getAvailableRibbons(species)) {
        const list = entry.ribbons.has(flag) ? ribbonHave : ribbonMissing;
        list.get(flag)?.push(id);
      }
    }

    const startersHave: number[] = [];
    const startersMissing: number[] = [];
    const shinyAnyHave: number[] = [];
    const shinyAnyMissing: number[] = [];
    const shinyTier1Have: number[] = [];
    const shinyTier1Missing: number[] = [];
    const shinyTier2Have: number[] = [];
    const shinyTier2Missing: number[] = [];
    const shinyTier3Have: number[] = [];
    const shinyTier3Missing: number[] = [];
    const passiveHave: number[] = [];
    const passiveMissing: number[] = [];
    const reducedAnyHave: number[] = [];
    const reducedAnyMissing: number[] = [];
    const reducedOneHave: number[] = [];
    const reducedOneMissing: number[] = [];
    const reducedTwoHave: number[] = [];
    const reducedTwoMissing: number[] = [];

    for (const id of starterIds) {
      const entry = dexData[id];
      (entry.caughtAttr !== 0n ? startersHave : startersMissing).push(id);
      (entry.caughtAttr & DexAttr.SHINY ? shinyAnyHave : shinyAnyMissing).push(id);
      // DEFAULT_VARIANT/VARIANT_2/VARIANT_3 alone are NOT shiny-tier flags -
      // Pokemon.getDexAttr() sets exactly one of them on every catch,
      // shiny or not (`this.variant` defaults to 0 for non-shiny catches
      // too), so DEFAULT_VARIANT in particular matches ANY caught starter.
      // Shininess is tracked entirely separately via the SHINY bit. Each
      // tier needs both bits explicitly.
      const isShiny = !!(entry.caughtAttr & DexAttr.SHINY);
      (isShiny && entry.caughtAttr & DexAttr.DEFAULT_VARIANT ? shinyTier1Have : shinyTier1Missing).push(id);
      (isShiny && entry.caughtAttr & DexAttr.VARIANT_2 ? shinyTier2Have : shinyTier2Missing).push(id);
      (isShiny && entry.caughtAttr & DexAttr.VARIANT_3 ? shinyTier3Have : shinyTier3Missing).push(id);

      const sd = gameData.starterData[id];
      const passiveUnlocked = !!sd && !!(sd.passiveAttr & PassiveAttr.UNLOCKED);
      (passiveUnlocked ? passiveHave : passiveMissing).push(id);

      const valueReduction = sd?.valueReduction ?? 0;
      (valueReduction >= 1 ? reducedAnyHave : reducedAnyMissing).push(id);
      (valueReduction === 1 ? reducedOneHave : reducedOneMissing).push(id);
      (valueReduction === 2 ? reducedTwoHave : reducedTwoMissing).push(id);
    }

    // Vouchers - split the shared registry by TrainerType band. See
    // file-header doc for the exact bands and the CLASSIC_VICTORY/grunt/ME-
    // trainer edge cases.
    const gymLeaderHave: string[] = [];
    const gymLeaderMissing: string[] = [];
    const eliteFourHave: string[] = [];
    const eliteFourMissing: string[] = [];
    const evilTeamHave: string[] = [];
    const evilTeamMissing: string[] = [];
    const championHave: string[] = [];
    const championMissing: string[] = [];

    for (const key of Object.keys(vouchers)) {
      const trainerType = TrainerType[key as keyof typeof TrainerType];
      if (trainerType === undefined) {
        continue;
      }
      const unlocked = Object.hasOwn(gameData.voucherUnlocks, key);

      if (trainerType >= TrainerType.BROCK && trainerType < TrainerType.LORELEI) {
        (unlocked ? gymLeaderHave : gymLeaderMissing).push(key);
      } else if (trainerType >= TrainerType.LORELEI && trainerType < TrainerType.BLUE) {
        (unlocked ? eliteFourHave : eliteFourMissing).push(key);
      } else if (trainerType >= TrainerType.BLUE && trainerType < TrainerType.RIVAL) {
        (unlocked ? championHave : championMissing).push(key);
      } else if (trainerType >= TrainerType.ROCKET_BOSS_GIOVANNI_1 && trainerType < TrainerType.BROCK) {
        (unlocked ? evilTeamHave : evilTeamMissing).push(key);
      }
      // Anything outside these four bands (shouldn't happen given
      // `vouchers` is already boss-trainer-only) is silently skipped
      // rather than risking a miscategorized entry.
    }

    const shinyGroup: GroupCategory = {
      label: "Shiny Starters",
      iconTexture: "items",
      iconFrame: "golden_egg",
      subCategories: [
        {
          label: "Any Tier",
          kind: "species",
          iconTexture: "items",
          iconFrame: "golden_egg",
          variantMode: "highest",
          haveIds: shinyAnyHave,
          missingIds: shinyAnyMissing,
        },
        {
          label: "Tier 1",
          kind: "species",
          iconTexture: "shiny_icons",
          iconFrame: getVariantIcon(0),
          iconTint: getVariantTint(0),
          variantMode: 0,
          haveIds: shinyTier1Have,
          missingIds: shinyTier1Missing,
        },
        {
          label: "Tier 2",
          kind: "species",
          iconTexture: "shiny_icons",
          iconFrame: getVariantIcon(1),
          iconTint: getVariantTint(1),
          variantMode: 1,
          haveIds: shinyTier2Have,
          missingIds: shinyTier2Missing,
        },
        {
          label: "Tier 3",
          kind: "species",
          iconTexture: "shiny_icons",
          iconFrame: getVariantIcon(2),
          iconTint: getVariantTint(2),
          variantMode: 2,
          haveIds: shinyTier3Have,
          missingIds: shinyTier3Missing,
        },
      ],
    };

    const pokemonGroup: GroupCategory = {
      label: "Pokemon",
      iconTexture: "items",
      iconFrame: "pb",
      subCategories: [
        {
          label: "Starters Unlocked",
          kind: "species",
          iconTexture: "items",
          iconFrame: "pb",
          haveIds: startersHave,
          missingIds: startersMissing,
        },
        shinyGroup,
        {
          label: "Species Fought",
          kind: "species",
          iconTexture: "items",
          iconFrame: "expert_belt",
          haveIds: foughtHave,
          missingIds: foughtMissing,
        },
        {
          label: "Species Seen",
          kind: "species",
          iconTexture: "items",
          iconFrame: "scope_lens",
          haveIds: seenHave,
          missingIds: seenMissing,
        },
        {
          label: "Species Caught",
          kind: "species",
          iconTexture: "items",
          iconFrame: "pb",
          haveIds: caughtHave,
          missingIds: caughtMissing,
        },
        {
          label: "Pokemon Forms",
          kind: "species",
          iconTexture: "items",
          iconFrame: "shell_bell",
          haveIds: formsHave,
          missingIds: formsMissing,
        },
      ],
    };

    const vouchersGroup: GroupCategory = {
      label: "Vouchers",
      iconTexture: "items",
      iconFrame: "coupon",
      subCategories: [
        {
          label: "Gym Leaders",
          kind: "voucher",
          iconTexture: "items",
          iconFrame: "coupon",
          haveIds: gymLeaderHave,
          missingIds: gymLeaderMissing,
        },
        {
          label: "Elite Four",
          kind: "voucher",
          iconTexture: "items",
          iconFrame: "pair_of_tickets",
          haveIds: eliteFourHave,
          missingIds: eliteFourMissing,
        },
        {
          label: "Evil Team",
          kind: "voucher",
          iconTexture: "items",
          iconFrame: "mystic_ticket",
          haveIds: evilTeamHave,
          missingIds: evilTeamMissing,
        },
        {
          label: "Champion",
          kind: "voucher",
          iconTexture: "items",
          iconFrame: "golden_mystic_ticket",
          haveIds: championHave,
          missingIds: championMissing,
        },
      ],
    };

    const candyGroup: GroupCategory = {
      label: "Candy",
      iconTexture: "items",
      iconFrame: "candy",
      subCategories: [
        {
          label: "Passives",
          kind: "species",
          iconTexture: "items",
          iconFrame: "candy",
          haveIds: passiveHave,
          missingIds: passiveMissing,
        },
        {
          label: "Any Reduction Amount",
          kind: "species",
          iconTexture: "items",
          iconFrame: "relic_gold",
          haveIds: reducedAnyHave,
          missingIds: reducedAnyMissing,
        },
        {
          label: "One Reduction",
          kind: "species",
          iconTexture: "items",
          iconFrame: "nugget",
          haveIds: reducedOneHave,
          missingIds: reducedOneMissing,
        },
        {
          label: "Two Reductions",
          kind: "species",
          iconTexture: "items",
          iconFrame: "big_nugget",
          haveIds: reducedTwoHave,
          missingIds: reducedTwoMissing,
        },
      ],
    };

    const ribbonsGroup: GroupCategory = {
      label: "Ribbons",
      iconTexture: "items",
      iconFrame: "classic_ribbon_default",
      subCategories: orderedRibbons.map(
        (flag): LeafCategory => ({
          label: ribbonDisplayName(getRibbonKey(flag)),
          kind: "species",
          iconTexture: "items",
          iconFrame: ribbonFrame(flag),
          haveIds: ribbonHave.get(flag) ?? [],
          missingIds: ribbonMissing.get(flag) ?? [],
        }),
      ),
    };

    return [pokemonGroup, vouchersGroup, candyGroup, ribbonsGroup];
  }

  // #region Navigation (menu stack + drilldown)

  private get currentFrame(): MenuFrame {
    return this.menuStack[this.menuStack.length - 1];
  }

  /** Saves the live cursor/scroll position into whichever frame is currently displayed, before navigating away from it. */
  private saveCurrentFrameCursor(): void {
    this.currentFrame.cursor = this.cursor;
    this.currentFrame.scrollCursor = this.scrollCursor;
  }

  private enterGroup(group: GroupCategory): void {
    this.saveCurrentFrameCursor();
    this.menuStack.push({ items: group.subCategories, label: group.label, cursor: 0, scrollCursor: 0 });
    this.loadCurrentFrame();
  }

  private enterDrilldown(leaf: LeafCategory): void {
    this.saveCurrentFrameCursor();
    this.inDrilldown = true;
    this.currentLeaf = leaf;
    this.showingMissing = false;
    this.browseScrollBar.setVisible(false);
    this.layoutGrid(LEVEL1_COLS);
    this.currentTotal = 0;
    this.scrollCursor = 0;
    this.updateHeaderText();
    this.refreshDrilldownState();
  }

  /** CANCEL - one step back up. Returns to the exit screen if already at the root with nothing to pop. */
  private goBack(): void {
    if (this.inDrilldown) {
      this.inDrilldown = false;
      this.currentLeaf = null;
      this.loadCurrentFrame();
      return;
    }
    if (this.menuStack.length > 1) {
      this.menuStack.pop();
      this.loadCurrentFrame();
      return;
    }
    globalScene.ui.revertMode();
  }

  /** Displays whatever's on top of the menu stack, restoring its saved cursor/scroll position. */
  private loadCurrentFrame(): void {
    const frame = this.currentFrame;
    this.scrollBar.setVisible(false);
    this.layoutGrid(LEVEL0_COLS);
    this.currentTotal = frame.items.length;
    this.scrollCursor = frame.scrollCursor;
    this.browseScrollBar.setTotalRows(Math.ceil(this.currentTotal / LEVEL0_COLS));
    this.browseScrollBar.setScrollCursor(this.scrollCursor);
    this.refreshTileIcons(frame.items);
    this.updateHeaderText();
    this.setCursor(frame.cursor, true);
  }

  private refreshDrilldownState(): void {
    const leaf = this.currentLeaf;
    if (!leaf) {
      return;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    this.currentTotal = list.length;
    this.scrollCursor = 0;
    this.scrollBar.setTotalRows(Math.ceil(this.currentTotal / LEVEL1_COLS));
    this.scrollBar.setScrollCursor(0);
    this.refreshDrilldownIcons();
    this.setCursor(0, true);
  }

  /** Toggles have/missing. Blocked (with an error sound + message) if the target side is empty. */
  private toggleMissing(): boolean {
    const leaf = this.currentLeaf;
    if (!leaf) {
      return false;
    }
    const targetMissing = !this.showingMissing;
    const targetList = targetMissing ? leaf.missingIds : leaf.haveIds;
    if (targetList.length === 0) {
      this.getUi().playError();
      this.showText("Nothing to show");
      return false;
    }
    this.showingMissing = targetMissing;
    this.refreshDrilldownState();
    return true;
  }

  private updateHeaderText(): void {
    const parts = this.menuStack.map(f => f.label);
    if (this.inDrilldown && this.currentLeaf) {
      parts.push(this.currentLeaf.label);
    }
    // Show only the last 3 parts - the root "Completionist Dex" label (and
    // anything else beyond 3 levels up) drops off once nesting goes deep
    // enough, so the breadcrumb doesn't keep growing unbounded.
    this.headerText.setText(parts.slice(-3).join(" > "));
  }

  // #endregion Navigation

  /** Repositions the shared icon pool for the given column count and hides any slots beyond `rows * cols`. */
  private layoutGrid(cols: number): void {
    const rows = cols === LEVEL1_COLS ? LEVEL1_ROWS : LEVEL0_ROWS;
    for (let a = 0; a < this.icons.length; a++) {
      if (a >= rows * cols) {
        this.icons[a].setVisible(false);
        continue;
      }
      this.icons[a].setPosition((a % cols) * ICON_SPACING_X, Math.floor(a / cols) * ICON_SPACING_Y);
    }
  }

  private currentCols(): number {
    return this.inDrilldown ? LEVEL1_COLS : LEVEL0_COLS;
  }

  private currentRows(): number {
    return this.inDrilldown ? LEVEL1_ROWS : LEVEL0_ROWS;
  }

  /** Windowed by scrollCursor, same idea as refreshDrilldownIcons - fixes phantom/misplaced icons for groups with more than one page of tiles (e.g. Ribbons' 39 leaves). */
  private refreshTileIcons(tiles: TopCategory[]): void {
    const itemOffset = this.scrollCursor * LEVEL0_COLS;
    const itemLimit = LEVEL0_ROWS * LEVEL0_COLS;
    const itemRange = tiles.slice(itemOffset, itemOffset + itemLimit);

    itemRange.forEach((tile, i) => {
      const icon = this.icons[i];
      icon.setTexture(tile.iconTexture, tile.iconFrame);
      icon.clearTint();
      if (tile.iconTint !== undefined) {
        icon.setTint(tile.iconTint);
      }
      icon.setVisible(true);
    });
    // Hide the *entire* remaining pool, not just up to LEVEL0_ROWS*LEVEL0_COLS -
    // the pool is shared with the drilldown grid (up to LEVEL1_ROWS*LEVEL1_COLS
    // slots), and leftover icons from a previous drilldown visit would
    // otherwise keep their stale positions and reappear here.
    for (let i = itemRange.length; i < this.icons.length; i++) {
      this.icons[i].setVisible(false);
    }
  }

  /** Returns the highest shiny variant tier (0/1/2) actually caught for a species, for "Any Tier" rendering. */
  private highestCaughtVariant(speciesId: number): number {
    const caughtAttr = globalScene.gameData.dexData[speciesId].caughtAttr;
    if (caughtAttr & DexAttr.VARIANT_3) {
      return 2;
    }
    if (caughtAttr & DexAttr.VARIANT_2) {
      return 1;
    }
    return 0;
  }

  private refreshDrilldownIcons(): void {
    const leaf = this.currentLeaf;
    if (!leaf) {
      return;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    const itemOffset = this.scrollCursor * LEVEL1_COLS;
    const itemLimit = LEVEL1_ROWS * LEVEL1_COLS;
    const itemRange = list.slice(itemOffset, itemOffset + itemLimit);

    itemRange.forEach((item, i) => {
      const icon = this.icons[i];
      icon.clearTint();
      if (leaf.kind === "species") {
        const speciesId = item as number;
        const species = speciesDataRegistry.getSpecies(speciesId);
        let shiny = false;
        let variant = 0;
        if (!this.showingMissing && leaf.variantMode !== undefined) {
          shiny = true;
          variant = leaf.variantMode === "highest" ? this.highestCaughtVariant(speciesId) : leaf.variantMode;
        }
        icon.setTexture(species.getIconAtlasKey(0, shiny, variant), species.getIconId(false, 0, shiny, variant));
      } else {
        icon.setTexture("items", getVoucherTypeIcon(vouchers[item as string].voucherType));
      }
      icon.setVisible(true);
    });

    for (let i = itemRange.length; i < LEVEL1_ROWS * LEVEL1_COLS; i++) {
      this.icons[i].setVisible(false);
    }
  }

  /** Updates the title bar + description panel for whatever's currently under the cursor. */
  private updateDetailPanel(): void {
    if (!this.inDrilldown) {
      const tile = this.currentFrame.items[this.cursor + this.scrollCursor * LEVEL0_COLS];
      if (!tile) {
        return;
      }
      this.titleText.setText(tile.label);
      const { have, total } = sumTotals(tile);
      this.showText(`${have}/${total} (${pct(have, total)}%)`);
      return;
    }

    const leaf = this.currentLeaf;
    if (!leaf) {
      return;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    const item = list[this.cursor + this.scrollCursor * LEVEL1_COLS];
    const modeLabel = this.showingMissing ? "Missing" : "Unlocked";

    if (item === undefined) {
      this.titleText.setText(`${leaf.label} - ${modeLabel}`);
      this.showText("");
      return;
    }

    if (leaf.kind === "species") {
      const name = speciesDataRegistry.getSpecies(item as number).getName();
      this.titleText.setText(`${name} - ${leaf.label} (${modeLabel})`);
      this.showText("Press ACTION to view its Pokedex entry.");
    } else {
      const voucher = vouchers[item as string];
      this.titleText.setText(`${leaf.label} (${modeLabel})`);
      this.showText(voucher.description);
    }
  }

  /** ACTION on a species icon while drilled down opens that species' real Pokedex entry, matching whatever shiny/variant state was rendered. No-op for voucher items. */
  private openPokedexEntryForCursor(): boolean {
    const leaf = this.currentLeaf;
    if (!leaf || leaf.kind !== "species") {
      return false;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    const item = list[this.cursor + this.scrollCursor * LEVEL1_COLS];
    if (item === undefined) {
      return false;
    }

    const speciesId = item as number;
    const species = speciesDataRegistry.getSpecies(speciesId);

    let shiny = false;
    let variant = 0;
    if (!this.showingMissing && leaf.variantMode !== undefined) {
      shiny = true;
      variant = leaf.variantMode === "highest" ? this.highestCaughtVariant(speciesId) : leaf.variantMode;
    }

    globalScene.ui.setOverlayMode(UiMode.POKEDEX_PAGE, species, { shiny, female: true, variant, form: 0 });
    return true;
  }

  /** ACTION on a voucher item in a drilldown opens the trainer detail card. No-op for species items (those use the Pokedex, not this). */
  private openTrainerDetailForCursor(): boolean {
    const leaf = this.currentLeaf;
    if (!leaf || leaf.kind !== "voucher") {
      return false;
    }
    const list = this.showingMissing ? leaf.missingIds : leaf.haveIds;
    const item = list[this.cursor + this.scrollCursor * LEVEL1_COLS];
    if (item === undefined) {
      return false;
    }
    this.showTrainerDetail(item as string);
    return true;
  }

  private showTrainerDetail(trainerKey: string): void {
    const trainerConfig = trainerConfigs[TrainerType[trainerKey as keyof typeof TrainerType]];
    if (!trainerConfig) {
      return;
    }

    this.currentTrainerKey = trainerKey;
    this.inTrainerDetail = true;

    // Trainer field sprites aren't preloaded at boot - they're loaded on
    // demand, same as upstream's run-info-ui-handler does for its own
    // trainer sprite. Without this, the texture key doesn't exist yet and
    // Phaser renders its default "missing texture" placeholder instead.
    trainerConfig.loadAssets(TrainerVariant.DEFAULT).then(() => {
      // Guard against a fast re-open: if the player backed out and opened
      // a different trainer before this resolved, don't stomp their sprite.
      if (this.currentTrainerKey === trainerKey) {
        this.trainerSprite.setTexture(trainerConfig.getSpriteKey(false, false));
      }
    });

    const pool = signatureSpecies[trainerKey] ?? [];
    const specialtyType: PokemonType | undefined = trainerConfig.specialtyType;

    for (let i = 0; i < this.trainerRowIcons.length; i++) {
      const icon = this.trainerRowIcons[i];
      const text = this.trainerRowTexts[i];
      icon.clearTint();

      if (i < pool.length) {
        const slot = pool[i];
        const slotSpeciesIds = Array.isArray(slot) ? slot : [slot];
        const primarySpecies = speciesDataRegistry.getSpecies(slotSpeciesIds[0]);
        icon.setTexture(primarySpecies.getIconAtlasKey(0, false, 0), primarySpecies.getIconId(false, 0, false, 0));
        text.setText(slotSpeciesIds.map(id => speciesDataRegistry.getSpecies(id).getName()).join(" / "));
      } else if (specialtyType !== undefined) {
        icon.setTexture(getLocalizedSpriteKey("types"), PokemonType[specialtyType].toLowerCase());
        text.setText(`Any ${PokemonType[specialtyType]} type`);
      } else {
        icon.setVisible(false);
        text.setText("");
      }
    }

    if (specialtyType !== undefined) {
      this.trainerTypeIcon.setTexture(getLocalizedSpriteKey("types"), PokemonType[specialtyType].toLowerCase());
      this.trainerTypeLabelText.setText(`${PokemonType[specialtyType]} specialist`);
    } else {
      this.trainerTypeIcon.setVisible(false);
      this.trainerTypeLabelText.setText("No specialty type");
    }

    const trainerType = TrainerType[trainerKey as keyof typeof TrainerType];
    this.trainerInfoText.setText(getTrainerSpawnInfo(trainerType));

    this.mainContainer.setVisible(false);
    this.trainerDetailContainer.setVisible(true);
    this.getUi().moveTo(this.trainerDetailContainer, this.getUi().length - 1);
  }

  private exitTrainerDetail(): void {
    this.inTrainerDetail = false;
    this.currentTrainerKey = null;
    this.trainerDetailContainer.setVisible(false);
    this.mainContainer.setVisible(true);
    this.getUi().moveTo(this.mainContainer, this.getUi().length - 1);
  }

  // #region Input Processing

  processInput(button: Button): boolean {
    let success = false;

    switch (button) {
      case Button.ACTION:
        if (this.inTrainerDetail) {
          // Static info card - nothing to act on.
          break;
        }
        if (!this.inDrilldown) {
          const tile = this.currentFrame.items[this.cursor + this.scrollCursor * LEVEL0_COLS];
          if (tile) {
            if (isGroup(tile)) {
              this.enterGroup(tile);
            } else {
              this.enterDrilldown(tile);
            }
            success = true;
          }
        } else if (this.currentLeaf?.kind === "voucher") {
          success = this.openTrainerDetailForCursor();
        } else {
          success = this.openPokedexEntryForCursor();
        }
        break;
      case Button.CANCEL:
        if (this.inTrainerDetail) {
          this.exitTrainerDetail();
        } else {
          this.goBack();
        }
        success = true;
        break;
      case Button.STATS:
        if (this.inDrilldown && !this.inTrainerDetail) {
          success = this.toggleMissing();
        }
        break;
      case Button.UP:
        success = !this.inTrainerDetail && this.processUpInput();
        break;
      case Button.DOWN:
        success = !this.inTrainerDetail && this.processDownInput();
        break;
      case Button.LEFT:
        success = !this.inTrainerDetail && this.processLeftInput();
        break;
      case Button.RIGHT:
        success = !this.inTrainerDetail && this.processRightInput();
        break;
      default:
        break;
    }

    if (success) {
      this.getUi().playSelect();
    }

    return success;
  }

  private processUpInput(): boolean {
    const cols = this.currentCols();
    if (this.cursor - cols >= 0) {
      return this.setCursor(this.cursor - cols);
    }
    if (this.scrollCursor > 0) {
      return this.setScrollCursor(this.scrollCursor - 1);
    }
    // Already at the very top row - loop to the bottom.
    return this.wrapToEdge(false);
  }

  private processDownInput(): boolean {
    const cols = this.currentCols();
    const rows = this.currentRows();
    const itemOffset = this.scrollCursor * cols;
    if (this.cursor + cols < rows * cols && this.cursor + cols + itemOffset < this.currentTotal) {
      return this.setCursor(this.cursor + cols);
    }
    const maxScrollCursor = Math.max(0, Math.ceil(this.currentTotal / cols) - rows);
    if (this.scrollCursor < maxScrollCursor) {
      return this.setScrollCursor(this.scrollCursor + 1);
    }
    // Already at the very bottom row - loop to the top.
    return this.wrapToEdge(true);
  }

  /** Loops UP↔DOWN navigation across the top/bottom edge of the current grid, preserving column where possible. */
  private wrapToEdge(toTop: boolean): boolean {
    const cols = this.currentCols();
    const rows = this.currentRows();
    const col = this.cursor % cols;

    if (toTop) {
      this.setScrollCursor(0);
      return this.setCursor(Math.min(col, this.currentTotal - 1));
    }

    const totalRows = Math.max(1, Math.ceil(this.currentTotal / cols));
    const lastRow = totalRows - 1;
    const lastRowItemCount = this.currentTotal - lastRow * cols;
    const targetCol = Math.min(col, lastRowItemCount - 1);
    const newScrollCursor = Math.max(0, lastRow - (rows - 1));
    this.setScrollCursor(newScrollCursor);
    return this.setCursor((lastRow - newScrollCursor) * cols + targetCol);
  }

  private processLeftInput(): boolean {
    const cols = this.currentCols();
    const itemOffset = this.scrollCursor * cols;
    if (this.cursor % cols === 0) {
      return this.setCursor(Math.min(this.cursor + cols - 1, this.currentTotal - itemOffset - 1));
    }
    return this.setCursor(this.cursor - 1);
  }

  private processRightInput(): boolean {
    const cols = this.currentCols();
    const itemOffset = this.scrollCursor * cols;
    if ((this.cursor + 1) % cols === 0 || this.cursor + itemOffset === this.currentTotal - 1) {
      return this.setCursor(this.cursor - (this.cursor % cols));
    }
    return this.setCursor(this.cursor + 1);
  }

  // #endregion Input Processing

  override setCursor(cursor: number, forceRefresh?: boolean): boolean {
    const ret = super.setCursor(cursor);

    let update = ret;
    if (!this.cursorObj) {
      this.cursorObj = globalScene.add
        .nineslice(0, 0, "select_cursor_highlight", undefined, 16, 16, 1, 1, 1, 1)
        .setOrigin(0);
      this.iconsContainer.add(this.cursorObj);
      update = true;
    }

    this.cursorObj.setPositionRelative(this.icons[this.cursor], 0, 0);
    if (!update && !forceRefresh) {
      return ret;
    }

    this.updateDetailPanel();
    return ret;
  }

  setScrollCursor(scrollCursor: number): boolean {
    if (scrollCursor === this.scrollCursor) {
      return false;
    }

    this.scrollCursor = scrollCursor;
    const activeScrollBar = this.inDrilldown ? this.scrollBar : this.browseScrollBar;
    activeScrollBar.setTotalRows(Math.ceil(this.currentTotal / this.currentCols()));
    activeScrollBar.setScrollCursor(this.scrollCursor);

    const cols = this.currentCols();
    const maxCursor = Math.min(this.cursor, this.currentTotal - this.scrollCursor * cols - 1);
    if (maxCursor !== this.cursor) {
      this.setCursor(Math.max(0, maxCursor));
    }

    if (this.inDrilldown) {
      this.refreshDrilldownIcons();
    } else {
      this.refreshTileIcons(this.currentFrame.items);
    }
    this.updateDetailPanel();
    return true;
  }

  override clear(): void {
    super.clear();
    this.menuStack = [];
    this.inDrilldown = false;
    this.currentLeaf = null;
    this.inTrainerDetail = false;
    this.currentTrainerKey = null;
    this.mainContainer.setVisible(false);
    this.trainerDetailContainer.setVisible(false);
    this.eraseCursor();
  }

  private eraseCursor(): void {
    if (this.cursorObj) {
      this.cursorObj.destroy();
    }
    this.cursorObj = null;
  }
}
