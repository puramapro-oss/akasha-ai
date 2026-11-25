"""Independent, optional test oracle (Python 3.9+, pyswisseph==2.10.3.2).

python scripts/natal-reference.py > tests/fixtures/natal-reference.json
python scripts/natal-reference.py --samples 2048 --polar > /tmp/natal-sample.json
NATAL_REFERENCE_FILE=/tmp/natal-sample.json npm exec -- vitest run src/lib/natal-chart.test.ts
node scripts/natal-time-window.verify.mjs

The application does not import this generator or require the Swiss Ephemeris.
Only synthetic civil dates and coordinates are used; east longitudes are positive.
"""
import argparse
from collections import defaultdict
import datetime as dt
import json
import random
from zoneinfo import ZoneInfo

import swisseph as swe

BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]
UTC = dt.timezone.utc
SIDEREAL = {"lahiri": swe.SIDM_LAHIRI, "fagan-bradley": swe.SIDM_FAGAN_BRADLEY}

# Dates are UTC instants. IANA/zoneinfo independently obtains the civil inputs.
CURATED = [
    ("paris-j2000", "2000-01-01T12:00", "Europe/Paris", 48.86, 2.35),
    ("paris-fold-first", "2024-10-27T00:30", "Europe/Paris", 48.86, 2.35),
    ("paris-fold-second", "2024-10-27T01:30", "Europe/Paris", 48.86, 2.35),
    ("paris-after-gap", "2024-03-31T01:17", "Europe/Paris", 48.86, 2.35),
    ("lord-howe-fold-first", "2024-04-06T14:45", "Australia/Lord_Howe", -31.55, 159.08),
    ("lord-howe-fold-second", "2024-04-06T15:15", "Australia/Lord_Howe", -31.55, 159.08),
    ("kathmandu-quarter-offset", "2008-03-09T19:11", "Asia/Kathmandu", 27.72, 85.32),
    ("utc-plus-fourteen", "2019-04-01T15:13", "Pacific/Kiritimati", 1.87, -157.42),
    ("eastern-hemisphere", "1963-11-11T07:51", "Asia/Tokyo", 35.68, 139.65),
    ("western-hemisphere", "1947-06-12T14:27", "America/New_York", 40.71, -74.0),
    ("southern-hemisphere", "1980-09-12T01:57", "Australia/Sydney", -33.87, 151.21),
    ("southern-atlantic", "2035-02-04T12:51", "UTC", -55.2, -33.8),
    ("early-20th-century", "1900-05-21T17:41", "UTC", 12.35, -67.45),
    ("late-21st-century", "2099-11-11T05:11", "UTC", -59.2, 142.6),
    ("equator-west-date-line", "2004-02-29T23:57", "UTC", 0.0, -179.99),
    ("near-arctic", "1996-12-21T04:19", "UTC", 64.8, 20.0),
    ("near-antarctic", "2048-06-20T18:11", "UTC", -65.0, 33.0),
    ("arctic", "2013-04-23T14:32", "UTC", 70.1, 4.0),
    ("antarctic", "2005-03-22T21:40", "UTC", -72.3, 70.6),
]


def reference(case_id, instant, zone_name, latitude, longitude, with_sidereal=False):
    zone = ZoneInfo(zone_name)
    civil = instant.astimezone(zone)
    hours = instant.hour + instant.minute / 60
    jd = swe.julday(instant.year, instant.month, instant.day, hours)
    planets = {}
    for name in BODIES:
        calculated, flags = swe.calc_ut(jd, getattr(swe, name.upper()), swe.FLG_MOSEPH)
        if not (flags & swe.FLG_MOSEPH):
            raise RuntimeError("Moshier was required for a self-contained reference")
        planets[name] = round(calculated[0], 8)
    cusps, angles = swe.houses_ex(jd, latitude, longitude, b"E")
    parameters = {
        "date": civil.strftime("%Y-%m-%d"), "time": civil.strftime("%H:%M"),
        "zone": zone_name, "latitude": latitude, "longitude": longitude,
    }
    if civil.replace(fold=0).utcoffset() != civil.replace(fold=1).utcoffset():
        parameters["occurrence"] = "later" if civil.fold else "earlier"
    result = {
        "id": case_id, "utc": instant.strftime("%Y-%m-%dT%H:%MZ"), "input": parameters,
        "positions": planets, "ascendant": round(angles[0], 8), "midheaven": round(angles[1], 8),
        "equalCusps": [round(cusp, 8) for cusp in cusps],
    }

    if with_sidereal:
        result["sidereal"] = {}
        for name, sid_mode in SIDEREAL.items():
            swe.set_sid_mode(sid_mode)
            flags = swe.FLG_MOSEPH | swe.FLG_SIDEREAL
            sid_cusps, sid_angles = swe.houses_ex(jd, latitude, longitude, b"E", swe.FLG_SIDEREAL)
            _, ayanamsha = swe.get_ayanamsa_ex_ut(jd, swe.FLG_MOSEPH)
            result["sidereal"][name] = {
                "ayanamsha": round(ayanamsha, 8),
                "positions": {body: round(swe.calc_ut(jd, getattr(swe, body.upper()), flags)[0][0], 8)
                              for body in BODIES},
                "ascendant": round(sid_angles[0], 8), "midheaven": round(sid_angles[1], 8),
                "equalCusps": [round(cusp, 8) for cusp in sid_cusps],
            }
    return result



def day_reference(date, zone_name, zodiac):
    zone = ZoneInfo(zone_name)
    civil_start = dt.datetime.fromisoformat(date).replace(tzinfo=zone)
    instant = civil_start.astimezone(UTC)
    stop = (civil_start + dt.timedelta(days=1)).astimezone(UTC)
    flags = swe.FLG_MOSEPH
    if zodiac in SIDEREAL:
        swe.set_sid_mode(SIDEREAL[zodiac])
        flags |= swe.FLG_SIDEREAL
    signs = {"Sun": set(), "Moon": set()}
    expanded = {"Sun": set(), "Moon": set()}
    while instant < stop:
        jd = swe.julday(instant.year, instant.month, instant.day, instant.hour + instant.minute / 60)
        for name, values in signs.items():
            calculated, _ = swe.calc_ut(jd, getattr(swe, name.upper()), flags)
            values.add(int(calculated[0] // 30))
            expanded[name].update(int(((calculated[0] + offset) % 360) // 30) for offset in [-0.1, 0, 0.1])
        instant += dt.timedelta(minutes=1)
    return {"input": {"date": date, "time": "", "zone": zone_name, "zodiac": zodiac},
            "allowedSigns": {name: sorted(values) for name, values in expanded.items()},
            "sampledSigns": {name: sorted(values) for name, values in signs.items()}}


# Synthetic civil times. The four grazing / near-coincident horizon witnesses
# deliberately qualify the application's decision to withhold the Ascendant.
WINDOW_CASES = [
    # identifier, civil date and time, IANA zone, latitude, longitude, occurrence
    ("paris", "2000-01-01T13:00", "Europe/Paris", 48.86, 2.35, None),
    ("paris-fold", "2024-10-27T02:30", "Europe/Paris", 48.86, 2.35, None),
    ("paris-earlier", "2024-10-27T02:30", "Europe/Paris", 48.86, 2.35, "earlier"),
    ("paris-later", "2024-10-27T02:30", "Europe/Paris", 48.86, 2.35, "later"),
    ("paris-gap", "2024-03-31T02:15", "Europe/Paris", 48.86, 2.35, None),
    ("paris-cross-gap", "2024-03-31T03:01", "Europe/Paris", 48.86, 2.35, None),
    ("lord-howe-earlier", "2024-04-07T01:45", "Australia/Lord_Howe", -31.55, 159.08, "earlier"),
    ("lord-howe-later", "2024-04-07T01:45", "Australia/Lord_Howe", -31.55, 159.08, "later"),
    ("lord-howe-gap", "2024-10-06T02:15", "Australia/Lord_Howe", -31.55, 159.08, None),
    ("lord-howe-cross-gap", "2024-10-06T02:31", "Australia/Lord_Howe", -31.55, 159.08, None),
    ("quarter-offset", "2001-07-11T00:05:01", "Asia/Kathmandu", 27.72, 85.32, None),
    ("skipped-date", "2011-12-30T02:04", "Pacific/Apia", -13.83, -171.75, None),
    ("historical-rollback", "1988-10-30T00:00:40", "America/St_Johns", 47.56, -52.71, "earlier"),
    ("march-ingress", "2024-03-20T03:05", "UTC", 0, 0, None),
    ("international-date-line", "2019-04-01T00:03", "Pacific/Kiritimati", 1.87, -157.42, None),
    ("no-coordinates", "2000-01-01T13:00", "UTC", None, None, None),
    ("polar-coincident", "2000-01-01T12:00:00", "UTC", 66.5623, -10.4571, None),
    ("polar-between-samples", "2000-01-01T12:00:30", "UTC", 66.5623, -10.4571, None),
    ("polar-fast-rise", "2000-01-01T12:00:30", "UTC", 66.55, -10.4571, None),
    ("polar-turn", "2000-01-01T12:00:30", "UTC", 70, 22.44818, None),
    ("geographic-pole", "2000-01-01T12:00", "UTC", 90, 0, None),
]

WINDOW_MINUTES = (5, 15, 30, 60)


def window_signs(anchor, latitude, longitude, zodiac, polar_witness):
    """Return signs seen on a finer grid and allowed signs at displayed minutes."""
    sidereal = swe.FLG_SIDEREAL if zodiac in SIDEREAL else 0
    if sidereal:
        swe.set_sid_mode(SIDEREAL[zodiac])
    flags = swe.FLG_MOSEPH | sidereal
    dense = {n: defaultdict(set) for n in WINDOW_MINUTES}
    allowed = {n: defaultdict(set) for n in WINDOW_MINUTES}
    # Ordinary sky sampled every 15 s. At polar witnesses, angles every second
    # and the slower-moving planets every displayed minute.
    for offset in range(-3600, 3601, 1 if polar_witness else 15):
        jd = 2440587.5 + (anchor + offset) / 86400
        at_minute = offset % 60 == 0
        positions = {}
        if not polar_witness or at_minute:
            for body in BODIES:
                values, computed_flags = swe.calc_ut(jd, getattr(swe, body.upper()), flags)
                if not (computed_flags & swe.FLG_MOSEPH):
                    raise RuntimeError("Expected the self-contained Moshier ephemeris")
                positions[body] = values[0]
        if latitude is not None and abs(latitude) < 90:
            _, angles = swe.houses_ex(jd, latitude, longitude, b"E", sidereal)
            positions.update(ASC=angles[0], MC=angles[1])
        for n in WINDOW_MINUTES:
            if abs(offset) > n * 60:
                continue
            for field, value in positions.items():
                dense[n][field].add(int(value // 30))
                if at_minute:
                    # Product guard 0.05° plus at most 0.04° ephemeris tolerance.
                    allowed[n][field].update(int(((value + delta) % 360) // 30) for delta in (-0.09, 0, 0.09))
    return {n: {field: {"observed": sorted(values), "allowed": sorted(allowed[n][field])}
                for field, values in dense[n].items()} for n in WINDOW_MINUTES}


def window_reference():
    cases = list(WINDOW_CASES)
    rng = random.Random(131729)
    for i in range(18):
        local = dt.datetime(1995, 1, 1) + dt.timedelta(minutes=rng.randint(0, 50 * 365 * 1440),
                                                       seconds=rng.randint(0, 59))
        cases.append((f"ordinary-{i}", local.isoformat(), "UTC", round(rng.uniform(-60, 60), 4),
                      round(rng.uniform(-180, 180), 4), None))

    results = []
    for case_id, local, zone_name, lat, lng, occurrence in cases:
        date, time = local.split("T")
        params = {"date": date, "time": time, "zone": zone_name}
        if lat is not None:
            params.update(latitude=lat, longitude=lng)
        if occurrence:
            params["occurrence"] = occurrence
        wall = dt.datetime.fromisoformat(local)
        zone = ZoneInfo(zone_name)
        candidates = {wall.replace(tzinfo=zone, fold=f).astimezone(UTC) for f in (0, 1)}
        matches = sorted(t for t in candidates if t.astimezone(zone).replace(tzinfo=None) == wall)
        if not matches or (len(matches) > 1 and not occurrence):
            choices = [t.isoformat(timespec="milliseconds").replace("+00:00", "Z") for t in matches]
            results.append({"id": case_id, "input": params, "status": "ambiguous" if matches else "gap",
                            "choices": choices})
            continue
        anchor = matches[-1 if occurrence == "later" else 0].timestamp()
        polar_witness = case_id.startswith("polar-")
        for zodiac in ("tropical", *SIDEREAL):
            results.append({"id": case_id, "input": {**params, "zodiac": zodiac}, "status": "estimated",
                            "withholdAscendant": polar_witness,
                            "windows": window_signs(anchor, lat, lng, zodiac, polar_witness)})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", default=0, type=int, help="Additional deterministic UTC samples")
    parser.add_argument("--polar", action="store_true", help="Include 576 extra Arctic/Antarctic reference charts")
    parser.add_argument("--time-windows", action="store_true", help="Generate the estimated-time reference cases")
    args = parser.parse_args()
    if args.time_windows:
        if args.samples or args.polar:
            parser.error("--time-windows has its own fixed sample grid")
        print(json.dumps(window_reference()))
        return
    if not 0 <= args.samples <= 10000:
        parser.error("--samples requires a value from 0 to 10000")
    cases = [
        reference(case_id, dt.datetime.fromisoformat(text).replace(tzinfo=UTC), zone_name, latitude, longitude, with_sidereal=True)
        for case_id, text, zone_name, latitude, longitude in CURATED
    ]
    rng = random.Random(934721)
    first = dt.datetime(1900, 1, 1, tzinfo=UTC)
    end = dt.datetime(2100, 1, 1, tzinfo=UTC)
    minutes = (end - first).days * 24 * 60
    for index in range(args.samples):
        instant = first + dt.timedelta(minutes=rng.randrange(minutes))
        latitude = round(rng.uniform(-65, 65), 4)
        longitude = round(rng.uniform(-180, 180), 4)
        cases.append(reference("sample-" + str(index), instant, "UTC", latitude, longitude, with_sidereal=index < 320))
    if args.polar:
        grid_date = dt.datetime(2000, 1, 1, tzinfo=UTC)
        for latitude in [-89.5, -85, -75, -70, -67, -66.56, 66.56, 67, 70, 75, 85, 89.5]:
            for halfhour in range(48):
                instant = grid_date + dt.timedelta(minutes=halfhour * 30)
                key = f"polar-{latitude}-{halfhour}"
                cases.append(reference(key, instant, "UTC", latitude, 0.0))
    days = [
        ("2000-01-01", "Europe/Paris"), ("2024-03-20", "UTC"), ("2024-06-20", "America/New_York"),
        ("2024-03-31", "Europe/Paris"), ("2024-10-27", "Europe/Paris"), ("2011-12-31", "Pacific/Apia"),
    ]
    out = {
        "oracle": "Swiss Ephemeris " + swe.version + " / pyswisseph 2.10.3.2, Moshier",
        "frame": "Apparent geocentric tropical ecliptic longitude/equinox of date; equal houses from Ascendant; angles in degrees.",
        "time": "Synthetic UTC inputs passed as UT to calc_ut and houses_ex; zoneinfo derives displayed civil time.",
        "source": "https://www.astro.com/swisseph/swephprg.htm",
        "seed": 934721, "cases": cases, "days": [day_reference(date, zone, zodiac) for date, zone in days for zodiac in ["tropical", *SIDEREAL]],
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
