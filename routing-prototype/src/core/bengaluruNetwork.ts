import { haversineDistanceMeters, polylineDistanceMeters } from './geo';
import type {
  AccidentIncident,
  CongestionLevel,
  Coordinate,
  Hospital,
  ReferenceLocation,
  RoadClass,
  RoadNode,
  RoadSegment,
  TrafficSignal,
} from './types';

export const CONGESTION_MULTIPLIERS: Record<CongestionLevel, number> = {
  NONE: 1.0,
  LOW: 1.45,
  MEDIUM: 2.6,
  HIGH: 6.5,
};

/**
 * Verified geographic coordinates of RNS Institute of Technology (RNSIT),
 * Channasandra, Rajarajeshwari Nagar (RR Nagar), Bengaluru, Karnataka 560098.
 */
export const RNSIT_REFERENCE_LOCATION: ReferenceLocation = {
  id: 'ref_rnsit',
  name: 'RNS Institute of Technology (RNSIT)',
  shortName: 'RNSIT Campus',
  address: 'Dr. Vishnuvardhan Rd, Channasandra, RR Nagar, Bengaluru 560098',
  coord: { lat: 12.9011, lng: 77.5181 },
};

export const BENGALURU_AMBULANCE_START = {
  locationName: 'Channasandra EMS Staging Bay, Dr. Vishnuvardhan Rd (Simulated Start)',
  nearestNodeId: 'n_ambulance_staging',
  coord: { lat: 12.9042, lng: 77.52321 },
};

export const BENGALURU_DEFAULT_INCIDENT: AccidentIncident = {
  id: 'INC-BLR-2026-091',
  title: 'Multi-Vehicle Collision — RNSIT Main Gate Approach',
  locationName: 'Dr. Vishnuvardhan Rd near RNSIT Campus, Channasandra, RR Nagar, Bengaluru',
  coord: { lat: 12.90269, lng: 77.51828 },
  severity: 'CRITICAL',
  reportedAt: new Date().toISOString(),
  nearestNodeId: 'n_rnsit_gate',
};

export const BENGALURU_NODES: RoadNode[] = [
  { id: 'n_ambulance_staging', name: 'Channasandra EMS Staging', area: 'Channasandra / RR Nagar', coord: { lat: 12.9042, lng: 77.52321 } },
  { id: 'n_rnsit_gate', name: 'RNSIT Main Gate Junction', area: 'Channasandra / RR Nagar', coord: { lat: 12.90269, lng: 77.51828 } },
  { id: 'n_channasandra_rd', name: 'Channasandra Double Rd Cross', area: 'RR Nagar South', coord: { lat: 12.9078, lng: 77.5171 } },
  { id: 'n_beml_5th', name: 'BEML 5th Stage Signal', area: 'BEML Layout', coord: { lat: 12.91282, lng: 77.51597 } },
  { id: 'n_ideal_homes', name: 'Ideal Homes Circle', area: 'RR Nagar', coord: { lat: 12.92118, lng: 77.51771 } },
  { id: 'n_sparsh_hosp', name: 'SPARSH Hospital RR Nagar', area: 'Ideal Homes / RR Nagar', coord: { lat: 12.92688, lng: 77.51892 } },
  { id: 'n_rr_arch', name: 'RR Nagar Arch (Mysore Rd)', area: 'Mysore Road', coord: { lat: 12.936, lng: 77.51825 } },
  { id: 'n_srinivasapura', name: 'Srinivasapura Cross', area: 'Dr. Vishnuvardhan Rd West', coord: { lat: 12.90005, lng: 77.50849 } },
  { id: 'n_bgs_hosp', name: 'BGS Global Hospital Gate', area: 'Kengeri / BGS Rd', coord: { lat: 12.90207, lng: 77.49795 } },
  { id: 'n_kengeri_nice', name: 'NICE Rd — Kengeri Interchange', area: 'NICE Peripheral Rd', coord: { lat: 12.9052, lng: 77.4848 } },
  { id: 'n_kengeri_ttmc', name: 'Kengeri Bus Terminal (Mysore Rd)', area: 'Kengeri', coord: { lat: 12.91366, lng: 77.48722 } },
  { id: 'n_mylasandra', name: 'Mylasandra Cross', area: 'Mylasandra', coord: { lat: 12.9108, lng: 77.5042 } },
  { id: 'n_kenchenahalli', name: 'Kenchenahalli Main Rd Cross', area: 'Kenchenahalli / RR Nagar', coord: { lat: 12.91679, lng: 77.51166 } },
  { id: 'n_global_village', name: 'Global Village Tech Park Rd', area: 'Mylasandra / Pattanagere', coord: { lat: 12.91976, lng: 77.50048 } },
  { id: 'n_pattanagere', name: 'Pattanagere Metro (Mysore Rd)', area: 'Pattanagere', coord: { lat: 12.9255, lng: 77.5088 } },
  { id: 'n_nayandahalli', name: 'Nayandahalli Junction (ORR)', area: 'Mysore Rd / ORR', coord: { lat: 12.94562, lng: 77.52882 } },
  { id: 'n_fortis_hosp', name: 'Fortis Hospital Nagarbhavi', area: 'Nagarbhavi 2nd Stage', coord: { lat: 12.9598, lng: 77.5113 } },
  { id: 'n_srinivasanagara', name: 'Srinivasanagara Cross', area: 'Uttarahalli West', coord: { lat: 12.9048, lng: 77.5285 } },
  { id: 'n_uttarahalli', name: 'Uttarahalli Circle', area: 'Uttarahalli', coord: { lat: 12.9058, lng: 77.5426 } },
  { id: 'n_hosakerehalli', name: 'Hosakerehalli ORR Cross', area: 'Outer Ring Rd South', coord: { lat: 12.9308, lng: 77.5355 } },
  { id: 'n_chikkalasandra', name: 'Chikkalasandra / Kadirenahalli', area: 'Padmanabhanagar', coord: { lat: 12.9112, lng: 77.5522 } },
  { id: 'n_vasavi_hosp', name: 'Vasavi Hospital Gate', area: 'Kumaraswamy Layout', coord: { lat: 12.90327, lng: 77.56043 } },
  { id: 'n_banashankari', name: 'Banashankari TTMC / Metro', area: 'Banashankari', coord: { lat: 12.9156, lng: 77.57358 } },
  { id: 'n_sagar_hosp', name: 'Sagar Hospitals Gate', area: 'Kumaraswamy Layout / BSK', coord: { lat: 12.89888, lng: 77.57641 } },
];

interface RawSegmentDef {
  id: string;
  name: string;
  corridor: string;
  from: string;
  to: string;
  roadClass: RoadClass;
  baseSpeedKmh: number;
  intermediatePoints?: Coordinate[];
}

const RAW_SEGMENTS: RawSegmentDef[] = [
  {
    id: 'seg_staging_rnsit',
    name: 'Dr. Vishnuvardhan Rd (Channasandra Staging — RNSIT Gate)',
    corridor: 'Dr. Vishnuvardhan Rd',
    from: 'n_ambulance_staging',
    to: 'n_rnsit_gate',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 38,
  },
  {
    id: 'seg_rnsit_channasandra_rd',
    name: 'RR Nagar Main Rd (RNSIT Gate — Channasandra Cross)',
    corridor: 'RR Nagar Main Rd',
    from: 'n_rnsit_gate',
    to: 'n_channasandra_rd',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 36,
  },
  {
    id: 'seg_channasandra_beml',
    name: 'RR Nagar Main Rd (Channasandra Cross — BEML 5th Stage)',
    corridor: 'RR Nagar Main Rd',
    from: 'n_channasandra_rd',
    to: 'n_beml_5th',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 38,
  },
  {
    id: 'seg_beml_ideal',
    name: 'Jawaharlal Nehru Rd (BEML 5th Stage — Ideal Homes)',
    corridor: 'RR Nagar Double Rd',
    from: 'n_beml_5th',
    to: 'n_ideal_homes',
    roadClass: 'INNER_RING',
    baseSpeedKmh: 40,
    intermediatePoints: [{ lat: 12.9171, lng: 77.5169 }],
  },
  {
    id: 'seg_channasandra_kenchenahalli',
    name: 'Kenchenahalli Main Rd (Channasandra — Kenchenahalli)',
    corridor: 'Kenchenahalli Main Rd',
    from: 'n_channasandra_rd',
    to: 'n_kenchenahalli',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 40,
  },
  {
    id: 'seg_kenchenahalli_ideal',
    name: '80ft Rd / Kenchenahalli Link (Kenchenahalli — Ideal Homes)',
    corridor: 'Kenchenahalli 80ft Rd',
    from: 'n_kenchenahalli',
    to: 'n_ideal_homes',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 42,
  },
  {
    id: 'seg_kenchenahalli_pattanagere',
    name: 'Pattanagere Link Rd (Kenchenahalli — Pattanagere Metro)',
    corridor: 'Kenchenahalli West Link',
    from: 'n_kenchenahalli',
    to: 'n_pattanagere',
    roadClass: 'COLLECTOR',
    baseSpeedKmh: 38,
  },
  {
    id: 'seg_ideal_sparsh',
    name: '18th Cross / Ideal Homes Rd (Ideal Homes — SPARSH Hospital)',
    corridor: 'Ideal Homes Arterial',
    from: 'n_ideal_homes',
    to: 'n_sparsh_hosp',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 36,
  },
  {
    id: 'seg_sparsh_arch',
    name: 'RR Nagar Temple Rd (SPARSH Hospital — RR Nagar Arch)',
    corridor: 'RR Nagar North Arterial',
    from: 'n_sparsh_hosp',
    to: 'n_rr_arch',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 40,
  },
  {
    id: 'seg_rnsit_srinivasapura',
    name: 'Dr. Vishnuvardhan Rd West (RNSIT Gate — Srinivasapura)',
    corridor: 'Dr. Vishnuvardhan Rd',
    from: 'n_rnsit_gate',
    to: 'n_srinivasapura',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 42,
  },
  {
    id: 'seg_srinivasapura_bgs',
    name: 'Uttarahalli–Kengeri Rd (Srinivasapura — BGS Global Hospital)',
    corridor: 'Kengeri / BGS Corridor',
    from: 'n_srinivasapura',
    to: 'n_bgs_hosp',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 44,
  },
  {
    id: 'seg_bgs_nice',
    name: 'Kengeri Main Rd (BGS Hospital — NICE Rd Interchange)',
    corridor: 'NICE Link Rd',
    from: 'n_bgs_hosp',
    to: 'n_kengeri_nice',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 52,
  },
  {
    id: 'seg_nice_kengeri_ttmc',
    name: 'Mysore Rd West (NICE Interchange — Kengeri Terminal)',
    corridor: 'Mysore Road Highway',
    from: 'n_kengeri_nice',
    to: 'n_kengeri_ttmc',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 56,
  },
  {
    id: 'seg_bgs_kengeri_ttmc',
    name: 'BGS Rd (BGS Global Hospital — Kengeri Terminal)',
    corridor: 'Kengeri Arterial',
    from: 'n_bgs_hosp',
    to: 'n_kengeri_ttmc',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 42,
  },
  {
    id: 'seg_srinivasapura_mylasandra',
    name: 'Mylasandra Main Rd (Srinivasapura — Mylasandra)',
    corridor: 'Mylasandra Bypass',
    from: 'n_srinivasapura',
    to: 'n_mylasandra',
    roadClass: 'COLLECTOR',
    baseSpeedKmh: 36,
  },
  {
    id: 'seg_mylasandra_beml',
    name: 'BEML Cross Rd (Mylasandra — BEML 5th Stage)',
    corridor: 'BEML West Link',
    from: 'n_mylasandra',
    to: 'n_beml_5th',
    roadClass: 'COLLECTOR',
    baseSpeedKmh: 34,
  },
  {
    id: 'seg_mylasandra_global',
    name: 'Global Village Rd (Mylasandra — Global Village Tech Park)',
    corridor: 'Global Village Bypass',
    from: 'n_mylasandra',
    to: 'n_global_village',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 44,
  },
  {
    id: 'seg_kengeri_global',
    name: 'Mysore Rd (Kengeri Terminal — Global Village)',
    corridor: 'Mysore Road Highway',
    from: 'n_kengeri_ttmc',
    to: 'n_global_village',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 56,
  },
  {
    id: 'seg_global_pattanagere',
    name: 'Mysore Rd (Global Village — Pattanagere Metro)',
    corridor: 'Mysore Road Highway',
    from: 'n_global_village',
    to: 'n_pattanagere',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 54,
  },
  {
    id: 'seg_pattanagere_ideal',
    name: 'Pattanagere — Ideal Homes Rd (Pattanagere — Ideal Homes)',
    corridor: 'RR Nagar West Link',
    from: 'n_pattanagere',
    to: 'n_ideal_homes',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 38,
  },
  {
    id: 'seg_pattanagere_arch',
    name: 'Mysore Rd (Pattanagere Metro — RR Nagar Arch)',
    corridor: 'Mysore Road Highway',
    from: 'n_pattanagere',
    to: 'n_rr_arch',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 56,
  },
  {
    id: 'seg_arch_nayandahalli',
    name: 'Mysore Rd Flyover (RR Nagar Arch — Nayandahalli)',
    corridor: 'Mysore Road Highway',
    from: 'n_rr_arch',
    to: 'n_nayandahalli',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 58,
  },
  {
    id: 'seg_arch_fortis',
    name: 'Outer Ring Rd West (RR Nagar Arch — Fortis Nagarbhavi)',
    corridor: 'Outer Ring Rd West',
    from: 'n_rr_arch',
    to: 'n_fortis_hosp',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 52,
    intermediatePoints: [{ lat: 12.9485, lng: 77.5138 }],
  },
  {
    id: 'seg_nayandahalli_fortis',
    name: 'ORR Nagarbhavi Flyover (Nayandahalli — Fortis Hospital)',
    corridor: 'Outer Ring Rd West',
    from: 'n_nayandahalli',
    to: 'n_fortis_hosp',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 54,
  },
  {
    id: 'seg_rnsit_srinivasanagara',
    name: 'Dr. Vishnuvardhan Rd East (RNSIT Gate — Srinivasanagara)',
    corridor: 'Dr. Vishnuvardhan Rd',
    from: 'n_rnsit_gate',
    to: 'n_srinivasanagara',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 40,
  },
  {
    id: 'seg_srinivasanagara_uttarahalli',
    name: 'Uttarahalli Main Rd (Srinivasanagara — Uttarahalli Circle)',
    corridor: 'Uttarahalli Main Rd',
    from: 'n_srinivasanagara',
    to: 'n_uttarahalli',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 42,
  },
  {
    id: 'seg_uttarahalli_hosakerehalli',
    name: 'Outer Ring Rd South (Uttarahalli — Hosakerehalli Cross)',
    corridor: 'Outer Ring Rd South',
    from: 'n_uttarahalli',
    to: 'n_hosakerehalli',
    roadClass: 'INNER_RING',
    baseSpeedKmh: 48,
  },
  {
    id: 'seg_hosakerehalli_nayandahalli',
    name: 'Outer Ring Rd (Hosakerehalli — Nayandahalli Junction)',
    corridor: 'Outer Ring Rd South',
    from: 'n_hosakerehalli',
    to: 'n_nayandahalli',
    roadClass: 'ARTERIAL_HIGHWAY',
    baseSpeedKmh: 54,
  },
  {
    id: 'seg_hosakerehalli_arch',
    name: 'PESIT / Ring Rd Link (Hosakerehalli — RR Nagar Arch)',
    corridor: 'RR Nagar East Bypass',
    from: 'n_hosakerehalli',
    to: 'n_rr_arch',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 40,
  },
  {
    id: 'seg_uttarahalli_chikkalasandra',
    name: 'Subramanyapura / Kadirenahalli Rd (Uttarahalli — Chikkalasandra)',
    corridor: 'Padmanabhanagar Corridor',
    from: 'n_uttarahalli',
    to: 'n_chikkalasandra',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 38,
  },
  {
    id: 'seg_chikkalasandra_vasavi',
    name: 'Kumaraswamy Layout Rd (Chikkalasandra — Vasavi Hospital)',
    corridor: 'Kumaraswamy Layout',
    from: 'n_chikkalasandra',
    to: 'n_vasavi_hosp',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 36,
  },
  {
    id: 'seg_chikkalasandra_banashankari',
    name: 'Outer Ring Rd (Chikkalasandra — Banashankari TTMC)',
    corridor: 'Outer Ring Rd South',
    from: 'n_chikkalasandra',
    to: 'n_banashankari',
    roadClass: 'INNER_RING',
    baseSpeedKmh: 46,
  },
  {
    id: 'seg_vasavi_banashankari',
    name: '100ft Ring Rd Link (Vasavi Hospital — Banashankari)',
    corridor: 'Banashankari Ring Rd',
    from: 'n_vasavi_hosp',
    to: 'n_banashankari',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 38,
  },
  {
    id: 'seg_vasavi_sagar',
    name: 'Shavige Malleshwara Rd (Vasavi — Sagar Hospitals BSK)',
    corridor: 'Kumaraswamy Layout',
    from: 'n_vasavi_hosp',
    to: 'n_sagar_hosp',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 36,
  },
  {
    id: 'seg_banashankari_sagar',
    name: 'Kanakapura / DSI Rd (Banashankari — Sagar Hospitals)',
    corridor: 'Banashankari South',
    from: 'n_banashankari',
    to: 'n_sagar_hosp',
    roadClass: 'PRIMARY_CITY',
    baseSpeedKmh: 40,
  },
];

export function buildBengaluruRoadSegments(): RoadSegment[] {
  const nodeMap = new Map(BENGALURU_NODES.map((n) => [n.id, n]));
  return RAW_SEGMENTS.map((raw) => {
    const fromNode = nodeMap.get(raw.from);
    const toNode = nodeMap.get(raw.to);
    if (!fromNode || !toNode) {
      throw new Error(`Invalid segment definition ${raw.id}`);
    }
    const waypoints: Coordinate[] = [
      fromNode.coord,
      ...(raw.intermediatePoints ?? []),
      toNode.coord,
    ];
    const distanceMeters = Math.round(polylineDistanceMeters(waypoints));
    return {
      id: raw.id,
      name: raw.name,
      corridor: raw.corridor,
      fromNodeId: raw.from,
      toNodeId: raw.to,
      roadClass: raw.roadClass,
      baseSpeedKmh: raw.baseSpeedKmh,
      distanceMeters,
      waypoints,
      congestionLevel: 'NONE',
      congestionMultiplier: 1.0,
    };
  });
}

export function buildBengaluruHospitals(): Hospital[] {
  return [
    {
      id: 'hosp_sparsh_rr',
      name: 'SPARSH Hospital — Rajarajeshwari Nagar',
      shortName: 'SPARSH RR Nagar',
      area: 'Ideal Homes, RR Nagar',
      coord: { lat: 12.92688, lng: 77.51892 },
      emergencyBedsAvailable: 7,
      icuBedsAvailable: 4,
      traumaLevel: 'Level 1 Trauma & Emergency',
      availabilityStatus: 'AVAILABLE',
      isSimulatedData: true,
    },
    {
      id: 'hosp_bgs_kengeri',
      name: 'BGS Gleneagles Global Hospital — Kengeri',
      shortName: 'BGS Global',
      area: 'Uttarahalli–Kengeri Rd',
      coord: { lat: 12.90207, lng: 77.49795 },
      emergencyBedsAvailable: 9,
      icuBedsAvailable: 5,
      traumaLevel: 'Level 1 Multi-Organ Trauma',
      availabilityStatus: 'AVAILABLE',
      isSimulatedData: true,
    },
    {
      id: 'hosp_vasavi',
      name: 'Vasavi Hospital — Kumaraswamy Layout',
      shortName: 'Vasavi Hospital',
      area: 'Kumaraswamy Layout',
      coord: { lat: 12.90327, lng: 77.56043 },
      emergencyBedsAvailable: 5,
      icuBedsAvailable: 2,
      traumaLevel: 'Acute Cardiac & Trauma Care',
      availabilityStatus: 'AVAILABLE',
      isSimulatedData: true,
    },
    {
      id: 'hosp_sagar_bsk',
      name: 'Sagar Hospitals — Banashankari / Kumaraswamy Layout',
      shortName: 'Sagar BSK',
      area: 'Banashankari',
      coord: { lat: 12.89888, lng: 77.57641 },
      emergencyBedsAvailable: 4,
      icuBedsAvailable: 2,
      traumaLevel: 'Level 1 Cardiac & Trauma',
      availabilityStatus: 'LIMITED',
      isSimulatedData: true,
    },
    {
      id: 'hosp_fortis_nbv',
      name: 'Fortis Hospital — Nagarbhavi',
      shortName: 'Fortis Nagarbhavi',
      area: 'Nagarbhavi ORR',
      coord: { lat: 12.9598, lng: 77.5113 },
      emergencyBedsAvailable: 6,
      icuBedsAvailable: 3,
      traumaLevel: 'Level 1 Trauma Center',
      availabilityStatus: 'AVAILABLE',
      isSimulatedData: true,
    },
  ];
}

export const HOSPITAL_NODE_MAP: Record<string, string> = {
  hosp_sparsh_rr: 'n_sparsh_hosp',
  hosp_bgs_kengeri: 'n_bgs_hosp',
  hosp_vasavi: 'n_vasavi_hosp',
  hosp_sagar_bsk: 'n_sagar_hosp',
  hosp_fortis_nbv: 'n_fortis_hosp',
};

const SIGNAL_NODE_IDS = [
  'n_rnsit_gate',
  'n_channasandra_rd',
  'n_beml_5th',
  'n_ideal_homes',
  'n_rr_arch',
  'n_srinivasapura',
  'n_mylasandra',
  'n_global_village',
  'n_pattanagere',
  'n_kengeri_nice',
  'n_kengeri_ttmc',
  'n_nayandahalli',
  'n_srinivasanagara',
  'n_uttarahalli',
  'n_hosakerehalli',
  'n_chikkalasandra',
  'n_banashankari',
  'n_bgs_hosp',
];

export function buildBengaluruSignals(): TrafficSignal[] {
  const nodeMap = new Map(BENGALURU_NODES.map((n) => [n.id, n]));
  const now = new Date().toISOString();
  return SIGNAL_NODE_IDS.map((nodeId, idx) => {
    const node = nodeMap.get(nodeId)!;
    return {
      id: `SIG-RRN-${String(idx + 1).padStart(2, '0')}`,
      nodeId,
      name: node.name,
      corridor: node.area,
      coord: node.coord,
      state: 'NORMAL',
      onActiveRoute: false,
      routeDistanceMeters: null,
      sequenceOrder: null,
      distanceFromAmbulanceMeters: null,
      lastUpdated: now,
    };
  });
}

export function findNearestNodeId(coord: Coordinate): string {
  let bestId = BENGALURU_NODES[0].id;
  let bestDist = Infinity;
  for (const node of BENGALURU_NODES) {
    const d = haversineDistanceMeters(coord, node.coord);
    if (d < bestDist) {
      bestDist = d;
      bestId = node.id;
    }
  }
  return bestId;
}
