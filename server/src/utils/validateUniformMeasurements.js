/**
 * Server-Side Uniform Tailor Measurement Validator
 * Validates that every required garment and measurement for the student's (course, gender)
 * is positive, numeric, and present before saving to the database.
 */

export function validateTailorMeasurementsOnBackend({ course = 'B.E.', gender = 'Male', uniformMeasurements }) {
  if (!uniformMeasurements || typeof uniformMeasurements.garments !== 'object') {
    return {
      isValid: false,
      message: 'Uniform size and tailor measurements are required.'
    };
  }

  const courseClean = String(course || 'B.E.').toUpperCase().replace(/[^A-Z]/g, '');
  const isPg = courseClean === 'MBA' || courseClean === 'MCA';
  const genderClean = String(gender || 'Male').toUpperCase().trim();
  const isFemale = ['FEMALE', 'F', 'GIRL', 'GIRLS'].includes(genderClean);

  const requiredGarments = isPg
    ? isFemale
      ? [
          { id: 'top', name: 'Shirt / Top', fields: ['bust', 'shoulder', 'sleeveLength', 'topLength'] },
          { id: 'pant', name: 'Pant', fields: ['waist', 'hip', 'pantLength', 'inseam'] },
          { id: 'coat', name: 'Coat / Blazer', fields: ['bust', 'shoulder', 'sleeveLength', 'coatLength', 'waist'] }
        ]
      : [
          { id: 'shirt', name: 'Shirt', fields: ['chest', 'shoulder', 'sleeveLength', 'collar', 'shirtLength'] },
          { id: 'pant', name: 'Pant', fields: ['waist', 'hip', 'pantLength', 'inseam'] },
          { id: 'coat', name: 'Coat / Blazer', fields: ['chest', 'shoulder', 'sleeveLength', 'coatLength', 'waist'] }
        ]
    : isFemale
    ? [
        { id: 'top', name: 'Top', fields: ['bust', 'shoulder', 'sleeveLength', 'topLength'] },
        { id: 'bottom', name: 'Bottom', fields: ['waist', 'hip', 'bottomLength', 'inseam'] }
      ]
    : [
        { id: 'shirt', name: 'Shirt', fields: ['chest', 'shoulder', 'sleeveLength', 'collar', 'shirtLength'] },
        { id: 'pant', name: 'Pant / Trouser', fields: ['waist', 'hip', 'pantLength', 'inseam'] }
      ];

  const sanitizedGarments = {};

  for (const reqGarment of requiredGarments) {
    const submitted = uniformMeasurements.garments[reqGarment.id];
    if (!submitted || !submitted.selectedSize) {
      return {
        isValid: false,
        message: `Standard size is missing for ${reqGarment.name}.`
      };
    }

    const cleanMeasurements = {};
    for (const fieldKey of reqGarment.fields) {
      const val = Number(submitted.measurements?.[fieldKey]);
      if (isNaN(val) || val <= 0) {
        return {
          isValid: false,
          message: `Invalid or non-positive tailor measurement for ${reqGarment.name} (${fieldKey}). All measurements must be positive numbers in inches.`
        };
      }
      cleanMeasurements[fieldKey] = val;
    }

    sanitizedGarments[reqGarment.id] = {
      garmentId: reqGarment.id,
      garmentTitle: reqGarment.name,
      selectedSize: String(submitted.selectedSize).trim(),
      unit: 'inches',
      measurements: cleanMeasurements
    };
  }

  return {
    isValid: true,
    layoutKey: `${isPg ? 'PG' : 'BE'}_${isFemale ? 'FEMALE' : 'MALE'}`,
    sanitizedGarments
  };
}

export default validateTailorMeasurementsOnBackend;

