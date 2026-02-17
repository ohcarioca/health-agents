export interface ClinicTypeOption {
  value: string;
  label: string;
  description: string;
}

export interface ServiceTemplate {
  name: string;
  duration_minutes: number;
}

export const CLINIC_TYPES: ClinicTypeOption[] = [
  { value: "medical", label: "Clínica Médica", description: "Clínica especializada em consultas médicas, diagnósticos e acompanhamento de saúde." },
  { value: "dental", label: "Clínica Odontológica", description: "Clínica especializada em saúde bucal, tratamentos dentários e estéticos." },
  { value: "aesthetics", label: "Clínica de Estética", description: "Clínica especializada em procedimentos estéticos e cuidados com a pele." },
  { value: "veterinary", label: "Clínica Veterinária", description: "Clínica especializada em saúde e bem-estar animal." },
  { value: "psychology", label: "Consultório de Psicologia", description: "Consultório especializado em saúde mental, terapia e acompanhamento psicológico." },
  { value: "physiotherapy", label: "Clínica de Fisioterapia", description: "Clínica especializada em reabilitação física e tratamentos fisioterapêuticos." },
  { value: "nutrition", label: "Consultório de Nutrição", description: "Consultório especializado em orientação nutricional e reeducação alimentar." },
  { value: "other", label: "Outro", description: "" },
];

export const SERVICE_TEMPLATES: Record<string, ServiceTemplate[]> = {
  medical: [
    { name: "Consulta", duration_minutes: 30 },
    { name: "Retorno", duration_minutes: 15 },
    { name: "Check-up", duration_minutes: 60 },
    { name: "Exame clínico", duration_minutes: 30 },
  ],
  dental: [
    { name: "Limpeza", duration_minutes: 30 },
    { name: "Restauração", duration_minutes: 45 },
    { name: "Extração", duration_minutes: 60 },
    { name: "Canal", duration_minutes: 90 },
    { name: "Clareamento", duration_minutes: 60 },
    { name: "Avaliação", duration_minutes: 30 },
  ],
  aesthetics: [
    { name: "Limpeza de pele", duration_minutes: 60 },
    { name: "Botox", duration_minutes: 30 },
    { name: "Preenchimento", duration_minutes: 45 },
    { name: "Peeling", duration_minutes: 45 },
    { name: "Drenagem linfática", duration_minutes: 60 },
  ],
  veterinary: [
    { name: "Consulta", duration_minutes: 30 },
    { name: "Vacinação", duration_minutes: 15 },
    { name: "Exame clínico", duration_minutes: 30 },
    { name: "Cirurgia", duration_minutes: 120 },
    { name: "Banho e tosa", duration_minutes: 60 },
  ],
  psychology: [
    { name: "Sessão de terapia", duration_minutes: 50 },
    { name: "Avaliação psicológica", duration_minutes: 60 },
    { name: "Sessão de casal", duration_minutes: 60 },
    { name: "Sessão infantil", duration_minutes: 45 },
  ],
  physiotherapy: [
    { name: "Sessão de fisioterapia", duration_minutes: 50 },
    { name: "Avaliação funcional", duration_minutes: 60 },
    { name: "RPG", duration_minutes: 50 },
    { name: "Pilates", duration_minutes: 50 },
  ],
  nutrition: [
    { name: "Consulta nutricional", duration_minutes: 45 },
    { name: "Retorno", duration_minutes: 30 },
    { name: "Avaliação corporal", duration_minutes: 30 },
    { name: "Bioimpedância", duration_minutes: 15 },
  ],
  other: [],
};
