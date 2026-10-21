import type { Constituency, Village, Ward } from '@/types';

/**
 * DEMONSTRATION DATA.
 * Ward names follow Mandera South's electoral wards. Village names, coordinates
 * and populations are approximate placeholders for the prototype. Replace them
 * with the official Ministry of Health / KNBS location list before go-live.
 */
export const constituency: Constituency = {
  id: 'c_mandera_south',
  name: 'Mandera South',
  county: 'Mandera County',
};

export const wards: Ward[] = [
  { id: 'w_elwak_north', name: 'Elwak North', constituencyId: constituency.id },
  { id: 'w_elwak_south', name: 'Elwak South', constituencyId: constituency.id },
  { id: 'w_wargadud', name: 'Wargadud', constituencyId: constituency.id },
  { id: 'w_kutulo', name: 'Kutulo', constituencyId: constituency.id },
  { id: 'w_shimbir_fatuma', name: 'Shimbir Fatuma', constituencyId: constituency.id },
];

const v = (
  id: string,
  name: string,
  wardId: string,
  lat: number,
  lng: number,
  population: number,
  aliases: string[] = [],
): Village => ({ id, name, wardId, lat, lng, population, active: true, aliases });

export const villages: Village[] = [
  v('v_elwak_town', 'Elwak Town', 'w_elwak_north', 2.81, 40.93, 18400, ['Elwak', 'El Wak']),
  v('v_bulla_mpya', 'Bulla Mpya', 'w_elwak_north', 2.86, 40.98, 5200),
  v('v_garse', 'Garse', 'w_elwak_north', 2.93, 41.04, 3100),
  v('v_elwak_south', 'Elwak South', 'w_elwak_south', 2.74, 40.9, 9600),
  v('v_bulla_haji', 'Bulla Haji', 'w_elwak_south', 2.68, 40.97, 4300),
  v('v_didkuro', 'Didkuro', 'w_elwak_south', 2.61, 40.86, 2700),
  v('v_wargadud', 'Wargadud', 'w_wargadud', 2.98, 40.66, 7800, ['Wargadut']),
  v('v_hareri', 'Hareri', 'w_wargadud', 3.06, 40.58, 3400),
  v('v_dimu', 'Dimu', 'w_wargadud', 2.91, 40.55, 2600),
  v('v_kutulo', 'Kutulo', 'w_kutulo', 2.71, 40.62, 8900),
  v('v_burduras', 'Burduras', 'w_kutulo', 2.63, 40.7, 3900),
  v('v_ires_suki', 'Ires Suki', 'w_kutulo', 2.56, 40.58, 2200),
  v('v_shimbir_fatuma', 'Shimbir Fatuma', 'w_shimbir_fatuma', 3.12, 40.86, 6100, ['Shimbir']),
  v('v_rhamu', 'Rhamu', 'w_shimbir_fatuma', 3.22, 40.99, 11200, ['Ramu']),
  v('v_fincharo', 'Fincharo', 'w_shimbir_fatuma', 3.05, 40.77, 2900),
];
