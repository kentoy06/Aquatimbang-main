"""
Default BFAR closed fishing seasons.

Closed seasons stop fishing for certain species in an area for a few
months each year so the fish can spawn. Less catch reaches the market,
which usually raises prices. Dates are the ones BFAR announces every
year; LGU Officers and Administrators can edit them in External Factors.
"""

# name, area, (start month, day), (end month, day), species names, notes
DEFAULT_SEASONS = [
    (
        "Visayan Sea closed season",
        "Visayan Sea",
        (11, 15), (2, 15),
        ["Tamban", "Alumahan", "Hasa-hasa"],
        "No catching of sardines, herrings and mackerels so they can spawn.",
    ),
    (
        "Galunggong closed season",
        "Northern Palawan",
        (11, 1), (1, 31),
        ["Galunggong"],
        "No catching of round scad (galunggong) so it can spawn.",
    ),
    (
        "Zamboanga Peninsula closed season",
        "Zamboanga Peninsula",
        (12, 1), (3, 1),
        ["Tamban", "Alumahan", "Hasa-hasa"],
        "No catching of sardines, herrings and mackerels so they can spawn.",
    ),
    (
        "Davao Gulf closed season",
        "Davao Gulf",
        (6, 1), (8, 31),
        ["Tamban", "Alumahan", "Hasa-hasa", "Galunggong", "Matambaka"],
        "No catching of small pelagic fish (sardines, mackerels, scads) so they can spawn.",
    ),
]

SOURCE = "BFAR (confirm the dates each year)"


def seed_closed_seasons(season_model, species_model, create=True):
    """
    Add the default seasons that are missing (when create is True) and
    link their species by name. Safe to run many times; dates and notes
    edited by users are kept, and a season a user removed stays removed
    when create is False.
    """
    created = 0
    for name, area, (sm, sd), (em, ed), species_names, notes in DEFAULT_SEASONS:
        season = season_model.objects.filter(name=name).first()
        if season is None:
            if not create:
                continue
            season = season_model.objects.create(
                name=name, area=area, start_month=sm, start_day=sd,
                end_month=em, end_day=ed, source=SOURCE, notes=notes,
            )
            created += 1
        for species_name in species_names:
            fish = species_model.objects.filter(name__iexact=species_name).first()
            if fish is not None:
                season.species.add(fish)
    return created
