import json, subprocess
from concurrent.futures import ThreadPoolExecutor

# FIFA/ESPN 3-letter codes (ESPN uses FIFA style: GER not DEU, NED not NLD, RSA not ZAF)
CODES = """afg alb alg and ang aia atg arg arm aru asa aus aut aze bah ban bar
bdi bel ben ber bfa bhu bih blr blz ben bol bot bra brb bru bul bur cam can cay
cgo cha chi chn cmr cod cog cok col com cpv crc cro cta cub cur cyp cze den dji
dma dom ecu egy eng eqg eri esp est eth fij fin fra fro gab gam geo ger gha gnb
gre grn gua gui guf guy hai hkg hon hun idn ind irl irn irq isl isr ita jam jor
jpn kaz ken kgz kor kos ksa kuw lao lat lba lbr lca les lbn lie ltu lux mac mad
mar mas mdv mex mkd mli mlt mne mng mnt moz mri msr mtn mwi mya nam nca ned nep
new nga nir nig nor nzl oma pak pan par per phi ple png pol por prk pur qat rou
rsa rus rwa sam sen sey sin skn sle slv smr sol som srb sri ssd stp sud sui sur
svk svn swe swz syr tah tan tca tga tha tjk tkm tls tog tpe tri tun tur uae uga
ukr uru usa uzb van ven vgb vie vin wal yem zam zim""".split()

BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/{}/scoreboard"

def probe(slug):
    try:
        out = subprocess.run(["curl","-s","-m","20","--compressed",BASE.format(slug)],
                             capture_output=True, timeout=35).stdout
        d = json.loads(out)
        lg = (d.get('leagues') or [{}])[0]
        if not lg.get('name'): return None
        return {'slug':slug,'name':lg['name'],'events':len(d.get('events',[])),
                'season':(lg.get('season') or {}).get('displayName')}
    except Exception:
        return None

known = {l['slug'] for l in json.load(open('leagues.json'))}

# pass 1: top division of every country
cand1 = [f"{c}.1" for c in CODES]
with ThreadPoolExecutor(max_workers=8) as ex:
    hits1 = [r for r in ex.map(probe, cand1) if r]
print(f"pass1: {len(hits1)}/{len(cand1)} top divisions found")

# pass 2: lower divisions + cups, only for countries that had a top division
cand2 = []
for r in hits1:
    c = r['slug'].split('.')[0]
    cand2 += [f"{c}.2", f"{c}.3", f"{c}.cup", f"{c}.super_cup", f"{c}.w.1"]
with ThreadPoolExecutor(max_workers=8) as ex:
    hits2 = [r for r in ex.map(probe, cand2) if r]
print(f"pass2: {len(hits2)}/{len(cand2)} extra competitions found")

allhits = {r['slug']: r for r in hits1 + hits2}
new = {s:r for s,r in allhits.items() if s not in known}
json.dump(sorted(allhits.values(), key=lambda x:x['slug']), open('discovered.json','w'), indent=1)

print(f"\ntotal discovered : {len(allhits)}")
print(f"already in catalog: {len(allhits)-len(new)}")
print(f"NOT in catalog    : {len(new)}")
print("\n--- unlisted leagues (invisible to the official catalog) ---")
for s,r in sorted(new.items()):
    print(f"  {s:<16} {r['events']:>3} ev  {r['name']}")
