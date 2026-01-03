/**
 * Translation utility for team/amanah names to Arabic
 * Maps English team names to their Arabic equivalents
 */

const teamNameTranslations: Record<string, string> = {
  // Common team/amanah names - add more as needed
  'Team A': 'الفريق أ',
  'Team B': 'الفريق ب',
  'Team C': 'الفريق ج',
  'Team D': 'الفريق د',
  'Team E': 'الفريق هـ',
  'Team F': 'الفريق و',
  'Team G': 'الفريق ز',
  'Team H': 'الفريق ح',
  
  // Example amanah names (trustee/guardian areas)
  'North District': 'المنطقة الشمالية',
  'South District': 'المنطقة الجنوبية',
  'East District': 'المنطقة الشرقية',
  'West District': 'المنطقة الغربية',
  'Central District': 'المنطقة الوسطى',
  
  // Add more translations as needed based on your actual team names
  'Installation Team': 'فريق التركيب',
  'Verification Team': 'فريق التحقق',
  'Maintenance Team': 'فريق الصيانة',
  'Support Team': 'فريق الدعم',
  
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
  const normalizedName = teamName.toLowerCase();
  const matchingKey = Object.keys(teamNameTranslations).find(
    key => key.toLowerCase() === normalizedName
  );

  if (matchingKey) {
    return teamNameTranslations[matchingKey];
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

