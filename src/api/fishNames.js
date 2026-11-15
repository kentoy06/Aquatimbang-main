// AquaTimbang - one choice per fish, whatever the spelling.
//
// The same fish is sometimes saved under two spellings ("Anduhaw" and
// "Anduhao", "Bisugo" and "Bisogo"). Vendors should not have to guess which
// one to pick, so lists of fish show them as ONE choice, labelled with the
// main spelling and the others in brackets: "Anduhaw (Anduhao)".
// Keep spellingKey in sync with spelling_key in backend/api/species_tools.py.

/** "Lapu-Lapu", "lapu lapu" and "LAPULAPU" all become "lapulapu". */
export const nameKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Ignores common Cebuano/Filipino spelling differences: "ao" is read as "aw",
 * o as u, e as i, and repeated letters count once.
 */
export function spellingKey(value) {
  const key = nameKey(value).replace(/ao/g, "aw").replace(/o/g, "u").replace(/e/g, "i");
  let out = "";
  for (const ch of key) if (out[out.length - 1] !== ch) out += ch;
  return out;
}

/**
 * Merge fish that are the same under the spelling rules into one choice.
 * The fish with the most prices (then the vendor's own fish, then the older
 * record) is kept; the choice carries `label` ("Anduhaw (Anduhao)") and
 * `ids` (every id it stands for), and keeps the kept fish's `id`.
 *
 *   mergeSameFish(species, { priceCount: (id) => 12, myFish: ["3"] })
 */
export function mergeSameFish(species, { priceCount = () => 0, myFish = [] } = {}) {
  const groups = new Map();
  species.forEach((fish) => {
    const key = spellingKey(fish.name) || `id-${fish.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fish);
  });
  const mine = new Set(myFish.map(String));
  return [...groups.values()].map((group) => {
    const ranked = [...group].sort((a, b) =>
      priceCount(String(b.id)) - priceCount(String(a.id))
      || Number(mine.has(String(b.id))) - Number(mine.has(String(a.id)))
      || Number(a.id) - Number(b.id));
    const keep = ranked[0];
    const others = [];
    const seen = new Set([nameKey(keep.name)]);
    const add = (name) => {
      const k = nameKey(name);
      if (name && k && !seen.has(k)) { seen.add(k); others.push(String(name).trim()); }
    };
    ranked.slice(1).forEach((fish) => add(fish.name));
    ranked.forEach((fish) => (fish.aliases || []).forEach(add));
    return {
      ...keep,
      id: String(keep.id),
      ids: group.map((fish) => String(fish.id)),
      label: others.length ? `${keep.name} (${others.slice(0, 3).join(", ")})` : keep.name,
    };
  });
}
