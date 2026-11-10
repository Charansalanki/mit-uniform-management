/**
 * MIT MYSORE OFFICIAL COURSE & GENDER GARMENT MATRIX
 * Automatically maps (Course + Gender) to the exact required Garment Cards & Tailor Measurements
 */

export const ALPHA_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;
export const WAIST_SIZES = ['28"', '30"', '32"', '34"', '36"', '38"', '40"', '42"', '44"'] as const;

export type AlphaSize = typeof ALPHA_SIZES[number];
export type WaistSize = typeof WAIST_SIZES[number];

export interface SizeGuideRow {
  size: string;
  [key: string]: string;
}

export const SIZE_GUIDE_CHARTS: Record<string, SizeGuideRow[]> = {
  ALPHA_MALE_SHIRT: [
    { size: 'XS', chest: '36"', shoulder: '16.5"', sleeve: '23.5"', collar: '14.5"', length: '27"' },
    { size: 'S', chest: '38"', shoulder: '17.0"', sleeve: '24.0"', collar: '15.0"', length: '28"' },
    { size: 'M', chest: '40"', shoulder: '17.5"', sleeve: '24.5"', collar: '15.5"', length: '29"' },
    { size: 'L', chest: '42"', shoulder: '18.5"', sleeve: '25.0"', collar: '16.0"', length: '30"' },
    { size: 'XL', chest: '44"', shoulder: '19.0"', sleeve: '25.5"', collar: '16.5"', length: '31"' },
    { size: 'XXL', chest: '46"', shoulder: '20.0"', sleeve: '26.0"', collar: '17.0"', length: '31.5"' },
    { size: 'XXXL', chest: '48"', shoulder: '21.0"', sleeve: '26.5"', collar: '17.5"', length: '32"' }
  ],
  ALPHA_FEMALE_TOP: [
    { size: 'XS', bust: '32"', shoulder: '13.5"', sleeve: '16.0"', length: '36"' },
    { size: 'S', bust: '34"', shoulder: '14.0"', sleeve: '16.5"', length: '37"' },
    { size: 'M', bust: '36"', shoulder: '14.5"', sleeve: '17.0"', length: '38"' },
    { size: 'L', bust: '38"', shoulder: '15.0"', sleeve: '17.5"', length: '39"' },
    { size: 'XL', bust: '40"', shoulder: '15.5"', sleeve: '18.0"', length: '40"' },
    { size: 'XXL', bust: '42"', shoulder: '16.0"', sleeve: '18.5"', length: '41"' },
    { size: 'XXXL', bust: '44"', shoulder: '16.5"', sleeve: '19.0"', length: '41.5"' }
  ],
  WAIST_BOTTOM: [
    { size: '28"', waist: '28"', hip: '35"', length: '40"', inseam: '29"' },
    { size: '30"', waist: '30"', hip: '37"', length: '40.5"', inseam: '30"' },
    { size: '32"', waist: '32"', hip: '39"', length: '41"', inseam: '30.5"' },
    { size: '34"', waist: '34"', hip: '41"', length: '41.5"', inseam: '31"' },
    { size: '36"', waist: '36"', hip: '43"', length: '42"', inseam: '31"' },
    { size: '38"', waist: '38"', hip: '45"', length: '42"', inseam: '31.5"' },
    { size: '40"', waist: '40"', hip: '47"', length: '42.5"', inseam: '31.5"' },
    { size: '42"', waist: '42"', hip: '49"', length: '42.5"', inseam: '32"' },
    { size: '44"', waist: '44"', hip: '51"', length: '43"', inseam: '32"' }
  ],
  ALPHA_COAT: [
    { size: 'XS', chestOrBust: '36"', shoulder: '16.0"', sleeve: '23.5"', length: '27"', waist: '32"' },
    { size: 'S', chestOrBust: '38"', shoulder: '16.5"', sleeve: '24.0"', length: '28"', waist: '34"' },
    { size: 'M', chestOrBust: '40"', shoulder: '17.5"', sleeve: '24.5"', length: '29"', waist: '36"' },
    { size: 'L', chestOrBust: '42"', shoulder: '18.5"', sleeve: '25.0"', length: '30"', waist: '38"' },
    { size: 'XL', chestOrBust: '44"', shoulder: '19.5"', sleeve: '25.5"', length: '30.5"', waist: '40"' },
    { size: 'XXL', chestOrBust: '46"', shoulder: '20.5"', sleeve: '26.0"', length: '31"', waist: '42"' },
    { size: 'XXXL', chestOrBust: '48"', shoulder: '21.5"', sleeve: '26.5"', length: '31.5"', waist: '44"' }
  ]
};

export interface GarmentField {
  key: string;
  label: string;
  placeholder: string;
  min: number;
  max: number;
}

export interface GarmentSection {
  id: string;
  sectionCode: string;
  title: string;
  subtitle: string;
  iconType: 'SHIRT' | 'TOP' | 'PANT' | 'COAT';
  sizeOptions: readonly string[];
  guideType: string;
  fields: GarmentField[];
}

export interface StudentLayoutResult {
  layoutKey: 'BE_MALE' | 'BE_FEMALE' | 'PG_MALE' | 'PG_FEMALE';
  normalizedCourse: 'B.E.' | 'MBA' | 'MCA';
  normalizedGender: 'Male' | 'Female';
  displayTitle: string;
  garments: GarmentSection[];
}

/**
 * Normalizes student Course ('B.E.' | 'MBA' | 'MCA') and Gender ('MALE' | 'FEMALE')
 */
export function resolveStudentLayoutKey(rawCourse = 'B.E.', rawGender = 'Male') {
  const courseClean = String(rawCourse || 'B.E.').toUpperCase().replace(/[^A-Z]/g, '');
  const isPg = courseClean === 'MBA' || courseClean === 'MCA';
  const normalizedCourse: 'B.E.' | 'MBA' | 'MCA' = courseClean === 'MBA' ? 'MBA' : courseClean === 'MCA' ? 'MCA' : 'B.E.';

  const genderClean = String(rawGender || 'Male').toUpperCase().trim();
  const isFemale =
    genderClean === 'FEMALE' ||
    genderClean === 'F' ||
    genderClean === 'GIRL' ||
    genderClean === 'GIRLS';

  const normalizedGender: 'Male' | 'Female' = isFemale ? 'Female' : 'Male';
  const layoutKey: 'BE_MALE' | 'BE_FEMALE' | 'PG_MALE' | 'PG_FEMALE' = `${isPg ? 'PG' : 'BE'}_${isFemale ? 'FEMALE' : 'MALE'}`;

  return {
    layoutKey,
    normalizedCourse,
    normalizedGender,
    displayTitle: `${normalizedCourse} – ${normalizedGender} Uniform Specification`
  };
}

/**
 * Returns the exact Garment Cards required for the student's (Course + Gender)
 */
export function getGarmentSectionsForStudent(rawCourse?: string, rawGender?: string): StudentLayoutResult {
  const { layoutKey, normalizedCourse, normalizedGender, displayTitle } =
    resolveStudentLayoutKey(rawCourse, rawGender);

  // 1. B.E. MALE: Shirt + Pant / Trouser
  if (layoutKey === 'BE_MALE') {
    return {
      layoutKey,
      normalizedCourse,
      normalizedGender,
      displayTitle,
      garments: [
        {
          id: 'shirt',
          sectionCode: 'A',
          title: 'Shirt',
          subtitle: 'Select standard collar/chest size and enter individual tailor measurements',
          iconType: 'SHIRT',
          sizeOptions: ALPHA_SIZES,
          guideType: 'ALPHA_MALE_SHIRT',
          fields: [
            { key: 'chest', label: 'Chest', placeholder: 'e.g. 40', min: 26, max: 64 },
            { key: 'shoulder', label: 'Shoulder', placeholder: 'e.g. 17.5', min: 12, max: 28 },
            { key: 'sleeveLength', label: 'Sleeve Length', placeholder: 'e.g. 24.5', min: 14, max: 34 },
            { key: 'collar', label: 'Collar', placeholder: 'e.g. 15.5', min: 12, max: 24 },
            { key: 'shirtLength', label: 'Shirt Length', placeholder: 'e.g. 29', min: 20, max: 42 }
          ]
        },
        {
          id: 'pant',
          sectionCode: 'B',
          title: 'Pant / Trouser',
          subtitle: 'Select waist size in inches and enter individual trouser measurements',
          iconType: 'PANT',
          sizeOptions: WAIST_SIZES,
          guideType: 'WAIST_BOTTOM',
          fields: [
            { key: 'waist', label: 'Waist', placeholder: 'e.g. 32', min: 22, max: 56 },
            { key: 'hip', label: 'Hip', placeholder: 'e.g. 39', min: 26, max: 64 },
            { key: 'pantLength', label: 'Pant Length', placeholder: 'e.g. 40.5', min: 28, max: 50 },
            { key: 'inseam', label: 'Inseam', placeholder: 'e.g. 30.5', min: 20, max: 42 }
          ]
        }
      ]
    };
  }

  // 2. B.E. FEMALE: Top + Bottom
  if (layoutKey === 'BE_FEMALE') {
    return {
      layoutKey,
      normalizedCourse,
      normalizedGender,
      displayTitle,
      garments: [
        {
          id: 'top',
          sectionCode: 'A',
          title: 'Top',
          subtitle: 'Select standard top size and enter individual tailor measurements',
          iconType: 'TOP',
          sizeOptions: ALPHA_SIZES,
          guideType: 'ALPHA_FEMALE_TOP',
          fields: [
            { key: 'bust', label: 'Bust', placeholder: 'e.g. 36', min: 24, max: 60 },
            { key: 'shoulder', label: 'Shoulder', placeholder: 'e.g. 14.5', min: 11, max: 24 },
            { key: 'sleeveLength', label: 'Sleeve Length', placeholder: 'e.g. 17', min: 8, max: 30 },
            { key: 'topLength', label: 'Top Length', placeholder: 'e.g. 38', min: 22, max: 48 }
          ]
        },
        {
          id: 'bottom',
          sectionCode: 'B',
          title: 'Bottom',
          subtitle: 'Select waist size in inches and enter individual bottom measurements',
          iconType: 'PANT',
          sizeOptions: WAIST_SIZES,
          guideType: 'WAIST_BOTTOM',
          fields: [
            { key: 'waist', label: 'Waist', placeholder: 'e.g. 30', min: 22, max: 56 },
            { key: 'hip', label: 'Hip', placeholder: 'e.g. 37', min: 26, max: 64 },
            { key: 'bottomLength', label: 'Bottom Length', placeholder: 'e.g. 39', min: 28, max: 50 },
            { key: 'inseam', label: 'Inseam', placeholder: 'e.g. 29', min: 20, max: 40 }
          ]
        }
      ]
    };
  }

  // 3. MBA / MCA MALE: Shirt + Pant + Coat / Blazer
  if (layoutKey === 'PG_MALE') {
    return {
      layoutKey,
      normalizedCourse,
      normalizedGender,
      displayTitle,
      garments: [
        {
          id: 'shirt',
          sectionCode: 'A',
          title: 'Shirt',
          subtitle: 'Executive PG Shirt – Select standard size and enter tailor measurements',
          iconType: 'SHIRT',
          sizeOptions: ALPHA_SIZES,
          guideType: 'ALPHA_MALE_SHIRT',
          fields: [
            { key: 'chest', label: 'Chest', placeholder: 'e.g. 40', min: 26, max: 64 },
            { key: 'shoulder', label: 'Shoulder', placeholder: 'e.g. 17.5', min: 12, max: 28 },
            { key: 'sleeveLength', label: 'Sleeve Length', placeholder: 'e.g. 24.5', min: 14, max: 34 },
            { key: 'collar', label: 'Collar', placeholder: 'e.g. 15.5', min: 12, max: 24 },
            { key: 'shirtLength', label: 'Shirt Length', placeholder: 'e.g. 29', min: 20, max: 42 }
          ]
        },
        {
          id: 'pant',
          sectionCode: 'B',
          title: 'Pant',
          subtitle: 'Executive PG Trouser – Select waist size and enter tailor measurements',
          iconType: 'PANT',
          sizeOptions: WAIST_SIZES,
          guideType: 'WAIST_BOTTOM',
          fields: [
            { key: 'waist', label: 'Waist', placeholder: 'e.g. 32', min: 22, max: 56 },
            { key: 'hip', label: 'Hip', placeholder: 'e.g. 39', min: 26, max: 64 },
            { key: 'pantLength', label: 'Pant Length', placeholder: 'e.g. 40.5', min: 28, max: 50 },
            { key: 'inseam', label: 'Inseam', placeholder: 'e.g. 30.5', min: 20, max: 42 }
          ]
        },
        {
          id: 'coat',
          sectionCode: 'C',
          title: 'Coat / Blazer',
          subtitle: 'Official MIT PG Blazer – Select size and enter tailor measurements',
          iconType: 'COAT',
          sizeOptions: ALPHA_SIZES,
          guideType: 'ALPHA_COAT',
          fields: [
            { key: 'chest', label: 'Chest', placeholder: 'e.g. 42', min: 26, max: 66 },
            { key: 'shoulder', label: 'Shoulder', placeholder: 'e.g. 18.5', min: 12, max: 28 },
            { key: 'sleeveLength', label: 'Sleeve Length', placeholder: 'e.g. 25', min: 14, max: 34 },
            { key: 'coatLength', label: 'Coat Length', placeholder: 'e.g. 29.5', min: 20, max: 42 },
            { key: 'waist', label: 'Waist', placeholder: 'e.g. 36', min: 22, max: 58 }
          ]
        }
      ]
    };
  }

  // 4. MBA / MCA FEMALE: Shirt / Top + Pant + Coat / Blazer
  return {
    layoutKey: 'PG_FEMALE',
    normalizedCourse,
    normalizedGender,
    displayTitle,
    garments: [
      {
        id: 'top',
        sectionCode: 'A',
        title: 'Shirt / Top',
        subtitle: 'Executive PG Top – Select standard size and enter tailor measurements',
        iconType: 'TOP',
        sizeOptions: ALPHA_SIZES,
        guideType: 'ALPHA_FEMALE_TOP',
        fields: [
          { key: 'bust', label: 'Bust', placeholder: 'e.g. 36', min: 24, max: 60 },
          { key: 'shoulder', label: 'Shoulder', placeholder: 'e.g. 14.5', min: 11, max: 24 },
          { key: 'sleeveLength', label: 'Sleeve Length', placeholder: 'e.g. 22', min: 8, max: 30 },
          { key: 'topLength', label: 'Top Length', placeholder: 'e.g. 27', min: 20, max: 46 }
        ]
      },
      {
        id: 'pant',
        sectionCode: 'B',
        title: 'Pant',
        subtitle: 'Executive PG Trouser – Select waist size and enter tailor measurements',
        iconType: 'PANT',
        sizeOptions: WAIST_SIZES,
        guideType: 'WAIST_BOTTOM',
        fields: [
          { key: 'waist', label: 'Waist', placeholder: 'e.g. 30', min: 22, max: 56 },
          { key: 'hip', label: 'Hip', placeholder: 'e.g. 37', min: 26, max: 64 },
          { key: 'pantLength', label: 'Pant Length', placeholder: 'e.g. 39', min: 28, max: 50 },
          { key: 'inseam', label: 'Inseam', placeholder: 'e.g. 29', min: 20, max: 40 }
        ]
      },
      {
        id: 'coat',
        sectionCode: 'C',
        title: 'Coat / Blazer',
        subtitle: 'Official MIT PG Blazer – Select size and enter tailor measurements',
        iconType: 'COAT',
        sizeOptions: ALPHA_SIZES,
        guideType: 'ALPHA_COAT',
        fields: [
          { key: 'bust', label: 'Bust', placeholder: 'e.g. 38', min: 24, max: 62 },
          { key: 'shoulder', label: 'Shoulder', placeholder: 'e.g. 15', min: 11, max: 26 },
          { key: 'sleeveLength', label: 'Sleeve Length', placeholder: 'e.g. 23', min: 14, max: 32 },
          { key: 'coatLength', label: 'Coat Length', placeholder: 'e.g. 27', min: 20, max: 40 },
          { key: 'waist', label: 'Waist', placeholder: 'e.g. 32', min: 22, max: 56 }
        ]
      }
    ]
  };
}

