/**
 * Maps clinic type (lowercase) to suggested professional specialties.
 * Users can always type a custom specialty — these are just suggestions.
 */
const SPECIALTY_MAP: Record<string, string[]> = {
  // Odontologia / Dentistry
  odontologia: [
    "Clínico Geral",
    "Ortodontia",
    "Endodontia",
    "Periodontia",
    "Implantodontia",
    "Prótese Dentária",
    "Cirurgia Bucomaxilofacial",
    "Odontopediatria",
    "Estética Dental",
    "Radiologia Odontológica",
    "Harmonização Orofacial",
  ],
  dentistry: [
    "General Dentist",
    "Orthodontics",
    "Endodontics",
    "Periodontics",
    "Implantology",
    "Prosthodontics",
    "Oral Surgery",
    "Pediatric Dentistry",
    "Cosmetic Dentistry",
  ],

  // Dermatologia
  dermatologia: [
    "Dermatologia Clínica",
    "Dermatologia Estética",
    "Tricologia",
    "Cosmiatria",
    "Cirurgia Dermatológica",
  ],
  dermatology: [
    "Clinical Dermatology",
    "Cosmetic Dermatology",
    "Trichology",
    "Dermatologic Surgery",
  ],

  // Clínica Médica / General Practice
  "clínica médica": [
    "Clínico Geral",
    "Cardiologia",
    "Endocrinologia",
    "Gastroenterologia",
    "Neurologia",
    "Pneumologia",
    "Reumatologia",
    "Geriatria",
    "Medicina do Trabalho",
  ],
  "clinica medica": [
    "Clínico Geral",
    "Cardiologia",
    "Endocrinologia",
    "Gastroenterologia",
    "Neurologia",
    "Pneumologia",
    "Reumatologia",
    "Geriatria",
    "Medicina do Trabalho",
  ],

  // Psicologia
  psicologia: [
    "Psicologia Clínica",
    "Terapia Cognitivo-Comportamental",
    "Psicanálise",
    "Neuropsicologia",
    "Psicologia Infantil",
    "Terapia de Casal e Família",
  ],
  psychology: [
    "Clinical Psychology",
    "Cognitive-Behavioral Therapy",
    "Psychoanalysis",
    "Neuropsychology",
    "Child Psychology",
    "Family Therapy",
  ],

  // Fisioterapia
  fisioterapia: [
    "Fisioterapia Ortopédica",
    "Fisioterapia Neurológica",
    "RPG",
    "Pilates Clínico",
    "Fisioterapia Respiratória",
    "Fisioterapia Esportiva",
    "Fisioterapia Pélvica",
  ],
  physiotherapy: [
    "Orthopedic Physiotherapy",
    "Neurological Physiotherapy",
    "RPG",
    "Clinical Pilates",
    "Respiratory Physiotherapy",
    "Sports Physiotherapy",
  ],

  // Oftalmologia
  oftalmologia: [
    "Catarata",
    "Glaucoma",
    "Retina e Vítreo",
    "Refração",
    "Cirurgia Refrativa",
    "Oftalmopediatria",
    "Plástica Ocular",
  ],
  ophthalmology: [
    "Cataract",
    "Glaucoma",
    "Retina",
    "Refraction",
    "Refractive Surgery",
    "Pediatric Ophthalmology",
  ],

  // Ginecologia e Obstetrícia
  ginecologia: [
    "Ginecologia",
    "Obstetrícia",
    "Reprodução Humana",
    "Mastologia",
    "Uroginecologia",
  ],
  "ginecologia e obstetrícia": [
    "Ginecologia",
    "Obstetrícia",
    "Reprodução Humana",
    "Mastologia",
    "Uroginecologia",
  ],

  // Nutrição
  nutrição: [
    "Nutrição Clínica",
    "Nutrição Esportiva",
    "Nutrição Funcional",
    "Nutrição Materno-Infantil",
    "Nutrição Comportamental",
  ],
  nutricao: [
    "Nutrição Clínica",
    "Nutrição Esportiva",
    "Nutrição Funcional",
    "Nutrição Materno-Infantil",
    "Nutrição Comportamental",
  ],
  nutrition: [
    "Clinical Nutrition",
    "Sports Nutrition",
    "Functional Nutrition",
    "Behavioral Nutrition",
  ],

  // Estética
  estética: [
    "Estética Facial",
    "Estética Corporal",
    "Harmonização Facial",
    "Laser e Tecnologias",
    "Massoterapia",
  ],
  estetica: [
    "Estética Facial",
    "Estética Corporal",
    "Harmonização Facial",
    "Laser e Tecnologias",
    "Massoterapia",
  ],

  // Ortopedia
  ortopedia: [
    "Ortopedia Geral",
    "Cirurgia do Joelho",
    "Cirurgia do Ombro",
    "Cirurgia da Coluna",
    "Cirurgia da Mão",
    "Ortopedia Pediátrica",
    "Traumatologia",
    "Medicina Esportiva",
  ],

  // Pediatria
  pediatria: [
    "Pediatria Geral",
    "Neonatologia",
    "Alergia e Imunologia Pediátrica",
    "Gastroenterologia Pediátrica",
    "Cardiologia Pediátrica",
    "Neurologia Pediátrica",
  ],

  // Psiquiatria
  psiquiatria: [
    "Psiquiatria Geral",
    "Psiquiatria Infantil",
    "Psicogeriatria",
    "Dependência Química",
    "Psiquiatria Forense",
  ],

  // Fonoaudiologia
  fonoaudiologia: [
    "Audiologia",
    "Linguagem",
    "Motricidade Orofacial",
    "Voz",
    "Disfagia",
    "Fonoaudiologia Escolar",
  ],
};

/** Generic fallback when clinic type is unrecognized */
const GENERIC_SPECIALTIES = [
  "Clínico Geral",
  "Especialista",
];

/**
 * Returns suggested specialties for a clinic type.
 * Matches by lowercase, trimmed key. Falls back to generic list.
 */
export function getSpecialtySuggestions(clinicType: string | null | undefined): string[] {
  if (!clinicType) return GENERIC_SPECIALTIES;

  const key = clinicType.toLowerCase().trim();
  return SPECIALTY_MAP[key] ?? GENERIC_SPECIALTIES;
}
