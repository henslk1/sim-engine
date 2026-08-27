const LABELS: Record<string, string> = {
  // Base color
  chestnut_base: "Chestnut/Red Base",
  black_base: "Black Base",
  bay_modifier: "Bay",
  // Cream
  one_cream: "Single Cream",
  two_cream: "Double Cream",
  // Pearl
  one_pearl: "Pearl (Carrier)",
  two_pearl: "Pearl",
  // Dun
  dun: "Dun",
  primitive_markings: "Primitive Markings",
  // Modifiers
  gray_modifier: "Gray",
  roan_modifier: "Roan",
  // Silver
  one_silver: "Silver (Het)",
  two_silver: "Silver (Hom)",
  // Mushroom
  one_mushroom: "Mushroom (Het)",
  two_mushroom: "Mushroom",
  // Leopard complex
  one_leopard: "Leopard Complex (LP/N)",
  two_leopard: "Leopard Complex (LP/LP)",
  one_patn1: "Pattern-1 (Het)",
  two_patn1: "Pattern-1 (Hom)",
  // Pinto patterns
  tobiano_pattern: "Tobiano",
  frame_overo: "Frame Overo",
  lethal_overo: "Lethal White (Frame Overo)",
  one_sabino: "Sabino",
  two_sabino: "Sabino White",
  // Dominant white
  dominant_white_spotted: "Dominant White (Spotted)",
  dominant_white_full: "Max White",
  dominant_white_markings: "Dominant White (Markings)",
  dominant_white_irregular: "Dominant White (Irregular)",
  dominant_white_lethal: "Dominant White (Lethal)",
  // Splashed white
  splash_minimal: "Splashed White (Minimal)",
  splash_medium: "Splashed White",
  splash_extensive: "Splashed White (Extensive)",
  splash_lethal: "Splashed White (Lethal)",
}

export function phenotypeLabel(code: string): string {
  return LABELS[code] ?? code
}
