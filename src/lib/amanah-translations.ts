/**
 * Translation utility for team/amanah names to Arabic
 * Maps English team names to their Arabic equivalents
 */

const teamNameTranslations: Record<string, string> = {
  // Saudi Arabian Amanat (Municipalities)
  // Multiple variations for flexibility
  'makkah': 'أمانة العاصمة المقدسة',
  'Makkah Team': 'أمانة العاصمة المقدسة',
  'MAKKAH': 'أمانة العاصمة المقدسة',
  
  'Eastern Province': 'أمانة المنطقة الشرقية',
  'eastern province': 'أمانة المنطقة الشرقية',
  'Dammam Team': 'أمانة المنطقة الشرقية',
  
  'Al ahsa': 'أمانة محافظة الاحساء',
  'Al Ahsa': 'أمانة محافظة الاحساء',
  'al ahsa': 'أمانة محافظة الاحساء',
  'AL AHSA': 'أمانة محافظة الاحساء',
  'Hessa': 'أمانة محافظة الاحساء',
  'AlAhsa': 'أمانة محافظة الاحساء',
  
  'Altaif': 'أمانة محافظة الطائف',
  'Al Taif': 'أمانة محافظة الطائف',
  'Taif Team': 'أمانة محافظة الطائف',
  'taif': 'أمانة محافظة الطائف',
  'TAIF': 'أمانة محافظة الطائف',
  
  'Jeddah Team': 'أمانة محافظة جدة',
  'jeddah': 'أمانة محافظة جدة',
  'JEDDAH': 'أمانة محافظة جدة',
  'Jiddah': 'أمانة محافظة جدة',
  
  'Hafr Albatin': 'أمانة محافظة حفر الباطن',
  'Hafar Al Batin': 'أمانة محافظة حفر الباطن',
  'hafr albatin': 'أمانة محافظة حفر الباطن',
  'HAFR ALBATIN': 'أمانة محافظة حفر الباطن',
  'HafrAlbatin': 'أمانة محافظة حفر الباطن',
  
  'Albaha': 'أمانة منطقة الباحة',
  'Al Baha': 'أمانة منطقة الباحة',
  'Baha': 'أمانة منطقة الباحة',
  'baha': 'أمانة منطقة الباحة',
  'BAHA': 'أمانة منطقة الباحة',
  
  'Aljouf': 'أمانة منطقة الجوف',
  'AlJouf': 'أمانة منطقة الجوف',
  'Al Jouf': 'أمانة منطقة الجوف',
  'Jouf': 'أمانة منطقة الجوف',
  'jouf': 'أمانة منطقة الجوف',
  'JOUF': 'أمانة منطقة الجوف',
  'al jouf': 'أمانة منطقة الجوف',
  'ALJOUF': 'أمانة منطقة الجوف',
  
  'Riyadh': 'أمانة منطقة الرياض',
  'riyadh': 'أمانة منطقة الرياض',
  'RIYADH': 'أمانة منطقة الرياض',
  
  'Qassim Team': 'أمانة منطقة القصيم',
  'Al Qassim': 'أمانة منطقة القصيم',
  'qassim': 'أمانة منطقة القصيم',
  'QASSIM': 'أمانة منطقة القصيم',
  'Alqassim': 'أمانة منطقة القصيم',
  
  'Madina Team': 'أمانة منطقة المدينة المنورة',
  'Al Madinah': 'أمانة منطقة المدينة المنورة',
  'Medina': 'أمانة منطقة المدينة المنورة',
  'madinah': 'أمانة منطقة المدينة المنورة',
  'MADINAH': 'أمانة منطقة المدينة المنورة',
  
  'Tabouk': 'أمانة منطقة تبوك',
  'Tabuk': 'أمانة منطقة تبوك',
  'tabouk': 'أمانة منطقة تبوك',
  'TABOUK': 'أمانة منطقة تبوك',
  'tabuk': 'أمانة منطقة تبوك',
  
  'Jazan': 'أمانة منطقة جازان',
  'Jizan': 'أمانة منطقة جازان',
  'jazan': 'أمانة منطقة جازان',
  'JAZAN': 'أمانة منطقة جازان',
  'jizan': 'أمانة منطقة جازان',
  
  'Hail Team': 'أمانة منطقة حائل',
  'Hael': 'أمانة منطقة حائل',
  'hail': 'أمانة منطقة حائل',
  'HAIL': 'أمانة منطقة حائل',
  
  'Asir': 'أمانة منطقة عسير',
  'Aseer': 'أمانة منطقة عسير',
  'asir': 'أمانة منطقة عسير',
  'ASIR': 'أمانة منطقة عسير',
  
  'Najran': 'أمانة منطقة نجران',
  'najran': 'أمانة منطقة نجران',
  'NAJRAN': 'أمانة منطقة نجران',
  
  'Northern Boarders': 'أمانة منطقة الحدود الشمالية',
  'Northern Borders': 'أمانة منطقة الحدود الشمالية',
  'northern boarders': 'أمانة منطقة الحدود الشمالية',
  'northern borders': 'أمانة منطقة الحدود الشمالية',
  'NORTHERN BOARDERS': 'أمانة منطقة الحدود الشمالية',
  'NORTHERN BORDERS': 'أمانة منطقة الحدود الشمالية',
  
  // Common team/amanah names - legacy support
  'Team A': 'الفريق أ',
  'Team B': 'الفريق ب',
  'Team C': 'الفريق ج',
  'Team D': 'الفريق د',
  'Team E': 'الفريق هـ',
  'Team F': 'الفريق و',
  'Team G': 'الفريق ز',
  'Team H': 'الفريق ح',
  
  // Default fallback for unknown teams
  'Unknown': 'غير معروف',
};

/**
 * Translates a team name from English to Arabic
 * @param teamName - The English team name to translate
 * @returns The Arabic translation if found, otherwise returns the original name
 */
export function translateTeamNameToArabic(teamName: string | undefined | null): string {
  if (!teamName) {
    return '';
  }

  // Check for exact match first
  if (teamNameTranslations[teamName]) {
    return teamNameTranslations[teamName];
  }

  // Check for case-insensitive match
  const normalizedName = teamName.toLowerCase().trim();
  const matchingKey = Object.keys(teamNameTranslations).find(
    key => key.toLowerCase().trim() === normalizedName
  );

  if (matchingKey) {
    return teamNameTranslations[matchingKey];
  }

  // Try to match with spaces normalized (e.g., "Al Jouf" vs "AlJouf")
  const noSpacesName = teamName.replace(/\s+/g, '').toLowerCase();
  const matchingKeyNoSpaces = Object.keys(teamNameTranslations).find(
    key => key.replace(/\s+/g, '').toLowerCase() === noSpacesName
  );

  if (matchingKeyNoSpaces) {
    return teamNameTranslations[matchingKeyNoSpaces];
  }

  // If no translation found, return the original name
  // This allows the app to work even without translations defined
  return teamName;
}

/**
 * Adds a new team name translation at runtime
 * Useful for dynamically adding translations without modifying this file
 * @param englishName - The English team name
 * @param arabicName - The Arabic translation
 */
export function addTeamTranslation(englishName: string, arabicName: string): void {
  teamNameTranslations[englishName] = arabicName;
}

/**
 * Gets all available translations
 * @returns Object containing all team name translations
 */
export function getAllTranslations(): Record<string, string> {
  return { ...teamNameTranslations };
}

/**
 * Checks if a translation exists for a given team name
 * @param teamName - The team name to check
 * @returns true if translation exists, false otherwise
 */
export function hasTranslation(teamName: string): boolean {
  return !!teamNameTranslations[teamName] || 
         !!Object.keys(teamNameTranslations).find(
           key => key.toLowerCase() === teamName.toLowerCase()
         );
}
