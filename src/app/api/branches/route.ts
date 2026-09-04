// GET /api/branches — Arvest branch directory (static, private-bank network).
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth } from '@/lib/api';

const BRANCHES = [
  { id: 'bentonville', name: 'Bentonville Private Banking Center', address: '100 NW 2nd St, Bentonville, AR 72712', phone: '(479) 555-0110', hours: 'Mon–Fri 9:00–5:00', lat: 36.3729, lng: -94.2088, services: ['Private client suite', 'Safe deposit boxes', 'Wealth advisory'] },
  { id: 'fayetteville', name: 'Fayetteville Private Client Office', address: '1 E Center St, Fayetteville, AR 72701', phone: '(479) 555-0121', hours: 'Mon–Fri 9:00–5:00', lat: 36.0626, lng: -94.1574, services: ['Loan origination', 'Trust services'] },
  { id: 'rogers', name: 'Rogers Pinnacle Branch', address: '2300 S Walton Blvd, Rogers, AR 72758', phone: '(479) 555-0132', hours: 'Mon–Sat 9:00–6:00', lat: 36.3320, lng: -94.1185, services: ['Drive-through', 'Notary', 'Foreign currency'] },
  { id: 'springdale', name: 'Springdale Financial Center', address: '2909 W Sunset Ave, Springdale, AR 72762', phone: '(479) 555-0143', hours: 'Mon–Fri 9:00–5:00', lat: 36.1867, lng: -94.1288, services: ['Business banking', 'Night deposit'] },
  { id: 'little-rock', name: 'Little Rock Trust & Wealth', address: '425 W Capitol Ave, Little Rock, AR 72201', phone: '(501) 555-0154', hours: 'Mon–Fri 9:00–5:00', lat: 34.7465, lng: -92.2896, services: ['Estate planning', 'Investment desk'] },
  { id: 'fort-smith', name: 'Fort Smith Regional Office', address: '6800 Dallas St, Fort Smith, AR 72903', phone: '(479) 555-0165', hours: 'Mon–Fri 9:00–5:00', lat: 35.3859, lng: -94.3985, services: ['Mortgage center'] },
  { id: 'jonesboro', name: 'Jonesboro Banking Center', address: '2900 S Caraway Rd, Jonesboro, AR 72401', phone: '(870) 555-0176', hours: 'Mon–Fri 9:00–5:00', lat: 35.8423, lng: -90.7043, services: ['ATM superzone', 'Coin counter'] },
  { id: 'hot-springs', name: 'Hot Springs Private Office', address: '3405 Central Ave, Hot Springs, AR 71913', phone: '(501) 555-0187', hours: 'Mon–Fri 9:00–4:30', lat: 34.5037, lng: -93.0552, services: ['Concierge appointments'] },
];

export const GET = handler(async (req: NextRequest) => {
  await requireAuth(req);
  return ok({ branches: BRANCHES });
});
