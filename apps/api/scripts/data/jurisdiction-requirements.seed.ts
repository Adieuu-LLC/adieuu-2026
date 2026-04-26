/**
 * Seed rows for `jurisdiction_requirements` (from regulatory compliance matrix).
 * Run `bun run scripts/seed-jurisdiction-requirements.ts` to upsert into MongoDB.
 *
 * Jurisdiction codes match `UserGeo.jurisdiction` (e.g. US-TN, GB, EU).
 */

import type { JurisdictionRequirementDocument } from '../../src/models/jurisdiction-requirement';

type SeedRow = Omit<
  JurisdictionRequirementDocument,
  '_id' | 'createdAt' | 'updatedAt'
>;

const M = {
  std: [
    'email_age_check',
    'facial_age_estimation',
    'id_scan_face_match',
  ] as const,
  idOnly: ['id_scan_face_match'] as const,
  euDsa: [
    'email_age_check',
    'facial_age_estimation',
    'id_scan_face_match',
  ] as const,
  fr: [
    'email_age_check',
    'facial_age_estimation',
    'id_scan_face_match',
    'double_blind',
  ] as const,
  de: ['facial_age_estimation', 'id_scan_face_match'] as const,
  it: ['double_blind_facial_age_estimation'] as const,
  intl: [
    'email_age_check',
    'facial_age_estimation',
    'id_scan_face_match',
    'credit_card',
  ] as const,
  uk: [
    'email_age_check',
    'facial_age_estimation',
    'id_scan_face_match',
    'credit_card',
    'mobile_phone',
  ] as const,
};

function usState(
  code: string,
  name: string,
  law: string,
  enact: string,
  ag: string,
  compatibleMethods: string[],
  extraReq: string[] = ['age_verification'],
  notes?: string,
  status: SeedRow['status'] = 'enacted',
): SeedRow {
  return {
    jurisdiction: code,
    jurisdictionName: name,
    region: 'United States',
    requirements: extraReq,
    compatibleMethods: [...compatibleMethods],
    regulatoryBody: ag,
    legislation: [{ name: law, enactmentDate: enact }],
    notes,
    status,
  };
}

const US: SeedRow[] = [
  usState('US-AL', 'Alabama', 'HB164', '1st October 2024', 'State of Alabama AG', [...M.std]),
  usState('US-AZ', 'Arizona', 'HB2112', '26th September 2025', 'State of Arizona AG', [...M.std]),
  usState(
    'US-AR', 'Arkansas', 'SB66 (Act 612)', '31st July 2023', 'State of Arkansas AG',
    [...M.idOnly],
    ['age_verification'],
    'Any method other than government-issued ID must meet Identity Assurance Level 2 (IAL2).',
  ),
  usState(
    'US-FL', 'Florida', 'HB3', '1st January 2025', 'State of Florida AG',
    [...M.std],
    ['age_verification', 'anonymous_age_verification'],
    'Anonymous age verification must be provided by a wholly-owned US entity.',
  ),
  usState('US-GA', 'Georgia', 'SB351', '1st July 2025', 'State of Georgia AG', [...M.std]),
  usState('US-ID', 'Idaho', 'H498', '1st July 2024', 'State of Idaho AG', [...M.std]),
  usState('US-IN', 'Indiana', 'SB17', '16th August 2024', 'State of Indiana AG', [...M.std]),
  usState('US-KS', 'Kansas', 'SB394', '1st July 2024', 'State of Kansas AG', [...M.std]),
  usState('US-KY', 'Kentucky', 'HB 278 / KRS 436.001 to 436.009', '15th July 2024', 'State of Kentucky AG', [...M.std]),
  usState('US-LA', 'Louisiana', 'HB142', '1st January 2023', 'State of Louisiana AG', [...M.std]),
  usState('US-MS', 'Mississippi', 'SB2346', '1st July 2023', 'State of Mississippi AG', [...M.std]),
  usState('US-MO', 'Missouri', 'MO 15 CSR 60-18.010-060', '30th November 2025', 'State of Missouri AG', [...M.std]),
  usState('US-MT', 'Montana', 'SB544', '1st January 2024', 'State of Montana AG', [...M.std]),
  usState('US-NE', 'Nebraska', 'LB1092', '18th July 2024', 'State of Nebraska AG', [...M.std]),
  usState('US-NC', 'North Carolina', 'HB8', '1st January 2024', 'State of North Carolina AG', [...M.std]),
  usState('US-ND', 'North Dakota', 'SB2380', '1st August 2026', 'State of North Dakota AG', [...M.std]),
  usState(
    'US-OH', 'Ohio', 'HB96', '30th September 2025', 'State of Ohio AG',
    [...M.std],
    ['age_verification', 'reverification_2_years', 'geofence_until_verified'],
    'Ongoing accounts: reverification every 2 years. Sites must geofence Ohio users via licensed location providers until verification is complete.',
  ),
  usState('US-OK', 'Oklahoma', 'SB1959', '1st November 2024', 'State of Oklahoma AG', [...M.std]),
  usState('US-SC', 'South Carolina', 'HB3424', '1st January 2025', 'State of South Carolina AG', [...M.std]),
  usState('US-SD', 'South Dakota', 'HB1053', '1st July 2025', 'State of South Dakota AG', [...M.std]),
  usState(
    'US-TN', 'Tennessee', 'SB1792', '13th January 2025', 'State of Tennessee AG',
    [...M.std],
    ['age_verification', 'reauthentication_session_or_hour'],
    'Reverification required every session or hour, whichever is shorter.',
  ),
  usState('US-TX', 'Texas', 'HB1181', '19th September 2023', 'State of Texas AG', [...M.std]),
  usState('US-UT', 'Utah', 'SB287', '3rd May 2023', 'State of Utah AG', [...M.std]),
  usState('US-WV', 'West Virginia', 'HB4412', '12th June 2026', 'State of West Virginia AG', [...M.std]),
  usState('US-VA', 'Virginia', 'SB1515', '1st July 2023', 'State of Virginia AG', [...M.std]),
  usState('US-WY', 'Wyoming', 'HB43', '1st July 2025', 'State of Wyoming AG', [...M.std]),
];

const EU_AND_ROW: SeedRow[] = [
  {
    jurisdiction: 'EU',
    jurisdictionName: 'European Union (Digital Services Act)',
    region: 'European Union',
    requirements: ['age_assurance', 'heightened_vlop_requirements'],
    compatibleMethods: [...M.euDsa],
    regulatoryBody: 'European Commission',
    legislation: [
      { name: 'Digital Services Act', enactmentDate: 'Phased, from August 2023' },
    ],
    notes:
      'Active legal challenges; member-state domestic requirements may also apply. Commission direction: age assurance may use upcoming EU Digital Identity Wallets.',
    status: 'enacted',
  },
  {
    jurisdiction: 'FR',
    jurisdictionName: 'France',
    region: 'European Union',
    requirements: [
      'age_verification',
      'double_blind_method_available',
      'reauthentication_session_or_hour',
    ],
    compatibleMethods: [...M.fr],
    regulatoryBody: 'Arcom',
    legislation: [
      {
        name: "Sécurité et Régulation de l'Espace Numérique (SREN)",
        enactmentDate: '11th April 2025 (end of 3-month transitional period)',
      },
    ],
    notes:
      'Non-French European sites are now in-scope. Email cannot be used as part of a background check; user must be able to choose a double-blind method.',
    status: 'enacted',
  },
  {
    jurisdiction: 'DE',
    jurisdictionName: 'Germany',
    region: 'European Union',
    requirements: ['age_verification', 'kjm_approved_methods_only'],
    compatibleMethods: [...M.de],
    regulatoryBody: 'KJM',
    legislation: [{ name: 'Jugendmedienschutz-Staatsvertrag (JMStV)', enactmentDate: '1st May 2021 (latest amendment)' }],
    status: 'enacted',
  },
  {
    jurisdiction: 'IT',
    jurisdictionName: 'Italy',
    region: 'European Union',
    requirements: [
      'age_verification',
      'double_blind_only',
      'reauthentication_session_or_45min_inactivity',
    ],
    compatibleMethods: [...M.it],
    regulatoryBody: 'Agcom',
    legislation: [{ name: 'Decreto Caivano (Article 13-bis)', enactmentDate: 'See Agcom enforcement updates' }],
    notes:
      'Italian-established sites: 6 months from 12 Nov 2025. Non-Italian established: 3 months from 1 Feb 2026.',
    status: 'enacted',
  },
  {
    jurisdiction: 'AU',
    jurisdictionName: 'Australia',
    region: 'Rest of World',
    requirements: ['appropriate_age_assurance'],
    compatibleMethods: [...M.intl],
    regulatoryBody: 'eSafety Commissioner',
    legislation: [
      { name: 'Online Safety Act — Industry Codes', enactmentDate: '9th March 2026' },
    ],
    notes: 'See industry codes framework; age assurance (page 79).',
    status: 'enacted',
  },
  {
    jurisdiction: 'CA-PROPOSED',
    jurisdictionName: 'Canada (proposed)',
    region: 'Rest of World',
    requirements: ['age_verification'],
    compatibleMethods: [],
    legislation: [
      { name: 'Protecting Young Persons from Exposure to Pornography Act (Bill S-209)', enactmentDate: 'TBC' },
    ],
    notes: 'Bill not yet passed; requirements TBC.',
    status: 'proposed',
  },
  {
    jurisdiction: 'IN',
    jurisdictionName: 'India',
    region: 'Rest of World',
    requirements: ['age_verification'],
    compatibleMethods: [...M.intl],
    regulatoryBody: 'Ministry of Electronics and Information Technology (MeitY)',
    legislation: [
      { name: 'Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules', enactmentDate: '2021' },
    ],
    notes: 'Some state variation; broadly a national requirement.',
    status: 'enacted',
  },
  {
    jurisdiction: 'JP',
    jurisdictionName: 'Japan',
    region: 'Rest of World',
    requirements: ['age_verification', 'filtering_mno_isp'],
    compatibleMethods: [...M.intl],
    regulatoryBody: 'Ministry of Internal Affairs and Communications',
    legislation: [
      { name: "Act on Establishment of Enhanced Environment for Youth's Safe and Secure Internet Use", enactmentDate: '2008' },
    ],
    notes: 'Core filtering responsibility lies with MNOs/ISPs; platforms may add age assurance.',
    status: 'enacted',
  },
  {
    jurisdiction: 'GB',
    jurisdictionName: 'United Kingdom',
    region: 'Rest of World',
    requirements: ['highly_effective_age_assurance'],
    compatibleMethods: [...M.uk],
    regulatoryBody: 'Ofcom',
    legislation: [{ name: 'Online Safety Act', enactmentDate: '25th July 2025' }],
    status: 'enacted',
  },
  {
    jurisdiction: 'BR',
    jurisdictionName: 'Brazil',
    region: 'Rest of World',
    requirements: ['reliable_age_and_identity_verification'],
    compatibleMethods: [...M.intl],
    regulatoryBody: 'Autoridade Nacional de Proteção de Dados (ANPD)',
    legislation: [{ name: 'PL 3910/2025', enactmentDate: '17th March 2026' }],
    status: 'enacted',
  },
];

export const JURISDICTION_REQUIREMENT_SEED: SeedRow[] = [...US, ...EU_AND_ROW];
