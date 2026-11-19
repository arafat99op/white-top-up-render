/* White Top Up — catalog + default settings.
   Single source of truth for the Firestore seed (functions/seed.js) and the
   auto-seed that runs on the first storefront visit. 54 packages, real prices.
   Category order here is the order tabs/tiles show them in the shop. */

'use strict';

const CATEGORY_ORDER = [
  'diamond',
  'deshioffer',
  'membership',
  'weeklylite',
  'levelup',
  'likes',
  'likeoffer',
  'mysterybox',
];

// id: stable numeric id (also the Firestore document id, as a string).
// sort: order inside its category. limit: Deshi Offer purchase limits
// (enforced server-side in handler.js) — { max, windowDays }.
const PACKAGES = [
  // ---- ID Code diamonds (17) ----
  { id: 1, category: 'diamond', name: '25 Diamond', diamonds: 25, price: 24, oldPrice: null, badge: null, note: null, sort: 1, active: true },
  { id: 2, category: 'diamond', name: '50 Diamond', diamonds: 50, price: 40, oldPrice: null, badge: null, note: null, sort: 2, active: true },
  { id: 3, category: 'diamond', name: '100 Diamond', diamonds: 100, price: 73, oldPrice: null, badge: null, note: null, sort: 3, active: true },
  { id: 4, category: 'diamond', name: '115 Diamond', diamonds: 115, price: 82, oldPrice: null, badge: 'Popular', note: null, sort: 4, active: true },
  { id: 5, category: 'diamond', name: '240 Diamond', diamonds: 240, price: 160, oldPrice: null, badge: null, note: null, sort: 5, active: true },
  { id: 6, category: 'diamond', name: '355 Diamond', diamonds: 355, price: 240, oldPrice: null, badge: null, note: null, sort: 6, active: true },
  { id: 7, category: 'diamond', name: '405 Diamond', diamonds: 405, price: 280, oldPrice: null, badge: null, note: null, sort: 7, active: true },
  { id: 8, category: 'diamond', name: '505 Diamond', diamonds: 505, price: 350, oldPrice: null, badge: null, note: null, sort: 8, active: true },
  { id: 9, category: 'diamond', name: '610 Diamond', diamonds: 610, price: 400, oldPrice: null, badge: null, note: null, sort: 9, active: true },
  { id: 10, category: 'diamond', name: '725 Diamond', diamonds: 725, price: 490, oldPrice: null, badge: null, note: null, sort: 10, active: true },
  { id: 11, category: 'diamond', name: '1090 Diamond', diamonds: 1090, price: 730, oldPrice: null, badge: null, note: null, sort: 11, active: true },
  { id: 12, category: 'diamond', name: '1240 Diamond', diamonds: 1240, price: 805, oldPrice: null, badge: null, note: null, sort: 12, active: true },
  { id: 13, category: 'diamond', name: '1850 Diamond', diamonds: 1850, price: 1220, oldPrice: null, badge: null, note: null, sort: 13, active: true },
  { id: 14, category: 'diamond', name: '2530 Diamond', diamonds: 2530, price: 1605, oldPrice: null, badge: null, note: null, sort: 14, active: true },
  { id: 15, category: 'diamond', name: '5060 Diamond', diamonds: 5060, price: 3205, oldPrice: null, badge: null, note: null, sort: 15, active: true },
  { id: 16, category: 'diamond', name: '6300 Diamond', diamonds: 6300, price: 4030, oldPrice: null, badge: null, note: null, sort: 16, active: true },
  { id: 17, category: 'diamond', name: '10120 Diamond', diamonds: 10120, price: 6350, oldPrice: null, badge: null, note: null, sort: 17, active: true },

  // ---- Deshi Offer (3) — limits enforced server-side ----
  { id: 18, category: 'deshioffer', name: 'Monthly Membership', diamonds: 2600, price: 750, oldPrice: 770, badge: 'দেশি অফার', note: '৭ দিনে ১ বার নেওয়া যায়', sort: 1, active: true, limit: { max: 1, windowDays: 7 } },
  { id: 19, category: 'deshioffer', name: 'Weekly Membership', diamonds: 450, price: 145, oldPrice: 150, badge: 'দেশি অফার', note: '৭ দিনে ১ বার নেওয়া যায়', sort: 2, active: true, limit: { max: 1, windowDays: 7 } },
  { id: 20, category: 'deshioffer', name: 'Weekly Lite', diamonds: 100, price: 36, oldPrice: null, badge: 'দেশি অফার', note: '২ দিনে সর্বোচ্চ ৫ বার', sort: 3, active: true, limit: { max: 5, windowDays: 2 } },

  // ---- Membership (3 base) ----
  { id: 21, category: 'membership', name: 'Weekly Membership', diamonds: 450, price: 150, oldPrice: null, badge: null, note: 'মোট 450💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 1, active: true },
  { id: 22, category: 'membership', name: 'Monthly Membership', diamonds: 2600, price: 770, oldPrice: null, badge: null, note: 'মোট 2600💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 2, active: true },
  { id: 23, category: 'membership', name: 'Weekly + Monthly Combo', diamonds: 3050, price: 899, oldPrice: 920, badge: 'Combo Offer', note: 'দুটো মেম্বারশিপ একসাথে — সবচেয়ে সাশ্রয়ী', sort: 3, active: true },

  // ---- Weekly + Monthly bundles (8) ----
  { id: 24, category: 'membership', name: 'Weekly 1x', diamonds: 450, price: 155, oldPrice: null, badge: null, note: 'মোট 450💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 4, active: true },
  { id: 25, category: 'membership', name: 'Weekly 2x', diamonds: 900, price: 305, oldPrice: null, badge: null, note: 'মোট 900💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 5, active: true },
  { id: 26, category: 'membership', name: 'Weekly 4x', diamonds: 1800, price: 612, oldPrice: null, badge: null, note: 'মোট 1800💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 6, active: true },
  { id: 27, category: 'membership', name: 'Weekly 10x', diamonds: 4500, price: 1580, oldPrice: null, badge: null, note: 'মোট 4500💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 7, active: true },
  { id: 28, category: 'membership', name: 'Monthly 1x', diamonds: 2600, price: 775, oldPrice: null, badge: null, note: 'মোট 2600💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 8, active: true },
  { id: 29, category: 'membership', name: 'Monthly 2x', diamonds: 5200, price: 1535, oldPrice: null, badge: null, note: 'মোট 5200💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 9, active: true },
  { id: 30, category: 'membership', name: 'Monthly 4x', diamonds: 10400, price: 3099, oldPrice: null, badge: null, note: 'মোট 10400💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 10, active: true },
  { id: 31, category: 'membership', name: 'Monthly 10x', diamonds: 26000, price: 7850, oldPrice: null, badge: null, note: 'মোট 26000💎 — প্রতিদিন লগইন করে ক্লেইম', sort: 11, active: true },

  // ---- Weekly Lite (5) ----
  { id: 32, category: 'weeklylite', name: 'Weekly Lite', diamonds: 100, price: 35, oldPrice: null, badge: null, note: 'মোট 100💎 — ছোট মেম্বারশিপ', sort: 1, active: true },
  { id: 33, category: 'weeklylite', name: 'Weekly Lite 1x', diamonds: 100, price: 40, oldPrice: null, badge: null, note: 'মোট 100💎 — ছোট মেম্বারশিপ', sort: 2, active: true },
  { id: 34, category: 'weeklylite', name: 'Weekly Lite 2x', diamonds: 200, price: 79, oldPrice: null, badge: null, note: 'মোট 200💎 — ছোট মেম্বারশিপ', sort: 3, active: true },
  { id: 35, category: 'weeklylite', name: 'Weekly Lite 3x', diamonds: 300, price: 118, oldPrice: null, badge: null, note: 'মোট 300💎 — ছোট মেম্বারশিপ', sort: 4, active: true },
  { id: 36, category: 'weeklylite', name: 'Weekly Lite 10x', diamonds: 1000, price: 411, oldPrice: null, badge: null, note: 'মোট 1000💎 — ছোট মেম্বারশিপ', sort: 5, active: true },

  // ---- Level Up Pass, level-wise (7) ----
  { id: 37, category: 'levelup', name: 'Level 6', diamonds: null, price: 45, oldPrice: null, badge: null, note: 'লেভেল ৬ এর রিওয়ার্ড আনলক হয়', sort: 1, active: true },
  { id: 38, category: 'levelup', name: 'Level 10', diamonds: null, price: 75, oldPrice: null, badge: null, note: 'লেভেল ১০ এর রিওয়ার্ড আনলক হয়', sort: 2, active: true },
  { id: 39, category: 'levelup', name: 'Level 15', diamonds: null, price: 80, oldPrice: null, badge: null, note: 'লেভেল ১৫ এর রিওয়ার্ড আনলক হয়', sort: 3, active: true },
  { id: 40, category: 'levelup', name: 'Level 20', diamonds: null, price: 80, oldPrice: null, badge: null, note: 'লেভেল ২০ এর রিওয়ার্ড আনলক হয়', sort: 4, active: true },
  { id: 41, category: 'levelup', name: 'Level 25', diamonds: null, price: 85, oldPrice: null, badge: null, note: 'লেভেল ২৫ এর রিওয়ার্ড আনলক হয়', sort: 5, active: true },
  { id: 42, category: 'levelup', name: 'Level 30', diamonds: null, price: 105, oldPrice: null, badge: null, note: 'লেভেল ৩০ এর রিওয়ার্ড আনলক হয়', sort: 6, active: true },
  { id: 43, category: 'levelup', name: 'Level All', diamonds: null, price: 430, oldPrice: null, badge: null, note: 'সব লেভেলের রিওয়ার্ড আনলক হয়', sort: 7, active: true },

  // ---- Likes (2) ----
  { id: 44, category: 'likes', name: '100 Like', diamonds: null, price: 6, oldPrice: null, badge: null, note: 'তোমার প্রোফাইলে ১০০ লাইক', sort: 1, active: true },
  { id: 45, category: 'likes', name: '200 Like', diamonds: null, price: 10, oldPrice: null, badge: null, note: 'তোমার প্রোফাইলে ২০০ লাইক', sort: 2, active: true },

  // ---- Like Offer (3) — ALL text in English ----
  { id: 46, category: 'likeoffer', name: '2000 Likes in 10 Days', diamonds: null, price: 90, oldPrice: null, badge: null, note: '200 likes every day for 10 days', sort: 1, active: true },
  { id: 47, category: 'likeoffer', name: '6000 Likes in 30 Days', diamonds: null, price: 260, oldPrice: null, badge: null, note: '200 likes every day for 30 days', sort: 2, active: true },
  { id: 48, category: 'likeoffer', name: '12000 Likes in 60 Days', diamonds: null, price: 500, oldPrice: null, badge: null, note: '200 likes every day for 60 days', sort: 3, active: true },

  // ---- Mystery Box (6) — never invent box contents ----
  { id: 49, category: 'mysterybox', name: '২০ টাকার মিস্ট্রি বক্স', diamonds: null, price: 20, oldPrice: null, badge: null, note: 'সারপ্রাইজ গিফট বক্স', sort: 1, active: true },
  { id: 50, category: 'mysterybox', name: '৫০ টাকার মিস্ট্রি বক্স', diamonds: null, price: 50, oldPrice: null, badge: null, note: 'সারপ্রাইজ গিফট বক্স', sort: 2, active: true },
  { id: 51, category: 'mysterybox', name: '১০০ টাকার মিস্ট্রি বক্স', diamonds: null, price: 100, oldPrice: null, badge: null, note: 'সারপ্রাইজ গিফট বক্স', sort: 3, active: true },
  { id: 52, category: 'mysterybox', name: '১৯৯ টাকার মিস্ট্রি বক্স', diamonds: null, price: 199, oldPrice: null, badge: null, note: 'সারপ্রাইজ গিফট বক্স', sort: 4, active: true },
  { id: 53, category: 'mysterybox', name: '৪৯৯ টাকার মিস্ট্রি বক্স', diamonds: null, price: 499, oldPrice: null, badge: null, note: 'সারপ্রাইজ গিফট বক্স', sort: 5, active: true },
  { id: 54, category: 'mysterybox', name: '৯৯৯ টাকার মিস্ট্রি বক্স', diamonds: null, price: 999, oldPrice: null, badge: null, note: 'সারপ্রাইজ গিফট বক্স', sort: 6, active: true },
];

const DEFAULT_SETTINGS = {
  notice: 'Weekly + Monthly Combo Offer চলছে — দুটো একসাথে নিলেই সরাসরি ছাড়!',
  deliveryNote: 'পেমেন্ট কনফার্ম হলে ১–৫ মিনিটে ডেলিভারি',
  payBkash: '01327762121',
  payNagad: '01781018186',
  whatsapp: 'https://wa.me/8801781018186',
  telegram: '',
  facebook: '',
  leakApiKey: '',
  uidCheckEnabled: false,
};

module.exports = { CATEGORY_ORDER, PACKAGES, DEFAULT_SETTINGS };
