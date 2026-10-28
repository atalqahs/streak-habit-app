/**
 * Built-in food library. Values are per 100 g of the food in the stated state.
 *
 * Generic foods: USDA FoodData Central, SR Legacy (April 2018 release — the final,
 * stable SR dataset), verified against the downloaded dataset. Each variant
 * records its FDC id and the exact USDA description. Raw and cooked values are
 * separate USDA entries — nothing is converted with a guessed yield ratio.
 *
 * Bump LIBRARY_VERSION whenever values change. Saved plans and extra foods keep
 * a snapshot of the values they were created with, so history never shifts.
 */

export const LIBRARY_VERSION = 1;

export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodVariant extends Per100 {
  id: string;
  /** Preparation state shown in the selector, e.g. "Cooked". */
  label: string;
  source: string;
}

export interface Food {
  id: string;
  name: string;
  category: 'Poultry' | 'Beef' | 'Seafood' | 'Carbohydrates' | 'Fats & Supplements';
  /** First variant is the default (how it is normally weighed). */
  variants: FoodVariant[];
}

const usda = (fdcId: number, description: string) =>
  `USDA FoodData Central, SR Legacy, FDC ${fdcId}: ${description}`;

const v = (
  id: string,
  label: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  source: string,
): FoodVariant => ({
  id,
  label,
  kcal,
  protein,
  carbs,
  fat,
  source,
});

export const FOODS: Food[] = [
  // Poultry — normally weighed after cooking.
  {
    id: 'chicken-thigh',
    name: 'Chicken thighs, boneless, skinless',
    category: 'Poultry',
    variants: [
      v(
        'cooked',
        'Cooked',
        179,
        24.76,
        0,
        8.15,
        usda(172388, 'Chicken, broilers or fryers, thigh, meat only, cooked, roasted'),
      ),
      v(
        'raw',
        'Raw',
        121,
        19.66,
        0,
        4.12,
        usda(173627, 'Chicken, broilers or fryers, dark meat, thigh, meat only, raw'),
      ),
    ],
  },
  {
    id: 'chicken-breast',
    name: 'Chicken breast, boneless, skinless',
    category: 'Poultry',
    variants: [
      v(
        'cooked',
        'Cooked',
        165,
        31.02,
        0,
        3.57,
        usda(171477, 'Chicken, broilers or fryers, breast, meat only, cooked, roasted'),
      ),
      v(
        'raw',
        'Raw',
        120,
        22.5,
        0,
        2.62,
        usda(171077, 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw'),
      ),
    ],
  },

  // Beef
  {
    id: 'beef-sirloin-0',
    name: 'Beef top sirloin steak, lean only, 0″ fat trim',
    category: 'Beef',
    variants: [
      v(
        'cooked',
        'Cooked',
        183,
        30.55,
        0,
        5.79,
        usda(
          168634,
          'Beef, top sirloin, steak, separable lean only, trimmed to 0" fat, all grades, cooked, broiled',
        ),
      ),
    ],
  },
  {
    id: 'beef-sirloin-18',
    name: 'Beef top sirloin steak, lean only, ⅛″ fat trim',
    category: 'Beef',
    variants: [
      v(
        'cooked',
        'Cooked',
        178,
        29.42,
        0,
        5.84,
        usda(
          174054,
          'Beef, top sirloin, steak, separable lean only, trimmed to 1/8" fat, all grades, cooked, broiled',
        ),
      ),
      v(
        'raw',
        'Raw',
        131,
        22.09,
        0,
        4.08,
        usda(174055, 'Beef, top sirloin, steak, separable lean only, trimmed to 1/8" fat, all grades, raw'),
      ),
    ],
  },
  {
    id: 'beef-ground-95',
    name: 'Ground beef, 95% lean / 5% fat',
    category: 'Beef',
    variants: [
      v(
        'cooked',
        'Cooked',
        193,
        29.17,
        0,
        7.58,
        usda(174028, 'Beef, ground, 95% lean meat / 5% fat, crumbles, cooked, pan-browned'),
      ),
      v('raw', 'Raw', 137, 21.41, 0, 5, usda(171790, 'Beef, ground, 95% lean meat / 5% fat, raw')),
    ],
  },
  {
    id: 'beef-ground-90',
    name: 'Ground beef, 90% lean / 10% fat',
    category: 'Beef',
    variants: [
      v(
        'cooked',
        'Cooked',
        230,
        28.45,
        0,
        12.04,
        usda(171794, 'Beef, ground, 90% lean meat / 10% fat, crumbles, cooked, pan-browned'),
      ),
      v('raw', 'Raw', 176, 20, 0, 10, usda(174030, 'Beef, ground, 90% lean meat / 10% fat, raw')),
    ],
  },
  {
    id: 'beef-ground-85',
    name: 'Ground beef, 85% lean / 15% fat',
    category: 'Beef',
    variants: [
      v(
        'cooked',
        'Cooked',
        256,
        27.73,
        0,
        15.3,
        usda(174034, 'Beef, ground, 85% lean meat / 15% fat, crumbles, cooked, pan-browned'),
      ),
      v('raw', 'Raw', 215, 18.59, 0, 15, usda(171796, 'Beef, ground, 85% lean meat / 15% fat, raw')),
    ],
  },

  // Seafood — "Cooked" is USDA dry-heat cooking unless stated.
  {
    id: 'shrimp',
    name: 'Shrimp',
    category: 'Seafood',
    variants: [
      v('cooked', 'Cooked', 99, 23.98, 0.2, 0.28, usda(175180, 'Crustaceans, shrimp, cooked')),
      v('raw', 'Raw', 85, 20.1, 0, 0.51, usda(175179, 'Crustaceans, shrimp, raw')),
    ],
  },
  {
    id: 'salmon-atlantic-farmed',
    name: 'Atlantic salmon, farmed',
    category: 'Seafood',
    variants: [
      v(
        'cooked',
        'Cooked',
        206,
        22.1,
        0,
        12.35,
        usda(175168, 'Fish, salmon, Atlantic, farmed, cooked, dry heat'),
      ),
      v('raw', 'Raw', 208, 20.42, 0, 13.42, usda(175167, 'Fish, salmon, Atlantic, farmed, raw')),
    ],
  },
  {
    id: 'tilapia',
    name: 'Tilapia',
    category: 'Seafood',
    variants: [
      v('cooked', 'Cooked', 128, 26.15, 0, 2.65, usda(175177, 'Fish, tilapia, cooked, dry heat')),
      v('raw', 'Raw', 96, 20.08, 0, 1.7, usda(175176, 'Fish, tilapia, raw')),
    ],
  },
  {
    id: 'cod-atlantic',
    name: 'Atlantic cod',
    category: 'Seafood',
    variants: [
      v('cooked', 'Cooked', 105, 22.83, 0, 0.86, usda(171956, 'Fish, cod, Atlantic, cooked, dry heat')),
      v('raw', 'Raw', 82, 17.81, 0, 0.67, usda(171955, 'Fish, cod, Atlantic, raw')),
    ],
  },
  {
    id: 'grouper',
    name: 'Grouper (hammour)',
    category: 'Seafood',
    variants: [
      v(
        'cooked',
        'Cooked',
        118,
        24.84,
        0,
        1.3,
        usda(171963, 'Fish, grouper, mixed species, cooked, dry heat'),
      ),
      v('raw', 'Raw', 92, 19.38, 0, 1.02, usda(171962, 'Fish, grouper, mixed species, raw')),
    ],
  },
  {
    id: 'sea-bass',
    name: 'Sea bass',
    category: 'Seafood',
    variants: [
      v(
        'cooked',
        'Cooked',
        124,
        23.63,
        0,
        2.56,
        usda(173694, 'Fish, sea bass, mixed species, cooked, dry heat'),
      ),
      v('raw', 'Raw', 97, 18.43, 0, 2, usda(175142, 'Fish, sea bass, mixed species, raw')),
    ],
  },
  {
    id: 'tuna-light-water',
    name: 'Light tuna, canned in water, drained',
    category: 'Seafood',
    variants: [
      v(
        'canned',
        'Drained',
        86,
        19.44,
        0,
        0.96,
        usda(173709, 'Fish, tuna, light, canned in water, drained solids'),
      ),
    ],
  },

  // Carbohydrates — rice normally weighed cooked, oats dry.
  {
    id: 'white-rice',
    name: 'White rice, long-grain',
    category: 'Carbohydrates',
    variants: [
      v(
        'cooked',
        'Cooked',
        130,
        2.69,
        28.17,
        0.28,
        usda(168878, 'Rice, white, long-grain, regular, enriched, cooked'),
      ),
      v(
        'dry',
        'Dry',
        365,
        7.13,
        79.95,
        0.66,
        usda(168877, 'Rice, white, long-grain, regular, raw, enriched'),
      ),
    ],
  },
  {
    id: 'potatoes',
    name: 'Potatoes',
    category: 'Carbohydrates',
    variants: [
      v(
        'boiled',
        'Boiled',
        87,
        1.87,
        20.13,
        0.1,
        usda(170438, 'Potatoes, boiled, cooked in skin, flesh, without salt'),
      ),
      v('raw', 'Raw', 77, 2.05, 17.49, 0.09, usda(170026, 'Potatoes, flesh and skin, raw')),
    ],
  },
  {
    id: 'oats',
    name: 'Oats',
    category: 'Carbohydrates',
    variants: [v('dry', 'Dry', 389, 16.89, 66.27, 6.9, usda(169705, 'Oats'))],
  },

  // Fats & supplements — no preparation selector.
  {
    id: 'peanut-butter',
    name: 'Peanut butter, smooth',
    category: 'Fats & Supplements',
    variants: [
      v(
        'as-is',
        'As is',
        598,
        22.21,
        22.31,
        51.36,
        usda(172470, 'Peanut butter, smooth style, without salt'),
      ),
    ],
  },
  {
    id: 'critical-whey-choc-30g',
    name: 'Applied Nutrition Critical Whey, Chocolate Milkshake (30 g serving formulation)',
    category: 'Fats & Supplements',
    variants: [
      v(
        'powder',
        'Powder',
        368,
        70.1,
        7.3,
        4.9,
        'Manufacturer label values for the 30 g-serving formulation, as supplied by the user. ' +
          'Applied Nutrition has since reformulated Critical Whey (24 g protein / 122 kcal per serving); ' +
          'check your tub — other formulations are not mixed into this entry.',
      ),
    ],
  },
];

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export const foodById = (id: string) => BY_ID.get(id);

export function variantOf(foodId: string, variantId: string): FoodVariant | undefined {
  return BY_ID.get(foodId)?.variants.find((x) => x.id === variantId);
}

export const CATEGORIES = ['Poultry', 'Beef', 'Seafood', 'Carbohydrates', 'Fats & Supplements'] as const;

/** Scales per-100 g values to `grams`. Stored calories are authoritative (no 4-4-9 recalculation). */
export function scale(per100: Per100, grams: number): Per100 {
  const f = grams / 100;
  return { kcal: per100.kcal * f, protein: per100.protein * f, carbs: per100.carbs * f, fat: per100.fat * f };
}

export function sum(list: Per100[]): Per100 {
  return list.reduce(
    (a, b) => ({
      kcal: a.kcal + b.kcal,
      protein: a.protein + b.protein,
      carbs: a.carbs + b.carbs,
      fat: a.fat + b.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
