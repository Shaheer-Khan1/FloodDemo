const ENGLISH_TO_ARABIC_AMANAH: Record<string, string> = {
  "albaha": "أمانة منطقة الباحة",
  "aljouf": "أمانة منطقة الجوف",
  "aseer": "أمانة منطقة عسير",
  "dammam team": "أمانة المنطقة الشرقية",
  "dammam": "أمانة المنطقة الشرقية",
  "eastern": "أمانة المنطقة الشرقية",
  "hafar al batin": "أمانة محافظة حفر الباطن",
  "hafar": "أمانة محافظة حفر الباطن",
  "hail team": "أمانة منطقة حائل",
  "hail": "أمانة منطقة حائل",
  "hessa": "أمانة محافظة الاحساء",
  "hessa team": "أمانة محافظة الاحساء",
  "jazan": "أمانة منطقة جازان",
  "jeddah team": "أمانة محافظة جدة",
  "jeddah": "أمانة محافظة جدة",
  "madina team": "أمانة منطقة المدينة المنورة",
  "madina": "أمانة منطقة المدينة المنورة",
  "makkah team": "أمانة العاصمة المقدسة",
  "makkah": "أمانة العاصمة المقدسة",
  "najran": "أمانة منطقة نجران",
  "northern borders": "أمانة منطقة الحدود الشمالية",
  "qassim team": "أمانة منطقة القصيم",
  "qassim": "أمانة منطقة القصيم",
  "taif team": "أمانة محافظة الطائف",
  "taif": "أمانة محافظة الطائف",

};

export function translateTeamNameToArabic(rawName?: string | null): string | null {
  if (!rawName) return null;
  const normalized = rawName.trim().toLowerCase();
  for (const [keyword, translation] of Object.entries(ENGLISH_TO_ARABIC_AMANAH)) {
    if (keyword && normalized.includes(keyword)) {
      return translation;
    }
  }
  return null;
}

