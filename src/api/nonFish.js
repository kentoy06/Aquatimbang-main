// AquaTimbang tracks fish only. Seafood and other items that are not fish
// (squid, shrimp, crabs, shellfish, seaweed...), in English, Filipino and
// Cebuano. Keep in sync with NON_FISH_WORDS in backend/api/species_tools.py.
const NON_FISH_WORDS = new Set([
  "shrimp", "shrimps", "prawn", "prawns", "hipon", "pasayan", "sugpo", "uyabang", "lukon", "alamang",
  "crab", "crabs", "alimango", "alimasag", "kasag", "lambay", "kagang", "kuyom", "curacha", "lobster",
  "lobsters", "banagan", "pitik", "squid", "squids", "pusit", "nukos", "nokus", "cuttlefish", "octopus",
  "kugita", "pugita", "shellfish", "shell", "shells", "mussel", "mussels", "tahong", "oyster", "oysters",
  "talaba", "clam", "clams", "halaan", "tuway", "imbaw", "imbao", "litob", "sisi", "kinhason",
  "scallop", "scallops", "kapis", "abalone", "kuhol", "snail", "snails", "seaweed", "seaweeds", "guso",
  "gamet", "lato", "urchin", "tuyom", "salawaki", "cucumber", "annicad", "anicad", "aninicad", "frog", "palaka", "turtle", "pawikan",
  "egg", "eggs", "itlog", "chicken", "manok", "pork", "baboy", "beef", "baka", "rice",
  "bugas", "vegetable", "vegetables", "gulay", "ice", "yelo",
]);

/** True when a name is not a fish, e.g. "Pusit", "Hipon", "Tahong". */
export function isNonFish(name) {
  const words = String(name || "").normalize("NFKD").toLowerCase().match(/[a-z]+/g) || [];
  return words.some((word) => NON_FISH_WORDS.has(word));
}
